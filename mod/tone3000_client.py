#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
# SPDX-License-Identifier: AGPL-3.0-or-later

# TONE3000 client: sign-in, tone lists and model downloads, for the NAM models
# of the device.
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
import time

from urllib.parse import urlencode

from tornado import gen
from tornado.httpclient import AsyncHTTPClient, HTTPRequest
from tornado.ioloop import IOLoop

from mod.settings import TONE3000_API_URL, TONE3000_CLIENT_ID, TONE3000_TOKENS_FILE
from mod.tone3000 import (
    DEVICE_CODE_GRANT, GEARS, PAGED_LISTS, SHORT_LISTS, REFRESH_MARGIN, REQUEST_TIMEOUT, DOWNLOAD_TIMEOUT,
    Tone3000Error, ToneFolder, is_nam_model, may_send_token, model_summary, read_json, token_record,
    tone_summary, write_json, _str_or_none,
)


class Tone3000(object):
    def __init__(self, api_url=TONE3000_API_URL, client_id=TONE3000_CLIENT_ID, tokens_file=TONE3000_TOKENS_FILE):
        self.api_url = api_url.rstrip("/")
        self.client_id = client_id
        self.tokens_file = tokens_file
        self.tokens = read_json(tokens_file)
        self.pending = None
        self.last_error = None
        self.user = self.tokens.get("user") if self.tokens else None

    # -- state

    def status(self):
        pending = None
        if self.pending is not None:
            pending = {
                'user_code': self.pending['user_code'],
                'verification_uri': self.pending['verification_uri'],
                'verification_uri_complete': self.pending.get('verification_uri_complete'),
                'expires_in': max(0, int(self.pending['expires_at'] - time.time())),
            }
        return {
            'enabled': bool(self.client_id),
            # A sign-in that has its tokens but not yet the name of the account
            # still counts as pending, so the panel never draws a nameless account.
            'connected': self.tokens is not None and self.pending is None,
            'user': self.user,
            'pending': pending,
            'error': self.last_error,
        }

    def _save_tokens(self, tokens):
        self.tokens = tokens
        if self.user:
            tokens['user'] = self.user
        write_json(self.tokens_file, tokens, private=True)

    def disconnect(self):
        self.tokens = None
        self.user = None
        self.pending = None
        self.last_error = None
        try:
            os.remove(self.tokens_file)
        except OSError:
            pass

    # -- HTTP

    @gen.coroutine
    def _fetch_json(self, url, method="GET", body=None, token=None):
        headers = {'Accept': "application/json"}
        if body is not None:
            headers['Content-Type'] = "application/x-www-form-urlencoded"
            body = urlencode(body)
        if token is not None:
            headers['Authorization'] = "Bearer " + token
        request = HTTPRequest(url, method=method, headers=headers, body=body,
                              request_timeout=REQUEST_TIMEOUT)
        response = yield AsyncHTTPClient().fetch(request, raise_error=False)
        data = None
        if response.body:
            try:
                data = json.loads(response.body.decode("utf-8"))
            except ValueError:
                data = None
        raise gen.Return((response.code, data))

    @gen.coroutine
    def _access_token(self):
        if self.tokens is None:
            raise Tone3000Error("Not signed in to TONE3000", 401)
        if self.tokens.get('expires_at', 0) - REFRESH_MARGIN > time.time():
            raise gen.Return(self.tokens['access_token'])
        yield self._refresh()
        raise gen.Return(self.tokens['access_token'])

    @gen.coroutine
    def _refresh(self):
        refresh_token = self.tokens.get('refresh_token') if self.tokens else None
        if not refresh_token:
            self.disconnect()
            raise Tone3000Error("The TONE3000 sign-in ran out. Sign in again.", 401)
        code, data = yield self._fetch_json(self.api_url + "/oauth/token", "POST", {
            'grant_type': "refresh_token",
            'refresh_token': refresh_token,
            'client_id': self.client_id,
        })
        if code != 200:
            error = data.get("error") if isinstance(data, dict) else None
            if error == "invalid_grant" or code in (400, 401):
                self.disconnect()
                raise Tone3000Error("The TONE3000 sign-in ran out. Sign in again.", 401)
            raise Tone3000Error("TONE3000 refused to refresh the sign-in (%s)" % code, code)
        self._save_tokens(token_record(data, time.time()))

    @gen.coroutine
    def api_get(self, path, params=None, auth=True):
        url = self.api_url + path
        if params:
            url += "?" + urlencode([(k, v) for k, v in params.items() if v not in (None, "")])
        token = (yield self._access_token()) if auth else None
        code, data = yield self._fetch_json(url, token=token)
        if code == 401 and auth:
            yield self._refresh()
            code, data = yield self._fetch_json(url, token=self.tokens['access_token'])
        if code == 429:
            raise Tone3000Error("TONE3000 asks to slow down. Try again in a minute.", 429)
        if code != 200 or data is None:
            message = data.get("error_description") or data.get("error") if isinstance(data, dict) else None
            raise Tone3000Error(message or "TONE3000 answered %s" % code, code)
        raise gen.Return(data)

    # -- sign-in

    @gen.coroutine
    def start_sign_in(self):
        if not self.client_id:
            raise Tone3000Error("No TONE3000 client id is set on this device")
        code, data = yield self._fetch_json(self.api_url + "/oauth/device_authorization", "POST", {
            'client_id': self.client_id,
        })
        if code != 200 or not isinstance(data, dict) or not data.get("device_code"):
            message = data.get("error_description") or data.get("error") if isinstance(data, dict) else None
            raise Tone3000Error(message or "TONE3000 did not start the sign-in (%s)" % code, code)
        self.last_error = None
        self.pending = {
            'device_code': data["device_code"],
            'user_code': data.get("user_code"),
            'verification_uri': data.get("verification_uri") or "https://www.tone3000.com/activate",
            'verification_uri_complete': data.get("verification_uri_complete"),
            'expires_at': time.time() + (data.get("expires_in") or 600),
            'interval': data.get("interval") or 5,
        }
        self._schedule_poll(self.pending)
        raise gen.Return(self.status())

    def _schedule_poll(self, pending):
        IOLoop.current().call_later(pending['interval'], self._poll, pending)

    @gen.coroutine
    def _poll(self, pending):
        # A newer sign-in, or a disconnect, replaced this one.
        if self.pending is not pending:
            return
        if time.time() > pending['expires_at']:
            self.pending = None
            self.last_error = "The code ran out before it was entered. Start again."
            return
        try:
            code, data = yield self._fetch_json(self.api_url + "/oauth/token", "POST", {
                'grant_type': DEVICE_CODE_GRANT,
                'device_code': pending['device_code'],
                'client_id': self.client_id,
            })
        except Exception as e:
            # The network went away for a moment: keep asking until the code runs out.
            print("TONE3000 sign-in poll failed:", e)
            self._schedule_poll(pending)
            return
        if self.pending is not pending:
            return
        if code == 200:
            # The panel shows the account as soon as the pending code goes,
            # so the name is read before that.
            self.user = None
            self._save_tokens(token_record(data, time.time()))
            yield self._load_user()
            if self.pending is pending:
                self.pending = None
            return
        error = data.get("error") if isinstance(data, dict) else None
        if error == "authorization_pending":
            self._schedule_poll(pending)
        elif error == "slow_down":
            pending['interval'] += 5
            self._schedule_poll(pending)
        else:
            self.pending = None
            if error == "access_denied":
                self.last_error = "The sign-in was declined on TONE3000."
            elif error == "expired_token":
                self.last_error = "The code ran out before it was entered. Start again."
            else:
                self.last_error = "TONE3000 refused the sign-in (%s)." % (error or code)

    @gen.coroutine
    def _load_user(self):
        try:
            data = yield self.api_get("/user")
        except Tone3000Error as e:
            print("TONE3000: cannot read the user:", e)
            return
        self.user = {
            'username': _str_or_none(data.get("username")),
            'display_name': _str_or_none(data.get("display_name")) or _str_or_none(data.get("username")),
            'avatar_url': _str_or_none(data.get("avatar_url")),
        }
        if self.tokens is not None:
            self._save_tokens(self.tokens)

    # -- catalog

    @gen.coroutine
    def list_tones(self, kind, gear=None, query=None, page=1):
        if gear not in GEARS:
            gear = None
        if kind in PAGED_LISTS:
            data = yield self.api_get("/tones/" + kind, {
                'page': page, 'page_size': 50, 'gear': gear, 'query': query,
            })
        elif kind in SHORT_LISTS:
            data = yield self.api_get("/tones/" + kind, {'gear': gear}, auth=self.tokens is not None)
        else:
            raise Tone3000Error("Unknown list: %s" % kind, 400)
        tones = [tone_summary(t) for t in (data.get("data") or []) if isinstance(t, dict)]
        # NAM only: the NAM plugin cannot load an IR, an AIDA-X model or a snapshot.
        tones = [t for t in tones if t['format'] in (None, "nam")]
        raise gen.Return({
            'tones': tones,
            'page': data.get("page") or 1,
            'total_pages': data.get("total_pages") or 1,
        })

    @gen.coroutine
    def list_models(self, tone_id):
        # Without an architecture the API gives A1 and custom models only.
        # The NAM plugin on the device (0.2 and later) also plays A2.
        models = {}
        for arch in (None, "2"):
            data = yield self.api_get("/models", {'tone_id': tone_id, 'page_size': 300, 'architecture': arch})
            for model in data.get("data") or []:
                if isinstance(model, dict) and model.get("id") is not None and model.get("model_url"):
                    models[model["id"]] = model
        raise gen.Return(list(models.values()))

    @gen.coroutine
    def download(self, tone_id, model_ids):
        tone = tone_summary((yield self.api_get("/tones/%s" % int(tone_id))))
        models = yield self.list_models(tone['id'])
        wanted = set(int(i) for i in model_ids)
        models = [m for m in models if m["id"] in wanted]
        if not models:
            raise Tone3000Error("None of those models belongs to this tone", 400)

        folder = ToneFolder(tone)
        written = []
        for model in models:
            path = folder.existing(model["id"])
            if path is None:
                body = yield self._download_model(model["model_url"])
                path = folder.add(model_summary(model), body)
            written.append(path)
        folder.save()
        raise gen.Return({'folder': folder.path, 'files': written})

    @gen.coroutine
    def _download_model(self, url):
        headers = {}
        if may_send_token(url):
            headers['Authorization'] = "Bearer " + (yield self._access_token())
        request = HTTPRequest(url, headers=headers, request_timeout=DOWNLOAD_TIMEOUT, follow_redirects=True)
        response = yield AsyncHTTPClient().fetch(request, raise_error=False)
        if response.code != 200 or not response.body:
            raise Tone3000Error("Cannot download a model (%s)" % response.code, response.code)
        if not is_nam_model(response.body):
            raise Tone3000Error("TONE3000 sent something that is not a NAM model")
        raise gen.Return(response.body)


TONE3000 = Tone3000()
