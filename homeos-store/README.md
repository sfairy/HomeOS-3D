# homeos-store — 授权商店

厂商侧单实例服务：授权商店前台、运营后台、授权签发与心跳 / 恢复。与主应用
（`../homeos`）相互独立，后端包互不 import，构建与部署分开。

- HTTP `8802`，**刻意没有** HTTPS 终结（由部署侧决定，见 `../ops/deploy/README.md`）。
- 同时提供 `/store/v1/*`、`/v2/activate|heartbeat|recover`、`/admin` 与 `/store-admin/v1/*`。
- 单进程、内存态；`/setup` 建运营管理员，`/admin` 为运营后台。

## 目录

```text
homeos-store/
├── backend/                 # FastAPI 后端（源码包名 src，镜像内 app）
│   └── src/                 # api / core / security / commerce / payments / licensing / ops
├── frontend/                # Vue 3 + Vite 前端（没有自己的 package.json）
│   └── src/
│       ├── features/        # admin（运营后台）与 storefront（商店前台）两个域
│       ├── router/          # 组合根
│       ├── views/           # SetupView.vue（宿主级首次初始化页）
│       └── shared/          # 跨域视图层 / 类型 / 请求封装
├── data/                    # 源码态运行时数据（不入库；容器内为 /data）
├── keys/local/              # 开发态授权密钥（私钥不入库；公钥镜像到仓库根 keys/）
└── package.json             # 构建 / 开发脚本入口（依赖只在仓库根安装）
```

后端 7 个包的职责与结构门禁口径见 [backend/src/README.md](backend/src/README.md)；
前端分层、域边界与样式顺序硬约束见 [frontend/src/README.md](frontend/src/README.md)。
能力码真源在仓库根 `../ops/contracts/feature_codes.json`。

## 常用命令（在仓库根执行）

```bash
bun run dev                 # 同时起主应用与商店（各端口见根 README）
bun run --cwd homeos-store dev
bun run --cwd homeos-store build
bun run --cwd homeos-store typecheck
bun run --cwd homeos-store stage-plan   # 生成 public/static/media/stage-plan.svg
```
