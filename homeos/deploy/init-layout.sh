#!/bin/sh
# 由 homeos entrypoint 在首次启动时调用；也可手动：sh deploy/init-layout.sh
set -eu

ROOT="${HOMEOS_DEPLOY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

CADDY_DIR="$ROOT/deploy/caddy"
CADDYFILE="$CADDY_DIR/Caddyfile"

log() { printf '[init-layout] %s\n' "$*"; }

write_caddyfile() {
  cat >"$CADDYFILE" <<'EOF'
# HomeOS 内网 HTTPS（init-layout 生成，按需自签证书）
# 访问：https://<NAS 局域网 IP>:8443（任意 LAN IP/主机名均可）
#
# 双协议支持：
#   - HTTPS :8443 → Caddy 反代 → homeos:8801（X-Forwarded-Proto: https）
#   - HTTP  :8126 → Docker 端口映射 → homeos:8801（直连，无 X-Forwarded-Proto）
#   - COOKIE_SECURE=auto 使两端口均可登录：HTTPS 设 Secure Cookie，HTTP 不设
#   - WebSocket（Socket.IO / 内嵌代理）由 Caddy v2 reverse_proxy 默认自动升级
#
# tls internal { on_demand } 按连入地址动态签发内网证书；浏览器首次需手动放行自签证书。
{
	skip_install_trust
	admin off
	auto_https disable_redirects
	log {
		level ERROR
		format console
	}
	servers :8443 {
		protocols h1 h2
	}
}

:8443 {
	tls internal {
		on_demand
	}

	reverse_proxy homeos:8801 {
		header_up Host {host}
		header_up X-Real-IP {remote_host}
	}
}
EOF
}

mkdir -p "$ROOT/assets/floorplans" "$ROOT/assets/backgrounds" "$ROOT/assets/icons" "$ROOT/assets/room_images" "$ROOT/assets/logo" "$ROOT/assets/sounds" "$ROOT/license" "$ROOT/backups" "$ROOT/secrets" "$CADDY_DIR"
chmod 0775 \
  "$ROOT/assets/floorplans" \
  "$ROOT/assets/backgrounds" \
  "$ROOT/assets/icons" \
  "$ROOT/assets/room_images" \
  "$ROOT/assets/logo" \
  "$ROOT/assets/sounds" \
  "$ROOT/license" \
  2>/dev/null || true
chmod 0700 "$ROOT/secrets" 2>/dev/null || true

if [ -d "$CADDYFILE" ]; then
  log "发现 Caddyfile 被误建成目录，正在重建为文件"
  rm -rf "$CADDYFILE"
fi

if [ ! -f "$CADDYFILE" ]; then
  log "已写入 HTTPS 配置（按需内网证书）"
  write_caddyfile
fi

log "目录已就绪：assets / license / backups / secrets / Caddyfile"
