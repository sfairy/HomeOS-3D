import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { mergeGeometries as mergeGeometries2 } from '/static/vendor/three/0.187.0/BufferGeometryUtils.js'
import { type StudioAppContext } from './app-context'
import { segmentIntersection as segmentIntersection2, clamp as clamp2 } from './plan/geometry'
import { type CylinderMeshOptions } from './types/studio-app-types'
import { finite as finite2 } from './loaders/studio-normalization'
import { lightIntensityFactor, lightPresetCatalog, lightFluxLumens, lightAngleLimitForType, renderCandelaFromFlux } from './lights/studio-app-light-data'
import { stripLuminance } from './lights/strip-light'
import { lampItemTypeSet, openStairTypeSet } from './items/item-catalog'



export function buildFloorEdgeOutline(
  appCtx: StudioAppContext,
  floorEdgePointList: any,
  floorEdgeColor: any,
  floorEdgeHeight: any,
) {
  const outlineBoxGeometries: any[] = [],
    shadowBoxGeometries: any[] = []
  for (let floorEdgeIndex = 0; floorEdgeIndex < floorEdgePointList.length; floorEdgeIndex += 1) {
    const floorEdgeStartPoint = floorEdgePointList[floorEdgeIndex],
      floorEdgeEndPoint = floorEdgePointList[(floorEdgeIndex + 1) % floorEdgePointList.length],
      floorEdgeDeltaX = floorEdgeEndPoint.x - floorEdgeStartPoint.x,
      floorEdgeDeltaZ = floorEdgeEndPoint.z - floorEdgeStartPoint.z,
      hypot6 = Math.hypot(floorEdgeDeltaX, floorEdgeDeltaZ)
    if (hypot6 <= 0.001) continue
    const floorEdgeMidX = (floorEdgeStartPoint.x + floorEdgeEndPoint.x) / 2,
      floorEdgeMidZ = (floorEdgeStartPoint.z + floorEdgeEndPoint.z) / 2,
      floorEdgeAngle = -Math.atan2(floorEdgeDeltaZ, floorEdgeDeltaX),
      compose2 = new ns2.Matrix4().compose(
        new ns2.Vector3(floorEdgeMidX, floorEdgeHeight + 0.021, floorEdgeMidZ),
        new ns2.Quaternion().setFromAxisAngle(new ns2.Vector3(0, 1, 0), floorEdgeAngle),
        new ns2.Vector3(1, 1, 1),
      ),
      compose3 = new ns2.Matrix4().compose(
        new ns2.Vector3(floorEdgeMidX, floorEdgeHeight + 0.026, floorEdgeMidZ),
        new ns2.Quaternion().setFromAxisAngle(new ns2.Vector3(0, 1, 0), floorEdgeAngle),
        new ns2.Vector3(1, 1, 1),
      )
    outlineBoxGeometries.push(new ns2.BoxGeometry(hypot6, 0.042, 0.038).applyMatrix4(compose2)),
      shadowBoxGeometries.push(new ns2.BoxGeometry(hypot6 + 0.025, 0.066, 0.078).applyMatrix4(compose3))
  }
  const outlineMergedGeometry = outlineBoxGeometries.length ? mergeGeometries2(outlineBoxGeometries) : null,
    shadowMergedGeometry = shadowBoxGeometries.length ? mergeGeometries2(shadowBoxGeometries) : null
  if (
    (outlineBoxGeometries.forEach((outlineBoxGeometry) => outlineBoxGeometry.dispose()),
    shadowBoxGeometries.forEach((shadowBoxGeometry) => shadowBoxGeometry.dispose()),
    outlineMergedGeometry)
  ) {
    const floorOutlineMesh = new ns2.Mesh(
      outlineMergedGeometry,
      new ns2.MeshBasicMaterial({
        color: floorEdgeColor,
        transparent: true,
        opacity: 0.82,
        toneMapped: false,
      }),
    )
    ;(floorOutlineMesh.renderOrder = 3),
      (floorOutlineMesh.userData.exportRole = 'outline'),
      (floorOutlineMesh.userData.batchedFloorEdgeCount = floorEdgePointList.length),
      appCtx.sceneRootNode.add(floorOutlineMesh)
  }
  if (shadowMergedGeometry) {
    const floorShadowMesh = new ns2.Mesh(
      shadowMergedGeometry,
      new ns2.MeshBasicMaterial({
        color: floorEdgeColor,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        blending: ns2.AdditiveBlending,
        toneMapped: false,
      }),
    )
    ;(floorShadowMesh.renderOrder = 2),
      (floorShadowMesh.userData.exportRole = 'outline'),
      (floorShadowMesh.userData.batchedFloorEdgeCount = floorEdgePointList.length),
      appCtx.sceneRootNode.add(floorShadowMesh)
  }
}


export function createGroundGrid(
  appCtx: StudioAppContext,
  groundGridSize: any,
  groundGridTheme: any,
  groundGridHeight: any,
) {
  const groundGridDivisions = Math.max(Math.round(groundGridSize / 1.25), 12),
    groundGrid = new ns2.GridHelper(groundGridSize, groundGridDivisions, groundGridTheme.grid, groundGridTheme.grid),
    cameraWorldPosition = new ns2.Vector3()
  ;(groundGrid.material.transparent = true),
    (groundGrid.material.opacity = 0.24),
    (groundGrid.material.depthWrite = false),
    (groundGrid.material.toneMapped = false),
    (groundGrid.material.onBeforeCompile = (gridShader: any) => {
      ;(gridShader.uniforms.gridFadeNear = {
        value: groundGridSize * 0.18,
      }),
        (gridShader.uniforms.gridFadeFar = {
          value: groundGridSize * 0.46,
        }),
        (gridShader.uniforms.gridDepthFadeNear = {
          value: groundGridSize * 0.18,
        }),
        (gridShader.uniforms.gridDepthFadeFar = {
          value: groundGridSize * 0.36,
        }),
        (gridShader.vertexShader = gridShader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec2 vGridLocalPosition;\nvarying float vGridViewDepth;',
          )
          .replace(
            '#include <project_vertex>',
            '#include <project_vertex>\nvGridLocalPosition = position.xz;\nvGridViewDepth = max(-mvPosition.z, 0.0);',
          )),
        (gridShader.fragmentShader = gridShader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform float gridFadeNear;\nuniform float gridFadeFar;\nuniform float gridDepthFadeNear;\nuniform float gridDepthFadeFar;\nvarying vec2 vGridLocalPosition;\nvarying float vGridViewDepth;',
          )
          .replace(
            'vec4 diffuseColor = vec4( diffuse, opacity );',
            'vec4 diffuseColor = vec4( diffuse, opacity );\nfloat radialFade = 1.0 - smoothstep(gridFadeNear, gridFadeFar, length(vGridLocalPosition));\nfloat depthFade = 1.0 - smoothstep(gridDepthFadeNear, gridDepthFadeFar, vGridViewDepth);\ndiffuseColor.a *= radialFade * mix(0.28, 1.0, depthFade);',
          )),
        (groundGrid.material.userData.depthFadeShader = gridShader)
    }),
    (groundGrid.onBeforeRender = (_gridRenderer: any, _gridScene: any, gridCamera: any) => {
      const depthFadeShader = groundGrid.material.userData.depthFadeShader
      if (!depthFadeShader) return
      groundGrid.getWorldPosition(cameraWorldPosition)
      const cameraDistanceToOrigin = Math.max(
          gridCamera.position.distanceTo(appCtx.orbitControls?.target || cameraWorldPosition),
          1,
        ),
        cameraViewHeight = gridCamera.isOrthographicCamera
          ? Math.abs(gridCamera.top - gridCamera.bottom) / Math.max(gridCamera.zoom, 0.001)
          : 2 * cameraDistanceToOrigin * Math.tan(ns2.MathUtils.degToRad(gridCamera.fov * 0.5)),
        cameraViewWidth = Math.max(
          Math.hypot(cameraViewHeight * Math.max(gridCamera.aspect, 0.1), cameraViewHeight),
          2,
        ),
        gridFadeNear = cameraDistanceToOrigin + cameraViewWidth * 0.2
      ;(depthFadeShader.uniforms.gridDepthFadeNear.value = gridFadeNear),
        (depthFadeShader.uniforms.gridDepthFadeFar.value = Math.max(
          gridFadeNear + 1,
          cameraDistanceToOrigin + cameraViewWidth * 0.85,
        ))
    }),
    (groundGrid.position.y = groundGridHeight + 0.012),
    (groundGrid.renderOrder = 2),
    (groundGrid.userData.exportRole = 'grid'),
    appCtx.sceneRootNode.add(groundGrid)
}



export function isPointInBounds(pointRef: any, boundsRef: any) {
  return (
    pointRef.x >= boundsRef.minX &&
    pointRef.x <= boundsRef.maxX &&
    pointRef.y >= boundsRef.minY &&
    pointRef.y <= boundsRef.maxY
  )
}

export function boundsIntersectSegment(segStart: any, segEnd: any, boundsRect: any) {
  if (isPointInBounds(segStart, boundsRect) || isPointInBounds(segEnd, boundsRect)) return true
  const boundsCorners = [
    {
      x: boundsRect.minX,
      y: boundsRect.minY,
    },
    {
      x: boundsRect.maxX,
      y: boundsRect.minY,
    },
    {
      x: boundsRect.maxX,
      y: boundsRect.maxY,
    },
    {
      x: boundsRect.minX,
      y: boundsRect.maxY,
    },
  ]
  for (let edgeIndex = 0; edgeIndex < boundsCorners.length; edgeIndex += 1)
    if (
      segmentIntersection2(
        segStart,
        segEnd,
        boundsCorners[edgeIndex],
        boundsCorners[(edgeIndex + 1) % boundsCorners.length],
      )
    )
      return true
  return false
}


export function addCylinderMesh(
  cylinderParent: any,
  cylinderRadiusTop: any,
  cylinderRadiusBottom: any,
  cylinderHeight: any,
  cylinderX: any,
  cylinderY: any,
  cylinderZ: any,
  cylinderColor: any,
  cylinderOptions: CylinderMeshOptions = {},
) {
  const cylinderMaterial = new ns2.MeshStandardMaterial({
      color: cylinderColor,
      roughness: cylinderOptions.roughness ?? 0.62,
      metalness: cylinderOptions.metalness ?? 0.03,
      transparent: !!cylinderOptions.transparent,
      opacity: cylinderOptions.opacity ?? 1,
      depthWrite: cylinderOptions.depthWrite ?? true,
    }),
    cylinderMesh = new ns2.Mesh(
      new ns2.CylinderGeometry(cylinderRadiusTop, cylinderRadiusBottom, cylinderHeight, cylinderOptions.segments ?? 24),
      cylinderMaterial,
    )
  return (
    cylinderMesh.position.set(cylinderX, cylinderY, cylinderZ),
    cylinderOptions.rotationX && (cylinderMesh.rotation.x = cylinderOptions.rotationX),
    cylinderOptions.rotationZ && (cylinderMesh.rotation.z = cylinderOptions.rotationZ),
    (cylinderMesh.castShadow = cylinderOptions.castShadow !== false),
    (cylinderMesh.receiveShadow = cylinderOptions.receiveShadow !== false),
    cylinderParent.add(cylinderMesh),
    cylinderMesh
  )
}


/**
 * 灯具「全亮」时的强度（cd / 灯带则是 cd·m⁻²）。
 *
 * 这份数值必须和 `addLightModel` 建灯时用的完全一致 —— 开关灯与调亮度的淡入淡出
 * 都以它为 1.0 基准，两边算法不一致就会出现「点一下灯，亮度先跳一下」。
 * 灯带直接取 `strip-light-spec.ts` 的 `stripLuminance`，和建灯同一个函数。
 */
export function computeDownlightRange(runStudioRenderLoopLightItem: any) {
  if (runStudioRenderLoopLightItem.type === 'striplight') return stripLuminance(runStudioRenderLoopLightItem)
  const lightPreset = (lightPresetCatalog as any)[runStudioRenderLoopLightItem.type] || lightPresetCatalog.downlight,
    downlightTypeScale = (lightIntensityFactor as any)[runStudioRenderLoopLightItem.type] || 1.1,
    beamAngle = clamp2(
      finite2(runStudioRenderLoopLightItem.lightAngle, lightPreset.angle),
      15,
      lightAngleLimitForType(runStudioRenderLoopLightItem.type),
    )
  return (
    renderCandelaFromFlux(
      runStudioRenderLoopLightItem.type,
      lightFluxLumens[runStudioRenderLoopLightItem.type] ?? lightFluxLumens.downlight,
      beamAngle,
    ) * downlightTypeScale
  )
}


export function applyItemOrientation(orientedItemGroup: any, itemDescriptor: any) {
  if (
    ((orientedItemGroup.rotation.y = -ns2.MathUtils.degToRad(finite2(itemDescriptor.rotation, 0))),
    openStairTypeSet.has(itemDescriptor.type) &&
      (orientedItemGroup.scale.x = itemDescriptor.stairDirection === 'left' ? -1 : 1),
    itemDescriptor.type === 'shoecabinet' &&
      itemDescriptor.shoeCabinetMirrored === true &&
      (orientedItemGroup.scale.x = -1),
    ['camera', 'presence'].includes(itemDescriptor.type))
  ) {
    ;(orientedItemGroup.rotation.order = 'YXZ'),
      (orientedItemGroup.rotation.x = ns2.MathUtils.degToRad(
        clamp2(finite2(itemDescriptor.verticalRotation, 0), -180, 180),
      ))
    return
  }
  if (lampItemTypeSet.has(itemDescriptor.type)) {
    if (itemDescriptor.type === 'striplight')
      (orientedItemGroup.rotation.order = 'YXZ'), (orientedItemGroup.rotation.x = 0), (orientedItemGroup.rotation.z = 0)
    else {
      const degToRad6 = ns2.MathUtils.degToRad(clamp2(finite2(itemDescriptor.verticalRotation, 0), -90, 90))
      ;(orientedItemGroup.rotation.order = 'YXZ'), (orientedItemGroup.rotation.x = degToRad6)
    }
  }
}

/**
 * `geometry` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
