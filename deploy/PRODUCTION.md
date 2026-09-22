# 生产最小检查清单
#
# [ ] 1. 复制环境文件并填写
#       cp .env.example .env
#       - APP_BASE_URL / STORE_BASE_URL（https 公网域名）
#       - APP_TRUSTED_PROXIES / STORE_TRUSTED_PROXIES（反代网段）
#       - APP_COOKIE_SECURE=true / STORE_COOKIE_SECURE=true
#       - APP_LICENSE_SERVER_URL 默认 http://homeos-3d-store:18082（compose 内网，通常不用改）
#       管理员不走环境变量：两个 /setup 页面创建（见第 6、7 步）。
#
# [ ] 2. 宿主准备（授权实例指纹读的是宿主标识；一次即可）
#       sudo mkdir -p /host/etc /host/sys/class/dmi
#       sudo ln -sfn /etc/machine-id /host/etc/machine-id
#       sudo ln -sfn /sys/class/dmi/id /host/sys/class/dmi/id
#       跳过也能启动，只是指纹退到 data/ 下的兜底 ID。
#       注意：已在跑的旧部署升级到这份 compose 后指纹可能变一次，商店侧对实例不匹配
#       是按已吊销处理（客户端清空本地授权），需要在后台解绑后重新激活；想避免就先
#       把旧值写进 APP_HARDWARE_MACHINE_ID / APP_HARDWARE_BOARD_ID。
#
# [ ] 3. 拉起（商店先起：它创建共享网络与公钥卷）
#       docker compose -f docker-compose.store.yml pull && docker compose -f docker-compose.store.yml up -d
#       docker compose -f docker-compose.app.yml   pull && docker compose -f docker-compose.app.yml   up -d
#
# [ ] 4. 确认健康
#       docker compose -f docker-compose.store.yml ps
#       docker compose -f docker-compose.app.yml ps
#       curl -fsS http://127.0.0.1:18081/health/ready
#       curl -fsS http://127.0.0.1:18082/healthz
#       docker logs homeos-3d | head   # 取 /setup 引导密钥（桥接网络访问时需要）
#
# [ ] 5. 反代 TLS
#       参考 deploy/Caddyfile.example 或 deploy/nginx.conf.example
#       转发 WebSocket：/api/v1/ws/runtime
#       媒体：/api/hls/ 、/api/camera_proxy/
#       反代就要显式告诉主应用「谁可以改来源地址」：
#         UVICORN_FORWARDED_ALLOW_IPS=<反代地址或网段，例如 172.17.0.1>
#       默认只信回环（127.0.0.1,::1）。若在这里填 *，登录限流、配对码枚举预算
#       与审计里的来源 IP 会全部变成「客户端自己说了算」（启动时会告警）。
#       不填也不会漏 IP：uvicorn 不改写对端，一律按 TCP 对端统计 —— 只是拿不到
#       反代后面的真实客户端地址。
#
# [ ] 6. 商店后台
#       打开 https://pay.example.com/admin
#       配置邮件 SMTP、支付渠道（支付宝）、站点文案
#       确认 STORE_ALLOW_MOCK_PAYMENTS 未开启
#
# [ ] 7. 主应用
#       https://homeos.example.com/setup → 建管理员
#       /license 用商店发放的激活码激活
#
# [ ] 8. 加固
#       备份 volume（两个 compose 文件各自带项目名前缀）：
#                    homeos-3d_homeos-3d-data        （主应用）
#                    homeos-3d_homeos-3d-secrets     （主应用）
#                    homeos-3d-store_homeos-3d-store-data    （商店）
#                    homeos-3d-store_homeos-3d-license-keys  （授权私钥）
#                    homeos-3d-client-keys           （共享公钥，固定名）
#       GHCR 私有包：docker login ghcr.io
#
# [ ] 9. 升级
#       不要删 volume
#       docker compose -f docker-compose.store.yml pull && docker compose -f docker-compose.store.yml up -d
#       docker compose -f docker-compose.app.yml   pull && docker compose -f docker-compose.app.yml   up -d
#
# 两台服务器分开部署（商店与主应用不同机）时，共享网络 / 公钥卷 / PEM 拷贝 /
# 公网地址 / 实例指纹这几项需要人工补：见 deploy/SPLIT-DEPLOY.md。
