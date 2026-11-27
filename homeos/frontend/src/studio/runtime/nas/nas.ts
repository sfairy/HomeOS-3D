import { domElement } from '@app/shared/util/dom-factory'
import { formatHANumber } from '@app/shared/util/ha-number'
import { createPurifierExtras } from '../climate/climate'
import { createStageDeviceVisual } from '../core/stage-device-visual'

/**
 * NAS 状态面板（0.8.1 `nas-panel.js`）。
 *
 * 0.8.1 把 NAS 指标卡从「自己画一排 div」改成复用 `createPurifierExtras`：
 * - 卡片网格、拖动排序、右下角缩放、键盘移动全部由 extras 提供；
 * - 文案/进度条通过 `statePresentation` 注入 `nasMetricValue`；
 * - 排序与尺寸变化经 `onLayout` 回传 `{ id, group, layout }`，
 *   编辑器落到 `applyNasLayout` 再回写配置。
 */

const NAS_GROUP_LABELS: Record<string, string> = {
  system: '系统',
  storage: '存储',
  network: '网络',
  health: '健康',
}

export function nasGroups(
  nasConfig: { groupOrder?: unknown } | Record<string, unknown> | null | undefined,
): [string, string][] {
  const orderEntries = Array.isArray(nasConfig?.groupOrder)
    ? (nasConfig.groupOrder as unknown[]).filter((groupKey): groupKey is string => typeof groupKey === 'string')
    : []
  return [...new Set([...orderEntries, ...Object.keys(NAS_GROUP_LABELS)])]
    .filter((defaultGroupKey) => Object.hasOwn(NAS_GROUP_LABELS, defaultGroupKey))
    .map((groupKey) => [groupKey, NAS_GROUP_LABELS[groupKey]])
}

export interface NasMetricPresentation {
  text: string
  available?: boolean
  warning?: boolean
  percent?: number | null
}

export function nasMetricValue(
  metric: { kind?: string },
  stateUpdate: { newState?: unknown; attributes?: unknown } | null,
  displayPrecision: number | null = null,
): NasMetricPresentation {
  const entityState = (stateUpdate?.newState || stateUpdate || {}) as {
      state?: unknown
      available?: boolean
      attributes?: Record<string, unknown>
    },
    stateValue = String(entityState.state ?? '').trim()
  if (entityState.available === false || ['', 'unknown', 'unavailable', 'none'].includes(stateValue.toLowerCase()))
    return {
      text: '—',
      available: false,
    }
  if (metric.kind === 'problem')
    return ['on', 'off'].includes(stateValue)
      ? {
          text: stateValue === 'on' ? '有告警' : '正常',
          available: true,
          warning: stateValue === 'on',
        }
      : {
          text: stateValue,
          available: true,
        }
  if (metric.kind === 'timestamp') {
    const timestampMs = Date.parse(stateValue)
    return {
      text: Number.isFinite(timestampMs)
        ? new Date(timestampMs).toLocaleString('zh-CN', {
            hour12: false,
          })
        : stateValue,
      available: true,
    }
  }
  if (metric.kind === 'status')
    return {
      text:
        {
          normal: '正常',
          healthy: '健康',
          good: '良好',
          ok: '正常',
          warning: '警告',
          critical: '严重',
          crashed: '故障',
          degraded: '降级',
        }[stateValue.toLowerCase()] || stateValue,
      available: true,
      warning: /warning|critical|crashed|degraded|fail/i.test(stateValue),
    }
  const numericValue = Number(stateValue),
    unitOfMeasurement = String(entityState.attributes?.unit_of_measurement || '')
  return {
    text: Number.isFinite(numericValue)
      ? // HA 显示精度优先；未设置时原样显示（0.7.9 不再套 `Intl.NumberFormat`）。
        '' + formatHANumber(stateValue, displayPrecision) + (unitOfMeasurement ? ' ' + unitOfMeasurement : '')
      : stateValue,
    available: true,
    percent:
      Number.isFinite(numericValue) && unitOfMeasurement === '%' ? Math.max(0, Math.min(100, numericValue)) : null,
  }
}

/** NAS 指标 = 「状态」类卡片；时间戳默认占两列，其余一列一行。 */
export function nasMetricLayout(metric: Record<string, unknown>) {
  return {
    ...metric,
    type: 'state',
    columns: metric.columns ?? (metric.kind === 'timestamp' ? 2 : 1),
    rows: metric.rows ?? 1,
  }
}

/**
 * 把预览里拖出来的顺序与尺寸写回 NAS 配置。
 *
 * 只接受「与本组指标一一对应」的布局：数量一致、entityId 不重复、列 1-4 / 行 1-2，
 * 任何一项不符就整份丢弃（避免预览里的异常状态污染配置）。
 */
export function applyNasLayout(
  statusSource: { visibleMetrics?: string[]; metrics?: Record<string, unknown>[] } | null,
  groupKey: string,
  layout: { entityId?: unknown; columns?: number; rows?: number }[] | null,
): boolean {
  if (!statusSource || !Array.isArray(layout)) return false
  const visibleMetricIdSet = statusSource.visibleMetrics && new Set(statusSource.visibleMetrics),
    groupMetrics = (statusSource.metrics || []).filter(
      (metricEntry) =>
        metricEntry.group === groupKey &&
        (!visibleMetricIdSet || visibleMetricIdSet.has(metricEntry.entityId as string)),
    ),
    groupMetricByEntityId = new Map(groupMetrics.map((metricEntry) => [metricEntry.entityId, metricEntry]))
  if (
    layout.length !== groupMetricByEntityId.size ||
    new Set(layout.map((layoutEntry) => layoutEntry?.entityId)).size !== groupMetricByEntityId.size ||
    layout.some(
      (layoutEntry) =>
        !groupMetricByEntityId.has(layoutEntry?.entityId) ||
        ![1, 2, 3, 4].includes(Number(layoutEntry.columns)) ||
        ![1, 2].includes(Number(layoutEntry.rows)),
    )
  )
    return false
  const nextGroupMetrics = layout.map((layoutEntry) => {
    const metricEntry = groupMetricByEntityId.get(layoutEntry.entityId) as Record<string, unknown>,
      defaultLayout = nasMetricLayout(metricEntry),
      nextMetric = {
        ...metricEntry,
      }
    return (
      layoutEntry.columns !== defaultLayout.columns && (nextMetric.columns = layoutEntry.columns),
      layoutEntry.rows !== defaultLayout.rows && (nextMetric.rows = layoutEntry.rows),
      nextMetric
    )
  })
  let nextGroupIndex = 0
  return (
    (statusSource.metrics = (statusSource.metrics || []).map((metricEntry) =>
      groupMetricByEntityId.has(metricEntry.entityId) ? nextGroupMetrics[nextGroupIndex++] : metricEntry,
    )),
    true
  )
}

interface NasPanelUpdatePayload {
  item: {
    id?: string
    label?: string
    statusSource?: {
      name?: string
      deviceId?: string
      groupOrder?: string[]
      visibleMetrics?: string[]
      metrics?: Record<string, unknown>[]
    } | null
  }
  states?: Record<string, unknown> | Map<string, unknown>
  numberFormats?: Record<string, number>
  editing?: boolean
}

export function createNasPanel({
  onLayout = (_layout: { id?: string; group: string; layout: unknown }) => {},
}: {
  onLayout?: (layout: { id?: string; group: string; layout: unknown }) => void
} = {}) {
  const createStyledElement = (tagName: string, className: string, textContent = '') =>
      domElement(document, tagName, className, textContent),
    panelElement = createStyledElement('div', 'i3d-nas-panel i3d-climate-panel'),
    headingElement = createStyledElement('div', 'i3d-nas-heading i3d-popup-heading'),
    titleElement = createStyledElement('h3', ''),
    statusElement = createStyledElement('p', 'i3d-nas-status'),
    metricsElement = createStyledElement('div', 'i3d-nas-metrics'),
    metaElement = createStyledElement('p', 'i3d-nas-meta')
  const deviceVisual = createStageDeviceVisual({
    kind: 'nas',
    onActivate: undefined,
  })
  const headingTextElement = createStyledElement('div', 'i3d-popup-heading-text')
  headingTextElement.append(titleElement, metaElement),
    headingElement.append(headingTextElement, deviceVisual.root),
    panelElement.append(headingElement, statusElement, metricsElement),
    (panelElement.hidden = true)
  /** 分组 → 该组复用的 extras 实例；顺序由 `nasGroups` 决定。 */
  const groupExtrasByKey = new Map<string, { section: HTMLElement; extras: ReturnType<typeof createPurifierExtras> }>(),
    trackedGroupKeys = new Set<string>()
  let lastItem: NasPanelUpdatePayload['item'] | null = null,
    isVisible = true

  function renderNasPanel({
    item: nasComponent,
    states: statesByEntityId = {},
    numberFormats: numberFormatsByEntityId = {},
    editing = false,
  }: NasPanelUpdatePayload) {
    if (((lastItem = nasComponent), !isVisible)) return
    const statusSource = nasComponent.statusSource,
      visibleMetricIdSet = statusSource?.visibleMetrics && new Set(statusSource.visibleMetrics),
      visibleMetrics = (statusSource?.metrics || []).filter(
        (metricConfig) => !visibleMetricIdSet || visibleMetricIdSet.has(metricConfig.entityId as string),
      )
    ;(titleElement.textContent = nasComponent.label || statusSource?.name || 'NAS'),
      (titleElement.title = titleElement.textContent)
    trackedGroupKeys.clear()
    let groupIndex = 0
    for (const [metricGroupKey, groupLabel] of nasGroups(statusSource || null)) {
      const groupMetrics = visibleMetrics.filter((groupMetric) => groupMetric.group === metricGroupKey)
      if (!groupMetrics.length) continue
      trackedGroupKeys.add(metricGroupKey)
      let groupExtras = groupExtrasByKey.get(metricGroupKey)
      if (!groupExtras) {
        const groupSection = createStyledElement('section', 'i3d-nas-group'),
          groupGrid = createStyledElement('div', 'i3d-nas-grid i3d-extra-grid')
        groupSection.append(createStyledElement('h4', '', groupLabel), groupGrid)
        const extrasInstance = createPurifierExtras({
          element: groupGrid,
          scrollContainer: metricsElement,
          statePresentation: (presentedItem: unknown, presentedState: unknown, precision: number | null) =>
            nasMetricValue(presentedItem as { kind?: string }, presentedState as never, precision),
          onLayout: (groupLayout: unknown) =>
            onLayout({
              id: lastItem?.id,
              group: metricGroupKey,
              layout: groupLayout,
            }),
        })
        groupExtras = {
          section: groupSection,
          extras: extrasInstance,
        }
        groupExtrasByKey.set(metricGroupKey, groupExtras)
      }
      metricsElement.children[groupIndex] !== groupExtras.section &&
        metricsElement.insertBefore(groupExtras.section, metricsElement.children[groupIndex] || null)
      groupIndex++
      groupExtras.extras.update({
        item: {
          ...nasComponent,
          deviceId: statusSource?.deviceId,
          extraControls: groupMetrics.map(nasMetricLayout),
        },
        states: statesByEntityId,
        numberFormats: numberFormatsByEntityId,
        editing: editing,
      })
    }
    for (const [disposedGroupKey, disposedGroup] of groupExtrasByKey)
      trackedGroupKeys.has(disposedGroupKey) ||
        (disposedGroup.extras.dispose(), disposedGroup.section.remove(), groupExtrasByKey.delete(disposedGroupKey))
    let latestTimestampMs = 0
    for (const metricEntry of visibleMetrics) {
      const stateEntry =
          statesByEntityId instanceof Map
            ? statesByEntityId.get(metricEntry.entityId as string)
            : (statesByEntityId as Record<string, unknown>)[metricEntry.entityId as string],
        stateTimestampMs = Date.parse(
          String(
            (stateEntry as { updatedAt?: string; last_updated?: string } | null)?.updatedAt ||
              (stateEntry as { last_updated?: string } | null)?.last_updated ||
              '',
          ),
        )
      Number.isFinite(stateTimestampMs) && (latestTimestampMs = Math.max(latestTimestampMs, stateTimestampMs))
    }
    ;(statusElement.hidden = visibleMetrics.length > 0),
      (statusElement.textContent = statusSource
        ? statusSource.metrics?.length
          ? '未选择显示内容'
          : '已关联 NAS，暂无状态指标。请启用指标并同步目录后重新匹配数据来源。'
        : '请在“配置设备”中选择 NAS 数据来源。'),
      (metaElement.textContent =
        '状态更新于 ' +
        (latestTimestampMs
          ? new Date(latestTimestampMs).toLocaleTimeString('zh-CN', {
              hour12: false,
            })
          : '—')),
      deviceVisual.sync({
        kind: 'nas',
        on: !!statusSource && visibleMetrics.length > 0,
        available: !!statusSource,
        interactive: false,
        disabled: true,
        status: visibleMetrics.length ? 'normal' : 'off',
        label: titleElement.textContent || 'NAS',
      })
  }

  return {
    root: panelElement,
    update: renderNasPanel,
    setVisible(nextVisible: boolean) {
      isVisible = nextVisible
      for (const groupExtras of groupExtrasByKey.values()) groupExtras.extras.setVisible(nextVisible)
    },
    dispose() {
      for (const groupExtras of groupExtrasByKey.values()) groupExtras.extras.dispose()
      groupExtrasByKey.clear(), (lastItem = null), deviceVisual.dispose(), panelElement.remove()
    },
  }
}

function nasState(entityId: any, state: any) {
  const stateObject = state?.newState || state || {},
    stateValue = String(stateObject.state || '')
      .trim()
      .toLowerCase(),
    available =
      /^(binary_sensor|switch|input_boolean)\.[a-z0-9_]+$/.test(entityId || '') &&
      stateObject.available !== false &&
      ['on', 'off'].includes(stateValue)
  return {
    available: available,
    on: available && stateValue === 'on',
    name: stateObject.attributes?.friendly_name || entityId || 'NAS',
  }
}
/** NAS / 存储设备的展示状态。 */
type NasDeviceState = {
  available?: boolean
  on?: boolean
  name?: any
  /** 指示灯颜色。 */
  color?: string
  /** 是否可见（NAS 机型恒为 true）。 */
  visible?: boolean
  /** 运行状态：normal / warning / off…。 */
  status?: string
  [stateKey: string]: any
}

export function nasDeviceState(nasItem: any, stateSources: Record<string, any> = {}): NasDeviceState {
  const readStateEntry = (stateEntityId: any) =>
    stateSources instanceof Map ? stateSources.get(stateEntityId) : (stateSources as any)[stateEntityId]
  if (nasItem.entityId) return nasState(nasItem.entityId, readStateEntry(nasItem.entityId))
  const hasActiveMetric = [
    ...new Set([
      nasItem.statusSource?.primaryEntityId,
      ...(nasItem.statusSource?.metrics || []).map((metricSource: any) => metricSource.entityId),
    ]),
  ].some((metricEntityId) => {
    const metricState = readStateEntry(metricEntityId)?.newState || readStateEntry(metricEntityId)
    return (
      !!metricEntityId &&
      metricState?.available !== false &&
      metricState?.state != null &&
      !['', 'unknown', 'unavailable', 'none'].includes(String(metricState.state).trim().toLowerCase())
    )
  })
  return {
    available: hasActiveMetric,
    on: hasActiveMetric,
    name: nasItem.statusSource?.name || 'NAS',
  }
}
/** 自定义指示灯颜色：只有非 NAS 机型且设备回报了非默认绿时才换色。 */
function customIndicatorColor(modelType: string, deviceColor: string | undefined) {
  return modelType !== 'nas' && deviceColor !== '#43ce82' ? 1 : 0
}

export function createNasStatus({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
  modelType: modelType = 'nas',
  readState: readState = nasDeviceState,
}: any) {
  const meshesByBindingId = new Map(),
    planeGeometry = new THREE.PlaneGeometry(1, 1)
  let syncedRoot: any,
    syncedRevision: any,
    syncedBindingsSignature: any,
    isDisposed = false,
    hasVisibleIndicator = false,
    lastTickMs = -Infinity
  const prefersReducedMotionNow = () => reducedMotionQuery?.matches === true,
    isNodeVisible = (sceneNode: any) => {
      for (let visibleAncestor = sceneNode; visibleAncestor; visibleAncestor = visibleAncestor.parent) {
        if (visibleAncestor.visible === false) return false
        if (visibleAncestor === syncedRoot) return true
      }
      return false
    },
    hasVisibleBreathingIndicator = () => {
      if (hasVisibleIndicator) {
        for (const visibleEntry of meshesByBindingId.values())
          if (visibleEntry.breathing && isNodeVisible(visibleEntry.mesh)) return true
      }
      return false
    },
    reducedMotionQuery =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ??
      globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)'),
    requestFrameIfBreathing = () => {
      !isDisposed && hasVisibleBreathingIndicator() && requestFrame()
    }
  reducedMotionQuery?.addEventListener?.('change', requestFrameIfBreathing)
  const sceneModelKey = (floorId: any, modelId: any) => JSON.stringify([floorId || '', modelId || ''])
  function releaseEntry(entry: any) {
    for (const [indicator, wasVisible] of entry.indicators) indicator.visible = wasVisible
    entry.mesh.removeFromParent(), entry.mesh.material.dispose()
  }
  function modelWorldBounds(modelRoot: any) {
    const accumulatedBounds = new THREE.Box3()
    function accumulateBounds(node: any, parentMatrix: any) {
      if (!node.userData?.environmentEffect && !(node !== modelRoot && node.userData?.environmentModelId != null)) {
        node.isMesh &&
          node.geometry &&
          (node.geometry.boundingBox || node.geometry.computeBoundingBox(),
          node.geometry.boundingBox &&
            accumulatedBounds.union(node.geometry.boundingBox.clone().applyMatrix4(parentMatrix)))
        for (const childNode of node.children || [])
          childNode.matrixAutoUpdate && childNode.updateMatrix(),
            accumulateBounds(childNode, new THREE.Matrix4().multiplyMatrices(parentMatrix, childNode.matrix))
      }
    }
    return (accumulateBounds(modelRoot, new THREE.Matrix4()), accumulatedBounds)
  }
  function findNasStatusAnchor(anchorModelRoot: any) {
    let resolvedAnchorPosition: any = null
    function visitAnchorNode(anchorNode: any, anchorParentMatrix: any) {
      if (
        resolvedAnchorPosition ||
        anchorNode.userData?.environmentEffect ||
        (anchorNode !== anchorModelRoot && anchorNode.userData?.environmentModelId != null)
      )
        return
      const anchorCoordinates = anchorNode.userData?.deviceStatusAnchor ?? anchorNode.userData?.nasStatusAnchor
      if (
        Array.isArray(anchorCoordinates) &&
        anchorCoordinates.length === 3 &&
        anchorCoordinates.every(Number.isFinite)
      ) {
        resolvedAnchorPosition = new THREE.Vector3().fromArray(anchorCoordinates).applyMatrix4(anchorParentMatrix)
        return
      }
      for (const anchorChildNode of anchorNode.children || [])
        anchorChildNode.matrixAutoUpdate && anchorChildNode.updateMatrix(),
          visitAnchorNode(
            anchorChildNode,
            new THREE.Matrix4().multiplyMatrices(anchorParentMatrix, anchorChildNode.matrix),
          )
    }
    return (visitAnchorNode(anchorModelRoot, new THREE.Matrix4()), resolvedAnchorPosition)
  }
  function sync({
    root: root,
    revision: revision,
    bindings: bindings = [],
    states: states = {},
    enabled: enabled = false,
    sizeScale: sizeScale = 1,
    brightness: brightness = 1,
  }: any) {
    if (isDisposed) return
    const bindingsSignature = JSON.stringify(
      bindings.map((bindingConfig: any) => [bindingConfig.id, bindingConfig.floorId, bindingConfig.modelId]),
    )
    if (syncedRoot !== root || syncedRevision !== revision || syncedBindingsSignature !== bindingsSignature) {
      ;(syncedRoot = root), (syncedRevision = revision), (syncedBindingsSignature = bindingsSignature)
      const modelsByLocation = new Map()
      syncedRoot?.traverse((sceneObject: any) => {
        if (sceneObject.userData?.environmentModelType !== modelType) return
        let ancestorFloorId = sceneObject.userData.environmentFloorId
        for (let ancestor = sceneObject.parent; ancestorFloorId == null && ancestor; ancestor = ancestor.parent)
          ancestorFloorId = ancestor.userData.environmentFloorId
        modelsByLocation.set(sceneModelKey(ancestorFloorId, sceneObject.userData.environmentModelId), sceneObject)
      })
      const activeBindingIdSet = new Set()
      for (const binding of bindings) {
        const matchedModel = modelsByLocation.get(sceneModelKey(binding.floorId, binding.modelId))
        if (!matchedModel) continue
        activeBindingIdSet.add(binding.id)
        let existing = meshesByBindingId.get(binding.id)
        if (existing?.model !== matchedModel) {
          existing && releaseEntry(existing)
          const modelBounds = modelWorldBounds(matchedModel)
          if (modelBounds.isEmpty()) {
            meshesByBindingId.delete(binding.id)
            continue
          }
          const modelSize = modelBounds.getSize(new THREE.Vector3()),
            modelCenter = modelBounds.getCenter(new THREE.Vector3()),
            ledMaterial = new THREE.ShaderMaterial({
              transparent: true,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
              uniforms: {
                indicatorColor: {
                  value: new THREE.Color('#0fff33'),
                },
                customColor: {
                  value: modelType !== 'nas' ? 1 : 0,
                },
                pulse: {
                  value: 1,
                },
                viewportHeight: {
                  value: 900,
                },
                sizeScale: {
                  value: 1,
                },
                brightness: {
                  value: 1,
                },
              },
              vertexShader:
                'varying vec2 ledUv; uniform float viewportHeight; uniform float sizeScale; void main(){ledUv=uv;vec4 center=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);vec4 clip=projectionMatrix*center;float physicalSize=length(modelMatrix[0].xyz);float minimumSize=24.0*clip.w/(max(viewportHeight,1.0)*projectionMatrix[1][1]);center.xy+=position.xy*max(physicalSize,minimumSize)*sizeScale;gl_Position=projectionMatrix*center;}',
              fragmentShader:
                'varying vec2 ledUv; uniform float pulse; uniform float brightness; uniform vec3 indicatorColor; uniform float customColor; void main(){float r=length(ledUv-0.5)*2.0;float core=1.0-smoothstep(0.28,0.50,r);float halo=pow(max(0.0,1.0-r),1.7)*0.8;float a=min((core+halo)*pulse,1.0)*brightness;if(a<0.005)discard;gl_FragColor=vec4(mix(vec3(0.06,1.0,0.20),vec3(0.48,1.0,0.60),core)*(1.0-customColor)+indicatorColor*customColor,a);}',
            }),
            ledMesh = new THREE.Mesh(planeGeometry, ledMaterial)
          ;(ledMesh.name = 'nas-status-' + binding.id),
            Object.assign(ledMesh.userData, {
              environmentEffect: true,
              nasStatus: true,
              externalModelSharedGeometry: true,
              externalModelSharedMaterial: true,
            }),
            (ledMesh.raycast = () => {}),
            (ledMesh.renderOrder = 100)
          const viewportSize = new THREE.Vector2()
          ledMesh.onBeforeRender = (renderer: any) => {
            ledMaterial.uniforms.viewportHeight.value = renderer.getSize(viewportSize).y
          }
          const indicatorSize = Math.max(0.025, Math.min(0.075, modelSize.x * 0.22))
          ledMesh.scale.set(indicatorSize, indicatorSize, indicatorSize),
            ledMesh.position.set(
              modelCenter.x + modelSize.x * 0.36,
              modelBounds.min.y + modelSize.y * 0.26,
              modelBounds.max.z + 0.003,
            ),
            (modelType === 'storagewaterheater' || modelType === 'gaswaterheater') &&
              ledMesh.position.set(
                modelCenter.x,
                modelBounds.min.y + modelSize.y * (modelType === 'gaswaterheater' ? 0.67 : 0.53),
                modelBounds.max.z + 0.003,
              )
          // 0.8.5 起所有机型都吃模型锚点（投影仪 / 长条音响等不在几何中心）。
          // 没有锚点时保留上面按包围盒估出来的位置。
          const anchorPosition = findNasStatusAnchor(matchedModel)
          anchorPosition && ledMesh.position.copy(anchorPosition)
          const suppressedVisibilityByNode = new Map()
          matchedModel.traverse((child: any) => {
            if (!child.isMesh || child === ledMesh || child.userData?.environmentEffect) return
            const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
            ;(child.userData?.nasIndicator ||
              childMaterials.some((childMaterial: any) => /^nas-material-4(?:$|\s)/.test(childMaterial?.name || ''))) &&
              (suppressedVisibilityByNode.set(child, child.visible), (child.visible = false))
          }),
            matchedModel.add(ledMesh),
            (existing = {
              model: matchedModel,
              mesh: ledMesh,
              indicators: suppressedVisibilityByNode,
            }),
            meshesByBindingId.set(binding.id, existing)
        }
      }
      for (const [bindingId, staleEntry] of meshesByBindingId)
        activeBindingIdSet.has(bindingId) || (releaseEntry(staleEntry), meshesByBindingId.delete(bindingId))
    }
    hasVisibleIndicator = false
    let shouldRender = false
    for (const activeBinding of bindings) {
      const bindingEntry = meshesByBindingId.get(activeBinding.id)
      if (!bindingEntry) continue
      const uniforms = bindingEntry.mesh.material.uniforms
      const deviceState = readState(activeBinding, states)
      const indicatorBrightness = brightness * (deviceState.brightness ?? 1)
      ;(shouldRender ||= uniforms.sizeScale.value !== sizeScale || uniforms.brightness.value !== indicatorBrightness),
        (uniforms.sizeScale.value = sizeScale),
        (uniforms.brightness.value = indicatorBrightness)
      deviceState.color &&
        ((shouldRender ||= bindingEntry.color !== deviceState.color),
        (bindingEntry.color = deviceState.color),
        uniforms.indicatorColor.value.set(deviceState.color))
      const customColor = customIndicatorColor(modelType, deviceState.color)
      ;(shouldRender ||= uniforms.customColor.value !== customColor), (uniforms.customColor.value = customColor)
      const shouldShow =
        enabled && (modelType === 'nas' ? deviceState.on : deviceState.visible && deviceState.status !== 'off')
      ;(shouldRender ||= bindingEntry.mesh.visible !== shouldShow),
        (bindingEntry.mesh.visible = shouldShow),
        (bindingEntry.breathing =
          shouldShow &&
          !deviceState.steady &&
          (modelType === 'nas' || deviceState.status === 'normal' || deviceState.status === 'warning')),
        bindingEntry.breathing
          ? (hasVisibleIndicator = true)
          : ((shouldRender ||= uniforms.pulse.value !== 1), (uniforms.pulse.value = 1))
    }
    ;(shouldRender || hasVisibleIndicator) && requestFrame()
  }
  function tick(nowMs: any) {
    if (isDisposed || !hasVisibleBreathingIndicator()) return ((lastTickMs = -Infinity), false)
    const reducedMotion = prefersReducedMotionNow()
    if (!reducedMotion && nowMs - lastTickMs < 1000 / 30) return true
    lastTickMs = nowMs
    const pulse = reducedMotion ? 1 : 0.14 + 0.86 * (0.5 - 0.5 * Math.cos((nowMs / 1400) * Math.PI * 2))
    let hasChanged = false
    for (const meshEntry of meshesByBindingId.values())
      meshEntry.breathing &&
        isNodeVisible(meshEntry.mesh) &&
        ((hasChanged ||= meshEntry.mesh.material.uniforms.pulse.value !== pulse),
        (meshEntry.mesh.material.uniforms.pulse.value = pulse))
    return (hasChanged && requestFrame(), !reducedMotion)
  }
  return {
    sync: sync,
    tick: tick,
    nextDelay: () =>
      !isDisposed && hasVisibleBreathingIndicator() && !prefersReducedMotionNow() ? 1000 / 30 : Infinity,
    dispose() {
      if (!isDisposed) {
        ;(isDisposed = true), reducedMotionQuery?.removeEventListener?.('change', requestFrameIfBreathing)
        for (const disposedEntry of meshesByBindingId.values()) releaseEntry(disposedEntry)
        meshesByBindingId.clear(), planeGeometry.dispose()
      }
    },
  }
}
