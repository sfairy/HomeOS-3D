import { mountInteraction3d } from '../core/runtime'
import { randomUuid } from '@app/shared/util/random-id'
import { domElement } from '@app/shared/util/dom-factory'
import { createSvgElement as createSvgNode } from '@app/shared/util/svg-factory'
import { interaction3dPreviewSize, observeInteraction3dPreview } from '@app/bridge/presets'

export const DESIGNS = {
  traveler: {
    name: '软帽小旅人',
    en: 'THE SOFT-HAT TRAVELER',
    description: '偏向一侧的软帽，圆润短外套。\n小步轻走，停下来会看看周围。',
    height: 1.35,
    pace: 1,
  },
  bean: {
    name: '豆豆小人',
    en: 'THE LITTLE BEAN',
    description: '大圆头、豆子身体与迷你小帽。\n短腿交替迈步，带一点俏皮摇摆。',
    height: 1.33,
    pace: 0.78,
  },
  glow: {
    name: '小灯灵',
    en: 'THE LITTLE GLOW',
    description: '实心灯罩、温暖微光与小披肩。\n细腿慢走，光线像呼吸一样起伏。',
    height: 1.45,
    pace: 0.82,
  },
}
export function createWalker(THREE: any, outfitColor = 5421233, designKey = 'traveler') {
  ;(DESIGNS as any)[designKey] || (designKey = 'traveler')
  const walkerGroup = new THREE.Group()
  walkerGroup.name = 'HB-' + designKey
  const outfitMaterial = new THREE.MeshStandardMaterial({
      color: outfitColor,
      roughness: 0.9,
    }),
    accentMaterial = new THREE.MeshStandardMaterial({
      color: 16774886,
      roughness: 0.9,
    }),
    darkMaterial = new THREE.MeshStandardMaterial({
      color: 3425857,
      roughness: 1,
    })
  function addMesh(geometry: any, material: any, position: any, parentGroup = walkerGroup) {
    const mesh = new THREE.Mesh(geometry, material)
    return (
      mesh.position.set(...position),
      (mesh.castShadow = true),
      (mesh.receiveShadow = false),
      parentGroup.add(mesh),
      mesh
    )
  }
  function addSphere(scaleVector: any, spherePosition: any, sphereMaterial: any, sphereParent = walkerGroup) {
    const sphereMesh = addMesh(new THREE.SphereGeometry(1, 32, 20), sphereMaterial, spherePosition, sphereParent)
    return (sphereMesh.scale.set(...scaleVector), sphereMesh)
  }
  function addLathe(profilePoints: any, latheMaterial: any, latheParent = walkerGroup) {
    return addMesh(
      new THREE.LatheGeometry(
        profilePoints.map(([profileX, profileY]: any) => new THREE.Vector2(profileX, profileY)),
        36,
      ),
      latheMaterial,
      [0, 0, 0],
      latheParent,
    )
  }
  const bodyGroup = new THREE.Group()
  walkerGroup.add(bodyGroup)
  const headGroup = new THREE.Group()
  bodyGroup.add(headGroup)
  /** 角色部件表：基础骨架在创建时就填好，帽子 / 长袍 / 发光材质等由各套装扮按需挂上，所以除骨架外都允许缺省。 */
  type CharacterParts = {
    body: any
    headRig: any
    arms: any[]
    legs: any[]
    robe?: any
    hat?: any
    glowMat?: any
    shadeMat?: any
    [partName: string]: any
  }

  const armPivots: any = [],
    legPivots: any = [],
    parts: CharacterParts = {
      body: bodyGroup,
      headRig: headGroup,
      arms: armPivots,
      legs: legPivots,
    }
  function addEyes(eyeY: any, eyeZ: any, eyeSpacing = 0.055, eyeRadius = 0.012, eyeParent = headGroup) {
    for (const side of [-1, 1])
      addSphere([eyeRadius, eyeRadius * 1.3, 0.01], [side * eyeSpacing, eyeY, eyeZ], darkMaterial, eyeParent)
  }
  function addArms(shoulderY: any, shoulderOffsetX: any, armLength: any, armRadius: any) {
    for (const sideSign of [-1, 1]) {
      const armPivot = new THREE.Group()
      armPivot.position.set(sideSign * shoulderOffsetX, shoulderY, 0),
        bodyGroup.add(armPivot),
        addSphere(
          [armRadius, armLength / 2, armRadius],
          [sideSign * 0.012, -armLength / 2, 0],
          outfitMaterial,
          armPivot,
        ),
        addSphere(
          [armRadius * 0.57, armRadius * 0.66, armRadius * 0.58],
          [sideSign * 0.012, -armLength, 0],
          accentMaterial,
          armPivot,
        ),
        (armPivot.rotation.z = sideSign * 0.12),
        armPivots.push(armPivot)
    }
  }
  function addLegs(hipY: any, hipOffsetX: any, legLength: any, legRadius: any, footDepth: any, footHeight: any) {
    for (const legSideSign of [-1, 1]) {
      const hipGroup = new THREE.Group()
      hipGroup.position.set(legSideSign * hipOffsetX, hipY, 0),
        walkerGroup.add(hipGroup),
        addMesh(
          new THREE.CylinderGeometry(legRadius, legRadius * 0.94, legLength, 12),
          accentMaterial,
          [0, -legLength / 2, 0],
          hipGroup,
        )
      const kneeGroup = new THREE.Group()
      ;(kneeGroup.position.y = -legLength),
        hipGroup.add(kneeGroup),
        addMesh(
          new THREE.CylinderGeometry(legRadius * 0.94, legRadius * 0.85, legLength, 12),
          accentMaterial,
          [0, -legLength / 2, 0],
          kneeGroup,
        )
      const footMesh = addSphere(
        [legRadius * 1.6, footHeight, footDepth],
        [0, -legLength, 0.025],
        darkMaterial,
        kneeGroup,
      )
      legPivots.push({
        hip: hipGroup,
        knee: kneeGroup,
        foot: footMesh,
      })
    }
    walkerGroup.userData.soleHeight = footHeight
  }
  if (designKey === 'traveler') {
    ;(parts.robe = addLathe(
      [
        [0, 0.36],
        [0.16, 0.36],
        [0.209, 0.38],
        [0.225, 0.43],
        [0.224, 0.56],
        [0.21, 0.71],
        [0.176, 0.83],
        [0.105, 0.877],
        [0, 0.884],
      ],
      outfitMaterial,
      bodyGroup,
    )),
      addMesh(new THREE.CylinderGeometry(0.049, 0.052, 0.09, 16), accentMaterial, [0, 0.903, 0], bodyGroup),
      addSphere([0.188, 0.206, 0.177], [0, 1.052, 0.01], accentMaterial, headGroup),
      addEyes(1.064, 0.184)
    const hatBrimGeometry = new THREE.LatheGeometry(
        [
          [0, 0],
          [0.177, 0],
          [0.215, 0.019],
          [0.255, 0.072],
          [0.25, 0.104],
          [0.209, 0.153],
          [0.13, 0.19],
          [0, 0.203],
        ].map(([brimX, brimY]) => new THREE.Vector2(brimX, brimY)),
        40,
      ),
      brimPositions = hatBrimGeometry.attributes.position
    for (let vertexIndex = 0; vertexIndex < brimPositions.count; vertexIndex++) {
      const vertexY = brimPositions.getY(vertexIndex)
      brimPositions.setX(vertexIndex, brimPositions.getX(vertexIndex) - (0.088 * vertexY) / 0.203),
        brimPositions.setY(vertexIndex, vertexY + 0.022 * brimPositions.getX(vertexIndex))
    }
    hatBrimGeometry.computeVertexNormals(),
      (parts.hat = addMesh(hatBrimGeometry, outfitMaterial, [0, 1.152, 0], headGroup)),
      addArms(0.801, 0.18, 0.205, 0.061),
      addLegs(0.404, 0.099, 0.174, 0.029, 0.066, 0.028)
  }
  if (
    (designKey === 'bean' &&
      ((parts.robe = addSphere([0.274, 0.298, 0.224], [0, 0.538, 0], outfitMaterial, bodyGroup)),
      addSphere([0.281, 0.279, 0.253], [0, 0.998, 0.018], accentMaterial, headGroup),
      addEyes(1.006, 0.269, 0.075, 0.016),
      (parts.hat = addSphere([0.205, 0.073, 0.188], [-0.052, 1.238, -0.025], outfitMaterial, headGroup)),
      addSphere([0.026, 0.037, 0.024], [-0.102, 1.308, -0.025], outfitMaterial, headGroup),
      addArms(0.646, 0.258, 0.135, 0.051),
      addLegs(0.282, 0.125, 0.096, 0.039, 0.083, 0.039)),
    designKey === 'glow')
  ) {
    ;(parts.robe = addLathe(
      [
        [0, 0.32],
        [0.13, 0.32],
        [0.183, 0.35],
        [0.207, 0.43],
        [0.199, 0.57],
        [0.155, 0.72],
        [0.1, 0.8],
        [0, 0.817],
      ],
      outfitMaterial,
      bodyGroup,
    )),
      addMesh(new THREE.CylinderGeometry(0.038, 0.043, 0.1, 16), darkMaterial, [0, 0.832, 0], bodyGroup)
    const glowMaterial = new THREE.MeshStandardMaterial({
        color: 16770998,
        emissive: 16762222,
        emissiveIntensity: 1,
        roughness: 0.6,
      }),
      bulbMesh = addSphere([0.11, 0.143, 0.104], [0, 1.083, 0], glowMaterial, headGroup)
    ;(bulbMesh.castShadow = false), (bulbMesh.visible = false)
    const shadeMaterial = new THREE.MeshPhysicalMaterial({
        color: 16774877,
        emissive: 16765588,
        emissiveIntensity: 0.38,
        roughness: 0.72,
        metalness: 0,
      }),
      shadeMesh = addLathe(
        [
          [0, 0.858],
          [0.135, 0.858],
          [0.189, 0.88],
          [0.222, 0.946],
          [0.228, 1.15],
          [0.2, 1.29],
          [0.155, 1.33],
          [0, 1.33],
        ],
        shadeMaterial,
        headGroup,
      )
    ;(shadeMesh.castShadow = false),
      (shadeMesh.renderOrder = 1),
      (parts.hat = addSphere([0.213, 0.036, 0.213], [0, 1.316, 0], outfitMaterial, headGroup))
    addMesh(new THREE.TorusGeometry(0.04, 0.009, 8, 24), outfitMaterial, [0, 1.387, 0], headGroup)
    addEyes(1.103, 0.229, 0.06, 0.012),
      addArms(0.694, 0.172, 0.14, 0.045),
      addLegs(0.363, 0.085, 0.145, 0.024, 0.053, 0.026),
      (parts.glowMat = glowMaterial),
      (parts.shadeMat = shadeMaterial)
  }
  return (
    (walkerGroup.userData.parts = parts),
    (walkerGroup.userData.outfitMaterial = outfitMaterial),
    (walkerGroup.userData.design = designKey),
    walkerGroup
  )
}

export function animateWalker(walkerRoot: any, walkPhase: any, walkAmount: any, elapsedSeconds: any) {
  const { body: bodyPivot, legs: legRigs, arms: armRigs, headRig: headRig } = walkerRoot.userData.parts,
    isBeanDesign = walkerRoot.userData.design === 'bean'
  ;(bodyPivot.position.y =
    Math.abs(Math.sin(walkPhase)) * (isBeanDesign ? 0.026 : 0.012) * walkAmount +
    Math.sin(elapsedSeconds * 1.65) * 0.003 * (1 - walkAmount)),
    (bodyPivot.rotation.z = Math.sin(walkPhase) * (isBeanDesign ? 0.055 : 0.018) * walkAmount),
    (bodyPivot.rotation.x = 0.015 * walkAmount),
    (headRig.rotation.y = Math.sin(elapsedSeconds * 0.65) * 0.14 * (1 - walkAmount))
  for (let legIndex = 0; legIndex < legRigs.length; legIndex++) {
    const legPhase = walkPhase + legIndex * Math.PI
    ;(legRigs[legIndex].hip.rotation.x = Math.sin(legPhase) * (isBeanDesign ? 0.4 : 0.3) * walkAmount),
      (legRigs[legIndex].knee.rotation.x = -Math.max(0, Math.cos(legPhase)) * 0.24 * walkAmount)
  }
  for (let armIndex = 0; armIndex < armRigs.length; armIndex++)
    armRigs[armIndex].rotation.x = -Math.sin(walkPhase + armIndex * Math.PI) * 0.14 * walkAmount
  walkerRoot.userData.parts.glowMat &&
    ((walkerRoot.userData.parts.glowMat.emissiveIntensity = 0.9 + Math.sin(elapsedSeconds * 1.7) * 0.13),
    (walkerRoot.userData.parts.shadeMat.emissiveIntensity = 0.38 + Math.sin(elapsedSeconds * 1.7) * 0.045))
}
export function disposeWalker(walkerToDispose: any) {
  const geometrySet = new Set(),
    materialSet = new Set()
  walkerToDispose.traverse((childNode: any) => {
    if (childNode.isMesh) {
      geometrySet.add(childNode.geometry)
      for (const childMaterial of Array.isArray(childNode.material) ? childNode.material : [childNode.material])
        materialSet.add(childMaterial)
    }
  }),
    geometrySet.forEach((geometryToDispose: any) => geometryToDispose.dispose()),
    materialSet.forEach((materialToDispose: any) => materialToDispose.dispose()),
    walkerToDispose.removeFromParent()
}

/**
 * 「本层还没有人体传感器」时的提示文案。
 *
 * 从安防面板打开时这里不允许加传感器，只能指回去；从人体感应编辑器打开时是普通说明。
 * 单独成函数是为了把分支留在 `openPresenceEditor` 之外 —— 它的圈复杂度已在棘轮基线上，
 * 多一个三元表达式就会被门禁拦下。
 */
function missingSensorNote(manageBindings: boolean): string {
  return manageBindings ? '有人时走动，无人时隐藏。' : '本层尚未配置人体传感器，请返回安防设置添加。'
}

export async function openPresenceEditor({
  component: component,
  panelDocument: panelDocument,
  floors = [],
  entities = [],
  pickers: pickers,
  onSave: onSave,
  initialSelectedId = '',
  editingFloorId = '',
  manageBindings = true,
  onClose: onClose,
}: any) {
  const ownerDocument = window.document,
    draftProperties = structuredClone(component.properties || {})
  draftProperties.security = {
    ...draftProperties.security,
    presenceSensors: structuredClone(draftProperties.security?.presenceSensors || []),
  }
  const presenceSensors = draftProperties.security.presenceSensors,
    entityNameById = new Map(entities.map((entityRecord: any) => [entityRecord.entityId, entityRecord.name]))
  for (const sensorEntry of presenceSensors)
    (sensorEntry.displayPages = 'all'),
      Object.assign(sensorEntry, {
        character: sensorEntry.character ?? 'traveler',
        color: sensorEntry.color ?? 'cyan',
        speed: sensorEntry.speed ?? 0.45,
        size: sensorEntry.size ?? 1,
        displayDuration: presenceTriggerIsTimed(sensorEntry)
          ? sensorEntry.displayDuration > 0
            ? sensorEntry.displayDuration
            : 30
          : (sensorEntry.displayDuration ?? 0),
      })
  const createDomElement = (tagName: any, textValue = '', classNameValue = '') =>
      domElement(ownerDocument, tagName, classNameValue, textValue),
    createSvgElement = (svgTagName: any, svgAttributes: Record<string, any> = {}) =>
      createSvgNode(svgTagName, svgAttributes, null, ownerDocument),
    stylesheetLink = createDomElement('link')
  ;(stylesheetLink.rel = 'stylesheet'),
    (stylesheetLink.href = '/api/v1/modules/interaction3d/presence/presence-editor.css')
  const dialogElement = createDomElement('dialog', '', 'i3d-editor i3d-presence-editor')
  dialogElement.setAttribute('aria-label', manageBindings ? '配置安防' : '人物与行走路线')
  const previouslyFocusedElement = ownerDocument.activeElement
  let selectedSensor =
      presenceSensors.find((sensorById: any) => sensorById.id === initialSelectedId) ||
      presenceSensors.find((sensorByFloor: any) => sensorByFloor.floorId === editingFloorId) ||
      presenceSensors[0] ||
      null,
    isClosed = false,
    closedRouteSensorIds = new Set(
      presenceSensors
        .filter(
          (closedRouteSensor: any) =>
            closedRouteSensor.routeClosed !== false && validPresenceRoute(closedRouteSensor.route),
        )
        .map((closedRouteSensorId: any) => closedRouteSensorId.id),
    ),
    dragPoint: any = null,
    planViewBox: any,
    characterWalker: any = null,
    appliedWalkerKey = '',
    animationFrameId = 0,
    lastFrameTimestamp = 0,
    walkerDistance = 0,
    walkerElapsed = 0,
    interaction3dHandle: any = null,
    isRuntimeReady = false,
    viewMode = 'plan',
    isPreviewingWalk = false,
    isHitRangeVisible = false,
    topViewTimerId: ReturnType<typeof setTimeout> | number = 0,
    hoverPoint: any = null,
    pendingSyncHandlers: any = []
  const flushPendingEdits = () => {
      for (const syncHandler of pendingSyncHandlers) syncHandler()
    },
    statusElement = createDomElement('span', '', 'presence-status')
  statusElement.setAttribute('role', 'status')
  const createActionButton = (buttonLabel: any, clickHandler: any) => {
    const actionButton = createDomElement('button', buttonLabel)
    return ((actionButton.type = 'button'), actionButton.addEventListener('click', clickHandler), actionButton)
  }
  function closeEditor() {
    isClosed ||
      ((isClosed = true),
      cancelAnimationFrame(animationFrameId),
      planResizeObserver.disconnect(),
      clearTimeout(topViewTimerId),
      interaction3dHandle?.(),
      ownerDocument.removeEventListener('visibilitychange', startCharacterAnimation),
      characterWalker &&
        (disposeWalker(characterWalker.root),
        characterWalker.renderer.dispose(),
        characterWalker.renderer.forceContextLoss()),
      dialogElement.close(),
      dialogElement.remove(),
      stylesheetLink.remove(),
      ownerDocument.dispatchEvent(new Event('hb-i3d-preview-scope')),
      previouslyFocusedElement instanceof HTMLElement && previouslyFocusedElement.focus(),
      onClose?.())
  }
  const applyButton = createActionButton(manageBindings ? '保存安防配置' : '应用人物与路线', async () => {
    flushPendingEdits()
    for (const saveSensorEntry of presenceSensors)
      saveSensorEntry.routeClosed =
        closedRouteSensorIds.has(saveSensorEntry.id) && validPresenceRoute(saveSensorEntry.route)
    applyButton.disabled = true
    try {
      await onSave(structuredClone(draftProperties)),
        isClosed ||
          (statusElement.textContent = manageBindings
            ? '配置已应用，请保存仪表盘。'
            : '已应用到安防窗口，请返回并保存配置。')
    } catch (saveError: any) {
      isClosed || (statusElement.textContent = saveError.message || '保存失败，请重试。')
    } finally {
      isClosed || (applyButton.disabled = false)
    }
  })
  ;(applyButton.className = 'primary'),
    dialogElement.addEventListener('input', () => {
      statusElement.textContent = manageBindings ? '配置已修改，请保存安防配置。' : '配置已修改，请应用人物与路线。'
    })
  const headerElement = createDomElement('header')
  headerElement.append(
    createDomElement('strong', manageBindings ? '配置安防' : '人物与行走路线'),
    statusElement,
    applyButton,
    createActionButton('退出', closeEditor),
  )
  const bodyElement = createDomElement('div', '', 'presence-body'),
    bindingsPanel = createDomElement('aside', '', 'presence-bindings'),
    controlsPanel = createDomElement('aside', '', 'presence-controls'),
    planPanel = createDomElement('div', '', 'presence-plan'),
    routeTitleElement = createDomElement('strong', '行走路线'),
    planNoteElement = createDomElement('p', '', 'presence-note'),
    viewportElement = createDomElement('div', '', 'presence-viewport'),
    runtimeContainer = createDomElement('div', '', 'presence-plan-runtime'),
    planSvgElement = createSvgElement('svg', {
      role: 'img',
      'aria-label': '平面图行走路线',
      tabindex: '0',
    }),
    planStaticLayer = createSvgElement('g'),
    planRouteLayer = createSvgElement('g')
  planSvgElement.append(planStaticLayer, planRouteLayer)
  const routeToolbar = createDomElement('div', '', 'presence-route-tools')
  routeToolbar.append(
    createActionButton('闭合路线', () => {
      selectedSensor && validPresenceRoute(selectedSensor.route)
        ? (closedRouteSensorIds.add(selectedSensor.id), (statusElement.textContent = ''), renderPlan())
        : (statusElement.textContent = '至少绘制三个不共线的点，才能闭合路线。')
    }),
    createActionButton('撤销一点', () => {
      selectedSensor &&
        (closedRouteSensorIds.delete(selectedSensor.id), selectedSensor.route.pop(), renderPlan(), syncRuntimePreview())
    }),
    createActionButton('清空并重新绘制', () => {
      selectedSensor &&
        (flushPendingEdits(),
        (selectedSensor.route = []),
        (selectedSensor.routeClosed = false),
        closedRouteSensorIds.delete(selectedSensor.id),
        (hoverPoint = null),
        (dragPoint = null),
        (isPreviewingWalk = false),
        (previewWalkButton.textContent = '预览行走'),
        (statusElement.textContent = '路径已清空，请重新绘制。'),
        renderPlan(),
        syncRuntimePreview())
    }),
  )
  const viewModeToolbar = createDomElement('div', '', 'i3d-focus-actions presence-view-tools'),
    setViewMode = (nextViewMode: any) => {
      ;(viewMode = nextViewMode),
        planSvgElement.toggleAttribute('hidden', nextViewMode !== 'plan'),
        (routeToolbar.hidden = nextViewMode !== 'plan'),
        (dragPoint = null),
        (hoverPoint = null),
        planModeButton.setAttribute('aria-pressed', String(nextViewMode === 'plan')),
        threeDModeButton.setAttribute('aria-pressed', String(nextViewMode === '3d')),
        isRuntimeReady &&
          (nextViewMode === 'plan'
            ? scheduleTopView()
            : interaction3dHandle.focusCommand('presence-3d-view').catch(showError)),
        renderPlan()
    },
    planModeButton = createActionButton('平面', () => setViewMode('plan')),
    threeDModeButton = createActionButton('3D', () => setViewMode('3d'))
  planModeButton.setAttribute('aria-pressed', 'true'), threeDModeButton.setAttribute('aria-pressed', 'false')
  const previewWalkButton = createActionButton('预览行走', () => {
    if (!selectedSensor || !closedRouteSensorIds.has(selectedSensor.id) || !validPresenceRoute(selectedSensor.route)) {
      statusElement.textContent = '请先绘制路径并闭合，再预览行走。'
      return
    }
    ;(isPreviewingWalk = !isPreviewingWalk),
      (previewWalkButton.textContent = isPreviewingWalk ? '停止预览' : '预览行走'),
      isRuntimeReady && interaction3dHandle.focusCommand('presence-preview-walk', '', isPreviewingWalk).catch(showError)
  })
  viewModeToolbar.append(planModeButton, threeDModeButton, previewWalkButton),
    viewportElement.append(runtimeContainer, planSvgElement),
    planPanel.append(routeTitleElement, planNoteElement, viewModeToolbar, viewportElement, routeToolbar),
    bodyElement.append(bindingsPanel, planPanel, controlsPanel),
    dialogElement.append(headerElement, bodyElement),
    await new Promise((resolveLoad, rejectLoad) => {
      stylesheetLink.addEventListener('load', resolveLoad, {
        once: true,
      }),
        stylesheetLink.addEventListener('error', () => rejectLoad(new Error('安防样式加载失败，请重试。')), {
          once: true,
        }),
        ownerDocument.head.append(stylesheetLink)
    }).catch((styleLoadError) => {
      throw (stylesheetLink.remove(), styleLoadError)
    }),
    ownerDocument.body.append(dialogElement),
    (dialogElement.dataset.i3dPreviewScope = 'presence')
  function showError(errorValue: any) {
    isClosed || (statusElement.textContent = errorValue.message || String(errorValue))
  }
  function currentFloor() {
    return selectedSensor
      ? floors.find((floorById: any) => floorById.id === selectedSensor.floorId)
      : floors.find(
          (floorByEditingId: any) => floorByEditingId.id === (editingFloorId || draftProperties.floorSelection),
        ) || floors[0]
  }
  function scheduleTopView() {
    clearTimeout(topViewTimerId),
      !(!isRuntimeReady || !currentFloor() || viewMode !== 'plan' || !planViewBox) &&
        (topViewTimerId = setTimeout(() => {
          const topViewFloor = currentFloor()
          !isClosed &&
            isRuntimeReady &&
            viewMode === 'plan' &&
            topViewFloor &&
            interaction3dHandle
              .focusCommand('presence-top-view', '', {
                floorId: topViewFloor.id,
                box: planViewBox,
              })
              .catch(showError)
        }, 30))
  }
  function syncRuntimePreview() {
    const activeFloorId = currentFloor()?.id
    if (!activeFloorId) return
    const runtimeProperties = {
      ...structuredClone(draftProperties),
      floorSelection: activeFloorId,
      camera:
        draftProperties.floorCameras?.[activeFloorId] ||
        (draftProperties.floorSelection === activeFloorId ? draftProperties.camera : null),
      security: {
        presenceSensors: selectedSensor
          ? [
              {
                ...structuredClone(selectedSensor),
                routeClosed: closedRouteSensorIds.has(selectedSensor.id),
              },
            ]
          : [],
      },
      pageDimStrength: {
        overview: 0,
        security: 0,
      },
      pageSaturation: {
        overview: 100,
        security: 100,
      },
      autoRotate: {
        enabled: false,
      },
    }
    if (interaction3dHandle) {
      interaction3dHandle.update(runtimeProperties)
      return
    }
    ;(interaction3dHandle = mountInteraction3d(runtimeContainer, {
      component: {
        ...component,
        properties: runtimeProperties,
      },
      context: {
        document: panelDocument,
        editable: true,
      },
      editing: true,
      editingModule: 'security',
      onPresented: () => {
        isClosed ||
          ((isRuntimeReady = true),
          scheduleTopView(),
          isPreviewingWalk && interaction3dHandle.focusCommand('presence-preview-walk', '', true).catch(showError),
          interaction3dHandle.focusCommand('presence-show-hit-range', '', isHitRangeVisible).catch(showError))
      },
      onLoadError: showError,
    })),
      ownerDocument.dispatchEvent(new Event('hb-i3d-preview-scope'))
  }
  function fitPlanToContent() {
    const fittingFloor = currentFloor(),
      planPoints = [
        ...(fittingFloor?.plan?.walls || []).flatMap((wallSegment: any) => [wallSegment.start, wallSegment.end]),
        ...(selectedSensor?.route || []),
      ],
      pointXs = planPoints.map((pointForX) => pointForX.x),
      pointYs = planPoints.map((pointForY) => pointForY.y),
      pixelsPerMeter = fittingFloor?.plan?.pixelsPerMeter || 100,
      minContentX = planPoints.length ? Math.min(...pointXs) : 0,
      minContentY = planPoints.length ? Math.min(...pointYs) : 0,
      contentWidth = Math.max(
        pixelsPerMeter,
        planPoints.length ? Math.max(...pointXs) - minContentX : pixelsPerMeter * 10,
      ),
      contentHeight = Math.max(
        pixelsPerMeter,
        planPoints.length ? Math.max(...pointYs) - minContentY : pixelsPerMeter * 8,
      ),
      viewBoxPadding = Math.max(contentWidth, contentHeight) * 0.1
    ;(planViewBox = {
      x: minContentX - viewBoxPadding,
      y: minContentY - viewBoxPadding,
      w: contentWidth + viewBoxPadding * 2,
      h: contentHeight + viewBoxPadding * 2,
    }),
      renderPlan()
  }
  function renderPlan(shouldScheduleTopView = true) {
    if (!planViewBox) return
    const focusActionButton = controlsPanel.querySelector('[data-presence-focus]')
    focusActionButton &&
      (focusActionButton.disabled =
        !selectedSensor || !closedRouteSensorIds.has(selectedSensor.id) || !validPresenceRoute(selectedSensor.route)),
      planSvgElement.setAttribute(
        'viewBox',
        planViewBox.x + ' ' + planViewBox.y + ' ' + planViewBox.w + ' ' + planViewBox.h,
      ),
      planStaticLayer.replaceChildren(),
      planRouteLayer.replaceChildren()
    const renderFloor = currentFloor()
    previewWalkButton.disabled =
      !selectedSensor || !closedRouteSensorIds.has(selectedSensor.id) || !validPresenceRoute(selectedSensor.route)
    for (const routeToolButton of routeToolbar.querySelectorAll('button'))
      routeToolButton.disabled = !selectedSensor || viewMode !== 'plan'
    if (
      ((planNoteElement.textContent = selectedSensor
        ? renderFloor
          ? viewMode === '3d'
            ? '拖动旋转、滚轮缩放；调整人物大小，再预览行走效果。'
            : closedRouteSensorIds.has(selectedSensor.id)
              ? '路线已闭合 · 可拖动圆点调整路径；切换 3D 查看人物大小。'
              : '请绘制行走路径：依次点击至少三个点，靠近起点可吸附闭合。'
          : '请选择有效楼层。'
        : '添加人在传感器后，在顶视图中绘制行走路径。'),
      (routeTitleElement.textContent = renderFloor ? (renderFloor.name || '楼层') + ' · 行走路线' : '行走路线'),
      shouldScheduleTopView !== false && scheduleTopView(),
      !selectedSensor)
    )
      return
    const routeColor = selectedSensor.color === 'orange' ? '#eaa044' : '#52b8b1'
    planRouteLayer.append(
      createSvgElement(closedRouteSensorIds.has(selectedSensor.id) ? 'polygon' : 'polyline', {
        points: selectedSensor.route.map((routePoint: any) => routePoint.x + ',' + routePoint.y).join(' '),
        fill: closedRouteSensorIds.has(selectedSensor.id) ? routeColor + '14' : 'none',
        stroke: routeColor,
        'stroke-width': 3,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
        'stroke-linejoin': 'round',
      }),
    )
    const svgUnitScale = 1 / Math.max(0.0001, Math.abs(planSvgElement.getScreenCTM()?.a || 1))
    if (
      (selectedSensor.route.forEach((planPoint: any, planPointIndex: any) => {
        planRouteLayer.append(
          createSvgElement('circle', {
            cx: planPoint.x,
            cy: planPoint.y,
            r: (planPointIndex === 0 ? 8 : 6) * svgUnitScale,
            fill: planPointIndex === 0 ? routeColor : '#f7fafc',
            stroke: routeColor,
            'stroke-width': 2,
            'vector-effect': 'non-scaling-stroke',
            'data-point': planPointIndex,
          }),
        )
        const pointLabelElement = createSvgElement('text', {
          x: planPoint.x + 11 * svgUnitScale,
          y: planPoint.y - 9 * svgUnitScale,
          fill: '#64748b',
          'font-size': 11 * svgUnitScale,
          'pointer-events': 'none',
        })
        ;(pointLabelElement.textContent = String(planPointIndex + 1)), planRouteLayer.append(pointLabelElement)
      }),
      !closedRouteSensorIds.has(selectedSensor.id) && hoverPoint && selectedSensor.route.length)
    ) {
      const snappedStartPoint = snapsToPresenceStart(selectedSensor.route, hoverPoint, 1 / svgUnitScale),
        snapTargetPoint = snappedStartPoint ? selectedSensor.route[0] : hoverPoint,
        lastRoutePoint = selectedSensor.route.at(-1)
      planRouteLayer.append(
        createSvgElement('line', {
          x1: lastRoutePoint.x,
          y1: lastRoutePoint.y,
          x2: snapTargetPoint.x,
          y2: snapTargetPoint.y,
          stroke: routeColor,
          'stroke-width': 2,
          'stroke-dasharray': '5 4',
          'vector-effect': 'non-scaling-stroke',
          'pointer-events': 'none',
        }),
      ),
        snappedStartPoint &&
          (planRouteLayer.append(
            createSvgElement('circle', {
              cx: snapTargetPoint.x,
              cy: snapTargetPoint.y,
              r: 16 * svgUnitScale,
              fill: routeColor + '33',
              stroke: routeColor,
              'stroke-width': 2,
              'vector-effect': 'non-scaling-stroke',
              'pointer-events': 'none',
            }),
          ),
          (planNoteElement.textContent = '已吸附起点 · 点击即可闭合路线。'))
    }
  }
  function addFieldLabel(fieldLabel: any, fieldControl: any) {
    const fieldLabelElement = createDomElement('label', '', 'presence-field')
    return (
      fieldLabelElement.append(createDomElement('span', fieldLabel), fieldControl),
      controlsPanel.append(fieldLabelElement),
      fieldControl
    )
  }
  function addNumberField(
    fieldAriaLabel: any,
    propertyKey: any,
    minValue: any,
    maxValue: any,
    stepValue: any,
    scaleFactor = 1,
  ) {
    const numberInput = createDomElement('input')
    Object.assign(numberInput, {
      type: 'number',
      min: minValue,
      max: maxValue,
      step: stepValue,
      value: selectedSensor[propertyKey] * scaleFactor,
    }),
      numberInput.setAttribute('aria-label', fieldAriaLabel)
    const targetSensor = selectedSensor,
      commitNumberField = () => {
        const numericValue = Number(numberInput.value)
        numberInput.value.trim() &&
          Number.isFinite(numericValue) &&
          (targetSensor[propertyKey] = Math.max(minValue, Math.min(maxValue, numericValue)) / scaleFactor),
          (numberInput.value = targetSensor[propertyKey] * scaleFactor)
      }
    pendingSyncHandlers.push(commitNumberField),
      numberInput.addEventListener('change', () => {
        commitNumberField(), syncRuntimePreview()
      }),
      addFieldLabel(fieldAriaLabel, numberInput).parentElement.classList.add('presence-number-field')
  }
  function renderSensorPanel() {
    flushPendingEdits(),
      (pendingSyncHandlers = []),
      (dragPoint = null),
      (hoverPoint = null),
      bindingsPanel.replaceChildren(),
      controlsPanel.replaceChildren(),
      bindingsPanel.append(
        createDomElement('strong', '人在传感器'),
        createDomElement('p', '每个传感器独立设置路线和人物。', 'presence-note'),
      )
    const addSensorButton = createActionButton('＋ 添加人在传感器', () => {
      ;(selectedSensor = {
        id: randomUuid(),
        label: '',
        entityId: '',
        floorId:
          floors.find((addSensorFloor: any) => addSensorFloor.id === component.properties?.floorSelection)?.id ||
          floors[0]?.id ||
          '',
        route: [] as any[],
        speed: 0.45,
        size: 1,
        displayDuration: 0,
        clickToFocus: false,
        hitPadding: 8,
        character: 'traveler',
        color: 'cyan',
      }),
        presenceSensors.push(selectedSensor),
        (isPreviewingWalk = false),
        (previewWalkButton.textContent = '预览行走'),
        setViewMode('plan'),
        (statusElement.textContent = '选择人在传感器后，请在顶视图中绘制行走路径。'),
        renderSensorPanel()
    })
    ;(addSensorButton.disabled = !floors.length), manageBindings && bindingsPanel.append(addSensorButton)
    for (const listedSensor of presenceSensors) {
      const listedSensorButton = createActionButton(
        listedSensor.label || entityNameById.get(listedSensor.entityId) || listedSensor.entityId || '未选择传感器',
        () => {
          ;(selectedSensor = listedSensor), renderSensorPanel()
        },
      )
      listedSensorButton.setAttribute('aria-pressed', String(listedSensor === selectedSensor)),
        bindingsPanel.append(listedSensorButton)
    }
    if (!selectedSensor) {
      // 从安防面板打开时不能在这里添加传感器，要指回去（上游同口径）。
      // 文案选择抽成模块级小函数：把分支留在 `openPresenceEditor` 里会让它的圈复杂度 +1。
      controlsPanel.append(createDomElement('p', missingSensorNote(manageBindings), 'presence-note')),
        fitPlanToContent(),
        syncRuntimePreview()
      return
    }
    const editingSensor = selectedSensor,
      entityPickerButton = createActionButton(
        entityNameById.get(editingSensor.entityId) || editingSensor.entityId || '选择人在传感器',
        async () => {
          try {
            await pickers.entity({
              trigger: entityPickerButton,
              current: editingSensor.entityId,
              deviceKind: 'presence',
              onSelect: (selectedEntityId: any, selectedEntityOption: any) => {
                flushPendingEdits(),
                  (pendingSyncHandlers = []),
                  (editingSensor.entityId = selectedEntityId),
                  selectedEntityId.startsWith('event.') &&
                    !(editingSensor.displayDuration > 0) &&
                    (editingSensor.displayDuration = 30),
                  selectedEntityOption?.name && entityNameById.set(selectedEntityId, selectedEntityOption.name),
                  editingSensor.route.length ||
                    (statusElement.textContent = '已选择传感器，请在顶视图中绘制行走路径。'),
                  renderSensorPanel()
              },
            })
          } catch (pickerError: any) {
            statusElement.textContent = pickerError.message
          }
        },
      )
    entityPickerButton.setAttribute('aria-label', '选择人在传感器'),
      manageBindings
        ? addFieldLabel('人在传感器', entityPickerButton)
        : controlsPanel.append(
            createDomElement(
              'p',
              '检测设备：' +
                (editingSensor.deviceName ||
                  entityNameById.get(editingSensor.entityId) ||
                  editingSensor.entityId ||
                  '未绑定') +
                '（在安防设置中修改）',
              'presence-note',
            ),
          )
    const nameInput = createDomElement('input')
    ;(nameInput.value = editingSensor.label),
      (nameInput.maxLength = 128),
      (nameInput.placeholder = '可选，自定义名称'),
      nameInput.setAttribute('aria-label', '显示名称')
    const commitNameInput = () => {
      editingSensor.label = nameInput.value.slice(0, 128)
    }
    pendingSyncHandlers.push(commitNameInput),
      nameInput.addEventListener('input', commitNameInput),
      nameInput.addEventListener('change', () => {
        commitNameInput()
        const sensorTabButton =
          bindingsPanel.querySelectorAll('button')[presenceSensors.indexOf(editingSensor) + (manageBindings ? 1 : 0)]
        sensorTabButton &&
          (sensorTabButton.textContent =
            editingSensor.label ||
            entityNameById.get(editingSensor.entityId) ||
            editingSensor.entityId ||
            '未选择传感器')
      }),
      addFieldLabel('显示名称', nameInput)
    const floorSelect = createDomElement('select')
    if (
      (floorSelect.setAttribute('aria-label', '路线楼层'),
      !floors.some((knownFloor: any) => knownFloor.id === editingSensor.floorId))
    ) {
      const missingFloorOption = createDomElement('option', '原楼层已不存在，请重新选择')
      ;(missingFloorOption.value = ''), floorSelect.append(missingFloorOption)
    }
    for (const floorOptionSource of floors) {
      const floorOption = createDomElement('option', floorOptionSource.name || floorOptionSource.id)
      ;(floorOption.value = floorOptionSource.id), floorSelect.append(floorOption)
    }
    ;(floorSelect.value = editingSensor.floorId),
      floorSelect.addEventListener('change', () => {
        ;(editingSensor.floorId = floorSelect.value),
          delete editingSensor.modelId,
          (editingSensor.route = []),
          closedRouteSensorIds.delete(editingSensor.id),
          renderSensorPanel()
      }),
      addFieldLabel('路线楼层', floorSelect),
      (floorSelect.disabled = !manageBindings),
      (editingSensor.displayPages = 'all'),
      controlsPanel.append(createDomElement('p', '显示页面：ALL（全部页面）', 'presence-note')),
      controlsPanel.append(createDomElement('strong', '人物方案'))
    const designsContainer = createDomElement('div', '', 'presence-designs')
    for (const [designKey, design] of Object.entries(DESIGNS)) {
      const designButton = createActionButton(design.name, () => {
        ;(editingSensor.character = designKey), renderSensorPanel()
      })
      designButton.setAttribute('aria-pressed', String(editingSensor.character === designKey)),
        designsContainer.append(designButton)
    }
    controlsPanel.append(designsContainer)
    const characterPreviewElement = createDomElement('div', '', 'presence-character-preview')
    characterPreviewElement.setAttribute('aria-label', '人物行走预览'),
      controlsPanel.append(characterPreviewElement),
      characterWalker && characterPreviewElement.append(characterWalker.renderer.domElement),
      controlsPanel.append(
        createDomElement('p', (DESIGNS as any)[editingSensor.character]?.description || '', 'presence-note'),
      )
    const colorsContainer = createDomElement('div', '', 'presence-colors')
    for (const [colorKey, colorLabel] of [
      ['cyan', '统一青色'],
      ['orange', '统一橙色'],
    ]) {
      const colorButton = createActionButton(colorLabel, () => {
        ;(editingSensor.color = colorKey), renderSensorPanel()
      })
      ;(colorButton.dataset.color = colorKey),
        colorButton.setAttribute('aria-pressed', String(editingSensor.color === colorKey)),
        colorsContainer.append(colorButton)
    }
    if ((controlsPanel.append(colorsContainer), manageBindings)) {
      const triggerModeSelect = createDomElement('select')
      triggerModeSelect.setAttribute('aria-label', '触发方式')
      for (const [triggerModeKey, triggerModeLabel] of PRESENCE_TRIGGER_MODES) {
        const triggerModeOption = createDomElement('option', triggerModeLabel)
        ;(triggerModeOption.value = triggerModeKey), triggerModeSelect.append(triggerModeOption)
      }
      if (
        ((triggerModeSelect.value = editingSensor.triggerMode || 'auto'),
        triggerModeSelect.addEventListener('change', () => {
          flushPendingEdits(),
            (pendingSyncHandlers = []),
            (editingSensor.triggerMode = triggerModeSelect.value),
            triggerModeSelect.value === 'equals' && (editingSensor.triggerValue ||= 'on'),
            triggerModeSelect.value === 'threshold' && (editingSensor.triggerThreshold ??= 0),
            presenceTriggerIsTimed(editingSensor) &&
              !(editingSensor.displayDuration > 0) &&
              (editingSensor.displayDuration = 30),
            renderSensorPanel()
        }),
        addFieldLabel('触发方式', triggerModeSelect),
        editingSensor.triggerMode === 'threshold' &&
          ((editingSensor.triggerThreshold ??= 0),
          addNumberField('数值大于', 'triggerThreshold', -1000000, 1000000, 0.1)),
        editingSensor.triggerMode === 'equals')
      ) {
        const triggerValueInput = createDomElement('input')
        ;(triggerValueInput.value = editingSensor.triggerValue ?? 'on'),
          (triggerValueInput.maxLength = 128),
          triggerValueInput.setAttribute('aria-label', '触发值')
        const commitTriggerValue = () => {
          triggerValueInput.value.trim() && (editingSensor.triggerValue = triggerValueInput.value.trim().slice(0, 128))
        }
        pendingSyncHandlers.push(commitTriggerValue),
          triggerValueInput.addEventListener('input', commitTriggerValue),
          addFieldLabel('触发值', triggerValueInput)
      }
    }
    const isTimedTrigger = presenceTriggerIsTimed(editingSensor)
    addNumberField('每次触发显示时长（秒）', 'displayDuration', isTimedTrigger ? 1 : 0, 3600, 1),
      controlsPanel.append(
        createDomElement(
          'p',
          isTimedTrigger
            ? '每次满足触发条件后显示，再次触发重新计时；到时隐藏。'
            : '0：随有人状态显示；其他值：到时隐藏，无人立即隐藏，下次触发重新计时。',
          'presence-note',
        ),
      ),
      addNumberField('行走速度（米/秒）', 'speed', 0.1, 2, 0.05),
      addNumberField('人物大小（%）', 'size', 25, 300, 5, 100),
      controlsPanel.append(
        createDomElement(
          'p',
          (isTimedTrigger
            ? '事件触发后沿路线走动；计时结束或离线时隐藏。'
            : '有人时沿路线循环走动；无人或离线时隐藏。') + '路线是展示动画，不代表实际人员位置。',
          'presence-note',
        ),
      )
    const focusToggleInput = createDomElement('input')
    ;(focusToggleInput.type = 'checkbox'),
      (focusToggleInput.checked = editingSensor.clickToFocus === true),
      focusToggleInput.setAttribute('aria-label', '点击模型聚焦'),
      focusToggleInput.addEventListener('change', () => {
        ;(editingSensor.clickToFocus = focusToggleInput.checked), renderSensorPanel()
      })
    const focusToggleLabel = addFieldLabel('点击模型聚焦', focusToggleInput)
    if (((focusToggleLabel.parentElement.className = 'i3d-setting-toggle'), editingSensor.clickToFocus)) {
      ;(editingSensor.hitPadding ??= 8), addNumberField('触控范围扩展（px）', 'hitPadding', 0, 80, 1)
      const hitRangeToggleInput = createDomElement('input')
      ;(hitRangeToggleInput.type = 'checkbox'),
        (hitRangeToggleInput.checked = isHitRangeVisible),
        hitRangeToggleInput.setAttribute('aria-label', '显示触控范围'),
        hitRangeToggleInput.addEventListener('change', () => {
          ;(isHitRangeVisible = hitRangeToggleInput.checked),
            isRuntimeReady &&
              interaction3dHandle.focusCommand('presence-show-hit-range', '', isHitRangeVisible).catch(showError)
        }),
        (addFieldLabel('显示触控范围', hitRangeToggleInput).parentElement.className = 'i3d-setting-toggle'),
        controlsPanel.append(
          createDomElement('p', '在模型周围扩展点击范围，不改变人物大小。0 表示只点击模型本身。', 'presence-note'),
        ),
        controlsPanel.append(createDomElement('h4', '聚焦视角'))
      const openFocusEditor = (previewOnly: any) =>
          openPresenceFocusEditor({
            component: component,
            properties: draftProperties,
            item: editingSensor,
            panelDocument: panelDocument,
            previewOnly: previewOnly,
            onSave: (focusCameraOption: any) => {
              ;(editingSensor.focusCamera = focusCameraOption), renderSensorPanel()
            },
          }),
        focusSettingsButton = createActionButton(editingSensor.focusCamera ? '调整视角' : '设置视角', () =>
          openFocusEditor(false),
        )
      ;(focusSettingsButton.dataset.presenceFocus = 'true'),
        (focusSettingsButton.disabled =
          !closedRouteSensorIds.has(editingSensor.id) || !validPresenceRoute(editingSensor.route))
      const focusPreviewButton = createActionButton('预览聚焦', () => openFocusEditor(true))
      focusPreviewButton.disabled = focusSettingsButton.disabled
      const focusActionsContainer = createDomElement('div', '', 'i3d-focus-actions')
      focusActionsContainer.append(focusSettingsButton, focusPreviewButton), controlsPanel.append(focusActionsContainer)
      const resetFocusButton = createActionButton('恢复自动聚焦', () => {
        delete editingSensor.focusCamera, renderSensorPanel()
      })
      ;(resetFocusButton.disabled = !editingSensor.focusCamera), controlsPanel.append(resetFocusButton)
    }
    manageBindings &&
      controlsPanel.append(
        createActionButton('删除此传感器', () => {
          presenceSensors.splice(presenceSensors.indexOf(editingSensor), 1),
            closedRouteSensorIds.delete(editingSensor.id),
            (selectedSensor = presenceSensors[0] || null),
            renderSensorPanel()
        }),
      ),
      fitPlanToContent(),
      syncRuntimePreview()
  }
  const clientToSvgPoint = (pointerDownOrigin: any) => {
    const svgPoint = planSvgElement.createSVGPoint()
    return (
      (svgPoint.x = pointerDownOrigin.clientX),
      (svgPoint.y = pointerDownOrigin.clientY),
      svgPoint.matrixTransform(planSvgElement.getScreenCTM().inverse())
    )
  }
  planSvgElement.addEventListener('pointerdown', (pointerDownEvent: any) => {
    if (
      viewMode !== 'plan' ||
      pointerDownEvent.button !== 0 ||
      !selectedSensor ||
      !floors.some((pointerFloor: any) => pointerFloor.id === selectedSensor.floorId)
    )
      return
    const dataPointIndex = pointerDownEvent.target.getAttribute('data-point')
    if (
      (pointerDownEvent.preventDefault(),
      planSvgElement.setPointerCapture(pointerDownEvent.pointerId),
      !closedRouteSensorIds.has(selectedSensor.id) &&
        snapsToPresenceStart(
          selectedSensor.route,
          clientToSvgPoint(pointerDownEvent),
          planSvgElement.getScreenCTM()?.a || 1,
        ))
    ) {
      closedRouteSensorIds.add(selectedSensor.id),
        (hoverPoint = null),
        (statusElement.textContent = '路径已吸附闭合，可以切换 3D 预览大小和行走效果。'),
        renderPlan(),
        syncRuntimePreview()
      return
    }
    if (dataPointIndex !== null) {
      if (
        Number(dataPointIndex) === 0 &&
        !closedRouteSensorIds.has(selectedSensor.id) &&
        validPresenceRoute(selectedSensor.route)
      ) {
        closedRouteSensorIds.add(selectedSensor.id), renderPlan()
        return
      }
      dragPoint = {
        index: Number(dataPointIndex),
      }
    } else {
      if (!closedRouteSensorIds.has(selectedSensor.id) && selectedSensor.route.length < 128) {
        const newRoutePoint = clientToSvgPoint(pointerDownEvent)
        selectedSensor.route.push({
          x: newRoutePoint.x,
          y: newRoutePoint.y,
        }),
          renderPlan()
      }
    }
  }),
    planSvgElement.addEventListener('pointermove', (pointerMoveEvent: any) => {
      if (viewMode !== 'plan') return
      const movedRoutePoint = clientToSvgPoint(pointerMoveEvent)
      if (!dragPoint) {
        selectedSensor &&
          !closedRouteSensorIds.has(selectedSensor.id) &&
          ((hoverPoint = movedRoutePoint), renderPlan(false))
        return
      }
      ;(selectedSensor.route[dragPoint.index] = {
        x: movedRoutePoint.x,
        y: movedRoutePoint.y,
      }),
        renderPlan(false)
    }),
    planSvgElement.addEventListener('pointerleave', () => {
      ;(hoverPoint = null), dragPoint || renderPlan(false)
    })
  const finishDragging = () => {
    ;(dragPoint = null), syncRuntimePreview()
  }
  for (const pointerEventName of ['pointerup', 'pointercancel', 'lostpointercapture'])
    planSvgElement.addEventListener(pointerEventName, finishDragging)
  const planResizeObserver = new ResizeObserver(() => renderPlan())
  planResizeObserver.observe(planSvgElement),
    dialogElement.addEventListener('cancel', (cancelEvent: any) => {
      cancelEvent.preventDefault(), closeEditor()
    })
  function renderCharacterFrame(frameTimestamp: any) {
    if (!(isClosed || ownerDocument.hidden)) {
      if (characterWalker && selectedSensor) {
        const walkerKey = selectedSensor.character + ':' + selectedSensor.color
        appliedWalkerKey !== walkerKey &&
          (disposeWalker(characterWalker.root),
          (characterWalker.root = createWalker(
            characterWalker.THREE,
            selectedSensor.color === 'orange' ? 15376452 : 5421233,
            selectedSensor.character,
          )),
          characterWalker.scene.add(characterWalker.root),
          (appliedWalkerKey = walkerKey))
        const frameDeltaSeconds = lastFrameTimestamp ? Math.min(0.1, (frameTimestamp - lastFrameTimestamp) / 1000) : 0
        ;(lastFrameTimestamp = frameTimestamp),
          (walkerElapsed += frameDeltaSeconds),
          (walkerDistance += frameDeltaSeconds * selectedSensor.speed * 12),
          animateWalker(characterWalker.root, walkerDistance, 1, walkerElapsed),
          characterWalker.renderer.render(characterWalker.scene, characterWalker.camera)
      }
      animationFrameId = requestAnimationFrame(renderCharacterFrame)
    }
  }
  function startCharacterAnimation() {
    cancelAnimationFrame(animationFrameId),
      (lastFrameTimestamp = 0),
      !ownerDocument.hidden && !isClosed && (animationFrameId = requestAnimationFrame(renderCharacterFrame))
  }
  ownerDocument.addEventListener('visibilitychange', startCharacterAnimation),
    dialogElement.showModal(),
    renderSensorPanel()
  try {
    const threeModule = await import('/static/vendor/three/0.187.0/three.module.min.js')
    if (isClosed) return
    const webglRenderer = new threeModule.WebGLRenderer({
      alpha: true,
      antialias: true,
    })
    webglRenderer.setPixelRatio(Math.min(devicePixelRatio, 2)), webglRenderer.setSize(240, 160)
    const threeScene = new threeModule.Scene(),
      threeCamera = new threeModule.PerspectiveCamera(32, 1.5, 0.1, 20)
    threeCamera.position.set(2, 1.7, 3),
      threeCamera.lookAt(0, 0.7, 0),
      threeScene.add(new threeModule.HemisphereLight(16777215, 7831948, 2.5))
    const directionalLight = new threeModule.DirectionalLight(16772824, 3)
    directionalLight.position.set(3, 5, 3), threeScene.add(directionalLight)
    const walkerRoot = createWalker(threeModule)
    threeScene.add(walkerRoot),
      (characterWalker = {
        THREE: threeModule,
        renderer: webglRenderer,
        scene: threeScene,
        camera: threeCamera,
        root: walkerRoot,
      }),
      controlsPanel.querySelector('.presence-character-preview')?.append(webglRenderer.domElement),
      startCharacterAnimation()
  } catch {
    /* 预览挂载 best-effort：控制面板结构变化或动画启动失败时仍返回可用的编辑器 */
  }
  return {
    close: closeEditor,
  }
}

export function openPresenceFocusEditor({
  component: component,
  properties: properties,
  item: item,
  panelDocument: panelDocument,
  onSave: onSave,
  previewOnly: previewOnly = false,
}: any) {
  const editorDocument = window.document,
    createElement = (tagName: any, initialText = '') => domElement(editorDocument, tagName, '', initialText),
    dialogElement = createElement('dialog')
  ;(dialogElement.className = 'i3d-editor'),
    dialogElement.setAttribute('aria-label', '人在传感器聚焦视角'),
    (dialogElement.dataset.i3dPreviewScope = 'presence-focus')
  const headerElement = createElement('header'),
    bodyElement = createElement('div')
  bodyElement.className = 'i3d-editor-body'
  const viewElement = createElement('div'),
    panelElement = createElement('aside'),
    statusElement = createElement('p', '正在加载户型…')
  viewElement.className = 'i3d-editor-view'
  const aspectBoxElement = createElement('div'),
    stageHostElement = createElement('div')
  ;(aspectBoxElement.className = 'i3d-editor-aspect'),
    (stageHostElement.className = 'i3d-editor-stage'),
    aspectBoxElement.append(stageHostElement),
    viewElement.append(aspectBoxElement)
  const updatePreviewSize = () => {
      const previewSize = interaction3dPreviewSize(
        component,
        panelDocument,
        viewElement.clientWidth,
        viewElement.clientHeight,
      )
      Object.assign(aspectBoxElement.style, {
        width: previewSize.width + 'px',
        height: previewSize.height + 'px',
      })
    },
    previewResizeObserver = observeInteraction3dPreview(viewElement, updatePreviewSize)
  let editorRuntime: any,
    isReady = false,
    isClosed = false,
    isBusy = false,
    cameraState: any = null,
    commandQueue = Promise.resolve(),
    isEditing = !previewOnly
  const actionButtons: any[] = [],
    createButton = (buttonLabel: any, onButtonClick: any) => {
      const buttonElement = createElement('button', buttonLabel)
      return (
        (buttonElement.type = 'button'),
        buttonElement.addEventListener('click', onButtonClick),
        actionButtons.push(buttonElement),
        buttonElement
      )
    },
    closeEditor = () => {
      isClosed ||
        ((isClosed = true),
        previewResizeObserver.disconnect(),
        editorRuntime?.(),
        dialogElement.close(),
        dialogElement.remove(),
        editorDocument.dispatchEvent(new Event('hb-i3d-preview-scope')))
    },
    syncControls = () => {
      actionButtons.forEach((actionButton) => {
        actionButton.disabled = !isReady || isBusy
      }),
        (saveButtonElement.hidden = !isEditing),
        (adjustButtonElement.hidden = isEditing),
        (closeButtonElement.textContent = isEditing ? '取消调整' : '关闭预览'),
        (closeButtonElement.disabled = false),
        (projectionGroupElement.hidden = !isEditing),
        (focalLengthFieldElement.hidden = !isEditing),
        (focalLengthInputElement.disabled = !isEditing || !isReady || isBusy || cameraState?.mode !== 'perspective'),
        editorDocument.activeElement !== focalLengthInputElement &&
          (focalLengthInputElement.value = String(Math.round(cameraState?.focalLength || 50)))
      for (const [projectionMode, projectionButtonElement] of projectionButtonsByMode)
        projectionButtonElement.setAttribute(
          'aria-pressed',
          String((cameraState?.mode || 'orthographic') === projectionMode),
        )
    },
    queueFocusCommand = async (commandName: any, commandPayload: any = null) => {
      if (!isReady || isBusy || isClosed) return
      const isFocalLengthCommand = commandName === 'focus-focal-length',
        previousQueuePromise = commandQueue
      let releaseQueueGate
      ;(commandQueue = new Promise((resolveQueueGate) => {
        releaseQueueGate = resolveQueueGate
      })),
        isFocalLengthCommand || ((isBusy = true), syncControls())
      try {
        if ((await previousQueuePromise, isClosed)) return
        const commandResult = await editorRuntime.focusCommand(commandName, 'presence:' + item.id, commandPayload)
        if (isClosed) return
        commandResult?.camera && (cameraState = commandResult.camera),
          commandName === 'save-light-camera'
            ? (onSave(commandResult.camera), closeEditor())
            : (commandName === 'edit-light-camera' && (isEditing = true),
              (statusElement.textContent = isEditing
                ? '拖动旋转 · 右键平移 · 滚轮缩放。调整完成后保存视角。'
                : '正在预览聚焦视角。'))
      } catch (commandError: any) {
        isClosed || (statusElement.textContent = commandError.message)
      } finally {
        releaseQueueGate!(), isFocalLengthCommand || (isBusy = false), isClosed || syncControls()
      }
    },
    saveButtonElement = createButton('保存视角', () => queueFocusCommand('save-light-camera'))
  saveButtonElement.className = 'primary'
  const adjustButtonElement = createButton('调整视角', () => queueFocusCommand('edit-light-camera')),
    closeButtonElement = createButton('取消调整', closeEditor)
  headerElement.append(
    createElement('strong', (item.label || '人在传感器') + ' · 聚焦视角'),
    saveButtonElement,
    adjustButtonElement,
    closeButtonElement,
  )
  const projectionGroupElement = createElement('div')
  ;(projectionGroupElement.className = 'i3d-focus-actions'),
    projectionGroupElement.setAttribute('role', 'group'),
    projectionGroupElement.setAttribute('aria-label', '聚焦投影')
  const projectionButtonsByMode = new Map()
  for (const [modeId, modeLabel] of [
    ['orthographic', '正交'],
    ['perspective', '透视'],
  ]) {
    const modeButtonElement = createButton(modeLabel, () => queueFocusCommand('focus-projection', modeId))
    projectionButtonsByMode.set(modeId, modeButtonElement), projectionGroupElement.append(modeButtonElement)
  }
  const focalLengthInputElement = createElement('input')
  Object.assign(focalLengthInputElement, {
    type: 'number',
    min: '18',
    max: '120',
    step: '1',
    value: '50',
  }),
    focalLengthInputElement.setAttribute('aria-label', '焦段（mm）'),
    focalLengthInputElement.addEventListener('change', () => {
      const typedFocalLength = Number(focalLengthInputElement.value)
      if (!focalLengthInputElement.value.trim() || !Number.isFinite(typedFocalLength)) {
        focalLengthInputElement.value = String(cameraState?.focalLength || 50)
        return
      }
      ;(focalLengthInputElement.value = String(Math.max(18, Math.min(120, typedFocalLength)))),
        queueFocusCommand('focus-focal-length', Number(focalLengthInputElement.value))
    })
  const focalLengthFieldElement = createElement('label')
  focalLengthFieldElement.append(createElement('span', '焦段（mm）'), focalLengthInputElement),
    syncControls(),
    panelElement.append(
      statusElement,
      projectionGroupElement,
      focalLengthFieldElement,
      createElement('p', '此视角用于点击小人后的聚焦展示，不弹出控制面板。'),
    ),
    bodyElement.append(viewElement, panelElement),
    dialogElement.append(headerElement, bodyElement),
    editorDocument.body.append(dialogElement),
    dialogElement.addEventListener('cancel', (cancelEvent: any) => {
      cancelEvent.preventDefault(), closeEditor()
    }),
    dialogElement.showModal(),
    updatePreviewSize()
  const draftProperties = structuredClone(properties)
  ;(draftProperties.security = {
    presenceSensors: [structuredClone(item)],
  }),
    (draftProperties.floorSelection = item.floorId),
    (draftProperties.camera =
      draftProperties.floorCameras?.[item.floorId] ||
      (properties.floorSelection === item.floorId ? properties.camera : null)),
    (editorRuntime = mountInteraction3d(stageHostElement, {
      component: {
        ...component,
        properties: draftProperties,
      },
      context: {
        document: panelDocument,
        editable: true,
      },
      editing: true,
      editingModule: 'security',
      onPresented: () => {
        isReady ||
          isClosed ||
          ((isReady = true), queueFocusCommand(previewOnly ? 'preview-light-camera' : 'edit-light-camera'))
      },
      onLoadError: (loadError: any) => {
        statusElement.textContent = loadError.message || String(loadError)
      },
    })),
    editorDocument.dispatchEvent(new Event('hb-i3d-preview-scope'))
}

const PRESENCE_PAGES = [
  ['overview', 'ALL（全部楼层）'],
  ['light', '灯光'],
  ['environment', '环境'],
  ['devices', '设备'],
  ['vacuum', '扫地机'],
  ['security', '安防'],
]
export function presenceVisibleOnPage(presenceBinding: any, pageId: any) {
  const displayPages = presenceBinding.displayPages ?? ['overview', 'light', 'security']
  return (
    PRESENCE_PAGES.some(([pageKey]) => pageKey === pageId) &&
    (displayPages === 'all' || (Array.isArray(displayPages) && displayPages.includes(pageId)))
  )
}
export function validPresenceRoute(route: any) {
  if (
    !Array.isArray(route) ||
    route.length < 3 ||
    route.length > 128 ||
    route.some(
      (point) =>
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        Math.abs(point.x) > 1000000 ||
        Math.abs(point.y) > 1000000,
    )
  )
    return false
  const firstPoint = route[0]
  return new Set(route.map((candidatePoint) => candidatePoint.x + ',' + candidatePoint.y)).size !== route.length
    ? false
    : route.slice(1, -1).some((middlePoint, pointIndex) => {
        const nextPoint = route[pointIndex + 2]
        return (
          Math.abs(
            (middlePoint.x - firstPoint.x) * (nextPoint.y - firstPoint.y) -
              (middlePoint.y - firstPoint.y) * (nextPoint.x - firstPoint.x),
          ) > 0.000001
        )
      })
}
export function snapsToPresenceStart(routePoints: any, probePoint: any, screenScale: any, tolerancePx = 16) {
  return (
    validPresenceRoute(routePoints) &&
    !!probePoint &&
    Math.hypot(probePoint.x - routePoints[0].x, probePoint.y - routePoints[0].y) * Math.abs(screenScale) <= tolerancePx
  )
}
function presenceIsActive(entityState: any) {
  const resolvedState = entityState?.newState || entityState
  return resolvedState?.available !== false && resolvedState?.state === 'on'
}
export const PRESENCE_TRIGGER_MODES = [
  ['auto', '自动识别'],
  ['threshold', '数值大于阈值'],
  ['equals', '变为指定值'],
  ['change', '状态值变化'],
]
export function presenceTriggerIsTimed(triggerBinding: any) {
  return (
    ['equals', 'change'].includes(triggerBinding.triggerMode) ||
    ((!triggerBinding.triggerMode || triggerBinding.triggerMode === 'auto') &&
      triggerBinding.entityId?.startsWith('event.'))
  )
}
export function createPresenceTriggers(nowProvider = () => Date.now()) {
  const triggersByBindingId = new Map()
  return {
    sync(bindings: any, states: any) {
      const presentIdSet = new Set(bindings.map((bindingEntry: any) => bindingEntry.id))
      for (const staleId of triggersByBindingId.keys()) presentIdSet.has(staleId) || triggersByBindingId.delete(staleId)
      for (const binding of bindings) {
        const state = states[binding.entityId]?.newState || states[binding.entityId],
          stateText = typeof state?.state == 'string' ? state.state.trim() : '',
          isAvailable =
            state?.available !== false && !!stateText && !['unknown', 'unavailable'].includes(stateText.toLowerCase())
        let triggerMode = binding.triggerMode || 'auto'
        if (triggerMode === 'auto') {
          const hasPeopleCountPattern =
            /person_count|people_count|occupancy_count|human_count|人数|人员数量|人体数量/i.test(
              binding.entityId + ' ' + (state?.attributes?.friendly_name || ''),
            )
          triggerMode = binding.entityId?.startsWith('event.')
            ? 'event'
            : hasPeopleCountPattern && Number.isFinite(Number(stateText))
              ? 'threshold'
              : 'state'
        }
        const configKey = JSON.stringify([
          binding.entityId,
          binding.triggerMode || 'auto',
          binding.triggerValue ?? 'on',
          binding.triggerThreshold ?? 0,
        ])
        let previousRecord = triggersByBindingId.get(binding.id)
        previousRecord?.key !== configKey && (previousRecord = null)
        const changedAtMs = Date.parse(state?.lastChanged || state?.last_changed || ''),
          timestampMs = Number.isFinite(changedAtMs) ? Math.min(changedAtMs, nowProvider()) : null,
          durationSeconds = ['equals', 'change', 'event'].includes(triggerMode)
            ? binding.displayDuration > 0
              ? binding.displayDuration
              : 30
            : (binding.displayDuration ?? 0)
        if (triggerMode === 'event') {
          const eventTimestampMs = /^\d{4}-\d{2}-\d{2}T/.test(stateText) ? Date.parse(stateText) : NaN
          triggersByBindingId.set(binding.id, {
            key: configKey,
            on: isAvailable && Number.isFinite(eventTimestampMs),
            started: eventTimestampMs,
            duration: durationSeconds,
          })
          continue
        }
        if (triggerMode === 'equals' || triggerMode === 'change') {
          const changedForMode = isAvailable && previousRecord?.available && stateText !== previousRecord.value,
            isNewerTimestamp =
              timestampMs === null || previousRecord?.timestamp == null || timestampMs > previousRecord.timestamp,
            shouldTrigger =
              changedForMode &&
              isNewerTimestamp &&
              (triggerMode === 'change' || stateText === String(binding.triggerValue ?? 'on').trim())
          triggersByBindingId.set(binding.id, {
            key: configKey,
            value: stateText,
            available: isAvailable,
            timestamp: timestampMs,
            duration: durationSeconds,
            on: isAvailable && (shouldTrigger || !!previousRecord?.on),
            started: shouldTrigger ? (timestampMs ?? nowProvider()) : (previousRecord?.started ?? nowProvider()),
          })
          continue
        }
        const isOn =
            isAvailable &&
            (triggerMode === 'threshold'
              ? Number.isFinite(Number(stateText)) &&
                Number(stateText) > (binding.triggerMode === 'threshold' ? (binding.triggerThreshold ?? 0) : 0)
              : presenceIsActive(state)),
          isValueChanged = previousRecord?.value !== stateText,
          startedMs =
            !previousRecord || (isOn && (!previousRecord.on || isValueChanged))
              ? (timestampMs ?? nowProvider())
              : previousRecord.started
        triggersByBindingId.set(binding.id, {
          key: configKey,
          value: stateText,
          on: isOn,
          timestamp: timestampMs,
          started: startedMs,
          duration: durationSeconds,
        })
      }
    },
    visible(bindingId: any) {
      const record = triggersByBindingId.get(bindingId)
      return (
        !!record?.on &&
        nowProvider() >= record.started &&
        (!record.duration || nowProvider() - record.started < record.duration * 1000)
      )
    },
  }
}
export function closedPath(points: any) {
  const segments: any[] = []
  let totalLength = 0
  for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex++) {
    const fromPoint = points[edgeIndex],
      toPoint = points[(edgeIndex + 1) % points.length],
      segmentLength = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y, toPoint.z - fromPoint.z)
    segmentLength > 1e-8 &&
      (segments.push({
        a: fromPoint,
        b: toPoint,
        start: totalLength,
        length: segmentLength,
      }),
      (totalLength += segmentLength))
  }
  return {
    length: totalLength,
    segments: segments,
  }
}
export function sampleClosedPath(path: any, distance: any) {
  if (!(path.length > 0)) return null
  const wrappedDistance = ((distance % path.length) + path.length) % path.length,
    segment =
      path.segments.find(
        (candidateSegment: any) => wrappedDistance < candidateSegment.start + candidateSegment.length,
      ) || path.segments.at(-1),
    segmentRatio = (wrappedDistance - segment.start) / segment.length
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * segmentRatio,
    y: segment.a.y + (segment.b.y - segment.a.y) * segmentRatio,
    z: segment.a.z + (segment.b.z - segment.a.z) * segmentRatio,
    heading: Math.atan2(segment.b.x - segment.a.x, segment.b.z - segment.a.z),
  }
}

export function createPresenceScene(sceneOptions: any, wakeFrameLoop = () => {}, nowProvider: any) {
  const actorsByBindingId = new Map(),
    progressByBindingId = new Map()
  let elapsedSeconds = 0
  const triggers = createPresenceTriggers(nowProvider)
  let hasDirtyReflections = false,
    footShadowAssets: any = null
  function createFootShadow() {
    if (!footShadowAssets) {
      const shadowPixels = new Uint8Array(16384)
      for (let pixelY = 0; pixelY < 64; pixelY++)
        for (let pixelX = 0; pixelX < 64; pixelX++) {
          const radialDistance = Math.hypot(((pixelX + 0.5) / 64) * 2 - 1, ((pixelY + 0.5) / 64) * 2 - 1)
          shadowPixels[(pixelY * 64 + pixelX) * 4 + 3] = Math.round(
            255 * Math.max(0, 1 - radialDistance * radialDistance) ** 2,
          )
        }
      const shadowTexture = new sceneOptions.THREE.DataTexture(shadowPixels, 64, 64)
      ;(shadowTexture.magFilter = shadowTexture.minFilter = sceneOptions.THREE.LinearFilter),
        (shadowTexture.needsUpdate = true),
        (footShadowAssets = {
          texture: shadowTexture,
          geometry: new sceneOptions.THREE.PlaneGeometry(1.05, 0.8),
        })
    }
    const shadowMaterial = new sceneOptions.THREE.MeshBasicMaterial({
        map: footShadowAssets.texture,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        toneMapped: false,
      }),
      shadowMesh = new sceneOptions.THREE.Mesh(footShadowAssets.geometry, shadowMaterial)
    return (
      (shadowMesh.name = 'presence-foot-shadow'),
      (shadowMesh.rotation.x = -Math.PI / 2),
      (shadowMesh.renderOrder = 2),
      (shadowMesh.userData.environmentEffect = true),
      (shadowMesh.raycast = () => {}),
      shadowMesh
    )
  }
  function flushReflectionFloors() {
    hasDirtyReflections && ((hasDirtyReflections = false), sceneOptions.requestRender?.())
  }
  function applyActorOpacity(actor: any, targetOpacity: any) {
    actor.opacity = targetOpacity
    for (const [material, originalMaterialState] of actor.materials) {
      ;(material.opacity = originalMaterialState.opacity * targetOpacity),
        (material.depthWrite = targetOpacity < 1 ? false : originalMaterialState.depthWrite)
      const shouldBeTransparent = originalMaterialState.transparent || targetOpacity < 1
      material.transparent !== shouldBeTransparent &&
        ((material.transparent = shouldBeTransparent), (material.needsUpdate = true))
    }
    ;(actor.shadow.material.opacity = 0.62 * targetOpacity), (hasDirtyReflections = true)
  }
  function measureActorBounds(measuredActor: any) {
    const bounds = new sceneOptions.THREE.Box3()
    measuredActor.root.updateWorldMatrix(true, true)
    for (const childObject of measuredActor.root.children)
      childObject !== measuredActor.shadow && bounds.expandByObject(childObject)
    return bounds
  }
  const scratchFootPosition = new sceneOptions.THREE.Vector3()
  let cachedSceneModelRoot: any,
    cachedSceneRevision: any,
    cachedBackgroundFloor: any,
    cachedDocument: any,
    rugPlacements: any = []
  function resolveGroundHeight(samplePoint: any, sampleFloorId: any) {
    if (
      cachedSceneModelRoot !== sceneOptions.modelRoot ||
      cachedSceneRevision !== sceneOptions.sceneRevision ||
      cachedBackgroundFloor !== sceneOptions.backgroundFloor ||
      cachedDocument !== sceneOptions.document
    ) {
      ;(cachedSceneModelRoot = sceneOptions.modelRoot),
        (cachedSceneRevision = sceneOptions.sceneRevision),
        (cachedBackgroundFloor = sceneOptions.backgroundFloor),
        (cachedDocument = sceneOptions.document),
        (rugPlacements = [])
      for (const floor of sceneOptions.document?.floors || [])
        for (const sceneItem of floor.scene?.items || []) {
          if (sceneItem.type !== 'rug') continue
          const pixelsPerMeter = floor.scene.calibration?.pixelsPerMeter || 1,
            rotationRad = ((sceneItem.rotation || 0) * Math.PI) / 180,
            cosRotation = Math.cos(rotationRad),
            sinRotation = Math.sin(rotationRad),
            rugCenter = sceneOptions.worldPoint(floor.id, sceneItem.x, sceneItem.y, sceneItem.elevation || 0),
            rugXAxisPoint = sceneOptions.worldPoint(
              floor.id,
              sceneItem.x + cosRotation * pixelsPerMeter,
              sceneItem.y + sinRotation * pixelsPerMeter,
              sceneItem.elevation || 0,
            ),
            rugZAxisPoint = sceneOptions.worldPoint(
              floor.id,
              sceneItem.x - sinRotation * pixelsPerMeter,
              sceneItem.y + cosRotation * pixelsPerMeter,
              sceneItem.elevation || 0,
            )
          !rugCenter ||
            !rugXAxisPoint ||
            !rugZAxisPoint ||
            rugPlacements.push({
              floorId: floor.id,
              center: rugCenter,
              x: rugXAxisPoint.sub(rugCenter).normalize(),
              z: rugZAxisPoint.sub(rugCenter).normalize(),
              width: sceneItem.width,
              depth: sceneItem.depth,
              height: Math.max(0.004, Math.min(0.018, sceneItem.height ?? 0.012)) + 0.001,
            })
        }
    }
    let groundHeightY = samplePoint.y
    for (const rugPlacement of rugPlacements) {
      if (rugPlacement.floorId !== sampleFloorId) continue
      const offsetX = samplePoint.x - rugPlacement.center.x,
        offsetZ = samplePoint.z - rugPlacement.center.z
      if (
        Math.abs(offsetX * rugPlacement.x.x + offsetZ * rugPlacement.x.z) > rugPlacement.width / 2 ||
        Math.abs(offsetX * rugPlacement.z.x + offsetZ * rugPlacement.z.z) > rugPlacement.depth / 2
      )
        continue
      const rugTopY = rugPlacement.center.y + rugPlacement.height
      rugTopY >= groundHeightY && rugTopY - samplePoint.y <= 0.05 && (groundHeightY = rugTopY)
    }
    return groundHeightY
  }
  const removeActor = (removalBindingId: any) => {
    const removedActor = actorsByBindingId.get(removalBindingId)
    progressByBindingId.set(removalBindingId, {
      key: removedActor.progressKey,
      distance: removedActor.distance,
    }),
      (hasDirtyReflections = true),
      removedActor.shadow.removeFromParent(),
      removedActor.shadow.material.dispose(),
      disposeWalker(removedActor.root),
      removedActor.routeLine &&
        (removedActor.routeLine.geometry.dispose(),
        removedActor.routeLine.material.dispose(),
        removedActor.routeLine.removeFromParent()),
      actorsByBindingId.delete(removalBindingId)
  }
  function placeActor(placedActor: any) {
    const pathSample = sampleClosedPath(placedActor.path, placedActor.distance)
    if (!pathSample) return
    const resolvedGroundY = resolveGroundHeight(pathSample, placedActor.floorId)
    placedActor.root.position.set(pathSample.x, resolvedGroundY, pathSample.z),
      (placedActor.root.rotation.y = pathSample.heading),
      animateWalker(
        placedActor.root,
        (placedActor.distance / placedActor.size) * 12,
        placedActor.preview ? 0 : 1,
        elapsedSeconds,
      ),
      placedActor.root.updateMatrixWorld(true)
    const groundOffsetY = Math.min(
      ...placedActor.root.userData.parts.legs.map(
        (legRig: any) => (
          legRig.foot.getWorldPosition(scratchFootPosition),
          scratchFootPosition.y - placedActor.root.userData.soleHeight * placedActor.size
        ),
      ),
    )
    ;(placedActor.root.position.y += resolvedGroundY + 0.014 * placedActor.size - groundOffsetY),
      (placedActor.shadow.position.y = (resolvedGroundY + 0.008 - placedActor.root.position.y) / placedActor.size)
  }
  function computeHitRects(renderCamera: any, hitCanvasElement: any, sensorBindings: any, layoutSize: any) {
    const hitCanvasRect = hitCanvasElement.getBoundingClientRect(),
      hitRects: any[] = []
    for (const [hitBindingId, hitActor] of actorsByBindingId) {
      const hitBinding = sensorBindings.find((hitProbe: any) => hitProbe.id === hitBindingId)
      if (!hitBinding?.clickToFocus || hitActor.exiting || hitActor.opacity <= 0) continue
      const actorBounds = measureActorBounds(hitActor),
        projectedCorners: any[] = []
      for (const boundX of [actorBounds.min.x, actorBounds.max.x])
        for (const boundY of [actorBounds.min.y, actorBounds.max.y])
          for (const boundZ of [actorBounds.min.z, actorBounds.max.z])
            projectedCorners.push(new sceneOptions.THREE.Vector3(boundX, boundY, boundZ).project(renderCamera))
      if (projectedCorners.every((cornerPoint) => cornerPoint.z < -1 || cornerPoint.z > 1)) continue
      const screenXList = projectedCorners.map(
          (cornerForX) => hitCanvasRect.left + ((cornerForX.x + 1) * hitCanvasRect.width) / 2,
        ),
        screenYList = projectedCorners.map(
          (cornerForY) => hitCanvasRect.top + ((1 - cornerForY.y) * hitCanvasRect.height) / 2,
        ),
        leftPx = Math.min(...screenXList),
        topPx = Math.min(...screenYList),
        widthPx = Math.max(...screenXList) - leftPx,
        heightPx = Math.max(...screenYList) - topPx,
        paddingPx = hitBinding.hitPadding ?? 8,
        scaleX = layoutSize?.width > 0 ? hitCanvasRect.width / layoutSize.width : 1,
        scaleY = layoutSize?.height > 0 ? hitCanvasRect.height / layoutSize.height : 1
      hitRects.push({
        id: hitBindingId,
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        padding: paddingPx,
        scaleX: scaleX,
        scaleY: scaleY,
      })
    }
    return hitRects
  }
  return {
    sync(
      bindings: any[] = [],
      states: Record<string, any> = {},
      enabled = false,
      floorId = 'all',
      isEditing = false,
      isPreviewWalk = false,
      activeModule = 'light',
    ) {
      triggers.sync(bindings, states)
      const liveBindingIdSet = new Set()
      let hasSceneChanges = false
      if (sceneOptions.overlayScene && sceneOptions.worldPoint)
        for (const binding of bindings) {
          if (
            binding.routeClosed === false ||
            (!isEditing && !binding.entityId) ||
            !validPresenceRoute(binding.route) ||
            !enabled ||
            (floorId !== 'all' && binding.floorId !== floorId) ||
            (!isEditing && (!triggers.visible(binding.id) || !presenceVisibleOnPage(binding, activeModule)))
          )
            continue
          const worldPoints = binding.route.map((routePoint: any) =>
            sceneOptions.worldPoint(binding.floorId, routePoint.x, routePoint.y, 0),
          )
          if (
            worldPoints.some(
              (pointProbe: any) => !pointProbe || ![pointProbe.x, pointProbe.y, pointProbe.z].every(Number.isFinite),
            )
          )
            continue
          const actorSignature = JSON.stringify([binding, worldPoints, isEditing, isPreviewWalk])
          let actorRecord = actorsByBindingId.get(binding.id)
          if (
            (actorRecord && actorRecord.signature !== actorSignature && (removeActor(binding.id), (actorRecord = null)),
            !actorRecord)
          ) {
            const walkerRoot = createWalker(
                sceneOptions.THREE,
                binding.color === 'orange' ? 15376452 : 5421233,
                binding.character,
              ),
              actorMaterialSet = new Set<any>()
            walkerRoot.traverse((meshObject: any) => {
              meshObject.isMesh && actorMaterialSet.add(meshObject.material)
            })
            for (const actorMaterial of actorMaterialSet)
              actorMaterial.emissive?.getHex() ||
                (actorMaterial.emissive.copy(actorMaterial.color), (actorMaterial.emissiveIntensity = 0.55))
            const walkerSize = binding.size ?? 1
            walkerRoot.scale.setScalar(walkerSize),
              (walkerRoot.userData.presenceId = binding.id),
              (walkerRoot.userData.environmentFloorId = binding.floorId),
              sceneOptions.overlayScene.add(walkerRoot)
            const progressSignature = JSON.stringify([binding.entityId, binding.floorId, binding.route, isEditing]),
              savedProgress = progressByBindingId.get(binding.id)
            if (
              ((actorRecord = {
                root: walkerRoot,
                size: walkerSize,
                floorId: binding.floorId,
                shadow: createFootShadow(),
                materials: new Map(
                  [...actorMaterialSet].map((materialItem) => [
                    materialItem,
                    {
                      opacity: materialItem.opacity,
                      transparent: materialItem.transparent,
                      depthWrite: materialItem.depthWrite,
                    },
                  ]),
                ),
                opacity: 1,
                exiting: false,
                path: closedPath(worldPoints),
                distance: savedProgress?.key === progressSignature ? savedProgress.distance : 0,
                progressKey: progressSignature,
                speed: binding.speed ?? 0.45,
                signature: actorSignature,
                simulated: isEditing,
                preview: isEditing && !isPreviewWalk,
              }),
              walkerRoot.add(actorRecord.shadow),
              applyActorOpacity(actorRecord, isEditing ? 1 : 0),
              isEditing)
            ) {
              const routeLinePoints = [...worldPoints, worldPoints[0]].map(
                (linePoint) => new sceneOptions.THREE.Vector3(linePoint.x, linePoint.y + 0.025, linePoint.z),
              )
              ;(actorRecord.routeLine = new sceneOptions.THREE.Line(
                new sceneOptions.THREE.BufferGeometry().setFromPoints(routeLinePoints),
                new sceneOptions.THREE.LineBasicMaterial({
                  color: binding.color === 'orange' ? 15376452 : 5421233,
                  depthTest: true,
                }),
              )),
                (actorRecord.routeLine.name = 'presence-route-preview'),
                (actorRecord.routeLine.userData.environmentFloorId = binding.floorId),
                (actorRecord.routeLine.userData.environmentEffect = true),
                sceneOptions.overlayScene.add(actorRecord.routeLine)
            }
            actorsByBindingId.set(binding.id, actorRecord), placeActor(actorRecord), (hasSceneChanges = true)
          }
          actorRecord.exiting && ((actorRecord.exiting = false), (hasSceneChanges = true)),
            liveBindingIdSet.add(binding.id)
        }
      for (const [staleBindingId, staleActor] of actorsByBindingId)
        if (!liveBindingIdSet.has(staleBindingId)) {
          const bindingMatch = bindings.find((bindingProbe) => bindingProbe.id === staleBindingId)
          !isEditing &&
          enabled &&
          bindingMatch &&
          triggers.visible(staleBindingId) &&
          (floorId === 'all' || staleActor.floorId === floorId) &&
          !presenceVisibleOnPage(bindingMatch, activeModule)
            ? staleActor.exiting || ((staleActor.exiting = true), (hasSceneChanges = true))
            : (removeActor(staleBindingId), (hasSceneChanges = true))
        }
      for (const progressBindingId of progressByBindingId.keys())
        (!bindings.some((bindingEntry) => bindingEntry.id === progressBindingId) ||
          (!isEditing && !triggers.visible(progressBindingId))) &&
          progressByBindingId.delete(progressBindingId)
      flushReflectionFloors(), hasSceneChanges && (sceneOptions.requestRender?.(), wakeFrameLoop())
    },
    tick(deltaSeconds: any) {
      const stepSeconds = Math.max(0, Math.min(0.1, Number(deltaSeconds) || 0))
      elapsedSeconds += stepSeconds
      let shouldRender = false
      for (const trackedBindingId of actorsByBindingId.keys())
        !actorsByBindingId.get(trackedBindingId).simulated &&
          !triggers.visible(trackedBindingId) &&
          (removeActor(trackedBindingId), progressByBindingId.delete(trackedBindingId), (shouldRender = true))
      for (const [actorBindingId, tickedActor] of actorsByBindingId) {
        const fadeTargetOpacity = tickedActor.exiting ? 0 : 1
        if (
          (tickedActor.opacity !== fadeTargetOpacity &&
            stepSeconds > 0 &&
            applyActorOpacity(
              tickedActor,
              fadeTargetOpacity > tickedActor.opacity
                ? Math.min(1, tickedActor.opacity + stepSeconds / 0.22)
                : Math.max(0, tickedActor.opacity - stepSeconds / 0.22),
            ),
          tickedActor.exiting)
        ) {
          tickedActor.opacity === 0 && removeActor(actorBindingId)
          continue
        }
        tickedActor.preview ||
          stepSeconds === 0 ||
          ((tickedActor.distance = (tickedActor.distance + stepSeconds * tickedActor.speed) % tickedActor.path.length),
          placeActor(tickedActor),
          (hasDirtyReflections = true))
      }
      const isAnimating = [...actorsByBindingId.values()].some(
        (trackedActor) => !trackedActor.preview || trackedActor.opacity !== 1,
      )
      return (flushReflectionFloors(), (isAnimating || shouldRender) && sceneOptions.requestRender?.(), isAnimating)
    },
    anchor(bindingId: any) {
      const anchoredActor = actorsByBindingId.get(bindingId)
      return anchoredActor
        ? {
            center: [
              anchoredActor.root.position.x,
              anchoredActor.root.position.y + 0.7 * anchoredActor.size,
              anchoredActor.root.position.z,
            ],
          }
        : null
    },
    hitRects: computeHitRects,
    pick(clientX: any, clientY: any, camera: any, canvasElement: any, pickBindings: any, pickLayoutSize: any) {
      const pickCanvasRect = canvasElement.getBoundingClientRect()
      if (!pickCanvasRect.width || !pickCanvasRect.height) return null
      const clickableActors = [...actorsByBindingId.entries()].filter(
          ([pickBindingId, entryActor]) =>
            !entryActor.exiting &&
            entryActor.opacity > 0 &&
            pickBindings.find((clickBinding: any) => clickBinding.id === pickBindingId)?.clickToFocus === true,
        ),
        raycaster = new sceneOptions.THREE.Raycaster()
      raycaster.setFromCamera(
        new sceneOptions.THREE.Vector2(
          ((clientX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
          1 - ((clientY - pickCanvasRect.top) / pickCanvasRect.height) * 2,
        ),
        camera,
      )
      for (const [, clickableActor] of clickableActors) clickableActor.root.updateMatrixWorld(true)
      const intersections = raycaster.intersectObjects(
        clickableActors.map(([, raycastActor]) => raycastActor.root),
        true,
      )
      if (intersections.length)
        return (
          clickableActors.find(([, candidateActor]) => {
            let sceneNode = intersections[0].object
            for (; sceneNode; ) {
              if (sceneNode === candidateActor.root) return true
              sceneNode = sceneNode.parent
            }
            return false
          })?.[0] || null
        )
      const paddingHits: any[] = []
      for (const {
        id: rectId,
        left: rectLeft,
        top: rectTop,
        width: rectWidth,
        height: rectHeight,
        padding: rectPadding,
        scaleX: rectScaleX,
        scaleY: rectScaleY,
      } of computeHitRects(camera, canvasElement, pickBindings, pickLayoutSize)) {
        if (!rectPadding) continue
        const dxPx = Math.max(rectLeft - clientX, 0, clientX - rectLeft - rectWidth),
          dyPx = Math.max(rectTop - clientY, 0, clientY - rectTop - rectHeight),
          distancePx = Math.hypot(dxPx / rectScaleX, dyPx / rectScaleY)
        distancePx <= rectPadding &&
          paddingHits.push({
            id: rectId,
            distance: distancePx,
          })
      }
      return paddingHits.sort((firstHit, secondHit) => firstHit.distance - secondHit.distance)[0]?.id || null
    },
    dispose() {
      for (const disposedBindingId of actorsByBindingId.keys()) removeActor(disposedBindingId)
      progressByBindingId.clear(),
        flushReflectionFloors(),
        footShadowAssets?.geometry.dispose(),
        footShadowAssets?.texture.dispose(),
        (footShadowAssets = null),
        (rugPlacements = []),
        (cachedSceneModelRoot = null),
        (cachedSceneRevision = null),
        (cachedDocument = null),
        (cachedBackgroundFloor = null)
    },
  }
}
export function createPresenceWaves(waveOptions: any, wakeWaveFrameLoop = () => {}) {
  const { THREE: THREE } = waveOptions,
    waveRecordsByBindingId = new Map(),
    ringGeometry = new THREE.RingGeometry(0.965, 1, 48)
  ringGeometry.rotateX(-Math.PI / 2)
  let cachedWaveModelRoot: any,
    cachedRevision: any,
    cachedSignature = '',
    isDisposed = false,
    hasVisibleWave = false
  const requestWaveRender = () => {
      waveOptions.requestRender?.(), wakeWaveFrameLoop()
    },
    reducedMotionQuery =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ??
      globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)'),
    handleMotionPreferenceChange = () => {
      !isDisposed && hasVisibleWave && requestWaveRender()
    }
  reducedMotionQuery?.addEventListener?.('change', handleMotionPreferenceChange)
  const isNodeVisibleInModel = (probedModel: any) => {
      for (let ancestorNode = probedModel; ancestorNode; ancestorNode = ancestorNode.parent) {
        if (ancestorNode.visible === false) return false
        if (ancestorNode === cachedWaveModelRoot) return true
      }
      return false
    },
    removeWaveRecord = (removedWave: any) => {
      removedWave.group.removeFromParent(),
        removedWave.rings.forEach((disposedRing: any) => disposedRing.material.dispose())
    }
  function syncWaves({
    bindings: waveBindings = [],
    states: waveStates = {},
    enabled: wavesEnabled = false,
    floorId: waveFloorId = '',
    preview: wavePreview = false,
  }: {
    bindings?: any[]

    states?: any
    enabled?: boolean
    floorId?: string
    preview?: boolean
  }) {
    if (isDisposed) return
    let hasWaveChanges = false
    const revision = waveOptions.environmentRevision ?? waveOptions.sceneRevision,
      bindingSignature = JSON.stringify(
        waveBindings.map((waveBinding) => [
          waveBinding.id,
          waveBinding.floorId,
          waveBinding.modelId,
          waveBinding.width,
          waveBinding.height,
          waveBinding.depth,
        ]),
      )
    if (
      cachedWaveModelRoot !== waveOptions.modelRoot ||
      cachedRevision !== revision ||
      cachedSignature !== bindingSignature
    ) {
      ;(cachedWaveModelRoot = waveOptions.modelRoot), (cachedRevision = revision), (cachedSignature = bindingSignature)
      const presenceModelsByKey = new Map()
      cachedWaveModelRoot?.traverse((modelNode: any) => {
        modelNode.userData?.environmentModelType === 'presence' &&
          presenceModelsByKey.set(
            JSON.stringify([modelNode.userData.environmentFloorId, modelNode.userData.environmentModelId]),
            modelNode,
          )
      })
      const visibleBindingIdSet = new Set()
      for (const waveBindingItem of waveBindings) {
        const matchedModelNode = presenceModelsByKey.get(
          JSON.stringify([waveBindingItem.floorId, waveBindingItem.modelId]),
        )
        if (!matchedModelNode || !waveOptions.overlayScene) continue
        visibleBindingIdSet.add(waveBindingItem.id)
        let waveRecord = waveRecordsByBindingId.get(waveBindingItem.id)
        if (waveRecord?.model !== matchedModelNode) {
          ;(hasWaveChanges = true), waveRecord && removeWaveRecord(waveRecord)
          const waveGroup = new THREE.Group()
          ;(waveGroup.name = 'presence-waves-' + waveBindingItem.id),
            (waveGroup.matrixAutoUpdate = false),
            (waveGroup.userData.environmentEffect = true)
          const ringMeshes = Array.from(
            {
              length: 3,
            },
            () => {
              const createdRingMesh = new THREE.Mesh(
                ringGeometry,
                new THREE.MeshBasicMaterial({
                  color: 12838102,
                  transparent: true,
                  opacity: 0,
                  side: THREE.DoubleSide,
                  depthWrite: false,
                  toneMapped: false,
                }),
              )
              return ((createdRingMesh.raycast = () => {}), waveGroup.add(createdRingMesh), createdRingMesh)
            },
          )
          waveOptions.overlayScene.add(waveGroup),
            (waveRecord = {
              group: waveGroup,
              rings: ringMeshes,
              model: matchedModelNode,
            }),
            waveRecordsByBindingId.set(waveBindingItem.id, waveRecord)
        }
        const radius = Math.max(0.02, (waveBindingItem.width || 0.16) * 0.5),
          depthRatio = (waveBindingItem.depth || waveBindingItem.width || 0.16) / (waveBindingItem.width || 0.16),
          ringHeight = (waveBindingItem.height || 0.2) * 0.755
        ;(waveRecord.radius !== radius ||
          waveRecord.depthRatio !== depthRatio ||
          waveRecord.rings[0].position.y !== ringHeight) &&
          (hasWaveChanges = true),
          (waveRecord.radius = radius),
          (waveRecord.depthRatio = depthRatio)
        for (const ringMesh of waveRecord.rings) ringMesh.position.y = ringHeight
      }
      for (const [waveBindingId, staleWave] of waveRecordsByBindingId)
        visibleBindingIdSet.has(waveBindingId) ||
          ((hasWaveChanges = true), removeWaveRecord(staleWave), waveRecordsByBindingId.delete(waveBindingId))
    }
    hasVisibleWave = false
    for (const waveBindingEntry of waveBindings) {
      const activeWaveRecord = waveRecordsByBindingId.get(waveBindingEntry.id)
      if (!activeWaveRecord) continue
      const waveScale = Number.isFinite(waveBindingEntry.waveScale)
          ? Math.max(0.25, Math.min(3, waveBindingEntry.waveScale))
          : 1,
        waveOpacity = Number.isFinite(waveBindingEntry.waveOpacity)
          ? Math.max(0, Math.min(100, waveBindingEntry.waveOpacity)) / 100
          : 0.68
      ;(activeWaveRecord.scale !== waveScale || activeWaveRecord.opacity !== waveOpacity) && (hasWaveChanges = true),
        (activeWaveRecord.scale = waveScale),
        (activeWaveRecord.opacity = waveOpacity)
      const stateEntry = waveStates?.get?.(waveBindingEntry.entityId) ?? waveStates[waveBindingEntry.entityId],
        resolvedState = stateEntry?.newState || stateEntry,
        isActiveState =
          resolvedState?.available !== false &&
          !!resolvedState?.state &&
          !['unknown', 'unavailable'].includes(resolvedState.state)
      activeWaveRecord.enabled =
        wavesEnabled &&
        waveBindingEntry.waveEnabled !== false &&
        activeWaveRecord.opacity > 0 &&
        (wavePreview || isActiveState) &&
        waveBindingEntry.floorId === waveFloorId
      const isWaveActive = activeWaveRecord.enabled && isNodeVisibleInModel(activeWaveRecord.model)
      activeWaveRecord.group.visible !== isWaveActive && (hasWaveChanges = true),
        (activeWaveRecord.group.visible = isWaveActive),
        (hasVisibleWave ||= activeWaveRecord.enabled)
    }
    hasWaveChanges && requestWaveRender()
  }
  function tickWaves(elapsedMs: any) {
    if (isDisposed || !hasVisibleWave) return false
    const isReducedMotion = reducedMotionQuery?.matches === true
    let hasRingChanges = false,
      shouldAnimate = false
    for (const visibleWave of waveRecordsByBindingId.values()) {
      const isWaveVisible = visibleWave.enabled && isNodeVisibleInModel(visibleWave.model)
      if (
        (visibleWave.group.visible !== isWaveVisible &&
          ((visibleWave.group.visible = isWaveVisible), (hasRingChanges = true)),
        !!isWaveVisible)
      ) {
        ;(shouldAnimate ||= !isReducedMotion),
          visibleWave.model.updateWorldMatrix(true, false),
          visibleWave.group.matrix.equals(visibleWave.model.matrixWorld) ||
            (visibleWave.group.matrix.copy(visibleWave.model.matrixWorld),
            (visibleWave.group.matrixWorldNeedsUpdate = true),
            (hasRingChanges = true))
        for (let ringIndex = 0; ringIndex < visibleWave.rings.length; ringIndex++) {
          const ringPhase = isReducedMotion ? 0.35 : (elapsedMs / 2400 + ringIndex / 3) % 1,
            ringScale = visibleWave.radius * (1.05 + ringPhase * 20) * visibleWave.scale,
            ringObject = visibleWave.rings[ringIndex],
            isRingVisible = !isReducedMotion || ringIndex === 0,
            ringOpacity = visibleWave.opacity * Math.pow(1 - ringPhase, 0.7),
            ringScaleZ = ringScale * visibleWave.depthRatio
          ;(ringObject.visible !== isRingVisible ||
            ringObject.scale.x !== ringScale ||
            ringObject.scale.z !== ringScaleZ ||
            ringObject.material.opacity !== ringOpacity) &&
            (hasRingChanges = true),
            (ringObject.visible = isRingVisible),
            ringObject.scale.set(ringScale, 1, ringScaleZ),
            (ringObject.material.opacity = ringOpacity)
        }
      }
    }
    return (hasRingChanges && requestWaveRender(), shouldAnimate)
  }
  return {
    sync: syncWaves,
    tick: tickWaves,
    dispose() {
      if (!isDisposed) {
        ;(isDisposed = true), reducedMotionQuery?.removeEventListener?.('change', handleMotionPreferenceChange)
        for (const disposedWave of waveRecordsByBindingId.values()) removeWaveRecord(disposedWave)
        waveRecordsByBindingId.clear(), ringGeometry.dispose()
      }
    },
  }
}
