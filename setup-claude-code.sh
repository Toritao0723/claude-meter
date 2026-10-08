#!/bin/bash
# Installs Claude Code if it is missing, then signs it in. Claude Meter reads this sign-in.
#
#   curl -fsSL https://raw.githubusercontent.com/Toritao0723/claude-meter/main/setup-claude-code.sh | bash
#
# Commands typed in Terminal do not use the macOS system proxy by themselves. From a region Anthropic blocks
# (for example Hong Kong) they go out directly and fail with 403. This script picks up your system proxy
# (Clash, Surge, ...) for the commands it runs, and stops with a clear message at the step that fails.
#
# 安装 Claude Code 并登录（Claude Meter 读取的就是这个登录）。终端里的命令不会自动走系统代理，
# 在香港等地区会直连失败（403）；本脚本会自动带上你的系统代理，并在失败的那一步给出明确提示。

main() {
  local url="${CLAUDE_METER_INSTALLER_URL:-https://claude.ai/install.sh}" cli="" country="" host port tmp rc
  stop() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; [ -z "${2:-}" ] || printf '  %s\n' "$2"; exit 1; }
  step() { printf '\n== %s\n' "$1"; }
  find_cli() {
    local c
    for c in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
      [ -x "$c" ] && { echo "$c"; return; }
    done
    command -v claude 2>/dev/null || true
  }
  signed_in() { "$1" auth status </dev/null 2>/dev/null | grep -q '"loggedIn": true'; }

  step "1. Network · 网络"
  # A leftover NO_PROXY would make the commands below skip the proxy.
  unset NO_PROXY no_proxy
  if [ -z "${HTTPS_PROXY:-}" ] && [ -z "${https_proxy:-}" ] && scutil --proxy 2>/dev/null | grep -q 'HTTPSEnable : 1'; then
    host="$(scutil --proxy | awk '/HTTPSProxy :/ {print $3}')"; port="$(scutil --proxy | awk '/HTTPSPort :/ {print $3}')"
    export HTTPS_PROXY="http://$host:$port" HTTP_PROXY="http://$host:$port"
    echo "Using your system proxy $host:$port for the commands below · 使用系统代理 $host:$port"
  fi
  country="$(curl -s -m 10 https://ipinfo.io/country </dev/null 2>/dev/null | tr -d '[:space:]')"
  if [ -z "$country" ]; then
    stop "Cannot reach the internet from Terminal · 终端连不上网络" "Check that your proxy app is running, then run this again · 请确认代理软件已打开，再运行一次"
  fi
  echo "Your traffic leaves from: $country · 出口地区: $country"
  if printf '%s' "$country" | grep -qE '^(HK|CN|MO|RU|BY|IR|KP|CU|SY)$'; then
    stop "Anthropic does not serve $country · Anthropic 不支持 $country 地区" "Switch your proxy node to Japan, the US or Singapore, then run this again · 请把代理节点切到日本、美国或新加坡，再运行一次"
  fi

  step "2. Claude Code"
  cli="$(find_cli)"
  if [ -n "$cli" ]; then
    echo "Already installed · 已安装: $cli"
  else
    echo "Downloading Anthropic's official installer · 下载官方安装脚本 ($url)"
    tmp="$(mktemp)"
    curl -fsSL -m 60 "$url" -o "$tmp" </dev/null || { rm -f "$tmp"; stop "Could not download the installer · 下载不了安装脚本" "Usually the proxy or region: see the line about your traffic above · 多半是代理或地区问题，见上面的出口地区"; }
    # From a blocked region claude.ai answers with an "unavailable in your region" web page instead of the script.
    if ! head -c 2 "$tmp" | grep -q '^#!'; then
      rm -f "$tmp"
      stop "What came back is a web page, not the installer · 下载到的是网页，不是安装脚本" "Anthropic shows an 'unavailable in region' page when the traffic does not leave from a supported region. Check that the proxy is on and set to Japan, the US or Singapore · 说明流量没有从受支持的地区出去，请确认代理已开并切到日本、美国或新加坡"
    fi
    bash "$tmp" </dev/null; rc=$?
    rm -f "$tmp"
    cli="$(find_cli)"
    if [ "$rc" -ne 0 ] || [ -z "$cli" ]; then
      stop "The installer did not finish (exit code $rc) · 安装没有完成" "Copy everything printed above and send it to whoever is helping you · 请把上面打印的全部内容复制给帮你的人"
    fi
    echo "Installed · 已安装: $cli"
  fi

  step "3. Sign in · 登录"
  if signed_in "$cli"; then
    echo "Already signed in · 已登录"
  elif [ "${CLAUDE_METER_SKIP_LOGIN:-0}" = 1 ]; then
    echo "(login skipped)"
  else
    echo "A browser opens. Sign in with the account whose quota you want to see. · 浏览器会打开，请登录要看额度的账号。"
    # `curl ... | bash` uses stdin for the script itself, so give the login the real terminal when there is one.
    if { true </dev/tty; } 2>/dev/null; then "$cli" auth login </dev/tty || true; else "$cli" auth login </dev/null || true; fi
  fi

  if signed_in "$cli"; then
    printf '\n\033[32m✓ Done.\033[0m Claude Meter shows your quota within about a minute. · 完成，约一分钟内小螃蟹会显示额度。\n'
    echo "If macOS asks about \"Claude Code-credentials\", choose Always Allow. · 如果 macOS 弹窗询问 Claude Code-credentials，请选「始终允许」。"
  else
    stop "Not signed in yet · 还没有登录成功" "Run again, or:  HTTPS_PROXY=${HTTPS_PROXY:-<your proxy>} $cli auth login"
  fi
}

main "$@"
