# 入户场景静态资源（真源）

`static/` 是两端（注册 / 登录 / 激活 / 恢复 + 商店）**共用的 CSS 与自托管字体真源**：

```
scene/
├── static/            ← 唯一真源：4 个 CSS + fonts/（woff2 + 归因）
│   ├── fonts.css
│   ├── page.css
│   ├── panel.css
│   ├── scene.css
│   └── fonts/{ATTRIBUTION.txt, *.woff2}
├── scene.html         ← 场景标记的设计稿（不参与构建，结构对照用）
└── README.md
```

两个前端部署路径不同，`static/` 会被铺成两棵**生成物**：

| 副本 | URL 前缀 | 是否入库 |
| --- | --- | --- |
| `homeos/frontend/public/static/auth/scene/` | `/static/auth/scene/` | 否（`scene-depth.js` 例外） |
| `homeos-store/frontend/public/static/scene/` | `/store-static/scene/` | 否 |

## 怎么改

**只改 `static/`**，副本不要手改、也不要 `git add` 进来：

```bash
bun run --cwd packages/shared sync:scene     # 写盘：镜像真源到两个 public/
bun run --cwd packages/shared check:scene    # 只比对：不一致 / 副本被入库 → 非 0 退出
```

- `build`（`bun run build` / `build:shared`）与两个前端的 `dev` / `build` 脚本都会先跑 `sync:scene`，
  所以正常开发不需要手动执行。
- 副本**不入库**（`.gitignore`）：同一批文件以前有四份（`design/` + 两个 `public/`），漂移没人发现。
  现在它们是纯生成物；`check:scene` 在 CI 里同时拦「没 sync」和「有人 `git add -f` 塞回仓库」。
- 客户端还有一道 `pre-commit`（`.githooks/pre-commit`，`bun run setup:hooks` 装）：
  只跑 `--tracked-only` 这一条断言，干净检出上副本不存在也不会误拦，`git commit --no-verify` 可绕过。
- 目标目录里多出来的文件会被**删掉**（镜像语义）。真源删文件后副本立即跟上，不会继续按 URL 出货。
- 真源 CSS 由 `lint:shared` 里的 `check-css-syntax.mjs` 做语法门禁（esbuild 引擎，与构建判定一致）：
  「只有选择器、没有声明块」这类在 `vite build` 里只是 warning 的残缺规则会在这里拦下。

## 例外：`scene-depth.js`

`homeos/frontend/public/static/auth/scene/scene-depth.js` 是 `index.html` 里的**阻塞脚本**，
public/ 下不经打包、不能 import，只能留一份手抄的 IIFE。判据真源仍是
[`../src/scene/touch-profile.ts`](../src/scene/touch-profile.ts)，改判据时两处一起改 ——
脚本的 `KEEP_IN_TARGET` 会把它原样保留，不参与「多余文件就删」。

## 与令牌的关系

`page.css` 里的 `--hos-sky-*` / `--hos-star-*` / `--hos-muted` / `--hos-accent` 等与商店
`homeos-store/frontend/public/static/theme.css`、共享包 `../src/styles/design-tokens.css` **逐值对齐**。
这三个文件之间没有生成关系，只靠注释互相点名 —— 改一侧就要把另外两处一起改。
