/**
 * 基础光（主光 / 侧面补光 / 顶部补光）的方位-高度角定位。
 *
 * 从 `materials-lighting-camera.ts` 拆出来的纯数学：只根据方位角、高度角与距离把
 * 灯放到原点之外，target 仍在原点。标准光影与区域光共用同一份公式，别处需要
 * 对齐太阳方向时（见 `studio-plan2-wall-shading`）也照这份算。
 */
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import type { StudioAppRuntime } from '../studio-app/runtime/studio-app-runtime'

export function positionLightFromAngles(
  _runtime: StudioAppRuntime,
  lightObject: any,
  azimuthDegrees: any,
  elevationDegrees: any,
  lightDistance: any,
) {
  if (!lightObject) return
  const degToRad = ns2.MathUtils.degToRad(azimuthDegrees),
    degToRad2 = ns2.MathUtils.degToRad(elevationDegrees),
    horizontalDistance = Math.cos(degToRad2) * lightDistance
  lightObject.position.set(
    Math.cos(degToRad) * horizontalDistance,
    Math.sin(degToRad2) * lightDistance,
    Math.sin(degToRad) * horizontalDistance,
  )
}
