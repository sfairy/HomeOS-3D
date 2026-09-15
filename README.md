# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控平台，当前版本 **0.5.5**（见 `VERSION`）。

提供可视化编辑器、3D 户型工作室、全屏展示页和中控配对；后端是 FastAPI，前端是原生 HTML / CSS / JavaScript，数据默认落在本机 SQLite。

本仓库是可本地运行的源码树。**授权校验始终开启**，激活走仓库自带的自建授权商店与授权服务器（`store/`），不连接任何外部厂商节点。

## 功能

- 仪表盘编辑：页面、控件、实体绑定、弹窗、主题（默认 `ui.base`）
- 正式展示：`/display/{项目ID}` 或 `/habridge/{项目名称}` 打开全屏中控页
- 中控配对：6 位配对码，适合墙面平板或独立浏览器
- 3D 户型：建模、导入、按楼层或全楼自动导图并回写到仪表盘；灯光按「区域」归类，墙体与灯光属性可批量应用
- 3D 交互：仪表盘控件嵌入户型舞台；从工作室草稿快照场景，在舞台里开关已绑定的灯、开关、窗帘、空调、电视等；展示页用 iframe 打开同一舞台
- Home Assistant：HTTP / WebSocket 同步实体与状态，代理摄像头和媒体
- 全局日志：按级别、分类和关键词筛选，导出时遮盖敏感信息
- 授权商店：账号注册 / 登录、邮箱验证码、商品与优惠码、邀请返利与提现、订单查询、设备自助解绑
- 授权服务器：Ed25519 签名租约 + X25519 加密传输，心跳续租与启动联网确认
- 运营后台：`/admin` 管理商品、订单、授权、绑定、优惠码、提现、站点配置、版本与审计日志

## 组件

仓库根目录下同时运行两个服务，二者共享 `.venv-store` 虚拟环境：

```text
HomeOS/app
├── backend + frontend        主应用         http://127.0.0.1:18081
└── store/                    授权商店与授权服务器  http://127.0.0.1:18082
```

### 主应用

`backend/app/`（FastAPI）+ `frontend/`（HTML / 原生 JS）。负责仪表盘编辑、展示、中控配对、Home Assistant 连接、3D 户型工作室与 3D 交互舞台。启动时自动执行 Alembic 迁移。

### 授权商店与授权服务器（`store/`）

一个独立的 FastAPI 应用，在 **18082** 端口同时提供三件事：

1. **授权商店**：页面与 `/store/v1/*` API 对齐 `https://pay.habridge.cn/`（账号、商品、订单、优惠码、邀请、账号中心），视觉为本项目自研的暗色 + 琥珀主题。2. **授权服务器**：`/v2/activate`、`/v2/heartbeat`、`/v2/recover`，签发 Ed25519 租约并使用 X25519 加密传输。
3. **运营后台**：`/admin` + `/store-admin/v1/*`（参考站没有公开管理台，为本项目自建）。

商店与授权服务器共用同一个 SQLite 库 —— 这正是「支付后自动发码并可立即激活」的原因。支付渠道默认 `mock`（本地收银台），可切换为支付宝当面付。完整说明见 [store/README.md](store/README.md)。

## 仓库结构

工程在仓库根目录，不再套一层 `app/`。

```text
HomeOS/app/
├── backend/app/            # FastAPI 应用（PYTHONPATH 指向这里）
│   ├── api/                # 认证、项目、HA、资源、UI Pack、3D、日志、图标、中控、更新
│   ├── ha/                 # HA 客户端、同步、状态推送
│   ├── panel/              # 仪表盘文档与校验
│   ├── modules/            # 增量能力（3D 交互）
│   ├── license/            # 客户端授权：租约验签、心跳、能力门禁
│   └── main.py
├── frontend/               # 页面与静态资源
│   ├── *.html              # index / display / license / login / pair / setup / 3d-studio
│   ├── NAMING.md           # 前端标识符命名规范
│   ├── modules/            # 3D 交互舞台与配置编辑器（经 /api/v1/modules/interaction3d 下发）
│   └── static/             # 挂载为 /static
│       ├── *.js / *.css    # 入口脚本与样式（扁平目录）
│       ├── renderer/       # 仪表盘运行时
│       ├── 3d-studio/      # 户型工作室
│       ├── modules/        # 3D 交互编辑器桥接、封面、定义
│       ├── utils/          # 户型工作室与 3D 交互共用工具
│       ├── templates/      # 控件模板
│       ├── ui-packs/       # UI Pack 资源
│       ├── component-thumbnails/  audio/  vendor/（three.js、hls.js、MDI）
├── store/                  # 授权商店 + 授权服务器 + 运营后台
│   ├── app.py run.py config.py models.py schemas.py serializers.py
│   ├── api/                # store.py(/store/v1) license.py(/v2) admin.py alipay.py pages.py
│   ├── licensing/          # 服务端传输加密 + 租约签发 + 三端点业务
│   ├── payments/           # base / mock / alipay（签名·下单·验签·查单）/ 统一入账
│   ├── fulfill.py referrals.py site_settings.py mailer.py security.py
│   ├── templates/          # store.html（前台 8 个分页）+ admin.html（后台 11 个 panel）
│   ├── static/             # theme.css（唯一设计系统）+ store.css / admin.css（页面布局）+ 字体·图标·jQuery·JS
│   ├── tools/              # gen_keys / seed / smoke / e2e
│   ├── keys/local/         # 授权私钥（不入库）
│   └── data/               # 商店 SQLite 与商品图（不入库）
├── keys/                   # 客户端默认读取的公钥镜像（由 gen_keys 自动同步）
├── migrations/             # Alembic 迁移 0001–0014
├── image/v1/               # 内置素材与示例户型图
├── dashboard_templates/    # 内置仪表盘模板
├── tools/                  # bump_static_cache_versions.mjs（静态资源 ?v=）
├── data/                   # 主应用运行时数据（不入库）
├── .env.example            # 本地密钥与配置模板（复制为 .env）
├── alembic.ini  VERSION  start.py  container_entrypoint.py
├── release-manifest.json  sbom.cdx.json
└── .prettierrc.json  .prettierignore
```

不要删除 `frontend/`。内置素材目录 `image/` 可自行增删，编辑器里也可改用用户上传图片。

以下内容已写入 `.gitignore`：`data/`、`store/data/`、`store/keys/`、`.env*`、`.venv-store/`、`*.pem.key`。

## 环境

- Python 3.11+（本地已在 3.14 验证）
- 本机同时跑两个进程：主应用 **18081**、授权商店 **18082**
- 连接 Home Assistant 时，主应用需要能访问 HA 的 HTTP 与 WebSocket

依赖见 [store/requirements.txt](store/requirements.txt)：FastAPI、Uvicorn、SQLAlchemy、Pydantic、httpx、cryptography、Jinja2、python-multipart。主应用与商店共用同一份依赖。

其中 `watchfiles` 只服务本地热重载：`start.py` 会给商店设 `STORE_RELOAD=1`，`store/run.py` 据此以 uvicorn reload 模式启动并监听 `store/` 目录。缺这个包时商店不会跟随 `store/api/*.py` 的改动重启，改了模块级常量（例如模拟收银台的内联 HTML 与静态资源版本戳）就必须手动重启才能生效。

## 本地启动

仓库根目录一条命令：

```bash
python3 start.py
```

`start.py` 会：

1. 缺失时创建 `.venv-store` 并按 `store/requirements.txt` 安装依赖；
2. 读取根目录 `.env`（已存在的真实环境变量优先）；
3. 依次拉起授权商店 **18082** 与主应用 **18081**（主应用带 `--reload`）。

首次启动前，建议先把商店的密钥与初始数据准备好：

```bash
# 生成授权密钥；公钥会自动镜像到仓库根 keys/（客户端信任锚）
.venv-store/bin/python -m store.tools.gen_keys

# 初始化管理员、3 条商品（基础 / 3D 交互包 / 套餐）与版本记录
.venv-store/bin/python -m store.tools.seed
```

> 公钥镜像 `keys/` 与 `store/keys/local/` 必须**逐字节一致**：客户端按 PEM 文件字节校验 sha256。若直接跳过 `gen_keys`，`store/` 首次启动会自动生成私钥，但**不会**更新 `keys/` 镜像，激活会因指纹不匹配而失败。

主应用打开 <http://127.0.0.1:18081/setup>，商店打开 <http://127.0.0.1:18082/>。

数据库迁移在主应用启动时自动执行。需要手工升级时：

```bash
APP_DATA_DIR=./data PYTHONPATH=backend/app alembic upgrade head
```

## 首次使用

1. 打开 `/setup`，创建管理员（用户名 3–64 个字符，密码至少 8 位）。
2. 打开 <http://127.0.0.1:18082/>，注册商店账号（本地联调默认 `STORE_MAIL_MODE=echo`，验证码直接回显），选择商品并用模拟收银台完成支付，账号中心会发放激活码。
3. 回到主应用登录后进入 `/license`，用「激活码 + 购买邮箱」激活。未激活时编辑器会跳到 `/license`，展示页和受保护静态资源返回 401 / 403。
4. 在编辑器里配置 Home Assistant 的地址和长期访问令牌，然后创建空白仪表盘。
5. 使用 3D 交互：先在 `/3d-studio` 保存户型，再在编辑器添加「3D 交互」控件并载入户型快照，绑定 `light.*` / `switch.*` 等实体后即可在舞台里控制。
6. 墙面中控：在编辑器生成 6 位配对码，设备打开 `/pair` 完成配对。

未初始化时任意页面都会跳到 `/setup`。

忘记主应用管理员账号或密码：停掉进程，删除 `data/admin-account.json` 再启动，系统回到设置页。户型、HA 配置、授权和中控配对不会被删。

## 授权体系

### 零配置指向自建授权服务器

客户端默认值写在 `backend/app/config.py`：端点 `http://127.0.0.1:18082`、密钥 id `hb-local-2026` / `hb-local-transport-2026`、公钥镜像 `keys/` 及其 sha256。**不设任何环境变量**，起服务后即可在 `/license` 激活。厂商生产节点与生产公钥已从代码中彻底移除，`store.tools.smoke` 用断言锁住「零配置指向自建」与「生产残留为零」。

整个体系是「服务端签发 Ed25519 签名租约 → 客户端离线验签 → 定期心跳续租」：租约 7 天有效，客户端每 300 秒续租一次；传输层为 X25519 ECDH → HKDF-SHA256 → AES-256-GCM，端点路径本身也参与派生与认证。

需要把授权服务器部署到别处时才用环境变量覆盖，例如：

```bash
export APP_LICENSE_SERVER_URL=https://license.example.com
export APP_LICENSE_KEY_ID=hb-local-2026
export APP_LICENSE_PUBLIC_KEY_FILE=/path/to/license-public.pem
export APP_LICENSE_PUBLIC_KEY_SHA256=<gen_keys 打印的签名公钥 sha256>
export APP_LICENSE_TRANSPORT_KEY_ID=hb-local-transport-2026
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE=/path/to/license-transport-public.pem
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256=<gen_keys 打印的传输公钥 sha256>
```

- 只设 `APP_LICENSE_SERVER_URL` 时，客户端会把批次收敛为单条 `direct`，不会散到其它节点。
- 需要多批次时用 `APP_LICENSE_SERVER_BATCHES='esa=;eo=;direct=http://127.0.0.1:18082|http://127.0.0.1:18083'`（`;` 分隔批次，`|` 分隔组内地址，空组表示禁用）。
- `APP_LICENSE_TRUSTED_PUBLIC_KEYS='keyId:公钥路径:sha256|keyId2:路径:sha256'` 可整体替换可信公钥表。

### 能力码

租约携带的能力码决定主应用各部分是否可用（`LicenseService.allows`）：

`api`、`assets`、`editor`、`display`、`ha.sync`、`ha.configure`、`ha.control`、`projects.write`、`runtime.websocket`、`ui.base`、`module.3d_interaction`。

`store.tools.seed` 写入的三条商品与能力码对应关系：

| 商品 | 类型 | 能力码 |
| --- | --- | --- |
| 编辑器+栖光UI+绘制工具 | `base` | 上表除 `module.3d_interaction` 外的全部 |
| 3D交互包 | `module` | `module.3d_interaction` |
| 编辑器+栖光UI+绘制工具+3D交互 | `package` | 基础能力 + `module.3d_interaction` |

### 重启时的联网确认

客户端启动时会先做一次 `recover` 联网确认，失败按性质分流：

- **确认吊销**（403 命中吊销短语）→ 保持拦截，清空本地授权，状态 `REVOKED`。
- **其余失败**（网络不可达、服务端 5xx）→ 不锁死：租约未过期则 `CONNECTION_WARNING`（门禁放行），已过期则 `LEASE_EXPIRED`（拦截）。

心跳循环持续重试，服务器恢复后自动续租回到 `ACTIVE`。

### 吊销语义（客户端契约）

运营后台「停用设备绑定 / 停用授权」后，端点返回 `403 {"detail": "..."}`，文案必须命中以下之一，客户端才判定为确认吊销并清空本地授权：

`实例绑定已停用`、`客户授权或激活码已停用`、`客户、激活码或实例绑定已停用`、`商品授权有效期已结束`。

其余 401/403 视为瞬时故障（保留本地授权继续重试）。改文案前先看 `backend/app/license/service.py` 的 `is_confirmed_revocation`。

## 3D 户型工作室

打开 `/3d-studio`。左侧是模型库与检查器，右侧是平面图画布。工作室只编辑草稿，不会直接改动仪表盘；户型和场景要另外导出，或生成 3D 交互快照后供仪表盘与展示页使用。

### 平面图工具

画布上方工具栏提供以下工具，悬停会显示对应提示：

| 工具 | 说明 |
| --- | --- |
| 选择 | 单击精确选择，空白处拖拽框选；移动时 `Shift` 锁轴，缩放时 `Shift` 等比例，`Option`/`Alt` 拖动复制，`⌘`/`Ctrl+C`、`V` 复制粘贴 |
| 平移 | 按住左键拖动平移画布 |
| 参考线 | 依次单击两个端点，用于确定真实比例；按住 `Shift` 强制锁定水平或垂直轴线 |
| 墙体 | 逐点绘制并回到起点闭合空间；未闭合不会生成地面，按住 `Shift` 锁轴，`Esc` 结束 |
| 窗户 | 靠近墙体单击，窗户自动吸附并生成真实窗洞 |
| 门 | 靠近墙体单击，门自动吸附并生成门洞；选中后可翻转开启方向 |
| 栏杆 | 靠近墙体单击，玻璃栏杆吸附到墙段并替换对应的实体墙 |
| 铭牌 | 单击画布放置户型铭牌；选中后可修改文字、拖动、缩放和旋转 |
| 楼板洞口 | 位于工具栏右侧，拖出矩形洞口；仅切除当前层楼板 |

「平移」只改变画布视角，不修改户型，因此既不写入草稿也不会进入撤销栈。它与既有操作共用同一套平移逻辑：滚轮缩放、中键拖动、按住空格拖动在任何工具下都可用。

切到「灯光」分类后户型会锁定，只能使用「选择」工具，点击其他工具会提示先切回家居或电器，避免在灯光编辑中误改墙体。

### 灯光区域与灯组

「灯光」分类下会出现图层面板，顶部有三个操作：`全关`、`新建区域`、`新建灯组`。

- **区域**用于按房间或空间给灯组分类，只有名称（最长 16 字，同层不可重名），可随时重命名或删除。
- **灯组**包含名称（最长 24 字）、启用状态和所属区域。未归入任何区域的灯组显示为「未分类」。
- **拖入区域**：直接拖动灯组行到目标区域标题上即可移入，标题会高亮提示；拖到另一个灯组行上则是在区域内调整顺序。
- **右键菜单**：灯组行右键可选 `设置区域` / `重命名` / `复制灯组` / `删除`；区域标题右键可选 `重命名区域` / `删除区域`。`设置区域` 弹窗里除了选择已有区域，也可以直接输入新名称就地新建区域，选「未分类」则移出区域。
- **删除区域不会删除灯组**，组内灯组会回到「未分类」。

面板本身是一棵两级树：区域 → 区域内灯组。区域标题带折叠箭头和成员数量，未分类的灯组排在最外层，空区域显示「暂无灯组」。区域和归属按楼层保存，展开／收起状态只在当前会话内有效。

### 模型库：壁画、背景墙与柱子

| 模型 | 分类 | 默认尺寸 | 可选样式 |
| --- | --- | --- | --- |
| 壁画 | 客厅常用 | 1.20 × 0.80 m，离地 0.90 m | 画面风格：包豪斯几何、柔和色域、极简线条、硬边色块、水墨意象、水磨石纹 |
| 背景墙 | 客厅常用 | 3.00 × 2.40 m | 墙面材质：大理石、木纹、格栅条、岩板、微水泥、布纹、金属拉丝 |

两者都由程序化生成（画布纹理加几何体），不依赖外部模型文件，因此不会出现模型加载失败。背景墙的「格栅条」样式会额外出真实 3D 格栅。

柱子位于「结构与特殊物件」分类，默认 0.45 × 0.45 m：

- **形状**：方形、圆形、半圆形、1/4 圆形、1/4 圆形（内弧）。
- **布置方向**：垂直（站立）或水平（躺放）。躺放时平面占位改为「宽 × 长」，平面符号改用内轮廓表示，3D 中绕轴旋转 90° 后重新贴地，检查器里的「高（m）」相应改名为「长（m）」。
- **轻量 GLB**：非方形柱子使用轻量模型 `pillar-*-lite.glb`，加载失败时自动回退到完整模型；方形柱子回退到程序化几何体。轻量与完整的选择是自动的，界面没有开关。

### 墙体属性与「应用到所有」

选中墙体后，检查器里每一项都可以单独修改，其中四项各自带一个 `应用到所有` 按钮：

| 字段 | 取值范围 | 说明 |
| --- | --- | --- |
| 墙长 | 只读 | 由两端点决定 |
| 墙高（m） | 0.01–6 | 同时成为本层新画墙体的默认值 |
| 厚度（m） | 0.01–3 | 同时成为本层新画墙体的默认值 |
| 透明度设置 | 跟随通用 / 单独设置 | 选择「跟随通用」即清除该墙的单独设置 |
| 透明度（%） | 0–100 | 仅在「单独设置」下生效 |
| 开放端点提醒 | 自动判断 / 允许开放端点 | — |

点击 `应用到所有` 会打开「应用墙体属性」弹窗（`APPLY TO WALLS`）：上方显示将要应用的值，下方是带复选框的墙体列表，每行标注该墙的当前值，当前选中的那面墙会标出「当前墙」；可以 `全选` / `取消全选`，确认按钮为 `应用所选`。

- 作用范围是**当前楼层**，不会影响其他楼层。
- 只改所选的这一项属性，其他属性保持不变。
- 整批应用只产生一次撤销快照。
- 应用墙高 / 厚度时，本层的默认墙高 / 墙厚也会同步更新，之后新画的墙会继承新值。

灯光的色温、亮度、照射范围、照射角度、离地使用同一套批量入口。此外，左侧顶部的「墙体」卡片（高 / 厚 / 透明度）是另一种更直接的方式：它不弹选择框，会直接覆盖当前楼层的所有墙体。

### 草稿保存

编辑是自动保存的：停止操作约 650 ms 后写入草稿，状态依次为「有未保存修改」、「正在保存…」、「已自动保存」，失败会提示 `3D 草稿保存失败。`。草稿落在 `data/studio3d/draft.json`。

如果同一份草稿已在另一个页面被修改，会弹出版本冲突提示（「其他页面已经修改了户型」），此时自动保存暂停，需要选择 `加载服务器版本` 或 `使用当前页面覆盖`。

## 页面与接口

### 主应用（18081）

| 路径 | 说明 |
| --- | --- |
| `/setup` | 首次安装或重置管理员 |
| `/login` | 管理员登录 |
| `/license` | 用激活码 + 购买邮箱激活 |
| `/` | 仪表盘编辑器 |
| `/3d-studio` | 3D 户型工作室（`/projects/{id}/3d-studio` 308 重定向到此） |
| `/pair` | 中控设备配对 |
| `/display/{project_id}` | 按项目 ID 打开展示页 |
| `/habridge/{project_name}` | 按项目名称打开展示页 |
| `/health/live` · `/health/ready` | 进程存活 · 数据库就绪 |
| `/api/v1/auth/*` | 初始化、登录、登出、当前用户 |
| `/api/v1/projects/*` | 仪表盘项目与草稿（`projects.write`） |
| `/api/v1/ha/*` | HA 连接、实体、翻译、历史、区域、设备、同步、健康、服务调用、媒体浏览 |
| `/api/v1/ha/*` 子集 | `ha.configure` / `ha.sync` / `ha.control` 分别门禁 |
| `/api/v1/displays/*` | 中控设备与配对码 |
| `/api/v1/assets/*` | 内置素材、用户图片、UI Pack、灯光效果变体、户型导出 |
| `/api/v1/ui-packs/*` | UI Pack 列表与运行时脚本 |
| `/api/v1/icons` | 图标目录 |
| `/api/v1/studio3d/*` | 3D 草稿与导出 |
| `/api/v1/modules/interaction3d/*` | 3D 交互：场景快照、舞台页、灯光缓存、配置编辑脚本 |
| `/api/v1/logs` | 全局日志（列表、导出、上报、清空） |
| `/api/v1/license/status` · `/api/v1/license/activate` | 授权状态与激活 |
| `/api/v1/updates` | 版本更新检查 |
| `/api/v1/ws/runtime` | 实时状态 WebSocket（需 `runtime.websocket`） |
| `/api/camera_hls/*`、`/api/camera_proxy/*`、`/api/hls/*` 等 | 摄像头与媒体代理（反向代理需一并转发） |
| `/static/*` | 前端静态资源（静态目录扁平：`/static/home.js`、`/static/app.css`） |
| `/assets/builtin/*` | 需登录或已配对，且授权允许 `assets` |
| `/component-lab`、`/template-assets/*` | 有意保留的 404 占位路由 |

登录、设置、配对、授权页的脚本和样式可匿名访问。编辑器、展示页、3D 工作室和大部分静态资源需要登录或已配对，并且当前授权允许对应能力。

### 授权商店与授权服务器（18082）

| 路径 | 说明 |
| --- | --- |
| `/` · `/products` · `/item/{product_id}` | 商店首页、商品列表、商品详情 |
| `/user/authentication/login` · `register` · `forget` | 登录、注册、找回密码 |
| `/user/dashboard/index` · `/user/index/query` · `/user/referrals` | 账号中心、订单查询、邀请返利 |
| `/admin` | 运营后台 |
| `/store/v1/*` | 商店 API：验证码、账号、商品、订单、优惠码、邀请、提现 |
| `/v2/activate` · `/v2/heartbeat` · `/v2/recover` | 授权服务器端点（加密封套） |
| `/store-admin/v1/*` | 运营后台 API |
| `/store/v1/payments/alipay/notify` · `/store/payment/return` | 支付宝异步通知与同步跳转 |
| `/store/mock/pay/{order_no}` | 模拟收银台（仅 `mock` 渠道） |
| `/store-static/*` · `/fonts/*` | 商店静态资源与图标字体 |
| `/healthz` · `/store-api-docs` | 存活检查 · OpenAPI 文档 |

## 运行时数据

`APP_DATA_DIR` 默认是仓库下的 `data/`。

| 路径 | 说明 |
| --- | --- |
| `app.db` | 主应用 SQLite 主库 |
| `admin-account.json` | 独立管理员账号 |
| `instance-id` | 安装 UUID |
| `hardware-fallback-id` | 硬件指纹回退标识 |
| `secrets/` | HA、配对、授权密钥 |
| `assets/` | 用户上传图片 |
| `studio3d/` | 3D 草稿 |
| `modules/interaction3d/` | 3D 交互场景快照与灯光渲染缓存 |
| `exports/` | 3D 导出 |
| `logs/` | 全局事件日志 |
| `cache/effect-variants/` | 灯光效果变体缓存 |
| `upgrade-backups/` | 升级前数据库备份 |

授权商店数据在 `store/data/`：`store.db` 与商品图。授权私钥在 `store/keys/local/`。**不要提交这些文件。**

## 环境变量

主应用与商店的变量可以统一写进仓库根目录的 `.env`（见 [.env.example](.env.example)，已 gitignore）。优先级：**真实环境变量 > `.env` > 代码 / `start.py` 默认值**。

### 主应用

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_DATA_DIR` | `<仓库>/data` | 运行时数据目录 |
| `APP_BASE_URL` | 空 | 对外访问根地址；反代时建议设置，供 WebSocket 校验 Origin |
| `APP_PORT` | `18081` | 容器监听端口 |
| `APP_SESSION_MAX_AGE_SECONDS` | `28800` | 登录会话时长 |
| `APP_COOKIE_SECURE` | `false` | HTTPS 下设为 `true` |
| `APP_UPDATE_CHANNEL` | `docker` | 更新检查渠道 |
| `APP_HA_REQUEST_TIMEOUT_SECONDS` | `10` | 调用 HA 的超时 |
| `APP_HA_RECONCILE_INTERVAL_SECONDS` | `1800` | HA 全量对账间隔 |
| `APP_HA_WEBSOCKET_MAX_SIZE_BYTES` | `67108864` | HA WebSocket 最大消息 |
| `APP_LICENSE_SERVER_URL` | `http://127.0.0.1:18082` | 授权服务器地址 |
| `APP_LICENSE_SERVER_BATCHES` | 单条 `direct` | 多批次授权服务器覆盖项 |
| `APP_LICENSE_REQUEST_TIMEOUT_SECONDS` | `10` | 授权请求超时 |
| `APP_LICENSE_KEY_ID` | `hb-local-2026` | 签名公钥的 keyId |
| `APP_LICENSE_PUBLIC_KEY_FILE` · `_SHA256` | 仓库 `keys/` | 签名公钥路径与文件字节 sha256 |
| `APP_LICENSE_TRANSPORT_KEY_ID` | `hb-local-transport-2026` | 传输公钥的 keyId |
| `APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE` · `_SHA256` | 仓库 `keys/` | 传输公钥路径与 sha256 |
| `APP_HA_CREDENTIAL_FILE` | 数据目录内默认路径 | HA 凭据密钥文件 |
| `APP_DISPLAY_PAIRING_KEY_FILE` | 数据目录内默认路径 | 中控配对密钥文件 |
| `APP_LICENSE_CREDENTIAL_FILE` | 数据目录内默认路径 | 授权密钥文件 |

授权校验始终开启（`license_required=True`），不能通过环境变量关闭。激活只连接自建授权服务器。

### 授权商店（`store/`）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `STORE_HOST` / `STORE_PORT` | `0.0.0.0` / `18082` | 监听地址（`start.py` 下为 `127.0.0.1`） |
| `STORE_DATA_DIR` | `store/data` | SQLite 与商品图目录 |
| `STORE_BASE_URL` | 由请求推导 | 生成支付二维码、回调链接用的外部基址 |
| `STORE_LICENSE_KEYS_DIR` | `store/keys/local` | 授权密钥目录 |
| `STORE_MAIL_MODE` | `log`（`start.py` 下为 `echo`） | `log` \| `echo` \| `smtp` |
| `STORE_EXPOSE_VERIFICATION_CODE` | `false` | 是否在接口响应回显验证码（生产必须 false） |
| `STORE_SMTP_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_USE_SSL` / `_STARTTLS` | — | SMTP 发信（`_PASSWORD` 填授权码） |
| `STORE_PAYMENT_PROVIDER` | `mock` | `mock` \| `alipay`（后台站点配置优先） |
| `STORE_ALIPAY_*` | — | APPID、密钥路径 / 内联、网关、卖家号、回调地址等 |
| `STORE_LEASE_TTL_SECONDS` | `604800` | 租约有效期（7 天） |
| `STORE_HEARTBEAT_INTERVAL_SECONDS` | `300` | 下发给客户端的 `heartbeatIn` |
| `STORE_ORDER_TTL_SECONDS` | `120` | 订单有效期（真实收款必须调大） |
| `STORE_DEVICE_RELEASE_COOLDOWN_SECONDS` | `28800` | 自助解绑冷却（8 小时） |
| `STORE_VERIFICATION_TTL_SECONDS` / `_COOLDOWN_SECONDS` | `600` / `60` | 验证码有效期 / 重发冷却 |
| `STORE_SESSION_MAX_AGE_SECONDS` | `2592000` | 商店会话有效期 |
| `STORE_ADMIN_EMAIL` / `STORE_ADMIN_PASSWORD` | 代码内置开发默认值 | `seed` 初始化管理员（生产务必覆盖） |

站点名、公告、客服邮箱、维护模式、邀请比例、提现手续费、解绑冷却等**运行时配置**存在数据库里，直接在 `/admin` 的「站点配置」里改，不需要重启。支付渠道是「后台站点配置优先于 `.env`」。完整的商店变量、支付宝接入步骤与排障表见 [store/README.md](store/README.md)。

## Docker

官方镜像监听 **18081**，数据和密钥分卷挂载。容器启动后访问 `http://<主机>:18081/setup`。容器内默认路径：

| 用途 | 路径 |
| --- | --- |
| 数据目录 | `/data` |
| HA 凭据密钥 | `/run/secrets/ha_credentials.key` |
| 中控配对密钥 | `/run/secrets/display_pairing_codes.key` |
| 授权密钥 | `/run/secrets/license_credentials.key` |

`container_entrypoint.py` 在 root 启动时校正目录属主，再降权为 `homeos` 用户运行。

反向代理请转发 WebSocket（`/api/v1/ws/runtime`）以及 `/api/hls/`、`/api/camera_proxy/` 等媒体路径。站点走 HTTPS 时设置 `APP_COOKIE_SECURE=true`。

升级时不要清空 `/data`。应用会在迁移前备份数据库，失败则回滚。

从运行中的容器导出应用目录：

```bash
docker exec homeos tar -czf /tmp/app.tar.gz -C /app .
docker cp homeos:/tmp/app.tar.gz ~/Desktop/
docker exec homeos rm /tmp/app.tar.gz
```

## 开发工具

改 JS / CSS / HTML 后统一 bump 静态资源缓存戳：

```bash
node tools/bump_static_cache_versions.mjs
```

前端标识符约定见 [frontend/NAMING.md](frontend/NAMING.md)。

## 开发注意

- 静态资源缓存标记统一为 `?v=YYYYMMDDHHMMSS`（14 位本地时间，例如 `?v=20260915103715`），不要再拼接 feature-label 长串。改 JS / CSS / HTML 后执行 `node tools/bump_static_cache_versions.mjs` 全局同戳 bump；`home.js` 与 `renderer.js` 必须使用同一条 `registry.js?v=`，否则会出现两份控件注册表。
- 前端 JS / CSS / HTML 遵循 [.prettierrc.json](.prettierrc.json)（`printWidth=100`，HTML 为 120）。`frontend/static/vendor/` 不参与格式化。
- 不要改 `frontend/static/vendor/` 下的 three.js、hls.js、OrbitControls 等第三方文件。
- 界面中文文案保持原词；缓存戳改动请用 `tools/bump_static_cache_versions.mjs`。
- 静态资源是扁平目录：`/static/home.js`、`/static/app.css`；子目录为 `renderer/`、`3d-studio/`、`modules/`、`utils/`、`templates/`、`ui-packs/`、`component-thumbnails/`、`audio/`、`vendor/`。
- `migrations/env.py` 必须从 `backend/app` 导入 `database` 和 `models`（`from backend.app.database import Base`），不要写成相对导入，否则会重复注册表。
- 3D 交互舞台脚本由 `/api/v1/modules/interaction3d/{filename}` 下发，需要已登录或已配对，且当前授权允许编辑器或 `module.3d_interaction`。
- 商店的样式只有一层设计系统：`theme.css`（令牌 + 组件）必须排在任何页面样式表之前，令牌值与 `frontend/static/app.css` 对齐（`smoke.py` 会比对，主程序改色而商店没跟就会 FAIL）。详见 [store/README.md](store/README.md) 的「界面主题」。
- 改动商店授权端点错误文案前，先核对客户端 `is_confirmed_revocation` 的吊销短语表。

## 更新日志

### v0.5.5

品牌

- 品牌统一更名为 **HomeOS**：全部 36 个图标资产由 `ha-bridge-*` 改名为 `homeos-*`，矢量源改为方形画布（房子满宽满高），对应 CSS 盒子同步为正方形。
- 启动时自愈库内遗留数据：`store_settings.logo_url` 的旧图标路径、`releases.product` 与 `products.product_code` 的旧品牌标识都会自动归一。

破坏性变更

- 授权传输协议标识与产品标识改名（`ha-bridge-license-transport-v1` → `homeos-license-transport-v1`，`PRODUCT` → `homeos`）。两者参与 HKDF / AES-GCM AAD，服务端只认新标识：**必须先升级客户端、再升级服务端**，老客户端会在解密阶段直接失败、没有降级路径。升级顺序与影响已写进 0.5.5 的 `upgrade_notes`，客户端「检查更新」可见。

修复

- 库存口径：发码时扣减 `stock_quantity`（`fulfill.consume_stock`），退款「已支付未发码」订单时释放 `reserved_stock` —— 此前限量商品履约后可用量会「长」回来，同一件库存能反复卖出。
- 订单终态保护：`cancelled` / `expired` / `refunded` 订单不再能被标记支付或履约（此前可凭空发码）。
- 优惠码名额：取消与退款会归还名额；「每人限用」只统计仍占用名额的订单 —— 此前一单被取消，用户就永久失去该优惠码。
- 后台时间：一律按浏览器本地时区显示与录入，提交时转成 UTC 入库 —— 此前手填的时间在 `Asia/Shanghai` 下会整体偏 8 小时。
- 手动履约商品（`fulfillment_mode=manual`）被后台「标记支付」时只入账、不发码，与真实支付宝到账路径语义一致。

数据可维护性

- 后台补齐写入口：商品全部运营字段与商品图上传、优惠码全字段编辑、账号邮箱/密码/启停/管理员、授权有效期修正、权益与积分调账、版本记录修正。
- 后台新增只读入口：客户端会话、找回令牌、积分流水、核销记录、客户档案、诊断数据（登录会话/登录尝试/邮箱验证码/解绑事件）。
- 新增维护动作：登录会话单条踢下线、客户端会话与找回令牌撤销、按安全谓词清理日志（只清过期或已消费记录）、优惠码核销记录单条作废并重算占用名额。
- 诊断类列表统一支持 `limit/offset/total` 翻页；管理接口的请求体改为拒绝未知字段（`extra="forbid"`），不再静默丢弃后台表单里的改动。

### v0.5.5

新增

- 仓库自带完整的**授权商店 + 授权服务器 + 运营后台**（`store/`），取代原 `register/` 本机店：
    - 商店前台与 `pay.habridge.cn` 对齐页面结构与 `/store/v1/*` 契约：账号注册 / 登录 / 找回密码、邮箱验证码、商品列表与详情、优惠码、订单查询与归档、邀请返利与提现、账号中心与设备自助解绑；视觉为本项目自研的暗色 + 琥珀主题。
    - 授权服务器提供 `/v2/activate`、`/v2/heartbeat`、`/v2/recover`：Ed25519 签名租约、X25519 + HKDF-SHA256 + AES-256-GCM 加密传输，租约 7 天、心跳 300 秒续租。
    - 运营后台 `/admin` + `/store-admin/v1/*`：概览、商品、订单、授权、设备绑定、优惠码、提现审核、账号、站点配置、版本发布与审计日志；暗色 + 琥珀统一主题。
    - 支付渠道 `mock`（本地收银台）与 `alipay`（当面付扫码）可切换；异步通知验签 + 主动查单兜底，统一入账且重复通知只发一次码。
- 客户端默认零配置指向自建授权服务器（`backend/app/config.py` 内置端点、keyId 与公钥 sha256），厂商生产节点与生产公钥已彻底移除。
- 仓库根 `keys/` 作为客户端信任锚公钥镜像，由 `store.tools.gen_keys` 从 `store/keys/local/` 自动同步，二者逐字节一致。
- 新增 `.env` / `.env.example` 本地配置（SMTP 授权码、支付宝私钥等不进版本库）与 `store/env.py` 极简加载器。
- 新增 `tools/bump_static_cache_versions.mjs`（统一静态资源 `?v=YYYYMMDDHHMMSS`）。
- 新增 [frontend/NAMING.md](frontend/NAMING.md) 前端命名规范。
- 新增 `release-manifest.json`、`sbom.cdx.json`、`.prettierrc.json` / `.prettierignore`。

优化

- 后端与前端源码可读性与命名规范化；Alembic 迁移为 `migrations/` 下 14 个真实脚本（`0001 → 0014`）。
- 依赖收敛到 `store/requirements.txt`，主应用与商店共用一个虚拟环境 `.venv-store`。

说明

- 授权校验始终开启，激活只连接自建授权服务器，不接入官方授权云。
- 功能面与 0.5.2.1 保持一致，主要差异在授权体系。

### v0.5.2.1

新增

- 3D 工作室灯光「区域」：灯光分类下新增图层面板，可 `新建区域` 并按房间或空间归类灯组。
    - 灯组行支持拖拽：拖到区域标题上即移入该区域，拖到另一个灯组行上则在区域内调整顺序。
    - 右键灯组可 `设置区域`，可选择已有区域、就地新建，或选「未分类」移出区域；右键区域标题可 `重命名区域` / `删除区域`。
    - 面板按「区域 → 灯组」两级展示，区域标题带折叠箭头与成员数量；删除区域不会删除灯组，组内灯组回到「未分类」。
    - 区域与归属按楼层保存，加载时非法归属会自动回落到「未分类」。
- 模型库新增壁画与背景墙：壁画提供 6 种画面风格（包豪斯几何、柔和色域、极简线条、硬边色块、水墨意象、水磨石纹），背景墙提供 7 种墙面材质（大理石、木纹、格栅条、岩板、微水泥、布纹、金属拉丝）。两者均为程序化生成，不依赖外部模型文件；背景墙的「格栅条」会额外出真实 3D 格栅。
- 柱子支持多种截面形状与立 / 卧布置：形状可选方形、圆形、半圆形、1/4 圆形、1/4 圆形（内弧）；`布置方向` 可选垂直（站立）或水平（躺放）。躺放时平面占位改为「宽 × 长」、平面符号改用内轮廓、3D 姿态旋转 90° 后重新贴地，检查器的「高（m）」相应变为「长（m）」。
    - 非方形柱子附带轻量 GLB（`pillar-*-lite.glb`），加载失败时自动回退到完整模型；方形柱子回退到程序化几何体，界面无需手动切换。
- 平面图新增「平移」工具：按住左键拖动即可平移画布。它只改变画布视角，不修改户型，也不触发保存与撤销；滚轮缩放、中键拖动与按住空格拖动仍然可用。
- 墙高、厚度、透明度支持「应用到所有」：选中墙体后，检查器的墙高 / 厚度 / 透明度设置 / 透明度各有 `应用到所有` 按钮，弹窗中可按复选框挑选目标墙体（默认全选，可 `全选` / `取消全选`），确认后一次应用所选。
    - 作用范围为当前楼层，仅修改这一项属性，整批应用只记一次撤销。
    - 应用墙高 / 厚度会同时更新本层默认值，之后新画的墙继承新值；透明度按单墙覆盖，选择「跟随通用」即清除覆盖。
    - 灯光的色温、亮度、照射范围、照射角度、离地采用同一套批量入口。

优化

- HA HTTP 客户端改为长生命周期 `AsyncClient`，复用连接池，减少重复握手。
- 全局日志改为后台写入线程，请求路径不再因刷盘阻塞事件循环。
- 仪表盘渲染侧裁剪灯光视觉缓存与自定义下拉残留，降低长时间运行的内存压力。
- 3D 工作室可读性重构：巨型家具 mesh 构建与世界预览拆解为 helper，清理占位符标识符。

修复

- 登录校验固定走一次 argon2 验证，避免用响应时间枚举用户名是否存在。
- 本机授权店按邮箱查询时返回脱敏激活码，不再直接回传完整码与订单号。
- 修复 3D 工作室改名遗留的悬挂引用（如窗帘绘制分支的 `helperFn`），消除加载与导图时的 `ReferenceError`。

说明

- 上述工作室功能的使用说明见 [3D 户型工作室](#3d-户型工作室)。

### v0.5.2

新增

- 展示页开屏：`display-boot.js` / `display-boot.css`，进入仪表盘前显示品牌 splash，等待首屏图片与 3D 资源就绪后淡出。
- 支持 `?capturePreview=1` 跳过开屏；加载失败可重试或「先进入仪表盘」。

修复

- 3D 空间 ALL 总览下，人体传感器等对象不再响应点击聚焦，统一禁用总览中的对象点击交互。
- 安防摄像头：补齐摄像头实体的状态订阅与聚焦判定，配置完成后状态与实际在线情况一致，不再误报离线；弹窗预览点击不再触发 `event.contains is not a function` 崩溃。
- 安防摄像头：对不支持原生 HLS 的摄像头（如 Frigate）自动回落到 MJPEG 代理流，`/api/camera_hls` 不再返回 502，画面直达无需先失败一次。
- 3D 工作室阴影图集：烘焙前补齐灯光 layer 与隐藏楼层组的可见性，避免合法灯光被渲染 pass 跳过；单盏灯无法生成阴影贴图时不再拖垮整张图集并回退到无阴影。
- 自动生成控件遇到同名文件夹时，确认弹窗可正常操作，支持选择覆盖、改名或不覆盖，保留原有生成流程。
- 3D 交互设备配置中，空列表提示不再挤压「添加设备」按钮，修复文字竖排和布局异常；补齐参考实现中紧凑列表的跨列与最小宽度样式（`.i3d-compact-list>.i3d-note`、`.i3d-compact-list>.i3d-config-list-row`）。
- 与 0.5.2 参考实现逐模块对齐：渲染缓存模块导出名统一为 `sha256`；外部家具模型的 `bed` 声明 `geometryRevision: 20260908-base-inset-v1`，与参考一致。
- 3D 交互组件缩略图改用 `<component-thumbnails>/interaction3d.jpg`，与组件库其余缩略图的 `.jpg` 命名保持一致。

说明

- 本版本以 0.5.2 参考实现对齐展示页开屏，并补齐上述 3D 修复。

### v0.5.1

新增

- 3D 安防：户型舞台支持摄像头与在场传感器标记，新增安防配置编辑器（`security-editor.js`），统一管理 `security.cameras` 与 `security.presenceSensors`。
- 新增摄像头状态组件（`camera-status.js`）与摄像头弹窗布局计算（`camera-popup-layout.js`）。
- 户型工作室新增安防模型（`studio-security-models.js`）、车漆材质（`studio-car-finish.js`）、动态演示（`studio-motion-presentation.js`）、墙面材质（`studio-wall-materials.js`）与窗户几何（`studio-window-geometry.js`）模块。
- 在场编辑器支持按楼层定位与聚焦（`security-focal`）、在场页面（`presence-pages`）与路线重绘，并新增地面世界波纹（`world-waves`）。
- 3D 配置编辑器统一设备设置版式（`unified-settings`）与工作区切换（`workspace-switch`）；展示页与仪表盘新增导航灯（`navigation-light`）与 3D 舞台保留（`stage-retain`）。
- 后端 3D 配置契约新增 `security.cameras` 校验（实体需匹配 `camera.*`，楼层不得为 `all`）。

说明

- 本版本以 0.5.1 参考实现对齐前后端功能，保留本仓库既有改造（静态目录、`help.html`、three.js 0.186.0、hls.js 1.7.2、端口 18081）。

### v0.5.0

新增

- 3D 交互扩展：空调、窗帘、电视、NAS、在场感应、扫地机地图等运行时面板与环境效果。
- 户型工作室：地面反射、楼层洞口/过渡、Plan2 区域光与接触阴影、反射细节与家具运行时模块。
- 栖光 UI Pack 预览轮播与仪表盘模板资源。
- meshoptimizer 轻量化支持（反射细节管线）。

优化

- 3D `/control` 按模型绑定与 HA 能力校验窗帘、空调、电视控制。
- 控件配置契约扩展环境、设备、反射、楼层与页面行为字段。

### v0.4.8

新增

- 3D 交互控件：从户型工作室草稿生成场景快照，仪表盘与展示页用 iframe 嵌入同一舞台；舞台内仅控制已绑定的灯和开关。
- 3D 灯光配置编辑器：绑定实体、灯光按钮、聚焦视角与进阶光照，图层 PNG 缓存走本机数据目录。
- 本机授权将 3D 交互计入基础能力。已开通编辑器的旧租约可直接使用；不接入官方授权云与商城付费墙。

### v0.4.6

新增

- 自动户型图支持选择全楼或指定楼层生成。
- 管理员账号改为独立存储，删除账号文件并重启后可重新设置账号密码，原有户型、HA 配置、授权及中控数据不受影响。

优化

- 优化 3D 灯光预加载，减少首次开灯时的卡顿。
- 完善全局日志、完整导出和故障诊断，问题排查更加准确。

修复

- 修复部分反向代理环境下 3D 家具和家电模型无法加载的问题。
- 修复全楼预览工具栏在较窄窗口中超出边界的问题。
- 修复空调和浴霸选项显示不合理的问题，可放下时显示按钮，放不下时自动使用下拉菜单。
- 修复户型外家具、汽车和灯具等物件导致 3D 旋转中心偏移的问题。
- 完善旧版本数据库升级兼容性。

### v0.4.5

新增

- 摄像头新增“实时/快照”显示模式，支持自定义快照刷新间隔；切到后台后自动暂停，返回页面立即恢复。
- 新增全局运行日志，可按级别、分类和关键词筛选，支持刷新、清空和导出；自动遮盖敏感信息。
- 新增户型图自动导图功能，可直接根据当前 3D 视角生成仪表盘底图、户型图、灯光、电视和汽车图层。
- 自动导图重新生成时，可保留已有实体绑定、按钮位置、图标和样式。
- 图片管理支持直接删除自动导图文件夹，并优化图片名称和文件夹切换显示。
- 3D 新增进阶光照设置，可调整主光方向、保存当前光照并恢复默认设置。
- 折线图新增自动阈值模式，可根据不同实体的实际数值范围自动分色，同时保留手动阈值。
- 空调弹窗根据实体实际功能展示运行模式、预设模式、风速和摆风选项；选项较多或文字较长时自动使用下拉菜单。
- 空调关机状态现在会在运行模式中正确显示“关闭”。
- 3D 模型库新增二级分类筛选，查找家具和电器更加方便。
- 同步更新当前默认仪表盘模板及相关控件封面。

优化

- 大幅优化 3D 模型加载与交互性能：模型按需加载、分批调度、材质复用、重复模型批量绘制和静态几何合并。
- 完成家居、电器、门窗、栏杆等模型轻量化，并保留加载失败时的原模型回退。
- 优化 3D 相机拖动阻尼、关闭灯光时的帧率、楼层模型加载范围和地面网格渐隐效果。
- 优化多灯光场景：静态阴影缓存、灯组独立缓存、实时阴影按需更新，减少重复计算。
- 提升自动导图预览与导出清晰度，按照仪表盘原始分辨率生成高清图片。
- 优化自动导图按钮布局、底图排序和逐层导出流程。
- 加快首次进入仪表盘时实体状态和摄像头画面的加载速度。
- 页面进入后台后自动暂停摄像头、扫地机器人地图和历史数据请求，回到前台后自动恢复。
- 摄像头快照刷新时保留上一帧，减少空白和画面闪烁。
- 优化实体列表分页、搜索与统计查询，减少大型实体目录的加载压力。
- 实时状态消息只发送给实际订阅相关实体的页面，降低多页面运行压力。
- 编辑器修改普通属性和折线图属性时改用局部刷新，减少整个画布重复重建。
- 优化控件模板弹窗布局，小窗口下无需反复滚动。
- 统一整理空调、热水器、空气净化器、灯光、窗帘、摄像头、媒体播放器、扫地机器人、电动床、传感器等设备弹窗的显示与动画。
- 优化吸顶灯亮度表现、多灯连续开关延迟以及灯光效果首帧稳定性。

修复

- 修复实时状态消息过多时可能丢失最新状态，以及实体被删除后页面继续显示旧状态的问题。
- 修复仪表盘可能自动使用其他相似实体的问题，现在始终使用用户实际绑定的实体。
- 修复首次进入页面时部分实体状态和摄像头加载较慢的问题。
- 修复摄像头流长时间占用数据库连接，可能导致连接池耗尽的问题。
- 修复摄像头弹窗扫描动画结束后画面短暂卡顿的问题。
- 修复扫地机器人地图首次加载失败后不再重试的问题。
- 修复成组设备和成组摄像头可能无法点击的问题。
- 修复隐藏控件选择框尺寸异常、选择框位置不一致以及实体和图片选择末行被遮挡的问题。
- 修复图标按钮灯光效果闪灭、首帧跳变、层级遮挡以及成组后层级异常的问题。
- 修复电视和汽车导图无法分别生成独立透明图层的问题。
- 修复自动导图预览偶发重建、首次加载超时、取消添加行为和返回页面后预览未恢复的问题。
- 修复自动导图生成图片不够清晰、按钮布局拥挤以及部分图层导出不完整的问题。
- 修复 3D 界面无法加载、轻量模型加载失败和模型分类切换挤压画面的问题。
- 修复 3D 灯光阴影条纹、透明墙体灯光穿透和 WebGL 纹理数量超限问题。
- 修复 3D 平面编辑、移动墙体和调整设置时的卡顿问题。
- 修复空调组合弹窗文字裁剪、长摆风选项显示不全、下拉选择后状态未及时同步的问题。
- 修复热水器关联参数显示不全、空气净化器动画不一致、媒体弹窗标题和选择器尺寸不统一等问题。
- 完善历史版本升级保护：升级前自动备份数据库并生成校验信息，迁移失败时自动恢复，覆盖现有全部历史版本升级。
