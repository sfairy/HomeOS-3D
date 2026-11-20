/**
 * 运行时侧的风格表入口（公开 URL `/api/v1/modules/interaction3d/core/scene-styles.js`）。
 *
 * 实现在 `@app/shared/scene-styles`：户型绘制、运行时舞台与编辑器必须共用同一份 id 与
 * 背景选项，另建一份实现就会出现「编辑器能选、舞台不认」。这里只做公开路径的转发，
 * 让运行时的 `.js` 入口与主应用共用同一模块实例。
 */
export {
  DEFAULT_SCENE_POPUP_COLORS,
  NATURAL_BACKDROP_REVISION,
  NATURAL_SCENE_POPUP_COLORS,
  SCENE_STYLES,
  WARM_SCENE_POPUP_COLORS,
  isWarmSceneStyle,
  normalizeSceneStyle,
  sceneMotionRenderScale,
  scenePopupDefaultColors,
  sceneStyleHasBackgroundMotion,
  sceneStyleLabel,
  warmBackgroundChoices,
  type SceneStyleId,
} from '@app/shared/scene-styles'
