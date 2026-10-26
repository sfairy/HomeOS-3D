/**
 * 「HA 场景」下拉的纯派生逻辑（从 `useHomeosSceneOptions` 里抽出来是为了能单测）。
 *
 * 这里刻意不 import `@/…` 运行时代码，也不 import Vue：Node 的 type-stripping 能直接跑，
 * 单测因此零构建。
 */

/** 下拉选项：值 / 标签 / 分组 / 提示 */
export interface HomeosSceneSelectOption {
  value: string
  label: string
  group?: string
  hint?: string
}

/** 场景记录的最小形状（与 `HaSceneScriptRecord` 结构兼容）。 */
export interface SceneOptionSource {
  id?: unknown
  name?: unknown
}

export interface SceneOptionsBuildOptions {
  /** 是否前置「不联动场景」空选项。 */
  includeEmpty: boolean
  /** 空选项标签文案。 */
  emptyLabel: string
}

/**
 * 把场景记录映射为下拉选项。
 *
 * 口径：`value` 必须非空（空 id 的脏数据不进入选项，否则会多出一条选不中的幽灵项）；
 * `label` 优先 `name`，其次 `id`。
 */
export function buildSceneOptions(
  scenes: readonly SceneOptionSource[],
  opts: SceneOptionsBuildOptions,
): HomeosSceneSelectOption[] {
  const items = scenes
    .map((scene) => ({
      value: String(scene.id ?? '').trim(),
      label: String(scene.name || scene.id || '').trim() || String(scene.id ?? ''),
      group: 'HA 场景',
      hint: 'HA 执行',
    }))
    .filter((option) => option.value)

  if (!opts.includeEmpty) return items
  return [{ value: '', label: opts.emptyLabel, group: '' }, ...items]
}

/**
 * 场景集合的轻量签名：`scene.*` 的 id + `friendly_name`。
 *
 * 用它做 `watch` 的依赖，而不是 deep watch 整张实体表 —— 实体表里每次状态推送（亮度 /
 * 温度）都会变，场景列表却不变，deep watch 会让下拉框在每次状态推送时重建。
 */
export function sceneEntitiesSignature(
  entities: Record<string, unknown> | null | undefined,
): string {
  const map = entities ?? {}
  return Object.keys(map)
    .filter((id) => id.startsWith('scene.'))
    .sort()
    .map((id) => {
      const entity = map[id] as { attributes?: Record<string, unknown> } | undefined
      // 这里要的是 `friendly_name` 的**原值**做签名字符串（变了就重算），不走
      // `getEntityDisplayName` 的展示名回退链 —— 回退会让「改名」与「实体缺失」不可区分。
      // 而且本文件刻意不 import `@/…`，Node 才能零构建直接跑单测。
      // eslint-disable-next-line no-restricted-syntax
      const friendly = entity?.attributes?.friendly_name
      return typeof friendly === 'string' ? `${id}:${friendly}` : id
    })
    .join('|')
}
