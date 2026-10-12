# 商店前台

Phase 3 前台 · 8 个 surface

**配色契约**：暖金品牌区：`--hb-accent`（`#ffc46a`）。令牌单一来源 `public/static/theme.css`，`PalettePanel` 可实时改色。

## Surface 清单

| id | kind | route | view |
| --- | --- | --- | --- |
| `store:home` | store | / | home |
| `store:products` | store | /products | products |
| `store:item` | store | /item/:productId | item |
| `store:account` | store | /user/dashboard/index | account |
| `store:account` | store | /user/index/query | account |
| `store:referrals` | store | /user/referrals | referrals |
| `store:auth` | store | /user/authentication/:mode(login|register|forget) | auth |
| `store:setup` | store-setup | /setup | setup |

## 本组样式入口（10 个 .css）

- `homeos-store/frontend/public/static/admin.css`
- `homeos-store/frontend/public/static/font.min.css`
- `homeos-store/frontend/public/static/scene/fonts.css`
- `homeos-store/frontend/public/static/scene/page.css`
- `homeos-store/frontend/public/static/scene/panel.css`
- `homeos-store/frontend/public/static/scene/scene.css`
- `homeos-store/frontend/public/static/store-critical.css`
- `homeos-store/frontend/public/static/store-shell.css`
- `homeos-store/frontend/public/static/store.css`
- `homeos-store/frontend/public/static/theme.css`

## 严格未使用类热点

| 类名 | 出现次数 | 定义于 |
| --- | --- | --- |
| `hos-steps__item` | 51 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-steps__dot` | 21 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-hub__item` | 21 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-datepicker__day` | 18 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-hub__name` | 15 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-date-field__control` | 15 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-shell` | 12 | `homeos/frontend/public/static/auth/scene/page.css`<br>`homeos-store/frontend/public/static/scene/page.css`<br>`design/scene/page.css` |
| `hos-steps` | 12 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-hub__scan` | 12 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |
| `hos-seg` | 12 | `homeos/frontend/public/static/auth/scene/panel.css`<br>`homeos-store/frontend/public/static/scene/panel.css`<br>`design/scene/panel.css` |

> 严格未使用 = 全仓无静态 `class="…"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。

## 改动前检查

- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）
- [ ] `bun run verify:tokens` 通过
- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）
- [ ] 未引入规范外断点
- [ ] 改动后截图对比，零视觉回归
