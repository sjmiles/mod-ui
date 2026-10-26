#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2012-2023 MOD Audio UG
# SPDX-License-Identifier: AGPL-3.0-or-later

# Neural Amp Modeler support: a library of the .nam model files on the device,
# so that the web UI can show models as first-class items rather than as
# filenames hidden behind the NAM plugin's file parameter.

import json
import os

from mod.settings import USER_FILES_DIR

NAM_MODELS_DIRNAME = "NAM Models"
NAM_FILETYPE = "nammodel"

# Written next to downloaded models, so the library can show where a model came
# from (for example a TONE3000 tone) without parsing the model again.
SIDECAR_NAME = "tone3000.json"

# WaveNet channel count of the first layer array, as set by the NAM trainer for
# each of its standard sizes. Any other count is reported as a custom size.
WAVENET_SIZES = {
    16: "standard",
    12: "lite",
    8: "feather",
    4: "nano",
}

METADATA_KEYS = (
    "name", "modeled_by", "gear_type", "gear_make", "gear_model", "tone_type",
    "loudness", "gain", "input_level_dbu", "output_level_dbu",
)

# Parsed models by full path, kept while the file's mtime and size are unchanged.
_models_cache = {}


def nam_models_dir():
    return os.path.join(USER_FILES_DIR, NAM_MODELS_DIRNAME)


def _model_size(architecture, config):
    if architecture != "WaveNet" or not isinstance(config, dict):
        return None
    layers = config.get("layers")
    if not isinstance(layers, list) or len(layers) == 0 or not isinstance(layers[0], dict):
        return None
    return WAVENET_SIZES.get(layers[0].get("channels"), "custom")


def read_model_info(fullname):
    try:
        with open(fullname, 'r') as fh:
            data = json.load(fh)
    except (OSError, ValueError, UnicodeDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    architecture = data.get("architecture")
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    info = {
        'version': data.get("version"),
        'architecture': architecture,
        'size': _model_size(architecture, data.get("config")),
    }
    for key in METADATA_KEYS:
        value = metadata.get(key)
        if isinstance(value, (str, int, float)) and not isinstance(value, bool):
            info[key] = value
        else:
            info[key] = None
    return info


def _read_sidecar(dirname, cache):
    if dirname in cache:
        return cache[dirname]
    sidecar = None
    try:
        with open(os.path.join(dirname, SIDECAR_NAME), 'r') as fh:
            sidecar = json.load(fh)
    except (OSError, ValueError, UnicodeDecodeError):
        pass
    if not isinstance(sidecar, dict):
        sidecar = None
    cache[dirname] = sidecar
    return sidecar


def _cached_model_info(fullname):
    try:
        st = os.stat(fullname)
    except OSError:
        return None
    key = (st.st_mtime, st.st_size)
    cached = _models_cache.get(fullname)
    if cached is not None and cached[0] == key:
        return cached[1]
    info = read_model_info(fullname)
    _models_cache[fullname] = (key, info)
    return info


def list_models():
    basedir = nam_models_dir()
    models = []
    seen = set()
    sidecars = {}

    for root, dirs, files in os.walk(basedir, followlinks=True):
        dirs.sort()
        for name in sorted(files):
            if not name.lower().endswith(".nam"):
                continue
            fullname = os.path.join(root, name)
            seen.add(fullname)

            # a file we cannot parse (or a newer format) is still listed, by filename
            info = _cached_model_info(fullname)
            if info is None:
                info = dict.fromkeys(('version', 'architecture', 'size') + METADATA_KEYS)

            folder = os.path.relpath(root, basedir)
            model = {
                'fullname': fullname,
                'basename': name,
                'folder': "" if folder == "." else folder,
                'label': info['name'] or os.path.splitext(name)[0],
            }
            model.update(info)

            sidecar = _read_sidecar(root, sidecars)
            model['tone3000'] = sidecar
            models.append(model)

    # forget models that are gone
    for fullname in tuple(_models_cache.keys()):
        if fullname not in seen:
            _models_cache.pop(fullname)

    return models


def find_model_parameter(plugin_info):
    # The writable path parameter that takes NAM model files, if this plugin has one.
    for parameter in plugin_info.get('parameters', ()):
        if not parameter.get('valid', True) or not parameter.get('writable', False):
            continue
        if NAM_FILETYPE in (parameter.get('fileTypes') or ()):
            return parameter.get('uri')
    return None
