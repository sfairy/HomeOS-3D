/**
 * 页面背景（0.8.9）—— studio 侧的**转发门面**。
 *
 * 为什么要有双宿主（决策见升级文档 §12.6）：
 *
 * - 主页面是 studio 文档，按页渲染，所以背景是**文档组件**（`type: 'page-background'`，
 *   每页独立、可撤销/复制/导出）；
 * - 侧边栏是 `layoutConfig.rightPanelWidgets` 的 Vue 部件系统，全局唯一，所以背景落在
 *   `layoutConfig.sidebarBackground`。
 *
 * 两者共用同一份**预设表 + 归一化 + 取图地址**，保证「同一种背景」在两处长得一样、
 * 字段取值范围一致、切换预设后不会一处生效一处不生效。
 *
 * 实现在 `@/shared/utils/widget/page-background.util`：布局 store 也要用它归一化
 * 侧边栏背景，而 store 不能依赖 `studio/**`（否则 3D 子图会被拉进首屏）。
 * 这里保留 `@/studio/app/shared/page-background` 这个导入路径，让 studio 代码不必
 * 关心实现放在哪一层。
 *
 * 与 0.8.9 的差异（有意，需在验收中登记）：
 * 1. 侧边栏背景是全局配置，不随页切换；
 * 2. 侧边栏背景从「外观设置」编辑，不出现在仪表盘编辑器的组件列表里；
 * 3. 主页面背景仍是文档组件，与 0.8.9 一致。
 */

export {
  DEFAULT_PAGE_BACKGROUND,
  PAGE_BACKGROUND_FILL_POSITION,
  PAGE_BACKGROUND_LABEL_LIMIT,
  PAGE_BACKGROUND_LAYOUTS,
  PAGE_BACKGROUND_PRESETS,
  PAGE_BACKGROUND_SOURCES,
  PAGE_BACKGROUND_TYPE,
  createPageBackground,
  isPageBackground,
  normalizePageBackground,
  pageBackgroundCss,
  pageBackgroundPreset,
  pageBackgroundPresetSource,
  samePageBackground,
} from '@/kernel/utils/widget/page-background.util'

export type {
  PageBackground,
  PageBackgroundConfig,
  PageBackgroundLayout,
  PageBackgroundPosition,
  PageBackgroundSource,
} from '@/kernel/utils/widget/page-background.util'
