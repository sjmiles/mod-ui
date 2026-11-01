#!/usr/bin/env bash
# Installs the NAM plugin with the Bass/Middle/Treble tone stack on the pedal,
# in place of the NAM plugin in ~/.lv2 there. The old bundle is kept in
# ~/.lv2-backup, outside the LV2 path, so `--undo` can put it back.
# Run it from this checkout, on a computer that can ssh to the pedal, like
# deploy.sh. Override PISTOMP_HOST / PISTOMP_USER as for deploy.sh.
#
# Usage:
#   lv2/nam-tonestack/install.sh          # install, then reboot the pedal
#   lv2/nam-tonestack/install.sh --undo   # put the previous NAM plugin back, then reboot
set -euo pipefail

HOST="${PISTOMP_HOST:-pistomp.local}"
USER="${PISTOMP_USER:-pistomp}"
TARGET="${USER}@${HOST}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TGZ="neural_amp_modeler-0.2.4-tonestack-aarch64.tgz"

if [[ "${1:-}" != "--undo" ]]; then
    echo "==> Copying ${TGZ} to ${TARGET}"
    scp -q "${HERE}/${TGZ}" "${TARGET}:/tmp/${TGZ}"
fi

ssh "${TARGET}" "MODE='${1:-}' TGZ='${TGZ}' bash -s" <<'REMOTE'
set -euo pipefail
URI="http://github.com/mikeoliphant/neural-amp-modeler-lv2"
mkdir -p ~/.lv2 ~/.lv2-backup

# The bundles in ~/.lv2 that hold the NAM plugin, whatever their folder name.
current() {
    grep -l "${URI}" ~/.lv2/*/manifest.ttl 2>/dev/null | xargs -r -n1 dirname
}

if [[ "${MODE}" == "--undo" ]]; then
    last="$(ls -1dt ~/.lv2-backup/*/ 2>/dev/null | head -1)"
    if [[ -z "${last}" ]]; then
        echo "No backup in ~/.lv2-backup: nothing to undo."
        exit 1
    fi
    for b in $(current); do rm -rf "${b}"; done
    name="$(basename "${last}")"
    mv "${last}" ~/.lv2/"${name%%@*}"
    echo "==> Put back ${name%%@*} from ${last}"
else
    stamp="$(date +%Y%m%d-%H%M%S)"
    for b in $(current); do
        mv "${b}" ~/.lv2-backup/"$(basename "${b}")@${stamp}"
        echo "==> Moved the old $(basename "${b}") to ~/.lv2-backup"
    done
    tar -xzf "/tmp/${TGZ}" -C ~/.lv2
    rm -f "/tmp/${TGZ}"
    echo "==> Installed ~/.lv2/neural_amp_modeler.lv2 (0.2.4 with tone stack)"
fi

# Another copy of the plugin elsewhere in the LV2 path would compete with this one.
others="$(find /usr/lib/lv2 /usr/local/lib/lv2 /opt /home -maxdepth 6 -name manifest.ttl \
    -path '*neural*' -not -path "${HOME}/.lv2/*" -not -path "${HOME}/.lv2-backup/*" 2>/dev/null \
    | xargs -r grep -l "${URI}" 2>/dev/null || true)"
if [[ -n "${others}" ]]; then
    echo "==> Note: other copies of the NAM plugin:"
    echo "${others}" | xargs -r -n1 dirname | sed 's/^/    /'
fi

# mod-host reads the ports of a plugin once, when it starts: reboot so that
# it sees Bass, Middle and Treble.
echo "==> Rebooting the pedal (about a minute)"
sudo reboot
REMOTE

echo "==> Done"
