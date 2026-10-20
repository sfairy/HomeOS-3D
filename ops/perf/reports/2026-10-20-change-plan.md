# HomeOS 双项目性能变更计划（按收益/风险排序）

- 日期：2026-10-20
- 基线：`ops/perf/reports/2026-10-20-baseline.md`（提交 `efc0defc`）
- 原则：不改接口契约、不改视觉参数、不改认证/授权语义；每项可单独回滚；先观测后优化。
- 测量环境：本机隔离实例 18801/18802 + 桌面 Edge 155 headless；不是小米平板 8 真机。

## 1. 变更清单

| ID | 变更 | 主要文件 | 证据/理由 | 预期收益 | 风险 | 回滚 |
|---|---|---|---|---|---|---|
| P0-1 | HTTP 路由直方图 + 启动分阶段/import 计时 | `homeos/backend/src/bootstrap/middleware.py`、`platform/core/observability.py`、`app.py`、`run.py` | 原 /metrics 只有总量，无法归因 30% 启动目标 | 可归因；无运行时收益 | 低：路由基数已限制 100、跳过静态/流 | 删 `HttpTimingMiddleware` 注册与新增导出；指标为附加输出 |
| P1-1 | 鉴权 sessions+users 合并为一次 join | `platform/security/auth_context.py` | 每受保护请求原 2 次 SQLite | 每请求 −1 查询；并发 p95 改善 | 低~中：吊销/过期语义必须保持（已保留 300s 续期与删除分支） | 恢复两次 select；无 schema 变更 |
| P1-2 | store products 5s TTL 缓存 + 强 ETag + 写失效 | `homeos-store/backend/src/api/store.py`、`store_products_cache.py`、`admin_products.py`、`config.py` | 原每次 4 查询、无缓存；并发 p50 69.5ms vs features 8.5ms | p50 −50%+、并发 p95 −80%+、RPS 数倍 | 中：商品/订单/许可变化可见性；已用 5s TTL + 6 处写入口失效 + after_commit/rollback 钩子 | `STORE_PRODUCTS_CACHE_TTL_SECONDS=0` 立即禁用；或回退 4 文件 |
| P2-1 | draft/assets 条件请求（ETag/304） | `api/projects.py`、`api/assets.py`、`platform/http_cache.py`、`bootstrap/studio_shell.py` | 展示页每次 cache-buster+no-store，重下 37.5KB 草稿 | 未变更时 304 空 body；draft 命中路径不解析 JSON | 低~中：缓存头需 private,no-cache；已用 `_REVALIDATABLE_PRIVATE_API` 防全局 no-store 覆盖 | 删除三个路由的 ETag 分支并恢复 no-store；前端恢复原 fetch |
| P2-2 | 非认证首屏剥离认证四片 CSS | `platform/core/frontend_static.py`、`bootstrap/spa_static.py`、`modules/interaction3d/api.py` | 登录态非认证页仍下载 125KB 认证 CSS；运行时本就会移除 | 首屏 stylesheet −125,177B raw / −36,899B gzip；少 8 请求 | 低：仅登录 cookie + 非认证路径；blocked 与认证路径保留 | 删除 `strip_auth_scene_stylesheets` 调用；CSS 未被物理删除 |
| P2-3 | 展示页草稿/素材改条件请求（前端） | `display-startup.ts`、`display.ts` | 同上；去掉 `?_=Date.now()` 与 `cache:no-store` | 二次进入省 1 RTT/37.5KB；304 时为空 body | 低：仅 5 个白名单路径；其它请求保持原逻辑 | 恢复时间戳与 no-store |
| P2-4 | 安全并行启动叶子服务 | `bootstrap/lifespan.py` | 15 阶段串行；security 4 项、channels 3 项、weather 2 项互不依赖 | 理论 −几 ms；实测受 CPU 限制 | 中：依赖顺序；用 `HOMEOS_PARALLEL_STARTUP=0` 回退 | 环境变量置 0，无需改代码 |
| P3-1 | 3D 舞台 HTML 缓存 + stage.js modulepreload + 剥认证 CSS | `modules/interaction3d/api.py` | 每 iframe 同步读 index.html；stage 要等 SPA 引导后才发现 stage.js | 减少重复读盘；提前 1 个 RTT 启动 3D 图 | 中：stage 注入顺序/缓存头；失败可单文件回退 | 删除注入的 modulepreload 与模板缓存 |
| P3-2 | 3D 性能采集脚本修复 | `ops/perf/harness/bench_3d.mjs` | 原拖拽命中 2D 灯光 canvas，samples=0 | 让 3D 指标可测 | 无生产影响 | 仅工具文件 |
| — | 认证视图懒加载 | `router/index.ts`、`vite.config.ts` | 预期减 views-auth 首屏 | **已回退**：匿名 /login 触发 three 401 与 shared chunk 加载失败（安全中间件拦截预载） | 高 | 已恢复到 HEAD |

## 2. 明确不做（高收益但高风险，留待后续）

1. 重写 3D 独立 stage shell（绕过 SPA）：需复刻 studio-boot/renderer/apply 逻辑，回归面覆盖 2 万行 studio-app，本轮不碰。
2. 共享 renderer / 离屏 LRU / 同屏卡上限：改变渲染模型与像素结果，需真机像素对比与产品确认。
3. store 前端重构：入口仅 98KB，收益小于风险。
4. 真机 A/B：需要小米平板 8 与远程调试，当前环境无法完成，报告标注待补。

## 3. 验收与回滚总策略

- 每次改动对应：行为前后对比、测试命令、回滚方式（见上表）。
- 回归门禁：`bun run typecheck`、`bun run lint:ci`（改动包）、`bun run check:async-db`、`bun run check:bundle-budget`、`ops/perf/harness/check_contracts.py`、前端截图对比（人工复核）。
- 若任一接口契约失败：先回滚对应 P1/P2 项，保留 P0 观测（纯附加）。
- 若视觉差异 > 阈值：回滚 P2-2/P3-1，CSS 文件未删，恢复注入即可。
- 若 store 商品可见性异常：`STORE_PRODUCTS_CACHE_TTL_SECONDS=0` 立即停用缓存，再排查失效钩子。

## 4. 执行结果（2026-10-20）

实际前后指标、测量方式、回滚与未达成项见 `2026-10-20-after.md`；3D 单独测量见 `2026-10-20-3d.md`。要点：store products 并发 p95 −84.5%、RPS +411%；homeos 受保护端点每请求少 1 次 SQLite；非认证首屏 stylesheet −44,546 B；启动 −30% 与 3D 首帧改善未达成（已如实记录）。

## 5. 预期与实际偏差记录

- 启动 −30% 目标：并行启动只能覆盖少量 leaf 服务；实测应用内 startup 约 −3%，wall −6%。主因是 import 约 497ms 与 license/core 的 CPU 工作，不是可并行的等待。该目标本轮**未达成**，后续需做 import 拆分/延迟加载，不能靠 gather 硬凑。
- 认证懒加载：收益（37.8KB gzip）小于安全回归风险，已回退。
- 条件请求：手工 304 已验证；Edge 155 在本机不发 If-None-Match（最小复现服务器也不发），真实浏览器自动复用需真机确认。
