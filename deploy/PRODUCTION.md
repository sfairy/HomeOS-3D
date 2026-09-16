# 生产最小检查清单
#
# [ ] 1. 复制环境文件并填写
#       cp .env.example .env
#       - APP_BASE_URL / STORE_BASE_URL（https 公网域名）
#       - APP_TRUSTED_PROXIES / STORE_TRUSTED_PROXIES（反代网段）
#       - APP_COOKIE_SECURE=true / STORE_COOKIE_SECURE=true
#       - STORE_ADMIN_EMAIL / STORE_ADMIN_PASSWORD（仅首次 seed；设强口令）
#       - APP_LICENSE_SERVER_URL 默认 http://homeos-3d-store:18082（compose 内网，通常不用改）
#
# [ ] 2. 拉起（或本地构建）
#       docker compose pull
#       # 或: docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
#       docker compose up -d
#
# [ ] 3. 确认健康
#       docker compose ps
#       curl -fsS http://127.0.0.1:18081/health/ready
#       curl -fsS http://127.0.0.1:18082/healthz
#       docker logs homeos-3d | head   # 取 /setup 引导密钥（桥接网络访问时需要）
#
# [ ] 4. 反代 TLS
#       参考 deploy/Caddyfile.example 或 deploy/nginx.conf.example
#       转发 WebSocket：/api/v1/ws/runtime
#       媒体：/api/hls/ 、/api/camera_proxy/
#
# [ ] 5. 商店后台
#       打开 https://pay.example.com/admin
#       配置邮件 SMTP、支付渠道（支付宝）、站点文案
#       确认 STORE_ALLOW_MOCK_PAYMENTS 未开启
#
# [ ] 6. 主应用
#       https://homeos.example.com/setup → 建管理员
#       /license 用商店发放的激活码激活
#
# [ ] 7. 加固
#       首次 seed 成功后可从运行环境去掉 STORE_ADMIN_PASSWORD
#       备份 volume：homeos-3d-data / homeos-3d-store-data /
#                    homeos-3d-license-keys / homeos-3d-client-keys
#       GHCR 私有包：docker login ghcr.io
#
# [ ] 8. 升级
#       不要删 volume
#       docker compose pull && docker compose up -d
