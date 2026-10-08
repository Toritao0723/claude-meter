![Claude Meter — a tiny desktop crab that watches your Claude quota](media/claude-meter-banner.png)

# Claude Meter 🦀

A tiny desktop crab for macOS that shows your **remaining Claude quota** live and keeps you company while Claude Code works.

一只 macOS 桌面小螃蟹：实时显示 **Claude 剩余额度**，陪你等 Claude Code 干活。

| Full panel | Compact |
|---|---|
| ![Claude Meter full panel](media/claude-meter-en.png) | ![Claude Meter compact](media/claude-meter-compact-en.png) |

中文界面：[media/claude-meter-zh.png](media/claude-meter-zh.png)

## What it does

- **Live Claude quota** — 5-hour and weekly limits (plus weekly Opus / Sonnet when your plan has them), remaining %, and reset countdowns. The same numbers as Claude's Usage page, refreshed every 60 s.
- **Claude Code sessions** — recent sessions on this Mac in a one-line task bar, with working / done states, a notification when a turn finishes, and context fill.
- **Seven pixel scenes** — the crab types, cooks, plays tennis, takes photos and flies while Claude works; listens to music while waiting; throws confetti when a turn ends.
- **中文 / English** — switch with the **EN / 中** button in the full panel, or right-click → Switch to English.
- **Three sizes** — full panel, compact bar, and crab-only. Native macOS glass, light / dark / match system.

## Install

Requirements: macOS 13+, Apple Silicon, Claude Code, and a Claude subscription.

1. **Sign in Claude Code once** (the meter uses this sign-in to read your quota):
   ```sh
   claude auth login
   ```
2. **Download** `Claude-Meter-v1.6.0-macOS-arm64.zip` from [Releases](../../releases), unzip it, and move `Claude Meter.app` to `~/Applications`.
3. **Open it.** The app is ad-hoc signed, not Apple-notarized, so the first time: right-click the app → **Open** → **Open**. Or run:
   ```sh
   xattr -dr com.apple.quarantine "$HOME/Applications/Claude Meter.app"
   ```
4. If macOS asks to use the **"Claude Code-credentials"** keychain item, choose **Always Allow**.

### Build from source

Needs Apple Command Line Tools (`xcode-select --install`).

```sh
python3 -m unittest -v test_bridge.py
./build.sh
ditto "/private/tmp/claude-meter-build/Claude Meter.app" "$HOME/Applications/Claude Meter.app"
open "$HOME/Applications/Claude Meter.app"
```

JavaScript tests, if Node.js is installed: `node --test test_task_nav.cjs test_pet.cjs`.

## Good to know

- **Region:** Anthropic rejects requests from unsupported regions (for example Hong Kong): `claude auth login` fails with 403 and the meter shows a sync error. Use a network in a supported region. The meter follows the macOS system proxy.
- **Pink number = not synced.** If a refresh fails (offline, signed out, region), the number turns pink and the footer says so. A stale number never passes for a live one.
- **The sign-in lasts about 8 hours.** Claude Code renews it whenever the `claude` command-line tool starts; Claude Meter does not renew it for you. After a long idle, or if you only use the Claude desktop app, the meter shows *Not synced*. To renew it at no cost, run `claude -p /usage` in a terminal (it prints "Unknown skill", uses no tokens, and refreshes the sign-in); the meter picks the new sign-in up within a minute.
- **Privacy:** the access token is read locally from the macOS Keychain (or `~/.claude/.credentials.json`) and sent only to Anthropic's official read-only usage endpoint. Session tracking reads only `~/.claude/projects/*.jsonl` on this Mac. No model requests, no analytics, nothing else leaves your Mac.
- "Done" means the current response turn ended, not that the whole project is finished.

## Files

| File | What it is |
|---|---|
| `Meter.swift` | The macOS window, menu, notifications and bridge process. |
| `bridge.py` | Reads Claude quota and Claude Code sessions; prints JSON to the app every 2 s. |
| `ui/` | The panel: layout, pixel crab, scenes, task bar. Open `ui/index.html?state=ok&lang=en` in a browser to preview with demo data (`&mini=1`, `&minimized=1`, `&theme=light`). |
| `build.sh` | Builds and ad-hoc signs `Claude Meter.app`. |

## Credits

Based on [Bon Yeung's Claude-Meter](https://github.com/bonyuiux/Claude-Meter). Original UI and pixel character © 2026 Bon Yeung; the original documentation is kept in [UPSTREAM.md](UPSTREAM.md). Character landscapes adapt [Tori Patterns Photo Lab](https://patterns.toritao.com/#/photo). Built by Tori with Claude and Codex.

Unofficial fan project — not made or endorsed by Anthropic.
