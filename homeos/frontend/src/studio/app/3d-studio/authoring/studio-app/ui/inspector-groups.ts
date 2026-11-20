import type { StudioAppRuntime } from '../runtime/studio-app-runtime'

export function readInspectorGroupCollapseState(runtime: StudioAppRuntime) {
  try {
    const storedState = JSON.parse(window.localStorage.getItem(runtime.INSPECTOR_GROUP_STORAGE_KEY) || '{}')
    return storedState && typeof storedState == 'object' ? storedState : {}
  } catch {
    return {}
  }
}

export function writeInspectorGroupCollapseState(runtime: StudioAppRuntime, collapseState: any) {
  try {
    window.localStorage.setItem(runtime.INSPECTOR_GROUP_STORAGE_KEY, JSON.stringify(collapseState))
  } catch {
    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
  }
}

/** 组内是否还有可见字段。 */
export function inspectorGroupHasVisibleField(_runtime: StudioAppRuntime, inspectorGroupElement: any) {
  const groupBodyElement = inspectorGroupElement.querySelector('.inspector-group-body')
  if (!groupBodyElement) return false
  for (const groupUnitElement of groupBodyElement.children) if (!groupUnitElement.hasAttribute('hidden')) return true
  return false
}

/** 折叠徽标里的字段条数：只数组内当前可见的字段行。 */
export function countInspectorGroupFields(_runtime: StudioAppRuntime, inspectorGroupElement: any) {
  const groupBodyElement = inspectorGroupElement.querySelector('.inspector-group-body')
  if (!groupBodyElement) return 0
  let visibleFieldCount = 0
  for (const groupUnitElement of groupBodyElement.children) {
    if (groupUnitElement.hasAttribute('hidden')) continue
    const leafFieldElements = groupUnitElement.matches('label')
      ? [groupUnitElement]
      : [...groupUnitElement.querySelectorAll('label')]
    visibleFieldCount += leafFieldElements.filter((leafFieldElement) => !leafFieldElement.hasAttribute('hidden')).length
  }
  return visibleFieldCount
}

/**
 * 收敛分组：**只做「组内没有可见字段就整组收起」**。
 *
 * 0.8.7 的属性面板是平铺的 `.field-section` 堆栈，没有分组标题、也没有折叠；
 * 这里保留 `inspector-group` 外壳纯粹是为了按「语义组」做空组回收 ——
 * 否则每组都要自己维护「我的所有字段都 hidden 了吗」，散落在各处必然会漏。
 */
export function syncInspectorGroups(runtime: StudioAppRuntime) {
  for (const inspectorGroupElement of runtime.inspectorGroupsElement) {
    inspectorGroupElement.hidden = !runtime.inspectorGroupHasVisibleField(inspectorGroupElement)
  }
}

/** 折叠 / 展开某个分组并记住选择。 */
export function toggleInspectorGroup(runtime: StudioAppRuntime, inspectorGroupElement: any) {
  const groupName = inspectorGroupElement?.dataset.inspectorGroup
  if (!groupName) return
  runtime.appCtx.inspectorGroupCollapseState = {
    ...runtime.appCtx.inspectorGroupCollapseState,
    [groupName]: !inspectorGroupElement.classList.contains('is-collapsed'),
  }
  runtime.writeInspectorGroupCollapseState(runtime.appCtx.inspectorGroupCollapseState)
  runtime.syncInspectorGroups()
}
