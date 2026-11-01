#!/usr/bin/env bash
# Rebuilds neural_amp_modeler-0.2.4-tonestack-aarch64.tgz: neural-amp-modeler-lv2
# v0.2.3 with 0001-tone-stack.patch, cross-built for the pedal (64-bit ARM) in
# an Ubuntu 20.04 container, so that it needs only glibc 2.29 or older and
# runs on Raspberry Pi OS bullseye and bookworm. Needs git and docker.
#
# Usage: lv2/nam-tonestack/build.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

git clone -q --branch v0.2.3 --recurse-submodules --shallow-submodules \
    https://github.com/mikeoliphant/neural-amp-modeler-lv2 "${WORK}/src"
git -C "${WORK}/src" apply "${HERE}/0001-tone-stack.patch"

cat > "${WORK}/build-in-container.sh" <<'IN'
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq g++-10-aarch64-linux-gnu binutils-aarch64-linux-gnu make python3-pip >/dev/null
pip3 install -q cmake==3.31.6   # the deps need cmake 3.18 or newer
cat > /tmp/aarch64.cmake <<'T'
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_C_COMPILER aarch64-linux-gnu-gcc-10)
set(CMAKE_CXX_COMPILER aarch64-linux-gnu-g++-10)
set(CMAKE_C_FLAGS_INIT "-mcpu=cortex-a72")
set(CMAKE_CXX_FLAGS_INIT "-mcpu=cortex-a72")
T
mkdir /src/build && cd /src/build
# as upstream's release build: libstdc++ inside the plugin
export CXXFLAGS="-static-libstdc++ -static-libgcc"
cmake .. -DCMAKE_BUILD_TYPE=Release -DBUILD_NAMCORE=ON -DBUILD_INTERNAL_STATIC_WAVENET=ON \
    -DBUILD_INTERNAL_STATIC_LSTM=ON -DCMAKE_TOOLCHAIN_FILE=/tmp/aarch64.cmake >/dev/null
make -j"$(nproc)"
aarch64-linux-gnu-strip neural_amp_modeler.lv2/neural_amp_modeler.so
IN

docker run --rm -v "${WORK}/src:/src" -v "${WORK}/build-in-container.sh:/b.sh" ubuntu:20.04 bash /b.sh

tar --owner=0 --group=0 -czf "${HERE}/neural_amp_modeler-0.2.4-tonestack-aarch64.tgz" \
    -C "${WORK}/src/build" neural_amp_modeler.lv2
echo "==> ${HERE}/neural_amp_modeler-0.2.4-tonestack-aarch64.tgz"
