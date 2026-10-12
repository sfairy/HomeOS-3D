# 商店管理后台

Phase 3 后台 · 20 个 surface

**配色契约**：暖金品牌区，与前台共用 `theme.css`；需校验 `PalettePanel` 注入的 `--hos-*` / `--hb-*` 与 `theme.css` 默认值一致。

## Surface 清单

| id | kind | route | view |
| --- | --- | --- | --- |
| `store:admin` | admin | /admin/:page?/:tab? | admin |
| `store:admin:operations` | admin | /admin/operations | operations |
| `store:admin:catalog` | admin | /admin/catalog | catalog |
| `store:admin:licensing` | admin | /admin/licensing | licensing |
| `store:admin:records` | admin | /admin/records | records |
| `store:admin:system` | admin | /admin/system | system |
| `store:admin-view:AccountsView` | admin | (admin pane) AccountsView | AccountsView |
| `store:admin-view:AuditsView` | admin | (admin pane) AuditsView | AuditsView |
| `store:admin-view:BindingsView` | admin | (admin pane) BindingsView | BindingsView |
| `store:admin-view:CouponsView` | admin | (admin pane) CouponsView | CouponsView |
| `store:admin-view:CustomersView` | admin | (admin pane) CustomersView | CustomersView |
| `store:admin-view:DiagnosticsView` | admin | (admin pane) DiagnosticsView | DiagnosticsView |
| `store:admin-view:EntitlementsView` | admin | (admin pane) EntitlementsView | EntitlementsView |
| `store:admin-view:LedgerView` | admin | (admin pane) LedgerView | LedgerView |
| `store:admin-view:LicensesView` | admin | (admin pane) LicensesView | LicensesView |
| `store:admin-view:OrdersView` | admin | (admin pane) OrdersView | OrdersView |
| `store:admin-view:OverviewView` | admin | (admin pane) OverviewView | OverviewView |
| `store:admin-view:ProductsView` | admin | (admin pane) ProductsView | ProductsView |
| `store:admin-view:SettingsView` | admin | (admin pane) SettingsView | SettingsView |
| `store:admin-view:WithdrawalsView` | admin | (admin pane) WithdrawalsView | WithdrawalsView |

## 本组样式入口（1 个 .css）

- `homeos-store/frontend/public/static/admin.css`

## 严格未使用类热点

| 类名 | 出现次数 | 定义于 |
| --- | --- | --- |
| `hb-no-base-products` | 3 | `homeos-store/frontend/public/static/store-shell.css` |
| `hb-steps__body` | 2 | `homeos-store/frontend/public/static/store.css` |

> 严格未使用 = 全仓无静态 `class="…"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。

## 改动前检查

- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）
- [ ] `bun run verify:tokens` 通过
- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）
- [ ] 未引入规范外断点
- [ ] 改动后截图对比，零视觉回归
