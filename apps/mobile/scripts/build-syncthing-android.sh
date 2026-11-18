#!/usr/bin/env bash
# Cross-compiles the Syncthing engine for Android and places it as jniLibs/<abi>/libsyncthing.so
# in the local Expo module (an executable named .so so Android extracts it to nativeLibraryDir).
set -euo pipefail
VERSION="${SYNCTHING_VERSION:-v2.1.7}"
CACHE="${HOME}/.cache/synkka"
SRC="${CACHE}/syncthing-${VERSION}"
NDK="${ANDROID_NDK_HOME:-${ANDROID_HOME:-$HOME/Library/Android/sdk}/ndk/27.1.12297006}"
API=24
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${HERE}/modules/synkka-engine/android/src/main/jniLibs"
HOST_TAG="darwin-x86_64"; [[ "$(uname)" == Linux ]] && HOST_TAG="linux-x86_64"
TOOLCHAIN="${NDK}/toolchains/llvm/prebuilt/${HOST_TAG}/bin"

mkdir -p "$CACHE"
if [[ ! -d "$SRC" ]]; then
  git clone --depth 1 --branch "$VERSION" https://github.com/syncthing/syncthing.git "$SRC"
fi

build() { # goarch abi clang-triple
  local goarch=$1 abi=$2 triple=$3
  echo "==> Building Syncthing ${VERSION} for ${abi}"
  # -checklinkname=0: github.com/wlynxg/anet (Android interface listing) uses go:linkname into net,
  # which newer Go toolchains reject by default.
  (cd "$SRC" && EXTRA_LDFLAGS="-checklinkname=0" CGO_ENABLED=1 go run build.go -goos android -goarch "$goarch" \
      -cc "${TOOLCHAIN}/${triple}${API}-clang" -no-upgrade -version "$VERSION" build syncthing)
  mkdir -p "${OUT}/${abi}"
  mv "${SRC}/syncthing" "${OUT}/${abi}/libsyncthing.so"
}

ABIS="${ABIS:-arm64-v8a x86_64}"
for abi in $ABIS; do
  case $abi in
    arm64-v8a) build arm64 arm64-v8a aarch64-linux-android ;;
    x86_64)    build amd64 x86_64 x86_64-linux-android ;;
    *) echo "unsupported ABI $abi" >&2; exit 1 ;;
  esac
done
ls -la "$OUT"/*/libsyncthing.so
