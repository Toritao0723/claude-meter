#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
BUILD_DIR="${CLAUDE_METER_BUILD_DIR:-/private/tmp/claude-meter-build}"
APP="$BUILD_DIR/Claude Meter.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" .build
EXTRA=()
INC=/Library/Developer/CommandLineTools/usr/include/swift
if [ -f "$INC/module.modulemap" ] && [ -f "$INC/bridging.modulemap" ] && grep -q SwiftBridging "$INC/module.modulemap"; then
  : > .build/empty.modulemap
  python3 - <<'PY'
import json, pathlib
p=pathlib.Path.cwd()
(p/'.build/overlay.yaml').write_text(json.dumps({'version':0,'case-sensitive':'false','roots':[{'type':'directory','name':'/Library/Developer/CommandLineTools/usr/include/swift','contents':[{'type':'file','name':'module.modulemap','external-contents':str(p/'.build/empty.modulemap')}]}]}))
PY
  EXTRA=(-vfsoverlay .build/overlay.yaml)
fi
# One app for both kinds of Mac: build each architecture, then join them (an architecture the toolchain cannot build is skipped).
slices=()
for arch in arm64 x86_64; do
  if swiftc -O -swift-version 5 "${EXTRA[@]}" -module-cache-path .build/cache -target "$arch-apple-macos13.0" Meter.swift -o ".build/ClaudeMeter-$arch" -framework Cocoa -framework WebKit -framework ServiceManagement -framework UserNotifications; then
    slices+=(".build/ClaudeMeter-$arch")
  else
    echo "skipping $arch"
  fi
done
[ ${#slices[@]} -gt 0 ] || { echo "build failed"; exit 1; }
lipo -create "${slices[@]}" -output "$APP/Contents/MacOS/ClaudeMeter"
cp -R ui "$APP/Contents/Resources/"
cp bridge.py "$APP/Contents/Resources/"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Claude Meter</string>
<key>CFBundleIdentifier</key><string>local.tori.claude-meter</string>
<key>CFBundleExecutable</key><string>ClaudeMeter</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.6.0</string>
<key>CFBundleVersion</key><string>12</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$APP"
echo "Built $APP"
