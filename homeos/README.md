# homeos — 主应用

面向客户现场安装的 HomeOS 主应用：仪表盘 / 中控展示、设备接入、场景与 3D 编辑、授权校验。
与授权商店（`../homeos-store`）是两个相互独立的项目，构建、部署、数据目录都分开，后端包互不 import。

- HTTP `8801`；可选 HTTPS `8803`（自签）。首装零用户时登录页直接给「创建本机唯一账号」。
- 源码包名 `src`，镜像内包名 `app`（构建由根目录 Dockerfile 的 `--target app` 完成）。
- 运行期容器名 / 镜像名 / 数据卷名里的 `homeos` 是刻意保留的，**不要改**（会换卷、影响授权实例指纹）。

## 目录

```text
homeos/
├── backend/                 # FastAPI 后端（源码包名 src）
│   └── src/                 # api / domains / platform / realtime / panel / modules / bootstrap
├── frontend/                # Vue 3 + Vite + TypeScript 前端
│   ├── src/                 # views / features / components / composables / stores / shared / studio
│   ├── src/studio/          # 3D 创作、面板编辑器 / 渲染器、实时舞台（runtime/）
│   ├── scripts/             # 构建辅助与模型库工具（模型库在 scripts/models/）
│   └── public/static/       # 运行时静态资源；3d-studio/models 为模型库，vendor/ 为第三方产物
├── assets-default/          # 随镜像烘焙的默认 UI 素材（镜像内 /app/assets-default，可被运行期 /app/assets 覆盖）
├── data/                    # 源码态运行时数据（不入库；容器内为 /data）
└── package.json             # 本项目的脚本入口（依赖只在仓库根安装）
```

后端分层与依赖方向见 [backend/src/README.md](backend/src/README.md)；前端目录、域边界与 studio
子系统见 [frontend/src/README.md](frontend/src/README.md) 和 [frontend/src/studio/README.md](frontend/src/studio/README.md)。
功能码真源在仓库根 `../ops/contracts/feature_codes.json`。

## 常用命令（在仓库根执行）

```bash
bun run dev                 # 后端热重载 + Vite HMR
bun run dev:frontend        # 只起前端
bun run dev:backend         # 只起后端
bun run build               # 构建（产物只进根 dist/）
bun run typecheck
bun run check:backend-deps  # 后端依赖方向门禁
bun run check:frontend-deps # 前端域边界门禁（主应用 + 商店）
```

裸机启动生产后端：`bash ops/deploy/run-backend.sh`。镜像与编排见仓库根
[docker-compose.yml](../docker-compose.yml) 与 [Dockerfile](../Dockerfile)。
