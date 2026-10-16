# 入户场景静态资源

`static/` 是两端/注册/授权壳的 **CSS + 字体真源**。两个前端部署路径不同：

| 副本 | URL 前缀 |
| --- | --- |
| `homeos/frontend/public/static/auth/scene/` | `/static/auth/scene/` |
| `homeos-store/frontend/public/static/scene/` | `/store-static/scene/` |

改样式或字体只改本目录，然后跑：

```bash
bun run --cwd packages/shared sync:scene
```

（`build:shared` / `bun run build` 里的 shared build 会自动同步。）

主应用额外的 `scene-depth.js` 兜底手抄件不在本树内，仍留在 homeos `public/`。
