/**
 * 运行时文档的遍历与实体依赖收集。
 *
 * 职责：收集「需要实时状态」的实体 ID 交给订阅层一次性拉取；按条件查找组件（尤其是折线图）；
 * 从别处的同名图表同步属性。
 *
 * 位置：运行时文档工具层，被 home.js 与各控件 runtime 复用；不持有状态，全是纯遍历。
 * 约定：文档模型沿用 components / sharedComponents / sharedComponentIds，与 /api/projects 下发的 JSON 一致。
 */

import { selectedRelatedEntityIds } from "../../shared/related-entities.js?v=20260921151446";
import { isVirtualEntityId } from "../../shared/virtual-entities.js?v=20260921151446";
// 状态条目归一与小写状态文本（变更对象 / 状态对象两种形态）走 `utils/state-entry.js`。
import { resolveStateEntry, stateTextOf } from "../../utils/state-entry.js?v=20260921151446";
/**
 * 判断状态是否需要从后端补历史 / 详情。
 * 空串、unknown、unavailable 都属于「前端拿不到有效读数」，需要触发一次补数据
 * 而不是直接按无效态渲染。
 */
export function lineChartRuntimeStateNeedsHydration(stateOrChange) {
  const stateObject = resolveStateEntry(stateOrChange);
  if (!stateObject) {
    return true;
  }
  const normalizedState = stateTextOf(stateObject);
  return (
    normalizedState === "" || normalizedState === "unknown" || normalizedState === "unavailable"
  );
}
/**
 * 递归收集文档里所有需要实时状态的实体 ID。覆盖面刻意比「绑定的实体」宽——扫地机的
 * 主机 / 地图 / 关联实体与快捷方式、人体感应的安防分区传感器、light-statistics 的统计
 * 实体、weather 的太阳实体（缺省 sun.sun）、more-info(entity) 指定的实体、selectedRelatedEntityIds 也直接决定渲染。虚拟实体一律跳过（由渲染器合成，订阅会被判不存在）。
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
 * 查找顺序刻意「由近及远」：当前页 → 当前页挂载的共享组件 → 其它页 → 全部共享组件。
 * 同一实体可能在多个页面都有图表，取最近的一个做属性来源，当前页看到的样式才符合直觉。
 */
function matchingLineChartComponent(documentModel, page, entityId) {
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
