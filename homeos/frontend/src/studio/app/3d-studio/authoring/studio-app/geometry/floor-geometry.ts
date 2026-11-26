import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { mergeGeometries as mergeGeometries2 } from '/static/vendor/three/0.187.0/BufferGeometryUtils.js'
import { type StudioAppContext } from '../studio-app-context'


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
