# 入户 · 认证 · 主壳

Phase 2 批次 1–2 · 7 个 surface

**配色契约**：暖金品牌区：`--hos-accent`（`#ffc46a`）。主壳内的功能控件属蓝色功能区 —— 跨区不得互相覆盖。

## Surface 清单

| id | kind | route | view |
| --- | --- | --- | --- |
| `homeos:login` | auth | /login | login |
| `homeos:register` | auth | /register | register |
| `homeos:activation` | auth | /activate | activation |
| `homeos:license-recovery` | auth | /license | license-recovery |
| `homeos:display` | shell | /display/:projectId | display |
| `homeos:homeos` | shell | /homeos/:name(.*) | homeos |
| `homeos:dashboard` | shell | / | dashboard |

## 本组样式入口（10 个 .css）

- `homeos/frontend/public/static/appearance.css`
- `homeos/frontend/public/static/auth/scene/fonts.css`
- `homeos/frontend/public/static/auth/scene/page.css`
- `homeos/frontend/public/static/auth/scene/panel.css`
- `homeos/frontend/public/static/auth/scene/scene.css`
- `homeos/frontend/src/components/dashboard/styles/Footer.css`
- `homeos/frontend/src/components/dashboard/styles/PowerCardBody.css`
- `homeos/frontend/src/components/dashboard/styles/RightSidebar.css`
- `homeos/frontend/src/layouts/styles/main-layout.css`
- `homeos/frontend/src/layouts/styles/tab-bar-mode-switcher.css`

## 严格未使用类热点

| 类名 | 出现次数 | 定义于 |
| --- | --- | --- |
| `hos-steps__item` | 51 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `home-characters` | 26 | `homeos/frontend/public/static/auth.css` |
| `hos-steps__dot` | 21 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-hub__item` | 21 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-datepicker__day` | 18 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-hub__name` | 15 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-date-field__control` | 15 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-shell` | 12 | `homeos/frontend/public/static/auth/scene/page.css`<br>`homeos-store/frontend/public/static/scene/page.css`<br>`design/scene/page.css` |
| `hos-steps` | 12 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-hub__scan` | 12 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |

> 严格未使用 = 全仓无静态 `class="…"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。

## 改动前检查

- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）
- [ ] `bun run verify:tokens` 通过
- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）
- [ ] 未引入规范外断点
- [ ] 改动后截图对比，零视觉回归
