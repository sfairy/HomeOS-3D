/**
 * P3 · 合并「因行数门禁被硬拆」的同一职责。
 *
 * 判据：这些文件的头注释自己承认拆分依据不是职责，而是「压行数门禁 / 避免膨胀 / 纯移动」。
 * 按「一个文件 = 一个职责，行数无关」合并回去。
 *
 * 每个族的 from 顺序 = 依赖在前、宿主最后（合并后 const 的声明顺序必须合法）。
 */
const S = 'homeos/frontend/src'

export default {
  merges: [
    // ── 1) 物品类型目录：4 个纯数据分片 + 装配点 ──────────────────────────
    // 分片自述：「从 item-catalog.ts 拆出的纯数据分片：只含 类型 → 名称/字形/尺寸/离地/颜色
    // 的字面量，不含任何逻辑」。它们是同一张目录表的不同族切片。
    {
      into: `${S}/studio/authoring/items/item-catalog.ts`,
      from: [
        `${S}/studio/authoring/items/catalog/decor-light.ts`,
        `${S}/studio/authoring/items/catalog/furniture.ts`,
        `${S}/studio/authoring/items/catalog/kitchen-bath.ts`,
        `${S}/studio/authoring/items/catalog/garden.ts`,
        `${S}/studio/authoring/items/item-catalog.ts`,
      ],
      header:
        '/**\n * 物品类型目录：类型 → 名称/字形/尺寸/离地/颜色的唯一真源。\n *\n * 曾按族拆成 4 个数据分片（furniture / kitchen-bath / decor-light / garden），\n * 但它们都是同一张表的不同切片 —— 「一个职责一个文件」下应是一份数据表。\n * 各族的边界由文件内的 `// ── 分区 ──` 注释保留。\n */',
    },

    // ── 2) 平面几何：纯函数被拆成 4 片并靠 export * 缝回 ────────────────
    // 分片自述：「从 geometry.ts 拆出（纯移动，无逻辑改动）」；且拆分是为了避免
    // geometry ↔ geometry-polygons 的跨文件环 —— 合并到同一文件后环自然消失。
    {
      into: `${S}/studio/authoring/plan/geometry.ts`,
      from: [
        `${S}/studio/authoring/plan/geometry-clamp.ts`,
        `${S}/studio/authoring/plan/geometry-primitives.ts`,
        `${S}/studio/authoring/plan/geometry-polygons.ts`,
        `${S}/studio/authoring/plan/geometry-light-budget.ts`,
        `${S}/studio/authoring/plan/geometry.ts`,
      ],
      header:
        '/**\n * 平面几何：数值夹取、点/线原语、多边形布尔、光照预算。\n *\n * 曾按「纯移动」拆成 4 个分片，再由 `geometry.ts` 用 `export *` 缝回；\n * 拆分动机是避免 geometry ↔ polygons 的跨文件环 —— 同文件后环不存在。\n */',
    },

    // ── 3) 区域灯：shader 与 CPU 采样必须逐字对应 ────────────────────────
    // 分片自述：「shader 与 CPU 采样必须逐字对应，分到两个文件后就没人拦得住它们漂移了」。
    {
      into: `${S}/studio/authoring/plan/studio-plan2-region.ts`,
      from: [
        `${S}/studio/authoring/plan/studio-plan2-wall-shading.ts`,
        `${S}/studio/authoring/plan/studio-plan2-region.ts`,
      ],
      header:
        '/**\n * 区域灯（轻量柔光）：标定常量、灯键/覆盖清洗、受光体分类、注入材质的 GLSL 片段，\n * 以及给 sample() 与体检用的 CPU 版体积采样。\n *\n * shader 与 CPU 采样必须逐字对应 —— 拆成两个文件后没人拦得住它们漂移，故合为一处。\n */',
    },

    // ── 4) 接触阴影：地面支撑层探测是它的一半 ─────────────────────────────
    {
      into: `${S}/studio/authoring/plan/studio-plan2-contact-shadows.ts`,
      from: [
        `${S}/studio/authoring/plan/studio-plan2-contact-surface-levels.ts`,
        `${S}/studio/authoring/plan/studio-plan2-contact-shadows.ts`,
      ],
    },

    // ── 5) 实体派生数据：62 行的壳只做 re-export ─────────────────────────
    {
      into: `${S}/domain/entity/model/utils/derived.ts`,
      from: [
        `${S}/domain/entity/model/utils/derived-internals.ts`,
        `${S}/domain/entity/model/utils/derived-route.util.ts`,
        `${S}/domain/entity/model/utils/derived.util.ts`,
      ],
      header:
        '/**\n * 实体派生数据：累加器（在线数 / 灯数 / 空调数 / 电池 / 离线 / 传感器索引 / 域计数）、\n * 路由感知的 debounce 调节、以及按域收集候选 entity_id。\n *\n * 曾被切成 internals + route + util 三个文件，其中 util 只有 62 行且 20 行是纯 re-export。\n */',
    },

    // ── 6) 组件模板：6 个纯数据分片 ──────────────────────────────────────
    // 分片自述：「从 component-templates.ts 拆出的纯数据分片：数组元素就是模板对象」。
    {
      into: `${S}/studio/app/editor/component-templates.ts`,
      from: [
        `${S}/studio/app/editor/component-templates/shared-defaults.ts`,
        `${S}/studio/app/editor/component-templates/layout.ts`,
        `${S}/studio/app/editor/component-templates/display.ts`,
        `${S}/studio/app/editor/component-templates/control.ts`,
        `${S}/studio/app/editor/component-templates/button.ts`,
        `${S}/studio/app/editor/component-templates/media.ts`,
        `${S}/studio/app/editor/component-templates.ts`,
      ],
      header:
        '/**\n * 组件模板目录：新增组件时可选的全部模板对象（id / 名称 / 默认属性 / 图标 / 尺寸）。\n *\n * 曾按类型拆成 6 个纯数据分片，但它们都是同一个模板数组的不同片段 —— 合并为一份数据表。\n */',
    },
  ],
}
