/**
 * S1 · 抽出 kernel 层（L0 设施）。
 *
 * 依据：计划 §4.1。
 * - ui/        无业务语义的设计系统原语与通用控件
 * - http/      HTTP 客户端、CSRF
 * - types/     跨模块类型（后续 S2/S3 把业务类型下沉到模块）
 * - constants/ 跨模块常量
 * - utils/     纯函数工具
 */
export default {
  dirMoves: [
    { from: 'homeos/frontend/src/shared/utils', to: 'homeos/frontend/src/kernel/utils' },
    { from: 'homeos/frontend/src/shared/types', to: 'homeos/frontend/src/kernel/types' },
    { from: 'homeos/frontend/src/shared/constants', to: 'homeos/frontend/src/kernel/constants' },
    { from: 'homeos/frontend/src/components/common/base', to: 'homeos/frontend/src/kernel/ui/primitives' },
    { from: 'homeos/frontend/src/components/list-page-shell', to: 'homeos/frontend/src/kernel/ui/list-page' },
    { from: 'homeos/frontend/src/components/common/asset-manager', to: 'homeos/frontend/src/kernel/ui/asset-picker' },
  ],
  moves: [
    // HTTP 传输层
    { from: 'homeos/frontend/src/services/api/client.ts', to: 'homeos/frontend/src/kernel/http/client.ts' },
    { from: 'homeos/frontend/src/services/api/csrf.ts', to: 'homeos/frontend/src/kernel/http/csrf.ts' },
    // 通用控件（无业务语义）
    { from: 'homeos/frontend/src/shared/components/feedback/StatePanel.vue', to: 'homeos/frontend/src/kernel/ui/StatePanel.vue' },
    { from: 'homeos/frontend/src/components/common/ApiQueryState.vue', to: 'homeos/frontend/src/kernel/ui/ApiQueryState.vue' },
    { from: 'homeos/frontend/src/components/common/AssetGridItem.vue', to: 'homeos/frontend/src/kernel/ui/AssetGridItem.vue' },
    { from: 'homeos/frontend/src/components/common/AssetPickerModal.vue', to: 'homeos/frontend/src/kernel/ui/AssetPickerModal.vue' },
    { from: 'homeos/frontend/src/components/common/ErrorBoundary.vue', to: 'homeos/frontend/src/kernel/ui/ErrorBoundary.vue' },
    { from: 'homeos/frontend/src/components/common/ExitEditConfirmDialog.vue', to: 'homeos/frontend/src/kernel/ui/ExitEditConfirmDialog.vue' },
    { from: 'homeos/frontend/src/components/common/FooterIconPicker.vue', to: 'homeos/frontend/src/kernel/ui/FooterIconPicker.vue' },
    { from: 'homeos/frontend/src/components/common/HaDegradeBanner.vue', to: 'homeos/frontend/src/kernel/ui/HaDegradeBanner.vue' },
    { from: 'homeos/frontend/src/components/common/HaStatusDegradeBanner.vue', to: 'homeos/frontend/src/kernel/ui/HaStatusDegradeBanner.vue' },
    { from: 'homeos/frontend/src/components/common/SceneStage.vue', to: 'homeos/frontend/src/kernel/ui/SceneStage.vue' },
  ],
}
