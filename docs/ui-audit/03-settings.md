# 设置域

Phase 2 批次 5 · 27 个 surface

**配色契约**：唯一入口令牌层：`features/settings/shared/styles/settings-tokens.css`。子域不得各自定义平行令牌。

## Surface 清单

| id | kind | route | view |
| --- | --- | --- | --- |
| `homeos:settings` | settings | /settings | settings |
| `homeos:settings:setup-wizard` | settings | /settings?tab=setup-wizard | setup-wizard |
| `homeos:settings:connection` | settings | /settings?tab=connection | connection |
| `homeos:settings:bindings` | settings | /settings?tab=bindings | bindings |
| `homeos:settings:devices` | settings | /settings?tab=devices | devices |
| `homeos:settings:rooms` | settings | /settings?tab=rooms | rooms |
| `homeos:settings:life-accounts` | settings | /settings?tab=life-accounts | life-accounts |
| `homeos:settings:smart-charge` | settings | /settings?tab=smart-charge | smart-charge |
| `homeos:settings:favorites` | settings | /settings?tab=favorites | favorites |
| `homeos:settings:general` | settings | /settings?tab=general | general |
| `homeos:settings:assets` | settings | /settings?tab=assets | assets |
| `homeos:settings:layout` | settings | /settings?tab=layout | layout |
| `homeos:settings:widgets` | settings | /settings?tab=widgets | widgets |
| `homeos:settings:floating` | settings | /settings?tab=floating | floating |
| `homeos:settings:embeds` | settings | /settings?tab=embeds | embeds |
| `homeos:settings:home-mode` | settings | /settings?tab=home-mode | home-mode |
| `homeos:settings:security-modes` | settings | /settings?tab=security-modes | security-modes |
| `homeos:settings:voice` | settings | /settings?tab=voice | voice |
| `homeos:settings:agent` | settings | /settings?tab=agent | agent |
| `homeos:settings:alerts` | settings | /settings?tab=alerts | alerts |
| `homeos:settings:family` | settings | /settings?tab=family | family |
| `homeos:settings:access` | settings | /settings?tab=access | access |
| `homeos:settings:profiles` | settings | /settings?tab=profiles | profiles |
| `homeos:settings:license` | settings | /settings?tab=license | license |
| `homeos:settings:retention` | settings | /settings?tab=retention | retention |
| `homeos:settings:diagnostics` | settings | /settings?tab=diagnostics | diagnostics |
| `homeos:settings:params` | settings | /settings?tab=params | params |

## 本组样式入口（75 个 .css）

- `homeos/frontend/src/features/settings/automate/styles/home-mode-embed.css`
- `homeos/frontend/src/features/settings/automate/styles/security-modes.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/HazardBindingStatusPanel.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/SectionInsights.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/SettingsBindingsCamerasSection.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/SettingsBindingsEnvironmentSection.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/SettingsBindingsSecuritySection.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/SettingsBindingsWeatherSection.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/account-list-editor.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/bind-env-panel.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/hazard-bindings-section.css`
- `homeos/frontend/src/features/settings/connect/bindings/styles/settings-bindings-account-section.css`
- …另 63 个

## 严格未使用类热点

| 类名 | 出现次数 | 定义于 |
| --- | --- | --- |
| `embed-item-tabs` | 24 | `homeos/frontend/src/features/settings/shared/styles/settings-orch-tabs.css` |
| `rooms-overview__stats--compact` | 5 | `homeos/frontend/src/features/settings/shared/styles/bindings-theme.css` |
| `room-quick-rules__card--climate` | 4 | `homeos/frontend/src/features/settings/shared/styles/bindings-theme.css` |
| `room-quick-rules__card-cta` | 4 | `homeos/frontend/src/features/settings/shared/styles/bindings-theme.css` |
| `rooms-hero-card--compact` | 4 | `homeos/frontend/src/features/settings/shared/styles/bindings-theme.css`<br>`homeos/frontend/src/features/settings/shared/styles/settings-card-layers.css` |
| `agent-field-row` | 3 | `homeos/frontend/src/features/settings/interact/styles/SettingsAgentPanel.css` |
| `room-quick-rules__card--motion` | 3 | `homeos/frontend/src/features/settings/shared/styles/bindings-theme.css` |
| `room-quick-rules__card-icon-wrap` | 3 | `homeos/frontend/src/features/settings/shared/styles/bindings-theme.css` |
| `rooms-stat` | 3 | `homeos/frontend/src/features/settings/shared/styles/bindings-theme.css` |
| `hub-body` | 3 | `homeos/frontend/src/features/settings/shared/styles/settings-hub-workspace.css` |

> 严格未使用 = 全仓无静态 `class="…"` 引用。删前确认无动态拼接（见 `unusedDynamic`）与无 `public/static` URL 投放。

## 改动前检查

- [ ] 改动前截图（基线见 `ops/ui-audit/shots/baseline/`）
- [ ] `bun run verify:tokens` 通过
- [ ] 未引入新硬编码色（`scan-hardcoded-colors.mjs` 前后对比）
- [ ] 未引入规范外断点
- [ ] 改动后截图对比，零视觉回归
