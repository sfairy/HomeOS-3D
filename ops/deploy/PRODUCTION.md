# 生产最小检查清单
#
# 先对号入座（形态决定后文怎么读）：
#
#   中心商店 + 多台客户机   ←── 生产默认形态
#     厂商机（唯一一台）：deploy.sh --role store
#       要跨公网 / 要卖授权时，再叠加 docker-compose.store.public.yml 上真实证书 HTTPS
#     每台客户机（各一次）：deploy.sh --role app --license-server <中心商店地址>
#       可直接用客户精简包（ops/deploy/pack-customer.sh 产出，见 CUSTOMER.md）
#
#   同机商店 + 主应用      ←── 仅开发 / 自测，不要用于客户交付
#     一台机器：deploy.sh --role all
#
# 配套文档：SPLIT-DEPLOY.md（拓扑与授权身份）、PUBLIC-ACCESS.md（公网接入）、
#          CUSTOMER.md（客户机安装）、UPGRADE.md（升级 / 回滚）。
#
# [ ] 1. 复制环境文件并填写
#       cp .env.example .env
#       - APP_TRUSTED_PROXIES / STORE_TRUSTED_PROXIES：反代已内置在容器回环上，保持默认 127.0.0.1,::1
#       - APP_COOKIE_SECURE / STORE_COOKIE_SECURE：HTTP/HTTPS 都要能登录用 false
#       - APP_LICENSE_SERVER_URL：同机 --role all 由 shared overlay 注入内网；分拆 --role app 填商店局域网地址
#       - APP_BASE_URL / STORE_BASE_URL：局域网 IP 不固定时留空（应用按请求 Host 判断同源）
#       账号不走环境变量：主应用首装零用户在 /register 注册本机唯一账号（见第 7 步），
#       商店运营管理员在 /setup 创建（见第 6 步）。
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
#       中心商店：   ./ops/deploy/deploy.sh --role store
#       客户机：     ./ops/deploy/deploy.sh --role app --license-server http://<中心商店>:8802
#       开发 / 自测： ./ops/deploy/deploy.sh          # 同机 all，不要用于客户交付
#       版本会写回 .env 钉住（HOMEOS_VERSION / HOMEOS_IMAGE），中心与各客户机用同一个 tag。
#       内网 HTTPS 开箱即用：反代（Caddy）内置在镜像里，主应用 https://<IP>:8803、商店 https://<IP>:8804
#       钉版本加 --version 1.0.0；只看命令加 --dry-run
#
# [ ] 4. 确认健康
#       docker compose -f docker-compose.store.yml ps
#       docker compose -f docker-compose.app.yml ps
#       curl -fsS http://127.0.0.1:8801/health/ready
#       curl -fsS http://127.0.0.1:8802/healthz
#       docker logs homeos-store | head   # 取商店 /setup 引导密钥（桥接网络访问时需要）
#
# [ ] 5. 内网 HTTPS（镜像内置，无需额外操作）
#       主应用与商店的镜像各自内置 Caddy 反代，与应用同容器、同镜像 tag：
#         主应用  https://<主机IP>:8803  → 反代同容器 127.0.0.1:8801
#         商店    https://<主机IP>:8804  → 反代同容器 127.0.0.1:8802
#       采用 Caddy 内置 CA + on_demand 自签证书，任意局域网 IP / 主机名都能访问，
#       首次浏览需手动放行自签证书。HTTP 备用直接走 8801 / 8802（不经反代）。
#       WebSocket 与媒体（/api/v1/ws/runtime、/api/hls/、/api/camera_proxy/）
#       由 Caddy v2 reverse_proxy 默认转发，无需额外配置。
#       反代在容器回环上，两个可信代理列表都保持回环默认值
#       （APP/STORE_TRUSTED_PROXIES=127.0.0.1,::1 与 UVICORN_FORWARDED_ALLOW_IPS 一致），
#       真实客户端 IP 由应用层按转发链解析出来（限流与审计都按它统计）。
#       **不要**把它填成 * 或 docker 网段：前者等于让客户端自报来源 IP，后者会让
#       uvicorn 连回环都不信、真实客户端 IP 退化成人人相同的 127.0.0.1。
#       只有当你把反代放到镜像之外（自建 Caddy / Nginx）时才需要放宽，见
#       ops/deploy/Caddyfile.intranet.example。
#       宿主发布端口在 .env 里改（APP_PUBLISH_PORT / APP_PROXY_PUBLISH_PORT /
#       STORE_PUBLISH_PORT / STORE_PROXY_PUBLISH_PORT）。
#
# [ ] 6. 商店后台
#       打开 http://<商店IP>:8802/admin（HTTPS：https://<商店IP>:8804/admin；同机同理）
#       配置邮件 SMTP、支付渠道（支付宝）、站点文案
#       确认支付渠道是 alipay 且填了真实 APPID / 密钥（模拟收银台已删除）
#
# [ ] 7. 主应用（每台客户机）
#       打开 http://<主机IP>:8801/register（HTTPS：https://<主机IP>:8803/register）注册本机
#       唯一账号：账号 + 密码 + 邮箱 + 邮箱验证码（验证码由商店代发，需先在第 6 步配好 SMTP）。
#       注册后自动登录并检测授权；未激活会跳 /activate，填商店购买邮箱 + 激活码完成绑定
#       （1 激活码 : 1 设备，见 SPLIT-DEPLOY.md 授权身份）。
#       旧 /setup 入口保留为整页跳转到 /register。
#
# [ ] 8. 加固
#       备份 volume（两个 compose 文件各自带项目名前缀）：
#                    homeos_homeos-data        （主应用，含自动取回的公钥缓存）
#                    homeos_homeos-secrets     （主应用）
#                    homeos-store_homeos-store-data    （商店）
#                    homeos-store_homeos-license-keys  （授权私钥）
#                    homeos-client-keys           （共享公钥，--role all 用）
#       GHCR 私有包：docker login ghcr.io
#
# [ ] 9. 升级
#       不要删 volume
#       先中心商店、后客户机；中心与所有客户机用同一个 tag（deploy.sh 会把它写进 .env）
#       ops/deploy/upgrade.sh --role store --version <tag>     # 厂商机
#       ops/deploy/upgrade.sh --role app   --version <tag>     # 每台客户机
#       完整清单、通知模板与回滚见 ops/deploy/UPGRADE.md
#
# 中心 + 客户机分开部署：厂商机跑一次 --role store，每台客户机各跑一次
# --role app --license-server <中心商店地址>。
# 客户机侧的公钥是自动的：启动时向中心商店的 GET /v2/keys 取回并缓存到数据卷，
# 中心轮换密钥也无需人工搬运。
# 手工投放仅在离线盘点/恢复数据卷时需要：把两个 PEM 放进 APP_CLIENT_KEYS_DIR 并设 APP_CLIENT_KEYS_FETCH=off。
# 其余人工项（商店地址、实例指纹、内网反代、公网接入）见 ops/deploy/SPLIT-DEPLOY.md
# 与 ops/deploy/PUBLIC-ACCESS.md。
