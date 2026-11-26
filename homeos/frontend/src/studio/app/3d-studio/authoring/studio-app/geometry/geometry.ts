import { segmentIntersection as segmentIntersection2, clamp as clamp2 } from '../../../plan/geometry'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { type CylinderMeshOptions } from '../../types/studio-app-types'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import { lightIntensityFactor, lightPresetCatalog, lightFluxLumens, lightAngleLimitForType, renderCandelaFromFlux } from '../../lights/studio-app-light-data'
import { stripLuminance } from '../../lights/strip-light/strip-light-spec'
import { lampItemTypeSet, openStairTypeSet } from '../../items/item-catalog'


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
