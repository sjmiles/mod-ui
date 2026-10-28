#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
# SPDX-License-Identifier: AGPL-3.0-or-later

# TONE3000: what the device keeps of tones and models, without the network.
# mod/tone3000_client.py talks to TONE3000; this file holds the parts that a
# test can run without Tornado or a network: names, summaries, the files.
#
# The device signs in with the OAuth device flow (RFC 8628): the panel shows a
# short code, you enter it at tone3000.com/activate on any device, and the
# device polls until the sign-in is approved.
#
# To reach the whole catalog, the panel also opens TONE3000's own picker (the
# "Select" flow: OAuth with PKCE and prompt=select_tone). You search and pick a
# tone there, and TONE3000 sends the browser back to the device with the tone
# and a code that also signs the device in. TONE3000 accepts a plain-http
# redirect URI on the local network as long as the client registers none.
#
# The tokens stay on the device. The browser never sees them: every call to
# TONE3000 goes through the handlers in webserver.py.

import base64
import hashlib
import json
import os
import re
import secrets
import time

from urllib.parse import urlencode, urlparse

from mod.nam import nam_models_dir, SIDECAR_NAME

DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

# Downloads go below this folder of "NAM Models", one folder per tone.
DOWNLOADS_DIRNAME = "TONE3000"

# The lists that the free API tier allows. The full search needs a commercial
# agreement with TONE3000, so the panel links to tone3000.com for it instead.
PAGED_LISTS = ("favorited", "downloaded", "created")
SHORT_LISTS = ("trending", "latest")

GEARS = ("amp", "amp-cab", "pedal", "outboard", "cab", "space", "experimental")

# The path on the device that TONE3000's picker sends the browser back to.
SELECT_CALLBACK_PATH = "/tone3000/select/done"

# How long a pick may take, and how many unfinished picks the device keeps.
SELECT_TIMEOUT = 30 * 60
SELECT_MAX_PENDING = 8

# A token that runs out within this many seconds is refreshed first.
REFRESH_MARGIN = 60

# The API answers 100 requests per minute by default; a slow answer must not
# hold a handler forever.
REQUEST_TIMEOUT = 30
DOWNLOAD_TIMEOUT = 120

MAX_NAME_LENGTH = 80

# The picture of a tone, saved next to its models so the pedal face of the NAM
# plugin can show it without the network.
COVER_BASENAME = "cover"
COVER_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_COVER_BYTES = 4 * 1024 * 1024


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


def pkce_pair():
    # RFC 7636: a random verifier and its S256 challenge.
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def select_url(api_url, client_id, redirect_uri, state, challenge, gear=None):
    # The address of TONE3000's picker, limited to NAM tones.
    params = [
        ('client_id', client_id),
        ('redirect_uri', redirect_uri),
        ('response_type', "code"),
        ('code_challenge', challenge),
        ('code_challenge_method', "S256"),
        ('state', state),
        ('prompt', "select_tone"),
        ('format', "nam"),
        ('menubar', "true"),
    ]
    if gear in GEARS:
        params.append(('gears', gear))
    return api_url.rstrip("/") + "/oauth/authorize?" + urlencode(params)


def select_page(result):
    # The page the picker window shows once TONE3000 sent it back. It tells
    # the panel (same origin, other window) what was picked and closes itself.
    if result.get('tone_id'):
        text = "Got it. Back to the pedal…"
    elif result.get('error'):
        text = result['error']
    else:
        text = "Nothing picked."
    payload = json.dumps(dict(result, type="tone3000-select")).replace("</", "<\\/")
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>TONE3000</title>"
        "<meta name=\"viewport\" content=\"width=device-width\"></head>"
        "<body style=\"background:#0a0a0a;color:#f2f2f2;font:15px sans-serif;padding:40px\">"
        "<p>" + text + "</p><p style=\"color:#a6a6a6\">You can close this window.</p>"
        "<script>(function(){var m=" + payload + ";"
        "try{new BroadcastChannel('tone3000').postMessage(m)}catch(e){}"
        + ("" if result.get('error') else "setTimeout(function(){window.close()},600);") +
        "})()</script>"
        "</body></html>"
    )


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


def cover_extension(content_type, body):
    # The file extension for a downloaded picture, or None if it is not one.
    if not body or len(body) > MAX_COVER_BYTES:
        return None
    return COVER_TYPES.get((content_type or "").split(";")[0].strip().lower())


def sidecar_for(tone, files, image=None):
    return {
        'source': "tone3000",
        'tone_id': tone['id'],
        'title': tone['title'],
        'url': tone['url'],
        'gear': tone['gear'],
        'image_url': tone['image_url'],
        'creator': tone['creator'],
        'models': files,
        'image': image,
        'downloaded_at': int(time.time()),
    }


def is_cover_name(name):
    return isinstance(name, str) and name in [COVER_BASENAME + ext for ext in COVER_TYPES.values()]


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
        image = previous.get("image")
        self.image = image if is_cover_name(image) and os.path.isfile(os.path.join(self.path, image)) else None

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

    def set_image(self, body, extension):
        os.makedirs(self.path, exist_ok=True)
        name = COVER_BASENAME + extension
        path = os.path.join(self.path, name)
        with open(path + ".part", 'wb') as fh:
            fh.write(body)
        os.replace(path + ".part", path)
        if self.image and self.image != name:
            try:
                os.remove(os.path.join(self.path, self.image))
            except OSError:
                pass
        self.image = name

    def save(self):
        os.makedirs(self.path, exist_ok=True)
        write_json(os.path.join(self.path, SIDECAR_NAME), sidecar_for(self.tone, self.files, self.image))
