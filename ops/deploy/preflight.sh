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

# 本机局域网 IP：后面既用来比对证书名字，也用来推导「浏览器从内网打开时该拿到哪个商店地址」。
# `hostname -I` 只有 GNU coreutils 有；macOS 上它直接报 illegal option，于是 LAN_IP 会静默
# 退化成回环 —— 那会让下面「从本机走内网地址可达」的探测被整段跳过（正是它要发现的那类
# 故障）。所以 macOS 另给一条取值路径，两条都拿不到时明确说一句，不假装通过。
detect_lan_ip() {
  local found
  found="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -z "$found" ] && command -v ipconfig >/dev/null 2>&1; then
    # macOS：先实体网卡，再无线；都没有就问默认路由对应的那个接口。
    for iface in en0 en1; do
      found="$(ipconfig getifaddr "$iface" 2>/dev/null)"
      [ -n "$found" ] && break
    done
    if [ -z "$found" ] && command -v route >/dev/null 2>&1; then
      iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
      [ -n "$iface" ] && found="$(ipconfig getifaddr "$iface" 2>/dev/null)"
    fi
  fi
  printf '%s' "$found"
}

LAN_IP="${LAN_IP:-$(detect_lan_ip)}"
if [ -z "$LAN_IP" ]; then
  LAN_IP="127.0.0.1"
  LAN_IP_UNKNOWN=1
else
  LAN_IP_UNKNOWN=0
fi

head_ "1. 容器"
if [ -n "$APP_CT" ]; then ok "主应用容器：$APP_CT"; else bad "主应用容器未运行（$DC ps）"; fi
if [ -n "$STORE_CT" ]; then ok "商店容器：$STORE_CT"; else warn "商店容器未运行（客户机部署只有主应用时属正常）"; fi

head_ "2. 本机端口（不经过任何代理）"
# 端口能通 ≠ 容器在跑：源码态 `bun run dev` 也监听 8801/8802，而且同样会响应 /healthz。
# 容器不在时只看 curl，会把「dev 在跑」误判成「容器健康」，然后拿着 compose 的配置去
# 排查一个其实没部署的东西。所以这里同时看「谁在占端口」。
port_holder() {
  # 打印「pid <pid> <命令前 60 字>」；查不到输出空串。
  local port="$1" pid
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)"
  elif command -v ss >/dev/null 2>&1; then
    pid="$(ss -lntpH "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)"
  fi
  [ -n "$pid" ] || return 0
  printf 'pid %s %s' "$pid" "$(ps -p "$pid" -o args= 2>/dev/null | cut -c1-60)"
}

check_local_port() {
  # $1 = 说明, $2 = 容器名（可为空）, $3 = 端口, $4 = 健康路径
  local label="$1" container="$2" port="$3" path="$4" holder
  holder="$(port_holder "$port")"
  if curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$port$path" 2>/dev/null; then
    ok "$label http://127.0.0.1:$port$path"
    if [ -z "$container" ]; then
      warn "  但容器不存在：占着 $port 的是非容器进程（${holder:-未知进程}）—— 这是源码态，compose 会端口冲突"
    fi
  elif [ -z "$container" ]; then
    if [ -n "$holder" ]; then
      warn "$label 未就绪，但 $port 已被非容器进程占着（${holder}）：compose 起容器会端口冲突"
    else
      warn "$label 不在这台机器上（容器未运行；客户机部署只有主应用时属正常）"
    fi
  else
    bad "$label 不健康（看 docker logs ${container}）"
  fi
}

check_local_port "主应用" "$APP_CT" "$APP_PORT" "/health/ready"
check_local_port "商店" "$STORE_CT" "$STORE_PORT" "/healthz"

head_ "2a. 宿主端口发布（内网能不能打开，就看这一段）"
# 「容器内 0.0.0.0 监听」与「从别的设备能连上」是两件事：后者只取决于 compose 把端口发布到
# 哪个宿主地址。默认 `STORE_BIND:-0.0.0.0` 覆盖所有网卡；但有人为收窄暴露面改成回环，
# 那时**只有本机能连**，而启动日志里那句「监听 0.0.0.0:8802」说的是容器内视角，看它会绕圈。
# 注意 Docker 会绕过 ufw / firewalld 直接写 iptables，所以「防火墙没开这个端口」既可能
# 是没发布，也可能是 NAS 自带的入站管控（飞牛 / 群晖那一类），两者要分开看。
check_lan_publish() {
  # $1 = 服务名, $2 = 端口, $3 = 路径, $4 = 修法提示, $5 = 容器名（空 = 未运行）
  local svc="$1" port="$2" path="$3" hint="$4" container="$5" published
  if [ -z "$container" ]; then
    warn "$svc 容器未运行：跳过 ${port} 的发布检查"
    return 0
  fi
  published="$(docker port "$svc" "$port/tcp" 2>/dev/null | head -1)"
  if [ -z "$published" ]; then
    bad "$svc 没有发布 ${port}（容器在跑也连不上）"
    return 0
  fi
  case "$published" in
    127.0.0.1:*|\[::1\]:*|::1:*)
      bad "$svc 只发布到回环：$published —— 只有本机能连，内网打不开。$hint" ;;
    *)
      ok "$svc 发布到 $published"
      if [ "$LAN_IP_UNKNOWN" = "1" ]; then
        warn "  取不到本机局域网 IP（可用 LAN_IP=<IP> 指定），跳过内网可达性探测"
      elif curl -fsS -m 5 -o /dev/null "http://$LAN_IP:$port$path" 2>/dev/null; then
        ok "  从本机走内网地址可达：http://$LAN_IP:$port$path"
      else
        bad "  http://$LAN_IP:$port$path 不通：端口已发布，问题在 NAS / 路由器的入站管控（或不在同一网段）"
      fi ;;
  esac
}

check_lan_publish homeos-store "$STORE_PORT" "/healthz" \
  "改 compose 的 STORE_BIND=0.0.0.0（或删掉 .env 里的 STORE_BIND 用默认值），再 docker compose up -d --force-recreate homeos-store —— 端口映射在容器创建时固定，restart 不会重新应用。" \
  "$STORE_CT"
check_lan_publish homeos "$APP_PORT" "/health/ready" \
  "改 compose 的 ports 为 \"$APP_PORT:$APP_PORT\"（不要写 127.0.0.1:前缀）后 up -d homeos。" \
  "$APP_CT"

head_ "2b. 内置 HTTPS 反代（:8803）"
# :8803 是**只讲 TLS** 的端口（ops/caddy/app.Caddyfile 只写了 :8803 + tls internal）。
# 用 http:// 打开一定失败 —— 那不是故障，而是协议用错了；真正会坏的是下面两件事：
# 反代没起来，或者证书签给的名字与浏览器输入的地址不一致。
if curl -fsSk -m 5 "https://127.0.0.1:8803/health/ready" >/dev/null 2>&1; then
  ok "https://127.0.0.1:8803/health/ready（自签证书，已跳过校验）"
elif [ -z "$APP_CT" ]; then
  warn "主应用容器未运行，跳过内置 HTTPS 反代检查"
else
  warn "内置 HTTPS 反代没起来：看 docker logs $APP_CT 里 [proxy] 开头的行（Caddy 连退 5 次会放弃）"
fi
SNI="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CT" 2>/dev/null \
  | awk -F= '/^APP_HTTPS_DEFAULT_SNI=/{sub(/^APP_HTTPS_DEFAULT_SNI=/,""); print; exit}')"
if [ -n "$SNI" ]; then
  ok "APP_HTTPS_DEFAULT_SNI=${SNI}（自签证书签给这个名字）"
  if [ "$SNI" != "$LAN_IP" ]; then
    warn "证书签给 ${SNI}，而本机局域网 IP 是 ${LAN_IP}：https://$LAN_IP:8803 会报「证书与地址不匹配」（仍可手动放行）"
  fi
else
  warn "没设 APP_HTTPS_DEFAULT_SNI：证书默认签给 homeos.local，https://<局域网IP>:8803 会报地址不匹配"
fi

head_ "2c. 备份目录（宿主机可见性）"
if [ -z "$APP_CT" ]; then
  warn "主应用容器未运行：备份目录 / UI 素材 / 授权公钥这三项都依赖容器内视角，跳过"
else
  # 备份默认落在数据卷里，宿主机看不见、只能 docker cp。compose 把 ./backups 挂到
  # /data/backups，这里确认三件事：挂载在、容器可写、宿主目录不是只读的 root 目录。
  BACKUPS_MOUNT="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/backups"}}{{.Type}} {{.Source}}{{end}}{{end}}' "$APP_CT" 2>/dev/null || true)"
  if [ -z "$BACKUPS_MOUNT" ]; then
    warn "/data/backups 没有独立挂载：备份包只在数据卷里，宿主机看不到（要 shell 拷出用 docker cp）"
  elif [ "${BACKUPS_MOUNT%% *}" = "bind" ]; then
    ok "备份目录 bind mount：${BACKUPS_MOUNT#* }（宿主机直接可见）"
  else
    ok "备份目录挂载：$BACKUPS_MOUNT"
  fi
  if docker exec "$APP_CT" sh -c 'test -w /data/backups' 2>/dev/null; then
    ok "容器内 /data/backups 可写（属主已由 entrypoint 校正为 uid 1000）"
  else
    bad "容器内 /data/backups 不可写：备份会全部失败（bind mount 的宿主目录属主不对，见 ops/container_entrypoint.py）"
  fi

  head_ "2d. UI 素材目录（宿主机可替换性）"
  # 随包素材（图标 / 背景图 / 音效 / Logo）在镜像里是种子 /app/assets-default，compose 把
  # ./assets 挂到 /app/assets 作为实例目录：换图 / 换音效直接改宿主机文件即可。
  ASSETS_MOUNT="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/assets"}}{{.Type}} {{.Source}}{{end}}{{end}}' "$APP_CT" 2>/dev/null || true)"
  if [ -z "$ASSETS_MOUNT" ]; then
    warn "/app/assets 没有独立挂载：素材只在镜像里，替换要重建镜像"
  elif [ "${ASSETS_MOUNT%% *}" = "bind" ]; then
    ok "素材目录 bind mount：${ASSETS_MOUNT#* }（宿主机可直接替换）"
  else
    ok "素材目录挂载：$ASSETS_MOUNT"
  fi
  if docker exec -u homeos "$APP_CT" sh -c 'test -r /app/assets/logo/logo.svg' 2>/dev/null; then
    ok "容器内 /app/assets/logo/logo.svg 可读（uid 1000）"
  else
    bad "容器内缺 /app/assets/logo/logo.svg：默认素材没铺进去，/logo /icons /backgrounds 会 404，sw.js 预缓存也会失败（见 ops/container_entrypoint.py）"
  fi

  head_ "2e. 授权公钥目录（主应用读哪一份）"
  # 容器内路径在全部分部署形态下统一为 /data/client-keys：同机部署把商店写出的公钥卷只读
  # 挂到同一路径，客户机则在数据卷里缓存（首次联网取回，之后可离线）。
  KEYS_DIR="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CT" 2>/dev/null \
    | awk -F= '/^APP_CLIENT_KEYS_DIR=/{sub(/^APP_CLIENT_KEYS_DIR=/,""); print; exit}')"
  KEYS_DIR="${KEYS_DIR:-/data/client-keys}"
  if [ "$KEYS_DIR" = "/data/client-keys" ]; then
    ok "APP_CLIENT_KEYS_DIR=${KEYS_DIR}（与商店侧、客户机一致）"
  else
    warn "APP_CLIENT_KEYS_DIR=${KEYS_DIR}：不是统一的 /data/client-keys，排查公钥问题时要多看一处（见 README 的「授权公钥目录」）"
  fi
  KEYS_MOUNT="$(docker inspect -f '{{range .Mounts}}{{.Destination}}|{{.Type}}|{{.Source}}|{{.RW}}{{println}}{{end}}' "$APP_CT" 2>/dev/null \
    | awk -F'|' -v dir="$KEYS_DIR" '$1 == dir {print $2" "$3" rw="$4; exit}')"
  if [ -z "$KEYS_MOUNT" ]; then
    warn "$KEYS_DIR 没有独立挂载：公钥在数据卷里，靠首次启动联网取回（离线机器会卡在等待公钥）"
  else
    ok "$KEYS_DIR 挂载：$KEYS_MOUNT"
  fi
  if docker exec -u homeos "$APP_CT" sh -c "test -r '$KEYS_DIR/license-public.pem'" 2>/dev/null; then
    ok "容器内 $KEYS_DIR/license-public.pem 可读（uid 1000）"
  else
    bad "容器内读不到 $KEYS_DIR/license-public.pem：同机部署看商店是否已写出公钥卷，客户机看 APP_LICENSE_SERVER_URL 是否可达（启动日志会打「等待授权公钥超时」）"
  fi
fi

head_ "2f. 可信代理（隧道 / 反代带来的 X-Forwarded-* 是否被采信）"
# 隧道 / 反代跑在**宿主机**上、目标是 `http://<宿主局域网IP>:8801|8802` 时，容器看到的
# TCP 对端不是回环，而是 compose 网桥网关（本文件固定子网 172.28.0.0/24 → 网关 .1）。
# 网关不在 `*_TRUSTED_PROXIES` 里，应用就**不采信** X-Forwarded-Proto / -For：
#   · 公网 HTTPS 入口的会话 Cookie 不带 Secure、HSTS 不发；
#   · 所有经隧道的请求共用一个限流桶（按 IP 的登录/注册限流实际失效）。
# 目标是回环 127.0.0.1 时这条链路不需要网关（已经是默认值之一）。
NET_GW="$(docker network inspect homeos-net --format '{{range .IPAM.Config}}{{.Gateway}} {{end}}' 2>/dev/null | awk '{print $1}')"
if [ -z "$NET_GW" ]; then
  warn "取不到 homeos-net 的网关地址：跳过可信代理核对（容器未起或网络名被改过）"
else
  check_trusted() {
    # $1 = 服务名, $2 = 变量名, $3 = 容器名
    local svc="$1" var="$2" container="$3" value
    [ -n "$container" ] || return 0
    value="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container" 2>/dev/null \
      | awk -F= -v k="$var" '$1 == k {sub("^" k "=", ""); print; exit}')"
    if [ -z "$value" ]; then
      bad "$svc 没有 ${var}：转发头一律不被采信（Cookie 的 Secure / 按 IP 限流都会退化）"
    elif printf '%s' ",$value," | grep -q ",$NET_GW,"; then
      ok "$svc $var 含网关 $NET_GW"
    else
      warn "$svc $var=$value 不含网关 ${NET_GW}：隧道目标是宿主局域网 IP 时，转发头不会被采信（目标改回 127.0.0.1 可绕开）"
    fi
  }
  check_trusted "商店" STORE_TRUSTED_PROXIES "$STORE_CT"
  check_trusted "主应用" APP_TRUSTED_PROXIES "$APP_CT"
  # uvicorn 自己也要信同一层（它负责把 scope 的 scheme 改成 https），两行必须同口径。
  if [ -n "$APP_CT" ]; then
    UVICORN_TRUST="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CT" 2>/dev/null \
      | awk -F= '/^UVICORN_FORWARDED_ALLOW_IPS=/{sub(/^UVICORN_FORWARDED_ALLOW_IPS=/,""); print; exit}')"
    if [ -n "$UVICORN_TRUST" ] && printf '%s' ",$UVICORN_TRUST," | grep -q ",$NET_GW,"; then
      ok "主应用 UVICORN_FORWARDED_ALLOW_IPS 含网关 $NET_GW"
    else
      warn "主应用 UVICORN_FORWARDED_ALLOW_IPS=${UVICORN_TRUST:-（空）} 不含网关 ${NET_GW}：uvicorn 不会把 scheme 改写成 https"
    fi
  fi
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
      bad "指向了商店不存在的 HTTPS / 自签端口（商店只有 HTTP ${STORE_PORT}）" ;;
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
DECLARED_STORE_URL=""
if [ -n "$BASE_URL_JSON" ]; then
  ok "base-url：$BASE_URL_JSON"
  case "$BASE_URL_JSON" in
    *'"declared":true'*)
      # 声明了 STORE_BASE_URL：主应用会原样采信它（优先于任何同机推断），
      # 所以下面第 6 步三种入口的期望值都是这个地址。
      DECLARED_STORE_URL="$(printf '%s' "$BASE_URL_JSON" | sed -n 's/.*"baseUrl":"\([^"]*\)".*/\1/p')" ;;
    *) warn "declared=false：商店在回显调用方 Host，公网入口换域名时要留意" ;;
  esac
  # 端口检查只对**声明值**有意义：declared=false 时回显的是调用方 Host，带端口是正常的
  # （源码态就是 127.0.0.1:8802），拿它判错会给出一个不存在的配置问题。
  if [ -n "$DECLARED_STORE_URL" ]; then
    case "$DECLARED_STORE_URL" in
      *":$STORE_PORT"*) bad "STORE_BASE_URL 里带了 $STORE_PORT 端口（支付回调 / 同源判定会错）" ;;
    esac
  fi
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
    *) warn "status=${STATUS}（按提示处理；详细原因见 /settings 授权面板）" ;;
  esac
  case "$AVAIL" in
    *'"displayAllowed":false'*) warn "displayAllowed=false：面板 / 展示页会被门禁挡住" ;;
  esac
else
  bad "读不到 /api/v1/license/availability"
fi

head_ "6. 浏览器视角：商店入口（注册 / 激活 / 商店链接）"
# 取值口径（见 homeos/backend/src/domains/store/discovery.py）：
#   1) 显式 APP_STORE_URL 永远优先 —— 两份 compose 默认都写公网商店域名；
#   2) 未显式配置时，商店声明了 STORE_BASE_URL（declared=true）就原样采信，**声明优先于
#      任何同机推断**，所以从局域网 IP 打开主应用也还是公网地址；
#   3) 只有商店**没声明**时，局域网 / 回环访问才拼成同一台机器的 :8802（纯内网现场兜底）。
# 这里分别用三种 Host 探一次：有公网口径时三者都该是它，没有时才回落到同机端口。

probe_store_url() {
  # $1 = 说明, $2 = Host 头, $3 = 期望值
  local label="$1" host="$2" expect="$3" payload url
  payload="$(curl -fsS -m 8 -H "Host: $host" "http://127.0.0.1:$APP_PORT/api/v1/public/config" 2>/dev/null || true)"
  url="$(printf '%s' "$payload" | sed -n 's/.*"storeUrl":"\([^"]*\)".*/\1/p')"
  if [ -z "$url" ]; then
    if [ -z "$expect" ]; then
      ok "$label → 空（入口已隐藏，符合预期）"
    else
      bad "$label → 空，但期望 ${expect}（商店不可达或推导失败）"
    fi
    return 0
  fi
  if [ -n "$expect" ] && [ "$url" != "$expect" ]; then
    bad "$label → ${url}（期望 ${expect}）"
    return 0
  fi
  ok "$label → $url"
  if curl -fsS -m 8 -o /dev/null "${url%/}/healthz" 2>/dev/null; then
    ok "  这个地址从本机可达"
  elif [ -n "$PUBLIC_STORE_EXPECT" ] && [ "$url" = "$PUBLIC_STORE_EXPECT" ]; then
    # 公网地址在服务器本机探不到很常见（NAT 回环、穿透客户端不在本机），
    # 浏览器视角仍以它为准，不当作部署失败。
    warn "  这台机器上探不到 ${url}（浏览器视角仍以它为准；确认 DNS / 穿透 / 证书即可）"
  else
    bad "  这个地址不可达：浏览器点「商店 / 重置密码」会 404 或超时"
  fi
}

# 公网口径：容器里显式配的 APP_STORE_URL 优先，其次商店声明的 STORE_BASE_URL。
APP_STORE_URL_ENV="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CT" 2>/dev/null \
  | awk -F= '/^APP_STORE_URL=/{sub(/^APP_STORE_URL=/,""); print; exit}')"
PUBLIC_STORE_EXPECT="${APP_STORE_URL_ENV:-$DECLARED_STORE_URL}"
if [ -n "$PUBLIC_STORE_EXPECT" ]; then
  ok "公网口径：${PUBLIC_STORE_EXPECT}（三种入口都该是它）"
fi
probe_store_url "局域网 IP" "$LAN_IP:$APP_PORT" "${PUBLIC_STORE_EXPECT:-http://$LAN_IP:$STORE_PORT}"
probe_store_url "回环"      "127.0.0.1:$APP_PORT" "${PUBLIC_STORE_EXPECT:-http://127.0.0.1:$STORE_PORT}"
if [ -n "$APP_DOMAIN" ]; then
  probe_store_url "公网域名" "${APP_DOMAIN#*://}" "$PUBLIC_STORE_EXPECT"
fi

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
  # 不用 `A && ok || bad`：`ok` 只是 printf，stdout 被关掉（如 `| head`）时会返回非零，
  # 于是同一项既打 ✓ 又打 ✗，把成功算成失败（SC2015 的正是这个坑）。
  if [ "$keys_code" = "200" ]; then
    ok "商店公钥 $STORE_DOMAIN/v2/keys"
  else
    bad "客户机取公钥会失败：$STORE_DOMAIN/v2/keys → $keys_code"
  fi
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
    *) bad "公网 WebSocket 握手 → ${ws_code}（期望 101）" ;;
  esac

  pub_cfg="$(curl -fsS -m 10 "$APP_DOMAIN/api/v1/public/config" 2>/dev/null || true)"
  pub_store="$(printf '%s' "$pub_cfg" | sed -n 's/.*"storeUrl":"\([^"]*\)".*/\1/p')"
  if [ -z "$pub_store" ]; then
    warn "公网入口下 storeUrl 为空：登录页商店入口会被隐藏（商店入口没配上公网地址？）"
  else
    ok "公网入口下的商店链接：$pub_store"
    pc="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$pub_store/healthz" 2>/dev/null || echo 000)"
    if [ "$pc" = "200" ]; then
      ok "  从公网可达"
    else
      bad "  公网打不开（${pc}）：商店域名没映射到上游，或该域名只能从内网访问"
    fi
  fi
fi

printf '\n\033[1m结果：%s 项失败，%s 项告警\033[0m\n' "$FAILED" "$WARNED"
[ "$FAILED" -eq 0 ] || printf '按上面 ✗ 的顺序修；修复后重跑本脚本。\n'
exit "$FAILED"
