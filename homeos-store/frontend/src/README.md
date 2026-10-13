# HomeOS 商店前端目录结构

面向授权商店与运营后台的小型 Vue 应用。

## 分层

| 路径 | 职责 |
|------|------|
| `views/store/` | 面向顾客的商店页面 |
| `views/admin/` | 运营后台（含 `views/admin/settings/`） |
| `components/` | 可复用 UI |
| `composables/` | Vue hooks |
| `stores/` | Pinia |
| `utils/` | 纯函数助手 |
| `api/` | HTTP 客户端 |
| `scene/` | 认证 / 场景展示助手 |

## 导入

优先使用 `@store/…` 别名（见 `frontend/vite.config.ts` / 根 `tsconfig.json`），而非深层相对路径 `../../`。改动文件时顺手迁移。

## 依赖规则

`components` / `composables` / `stores` / `utils` 不得 import `views/**`。

由 `bun run --cwd homeos-store check:deps`（`homeos-store/package.json` → `scripts/check-store-deps.mjs` + 复用主应用的 `check-import-refs.mjs --root frontend --alias @store/`）强制。CI 在 `checks.yml` 的 `typecheck` job 里直接跑 `bun run --cwd homeos-store check:deps`。

> 注意：商店前端**没有**自己的 `package.json`，构建 / 检查脚本都由 `homeos-store/package.json` 驱动（`vite --config frontend/vite.config.ts`）。
