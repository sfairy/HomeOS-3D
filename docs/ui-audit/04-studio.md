# 3D Studio

Phase 2 批次 7 · 10 个 surface

**配色契约**：Studio 自带皮肤层（`studio-chrome.css` + `public/static/3d-studio/studio.css`），与主壳独立；令牌沿用 `--hos-*` 语义层。

## Surface 清单

| id | kind | route | view |
| --- | --- | --- | --- |
| `homeos:studio` | studio | /3d-studio | studio |
| `homeos:studio-editor` | studio | /studio/editor | studio-editor |
| `homeos:stage` | studio | /api/v1/modules/interaction3d/stage.html | stage |
| `homeos:studio:app` | shared-studio | (studio) app | app |
| `homeos:studio:chrome` | shared-studio | (studio) chrome | chrome |
| `homeos:studio:engine` | shared-studio | (studio) engine | engine |
| `homeos:studio:entries` | shared-studio | (studio) entries | entries |
| `homeos:studio:platform` | shared-studio | (studio) platform | platform |
| `homeos:studio:runtime` | shared-studio | (studio) runtime | runtime |
| `homeos:studio:shims` | shared-studio | (studio) shims | shims |

## 本组样式入口（9 个 .css）

- `homeos/frontend/public/static/3d-studio/studio.css`
- `homeos/frontend/src/studio/chrome/studio-chrome.css`
- `homeos/frontend/src/studio/runtime/climate/climate-panel.css`
- `homeos/frontend/src/studio/runtime/core/runtime.css`
- `homeos/frontend/src/studio/runtime/core/stage-device-visual.css`
- `homeos/frontend/src/studio/runtime/core/stage.css`
- `homeos/frontend/src/studio/runtime/cover/cover-panel.css`
- `homeos/frontend/src/studio/runtime/nas/nas-panel.css`
- `homeos/frontend/src/studio/runtime/presence/presence-editor.css`

## 严格未使用类热点

| 类名 | 出现次数 | 定义于 |
| --- | --- | --- |
| `i3d-extra-switch` | 9 | `homeos/frontend/src/studio/runtime/climate/climate-panel.css`<br>`homeos/frontend/src/studio/runtime/core/stage.css` |
| `i3d-extra-state` | 7 | `homeos/frontend/src/studio/runtime/climate/climate-panel.css`<br>`homeos/frontend/src/studio/runtime/core/stage.css` |
| `i3d-floor-brightness` | 5 | `homeos/frontend/src/studio/runtime/core/runtime.css` |
| `i3d-lock-label-toggle` | 4 | `homeos/frontend/src/studio/runtime/core/runtime.css`<br>`homeos/frontend/src/studio/runtime/core/stage.css` |
| `i3d-size-field` | 3 | `homeos/frontend/src/studio/runtime/core/runtime.css` |
| `i3d-effect-settings` | 3 | `homeos/frontend/src/studio/runtime/core/runtime.css` |
| `i3d-extra-select` | 2 | `homeos/frontend/src/studio/runtime/climate/climate-panel.css` |
| `i3d-extra-number` | 2 | `homeos/frontend/src/studio/runtime/climate/climate-panel.css` |
| `i3d-light-add` | 2 | `homeos/frontend/src/studio/runtime/core/runtime.css` |
| `i3d-effect-option` | 2 | `homeos/frontend/src/studio/runtime/core/runtime.css` |

> 严格未使用 = 全仓无静态 `class="…"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。

## 改动前检查

- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）
- [ ] `bun run verify:tokens` 通过
- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）
- [ ] 未引入规范外断点
- [ ] 改动后截图对比，零视觉回归
