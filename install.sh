#!/bin/bash
# Claude Meter installer: downloads the latest release, checks its checksum, installs it to ~/Applications and opens it.
#
#   curl -fsSL https://raw.githubusercontent.com/Toritao0723/claude-meter/main/install.sh | bash
#
# Optional: CLAUDE_METER_DIR=/some/folder (where to install), CLAUDE_METER_NO_OPEN=1 (do not launch it).
set -euo pipefail

REPO="Toritao0723/claude-meter"
DEST="${CLAUDE_METER_DIR:-$HOME/Applications}"
BASE="https://github.com/$REPO/releases/latest/download"
ZIP="Claude-Meter-macOS.zip"      # one build for Apple Silicon and Intel Macs

[ "$(uname -s)" = "Darwin" ] || { echo "Claude Meter is a macOS app."; exit 1; }
[ "$(sw_vers -productVersion | cut -d. -f1)" -ge 13 ] || { echo "Claude Meter needs macOS 13 or newer."; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Downloading Claude Meter..."
curl -fsSL -o "$work/$ZIP" "$BASE/$ZIP"
curl -fsSL -o "$work/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt"

echo "Checking the download..."
(cd "$work" && grep " $ZIP\$" SHA256SUMS.txt | shasum -a 256 -c -)

[ -n "${CLAUDE_METER_DIR:-}" ] || pkill -x ClaudeMeter 2>/dev/null || true   # replacing the default install: quit the running copy first
mkdir -p "$DEST"
rm -rf "$DEST/Claude Meter.app"
ditto -x -k "$work/$ZIP" "$DEST"
xattr -dr com.apple.quarantine "$DEST/Claude Meter.app" 2>/dev/null || true
codesign --verify --deep "$DEST/Claude Meter.app"
echo "Installed: $DEST/Claude Meter.app"

if ! xcode-select -p >/dev/null 2>&1; then
  echo
  echo "Apple's Command Line Tools are missing; the meter's helper needs Python 3 from them. Run:  xcode-select --install"
fi

if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
  echo
  echo "Claude Code was not found. The meter reads (and renews) ITS sign-in, not the Claude desktop app's, so install it first:"
  echo "  curl -fsSL https://claude.ai/install.sh | bash        (docs: https://code.claude.com/docs/en/setup)"
fi

if [ "${CLAUDE_METER_NO_OPEN:-0}" != "1" ]; then
  open "$DEST/Claude Meter.app"
fi

cat <<'EOF'

Next:
  1. Sign in Claude Code once, if you have not:   claude auth login
     (Anthropic blocks some regions, e.g. Hong Kong: use a network node in a supported region such as Japan.)
  2. If macOS asks about the "Claude Code-credentials" keychain item, choose Always Allow.
  3. The crab shows your remaining Claude quota within a minute. Right-click it for options.

Quota not showing? This checks every step and says which one fails:
  curl -fsSL https://raw.githubusercontent.com/Toritao0723/claude-meter/main/doctor.sh | bash
EOF
