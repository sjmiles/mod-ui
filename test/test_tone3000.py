#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
# SPDX-License-Identifier: AGPL-3.0-or-later

import json
import os
import shutil
import tempfile
import unittest

from mod import nam, tone3000


TONE = {
    "id": 77,
    "title": "Plexi / Crunch: 1968?",
    "url": "https://www.tone3000.com/tones/plexi-77",
    "gear": "amp",
    "format": "nam",
    "images": ["https://cdn.tone3000.com/plexi.png"],
    "sizes": ["standard", "nano"],
    "models_count": 3,
    "a1_models_count": 2,
    "a2_models_count": 1,
    "is_favorite": True,
    "user": {"username": "amp_guy", "display_name": None, "avatar_url": "https://cdn.tone3000.com/a.png"},
}

MODELS_A1 = [
    {"id": 1, "name": "Crunch", "size": "standard", "architecture_version": "1",
     "model_url": "https://www.tone3000.com/api/v1/models/1/file"},
    {"id": 2, "name": "Crunch", "size": "nano", "architecture_version": "1",
     "model_url": "https://www.tone3000.com/api/v1/models/2/file"},
]
MODELS_A2 = [
    {"id": 3, "name": "Crunch", "size": "lite", "architecture_version": "2",
     "model_url": "https://www.tone3000.com/api/v1/models/3/file"},
]


class TestHelpers(unittest.TestCase):
    def test_sanitize_name(self):
        self.assertEqual(tone3000.sanitize_name("Plexi / Crunch: 1968?"), "Plexi Crunch 1968")
        self.assertEqual(tone3000.sanitize_name("../.."), "untitled")
        self.assertEqual(tone3000.sanitize_name(None, "model"), "model")
        self.assertEqual(len(tone3000.sanitize_name("x" * 300)), tone3000.MAX_NAME_LENGTH)

    def test_tone_summary(self):
        summary = tone3000.tone_summary(TONE)
        self.assertEqual(summary['image_url'], "https://cdn.tone3000.com/plexi.png")
        self.assertEqual(summary['creator']['display_name'], "amp_guy")
        self.assertEqual(summary['a2_models_count'], 1)
        self.assertTrue(summary['is_favorite'])

    def test_tone_summary_tolerates_missing_fields(self):
        summary = tone3000.tone_summary({"id": 5})
        self.assertEqual(summary['title'], "Untitled")
        self.assertIsNone(summary['image_url'])
        self.assertIsNone(summary['creator']['username'])

    def test_first_image(self):
        self.assertEqual(tone3000.first_image([{"url": "https://x/y.png"}]), "https://x/y.png")
        self.assertIsNone(tone3000.first_image(["javascript:alert(1)"]))
        self.assertIsNone(tone3000.first_image(None))

    def test_token_record(self):
        record = tone3000.token_record({"access_token": "a", "refresh_token": "r", "expires_in": 100}, 1000)
        self.assertEqual(record, {'access_token': "a", 'refresh_token': "r", 'expires_at': 1100})
        with self.assertRaises(tone3000.Tone3000Error):
            tone3000.token_record({"error": "nope"}, 0)

    def test_token_goes_to_tone3000_only(self):
        self.assertTrue(tone3000.may_send_token("https://www.tone3000.com/api/v1/models/1"))
        self.assertTrue(tone3000.may_send_token("https://tone3000.com/x"))
        self.assertFalse(tone3000.may_send_token("http://www.tone3000.com/x"))
        self.assertFalse(tone3000.may_send_token("https://tone3000.com.evil.example/x"))
        self.assertFalse(tone3000.may_send_token("https://storage.example.com/x.nam"))

    def test_model_filename(self):
        taken = set()
        a = tone3000.model_filename({'name': "Crunch", 'size': "nano", 'architecture': "1"}, taken)
        b = tone3000.model_filename({'name': "Crunch", 'size': "lite", 'architecture': "2"}, taken)
        c = tone3000.model_filename({'name': "Crunch", 'size': "nano", 'architecture': "1"}, taken)
        self.assertEqual(a, "Crunch (nano).nam")
        self.assertEqual(b, "Crunch (A2 lite).nam")
        self.assertEqual(c, "Crunch (nano) 2.nam")


class TestToneFolder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.orig_user_files_dir = nam.USER_FILES_DIR
        nam.USER_FILES_DIR = self.tmp
        self.tone = tone3000.tone_summary(TONE)
        self.folder_path = os.path.join(self.tmp, "NAM Models", "TONE3000", "Plexi Crunch 1968")

    def tearDown(self):
        nam.USER_FILES_DIR = self.orig_user_files_dir
        shutil.rmtree(self.tmp)

    def body(self, model):
        return json.dumps({"architecture": "WaveNet", "id": model["id"]}).encode()

    def test_writes_models_and_sidecar(self):
        folder = tone3000.ToneFolder(self.tone)
        for model in (MODELS_A1[1], MODELS_A2[0]):
            folder.add(tone3000.model_summary(model), self.body(model))
        folder.save()

        self.assertEqual(folder.path, self.folder_path)
        self.assertEqual(sorted(os.listdir(self.folder_path)),
                         ["Crunch (A2 lite).nam", "Crunch (nano).nam", "tone3000.json"])
        with open(os.path.join(self.folder_path, "tone3000.json")) as fh:
            sidecar = json.load(fh)
        self.assertEqual(sidecar['tone_id'], 77)
        self.assertEqual(sidecar['image_url'], "https://cdn.tone3000.com/plexi.png")
        self.assertEqual(sorted(sidecar['models'].keys()), ["2", "3"])

        # the library shows the downloads with the details of the tone
        listed = dict((m['basename'], m) for m in nam.list_models())
        self.assertEqual(listed["Crunch (nano).nam"]['tone3000']['title'], "Plexi / Crunch: 1968?")

    def test_knows_what_an_earlier_download_wrote(self):
        folder = tone3000.ToneFolder(self.tone)
        path = folder.add(tone3000.model_summary(MODELS_A1[1]), self.body(MODELS_A1[1]))
        folder.save()

        again = tone3000.ToneFolder(self.tone)
        self.assertEqual(again.existing(2), path)
        self.assertIsNone(again.existing(1))
        os.remove(path)
        self.assertIsNone(again.existing(2))

    def test_folder_of_another_tone_is_not_reused(self):
        os.makedirs(self.folder_path)
        with open(os.path.join(self.folder_path, "tone3000.json"), 'w') as fh:
            json.dump({"tone_id": 12}, fh)
        folder = tone3000.ToneFolder(self.tone)
        self.assertEqual(os.path.basename(folder.path), "Plexi Crunch 1968 (77)")

    def test_is_nam_model(self):
        self.assertTrue(tone3000.is_nam_model(b'{"architecture": "WaveNet"}'))
        self.assertFalse(tone3000.is_nam_model(b'<html>error</html>'))
        self.assertFalse(tone3000.is_nam_model(b'\xff\xfe'))

    def test_write_json_private(self):
        path = os.path.join(self.tmp, "tokens.json")
        tone3000.write_json(path, {"a": 1}, private=True)
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        self.assertEqual(tone3000.read_json(path), {"a": 1})


if __name__ == '__main__':
    unittest.main()
