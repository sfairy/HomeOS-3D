# 列表页

Phase 2 批次 3–4 · 9 个 surface

**配色契约**：主应用内蓝色功能区：`--accent`（`#0A84FF`）；页级 `--page-accent` 由各视图注入，回退值三处不一致（`#34d399` / `#60a5fa` / `#0A84FF`）待统一。

## Surface 清单

| id | kind | route | view |
| --- | --- | --- | --- |
| `homeos:devices` | devices | /devices | devices |
| `homeos:device-detail` | devices | /device | device-detail |
| `homeos:notifications` | notifications | /rooms | notifications |
| `homeos:earthquake-history` | events | /earthquake-history | earthquake-history |
| `homeos:events` | events | /events | events |
| `homeos:mode-logs` | events | /mode-logs | mode-logs |
| `homeos:security` | security | /security | security |
| `homeos:embed-movie-pilot` | embed | /embed/movie-pilot | embed-movie-pilot |
| `homeos:embed` | embed | /embed/:id | embed |

## 本组样式入口（37 个 .css）

- `homeos/frontend/src/assets/styles/list-page.css`
- `homeos/frontend/src/components/widgets/climate/home-climate-chart/styles/home-climate-chart.css`
- `homeos/frontend/src/components/widgets/media/styles/MiniWidget.css`
- `homeos/frontend/src/components/widgets/media/styles/PlaylistWidget.css`
- `homeos/frontend/src/components/widgets/security/styles/SecurityPanelWidget-scoped.css`
- `homeos/frontend/src/components/widgets/security/styles/security-panel-widget.css`
- `homeos/frontend/src/components/widgets/styles/QuickActionsCard.css`
- `homeos/frontend/src/components/widgets/styles/widget-hub-embeds.css`
- `homeos/frontend/src/components/widgets/system/styles/ClockWidget.css`
- `homeos/frontend/src/components/widgets/system/styles/notification-center.css`
- `homeos/frontend/src/components/widgets/weather/styles/Forecast.css`
- `homeos/frontend/src/components/widgets/weather/styles/LifeIndices.css`
- …另 25 个

## 严格未使用类热点

| 类名 | 出现次数 | 定义于 |
| --- | --- | --- |
| `popup-anchor--fixed` | 36 | `homeos/frontend/src/assets/styles/popup-base.css`<br>`homeos/frontend/src/assets/styles/popup-pointer.css` |
| `popup-anchor` | 33 | `homeos/frontend/src/assets/styles/popup-pointer.css` |
| `num-slider` | 13 | `homeos/frontend/src/assets/styles/main.css`<br>`homeos/frontend/src/assets/styles/popup-entities.css` |
| `list-page__filter-toolbar-search` | 8 | `homeos/frontend/src/assets/styles/list-page.css` |
| `sec-event-item` | 8 | `homeos/frontend/src/features/security/styles/security.css` |
| `wr-range` | 7 | `homeos/frontend/src/assets/styles/main.css` |
| `list-page__search` | 6 | `homeos/frontend/src/assets/styles/list-page.css` |
| `sg-toggle` | 5 | `homeos/frontend/src/assets/styles/main.css` |
| `list-page__section-title` | 4 | `homeos/frontend/src/assets/styles/list-page-views.css`<br>`homeos/frontend/src/assets/styles/list-page.css` |
| `list-page__filter-group` | 4 | `homeos/frontend/src/assets/styles/list-page.css` |

> 严格未使用 = 全仓无静态 `class="…"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。

## 改动前检查

- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）
- [ ] `bun run verify:tokens` 通过
- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）
- [ ] 未引入规范外断点
- [ ] 改动后截图对比，零视觉回归
