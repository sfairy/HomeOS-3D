/**
 * `shared/status/` —— 以只读方式向 shell / UI 暴露「本机状态」的共享域。
 *
 * 目前两名成员同源（都只是 `@/services/api/system` 的薄包装）：
 * - `useSetupChecklist`   —— 安装引导清单进度（横幅展示 + 7 天暂缓）
 * - `useSystemDiagnostics` —— 健康与诊断（10 秒缓存 + inflight 去重）
 *
 * ## 为什么是 `shared/` 而不是 `features/settings/`
 *
 * 这两个 composable 原先放在 `features/settings/composables/`，再由 `@/composables/settings/*`
 * 的 deprecated re-export 桩兜住下层调用方。但真实调用方在 shared **之上**：
 *
 * - `components/setup/ChecklistBanner.vue`（`components/` ↛ `features/`）
 * - `composables/ui/useMainLayoutChrome.ts`（`composables/` ↛ `features/`）
 *
 * 且两者依赖全在 shared **之下**（`vue` + `@/services/api/system`），所以正确归宿就是 `shared/`：
 * 桩可删，层违规白名单也不需要。
 *
 * ## 为什么不叫 `shared/system` / `shared/diagnostics` / `shared/setup`
 *
 * 这三个名字在本仓库已各有其主、语义不同：`features/settings/system`（系统配置面板）、
 * `features/settings/system/diagnostics`（设置内的诊断面板）、`components/setup`（接入引导横幅）。
 * 再建同名桶会重演「同名双义」——正是 P6 同名冲突 KPI 要消灭的问题。故取 `status`：
 * 「本机状态」恰好同时涵盖安装引导进度与健康诊断。
 */

export { useSetupChecklist } from './composables/useSetupChecklist'
export { useSystemDiagnostics } from './composables/useSystemDiagnostics'
