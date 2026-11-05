# 性能采集 harness

`docs/perf/*.md` 里所有数字都应该能用这里的脚本**原地重跑**出来。做不到就说明脚本或口径
又漂了，那比没有数字更糟。

## 一条命令

```bash
# 后端必须在跑（bun run dev），默认端口 18801
bun run perf:baseline -- before

# 商店首页也要一起测（Slow4G + 4x CPU）
STORE_URL=http://127.0.0.1:18802 RUNS=3 bun run perf:baseline -- before-store

# 需要鉴权的端点（COOKIE 同时注入浏览器，展示页/商店后台才量得到）
COOKIE="auth_token=<jwt>" ENDPOINTS="/health/ready=health /api/v1/projects=projects" \
  bun run perf:baseline -- before-auth

# 带登录态量 3D 展示页（否则会被 /login 拦住，阶段表全是 null）
COOKIE="auth_token=<jwt>" DISPLAY_PATH=/display/1 bun run perf:baseline -- before-stage
```

**缺数据的四种结局，都必须在输出里说清楚**（以前全是静默 PASS）：

| 情形 | 采集器 | 门禁 |
| --- | --- | --- |
| 页面没渲染（LCP/FCP=0） | `skip_reason` + 退出 3 | `SKIP storeHome：页面未渲染…` |
| 展示页被登录墙挡住 | `skip_reason` + 退出 3 | `SKIP 3d：登录墙…` |
| 是展示页但没打点 | 退出 1 | `FAIL 3d.iframeReady 未采到…` |
| 预算声明了、采样里没这个指标 | — | `FAIL …未采到`（不再因为 `typeof !== 'number'` 少一行） |

产物落在 `ops/perf/results/<label>/`（已 gitignore）：

| 文件 | 内容 |
| --- | --- |
| `bench_backend.json` | 端点顺序 p50/p95/p99、并发 p95、RPS、字节、SQL/请求 |
| `bench_frontend.json` | LCP / FCP / CLS / Long Task / 传输字节 / 资源清单 / 首屏 modulepreload |
| `bench_frontend.inventory.json` | 资源归因（按发起方 / 扩展名 / Top-N） |
| `bench_3d.json` | 阶段表（stage-mounted / light-cache-ready / first-screen-ready）、稳态 FPS |

## 单独跑

```bash
bun run perf:backend -- --base-url http://127.0.0.1:18801 --endpoint /health/ready=health
bun run perf:frontend -- --url http://127.0.0.1:18801/ --runs 3
bun run perf:frontend -- --url http://127.0.0.1:18802/store --throttle slow4g --cpu 4
bun run perf:3d -- --url http://127.0.0.1:18801/display/2 --fps-seconds 8
bun run perf:inventory -- ops/perf/results/before/bench_frontend.json --top 30
```

## 预算门禁

```bash
bun run check:perf-budget                     # 读 results/latest
bun run check:perf-budget -- --label before
node ops/gates.mjs --group perf               # 走门禁（缺采样时 SKIP）
```

预算值在 [`perf-budget.json`](./perf-budget.json)。与 `ops/checks/bundle-budget.json` 的分工：
前者管**运行期**指标（需要真实跑），后者管**构建产物字节**（每次构建都验）。

## 口径纪律（照做，否则数字不可比）

1. **必须量生产构建，不能量 Vite dev**：dev 下每个模块都是一次请求，Slow4G 实测
   store 首页 LCP 19.0s / 生产构建 2.2s（差 8 倍），拿 dev 的数字比生产预算只会得到假红。
   `bench_frontend` 会识别 `/@vite/client` 与 `/src/*.ts` 入口并直接 SKIP（退出 3）；
   确实要量 dev 时显式加 `--allow-dev`，并把结果当成**开发体验**而不是首屏预算。
   - 主应用：`http://127.0.0.1:8801/`（后端托管 `dist/`）
   - 商店：`http://127.0.0.1:8802/store`（后端托管 `dist/`），**不是** 8806（Vite dev）
2. **冷启动必须绕缓存**：`bench_frontend` 每轮新建 context，`bench_3d` 追加 `_perf` 时间戳；
   `display-warm-start` 是完全不同的路径，混进来会得出"冷启动 400ms"的假结论。
3. **毫秒不超噪声带不申报收益**：本机 LCP 漂移 11.7%~19.8%，p95 漂移 ±20%。小于这个幅度
   的差异只当噪声，别写进结论。
4. **字节和 CLS 是确定性的**，可以直接采信；LCP/iframeReady 要多次取中位数。
5. **3D 不用逐像素**：`compare_screenshots.py` 默认 `--exclude stage`，WebGL 画布每帧
   着色器时序不同，逐像素必假红。3D 用固定机位清单（day/night、开灯/关灯、单层/全层）
   人工过一遍 + feature flag 回滚。

### 本地 Vite 报 `504 (Outdated Optimize Dep)` 时

这是 dev 缓存被顶掉（另一个 dev 进程重跑了依赖预打包，把 `node_modules/.vite/<app>` 清空），
与代码无关：页面会白屏、`LCP=0`。**不要**去 kill dev 进程（`ops/dev.mjs` 一旦有子进程退出
会把整个栈收掉），touch 一下 `homeos-store/frontend/vite.config.ts` 让运行中的 Vite 重启
优化器即可：

```bash
touch homeos-store/frontend/vite.config.ts   # 触发 config change → 重新预打包依赖
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8806/src/main.ts   # 确认新 hash
```


## UI 一致性

```bash
bun run perf:compare -- --before /tmp/before --after /tmp/after \
  --channel-threshold 8 --max-diff-pct 0.1
```

退出码 1 即"观感变了"，此时应当先确认这是不是本次改动的预期效果，再决定要不要接受。
