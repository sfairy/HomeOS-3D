#!/usr/bin/env bash
# HomeOS 部署自检：把「四条地址链路 + 授权状态 + 机器指纹」一次性验完。
#
#   bash ops/deploy/preflight.sh                       # 只查本机（同机 compose 默认值）
#   bash ops/deploy/preflight.sh --app-domain https://homelife.iepose.cn \
#                                --store-domain https://homelifepay.iepose.cn
#
# 为什么要这个脚本：这套部署有四个**不同**的地址（容器出站、浏览器出站、商店对外身份、
# 主应用对外身份），任何一处填错都会表现成「页面能打开、但某类操作莫名失败」，而日志里
# 恰好什么都不明显。它们分别踩过的坑：
#
#   - 容器出站写成公网域名 → 穿透抖一下，已激活的机器心跳失败、租约到期整机停摆；
#   - 浏览器出站写成容器服务名 → 登录页「重置商店密码」跳到一个不存在的主机；
#   - 商店 STORE_BASE_URL 写成 :8802 → 支付回调地址错、同源判定错；
#   - 主应用 APP_BASE_URL 留空 / 只写了公网域名 → 另一条入口的 WebSocket 被判 Not an accepted origin。
#
# 退出码 = 失败项数量（0 表示全部通过）。依赖：docker compose（或 docker-compose）、curl。

set -u

APP_DOMAIN=""
STORE_DOMAIN=""
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_PORT="${APP_PORT:-8801}"
STORE_PORT="${STORE_PORT:-8802}"
FAILED=0
WARNED=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=$((FAILED + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARNED=$((WARNED + 1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --app-domain)   APP_DOMAIN="${2:-}";   shift 2 ;;
    --store-domain) STORE_DOMAIN="${2:-}"; shift 2 ;;
    -f|--file)      COMPOSE_FILE="${2:-}"; shift 2 ;;
    *) echo "未知参数：$1"; exit 2 ;;
  esac
done

if docker compose version >/dev/null 2>&1; then
  DC="docker compose -f $COMPOSE_FILE"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose -f $COMPOSE_FILE"
else
  echo "找不到 docker compose / docker-compose"; exit 2
fi

# 取第一个匹配服务的容器名；取不到返回空串。
svc_container() {
  $DC ps --format '{{.Service}} {{.Name}}' 2>/dev/null | awk -v s="$1" '$1==s {print $2; exit}'
}

APP_CT="$(svc_container homeos)"
STORE_CT="$(svc_container homeos-store)"

head_ "1. 容器"
if [ -n "$APP_CT" ]; then ok "主应用容器：$APP_CT"; else bad "主应用容器未运行（$DC ps）"; fi
if [ -n "$STORE_CT" ]; then ok "商店容器：$STORE_CT"; else warn "商店容器未运行（客户机部署只有主应用时属正常）"; fi

head_ "2. 本机端口（不经过任何代理）"
if curl -fsS -m 5 "http://127.0.0.1:$APP_PORT/health/ready" >/dev/null 2>&1; then
  ok "主应用 http://127.0.0.1:$APP_PORT/health/ready"
else
  bad "主应用 $APP_PORT 不健康（看 docker logs $APP_CT）"
fi
if curl -fsS -m 5 "http://127.0.0.1:$STORE_PORT/healthz" >/dev/null 2>&1; then
  ok "商店 http://127.0.0.1:$STORE_PORT/healthz"
elif [ -z "$STORE_CT" ]; then
  warn "商店不在本机（客户机部署），跳过"
else
  bad "商店 $STORE_PORT 不健康（看 docker logs $STORE_CT）"
fi

head_ "3. 容器出站：主应用 → 商店（APP_LICENSE_SERVER_URL）"
LICENSE_URL="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CT" 2>/dev/null \
  | awk -F= '/^APP_LICENSE_SERVER_URL=/{sub(/^APP_LICENSE_SERVER_URL=/,""); print; exit}')"
if [ -n "$LICENSE_URL" ]; then
  ok "APP_LICENSE_SERVER_URL=$LICENSE_URL"
  case "$LICENSE_URL" in
    *://127.0.0.1*|*://localhost*)
      warn "容器内指向回环地址：容器里的 127.0.0.1 是它自己，不是商店" ;;
    *:8804*|*:8803*)
      bad "指向了商店不存在的 HTTPS / 自签端口（商店只有 HTTP $STORE_PORT）" ;;
  esac
  if docker exec "$APP_CT" curl -fsS -m 8 "$LICENSE_URL/healthz" >/dev/null 2>&1; then
    ok "容器内可达 $LICENSE_URL/healthz"
  else
    bad "容器内不可达 $LICENSE_URL/healthz（容器 → 商店链路断了）"
  fi
else
  bad "主应用容器没有 APP_LICENSE_SERVER_URL"
fi

head_ "4. 商店对外身份（STORE_BASE_URL）与公钥"
BASE_URL_JSON="$(curl -fsS -m 8 "http://127.0.0.1:$STORE_PORT/store/v1/base-url" 2>/dev/null || true)"
if [ -n "$BASE_URL_JSON" ]; then
  ok "base-url：$BASE_URL_JSON"
  case "$BASE_URL_JSON" in
    *'"declared":true'*) : ;;
    *) warn "declared=false：商店在回显调用方 Host，公网入口换域名时要留意" ;;
  esac
  case "$BASE_URL_JSON" in
    *":$STORE_PORT"*) bad "STORE_BASE_URL 里带了 $STORE_PORT 端口（支付回调 / 同源判定会错）" ;;
  esac
elif [ -n "$STORE_CT" ]; then
  bad "读不到 /store/v1/base-url"
fi
if curl -fsS -m 8 "http://127.0.0.1:$STORE_PORT/v2/keys" >/dev/null 2>&1; then
  ok "商店公钥 /v2/keys 可读"
elif [ -n "$STORE_CT" ]; then
  bad "商店公钥 /v2/keys 读不到（客户机将无法取回公钥）"
fi

head_ "5. 授权状态"
AVAIL="$(curl -fsS -m 8 "http://127.0.0.1:$APP_PORT/api/v1/license/availability" 2>/dev/null || true)"
if [ -n "$AVAIL" ]; then
  STATUS="$(printf '%s' "$AVAIL" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
  case "$STATUS" in
    ACTIVE) ok "status=ACTIVE（授权已放行）" ;;
    UNACTIVATED) warn "status=UNACTIVATED：这台机器还没激活，去 /activate 填激活码" ;;
    "") bad "availability 响应里没有 status：$AVAIL" ;;
    *) warn "status=$STATUS（按提示处理；详细原因见 /settings 授权面板）" ;;
  esac
  case "$AVAIL" in
    *'"displayAllowed":false'*) warn "displayAllowed=false：面板 / 展示页会被门禁挡住" ;;
  esac
else
  bad "读不到 /api/v1/license/availability"
fi

head_ "6. 浏览器视角：商店入口（按访问地址推导，不是写死的）"
# 同一个主应用会被三种地址访问：局域网 IP:端口、内置自签 HTTPS、公网域名。商店入口必须跟着
# **访问者当前用的那个地址**走，否则局域网用户点「商店」会被送去公网域名（穿透一抖就 404，
# 而旁边的 :8802 明明是通的）。这里分别用这三种 Host 探一次。
LAN_IP="${LAN_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "$LAN_IP" ] || LAN_IP="127.0.0.1"

probe_store_url() {
  # $1 = 说明, $2 = Host 头, $3 = 期望值
  local label="$1" host="$2" expect="$3" payload url
  payload="$(curl -fsS -m 8 -H "Host: $host" "http://127.0.0.1:$APP_PORT/api/v1/public/config" 2>/dev/null || true)"
  url="$(printf '%s' "$payload" | sed -n 's/.*"storeUrl":"\([^"]*\)".*/\1/p')"
  if [ -z "$url" ]; then
    if [ -z "$expect" ]; then
      ok "$label → 空（入口已隐藏，符合预期）"
    else
      bad "$label → 空，但期望 $expect（商店不可达或推导失败）"
    fi
    return 0
  fi
  if [ -n "$expect" ] && [ "$url" != "$expect" ]; then
    bad "$label → $url（期望 $expect）"
    return 0
  fi
  ok "$label → $url"
  if curl -fsS -m 8 -o /dev/null "${url%/}/healthz" 2>/dev/null; then
    ok "  这个地址从本机可达"
  else
    bad "  这个地址不可达：浏览器点「商店 / 重置密码」会 404 或超时"
  fi
}

probe_store_url "局域网 IP" "$LAN_IP:$APP_PORT" "http://$LAN_IP:$STORE_PORT"
probe_store_url "回环"      "127.0.0.1:$APP_PORT" "http://127.0.0.1:$STORE_PORT"
probe_store_url "公网域名"  "${APP_DOMAIN#*://}"  ""

head_ "7. 机器指纹来源（授权绑定，换机/重建都不能变）"
for path in /host/etc/machine-id /host/sys/class/dmi/id; do
  if [ -e "$path" ]; then ok "$path 存在"; else bad "$path 缺失：指纹会退化成可拷贝兜底 ID"; fi
done
if [ -n "$APP_CT" ]; then
  if docker exec "$APP_CT" test -r /data/instance-id 2>/dev/null; then
    ok "容器内 /data/instance-id 可读"
  else
    warn "容器内没有 /data/instance-id（首次启动会生成）"
  fi
fi

head_ "8. 公网入口（可选，需传 --app-domain / --store-domain）"
check_public() {
  local label="$1" url="$2" path="$3"
  [ -n "$url" ] || return 0
  local code
  code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$url$path" 2>/dev/null || echo 000)"
  case "$code" in
    200) ok "$label $url$path" ;;
    000) bad "$label $url 连不上（DNS / 隧道 / 证书）" ;;
    404) bad "$label $url$path 返回 404：入口没匹配到上游（穿透客户端没登记这个域名，或反代 server_name / upstream 写错）" ;;
    *)   bad "$label $url$path 返回 $code" ;;
  esac
}
check_public "主应用" "$APP_DOMAIN" "/health/ready"
check_public "商店"   "$STORE_DOMAIN" "/healthz"
if [ -n "$STORE_DOMAIN" ]; then
  keys_code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$STORE_DOMAIN/v2/keys" 2>/dev/null || echo 000)"
  [ "$keys_code" = "200" ] && ok "商店公钥 $STORE_DOMAIN/v2/keys" \
    || bad "客户机取公钥会失败：$STORE_DOMAIN/v2/keys → $keys_code"
fi

if [ -n "$APP_DOMAIN" ]; then
  # 公网入口最容易漏的两条：实时通道的来源被拒（握手 400）、商店链接指不过去。
  ws_code="$(curl -s -m 10 -o /dev/null -w '%{http_code}' \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==' -H "Origin: $APP_DOMAIN" \
    "$APP_DOMAIN/socket.io/?EIO=4&transport=websocket" 2>/dev/null || echo 000)"
  case "$ws_code" in
    101) ok "公网 WebSocket 握手 101（实时通道可用）" ;;
    400) bad "公网 WebSocket 被拒（Not an accepted origin）：入口透传的 Host / X-Forwarded-Proto 有问题，或 APP_BASE_URL 没对上" ;;
    502|503|504) bad "WebSocket 502/504：入口没把 Upgrade 透传给上游" ;;
    *) bad "公网 WebSocket 握手 → $ws_code（期望 101）" ;;
  esac

  pub_cfg="$(curl -fsS -m 10 "$APP_DOMAIN/api/v1/public/config" 2>/dev/null || true)"
  pub_store="$(printf '%s' "$pub_cfg" | sed -n 's/.*"storeUrl":"\([^"]*\)".*/\1/p')"
  if [ -z "$pub_store" ]; then
    warn "公网入口下 storeUrl 为空：登录页商店入口会被隐藏（商店入口没配上公网地址？）"
  else
    ok "公网入口下的商店链接：$pub_store"
    pc="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$pub_store/healthz" 2>/dev/null || echo 000)"
    [ "$pc" = "200" ] && ok "  从公网可达" \
      || bad "  公网打不开（$pc）：商店域名没映射到上游，或该域名只能从内网访问"
  fi
fi

printf '\n\033[1m结果：%s 项失败，%s 项告警\033[0m\n' "$FAILED" "$WARNED"
[ "$FAILED" -eq 0 ] || printf '按上面 ✗ 的顺序修；修复后重跑本脚本。\n'
exit "$FAILED"
