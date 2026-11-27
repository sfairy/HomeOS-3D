/**
 * S11 · 压平 studio 目录（消除命名冗余与过度嵌套）。
 *
 * 现状问题：`studio/app/3d-studio/authoring/studio-app/ui/editor-3d.ts` 是 7 层路径，
 * 其中 "studio" 出现 3 次、"app" 2 次。目录在重复表达同一个概念，
 * import 只能全部依赖别名，结构反而看不出层次。
 *
 * 目标：把「3D 创作」收成一个顶层域 `studio/authoring/`，深度从 7 降到 3-4：
 *
 *   studio/app/3d-studio/authoring/studio-app/ui/x.ts   → studio/authoring/ui/x.ts
 *   studio/app/3d-studio/plan/x.ts                      → studio/authoring/plan/x.ts
 *   studio/app/3d-studio/materials/x.ts                 → studio/authoring/materials/x.ts
 *
 * 同语义的目录直接合并（已核对零文件名冲突）：
 * - studio-app/materials + materials
 * - studio-app/export     + export
 * - studio-app/plan       + plan
 * - studio-app/lights     + authoring/lights
 * - studio-app/ui         + authoring/ui
 *
 * 保留在 `studio/app/` 的是**组装与共享层**：bridge（与 runtime 的桥）、shared、
 * state、display、auth、logging、editor、renderer。它们仍受
 * `app ↛ runtime` / 叶子层规则约束，压平不移除边界。
 */
const S = 'homeos/frontend/src/studio/app/3d-studio'

export default {
  dirMoves: [
    // —— studio-app 的 11 个域提升为 authoring 的一级域 ——
    { from: `${S}/authoring/studio-app/ui`, to: 'homeos/frontend/src/studio/authoring/ui' },
    { from: `${S}/authoring/studio-app/interaction`, to: 'homeos/frontend/src/studio/authoring/interaction' },
    { from: `${S}/authoring/studio-app/render`, to: 'homeos/frontend/src/studio/authoring/render' },
    { from: `${S}/authoring/studio-app/scene-build`, to: 'homeos/frontend/src/studio/authoring/scene-build' },
    { from: `${S}/authoring/studio-app/persistence`, to: 'homeos/frontend/src/studio/authoring/persistence' },
    { from: `${S}/authoring/studio-app/geometry`, to: 'homeos/frontend/src/studio/authoring/geometry' },
    { from: `${S}/authoring/studio-app/runtime`, to: 'homeos/frontend/src/studio/authoring/runtime' },

    // —— 同语义目录合并（零冲突）——
    { from: `${S}/authoring/studio-app/materials`, to: 'homeos/frontend/src/studio/authoring/materials' },
    { from: `${S}/authoring/studio-app/export`, to: 'homeos/frontend/src/studio/authoring/export' },
    { from: `${S}/authoring/studio-app/plan`, to: 'homeos/frontend/src/studio/authoring/plan' },
    { from: `${S}/authoring/studio-app/lights`, to: 'homeos/frontend/src/studio/authoring/lights' },

    // —— authoring 原有子域上移 ——
    { from: `${S}/authoring/items`, to: 'homeos/frontend/src/studio/authoring/items' },
    { from: `${S}/authoring/scene`, to: 'homeos/frontend/src/studio/authoring/scene' },
    { from: `${S}/authoring/lights`, to: 'homeos/frontend/src/studio/authoring/lights' },
    { from: `${S}/authoring/store`, to: 'homeos/frontend/src/studio/authoring/store' },
    { from: `${S}/authoring/boot`, to: 'homeos/frontend/src/studio/authoring/boot' },
    { from: `${S}/authoring/types`, to: 'homeos/frontend/src/studio/authoring/types' },
    { from: `${S}/authoring/ui`, to: 'homeos/frontend/src/studio/authoring/ui' },

    // —— 3d-studio 其余域上移 ——
    { from: `${S}/plan`, to: 'homeos/frontend/src/studio/authoring/plan' },
    { from: `${S}/materials`, to: 'homeos/frontend/src/studio/authoring/materials' },
    { from: `${S}/reflection`, to: 'homeos/frontend/src/studio/authoring/reflection' },
    { from: `${S}/loaders`, to: 'homeos/frontend/src/studio/authoring/loaders' },
    { from: `${S}/render-kit`, to: 'homeos/frontend/src/studio/authoring/render-kit' },
    { from: `${S}/cache`, to: 'homeos/frontend/src/studio/authoring/cache' },
    { from: `${S}/export`, to: 'homeos/frontend/src/studio/authoring/export' },
  ],
  moves: [
    // —— 根级文件 ——
    { from: `${S}/stage-startup.ts`, to: 'homeos/frontend/src/studio/authoring/stage-startup.ts' },
    { from: `${S}/studio-gpu-compat.ts`, to: 'homeos/frontend/src/studio/authoring/studio-gpu-compat.ts' },
    { from: `${S}/studio-preview-transforms.ts`, to: 'homeos/frontend/src/studio/authoring/studio-preview-transforms.ts' },
    { from: `${S}/studio-resource-policy.ts`, to: 'homeos/frontend/src/studio/authoring/studio-resource-policy.ts' },
    { from: `${S}/authoring/lifecycle.ts`, to: 'homeos/frontend/src/studio/authoring/lifecycle.ts' },
    { from: `${S}/authoring/studio-context-resources.ts`, to: 'homeos/frontend/src/studio/authoring/studio-context-resources.ts' },
    { from: `${S}/authoring/studio-edit-metrics.ts`, to: 'homeos/frontend/src/studio/authoring/studio-edit-metrics.ts' },
    { from: `${S}/authoring/studio-effect-cache.ts`, to: 'homeos/frontend/src/studio/authoring/studio-effect-cache.ts' },
    { from: `${S}/authoring/studio-interaction-batches.ts`, to: 'homeos/frontend/src/studio/authoring/studio-interaction-batches.ts' },
    { from: `${S}/authoring/studio-orbit-controls.ts`, to: 'homeos/frontend/src/studio/authoring/studio-orbit-controls.ts' },
    { from: `${S}/authoring/studio-preview-resources.ts`, to: 'homeos/frontend/src/studio/authoring/studio-preview-resources.ts' },
    { from: `${S}/authoring/studio-shadow-receiver-trial.ts`, to: 'homeos/frontend/src/studio/authoring/studio-shadow-receiver-trial.ts' },
    { from: `${S}/authoring/studio-shared-geometry-cache.ts`, to: 'homeos/frontend/src/studio/authoring/studio-shared-geometry-cache.ts' },

    // —— studio-app 自身的入口与上下文 ——
    { from: `${S}/authoring/studio-app/boot.ts`, to: 'homeos/frontend/src/studio/authoring/app-boot.ts' },
    { from: `${S}/authoring/studio-app/studio-app-context.ts`, to: 'homeos/frontend/src/studio/authoring/app-context.ts' },
    { from: `${S}/authoring/studio-app/studio-render-context.ts`, to: 'homeos/frontend/src/studio/authoring/render-context.ts' },
  ],
}
