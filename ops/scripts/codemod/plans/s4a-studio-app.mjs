/**
 * S4a · studio-app 按功能族复原（ui 58 → 18、interaction 20 → 8）。
 *
 * 依据：计划 §5.1。核心判据是「同一职责」而非行数：
 * - `editor-light-toolbar-{dom,options,handles,types}.ts` 文件头自述「从 editor-light-toolbar 拆出」
 * - `editor-3d-{overlay,options,state,watchdog,geometry,selection,wiring}.ts` 自述「从 editor-3d-wiring 拆出」
 * 它们功能上各是一个东西：灯光定向工具条、3D 视口编辑。
 */
const S = 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app'

export default {
  merges: [
    // ---- ui：灯光定向工具条（1 个职责）----
    {
      into: `${S}/ui/light-toolbar.ts`,
      from: [
        `${S}/ui/editor-light-toolbar-types.ts`,
        `${S}/ui/editor-light-toolbar-dom.ts`,
        `${S}/ui/editor-light-toolbar-handles.ts`,
        `${S}/ui/editor-light-toolbar-options.ts`,
        `${S}/ui/editor-light-gizmo-view.ts`,
        `${S}/ui/editor-light-toolbar.ts`,
      ],
      header:
        '/**\n * 灯光定向工具条：DOM 结构、交互状态机、选项装配、几何视图。\n *\n * 为什么是一个文件：这几块共用同一套 `LightToolbar`/`ToolbarDom` 类型与同一份\n * 指针状态机，任何一处改动都要同步其余几处。早期按「便于阅读」拆成 5 个文件，\n * 结果是每次改交互都要跨 5 个文件核对，且拆出的文件头都要写「从 X 拆出」。\n */',
    },

    // ---- ui：3D 视口编辑（1 个职责）----
    {
      into: `${S}/ui/editor-3d.ts`,
      from: [
        `${S}/ui/editor-3d-geometry.ts`,
        `${S}/ui/editor-3d-selection.ts`,
        `${S}/ui/editor-3d-overlay-options.ts`,
        `${S}/ui/editor-3d-overlay-state.ts`,
        `${S}/ui/editor-3d-overlay-watchdog.ts`,
        `${S}/ui/editor-3d-overlay.ts`,
        `${S}/ui/editor-3d-wiring.ts`,
      ],
      header:
        '/**\n * 3D 视口内的物品编辑：坐标换算、选中桥、叠层选项、状态读取、看门狗与装配。\n *\n * 为什么是一个文件：这些部分共享 `StudioAppRuntime` 与同一套相机/几何快照，\n * 装配顺序（arm → refresh → dispose）不可拆。按体量拆成 7 个文件后，\n * 每个文件头都写着「从 editor-3d-wiring 拆出」，说明拆分依据不是职责。\n */',
    },

    // ---- ui：资产库浏览 ----
    {
      into: `${S}/ui/asset-library.ts`,
      from: [
        `${S}/ui/library-mode.ts`,
        `${S}/ui/asset-name-scroll.ts`,
        `${S}/ui/slot-group-view.ts`,
        `${S}/ui/asset-library.ts`,
      ],
    },

    // ---- ui：资产预览 ----
    {
      into: `${S}/ui/asset-preview.ts`,
      from: [`${S}/ui/studio-asset-thumbnail.ts`, `${S}/ui/studio-asset-preview.ts`],
    },

    // ---- ui：全部模态对话框 ----
    {
      into: `${S}/ui/dialogs.ts`,
      from: [
        `${S}/ui/studio-dialog-promise.ts`,
        `${S}/ui/studio-confirm-dialogs.ts`,
        `${S}/ui/save-conflict-dialog.ts`,
        `${S}/ui/export-dialog-wiring.ts`,
      ],
    },

    // ---- ui：领域间事件布线 ----
    {
      into: `${S}/ui/wiring.ts`,
      from: [
        `${S}/ui/studio-chrome-bindings.ts`,
        `${S}/ui/tool-option-wiring.ts`,
        `${S}/ui/window-designer-wiring.ts`,
        `${S}/ui/overlap-and-preview-wiring.ts`,
        `${S}/ui/placed-items-wiring.ts`,
      ],
    },

    // ---- ui：工作区与视口容器 ----
    {
      into: `${S}/ui/workspace.ts`,
      from: [
        `${S}/ui/panel-layout.ts`,
        `${S}/ui/workspace-events.ts`,
        `${S}/ui/popover-dismiss.ts`,
        `${S}/ui/scrollbar-reveal.ts`,
        `${S}/ui/studio-workspace-view.ts`,
      ],
    },

    // ---- ui：视图刷新编排 ----
    {
      into: `${S}/ui/refresh-view.ts`,
      from: [`${S}/ui/refreshStudioView.ts`, `${S}/ui/refreshStudioUiInner.ts`],
    },

    // ---- ui：预览样式与风格运行时 ----
    {
      into: `${S}/ui/preview-style.ts`,
      from: [`${S}/ui/studio-preview-style.ts`, `${S}/ui/studio-natural-wood-runtime.ts`],
    },

    // ---- ui：灯光行与照明范围 ----
    {
      into: `${S}/ui/lighting.ts`,
      from: [
        `${S}/ui/light-signature.ts`,
        `${S}/ui/lighting-scope.ts`,
        `${S}/ui/lighting-row.ts`,
        `${S}/ui/lighting-row-install.ts`,
      ],
    },

    // ---- ui：放置 / 吸附 / 墙面输入 ----
    {
      into: `${S}/ui/placement.ts`,
      from: [
        `${S}/ui/plan-canvas-context.ts`,
        `${S}/ui/snap-controls.ts`,
        `${S}/ui/wall-inputs.ts`,
        `${S}/ui/user-decoration-stage-context.ts`,
        `${S}/ui/user-decoration-placement.ts`,
        `${S}/ui/place-surface-action.ts`,
      ],
    },

    // ---- ui：引导与帮助 ----
    {
      into: `${S}/ui/onboarding.ts`,
      from: [`${S}/ui/step-checklist.ts`, `${S}/ui/studio-tool-help.ts`],
    },

    // ---- interaction：指针输入 ----
    {
      into: `${S}/interaction/pointer-input.ts`,
      from: [
        `${S}/interaction/handlePointerDown.ts`,
        `${S}/interaction/handlePointerUp.ts`,
        `${S}/interaction/pointer-input.ts`,
      ],
    },
    // ---- interaction：拖拽与放置 ----
    {
      into: `${S}/interaction/drag-and-drop.ts`,
      from: [
        `${S}/interaction/editor-3d-drag.ts`,
        `${S}/interaction/list-drag.ts`,
        `${S}/interaction/model-drag-drop.ts`,
        `${S}/interaction/placement-snap-apply.ts`,
      ],
    },
    // ---- interaction：手势与框选 ----
    {
      into: `${S}/interaction/gesture.ts`,
      from: [`${S}/interaction/editor-3d-gesture.ts`, `${S}/interaction/marquee.ts`],
    },
    // ---- interaction：工具选择 ----
    {
      into: `${S}/interaction/tools.ts`,
      from: [
        `${S}/interaction/applyToolSetting.ts`,
        `${S}/interaction/tool-selection.ts`,
        `${S}/interaction/floor-region-tool.ts`,
      ],
    },
    // ---- interaction：拾取 ----
    {
      into: `${S}/interaction/picking.ts`,
      from: [
        `${S}/interaction/editor-picking.ts`,
        `${S}/interaction/hitTestPlanItem.ts`,
        `${S}/interaction/preview-scope.ts`,
      ],
    },
    // ---- interaction：场景标记与表面索引 ----
    {
      into: `${S}/interaction/scene-tags.ts`,
      from: [`${S}/interaction/editor-scene-tags.ts`, `${S}/interaction/editor-surface-index.ts`],
    },
    // ---- interaction：灯光 gizmo ----
    {
      into: `${S}/interaction/light-gizmo.ts`,
      from: [`${S}/interaction/editor-light-gizmo.ts`, `${S}/interaction/editor-light-gizmo-paths.ts`],
    },
  ],
}
