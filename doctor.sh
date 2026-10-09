#!/bin/bash
# Claude Meter self-check: finds out why the quota is not showing. It prints no tokens and changes nothing.
#
#   curl -fsSL https://raw.githubusercontent.com/Toritao0723/claude-meter/main/doctor.sh | bash
#
# 自检脚本：找出额度为什么没有显示。不会打印令牌，也不会修改任何东西。

main() {
  local APP="${CLAUDE_METER_DIR:-$HOME/Applications}/Claude Meter.app" failed=0 cli="" cli_in=0 country="" proxy_arg=()
  ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
  bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; failed=1; }
  note() { printf '      → %s\n' "$1"; }

  echo "Claude Meter self-check · 自检"
  echo

  echo "1. Mac"
  ok "macOS $(sw_vers -productVersion), $(uname -m)"
  if [ "$(sw_vers -productVersion | cut -d. -f1)" -lt 13 ]; then bad "Claude Meter needs macOS 13 or newer · 需要 macOS 13 或更新"; fi

  echo "2. Claude Meter app · 应用"
  if [ -d "$APP" ]; then
    ok "installed · 已安装: $APP"
    if pgrep -x ClaudeMeter >/dev/null; then ok "running · 正在运行"; else bad "not running · 没有在运行"; note "open \"$APP\""; fi
  else
    bad "not installed · 还没有安装"
    note "curl -fsSL https://raw.githubusercontent.com/Toritao0723/claude-meter/main/install.sh | bash"
  fi

  echo "3. Python 3 (the app's helper needs it · 应用的后台程序需要它)"
  if ! xcode-select -p >/dev/null 2>&1; then
    bad "Apple Command Line Tools are missing · 缺少 Apple 命令行工具"
    note "xcode-select --install   (wait for it to finish, then reopen Claude Meter · 装完后重新打开 Claude Meter)"
  elif /usr/bin/python3 -c 'pass' </dev/null >/dev/null 2>&1; then
    ok "works · 可用 ($(/usr/bin/python3 --version </dev/null 2>&1))"
  else
    bad "/usr/bin/python3 does not run · 不能运行"; note "xcode-select --install"
  fi

  # Commands typed in Terminal (the Claude Code installer and its login) do not use the macOS system proxy by themselves,
  # so from a blocked region they go out directly and fail with 403. When a system proxy exists, put it into the hints below.
  local PX="" install_cmd="curl -fsSL https://claude.ai/install.sh | bash" login_cmd="~/.local/bin/claude auth login"
  if scutil --proxy 2>/dev/null | grep -q 'HTTPSEnable : 1'; then
    local sh sp
    sh="$(scutil --proxy | awk '/HTTPSProxy :/ {print $3}')"; sp="$(scutil --proxy | awk '/HTTPSPort :/ {print $3}')"
    PX="HTTPS_PROXY=http://$sh:$sp HTTP_PROXY=http://$sh:$sp"
    install_cmd="export $PX && $install_cmd"; login_cmd="$PX $login_cmd"
  fi

  echo "4. Claude Code (the meter reads ITS sign-in, not the Claude desktop app's · 额度用的是 Claude Code 的登录，不是 Claude 桌面版的登录)"
  for c in "${CLAUDE_METER_CLI:-}" "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude "$HOME/.npm-global/bin/claude" "$HOME/.bun/bin/claude"; do
    if [ -n "$c" ] && [ -x "$c" ]; then cli="$c"; break; fi
  done
  [ -n "$cli" ] || cli="$(command -v claude 2>/dev/null || true)"
  if [ -z "$cli" ]; then
    bad "Claude Code is not installed · 没有安装 Claude Code"
    note "curl -fsSL https://raw.githubusercontent.com/Toritao0723/claude-meter/main/setup-claude-code.sh | bash"
    note "(installs Claude Code with your system proxy filled in, then signs in · 自动带上系统代理安装 Claude Code，然后登录)"
    note "by hand instead / 手动方式:  $install_cmd   then / 然后   $login_cmd"
  else
    ok "found · 已找到: $cli ($("$cli" --version </dev/null 2>/dev/null | head -1))"
    if "$cli" auth status </dev/null 2>/dev/null | grep -q '"loggedIn": true'; then
      ok "signed in · 已登录"; cli_in=1
    else
      bad "not signed in · 没有登录"
      note "curl -fsSL https://raw.githubusercontent.com/Toritao0723/claude-meter/main/setup-claude-code.sh | bash"
      note "(a browser opens; sign in with the account whose quota you want to see · 浏览器会打开，登录要看额度的账号)"
      note "by hand instead / 手动方式:  ${login_cmd/\~\/.local\/bin\/claude/$cli}"
      note "use a network node in a supported region such as Japan · 请用日本等受支持地区的网络节点"
    fi
  fi

  if [ -n "$cli" ]; then
    local v items
    echo "   details, names only and no secrets · 详情（只有名称，不含任何密钥）"
    printf '      claude auth status: %s\n' "$("$cli" auth status </dev/null 2>/dev/null | grep -E '"(loggedIn|authMethod|apiProvider)"' | tr -d ' \n')"
    for v in CLAUDE_CONFIG_DIR ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_BASE_URL CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX; do
      [ -n "${!v:-}" ] && printf '      environment variable %s is set (value not shown) · 已设置环境变量 %s（不显示内容）\n' "$v" "$v"
    done
    items="$(security dump-keychain 2>/dev/null | grep -i '"svce"' | grep -i 'claude code' | sed 's/.*="//; s/"$//' | sort -u | tr '\n' ';' | sed 's/;$//')"
    printf '      saved logins in the Keychain · 钥匙串里的登录项: %s\n' "${items:-(none · 没有)}"
    [ -f "$HOME/.claude/.credentials.json" ] && echo "      file ~/.claude/.credentials.json exists · 存在"
  fi

  echo "5. Network and region · 网络与地区"
  local host port
  if scutil --proxy 2>/dev/null | grep -q 'HTTPSEnable : 1'; then
    host="$(scutil --proxy | awk '/HTTPSProxy :/ {print $3}')"; port="$(scutil --proxy | awk '/HTTPSPort :/ {print $3}')"
    proxy_arg=(-x "http://$host:$port"); ok "system proxy in use · 系统代理: $host:$port"
  else
    ok "no system proxy (direct connection) · 没有系统代理（直连）"
  fi
  # NO_PROXY in the environment would make curl skip the proxy and report the wrong country; the app ignores it too.
  country="$(env -u NO_PROXY -u no_proxy curl -s -m 10 "${proxy_arg[@]}" https://ipinfo.io/country </dev/null 2>/dev/null | tr -d '[:space:]')"
  if [ -z "$country" ]; then
    bad "cannot reach the internet through this connection · 当前网络连不上"
  elif printf '%s' "$country" | grep -qE '^(HK|CN|MO|RU|BY|IR|KP|CU|SY)$'; then
    bad "your traffic leaves from $country, which Anthropic blocks · 当前出口地区是 $country，Anthropic 不支持"
    note "switch your proxy node to Japan, the US or Singapore · 把代理节点切到日本、美国或新加坡"
  else
    ok "exit country · 出口地区: $country"
  fi

  echo "6. The real test: ask for the quota exactly like the app does · 实测：用应用自己的方式取一次额度"
  if [ -d "$APP/Contents/Resources" ] && xcode-select -p >/dev/null 2>&1; then
    local out
    out="$(/usr/bin/python3 -I - "$APP/Contents/Resources" </dev/null <<'PY' 2>&1
import sys
sys.path.insert(0, sys.argv[1])
try:
    import bridge
    d = bridge.normalize_usage(bridge.fetch_usage())
    print('OK ' + ', '.join(f"{w['label']} {100 - round(w['percentUsed'])}% left" for w in d['windows']))
except Exception as e:
    code = str(e) if 'bridge' in dir() and str(e) in bridge.PROBLEMS else 'network'
    print('FAIL ' + code + ' | ' + (bridge.PROBLEMS[code] if 'bridge' in dir() else str(e)))
PY
)"
    case "$out" in
      OK*)   ok "works · 成功: ${out#OK }"; note "If the crab still says Not synced, quit and reopen Claude Meter, or wait a minute · 如果小螃蟹仍显示未同步，退出并重新打开，或等一分钟" ;;
      "FAIL http 429"*) ok "the sign-in works, but Anthropic says too many requests right now; the meter retries by itself in a few minutes · 登录没问题，只是请求太频繁被暂时限流，几分钟后会自动重试" ;;
      FAIL*) bad "failed · 失败: ${out#FAIL }"
             if [ "$cli_in" = 1 ] && printf '%s' "$out" | grep -q 'signed-out'; then
               note "Claude Code says it is signed in, but the meter cannot find that login. Send the 'details' lines under step 4 to the developer · Claude Code 显示已登录，但小螃蟹读不到这份登录，请把第 4 步下面的「详情」几行发给开发者"
             fi ;;
      *)     bad "unexpected result · 未知结果: $(printf '%s' "$out" | tail -2 | tr '\n' ' ')" ;;
    esac
  else
    bad "skipped, because the app or Python is missing (see above) · 已跳过：应用或 Python 缺失（见上）"
  fi

  echo
  if [ "$failed" = 0 ]; then
    echo "Everything checks out · 一切正常"
  else
    echo "Fix the ✗ items above from the top, then run this check again · 请从上往下处理 ✗ 的项目，然后再运行一次本检查"
  fi
}

main "$@"
