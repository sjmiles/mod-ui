#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
# SPDX-License-Identifier: AGPL-3.0-or-later

import json
import os
import shutil
import tempfile
import unittest

from mod import nam


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as fh:
        json.dump(data, fh)


def wavenet(channels, metadata=None):
    return {
        "version": "0.5.4",
        "architecture": "WaveNet",
        "config": {"layers": [{"channels": channels}]},
        "metadata": metadata or {},
        "weights": [0.0],
    }


class TestListModels(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.orig_user_files_dir = nam.USER_FILES_DIR
        nam.USER_FILES_DIR = self.tmp
        nam._models_cache.clear()
        self.models_dir = os.path.join(self.tmp, "NAM Models")

    def tearDown(self):
        nam.USER_FILES_DIR = self.orig_user_files_dir
        nam._models_cache.clear()
        shutil.rmtree(self.tmp)

    def by_basename(self):
        return {model['basename']: model for model in nam.list_models()}

    def test_no_folder(self):
        self.assertEqual(nam.list_models(), [])

    def test_metadata_and_size(self):
        write_json(os.path.join(self.models_dir, "Fender", "twin.nam"), wavenet(4, {
            "name": "Twin Clean", "gear_make": "Fender", "gear_model": "Twin Reverb", "tone_type": "clean",
        }))
        model = self.by_basename()["twin.nam"]
        self.assertEqual(model['label'], "Twin Clean")
        self.assertEqual(model['folder'], "Fender")
        self.assertEqual(model['size'], "nano")
        self.assertEqual(model['gear_model'], "Twin Reverb")
        self.assertIsNone(model['tone3000'])

    def test_sizes(self):
        for channels, size in ((16, "standard"), (12, "lite"), (8, "feather"), (4, "nano"), (7, "custom")):
            write_json(os.path.join(self.models_dir, "%d.nam" % channels), wavenet(channels))
        models = self.by_basename()
        for channels, size in ((16, "standard"), (12, "lite"), (8, "feather"), (4, "nano"), (7, "custom")):
            self.assertEqual(models["%d.nam" % channels]['size'], size)

    def test_label_falls_back_to_filename(self):
        write_json(os.path.join(self.models_dir, "My Amp.nam"), {"architecture": "LSTM", "weights": []})
        model = self.by_basename()["My Amp.nam"]
        self.assertEqual(model['label'], "My Amp")
        self.assertIsNone(model['size'])

    def test_unparseable_file_is_still_listed(self):
        os.makedirs(self.models_dir)
        with open(os.path.join(self.models_dir, "broken.nam"), 'w') as fh:
            fh.write("not json")
        model = self.by_basename()["broken.nam"]
        self.assertEqual(model['label'], "broken")
        self.assertIsNone(model['architecture'])

    def test_other_extensions_ignored(self):
        write_json(os.path.join(self.models_dir, "notes.json"), {})
        write_json(os.path.join(self.models_dir, "UPPER.NAM"), wavenet(8))
        self.assertEqual(list(self.by_basename().keys()), ["UPPER.NAM"])

    def test_sidecar(self):
        write_json(os.path.join(self.models_dir, "T3K", "a.nam"), wavenet(8))
        write_json(os.path.join(self.models_dir, "T3K", nam.SIDECAR_NAME), {"tone_id": 42})
        self.assertEqual(self.by_basename()["a.nam"]['tone3000'], {"tone_id": 42})

    def test_cache_follows_file_changes(self):
        path = os.path.join(self.models_dir, "a.nam")
        write_json(path, wavenet(8, {"name": "First"}))
        self.assertEqual(self.by_basename()["a.nam"]['label'], "First")
        write_json(path, wavenet(8, {"name": "Second name"}))
        self.assertEqual(self.by_basename()["a.nam"]['label'], "Second name")
        os.remove(path)
        self.assertEqual(nam.list_models(), [])
        self.assertEqual(nam._models_cache, {})


class TestFindModelParameter(unittest.TestCase):
    def test_finds_nam_parameter(self):
        info = {'parameters': [
            {'uri': 'urn:loop', 'valid': True, 'writable': True, 'fileTypes': ['audioloop']},
            {'uri': 'urn:model', 'valid': True, 'writable': True, 'fileTypes': ['nammodel']},
        ]}
        self.assertEqual(nam.find_model_parameter(info), 'urn:model')

    def test_skips_readonly_parameter(self):
        info = {'parameters': [{'uri': 'urn:model', 'valid': True, 'writable': False, 'fileTypes': ['nammodel']}]}
        self.assertIsNone(nam.find_model_parameter(info))

    def test_no_parameters(self):
        self.assertIsNone(nam.find_model_parameter({}))


class TestModelFace(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.orig_user_files_dir = nam.USER_FILES_DIR
        nam.USER_FILES_DIR = self.tmp
        nam._models_cache.clear()
        self.models_dir = os.path.join(self.tmp, "NAM Models")

    def tearDown(self):
        nam.USER_FILES_DIR = self.orig_user_files_dir
        nam._models_cache.clear()
        shutil.rmtree(self.tmp)

    def test_plain_model_shows_its_gear(self):
        path = os.path.join(self.models_dir, "twin.nam")
        write_json(path, wavenet(4, {"name": "Twin Clean", "gear_make": "Fender", "gear_model": "Twin Reverb"}))
        face = nam.model_face(path)
        self.assertEqual(face, {'title': "Fender Twin Reverb", 'detail': "Twin Clean", 'size': "nano", 'image': None})

    def test_model_without_metadata(self):
        path = os.path.join(self.models_dir, "mystery.nam")
        write_json(path, wavenet(16))
        self.assertEqual(nam.model_face(path)['title'], "mystery")
        self.assertIsNone(nam.model_face(path)['detail'])

    def test_downloaded_tone_shows_its_picture(self):
        folder = os.path.join(self.models_dir, "TONE3000", "Plexi")
        path = os.path.join(folder, "Crunch (nano).nam")
        write_json(path, wavenet(4, {"name": "Crunch"}))
        write_json(os.path.join(folder, "tone3000.json"), {"title": "Marshall Plexi", "image": "cover.jpg",
                                                           "image_url": "https://cdn.tone3000.com/p.jpg"})
        # the sidecar names a picture that is not there yet: the remote one is used
        face = nam.model_face(path)
        self.assertEqual(face['title'], "Marshall Plexi")
        self.assertEqual(face['detail'], "Crunch")
        self.assertEqual(face['image'], "https://cdn.tone3000.com/p.jpg")
        self.assertIsNone(nam.cover_for(path))

        with open(os.path.join(folder, "cover.jpg"), 'wb') as fh:
            fh.write(b"\xff\xd8jpeg")
        self.assertTrue(nam.model_face(path)['image'].startswith("/nam/image?path="))
        self.assertEqual(nam.cover_for(path), (os.path.join(os.path.realpath(folder), "cover.jpg"), "image/jpeg"))
        self.assertTrue(nam.list_models()[0]['image'].startswith("/nam/image?path="))

    def test_paths_outside_the_library(self):
        outside = os.path.join(self.tmp, "elsewhere.nam")
        write_json(outside, wavenet(4))
        self.assertIsNone(nam.model_face(outside))
        self.assertIsNone(nam.model_face(os.path.join(self.models_dir, "..", "elsewhere.nam")))
        self.assertIsNone(nam.model_face("/etc/passwd"))
        self.assertIsNone(nam.model_face(None))

    def test_sidecar_cannot_point_out_of_the_folder(self):
        folder = os.path.join(self.models_dir, "T")
        path = os.path.join(folder, "a.nam")
        write_json(path, wavenet(4))
        write_json(os.path.join(folder, "tone3000.json"), {"image": "../../secret.jpg"})
        self.assertIsNone(nam.cover_for(path))


if __name__ == '__main__':
    unittest.main()
