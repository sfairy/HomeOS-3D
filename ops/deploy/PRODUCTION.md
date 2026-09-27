# 生产最小检查清单
#
# [ ] 1. 复制环境文件并填写
#       cp .env.example .env
#       - APP_BASE_URL / STORE_BASE_URL（https 公网域名）
#       - APP_TRUSTED_PROXIES / STORE_TRUSTED_PROXIES（反代网段）
#       - APP_COOKIE_SECURE=true / STORE_COOKIE_SECURE=true
#       - APP_LICENSE_SERVER_URL：同机 --role all 可由 shared overlay 注入内网；分拆 --role app 必须设公网商店 URL
#       管理员不走环境变量：两个 /setup 页面创建（见第 6、7 步）。
#
# [ ] 2. 宿主准备（授权实例指纹读的是宿主标识；一次即可）
#       ./ops/deploy/deploy.sh 会自动做这一步（--host-binds auto|force|skip）；手工等价命令：
#       sudo mkdir -p /host/etc /host/sys/class/dmi
#       sudo ln -sfn /etc/machine-id /host/etc/machine-id
#       sudo ln -sfn /sys/class/dmi/id /host/sys/class/dmi/id
#       顺序要紧：docker 启动时宿主路径不存在会被建成目录，之后再建符号链接就失败。
#       跳过也能启动，只是指纹退到 data/ 下的兜底 ID。
#       换主机名 / 改 /host 挂载会改变指纹；跨机迁移用 APP_HARDWARE_MACHINE_ID / APP_HARDWARE_BOARD_ID 钉住身份。
#
# [ ] 3. 拉起（一条命令；脚本按角色拉镜像、等健康、打印地址）
#       同机：       ./ops/deploy/deploy.sh
#       只有商店：   ./ops/deploy/deploy.sh --role store
#       只有主应用： ./ops/deploy/deploy.sh --role app --license-server https://pay.example.com
#       钉版本加 --version 0.6.5；只看命令加 --dry-run
#
# [ ] 4. 确认健康
#       docker compose -f docker-compose.store.yml ps
#       docker compose -f docker-compose.app.yml ps
#       curl -fsS http://127.0.0.1:18081/health/ready
#       curl -fsS http://127.0.0.1:18082/healthz
#       docker logs homeos-3d | head   # 取 /setup 引导密钥（桥接网络访问时需要）
#
# [ ] 5. 反代 TLS
#       参考 ops/deploy/Caddyfile.example 或 ops/deploy/nginx.conf.example
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
#       确认支付渠道是 alipay 且填了真实 APPID / 密钥（模拟收银台已删除）
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
#       先 git pull（若部署目录是检出），再跑与首次相同的那条 deploy.sh；钉版本用 --version
#
# 两台服务器分开部署：两侧各跑一次 deploy.sh（--role store / --role app --license-server ...）。
# 主应用侧的公钥由脚本落盘到 ./keys，不再需要共享卷与手工搬 PEM；
# 其余人工项（公网地址、实例指纹）见 ops/deploy/SPLIT-DEPLOY.md。
