import { createVacuumMapImageLoader } from './vacuum'
import { domElement } from '@app/shared/util/dom-factory'
import { createSvgElement as createSvgElementFromFactory } from '@app/shared/util/svg-factory'
import { createConfigurationFeedback } from '../config-ui/configuration-feedback'
import {
  vacuumStatus as resolveVacuumStatus,
  vacuumMapAvailable as N,
  vacuumMapRequestable as R,
  vacuumMapSource as resolveVacuumMapSource,
  createVacuumMapImageLoader as $,
} from '@app/shared/device'

function planFurniture(
  plan: {
    pixelsPerMeter?: number | string
    items?: {
      id?: string
      name?: string
      type?: string
      color?: string
      x?: number
      y?: number
      width?: number
      depth?: number
      rotation?: number
    }[]
  } = {},
) {
  const pixelsPerMeter = Number(plan.pixelsPerMeter) > 0 ? Number(plan.pixelsPerMeter) : 1,
    excludedFurnitureTypeSet = new Set([
      'downlight',
      'ceilinglight',
      'striplight',
      'camera',
      'presence',
      'flooropening',
      'label',
    ])
  return (plan.items || [])
    .filter(
      (planItem) =>
        !excludedFurnitureTypeSet.has(planItem.type!) &&
        [planItem.x, planItem.y, planItem.width, planItem.depth].every(Number.isFinite) &&
        planItem.width! > 0 &&
        planItem.depth! > 0,
    )
    .map((furniture) => ({
      ...furniture,
      width: furniture.width! * pixelsPerMeter,
      depth: furniture.depth! * pixelsPerMeter,
      rotation: Number(furniture.rotation) || 0,
    }))
}
export function openVacuumMapEditor({
  item: vacuumItem,
  floor: floor,
  onSave: saveHandler,
  getMapState: getMapState = () => null,
}: any) {
  const documentRef = window.document,
    createHtmlElement = (tagName: any, textContent = '') => domElement(documentRef, tagName, '', textContent),
    createSvgElement = (svgTagName: any, svgAttributes: Record<string, any> = {}) =>
      createSvgElementFromFactory(svgTagName, svgAttributes, undefined, documentRef),
    walls = floor?.plan?.walls || [],
    furnitureItems = planFurniture(floor?.plan),
    planPoints = [...walls.flatMap((wall: any) => [wall.start, wall.end]), ...furnitureItems.flatMap(mapCorners)],
    boundsMinX = planPoints.length ? Math.min(...planPoints.map((pointForX) => pointForX.x)) : 0,
    boundsMinY = planPoints.length ? Math.min(...planPoints.map((pointForY) => pointForY.y)) : 0,
    boundsWidth = Math.max(
      100,
      planPoints.length ? Math.max(...planPoints.map((pointForWidth) => pointForWidth.x)) - boundsMinX : 1000,
    ),
    boundsDepth = Math.max(
      100,
      planPoints.length ? Math.max(...planPoints.map((pointForDepth) => pointForDepth.y)) - boundsMinY : 1000,
    ),
    defaultMapConfig = {
      x: boundsMinX + boundsWidth / 2,
      y: boundsMinY + boundsDepth / 2,
      width: boundsWidth,
      depth: boundsDepth,
      rotation: 0,
      opacity: 45,
      visible: true,
    },
    draftState = {
      map: {
        ...defaultMapConfig,
        ...structuredClone(vacuumItem.map || {}),
      },
    },
    dialogElement = createHtmlElement('dialog')
  ;(dialogElement.className = 'i3d-vacuum-map-editor'), dialogElement.setAttribute('aria-label', '底图对齐')
  const headerElement = createHtmlElement('header'),
    titleElement = createHtmlElement('strong', (floor?.name || '当前楼层') + ' · 底图对齐'),
    statusElement = createHtmlElement('span')
  statusElement.setAttribute('role', 'status')
  // 底图对齐的保存反馈：拖拽 / 缩放 / 改数值都算脏，关闭前拦住未保存的调整。
  const configurationFeedback = createConfigurationFeedback({
    read: () => draftState,
    status: statusElement,
    document: documentRef,
    savedMessage: '已应用，最后保存扫地机配置',
  })
  let isClosed = false,
    dragState: any = null
  const closeEditor = () => {
      isClosed ||
        ((isClosed = true),
        configurationFeedback.dispose(),
        mapImageLoader.dispose(),
        document.removeEventListener('visibilitychange', syncMapImage),
        resizeObserver.disconnect(),
        dialogElement.close(),
        dialogElement.remove())
    },
    createButton = (buttonLabel: any, onClick: any) => {
      const createdButtonElement = createHtmlElement('button', buttonLabel)
      return (
        (createdButtonElement.type = 'button'),
        createdButtonElement.addEventListener('click', onClick),
        createdButtonElement
      )
    },
    saveButtonElement = createButton('保存', () => void acceptMap())
  function acceptMap() {
    const savedSnapshot = configurationFeedback.capture()
    saveHandler(structuredClone(savedSnapshot))
    configurationFeedback.saved(savedSnapshot)
  }
  saveButtonElement.className = 'primary'
  const closeButtonElement = createButton('×', () =>
    configurationFeedback.requestClose(closeEditor, async () => acceptMap()),
  )
  closeButtonElement.setAttribute('aria-label', '关闭底图对齐'),
    headerElement.append(titleElement, statusElement, saveButtonElement, closeButtonElement)
  const bodyElement = createHtmlElement('div')
  bodyElement.className = 'i3d-vacuum-map-body'
  const planElement = createHtmlElement('div')
  planElement.className = 'i3d-vacuum-plan'
  const planPadding = Math.max(boundsWidth, boundsDepth) * 0.12,
    svgElement = createSvgElement('svg', {
      viewBox:
        boundsMinX -
        planPadding +
        ' ' +
        (boundsMinY - planPadding) +
        ' ' +
        (boundsWidth + planPadding * 2) +
        ' ' +
        (boundsDepth + planPadding * 2),
      role: 'img',
      'aria-label': '户型平面与扫地机地图',
    })
  let viewBoxState = {
    x: boundsMinX - planPadding,
    y: boundsMinY - planPadding,
    width: boundsWidth + planPadding * 2,
    height: boundsDepth + planPadding * 2,
  }
  const applyViewBox = () => {
      svgElement.setAttribute(
        'viewBox',
        viewBoxState.x + ' ' + viewBoxState.y + ' ' + viewBoxState.width + ' ' + viewBoxState.height,
      ),
        renderEditor()
    },
    scaleMap = (scaleFactor: any) => {
      const draftMap = draftState.map,
        clampedScale = Math.max(
          0.01 / Math.min(draftMap.width, draftMap.depth),
          Math.min(1000000 / Math.max(draftMap.width, draftMap.depth), scaleFactor),
        )
      ;(draftMap.width *= clampedScale), (draftMap.depth *= clampedScale), renderEditor()
    },
    zoomView = (zoomFactor: any) => {
      const nextViewWidth = Math.max(boundsWidth * 0.15, Math.min(boundsWidth * 10, viewBoxState.width * zoomFactor)),
        viewScaleRatio = nextViewWidth / viewBoxState.width
      ;(viewBoxState = {
        x: viewBoxState.x + (viewBoxState.width - nextViewWidth) / 2,
        y: viewBoxState.y + (viewBoxState.height * (1 - viewScaleRatio)) / 2,
        width: nextViewWidth,
        height: viewBoxState.height * viewScaleRatio,
      }),
        applyViewBox()
    },
    mapImageElement = createSvgElement('image', {
      preserveAspectRatio: 'none',
    }),
    furnitureLayerElement = createSvgElement('g', {
      'pointer-events': 'none',
      'data-layer': 'furniture',
    }),
    wallsLayerElement = createSvgElement('g'),
    handlesLayerElement = createSvgElement('g'),
    furnitureLabels: any = []
  for (const furnitureEntry of furnitureItems) {
    const furnitureWidth = furnitureEntry.width,
      furnitureDepth = furnitureEntry.depth,
      furnitureGroupElement = createSvgElement('g', {
        transform:
          'translate(' + furnitureEntry.x + ' ' + furnitureEntry.y + ') rotate(' + furnitureEntry.rotation + ')',
        'data-furniture-id': furnitureEntry.id,
        fill: /^#[0-9a-f]{6}$/i.test(furnitureEntry.color || '') ? furnitureEntry.color : '#91a4b5',
        'fill-opacity': 0.28,
        stroke: '#d0dae3',
        'stroke-width': 1,
        'stroke-opacity': 0.8,
      }),
      appendFurnitureShape = (shapeTagName: any, shapeAttributes: any) =>
        furnitureGroupElement.append(
          createSvgElement(shapeTagName, {
            ...shapeAttributes,
            'vector-effect': 'non-scaling-stroke',
          }),
        ),
      isRoundFurniture = ['plant', 'robotvacuum', 'roundtable', 'stool'].includes(furnitureEntry.type!)
    if (
      (appendFurnitureShape(
        isRoundFurniture ? 'ellipse' : 'rect',
        isRoundFurniture
          ? {
              cx: 0,
              cy: 0,
              rx: furnitureWidth / 2,
              ry: furnitureDepth / 2,
            }
          : {
              x: -furnitureWidth / 2,
              y: -furnitureDepth / 2,
              width: furnitureWidth,
              height: furnitureDepth,
              rx: Math.min(furnitureWidth, furnitureDepth) * 0.06,
            },
      ),
      furnitureEntry.type === 'bed'
        ? (appendFurnitureShape('rect', {
            x: -furnitureWidth * 0.42,
            y: -furnitureDepth * 0.43,
            width: furnitureWidth * 0.36,
            height: furnitureDepth * 0.2,
            rx: furnitureDepth * 0.03,
          }),
          appendFurnitureShape('rect', {
            x: furnitureWidth * 0.06,
            y: -furnitureDepth * 0.43,
            width: furnitureWidth * 0.36,
            height: furnitureDepth * 0.2,
            rx: furnitureDepth * 0.03,
          }),
          appendFurnitureShape('line', {
            x1: -furnitureWidth / 2,
            x2: furnitureWidth / 2,
            y1: -furnitureDepth * 0.12,
            y2: -furnitureDepth * 0.12,
          }))
        : furnitureEntry.type === 'sofa' &&
          (appendFurnitureShape('rect', {
            x: -furnitureWidth * 0.38,
            y: -furnitureDepth * 0.26,
            width: furnitureWidth * 0.76,
            height: furnitureDepth * 0.65,
            rx: furnitureDepth * 0.04,
          }),
          appendFurnitureShape('line', {
            x1: 0,
            x2: 0,
            y1: -furnitureDepth * 0.26,
            y2: furnitureDepth * 0.39,
          })),
      furnitureLayerElement.append(furnitureGroupElement),
      furnitureEntry.name)
    ) {
      const furnitureLabelElement = createSvgElement('text', {
        x: furnitureEntry.x,
        y: furnitureEntry.y,
        fill: '#e0e7ed',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        stroke: '#17212d',
        'stroke-width': 2.5,
        'paint-order': 'stroke',
        'vector-effect': 'non-scaling-stroke',
      })
      ;(furnitureLabelElement.textContent = furnitureEntry.name),
        furnitureLayerElement.append(furnitureLabelElement),
        furnitureLabels.push({
          label: furnitureLabelElement,
          item: furnitureEntry,
        })
    }
  }
  for (const wallSegment of walls)
    wallsLayerElement.append(
      createSvgElement('line', {
        x1: wallSegment.start.x,
        y1: wallSegment.start.y,
        x2: wallSegment.end.x,
        y2: wallSegment.end.y,
        stroke: '#9fa9bc',
        'stroke-width': Math.max(2, wallSegment.thickness || boundsWidth * 0.006),
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      }),
    )
  svgElement.append(mapImageElement, furnitureLayerElement, wallsLayerElement, handlesLayerElement),
    planElement.append(svgElement)
  const viewToolsElement = createHtmlElement('div')
  ;(viewToolsElement.className = 'i3d-vacuum-view-tools'),
    viewToolsElement.append(
      createButton('地图 −', () => scaleMap(1 / 1.1)),
      createButton('地图 +', () => scaleMap(1.1)),
      createButton('视图 −', () => zoomView(1.2)),
      createButton('视图 +', () => zoomView(1 / 1.2)),
      createButton('显示全部', () => {
        const visiblePoints = [...planPoints, ...mapCorners(draftState.map)],
          viewPadding = Math.max(boundsWidth, boundsDepth) * 0.15,
          viewMinX = Math.min(...visiblePoints.map((pointForViewMinX) => pointForViewMinX.x)),
          viewMinY = Math.min(...visiblePoints.map((pointForViewMinY) => pointForViewMinY.y))
        ;(viewBoxState = {
          x: viewMinX - viewPadding,
          y: viewMinY - viewPadding,
          width: Math.max(...visiblePoints.map((pointForViewMaxX) => pointForViewMaxX.x)) - viewMinX + viewPadding * 2,
          height: Math.max(...visiblePoints.map((pointForViewMaxY) => pointForViewMaxY.y)) - viewMinY + viewPadding * 2,
        }),
          applyViewBox()
      }),
    ),
    planElement.append(viewToolsElement),
    svgElement.addEventListener(
      'wheel',
      (wheelEvent: any) => {
        wheelEvent.preventDefault(),
          wheelEvent.target.closest('[data-drag]')
            ? scaleMap(wheelEvent.deltaY > 0 ? 1 / 1.08 : 1.08)
            : zoomView(wheelEvent.deltaY > 0 ? 1.12 : 1 / 1.12)
      },
      {
        passive: false,
      },
    )
  const sidebarElement = createHtmlElement('aside'),
    hintElement = createHtmlElement(
      'p',
      '拖动地图移动，拖角点缩放，拖圆点旋转；Shift 等比缩放。地图上滚轮或双指缩放地图，空白处滚轮缩放视图。',
    )
  ;(hintElement.className = 'i3d-note'), sidebarElement.append(hintElement)
  const createNumberField = (
      labelText: any,
      boundObject: any,
      boundKey: any,
      minValue: any,
      maxValue: any,
      stepValue = 1,
      fieldContainer = sidebarElement,
    ) => {
      const fieldLabelElement = createHtmlElement('label'),
        labelTextElement = createHtmlElement('span', labelText),
        inputElement = createHtmlElement('input')
      return (
        Object.assign(inputElement, {
          type: 'number',
          min: minValue,
          max: maxValue,
          step: 'any',
          value: boundObject[boundKey],
        }),
        (inputElement.dataset.numberStep = String(stepValue)),
        inputElement.setAttribute('aria-label', labelText),
        inputElement.addEventListener('change', () => {
          const inputValue = Number(inputElement.value)
          if (!Number.isFinite(inputValue) || inputElement.value.trim() === '') {
            inputElement.value = boundObject[boundKey]
            return
          }
          ;(boundObject[boundKey] = Math.max(minValue, Math.min(maxValue, inputValue))),
            (inputElement.value = boundObject[boundKey]),
            configurationFeedback.changed(),
            renderEditor()
        }),
        fieldLabelElement.append(labelTextElement, inputElement),
        fieldContainer.append(fieldLabelElement),
        inputElement
      )
    },
    fieldsByProperty = new Map()
  for (const [fieldLabel, propertyKey, minValueLimit, maxValueLimit] of [
    ['位置 X', 'x', -1000000, 1000000],
    ['位置 Y', 'y', -1000000, 1000000],
    ['宽度', 'width', 0.01, 1000000],
    ['高度', 'depth', 0.01, 1000000],
    ['旋转角度', 'rotation', -360, 360],
    ['地图显示强度（%）', 'opacity', 0, 100],
  ])
    fieldsByProperty.set(
      propertyKey,
      createNumberField(
        fieldLabel,
        draftState.map,
        propertyKey,
        minValueLimit,
        maxValueLimit,
        propertyKey === 'rotation' ? 0.5 : 1,
      ),
    )
  const visibilityToggleLabelElement = createHtmlElement('label'),
    visibilityToggleElement = createHtmlElement('input')
  ;(visibilityToggleLabelElement.className = 'i3d-setting-toggle'),
    (visibilityToggleElement.type = 'checkbox'),
    (visibilityToggleElement.checked = draftState.map.visible),
    visibilityToggleElement.setAttribute('aria-label', '显示地图'),
    visibilityToggleElement.addEventListener('change', () => {
      ;(draftState.map.visible = visibilityToggleElement.checked), configurationFeedback.changed(), renderEditor()
    }),
    visibilityToggleLabelElement.append(createHtmlElement('span', '显示地图'), visibilityToggleElement),
    sidebarElement.append(visibilityToggleLabelElement)
  const furnitureToggleLabelElement = createHtmlElement('label'),
    furnitureToggleElement = createHtmlElement('input')
  ;(furnitureToggleLabelElement.className = 'i3d-setting-toggle'),
    (furnitureToggleElement.type = 'checkbox'),
    (furnitureToggleElement.checked = true),
    furnitureToggleElement.setAttribute('aria-label', '显示家具参照'),
    furnitureToggleElement.addEventListener('change', () => {
      furnitureLayerElement.style.display = furnitureToggleElement.checked ? '' : 'none'
    }),
    furnitureToggleLabelElement.append(createHtmlElement('span', '显示家具参照'), furnitureToggleElement),
    sidebarElement.append(furnitureToggleLabelElement),
    sidebarElement.append(
      createButton('重置地图位置', () => {
        Object.assign(draftState.map, defaultMapConfig),
          (visibilityToggleElement.checked = true),
          configurationFeedback.changed(),
          renderEditor()
      }),
    )
  const mapNoteElement = createHtmlElement('p')
  ;(mapNoteElement.className = 'i3d-note'), sidebarElement.append(mapNoteElement)
  let isMapImageLoaded = false
  const mapImageLoader = createVacuumMapImageLoader({
      entityId: draftState.map.entityId,
      getState: getMapState,
      isActive: () => !isClosed && !!draftState.map.entityId && !document.hidden,
      onFrame(frame: any) {
        ;(isMapImageLoaded = true),
          mapImageElement.setAttribute('href', frame.src),
          (mapNoteElement.textContent = ''),
          renderEditor()
      },
      onUnavailable() {
        ;(isMapImageLoaded = false),
          mapImageElement.removeAttribute('href'),
          (mapNoteElement.textContent = draftState.map.entityId
            ? '地图暂时不可用，已隐藏；已保存的位置会保留，恢复后自动显示。'
            : '尚未选择地图；仍可放置房间快捷按钮。'),
          renderEditor()
      },
    }),
    syncMapImage = () => mapImageLoader.sync()
  document.addEventListener('visibilitychange', syncMapImage)
  let lastLabelScale: any = null
  function renderEditor() {
    const currentMap = draftState.map,
      unitsPerPixel = 1 / Math.max(0.001, svgElement.getScreenCTM()?.a || 1)
    for (const [fieldPropertyKey, fieldInputElement] of fieldsByProperty)
      documentRef.activeElement !== fieldInputElement &&
        (fieldInputElement.value = Number(currentMap[fieldPropertyKey].toFixed(2)))
    if (unitsPerPixel !== lastLabelScale) {
      lastLabelScale = unitsPerPixel
      for (const { label: labelElement, item: labelItem } of furnitureLabels)
        labelElement.setAttribute(
          'font-size',
          Math.min(11 * unitsPerPixel, (labelItem.width * 0.85) / Math.max(1, [...labelItem.name].length)),
        ),
          (labelElement.style.display = Math.min(labelItem.width, labelItem.depth) / unitsPerPixel < 25 ? 'none' : '')
    }
    for (const [imageAttributeName, imageAttributeValue] of Object.entries({
      x: currentMap.x - currentMap.width / 2,
      y: currentMap.y - currentMap.depth / 2,
      width: currentMap.width,
      height: currentMap.depth,
      opacity: currentMap.opacity / 100,
      transform: 'rotate(' + currentMap.rotation + ' ' + currentMap.x + ' ' + currentMap.y + ')',
    }))
      mapImageElement.setAttribute(imageAttributeName, imageAttributeValue)
    ;(mapImageElement.style.display = currentMap.visible === false || !isMapImageLoaded ? 'none' : ''),
      handlesLayerElement.replaceChildren()
    const mapCornerPoints = mapCorners(currentMap)
    handlesLayerElement.append(
      createSvgElement('polygon', {
        points: mapCornerPoints.map((cornerPoint) => cornerPoint.x + ',' + cornerPoint.y).join(' '),
        fill: 'transparent',
        stroke: '#73b3ff',
        'stroke-width': 1.5,
        'vector-effect': 'non-scaling-stroke',
        'data-drag': 'map',
      }),
    ),
      mapCornerPoints.forEach((draggedCorner, cornerIndex) =>
        handlesLayerElement.append(
          createSvgElement('circle', {
            cx: draggedCorner.x,
            cy: draggedCorner.y,
            r: 8 * unitsPerPixel,
            fill: '#73b3ff',
            'data-drag': 'corner:' + cornerIndex,
          }),
        ),
      )
    const rotationRad = (currentMap.rotation * Math.PI) / 180,
      rotateHandleDistance = currentMap.depth / 2 + Math.max(boundsWidth, boundsDepth) * 0.055
    handlesLayerElement.append(
      createSvgElement('circle', {
        cx: currentMap.x + Math.sin(rotationRad) * rotateHandleDistance,
        cy: currentMap.y - Math.cos(rotationRad) * rotateHandleDistance,
        r: 10 * unitsPerPixel,
        fill: '#b8e77b',
        'data-drag': 'rotate',
      }),
    )
  }
  const toSvgPoint = (pointerEvent: any) => {
      const svgPoint = svgElement.createSVGPoint()
      return (
        (svgPoint.x = pointerEvent.clientX),
        (svgPoint.y = pointerEvent.clientY),
        svgPoint.matrixTransform(svgElement.getScreenCTM().inverse())
      )
    },
    pointersById = new Map()
  let pinchState: any = null
  svgElement.addEventListener('pointerdown', (downEvent: any) => {
    if (
      (pointersById.set(downEvent.pointerId, {
        x: downEvent.clientX,
        y: downEvent.clientY,
      }),
      pointersById.size === 2)
    ) {
      downEvent.preventDefault()
      const [pinchPointerA, pinchPointerB] = [...pointersById.values()]
      ;(pinchState = {
        distance: Math.max(1, Math.hypot(pinchPointerA.x - pinchPointerB.x, pinchPointerA.y - pinchPointerB.y)),
        width: draftState.map.width,
        depth: draftState.map.depth,
      }),
        (dragState = null),
        configurationFeedback.changed(),
        svgElement.setPointerCapture(downEvent.pointerId)
      return
    }
    const dragKind = downEvent.target.closest('[data-drag]')?.getAttribute('data-drag')
    downEvent.button === 0 &&
      (downEvent.preventDefault(),
      (dragState = {
        kind: dragKind || 'pan',
        start: toSvgPoint(downEvent),
        viewBox: {
          ...viewBoxState,
        },
        clientX: downEvent.clientX,
        clientY: downEvent.clientY,
        map: {
          ...draftState.map,
        },
      }),
      (dragKind || 'pan') !== 'pan' && configurationFeedback.changed(),
      svgElement.setPointerCapture(downEvent.pointerId))
  }),
    svgElement.addEventListener('pointermove', (moveEvent: any) => {
      if (
        (pointersById.has(moveEvent.pointerId) &&
          pointersById.set(moveEvent.pointerId, {
            x: moveEvent.clientX,
            y: moveEvent.clientY,
          }),
        pinchState && pointersById.size === 2)
      ) {
        const [activePointerA, activePointerB] = [...pointersById.values()],
          pinchScale = Math.max(
            0.01 / Math.min(pinchState.width, pinchState.depth),
            Math.min(
              1000000 / Math.max(pinchState.width, pinchState.depth),
              Math.hypot(activePointerA.x - activePointerB.x, activePointerA.y - activePointerB.y) /
                pinchState.distance,
            ),
          )
        ;(draftState.map.width = pinchState.width * pinchScale),
          (draftState.map.depth = pinchState.depth * pinchScale),
          renderEditor()
        return
      }
      if (!dragState) return
      const pointerPoint = toSvgPoint(moveEvent),
        dragDeltaX = pointerPoint.x - dragState.start.x,
        dragDeltaY = pointerPoint.y - dragState.start.y,
        dragMap = draftState.map,
        dragStartMap = dragState.map
      if (dragState.kind === 'pan') {
        const screenScale = svgElement.getScreenCTM().a
        ;(viewBoxState = {
          ...dragState.viewBox,
          x: dragState.viewBox.x - (moveEvent.clientX - dragState.clientX) / screenScale,
          y: dragState.viewBox.y - (moveEvent.clientY - dragState.clientY) / screenScale,
        }),
          applyViewBox()
        return
      }
      if (dragState.kind === 'map') (dragMap.x = dragStartMap.x + dragDeltaX), (dragMap.y = dragStartMap.y + dragDeltaY)
      else {
        if (dragState.kind === 'rotate')
          dragMap.rotation =
            (Math.atan2(pointerPoint.x - dragStartMap.x, dragStartMap.y - pointerPoint.y) * 180) / Math.PI
        else {
          const cornerHandleIndex = Number(dragState.kind.split(':')[1]),
            cornerSigns = [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ][cornerHandleIndex],
            dragRotationRad = (dragStartMap.rotation * Math.PI) / 180,
            cosRotation = Math.cos(dragRotationRad),
            sinRotation = Math.sin(dragRotationRad)
          let nextWidth = Math.max(
              0.01,
              dragStartMap.width + (dragDeltaX * cosRotation + dragDeltaY * sinRotation) * cornerSigns[0],
            ),
            nextDepth = Math.max(
              0.01,
              dragStartMap.depth + (-dragDeltaX * sinRotation + dragDeltaY * cosRotation) * cornerSigns[1],
            )
          if (moveEvent.shiftKey) {
            const uniformScale = Math.max(nextWidth / dragStartMap.width, nextDepth / dragStartMap.depth)
            ;(nextWidth = dragStartMap.width * uniformScale), (nextDepth = dragStartMap.depth * uniformScale)
          }
          ;(dragMap.width = nextWidth),
            (dragMap.depth = nextDepth),
            (dragMap.x =
              dragStartMap.x +
              ((nextWidth - dragStartMap.width) * cornerSigns[0] * cosRotation -
                (nextDepth - dragStartMap.depth) * cornerSigns[1] * sinRotation) /
                2),
            (dragMap.y =
              dragStartMap.y +
              ((nextWidth - dragStartMap.width) * cornerSigns[0] * sinRotation +
                (nextDepth - dragStartMap.depth) * cornerSigns[1] * cosRotation) /
                2)
        }
      }
      renderEditor()
    })
  for (const releaseEventName of ['pointerup', 'pointercancel'])
    svgElement.addEventListener(releaseEventName, (releaseEvent: any) => {
      pointersById.delete(releaseEvent.pointerId), (pinchState = null), (dragState = null)
    })
  const resizeObserver = new ResizeObserver(() => {
    isClosed || renderEditor()
  })
  return (
    bodyElement.append(planElement, sidebarElement),
    dialogElement.append(headerElement, bodyElement),
    documentRef.body.append(dialogElement),
    dialogElement.addEventListener('cancel', (cancelEvent: any) => {
      cancelEvent.preventDefault(), configurationFeedback.requestClose(closeEditor, async () => acceptMap())
    }),
    dialogElement.showModal(),
    viewToolsElement.lastElementChild.click(),
    resizeObserver.observe(svgElement),
    syncMapImage(),
    {
      close: closeEditor,
      syncMap: syncMapImage,
    }
  )
}

export { N as vacuumMapAvailable, R as vacuumMapRequestable, $ as createVacuumMapImageLoader }
export function vacuumMapIdentity(mapEntityEntry: any, vacuumEntityEntry: any) {
  const mapIdentityAttributes = (mapEntityEntry?.newState || mapEntityEntry)?.attributes || {},
    vacuumIdentityAttributes = (vacuumEntityEntry?.newState || vacuumEntityEntry)?.attributes || {},
    isUsableIdValue = (idValue: any) =>
      (typeof idValue == 'string' && idValue) || (typeof idValue == 'number' && Number.isFinite(idValue))
  for (const savedMapIdCandidate of [
    mapIdentityAttributes.saved_map_id,
    mapIdentityAttributes.selected_map_id,
    vacuumIdentityAttributes.selected_map_id,
  ])
    if (isUsableIdValue(savedMapIdCandidate)) return 'saved:' + savedMapIdCandidate
  if (isUsableIdValue(mapIdentityAttributes.map_index)) return 'index:' + mapIdentityAttributes.map_index
  for (const mapIdKey of ['map_id', 'current_map_id', 'map_index', 'selected_map_id']) {
    const mapIdValue = mapIdentityAttributes[mapIdKey]
    if ((typeof mapIdValue == 'string' && mapIdValue) || (typeof mapIdValue == 'number' && Number.isFinite(mapIdValue)))
      return String(mapIdValue)
  }
  return ''
}
export function vacuumBindingsForMap(bindings: any, statesByEntityId: any) {
  return bindings.flatMap((binding: any) => {
    const mapEntityState = statesByEntityId[binding.map?.entityId],
      vacuumEntityState = statesByEntityId[binding.entityId],
      mapAttributes = (mapEntityState?.newState || mapEntityState)?.attributes || {},
      vacuumStateAttributes = (vacuumEntityState?.newState || vacuumEntityState)?.attributes || {},
      mapIdentity = vacuumMapIdentity(mapEntityState, vacuumEntityState),
      sourceMapId = binding.map?.sourceMapId,
      hasSiblingBinding = bindings.some(
        (sibling: any) =>
          sibling !== binding &&
          sibling.floorId !== binding.floorId &&
          sibling.entityId === binding.entityId &&
          sibling.map?.entityId === binding.map?.entityId,
      )
    if (!sourceMapId) return hasSiblingBinding ? [] : [binding]
    if (sourceMapId === mapIdentity) return [binding]
    const isPlainSourceMapId = !sourceMapId.includes(':')
    return isPlainSourceMapId && String(mapAttributes.map_id ?? mapAttributes.current_map_id ?? '') === sourceMapId
      ? [binding]
      : isPlainSourceMapId &&
          !hasSiblingBinding &&
          vacuumStateAttributes.multi_floor_map === false &&
          mapIdentity.startsWith('saved:')
        ? [
            {
              ...binding,
              map: {
                ...binding.map,
                sourceMapId: mapIdentity,
              },
            },
          ]
        : []
  })
}
export function mapCorners(mapConfig: any) {
  const rotationRad = ((mapConfig.rotation || 0) * Math.PI) / 180,
    cosRotation = Math.cos(rotationRad),
    sinRotation = Math.sin(rotationRad)
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([unitX, unitY]) => ({
    x: mapConfig.x + unitX * mapConfig.width * cosRotation - unitY * mapConfig.depth * sinRotation,
    y: mapConfig.y + unitX * mapConfig.width * sinRotation + unitY * mapConfig.depth * cosRotation,
  }))
}
export function mapSource(entityId: any, cacheBustTimestamp = Date.now()) {
  return resolveVacuumMapSource(entityId, cacheBustTimestamp)
}
export function createVacuumMaps(sceneHost: any, requestRender: any) {
  const { THREE: THREE } = sceneHost,
    entriesByItemId = new Map()
  let isActive = false,
    isDisposed = false,
    refreshTimerId: any = null,
    cachedSelectionKey = '',
    refreshIntervalMs = 5000,
    lastLoadTimestamp = -Infinity,
    nextRefreshAt = Infinity
  const buildRevisionKey = (keyItem: any, revisionStates: any) => {
    const revisionMapState = revisionStates[keyItem.map?.entityId],
      mapState = revisionMapState?.newState || revisionMapState || {},
      revisionAttributes = mapState.attributes || {},
      revisionVacuumState = revisionStates[keyItem.entityId],
      vacuumState = revisionVacuumState?.newState || revisionVacuumState || {}
    return JSON.stringify([
      mapState.state,
      mapState.last_updated,
      revisionAttributes.entity_picture,
      revisionAttributes.image_last_updated,
      revisionAttributes.vacuum_position,
      revisionAttributes.robot_position,
      revisionAttributes.charger_position,
      vacuumState.state,
      vacuumState.last_updated,
    ])
  }
  function scheduleRefreshIn(delayMs: any) {
    if (!isActive || isDisposed || document.hidden || !entriesByItemId.size) return
    const scheduledAt = performance.now() + delayMs
    ;(refreshTimerId !== null && nextRefreshAt <= scheduledAt) ||
      (clearTimeout(refreshTimerId),
      (nextRefreshAt = scheduledAt),
      (refreshTimerId = setTimeout(loadVisibleMaps, delayMs)))
  }
  const rescheduleRefresh = () => scheduleRefreshIn(Math.max(0, 1000 - (performance.now() - lastLoadTimestamp))),
    prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    cancelImageLoad = (loadingEntry: any) => {
      loadingEntry.generation++,
        clearTimeout(loadingEntry.timeout),
        (loadingEntry.timeout = null),
        loadingEntry.image &&
          ((loadingEntry.image.onload = loadingEntry.image.onerror = null),
          loadingEntry.loading && (loadingEntry.image.src = '')),
        (loadingEntry.loading = false)
    },
    hideAndReleaseTexture = (clearedEntry: any) => {
      ;(clearedEntry.mesh.visible = false),
        (clearedEntry.fading = false),
        clearedEntry.mesh.material.map?.dispose(),
        (clearedEntry.mesh.material.map = null),
        (clearedEntry.mesh.material.needsUpdate = true)
    },
    disposeMapEntry = (disposalTarget: any) => {
      cancelImageLoad(disposalTarget),
        disposalTarget.mesh.removeFromParent(),
        disposalTarget.mesh.geometry.dispose(),
        disposalTarget.mesh.material.map?.dispose(),
        disposalTarget.mesh.material.dispose()
    }
  function positionMesh(positionedEntry: any) {
    const worldCorners = mapCorners(positionedEntry.map).map((corner) =>
      sceneHost.worldPoint(positionedEntry.floorId, corner.x, corner.y, positionedEntry.height),
    )
    if (worldCorners.some((validCorner) => !validCorner)) return false
    const positionAttribute = positionedEntry.mesh.geometry.attributes.position
    return (
      worldCorners.forEach((cornerPoint, cornerIndex) =>
        positionAttribute.setXYZ(cornerIndex, cornerPoint.x, cornerPoint.y, cornerPoint.z),
      ),
      (positionAttribute.needsUpdate = true),
      positionedEntry.mesh.geometry.computeBoundingBox(),
      positionedEntry.mesh.geometry.computeBoundingSphere(),
      true
    )
  }
  function applyVisibility(visibilityEntry: any) {
    ;(visibilityEntry.mesh.visible = isActive && visibilityEntry.positioned && !!visibilityEntry.mesh.material.map),
      visibilityEntry.mesh.visible &&
        ((visibilityEntry.mesh.material.opacity = prefersReducedMotion() ? visibilityEntry.opacity : 0),
        (visibilityEntry.fadeStart = null),
        (visibilityEntry.fading = visibilityEntry.mesh.material.opacity < visibilityEntry.opacity))
  }
  function loadVisibleMaps() {
    if (
      (clearTimeout(refreshTimerId),
      (refreshTimerId = null),
      (nextRefreshAt = Infinity),
      !(!isActive || isDisposed || document.hidden))
    ) {
      for (const refreshEntry of entriesByItemId.values()) {
        if (refreshEntry.loading) continue
        ;(refreshEntry.loading = true), (refreshEntry.pending = false), (lastLoadTimestamp = performance.now())
        const generation = ++refreshEntry.generation,
          mapImage = new Image()
        ;(refreshEntry.image = mapImage),
          (mapImage.onload = () => {
            if (isDisposed || !isActive || generation !== refreshEntry.generation) return
            clearTimeout(refreshEntry.timeout), (refreshEntry.timeout = null), (refreshEntry.loading = false)
            const hasExistingTexture = !!refreshEntry.mesh.material.map
            refreshEntry.mesh.material.map?.dispose()
            const texture = new THREE.Texture(mapImage)
            ;(texture.colorSpace = THREE.SRGBColorSpace),
              (texture.needsUpdate = true),
              (refreshEntry.mesh.material.map = texture),
              (refreshEntry.mesh.material.needsUpdate = true),
              hasExistingTexture || applyVisibility(refreshEntry),
              refreshEntry.pending && rescheduleRefresh(),
              requestRender()
          }),
          (mapImage.onerror = () => {
            isDisposed ||
              !isActive ||
              generation !== refreshEntry.generation ||
              (cancelImageLoad(refreshEntry),
              hideAndReleaseTexture(refreshEntry),
              refreshEntry.pending && rescheduleRefresh(),
              requestRender())
          }),
          (refreshEntry.timeout = setTimeout(() => mapImage.onerror?.(new Event('error')), 15000)),
          (mapImage.src = mapSource(refreshEntry.entityId))
      }
      scheduleRefreshIn(refreshIntervalMs)
    }
  }
  return {
    diagnostics() {
      let mapPixels = 0,
        mapTextures = 0
      for (const measuredEntry of entriesByItemId.values()) {
        const entryImage = measuredEntry.mesh.material.map?.image
        entryImage &&
          (mapTextures++,
          (mapPixels +=
            (entryImage.naturalWidth || entryImage.width || 0) * (entryImage.naturalHeight || entryImage.height || 0)))
      }
      return {
        mapPixels: mapPixels,
        mapTextures: mapTextures,
      }
    },
    sync(items: any, isEnabled: any, floorFilter: any, syncStates: Record<string, any> = {}) {
      if (!!!(isEnabled && !isDisposed && !document.hidden)) {
        if (isActive) {
          clearTimeout(refreshTimerId), (refreshTimerId = null), (nextRefreshAt = Infinity)
          for (const hiddenEntry of entriesByItemId.values())
            cancelImageLoad(hiddenEntry), (hiddenEntry.mesh.visible = false), (hiddenEntry.fading = false)
          requestRender()
        }
        isActive = false
        return
      }
      const isInactive = !isActive
      ;(isActive = true),
        (refreshIntervalMs = items.some((listedItem: any) => vacuumStatusPresentation(listedItem, syncStates).active)
          ? 1000
          : 5000)
      const visibleItems = items.filter(
          (candidateItem: any) =>
            // 用 requestable：首次校准未生成时地图本身仍可渲染（0.8.1 口径）。
            R((syncStates as any)[candidateItem.map?.entityId]) &&
            candidateItem.visible !== false &&
            candidateItem.modelAvailable !== false &&
            candidateItem.map?.visible !== false &&
            mapSource(candidateItem.map?.entityId) &&
            candidateItem.map.width > 0 &&
            candidateItem.map.depth > 0 &&
            (floorFilter === 'all' || candidateItem.floorId === floorFilter),
        ),
        selectionKey = JSON.stringify([
          sceneHost.sceneRevision,
          floorFilter,
          visibleItems.map((mappedItem: any) => [mappedItem.id, mappedItem.floorId, mappedItem.map]),
        ]),
        hasSelectionChanged = selectionKey !== cachedSelectionKey
      if (hasSelectionChanged) {
        clearTimeout(refreshTimerId), (refreshTimerId = null), (nextRefreshAt = Infinity)
        for (const staleEntry of entriesByItemId.values()) disposeMapEntry(staleEntry)
        entriesByItemId.clear(),
          (cachedSelectionKey = selectionKey),
          visibleItems.forEach((visibleItem: any, itemIndex: any) => {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)),
              geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)),
              geometry.setIndex([0, 2, 1, 0, 3, 2])
            const material = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
                toneMapped: false,
              }),
              mapMesh = new THREE.Mesh(geometry, material)
            ;(mapMesh.name = 'vacuum-map-overlay'),
              (mapMesh.userData.environmentEffect = true),
              (mapMesh.raycast = () => {}),
              (mapMesh.visible = false),
              sceneHost.overlayScene.add(mapMesh)
            const mapEntry: {
              mesh: any
              image: any
              entityId: any
              generation: number
              loading: boolean
              revision: string
              pending: boolean
              floorId: any
              map: any
              height: number
              opacity: number
              fading: boolean
              positioned?: any
            } = {
              mesh: mapMesh,
              image: null as any,
              entityId: visibleItem.map.entityId,
              generation: 0,
              loading: false,
              revision: buildRevisionKey(visibleItem, syncStates),
              pending: false,
              floorId: visibleItem.floorId,
              map: visibleItem.map,
              height: 0.025 + itemIndex * 0.001,
              opacity: (visibleItem.map.opacity ?? 45) / 100,
              fading: false,
            }
            ;(mapEntry.positioned = positionMesh(mapEntry)), entriesByItemId.set(visibleItem.id, mapEntry)
          })
      } else {
        if (isInactive) {
          for (const restoredEntry of entriesByItemId.values())
            (restoredEntry.positioned = positionMesh(restoredEntry)), hideAndReleaseTexture(restoredEntry)
        }
      }
      let hasPendingRevision = false
      for (const changedItem of visibleItems) {
        const existingEntry = entriesByItemId.get(changedItem.id),
          revisionKey = buildRevisionKey(changedItem, syncStates)
        existingEntry &&
          existingEntry.revision !== revisionKey &&
          ((existingEntry.revision = revisionKey), (existingEntry.pending = true), (hasPendingRevision = true))
      }
      hasSelectionChanged || isInactive
        ? (loadVisibleMaps(), requestRender())
        : hasPendingRevision
          ? rescheduleRefresh()
          : scheduleRefreshIn(refreshIntervalMs)
    },
    tick(timestampMs: any) {
      if (!isActive || isDisposed) return false
      let isFading = false,
        hasFaded = false
      for (const fadingEntry of entriesByItemId.values())
        if (fadingEntry.fading) {
          fadingEntry.fadeStart === null && (fadingEntry.fadeStart = timestampMs)
          const fadeRatio = prefersReducedMotion()
              ? 1
              : Math.max(0, Math.min(1, (timestampMs - fadingEntry.fadeStart) / 280)),
            fadeOpacity = fadingEntry.opacity * fadeRatio * fadeRatio * (3 - 2 * fadeRatio)
          ;(hasFaded ||= fadingEntry.mesh.material.opacity !== fadeOpacity),
            (fadingEntry.mesh.material.opacity = fadeOpacity),
            (fadingEntry.fading = fadeRatio < 1),
            (isFading ||= fadingEntry.fading)
        }
      return (hasFaded && requestRender(), isFading)
    },
    dispose() {
      ;(isDisposed = true), (isActive = false), clearTimeout(refreshTimerId)
      for (const disposedEntry of entriesByItemId.values()) disposeMapEntry(disposedEntry)
      entriesByItemId.clear()
    },
  }
}
export function vacuumStatusPresentation(statusBinding: any, statusStates: Record<string, any> = {}) {
  const resolveEntityState = (entityEntry: any) => entityEntry?.newState || entityEntry || null,
    vacuumStateEntry = resolveEntityState((statusStates as any)[statusBinding.entityId]),
    vacuumAttributes = vacuumStateEntry?.attributes || {},
    statusRelatedEntities = (statusBinding.relatedEntityIds || []).map((statusEntityId: any) => ({
      entityId: statusEntityId,
      role: statusBinding.statusEntityRoles ? statusBinding.statusEntityRoles[statusEntityId] || '' : undefined,
      state: (statusStates as any)[statusEntityId],
    })),
    statusPresentation = resolveVacuumStatus(vacuumStateEntry, statusRelatedEntities),
    { available: isAvailable } = statusPresentation,
    relatedSensors = (statusBinding.relatedEntityIds || [])
      .filter((relatedEntityId: any) => relatedEntityId.startsWith('sensor.'))
      .map((sensorEntityId: any) => ({
        id: sensorEntityId,
        state: resolveEntityState((statusStates as any)[sensorEntityId]),
      })),
    batterySensor =
      relatedSensors.find((batteryCandidate: any) => batteryCandidate.state?.attributes?.device_class === 'battery') ||
      relatedSensors.find(
        (batteryNameCandidate: any) =>
          /(?:^|[._])battery(?:_|$)/.test(batteryNameCandidate.id) &&
          !/filter|brush|mop|life|consumable/.test(batteryNameCandidate.id),
      ),
    parseBatteryPercent = (rawBatteryValue: any) =>
      rawBatteryValue == null || String(rawBatteryValue).trim() === '' || !Number.isFinite(parseFloat(rawBatteryValue))
        ? null
        : Math.max(0, Math.min(100, parseFloat(rawBatteryValue))),
    batteryPercent = isAvailable
      ? ([
          vacuumAttributes.battery_level,
          vacuumAttributes.battery_percentage,
          vacuumAttributes.battery,
          batterySensor?.state?.state,
        ]
          .map(parseBatteryPercent)
          .find((percentValue) => percentValue !== null) ?? null)
      : null
  return {
    ...statusPresentation,
    battery: batteryPercent === null ? '电量 —' : Math.round(batteryPercent) + '%',
  }
}

const isFiniteNumber = (candidateValue: any) => typeof candidateValue == 'number' && Number.isFinite(candidateValue),
  asValidMapPoint = (pointCandidate: any) =>
    pointCandidate && isFiniteNumber(pointCandidate.x) && isFiniteNumber(pointCandidate.y) ? pointCandidate : null
function vacuumMapPoint(mapPoint: any, calibrationPoints: any, mapPixelSize: any, mapConfig: any) {
  if (
    !asValidMapPoint(mapPoint) ||
    !Array.isArray(calibrationPoints) ||
    calibrationPoints.length < 3 ||
    !(mapPixelSize?.width > 0 && mapPixelSize?.height > 0 && mapConfig?.width > 0 && mapConfig?.depth > 0)
  )
    return null
  const [firstCalibration, secondCalibration, thirdCalibration] = calibrationPoints
  if (
    ![firstCalibration, secondCalibration, thirdCalibration].every(
      (calibrationPoint) => asValidMapPoint(calibrationPoint?.vacuum) && asValidMapPoint(calibrationPoint?.map),
    )
  )
    return null
  const vacuumDelta2X = secondCalibration.vacuum.x - firstCalibration.vacuum.x,
    vacuumDelta2Y = secondCalibration.vacuum.y - firstCalibration.vacuum.y,
    vacuumDelta3X = thirdCalibration.vacuum.x - firstCalibration.vacuum.x,
    vacuumDelta3Y = thirdCalibration.vacuum.y - firstCalibration.vacuum.y,
    barycentricDeterminant = vacuumDelta2X * vacuumDelta3Y - vacuumDelta2Y * vacuumDelta3X
  if (Math.abs(barycentricDeterminant) < 1e-8) return null
  const pointDeltaX = mapPoint.x - firstCalibration.vacuum.x,
    pointDeltaY = mapPoint.y - firstCalibration.vacuum.y,
    secondWeight = (pointDeltaX * vacuumDelta3Y - pointDeltaY * vacuumDelta3X) / barycentricDeterminant,
    thirdWeight = (vacuumDelta2X * pointDeltaY - vacuumDelta2Y * pointDeltaX) / barycentricDeterminant,
    mapX =
      firstCalibration.map.x +
      secondWeight * (secondCalibration.map.x - firstCalibration.map.x) +
      thirdWeight * (thirdCalibration.map.x - firstCalibration.map.x),
    mapY =
      firstCalibration.map.y +
      secondWeight * (secondCalibration.map.y - firstCalibration.map.y) +
      thirdWeight * (thirdCalibration.map.y - firstCalibration.map.y),
    localX = (mapX / mapPixelSize.width - 0.5) * mapConfig.width,
    localY = (mapY / mapPixelSize.height - 0.5) * mapConfig.depth,
    rotationRad = ((mapConfig.rotation || 0) * Math.PI) / 180
  return {
    x: (mapConfig.x || 0) + localX * Math.cos(rotationRad) - localY * Math.sin(rotationRad),
    y: (mapConfig.y || 0) + localX * Math.sin(rotationRad) + localY * Math.cos(rotationRad),
  }
}
function vacuumTelemetry(vacuumBinding: any, statesByEntityId: any, mapResolution: any) {
  if (vacuumBinding.map?.sourceMapId && !vacuumBindingsForMap([vacuumBinding], statesByEntityId).length) return null
  const statusPresentation = vacuumStatusPresentation(vacuumBinding, statesByEntityId),
    mapStateEntry = statesByEntityId[vacuumBinding.map?.entityId],
    mapAttributes = (mapStateEntry?.newState || mapStateEntry)?.attributes || {},
    chargerPoint = asValidMapPoint(mapAttributes.charger_position),
    robotPoint = asValidMapPoint(mapAttributes.vacuum_position || mapAttributes.robot_position)
  if (!statusPresentation.available || !chargerPoint || !mapResolution) return null
  const isDocked = statusPresentation.docked,
    posePoint = isDocked ? chargerPoint : robotPoint,
    chargerMapPoint = vacuumMapPoint(chargerPoint, mapAttributes.calibration_points, mapResolution, vacuumBinding.map),
    poseMapPoint = vacuumMapPoint(posePoint, mapAttributes.calibration_points, mapResolution, vacuumBinding.map)
  if (!chargerMapPoint || !poseMapPoint) return null
  const headingAngle = (headingSource: any) => {
      if (!isFiniteNumber(headingSource?.a)) return null
      const headingRad = (headingSource.a * Math.PI) / 180,
        headingOriginPoint = vacuumMapPoint(
          headingSource,
          mapAttributes.calibration_points,
          mapResolution,
          vacuumBinding.map,
        ),
        headingTargetPoint = vacuumMapPoint(
          {
            x: headingSource.x + Math.cos(headingRad) * 100,
            y: headingSource.y + Math.sin(headingRad) * 100,
          },
          mapAttributes.calibration_points,
          mapResolution,
          vacuumBinding.map,
        )
      return headingOriginPoint && headingTargetPoint
        ? Math.atan2(headingTargetPoint.y - headingOriginPoint.y, headingTargetPoint.x - headingOriginPoint.x)
        : null
    },
    poseHeading = headingAngle(posePoint),
    chargerHeading = headingAngle(chargerPoint)
  return {
    x: poseMapPoint.x - chargerMapPoint.x,
    y: poseMapPoint.y - chargerMapPoint.y,
    angle:
      poseHeading !== null && chargerHeading !== null
        ? Math.atan2(Math.sin(poseHeading - chargerHeading), Math.cos(poseHeading - chargerHeading))
        : 0,
    docked: isDocked,
    paused: statusPresentation.paused,
    active: statusPresentation.active,
  }
}
const VACUUM_CHAT = {
  working: [
    '我真勤快！',
    '主人真懒，还好有我。',
    '好累啊，再坚持一小会儿。',
    '灰尘别跑，我来啦！',
    '今天也在认真营业。',
    '这一片，交给我！',
  ],
  returning: ['电量告急，回家吃饭！', '打工结束，回窝充电。', '基站，我回来啦！'],
  washing: ['洗个拖布，继续加油。', '爱干净，也要洗洗自己。'],
}
export function vacuumQuip(quipComponent: any, quipStates: any, timestampMs: any) {
  if (quipComponent.funMessages === false) return ''
  const quipStatusPresentation = vacuumStatusPresentation(quipComponent, quipStates)
  if (!quipStatusPresentation.active) return ''
  const quipMessages =
    quipStatusPresentation.key === 'returning_to_wash' || quipStatusPresentation.key === 'washing'
      ? VACUUM_CHAT.washing
      : ['returning', 'intelligent_recharging'].includes(quipStatusPresentation.key)
        ? VACUUM_CHAT.returning
        : quipStatusPresentation.returning
          ? ['基站，我回来啦！']
          : quipStatusPresentation.stationWorking
            ? ['基站维护中，稍等我一下。']
            : VACUUM_CHAT.working
  return quipMessages[Math.floor(timestampMs / 7000) % quipMessages.length]
}
export function createVacuumMotion(sceneHost: any, requestRender: any) {
  const { THREE: three } = sceneHost,
    motionEntriesByItemId = new Map(),
    mapSizesByEntityId = new Map()
  let motionItems: any = [],
    entityStates: Record<string, any> = {},
    isMotionEnabled = false,
    isDisposed = false
  const findModelObject = (lookupItem: any) => {
    let foundObject
    return (
      sceneHost.modelRoot?.traverse((childObject: any) => {
        childObject.userData?.environmentFloorId === lookupItem.floorId &&
          childObject.userData?.environmentModelId === lookupItem.modelId &&
          (foundObject = childObject)
      }),
      foundObject
    )
  }
  function createMotionEntry(modelRoot: any, motionItem: any) {
    modelRoot.updateWorldMatrix(true, true)
    const inverseWorldMatrix = modelRoot.matrixWorld.clone().invert(),
      floorMeshes: any = [],
      floorItem = sceneHost.document.floors
        .find((floor: any) => floor.id === motionItem.floorId)
        ?.scene.items.find((sceneItem: any) => sceneItem.id === motionItem.modelId),
      modelHeight = floorItem?.height || 0.85,
      modelDepth = floorItem?.depth || 0.5
    let robotPart: any = null
    if (
      (modelRoot.traverse((partCandidate: any) => {
        partCandidate.userData?.vacuumPart === 'robot' && (robotPart = partCandidate)
      }),
      robotPart
        ? robotPart.traverse((partMesh: any) => {
            partMesh.isMesh && partMesh.geometry && !partMesh.userData?.environmentEffect && floorMeshes.push(partMesh)
          })
        : modelRoot.traverse((mesh: any) => {
            if (!mesh.isMesh || !mesh.geometry || mesh.userData?.environmentEffect) return
            mesh.geometry.computeBoundingBox()
            const meshBounds = mesh.geometry.boundingBox
              ?.clone()
              .applyMatrix4(inverseWorldMatrix.clone().multiply(mesh.matrixWorld))
            meshBounds &&
              meshBounds.max.y < modelHeight * 0.3 &&
              meshBounds.getCenter(new three.Vector3()).z > modelDepth * 0.05 &&
              floorMeshes.push(mesh)
          }),
      !floorMeshes.length)
    )
      return null
    const combinedBounds = new three.Box3()
    floorMeshes.forEach((floorMesh: any) => combinedBounds.expandByObject(floorMesh))
    const centerPoint = modelRoot.worldToLocal(
      robotPart ? robotPart.getWorldPosition(new three.Vector3()) : combinedBounds.getCenter(new three.Vector3()),
    )
    centerPoint.y = 0
    const bodyGroup = new three.Group()
    ;(bodyGroup.name = 'vacuum-mobile-body'),
      bodyGroup.position.copy(centerPoint),
      modelRoot.add(bodyGroup),
      modelRoot.updateWorldMatrix(true, true)
    const originalTransforms = floorMeshes.map((sourceMesh: any) => ({
      mesh: sourceMesh,
      parent: sourceMesh.parent,
      position: sourceMesh.position.clone(),
      quaternion: sourceMesh.quaternion.clone(),
      scale: sourceMesh.scale.clone(),
    }))
    floorMeshes.forEach((bodyMesh: any) => bodyGroup.attach(bodyMesh))
    bodyGroup.updateMatrix()
    bodyGroup.userData.contactShadowRestMatrix = bodyGroup.matrix.toArray()
    const restPosition = bodyGroup.position.clone()
    return (
      (modelRoot.userData.vacuumMobileRoot = bodyGroup),
      {
        model: modelRoot,
        mobile: bodyGroup,
        rest: restPosition,
        originals: originalTransforms,
        x: 0,
        y: 0,
        angle: 0,
        target: null as any,
        initialized: false,
      }
    )
  }
  function disposeMotionEntry(motionEntry: any) {
    for (const transform of motionEntry.originals)
      transform.parent.add(transform.mesh),
        transform.mesh.position.copy(transform.position),
        transform.mesh.quaternion.copy(transform.quaternion),
        transform.mesh.scale.copy(transform.scale)
    motionEntry.mobile.removeFromParent(),
      delete motionEntry.model.userData.vacuumMobileRoot,
      sceneHost.invalidateReflections?.([motionEntry.item.floorId]),
      sceneHost.setVacuumMoving?.(true),
      sceneHost.requestRender?.()
  }
  function ensureMapSize(sizeItem: any) {
    const mapEntityId = sizeItem.map?.entityId
    if (!mapEntityId || !mapSource(mapEntityId)) return null
    const mapState = (entityStates as any)[mapEntityId],
      sizeAttributes = (mapState?.newState || mapState)?.attributes || {}
    if (!sizeAttributes.calibration_points || !sizeAttributes.charger_position) return null
    const cacheKey = JSON.stringify([mapEntityId, sizeAttributes.calibration_points])
    let sizeCacheEntry = mapSizesByEntityId.get(mapEntityId)
    if (sizeCacheEntry?.key === cacheKey && (!sizeCacheEntry.retryAt || performance.now() < sizeCacheEntry.retryAt))
      return sizeCacheEntry.size
    const failureCount = (sizeCacheEntry?.key === cacheKey && sizeCacheEntry.failures) || 0
    sizeCacheEntry &&
      (clearTimeout(sizeCacheEntry.timer),
      (sizeCacheEntry.image.onload = sizeCacheEntry.image.onerror = null),
      (sizeCacheEntry.image.src = ''))
    const mapImage = new Image()
    return (
      (sizeCacheEntry = {
        key: cacheKey,
        image: mapImage,
        size: null as any,
        failures: failureCount,
        retryAt: 0,
        timer: null as any,
      }),
      mapSizesByEntityId.set(mapEntityId, sizeCacheEntry),
      (mapImage.onload = () => {
        isDisposed ||
          mapSizesByEntityId.get(mapEntityId) !== sizeCacheEntry ||
          (clearTimeout(sizeCacheEntry.timer),
          (sizeCacheEntry.timer = null),
          (sizeCacheEntry.retryAt = 0),
          (sizeCacheEntry.failures = 0),
          (sizeCacheEntry.size = {
            width: mapImage.naturalWidth,
            height: mapImage.naturalHeight,
          }),
          updateMotionEntries(),
          requestRender())
      }),
      (mapImage.onerror = () => {
        if (isDisposed || mapSizesByEntityId.get(mapEntityId) !== sizeCacheEntry) return
        const retryDelayMs = Math.min(5000, 1000 * 2 ** Math.min(sizeCacheEntry.failures++, 3))
        ;(sizeCacheEntry.retryAt = performance.now() + retryDelayMs),
          (sizeCacheEntry.timer = setTimeout(() => {
            ;(sizeCacheEntry.timer = null),
              !isDisposed &&
                isMotionEnabled &&
                mapSizesByEntityId.get(mapEntityId) === sizeCacheEntry &&
                ((sizeCacheEntry.retryAt = performance.now()), updateMotionEntries(), requestRender())
          }, retryDelayMs))
      }),
      (mapImage.src = mapSource(mapEntityId)),
      null
    )
  }
  function updateMotionEntries() {
    for (const trackedItem of motionItems) {
      if (trackedItem.motionEnabled === false || trackedItem.visible === false || !isMotionEnabled) continue
      const matchedModel = findModelObject(trackedItem)
      let trackedEntry = motionEntriesByItemId.get(trackedItem.id)
      if (
        (trackedEntry?.model !== matchedModel &&
          (trackedEntry && disposeMotionEntry(trackedEntry),
          motionEntriesByItemId.delete(trackedItem.id),
          (trackedEntry = null)),
        !matchedModel)
      )
        continue
      const telemetry = vacuumTelemetry(trackedItem, entityStates, ensureMapSize(trackedItem))
      if (!telemetry) {
        trackedEntry && (trackedEntry.target = null)
        continue
      }
      if (!trackedEntry) {
        if (((trackedEntry = createMotionEntry(matchedModel, trackedItem)), !trackedEntry)) continue
        motionEntriesByItemId.set(trackedItem.id, trackedEntry)
      }
      if (
        ((trackedEntry.item = trackedItem),
        trackedEntry.initialized ||
          ((trackedEntry.x = telemetry.x),
          (trackedEntry.y = telemetry.y),
          (trackedEntry.angle = telemetry.angle),
          (trackedEntry.initialized = true),
          (trackedEntry.dirty = true)),
        telemetry.paused)
      ) {
        trackedEntry.target = null
        continue
      }
      ;(trackedEntry.target?.x === telemetry.x &&
        trackedEntry.target?.y === telemetry.y &&
        trackedEntry.target?.angle === telemetry.angle) ||
        (trackedEntry.target = telemetry)
    }
  }
  return {
    sync(items: any, syncStates: any, enabled: any) {
      ;(motionItems = items), (entityStates = syncStates), (isMotionEnabled = enabled && !isDisposed)
      const activeItemIdSet = new Set(
        items
          .filter((listedItem: any) => listedItem.motionEnabled !== false && listedItem.visible !== false)
          .map((mappedItem: any) => mappedItem.id),
      )
      for (const [itemId, entry] of motionEntriesByItemId)
        (!activeItemIdSet.has(itemId) || !isMotionEnabled) &&
          (disposeMotionEntry(entry), motionEntriesByItemId.delete(itemId))
      isMotionEnabled ? updateMotionEntries() : sceneHost.setVacuumMoving?.(false)
    },
    offset(offsetEntityId: any) {
      const offsetEntry = motionEntriesByItemId.get(offsetEntityId.replace(/^vacuum:/, ''))
      return offsetEntry
        ? {
            x: offsetEntry.x,
            y: offsetEntry.y,
          }
        : null
    },
    worldPosition(worldEntityId: any) {
      const worldEntry = motionEntriesByItemId.get(worldEntityId.replace(/^vacuum:/, ''))
      return worldEntry ? worldEntry.mobile.getWorldPosition(new three.Vector3()) : null
    },
    tick(deltaSeconds: any) {
      if (!isMotionEnabled) return false
      let isMoving = false,
        hasUpdated = false
      for (const animatedEntry of motionEntriesByItemId.values()) {
        const target =
          animatedEntry.target ||
          (animatedEntry.dirty
            ? {
                x: animatedEntry.x,
                y: animatedEntry.y,
                angle: animatedEntry.angle,
              }
            : null)
        if (!target) continue
        let deltaX = target.x - animatedEntry.x,
          deltaY = target.y - animatedEntry.y,
          distance = Math.hypot(deltaX, deltaY)
        sceneHost
          .worldPoint(animatedEntry.item.floorId, target.x, target.y, 0)
          ?.distanceTo(sceneHost.worldPoint(animatedEntry.item.floorId, animatedEntry.x, animatedEntry.y, 0)) > 2.5 &&
          ((animatedEntry.x = target.x),
          (animatedEntry.y = target.y),
          (deltaX = deltaY = distance = 0),
          (animatedEntry.dirty = true))
        const smoothingFactor = 1 - Math.exp(-Math.min(deltaSeconds, 0.1) * 5)
        ;(animatedEntry.x += deltaX * smoothingFactor), (animatedEntry.y += deltaY * smoothingFactor)
        let angleDelta = Math.atan2(
          Math.sin(target.angle - animatedEntry.angle),
          Math.cos(target.angle - animatedEntry.angle),
        )
        if (
          ((animatedEntry.angle += angleDelta * smoothingFactor),
          distance > 0.02 || Math.abs(angleDelta) > 0.002
            ? (isMoving = true)
            : ((animatedEntry.x = target.x), (animatedEntry.y = target.y), (animatedEntry.angle = target.angle)),
          distance < 0.000001 && Math.abs(angleDelta) < 0.000001 && !animatedEntry.dirty)
        )
          continue
        ;(animatedEntry.dirty = false), (hasUpdated = true)
        const floorOrigin = sceneHost.worldPoint(animatedEntry.item.floorId, 0, 0, 0),
          floorTarget = sceneHost.worldPoint(animatedEntry.item.floorId, animatedEntry.x, animatedEntry.y, 0)
        if (!floorOrigin || !floorTarget) continue
        animatedEntry.model.updateWorldMatrix(true, false)
        const restWorldPosition = animatedEntry.model.localToWorld(animatedEntry.rest.clone()),
          targetWorldPosition = restWorldPosition.add(floorTarget.sub(floorOrigin))
        animatedEntry.mobile.position.copy(animatedEntry.model.worldToLocal(targetWorldPosition)),
          (animatedEntry.mobile.rotation.y = -animatedEntry.angle),
          animatedEntry.mobile.updateWorldMatrix(true, true),
          sceneHost.invalidateReflections?.([animatedEntry.item.floorId])
      }
      return (
        sceneHost.setVacuumMoving?.(isMoving || hasUpdated),
        hasUpdated && sceneHost.requestRender?.(),
        isMoving || hasUpdated
      )
    },
    hasTracking(trackedEntityId: any) {
      return motionEntriesByItemId.has(trackedEntityId.replace(/^vacuum:/, ''))
    },
    dispose() {
      isDisposed = true
      for (const disposedEntry of motionEntriesByItemId.values()) disposeMotionEntry(disposedEntry)
      motionEntriesByItemId.clear()
      for (const cacheEntry of mapSizesByEntityId.values())
        clearTimeout(cacheEntry.timer),
          (cacheEntry.image.onload = cacheEntry.image.onerror = null),
          (cacheEntry.image.src = '')
      mapSizesByEntityId.clear(), sceneHost.setVacuumMoving?.(false)
    },
  }
}
export function vacuumBirdCamera(camera: any, focusPoint: any) {
  const offsetX = (camera?.position?.[0] || 0) - (camera?.target?.[0] || 0),
    offsetZ = (camera?.position?.[2] || 1) - (camera?.target?.[2] || 0),
    horizontalDistance = Math.hypot(offsetX, offsetZ) || 1
  return {
    ...camera,
    mode: 'perspective',
    position: [
      focusPoint[0] + (offsetX / horizontalDistance) * 2.5,
      focusPoint[1] + 6,
      focusPoint[2] + (offsetZ / horizontalDistance) * 2.5,
    ],
    target: [...focusPoint],
    up: [0, 1, 0],
    zoom: 1,
    focalLength: 40,
    frameSize: 5,
  }
}
export function vacuumFollowPose(sourceCamera: any, followTarget: any) {
  return {
    ...sourceCamera,
    target: [...followTarget],
    position: sourceCamera.position.map(
      (componentValue: any, axisIndex: any) =>
        followTarget[axisIndex] + componentValue - sourceCamera.target[axisIndex],
    ),
  }
}
export function createVacuumFollowCamera(cameraThree: any) {
  const raycaster = new cameraThree.Raycaster(),
    hiddenMaterialsByMesh = new Map<any, { original: any; clones: any[]; replacement: any }>()
  let cachedModelRoot: any = null,
    cachedSceneRevision: any = null,
    cachedOccluderKey = '',
    occluderMeshes: any = []
  function collectOccluders(occluderSceneHost: any, occlusionItem: any) {
    const occluderKey = JSON.stringify([occlusionItem.floorId, occlusionItem.modelId])
    ;(cachedModelRoot === occluderSceneHost.modelRoot &&
      cachedSceneRevision === occluderSceneHost.sceneRevision &&
      cachedOccluderKey === occluderKey) ||
      (restoreHiddenMaterials(),
      (cachedModelRoot = occluderSceneHost.modelRoot),
      (cachedSceneRevision = occluderSceneHost.sceneRevision),
      (cachedOccluderKey = occluderKey),
      (occluderMeshes = []),
      cachedModelRoot?.traverse((traversedObject: any) => {
        if (!(!traversedObject.isMesh || !traversedObject.geometry)) {
          for (let ancestorObject = traversedObject; ancestorObject; ancestorObject = ancestorObject.parent)
            if (
              ancestorObject.userData?.environmentEffect ||
              (ancestorObject.userData?.environmentFloorId === occlusionItem.floorId &&
                ancestorObject.userData?.environmentModelId === occlusionItem.modelId)
            )
              return
          occluderMeshes.push(traversedObject)
        }
      }))
  }
  function restoreHiddenMaterials() {
    for (const [occluderMesh, hiddenMaterialEntry] of hiddenMaterialsByMesh)
      occluderMesh.material === hiddenMaterialEntry.replacement &&
        (occluderMesh.material = hiddenMaterialEntry.original),
        hiddenMaterialEntry.clones.forEach((disposedClone) => disposedClone.dispose())
    hiddenMaterialsByMesh.clear()
  }
  function revealFurniture(revealSceneHost: any, revealItem: any, revealFocus: any, cameraPosition: any) {
    collectOccluders(revealSceneHost, revealItem)
    const visibleMeshSet = new Set<any>()
    for (const [sampleOffsetX, sampleOffsetZ] of [
      [0, 0],
      [0.18, 0],
      [-0.18, 0],
      [0, 0.18],
      [0, -0.18],
    ]) {
      const samplePoint = revealFocus.clone().add(new cameraThree.Vector3(sampleOffsetX, 0, sampleOffsetZ)),
        rayDirection = samplePoint.sub(cameraPosition),
        rayDistance = rayDirection.length()
      raycaster.set(cameraPosition, rayDirection.normalize()),
        (raycaster.near = 0),
        (raycaster.far = Math.max(0, rayDistance - 0.015))
      for (const intersection of raycaster.intersectObjects(occluderMeshes, false)) {
        let isVisible = true
        for (let visibleAncestor = intersection.object; visibleAncestor; visibleAncestor = visibleAncestor.parent)
          visibleAncestor.visible || (isVisible = false)
        isVisible && visibleMeshSet.add(intersection.object)
      }
    }
    for (const [hiddenMesh, staleMaterialEntry] of hiddenMaterialsByMesh)
      visibleMeshSet.has(hiddenMesh) ||
        (hiddenMesh.material === staleMaterialEntry.replacement && (hiddenMesh.material = staleMaterialEntry.original),
        staleMaterialEntry.clones.forEach((staleClone) => staleClone.dispose()),
        hiddenMaterialsByMesh.delete(hiddenMesh))
    for (const visibleMesh of visibleMeshSet) {
      let materialEntry = hiddenMaterialsByMesh.get(visibleMesh)
      if (!materialEntry) {
        const originalMaterial = visibleMesh.material,
          materialList = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial],
          clonedMaterials = materialList.map((material) => material.clone())
        ;(materialEntry = {
          original: originalMaterial,
          clones: clonedMaterials,
          replacement: Array.isArray(originalMaterial) ? clonedMaterials : clonedMaterials[0],
        }),
          hiddenMaterialsByMesh.set(visibleMesh, materialEntry),
          (visibleMesh.material = materialEntry.replacement)
      }
      const originalMaterials = Array.isArray(materialEntry.original)
        ? materialEntry.original
        : [materialEntry.original]
      materialEntry.clones.forEach((materialClone, materialIndex) => {
        materialClone.copy(originalMaterials[materialIndex]),
          (materialClone.transparent = true),
          (materialClone.opacity = Math.min(originalMaterials[materialIndex].opacity, 0.1)),
          (materialClone.depthWrite = false)
      })
    }
  }
  return {
    reset: restoreHiddenMaterials,
    reveal: revealFurniture,
  }
}
