#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h}"
BUILD_DIR="$ROOT_DIR/build"
APP_DIR="$BUILD_DIR/哈气桑多涅.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
MODULE_CACHE_DIR="$BUILD_DIR/ModuleCache"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$MODULE_CACHE_DIR"

xcrun clang \
  -fobjc-arc \
  -fmodules \
  -fmodules-cache-path="$MODULE_CACHE_DIR" \
  -O \
  -isysroot "$SDK_PATH" \
  -mmacosx-version-min=13.0 \
  -arch arm64 \
  -arch x86_64 \
  "$ROOT_DIR/Sources/main.m" \
  -framework Cocoa \
  -framework ServiceManagement \
  -o "$MACOS_DIR/HissySandrone"

cp "$ROOT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$ROOT_DIR/Assets/spritesheet.png" "$RESOURCES_DIR/spritesheet.png"
cp "$ROOT_DIR/Assets/AppIcon.png" "$RESOURCES_DIR/AppIcon.png"
ditto "$ROOT_DIR/Assets/Proud" "$RESOURCES_DIR/Proud"
ditto "$ROOT_DIR/Assets/Sleep" "$RESOURCES_DIR/Sleep"

codesign --force --deep --sign - "$APP_DIR"

mkdir -p "$BUILD_DIR"
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$BUILD_DIR/Hissy-Sandrone-macOS.zip"

echo "$APP_DIR"
echo "$BUILD_DIR/Hissy-Sandrone-macOS.zip"
