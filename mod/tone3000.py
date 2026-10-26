#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
# SPDX-License-Identifier: AGPL-3.0-or-later

# TONE3000: what the device keeps of tones and models, without the network.
# mod/tone3000_client.py talks to TONE3000; this file holds the parts that a
# test can run without Tornado or a network: names, summaries, the files.
#
# The device signs in with the OAuth device flow (RFC 8628): the panel shows a
# short code, you enter it at tone3000.com/activate on any device, and the
# device polls until the sign-in is approved. The redirect flows need an HTTPS
# redirect URI, which a device on the local network does not have.
#
# The tokens stay on the device. The browser never sees them: every call to
# TONE3000 goes through the handlers in webserver.py.

import json
import os
import re
import time

from urllib.parse import urlparse

from mod.nam import nam_models_dir, SIDECAR_NAME

DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

# Downloads go below this folder of "NAM Models", one folder per tone.
DOWNLOADS_DIRNAME = "TONE3000"

# The lists that the free API tier allows. The full search needs a commercial
# agreement with TONE3000, so the panel links to tone3000.com for it instead.
PAGED_LISTS = ("favorited", "downloaded", "created")
SHORT_LISTS = ("trending", "latest")

GEARS = ("amp", "amp-cab", "pedal", "outboard", "cab", "space", "experimental")

# A token that runs out within this many seconds is refreshed first.
REFRESH_MARGIN = 60

# The API answers 100 requests per minute by default; a slow answer must not
# hold a handler forever.
REQUEST_TIMEOUT = 30
DOWNLOAD_TIMEOUT = 120

MAX_NAME_LENGTH = 80


class Tone3000Error(Exception):
    def __init__(self, message, status=None):
        Exception.__init__(self, message)
        self.status = status


# ---- pure helpers ---------------------------------------------------------

def sanitize_name(name, fallback="untitled"):
    # A name that becomes one path component on the device.
    name = re.sub(r'[\x00-\x1f/\\:*?"<>|]+', ' ', str(name or ''))
    name = re.sub(r'\s+', ' ', name).strip(' .')
    if len(name) > MAX_NAME_LENGTH:
        name = name[:MAX_NAME_LENGTH].rstrip(' .')
    return name or fallback


def first_image(images):
    # The API gives a list of URLs; tolerate objects with a url too.
    if isinstance(images, str):
        images = [images]
    if not isinstance(images, list):
        return None
    for image in images:
        if isinstance(image, str) and image.startswith("http"):
            return image
        if isinstance(image, dict):
            url = image.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
    return None


def _str_or_none(value):
    return value if isinstance(value, str) and value else None


def _int_or_zero(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def tone_summary(tone):
    # What the panel needs to draw a tone card, and nothing more.
    user = tone.get("user") if isinstance(tone.get("user"), dict) else {}
    return {
        'id': tone.get("id"),
        'title': _str_or_none(tone.get("title")) or "Untitled",
        'url': _str_or_none(tone.get("url")),
        'gear': _str_or_none(tone.get("gear")),
        'format': _str_or_none(tone.get("format")),
        'image_url': first_image(tone.get("images")),
        'sizes': [s for s in (tone.get("sizes") or []) if isinstance(s, str)],
        'models_count': _int_or_zero(tone.get("models_count")),
        'a1_models_count': _int_or_zero(tone.get("a1_models_count")),
        'a2_models_count': _int_or_zero(tone.get("a2_models_count")),
        'is_favorite': bool(tone.get("is_favorite")),
        'creator': {
            'username': _str_or_none(user.get("username")),
            'display_name': _str_or_none(user.get("display_name")) or _str_or_none(user.get("username")),
            'avatar_url': _str_or_none(user.get("avatar_url")),
            'url': _str_or_none(user.get("url")),
        },
    }


def model_summary(model):
    arch = model.get("architecture_version")
    return {
        'id': model.get("id"),
        'name': _str_or_none(model.get("name")) or "model",
        'size': _str_or_none(model.get("size")),
        'architecture': str(arch) if arch is not None else None,
    }


def token_record(resp, now):
    if not isinstance(resp, dict) or not resp.get("access_token"):
        raise Tone3000Error("TONE3000 did not send an access token")
    expires_in = resp.get("expires_in")
    if not isinstance(expires_in, (int, float)) or isinstance(expires_in, bool):
        expires_in = 3600
    return {
        'access_token': resp["access_token"],
        'refresh_token': resp.get("refresh_token"),
        'expires_at': now + expires_in,
    }


def may_send_token(url):
    # The access token goes to TONE3000 itself only, never to another host.
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (host == "tone3000.com" or host.endswith(".tone3000.com"))


def downloads_dir():
    return os.path.join(nam_models_dir(), DOWNLOADS_DIRNAME)


def tone_folder(basedir, tone):
    # One folder for each tone, named after its title. A folder of the same
    # name that holds another tone gets the id added.
    name = sanitize_name(tone['title'])
    path = os.path.join(basedir, name)
    sidecar = read_json(os.path.join(path, SIDECAR_NAME))
    if os.path.exists(path) and (sidecar is None or sidecar.get("tone_id") != tone['id']):
        path = os.path.join(basedir, "%s (%s)" % (name, tone['id']))
    return path


def model_filename(model, taken):
    # A file name for the model that no other model of the tone uses.
    base = sanitize_name(model['name'], "model")
    if model.get('size'):
        suffix = model['size'] if model.get('architecture') != "2" else "A2 " + model['size']
        if suffix.lower() not in base.lower():
            base = "%s (%s)" % (base, suffix)
    name = base + ".nam"
    count = 2
    while name.lower() in taken:
        name = "%s %d.nam" % (base, count)
        count += 1
    taken.add(name.lower())
    return name


def sidecar_for(tone, files):
    return {
        'source': "tone3000",
        'tone_id': tone['id'],
        'title': tone['title'],
        'url': tone['url'],
        'gear': tone['gear'],
        'image_url': tone['image_url'],
        'creator': tone['creator'],
        'models': files,
        'downloaded_at': int(time.time()),
    }


def read_json(path):
    try:
        with open(path, 'r') as fh:
            data = json.load(fh)
    except (OSError, ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def write_json(path, data, private=False):
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o644)
    with os.fdopen(fd, 'w') as fh:
        json.dump(data, fh, indent=2)
    os.replace(tmp, path)


def is_nam_model(body):
    # A .nam file is JSON. Anything else (an HTML error page) is not written.
    try:
        return isinstance(json.loads(body.decode("utf-8")), dict)
    except (ValueError, UnicodeDecodeError):
        return False


class ToneFolder(object):
    # The folder of one downloaded tone, and the models it already holds.

    def __init__(self, tone, basedir=None):
        self.tone = tone
        self.path = tone_folder(basedir or downloads_dir(), tone)
        previous = read_json(os.path.join(self.path, SIDECAR_NAME)) or {}
        self.files = dict((str(k), v) for k, v in (previous.get("models") or {}).items()
                          if isinstance(v, dict) and v.get("file"))

    def existing(self, model_id):
        # The path of a model that an earlier download already wrote, or None.
        entry = self.files.get(str(model_id))
        if entry is None:
            return None
        path = os.path.join(self.path, entry['file'])
        return path if os.path.exists(path) else None

    def add(self, summary, body):
        os.makedirs(self.path, exist_ok=True)
        taken = set(name.lower() for name in os.listdir(self.path))
        name = model_filename(summary, taken)
        path = os.path.join(self.path, name)
        with open(path + ".part", 'wb') as fh:
            fh.write(body)
        os.replace(path + ".part", path)
        entry = dict(summary)
        entry['file'] = name
        self.files[str(summary['id'])] = entry
        return path

    def save(self):
        os.makedirs(self.path, exist_ok=True)
        write_json(os.path.join(self.path, SIDECAR_NAME), sidecar_for(self.tone, self.files))
