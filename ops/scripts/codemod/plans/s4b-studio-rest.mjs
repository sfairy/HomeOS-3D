/**
 * S4b · studio-app 其余域按功能族合并。
 *
 * 依据：计划 §5.1。每个目标文件对应「一个职责」：
 * render 绘制管线 / scene-build 场景装配 / lights 灯光系统 / materials 材质 /
 * persistence 草稿读写 / geometry 几何原语 / export 导出 / runtime 装配 / plan 平面坐标。
 */
const S = 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app'

export default {
  merges: [
    // ================= render =================
    {
      into: `${S}/render/render-loop.ts`,
      from: [
        `${S}/render/frame-driver.ts`,
        `${S}/render/render-loop-lifecycle.ts`,
        `${S}/render/render-loop-idle-quality.ts`,
        `${S}/render/render-loop-reflection-probe.ts`,
        `${S}/render/publishRenderStats.ts`,
        `${S}/render/lights-fade.ts`,
        `${S}/render/studio-render-loop.ts`,
      ],
      header:
        '/**\n * 渲染主循环：帧驱动、生命周期、空闲降质、反射探针、统计发布、灯光淡入淡出。\n * 这些环节共享同一份帧状态与同一处 rAF 调度，拆开后每加一个环节都要改 6 个文件。\n */',
    },
    {
      into: `${S}/render/camera.ts`,
      from: [`${S}/render/camera.ts`, `${S}/render/camera-frames.ts`, `${S}/render/orbit-controls.ts`],
    },
    {
      into: `${S}/render/renderer.ts`,
      from: [
        `${S}/render/acquireRenderSurface.ts`,
        `${S}/render/createStudioRenderer.ts`,
        `${S}/render/renderer-resize.ts`,
        `${S}/render/studio-render-release.ts`,
      ],
    },
    {
      into: `${S}/render/render-metrics.ts`,
      from: [`${S}/render/render-budget.ts`, `${S}/render/stats.ts`],
    },

    // ================= scene-build =================
    {
      into: `${S}/scene-build/build-scene.ts`,
      from: [
        `${S}/scene-build/mesh-builders.ts`,
        `${S}/scene-build/shared-meshes.ts`,
        `${S}/scene-build/scene-layers.ts`,
        `${S}/scene-build/scene-payload-build.ts`,
        `${S}/scene-build/buildStudioScene.ts`,
      ],
      header:
        '/**\n * 场景装配：网格构建器、共享网格池、图层组织、载荷解析与总装。\n * 拆分曾让「加一类物体」需要在 5 个文件里各加一段，装配顺序难以一次看全。\n */',
    },
    {
      into: `${S}/scene-build/floor.ts`,
      from: [
        `${S}/scene-build/floor-build.ts`,
        `${S}/scene-build/floor-actions.ts`,
        `${S}/scene-build/floor-region-visuals.ts`,
        `${S}/scene-build/studio-wall-preview.ts`,
      ],
    },
    {
      into: `${S}/scene-build/background.ts`,
      from: [`${S}/scene-build/background-image.ts`, `${S}/scene-build/background-refresh.ts`],
    },
    {
      into: `${S}/scene-build/scene-lifecycle.ts`,
      from: [
        `${S}/scene-build/scene-rebuild.ts`,
        `${S}/scene-build/scene-ready-warmup.ts`,
        `${S}/scene-build/scene-wait.ts`,
        `${S}/scene-build/stage-bridge.ts`,
      ],
    },

    // ================= lights =================
    {
      into: `${S}/lights/lighting.ts`,
      from: [
        `${S}/lights/base-lighting.ts`,
        `${S}/lights/beginLightingPreview.ts`,
        `${S}/lights/lighting-shader-failsafe.ts`,
        `${S}/lights/precompile.ts`,
        `${S}/lights/preview-meshes.ts`,
        `${S}/lights/save-auto-diagram-lighting.ts`,
      ],
    },
    {
      into: `${S}/lights/light-groups.ts`,
      from: [`${S}/lights/light-groups.ts`, `${S}/lights/light-group-rows.ts`, `${S}/lights/light-group-targets.ts`],
    },
    {
      into: `${S}/lights/light-areas.ts`,
      from: [`${S}/lights/light-areas.ts`, `${S}/lights/light-shape-sync.ts`],
    },
    {
      into: `${S}/lights/shadows.ts`,
      from: [`${S}/lights/scene-shadows.ts`, `${S}/lights/scene-shadows-control.ts`],
    },
    {
      into: `${S}/lights/weather-atmosphere.ts`,
      from: [`${S}/lights/weather-atmosphere.ts`, `${S}/lights/weather-host-messages.ts`],
    },

    // ================= materials =================
    {
      into: `${S}/materials/materials.ts`,
      from: [
        `${S}/materials/item-materials.ts`,
        `${S}/materials/material-edit.ts`,
        `${S}/materials/material-slot-ui.ts`,
        `${S}/materials/surface-panel.ts`,
        `${S}/materials/style-chip.ts`,
      ],
    },
    {
      into: `${S}/materials/door-materials.ts`,
      from: [`${S}/materials/door-materials.ts`, `${S}/materials/door-theme.ts`],
    },

    // ================= persistence =================
    {
      into: `${S}/persistence/draft.ts`,
      from: [
        `${S}/persistence/applyLoadedDraft.ts`,
        `${S}/persistence/draft-state.ts`,
        `${S}/persistence/save.ts`,
        `${S}/persistence/scene-sync.ts`,
      ],
    },
    { into: `${S}/persistence/history.ts`, from: [`${S}/persistence/history.ts`] },

    // ================= geometry =================
    {
      into: `${S}/geometry/geometry.ts`,
      from: [
        `${S}/geometry/bounds.ts`,
        `${S}/geometry/cylinder-mesh.ts`,
        `${S}/geometry/downlight-range.ts`,
        `${S}/geometry/item-orientation.ts`,
      ],
    },
    {
      into: `${S}/geometry/floor-geometry.ts`,
      from: [`${S}/geometry/floor-edge.ts`, `${S}/geometry/ground-grid.ts`],
    },

    // ================= export =================
    {
      into: `${S}/export/export.ts`,
      from: [
        `${S}/export/decoration-model-guard.ts`,
        `${S}/export/export-flow.ts`,
        `${S}/export/export-preset-dialogs.ts`,
        `${S}/export/export-presets.ts`,
        `${S}/export/generateExportBundle.ts`,
        `${S}/export/openExportPanel.ts`,
      ],
      header:
        '/**\n * 导出：预设、对话框、渲染取图、打包与装饰模型守卫。\n * 导出一条链路的每一步都依赖前一步的产物，分散在 6 个文件里无法一次核对。\n */',
    },

    // ================= runtime =================
    {
      into: `${S}/runtime/studio-app-runtime.ts`,
      from: [`${S}/runtime/studio-app-runtime.ts`, `${S}/runtime/workflow.ts`],
    },
    { into: `${S}/runtime/shortcuts.ts`, from: [`${S}/runtime/global-shortcuts.ts`] },
    { into: `${S}/runtime/messages.ts`, from: [`${S}/runtime/auto-diagram-messages.ts`] },

    // ================= plan =================
    { into: `${S}/plan/plan.ts`, from: [`${S}/plan/plan-coords.ts`, `${S}/plan/world-points.ts`] },
  ],
}
