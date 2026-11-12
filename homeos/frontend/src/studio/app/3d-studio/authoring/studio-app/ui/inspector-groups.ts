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

/** 收敛分组：空组整组隐藏、组标题随选中类型换说法、折叠态回放、计数徽标只在折叠时出现。 */
export function syncInspectorGroups(runtime: StudioAppRuntime) {
  const architectureKind = (runtime.INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND as any)[
    runtime.appCtx.selectedItem?.kind
  ]
    ? runtime.appCtx.selectedItem.kind
    : ''
  for (const inspectorGroupElement of runtime.inspectorGroupsElement) {
    const groupName = inspectorGroupElement.dataset.inspectorGroup,
      isCollapsed = runtime.appCtx.inspectorGroupCollapseState[groupName!] === true,
      hasVisibleField = runtime.inspectorGroupHasVisibleField(inspectorGroupElement)
    inspectorGroupElement.hidden = !hasVisibleField
    inspectorGroupElement.classList.toggle('is-collapsed', isCollapsed)
    const groupTitleElement = inspectorGroupElement.querySelector('.inspector-group-title'),
      groupCountElement = inspectorGroupElement.querySelector('.inspector-group-count') as HTMLElement | null
    groupName === 'geometry' &&
      architectureKind &&
      groupTitleElement &&
      (groupTitleElement.textContent = (runtime.INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND as any)[architectureKind])
    inspectorGroupElement.querySelector('.inspector-group-header')?.setAttribute('aria-expanded', String(!isCollapsed))
    if (groupCountElement) {
      const visibleFieldCount = hasVisibleField ? runtime.countInspectorGroupFields(inspectorGroupElement) : 0
      ;(groupCountElement.textContent = visibleFieldCount ? visibleFieldCount + ' 项' : ''),
        (groupCountElement.hidden = !isCollapsed || !visibleFieldCount)
    }
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
