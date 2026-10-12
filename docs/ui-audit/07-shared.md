# 跨页共享组件与布局

随所属批次 · 9 个 surface

**配色契约**：跨区共享，禁止绑定具体色相；只引用语义层（`--hos-surface-*` / `--hos-text-*` / `--hos-border-*`）。

## Surface 清单

| id | kind | route | view |
| --- | --- | --- | --- |
| `homeos:components:common` | shared-components | (components) common | common |
| `homeos:components:dashboard` | shared-components | (components) dashboard | dashboard |
| `homeos:components:entities` | shared-components | (components) entities | entities |
| `homeos:components:modals` | shared-components | (components) modals | modals |
| `homeos:components:page-shell` | shared-components | (components) page-shell | page-shell |
| `homeos:components:setup` | shared-components | (components) setup | setup |
| `homeos:components:shell` | shared-components | (components) shell | shell |
| `homeos:components:widgets` | shared-components | (components) widgets | widgets |
| `homeos:layouts:styles` | shared-layouts | (layouts) styles | styles |

## 本组样式入口（33 个 .css）

- `homeos/frontend/src/assets/styles/anchored-popup-shells.css`
- `homeos/frontend/src/assets/styles/modal-theme.css`
- `homeos/frontend/src/assets/styles/popup-base.css`
- `homeos/frontend/src/components/common/asset-manager/styles/asset-manager-body.css`
- `homeos/frontend/src/components/common/asset-manager/styles/asset-manager-header.css`
- `homeos/frontend/src/components/common/asset-manager/styles/asset-manager.css`
- `homeos/frontend/src/components/common/base/styles/SearchableSelect.css`
- `homeos/frontend/src/components/common/base/styles/VEmptyState.css`
- `homeos/frontend/src/components/common/base/styles/VFolderCreateModal.css`
- `homeos/frontend/src/components/common/base/styles/VNotification.css`
- `homeos/frontend/src/components/common/base/styles/VProgressBar.css`
- `homeos/frontend/src/components/common/base/styles/VSkeleton.css`
- …另 21 个

## 严格未使用类热点

| 类名 | 出现次数 | 定义于 |
| --- | --- | --- |
| `popup-anchor--fixed` | 36 | `homeos/frontend/src/assets/styles/popup-base.css`<br>`homeos/frontend/src/assets/styles/popup-pointer.css` |
| `popup-anchor` | 33 | `homeos/frontend/src/assets/styles/popup-pointer.css` |
| `num-slider` | 13 | `homeos/frontend/src/assets/styles/main.css`<br>`homeos/frontend/src/assets/styles/popup-entities.css` |
| `list-page__filter-toolbar-search` | 8 | `homeos/frontend/src/assets/styles/list-page.css` |
| `wr-range` | 7 | `homeos/frontend/src/assets/styles/main.css` |
| `list-page__search` | 6 | `homeos/frontend/src/assets/styles/list-page.css` |
| `sg-toggle` | 5 | `homeos/frontend/src/assets/styles/main.css` |
| `list-page__section-title` | 4 | `homeos/frontend/src/assets/styles/list-page-views.css`<br>`homeos/frontend/src/assets/styles/list-page.css` |
| `list-page__filter-group` | 4 | `homeos/frontend/src/assets/styles/list-page.css` |
| `list-page__filter-toolbar` | 3 | `homeos/frontend/src/assets/styles/list-page.css` |

> 严格未使用 = 全仓无静态 `class="…"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。

## 改动前检查

- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）
- [ ] `bun run verify:tokens` 通过
- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）
- [ ] 未引入规范外断点
- [ ] 改动后截图对比，零视觉回归
