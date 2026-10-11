/**
 * 入户页场景壳的**取值面**：两个前端（主应用 / 授权商店）共用同一套字段名与取值规则。
 *
 * 页面字典仍留在各自域内（主应用 `src/components/common/scene-values.ts`、商店
 * `src/components/scene-values.ts`）—— 文案是各域的内容，不该塞进共享包；这里单点化的
 * 是 `SceneStage.vue`（本包 `components/`）与那两份字典之间的**契约**：字段名一旦两边
 * 不一致，某个前端左栏就会整块空掉，而类型检查发现不了（两个字典各自自洽）。
 */

/** 所有页面共享的壳信息：只在品牌层面变化的字段。 */
export interface SceneShell {
  /** 状态灯的 title。 */
  SHELL_TITLE: string
  /** 页脚/角标里的站点名。 */
  SHELL_NAME: string
  /** 左上角标记图。 */
  LOGO_SRC: string
}

/** 单个页面的左栏文案。 */
export interface SceneValues {
  /** 状态灯的文案。 */
  STATUS_LABEL: string
  /** 主标题。 */
  TITLE: string
  /** 副标题。 */
  TAGLINE: string
  /** 档案区标题。 */
  DOSSIER_LABEL: string
  /** 档案键值对。 */
  DOSSIER: Array<[string, string]>
}

/** 渲染 `SceneStage.vue` 所需的全部字段：壳信息 + 页面文案。 */
export type SceneTokens = SceneValues & SceneShell

/**
 * 取某页的展示字段：命中不到就退回 `fallbackKey`。
 *
 * 两个前端的「主页面」不同（主应用 `login`、商店 `store`），所以兜底页由调用方点名，
 * 而不是在这里写死 —— 写死会让另一侧退回到一个它没有的页面。
 */
export function resolveSceneValues(
  shell: SceneShell,
  pages: Record<string, SceneValues>,
  page: string | undefined,
  fallbackKey: string,
): SceneTokens {
  const found = (page && pages[page]) || pages[fallbackKey]
  if (!found) {
    throw new Error(`SceneValues 缺少兜底页「${fallbackKey}」：${Object.keys(pages).join('、')}`)
  }
  return { ...shell, ...found }
}
