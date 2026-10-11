/**
 * `shared/status/`：以只读方式向 shell / UI 暴露「本机状态」的共享域。
 *
 * 成员是 `@/services/api/system` 的薄包装（安装引导清单、健康诊断）。消费者在 shared 之上
 * （`components/setup`、`composables/ui`），依赖全在 shared 之下，故归位 `shared/`。
 * 不叫 system/diagnostics/setup：这些桶名在本仓库已各有其主，避免同名双义。
 */

export { useSetupChecklist } from './composables/useSetupChecklist'
export { useSystemDiagnostics } from './composables/useSystemDiagnostics'
