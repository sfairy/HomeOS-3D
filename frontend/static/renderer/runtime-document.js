/**
 * 运行时文档的遍历与实体依赖收集。
 *
 * 职责：
 * - 从一份仪表盘文档里收集「需要实时状态」的实体 ID，交给状态订阅层一次性拉取；
 * - 按条件在文档树里查找组件（尤其是折线图）；
 * - 从别处的同名图表同步属性。
 *
 * 位置：运行时的文档工具层，被 home.js 与各控件 runtime 复用；
 * 不持有状态，所有函数都是纯遍历。
 *
 * 约定：文档模型沿用面板文档的字段名（components / sharedComponents / sharedComponentIds），
 * 与后端 /api/projects 下发的 JSON 结构一致。
 */

import { selectedRelatedEntityIds } from "../related-entities.js?v=20260919214245";
import { isVirtualEntityId } from "../virtual-entities.js?v=20260919214245";
// 状态条目归一（变更对象 / 状态对象两种形态）走 `utils/state-entry.js` 的 `resolveStateEntry`：
// 本文件原先内联了 `stateOrChange?.newState || stateOrChange`（P12 状态条目内联收口）。
import { resolveStateEntry } from "../utils/state-entry.js?v=20260919214245";
/**
 * 判断状态是否需要从后端补历史 / 详情。
 *
 * 空串、unknown、unavailable 都属于「前端拿不到有效读数」，
 * 需要触发一次补数据而不是直接按无效态渲染。
 *
 * @param {object} stateOrChange 状态对象或变更对象。
 * @returns {boolean} 需要补数据时返回 true。
 */
export function lineChartRuntimeStateNeedsHydration(stateOrChange) {
  const stateObject = resolveStateEntry(stateOrChange);
  if (!stateObject) {
    return true;
  }
  const normalizedState = String(stateObject.state ?? "")
    .trim()
    .toLowerCase();
  return (
    normalizedState === "" || normalizedState === "unknown" || normalizedState === "unavailable"
  );
}
/**
 * 递归收集文档里所有需要实时状态的实体 ID。
 *
 * 覆盖面刻意做得比「绑定的实体」宽，因为以下位置的状态也直接决定渲染结果：
 * - interaction3d 的扫地机：主机、地图、关联实体与各快捷方式各自绑定的实体；
 * - interaction3d 的人体感应：安防分区里配置的传感器；
 * - light-statistics：统计卡片列出的所有实体；
 * - weather：太阳实体（缺省 sun.sun），用于昼 / 夜判断；
 * - more-info 动作且弹窗来源为 entity 时指定的实体；
 * - 与控件关联的相关实体（selectedRelatedEntityIds）。
 *
 * 虚拟实体一律跳过：它们由渲染器自己合成，向后端订阅会被判为不存在。
 *
 * @param {Array<object>} components 组件数组，可为任意层级。
 * @param {Set<string>} [entityIdSet] 复用的结果集合，便于外部追加已有 ID。
 * @returns {Set<string>} 收集到的实体 ID 集合。
 */
export function collectEntityIds(components, entityIdSet = new Set()) {
  for (const component of components || []) {
    for (const binding of Object.values(component.bindings || {})) {
      if (binding?.entityId && !isVirtualEntityId(binding.entityId)) {
        entityIdSet.add(binding.entityId);
      }
    }
    if (component.type === "interaction3d") {
      for (const vacuum of component.properties?.devices?.vacuums || []) {
        for (const entityIdCandidate of [
          vacuum.entityId,
          vacuum.map?.entityId,
          ...(vacuum.relatedEntityIds || []),
          ...(vacuum.shortcuts || []).map(shortcut => shortcut.entityId)
        ]) {
          if (entityIdCandidate && !isVirtualEntityId(entityIdCandidate)) {
            entityIdSet.add(entityIdCandidate);
          }
        }
      }
    }
    if (component.type === "interaction3d") {
      for (const presenceSensor of component.properties?.security?.presenceSensors || []) {
        if (presenceSensor.entityId && !isVirtualEntityId(presenceSensor.entityId)) {
          entityIdSet.add(presenceSensor.entityId);
        }
      }
    }
    if (component.type === "light-statistics") {
      for (const configuredEntityId of Array.isArray(component.properties?.entityIds)
        ? component.properties.entityIds
        : []) {
        if (configuredEntityId && !isVirtualEntityId(configuredEntityId)) {
          entityIdSet.add(String(configuredEntityId));
        }
      }
    }
    if (component.type === "weather") {
      // 天气控件总能拿到太阳实体：用户未绑定时的缺省值就是 HA 内置的 sun.sun。
      entityIdSet.add(component.bindings?.sun?.entityId || "sun.sun");
    }
    for (const action of Object.values(component.actions || {})) {
      if (
        action?.type === "more-info" &&
        action.data?.popupSource === "entity" &&
        action.data?.entityId &&
        !isVirtualEntityId(action.data.entityId)
      ) {
        entityIdSet.add(action.data.entityId);
      }
    }
    for (const relatedEntityId of selectedRelatedEntityIds(component) || []) {
      entityIdSet.add(relatedEntityId);
    }
    // 子组件与兄弟组件一样可能带绑定，必须继续下钻。
    collectEntityIds(component.children, entityIdSet);
  }
  return entityIdSet;
}
/**
 * 递归收集满足条件的组件。
 *
 * @param {Array<object>} inputComponents 待遍历的组件数组。
 * @param {function(object): boolean} predicate 判定函数，返回 true 即收录。
 * @param {Array<object>} [matches] 复用的结果数组。
 * @returns {Array<object>} 命中的组件，顺序为父组件先于其子组件。
 */
export function collectComponents(inputComponents, predicate, matches = []) {
  for (const currentComponent of inputComponents || []) {
    if (predicate(currentComponent)) {
      matches.push(currentComponent);
    }
    collectComponents(currentComponent.children, predicate, matches);
  }
  return matches;
}
/**
 * 找出与指定实体绑定的折线图组件。
 *
 * 查找顺序是刻意的「由近及远」：当前页 → 当前页挂载的共享组件 → 其它页 → 全部共享组件。
 * 同一实体可能在多个页面都有图表，取最近的一个做属性来源，用户在当前页看到的样式才符合直觉。
 *
 * @param {object} documentModel 文档模型，含 pages 与 sharedComponents。
 * @param {object} page 当前页模型。
 * @param {string} entityId 目标实体 ID。
 * @returns {object|null} 命中的折线图组件，找不到返回 null。
 */
export function matchingLineChartComponent(documentModel, page, entityId) {
  // 判定组件是否为「绑定了目标实体」的折线图：类型与 entityId 都要匹配。它是纯判定
  // 无副作用，所以能直接当 collectComponents 的 predicate 复用多次，对应下面
  // 「当前页 → 共享组件 → 其它页 → 全部共享组件」由近及远的查找顺序。
  const isLineChartForEntity = candidateComponent =>
    candidateComponent.type === "line-chart" &&
    candidateComponent.bindings?.entity?.entityId === entityId;
  const directMatch = collectComponents(page?.components || [], isLineChartForEntity)[0];
  if (directMatch) {
    return directMatch;
  }
  // 共享组件可能被多次挂载，先按 ID 建索引，避免对每个挂载点重复全量扫描。
  const sharedComponentsById = new Map(
    (documentModel?.sharedComponents || []).map(sharedComponent => [
      sharedComponent.id,
      sharedComponent
    ])
  );
  // 取出当前页真正挂载的共享组件；sharedComponentIds 里可能有已删除的悬空 ID，用 filter 剔除。
  const sharedComponents = (page?.sharedComponentIds || [])
    .map(sharedComponentId => sharedComponentsById.get(sharedComponentId))
    .filter(Boolean);
  const sharedMatch = collectComponents(sharedComponents, isLineChartForEntity)[0];
  if (sharedMatch) {
    return sharedMatch;
  }
  for (const candidatePage of documentModel?.pages || []) {
    if (candidatePage === page) {
      continue;
    }
    const pageMatch = collectComponents(candidatePage.components || [], isLineChartForEntity)[0];
    if (pageMatch) {
      return pageMatch;
    }
  }
  return collectComponents(documentModel?.sharedComponents || [], isLineChartForEntity)[0] || null;
}
/**
 * 生成折线图的属性：以别处同名图表的属性为底，再被显式覆盖项压过。
 *
 * @param {object} documentSnapshot 文档快照。
 * @param {object} currentPage 当前页。
 * @param {string} targetEntityId 目标实体 ID。
 * @param {object} [overrides] 调用方指定的属性覆盖。
 * @returns {object} 合并后的属性对象。
 */
export function syncedLineChartProperties(
  documentSnapshot,
  currentPage,
  targetEntityId,
  overrides = {}
) {
  return {
    ...(matchingLineChartComponent(documentSnapshot, currentPage, targetEntityId)?.properties ||
      {}),
    ...(overrides || {})
  };
}
