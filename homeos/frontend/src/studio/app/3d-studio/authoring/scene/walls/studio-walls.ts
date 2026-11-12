/**
 * 墙体构件族：轮廓路径 → 带洞形状 → 侧 / 顶材质 → 分段墙带 → 顶面 → 接触阴影，
 * 最后 `buildInteriorScene` 把它们串成完整室内场景。
 *
 * 从 studio-app.ts 单体切出（P4）。外部状态经 `StudioWallsDeps` 显式传入（无闭包捕获）：
 * 场景状态 / 根节点 / 几何缓存句柄 / 主题视图设置 / 楼层与选中态等一律解引用为 `deps.*`，
 * 正文其余部分逐字保留。`addArchitectureMesh` / `addWindowFrames` 已是宿主上的薄转发器，
 * 这里按函数值注入，避免重复装配盒子网格缓存。
 */

import {
  canonicalPolygonKey as canonicalPolygonKey2,
  defaultDoorOpening,
  doorDisplayRotation,
  clamp as clamp2,
  clampWindowT as clampWindowT2,
  closedWallFloorPolygons,
  doorHingePlacement,
  doorInteriorSide,
  doorLeafRotation as doorLeafRotation2,
  pointInPolygon as pointInPolygon2,
  polygonArea as polygonArea2,
  wallLengthMeters as wallLengthMeters2,
  wallSolidPieces as wallSolidPieces2,
} from '../../../plan/geometry'
import type { WallBandOptions, WallSurfaceMaterialOptions, WallTopSurfaceOptions } from '../../types/studio-app-types'
import { buildWallSpanFootprint } from '../../../plan/studio-wall-spans'
import { createWallTopMaterial, isWallTrialShaderEnabled } from './studio-wall-top'
import { createWallCapContext } from './studio-wall-shell'
import type { WallCapLoop } from './studio-wall-shell'
import { buildWallLevelLayers } from './studio-wall-levels'
import type { WallLevelContext, WallVolumeSlice } from './studio-wall-levels'
import * as wallUnion from '../../../plan/studio-wall-union'
import { isWallPartVisible } from './studio-wall-debug'
import {
  createWallSideMaterial as createWallSideMaterial2,
  prepareWallSideOrder as prepareWallSideOrder2,
  setWallCornerDistances as setWallCornerDistances2,
  setWallGradientHeight as setWallGradientHeight2,
} from '../../../materials/studio-wall-materials'
import {
  WALL_SURFACE_FINISH as WALL_SURFACE_FINISH2,
  wallEmissiveIntensity as wallEmissiveIntensity2,
} from '../../../materials/studio-wall-finish'
import { doorMaterialPartRoleFor } from '../../../materials/studio-model-material-roles'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import { mergeGeometries as mergeGeometries2 } from '/static/vendor/three/0.187.0/BufferGeometryUtils.js'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'

/**
 * 窗玻璃 / 窗框的通用网格选项。
 *
 * 这两组字面量此前在 `buildInteriorScene` 里为「自定义窗型回退」与「普通窗」各写了一遍，
 * 逐字相同 —— 玻璃改了透明度却只改一处，就会出现同一栋楼里两种窗看着不一样。
 * 选项只被读取（`addArchitectureMesh` 内部自行 setup），共享同一对象不会串状态。
 */
const WINDOW_GLASS_MESH_OPTIONS = {
  rounded: false,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  side: ns2.DoubleSide,
  roughness: 0.08,
  metalness: 0.04,
  castShadow: false,
  renderOrder: 6,
}

/** 窗框网格选项（金属感、不投影、不接收阴影）。 */
const WINDOW_FRAME_MESH_OPTIONS = {
  rounded: false,
  metalness: 0.15,
  castShadow: false,
  receiveShadow: false,
}

/** 金属件网格选项（门五金 / 栏杆立杆与扶手共用：同一套金属观感）。 */
const METAL_PART_MESH_OPTIONS = {
  rounded: false,
  metalness: 0.58,
  roughness: 0.24,
  castShadow: false,
  receiveShadow: false,
}
import { openingFrameDepth, windowGeometryParts as windowGeometryParts2 } from '../../../plan/studio-window-geometry'
import { addCustomWindow } from '../../../plan/window/model'
import { isCustomWindow } from '@app/shared/scene/window/layout'
import { windowModelId } from '@app/shared/scene/window/window-models'
import { collectExhaustFanOpenings } from '../../items/studio-exhaust-fan'
export { createWallTopMaterial }

/** 墙体构件族的外部状态（只读：本族不写入任何外部可变绑定）。 */
export interface StudioWallsDeps {
  activeFloorId: any
  addArchitectureMesh: any
  addWindowFrames: any
  backgroundSettings: any
  computeSurfaceExclusions: any
  createSelectionRef: any
  defaultWallRuntimeProfile: any
  doorPartDisplayColor: any
  doorPartMeshOptions: any
  doorPartThemeColor: any
  geometryCacheHandle: any
  isEmbedStageMode: any
  isEmbeddedStage: any
  lampsLayerIndex: any
  resolveDoorPartMaterials: any
  sceneRootNode: any
  sceneStyle: any
  studioState: any
  wallOpacityValue: any
}

export function createOutlinePath(_deps: StudioWallsDeps, outlineShapeConstructor: any, outlinePointList: any) {
  const outlinePath = new outlineShapeConstructor()
  return (
    outlinePointList.forEach((outlinePoint: any, outlinePointIndex: any) => {
      outlinePointIndex === 0
        ? outlinePath.moveTo(outlinePoint.x, outlinePoint.y)
        : outlinePath.lineTo(outlinePoint.x, outlinePoint.y)
    }),
    outlinePath.closePath(),
    outlinePath
  )
}

export function buildShapesWithHoles(deps: StudioWallsDeps, polygonLoopList: any) {
  const outerLoopEntries: any[] = [],
    holeLoopQueue: any[] = []
  for (const polygonLoop of polygonLoopList) {
    const polygonLoopArea = polygonArea2(polygonLoop)
    polygonLoopArea > 0
      ? outerLoopEntries.push({
          loop: polygonLoop,
          area: polygonLoopArea,
          holes: [] as any[],
        })
      : polygonLoopArea < 0 && holeLoopQueue.push(polygonLoop)
  }
  if (!outerLoopEntries.length)
    for (const reversedPolygonLoop of holeLoopQueue.splice(0)) {
      const reverse = [...reversedPolygonLoop].reverse()
      outerLoopEntries.push({
        loop: reverse,
        area: Math.abs(polygonArea2(reverse)),
        holes: [] as any[],
      })
    }
  for (const pendingHoleLoop of holeLoopQueue) {
    const containingOuterEntry = outerLoopEntries
      .filter((candidateOuterEntry) => pointInPolygon2(pendingHoleLoop[0], candidateOuterEntry.loop, 0.000001))
      .sort((firstAreaEntry, secondAreaEntry) => firstAreaEntry.area - secondAreaEntry.area)[0]
    containingOuterEntry && containingOuterEntry.holes.push(pendingHoleLoop)
  }
  return outerLoopEntries.map((outerLoopEntry) => {
    const gc2 = createOutlinePath(deps, ns2.Shape, outerLoopEntry.loop)
    for (const holeLoopShapeSource of outerLoopEntry.holes)
      gc2.holes.push(createOutlinePath(deps, ns2.Path, holeLoopShapeSource))
    return gc2
  })
}

export function createSceneWallSideMaterial(
  deps: StudioWallsDeps,
  wallSideColor: any,
  wallSideOpacity: any,
  wallSideOptions: WallSurfaceMaterialOptions = {},
) {
  const warmWood = deps.backgroundSettings().warmWood && wallSideOptions.polygonOffset !== true,
    isWallSideOpaque = wallSideOpacity >= 0.999,
    We2 = deps.isEmbedStageMode && !isWallSideOpaque,
    wallSideMaterial = createWallSideMaterial2(
      ns2,
      {
        color: wallSideColor,
        roughness: WALL_SURFACE_FINISH2.roughness,
        metalness: WALL_SURFACE_FINISH2.metalness,
        clearcoat: WALL_SURFACE_FINISH2.clearcoat,
        clearcoatRoughness: WALL_SURFACE_FINISH2.clearcoatRoughness,
        // 半透明只由 opacity 表达。`transmission` 哪怕只有 0.012 也会让 three 编译
        // `USE_TRANSMISSION`、每帧多跑一遍透射采样（还要一张背景缓冲），而视觉上
        // 与「alpha 混合」几乎没有区别 —— 编辑器里那 1.2% 的透射纯属付费看噪点。
        transmission: 0,
        thickness: 0.1,
        ior: 1.22,
        transparent: !isWallSideOpaque,
        opacity: wallSideOpacity,
        depthWrite: wallSideOptions.depthWrite ?? isWallSideOpaque,
        depthFunc: wallSideOptions.depthFunc ?? (isWallSideOpaque ? ns2.LessEqualDepth : ns2.LessDepth),
        polygonOffset: wallSideOptions.polygonOffset === true,
        polygonOffsetFactor: wallSideOptions.polygonOffsetFactor ?? -2,
        polygonOffsetUnits: wallSideOptions.polygonOffsetUnits ?? -4,
        side: ns2.DoubleSide,
        emissive: wallSideOptions.emissive ?? wallSideColor,

        emissiveIntensity: wallSideOptions.emissiveIntensity ?? wallEmissiveIntensity2(warmWood),
      },
      wallSideOptions.polygonOffset !== true,
      deps.isEmbedStageMode && typeof window < 'u'
        ? (new URLSearchParams(window.location.search).get('wall-trial') ?? deps.defaultWallRuntimeProfile)
        : '',
      warmWood,
    )
  return ((wallSideMaterial.userData.alphaWallBand = We2), wallSideMaterial)
}

function createHiddenBasicMaterial(_deps: StudioWallsDeps) {
  const hiddenBasicMaterial = new ns2.MeshBasicMaterial()
  return ((hiddenBasicMaterial.visible = false), hiddenBasicMaterial)
}
/**
 * 墙带的两个「按上下文补默认值」：竖向渐变的归一化基准 + 并集失败时的深度兜底。
 *
 * 抽出来是为了 `buildWallBandMesh` 别继续变长 —— 它已经 80 行上下，每加一个默认值
 * 都会把圈复杂度和函数长度一起顶过门禁。
 */
function resolveWallBandRenderOptions(
  deps: StudioWallsDeps,
  wallBandOptions: WallBandOptions,
  wallBandOpacity: number,
  unionValid: boolean,
) {
  // 竖向渐变的归一化基准用**这段墙自己的高度**：以前一律读全局 `wallHeight`，
  // 层高 2.9 的户型里画一面 2.4 米的矮墙，墙根渐变只走到 0.83，整面墙偏亮一档。
  const heightSpan = Math.max(Number(wallBandOptions.heightSpan) || 0, 0) || deps.studioState.settings.wallHeight,
    options =
      !unionValid && wallBandOpacity < 0.999 && wallBandOptions.depthWrite === undefined
        ? { ...wallBandOptions, depthWrite: true, depthFunc: ns2.LessDepth }
        : wallBandOptions
  return { heightSpan, options }
}

function buildWallBandMesh(
  deps: StudioWallsDeps,
  wallBandLoopList: any,
  wallBandBaseHeight: any,
  wallBandTopHeight: any,
  wallBandColor: any,
  wallBandOpacity: any,
  wallBandOptions: WallBandOptions = {},
) {
  if (!wallBandLoopList.length || wallBandTopHeight - wallBandBaseHeight <= 0.000001 || !isWallPartVisible('side'))
    return
  const validatedWallBandLoops = wallUnion.cachedWallUnionLoops(deps, wallBandLoopList),
    hasValidWallBandLoops = validatedWallBandLoops.length > 0,
    ms2 = buildShapesWithHoles(deps, hasValidWallBandLoops ? validatedWallBandLoops : wallBandLoopList),
    { heightSpan: wallBandHeightSpan, options: resolvedWallBandOptions } = resolveWallBandRenderOptions(
      deps,
      wallBandOptions,
      wallBandOpacity,
      hasValidWallBandLoops,
    )
  for (const wallBandShape of ms2) {
    // 转角压暗原先只给专用墙面着色器算：物理材质这条路只有墙根渐变，长墙从上到下一条
    // 亮度带、转角没有暗边，整圈墙像折纸板。`polygonOffset`（装饰墙带）排除，避免叠加两次。
    const usesCornerDistance = wallBandOptions.polygonOffset !== true,
      extractPoints = wallBandShape.extractPoints(1),
      buildWallBandGeometry = () => {
        const extrudedGeometry = new ns2.ExtrudeGeometry(wallBandShape, {
          depth: wallBandTopHeight - wallBandBaseHeight,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 1,
        })
        return (
          setWallGradientHeight2(ns2, extrudedGeometry, 'z', wallBandTopHeight, -1, wallBandHeightSpan),
          usesCornerDistance &&
            setWallCornerDistances2(ns2, extrudedGeometry, [extractPoints.shape, ...extractPoints.holes]),
          extrudedGeometry
        )
      },
      wallBandGeometry = deps.geometryCacheHandle
        ? deps.geometryCacheHandle.geometry(
            ns2,
            'wall-band',
            [extractPoints, wallBandBaseHeight, wallBandTopHeight, wallBandHeightSpan, usesCornerDistance],
            buildWallBandGeometry,
          )
        : buildWallBandGeometry()
    const hiddenWallBandMaterial = createHiddenBasicMaterial(deps),
      hg3 = createSceneWallSideMaterial(deps, wallBandColor, wallBandOpacity, resolvedWallBandOptions),
      wallBandMesh = new ns2.Mesh(wallBandGeometry, [hiddenWallBandMaterial, hg3])
    ;(wallBandMesh.userData.hbMergeWallBand =
      wallBandOptions.polygonOffset !== true && (wallBandOptions.renderOrder ?? 4) === 4),
      (wallBandMesh.userData.reflectionRole = 'wall'),
      // 区域光照的受光体类型必须显式声明：墙带是「薄 + 高」的盒子（厚 0.15 < 0.18、高 2.8 > 1.5），
      // 正好命中包围盒启发式里「地面」那条判据，整圈墙被当成地面受光体 —— 吃 floorGain 而不是
      // wallGain，也拿不到墙面朝向补偿，轻量柔光下整面墙一个亮度。合并墙带路径本来就写了 'wall'。
      (wallBandMesh.userData.regionReceiverKind = 'wall'),
      (wallBandMesh.rotation.x = Math.PI / 2),
      (wallBandMesh.position.y = wallBandTopHeight)
    ;(wallBandMesh.castShadow = wallBandOptions.castShadow === true),
      wallBandOptions.lightOccluder && wallBandMesh.layers.set(deps.lampsLayerIndex),
      // 区域灯（轻量柔光）没有阴影图，靠这个标记从墙带里取墙体线段做遮挡。
      (wallBandMesh.userData.lightOccluder = wallBandOptions.lightOccluder === true),
      // 墙面必须吃阴影：现实里白天的窗光、家具影、人的影子都会落在墙上，夜晚吊灯的
      // 光被柜体挡住的那一块也靠这张阴影图。原先只在「墙不透明」时才开（默认 0.36
      // 永远不透明不了），于是墙是唯一不接收阴影的受体，整面墙平得像贴图。
      (wallBandMesh.receiveShadow = wallBandOptions.receiveShadow ?? true),
      (wallBandMesh.renderOrder = wallBandOptions.renderOrder ?? 4),
      // 半透明合并墙带：每帧按相机侧重排三角形顺序。以前只在创作态启用
      // （`deps.isEmbedStageMode ||`），运行态舞台沿用固定顺序 —— 站在墙背面看，
      // 近侧墙被远侧墙抢先画，整面墙糊成一层雾。函数内部已有「相机侧写没变就返回」
      // 的短路，舞台只是多一次矩阵比较，不会每帧上传索引。
      prepareWallSideOrder2(ns2, wallBandMesh),
      deps.sceneRootNode.add(wallBandMesh)
  }
}

/** 盖面上下文：并集缓存 + 带洞形状 + 墙顶材质。顶盖与过梁底面共用同一份。 */
function createWallCapBuilder(deps: StudioWallsDeps) {
  return createWallCapContext(
    deps,
    (capLoops: WallCapLoop[][]) => {
      const validatedLoops = wallUnion.cachedWallUnionLoops(deps, capLoops),
        usesUnionLoops = validatedLoops.length > 0
      return {
        shapes: buildShapesWithHoles(deps, usesUnionLoops ? validatedLoops : capLoops),
        unionValid: usesUnionLoops,
      }
    },
    (capColor: number, capOpacity: number, capOptions: WallTopSurfaceOptions) =>
      createWallTopMaterial(deps, capColor, capOpacity, capOptions),
  )
}

export function expandPolygonOutward(_deps: StudioWallsDeps, polygonPointList: any, outwardOffset: any) {
  const reduce = polygonPointList.reduce(
    (accumulatedPoint: any, offsetPointEntry: any) => ({
      x: accumulatedPoint.x + offsetPointEntry.x / polygonPointList.length,
      y: accumulatedPoint.y + offsetPointEntry.y / polygonPointList.length,
    }),
    {
      x: 0,
      y: 0,
    },
  )
  return polygonPointList.map((polygonPoint: any) => {
    const pointDeltaX = polygonPoint.x - reduce.x,
      pointDeltaY = polygonPoint.y - reduce.y,
      pointDistance = Math.max(Math.hypot(pointDeltaX, pointDeltaY), 0.000001)
    return {
      x: polygonPoint.x + (pointDeltaX / pointDistance) * outwardOffset,
      y: polygonPoint.y + (pointDeltaY / pointDistance) * outwardOffset,
    }
  })
}

function createWallContactShadowMesh(deps: StudioWallsDeps, wallPolygonList: any, contactShadowHeight: any) {
  if (!wallPolygonList.length || isWallTrialShaderEnabled(deps)) return
  const wallShapes = wallPolygonList.map((wallPolygon: any) => {
      const xu3 = expandPolygonOutward(deps, wallPolygon, 0.028),
        reverse2 = polygonArea2(xu3) >= 0 ? xu3 : [...xu3].reverse()
      return createOutlinePath(deps, ns2.Shape, reverse2)
    }),
    wallShapeGeometries = wallShapes.map((wallShape: any) => {
      const wallShapeGeometry = new ns2.ShapeGeometry(wallShape, 1)
      return (
        wallShapeGeometry.rotateX(Math.PI / 2),
        wallShapeGeometry.translate(0, contactShadowHeight, 0),
        wallShapeGeometry
      )
    }),
    mergedContactGeometry = mergeGeometries2(wallShapeGeometries)
  if ((wallShapeGeometries.forEach((disposableGeometry: any) => disposableGeometry.dispose()), !mergedContactGeometry))
    return
  const wallContactShadowMesh = new ns2.Mesh(
    mergedContactGeometry,
    new ns2.MeshBasicMaterial({
      color: 527122,
      transparent: true,
      opacity: 0.052,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      toneMapped: false,
      side: ns2.DoubleSide,
    }),
  )
  ;(wallContactShadowMesh.renderOrder = 1),
    (wallContactShadowMesh.userData.batchedWallContactShadowCount = wallShapes.length),
    (wallContactShadowMesh.userData.exportRole = 'background'),
    (wallContactShadowMesh.visible = deps.sceneStyle !== 'warm-wood'),
    deps.sceneRootNode.add(wallContactShadowMesh)
}

export function buildInteriorScene(
  deps: StudioWallsDeps,
  {
    ppm: interiorPixelsPerMeter,
    toWorld: interiorToWorld,
    floorSurfaceY: interiorFloorSurfaceY,
    floorPolygons: interiorFloorPolygons,
  }: any,
) {
  const yt6 = deps.backgroundSettings(),
    oe4 = typeof deps.activeFloorId == 'string' ? deps.activeFloorId : '',
    buildInteriorSceneIsEmbeddedStage =
      typeof window < 'u' && window.location.pathname === '/api/v1/modules/interaction3d/stage.html',
    /**
     * 门扇朝哪边开要用「屋里在哪侧」来判断（0.8.1 `doorInteriorSide`）：
     * 拿 `createFloorWorldMapper` 已经算好的楼层多边形，没有就按墙自己闭合一遍。
     * 只在嵌入式舞台（运行态）需要，编辑器里门不动。
     */
    doorFloorPolygons = buildInteriorSceneIsEmbeddedStage
      ? (interiorFloorPolygons ?? closedWallFloorPolygons(deps.studioState.walls, 1))
      : [],
    resolveDoorMaterialType = (rawDoorType: any) =>
      rawDoorType === 'entry' || rawDoorType === 'entry-child-mother'
        ? 'entry'
        : rawDoorType === 'solid'
          ? 'wood'
          : rawDoorType === 'double'
            ? 'double'
            : rawDoorType === 'glass'
              ? 'glass'
              : rawDoorType === 'sliding-glass'
                ? 'sliding'
                : rawDoorType === 'roller-shutter'
                  ? 'roller'
                  : 'static',
    existingChildSet = new Set(deps.sceneRootNode.children),
    floorOpenings = [
      ...deps.studioState.windows,
      ...deps.studioState.doors.map((doorEntry: any) => ({
        ...doorEntry,
        sill: 0,
      })),
      ...deps.studioState.railings.map((railingEntry: any) => {
        const railingWall = deps.studioState.walls.find(
          (candidateWall: any) => candidateWall.id === railingEntry.wallId,
        )
        return {
          ...railingEntry,
          sill: 0,
          height: railingWall?.height || deps.studioState.settings.wallHeight,
        }
      }),
      /** 排气扇是场景条目而非洞口集合，洞口由自身位置 + 墙体反推（84% 真洞）。 */
      ...collectExhaustFanOpenings(
        deps.studioState.items,
        deps.studioState.walls,
        interiorPixelsPerMeter,
        deps.studioState.settings.wallHeight,
      ).map((exhaustOpeningEntry) => exhaustOpeningEntry.installation.opening),
    ],
    wallVolumes: WallVolumeSlice[] = [],
    wallVolumeKeySet = new Set(),
    iy2 = deps.computeSurfaceExclusions(interiorPixelsPerMeter)
  for (const currentWall of deps.studioState.walls) {
    const wallOpacity =
      deps.wallOpacityValue ??
      (currentWall.opacity === null || currentWall.opacity === undefined
        ? deps.studioState.settings.wallOpacity
        : clamp2(finite2(currentWall.opacity, deps.studioState.settings.wallOpacity), 0, 1))
    for (const wallSolidPiece of wallSolidPieces2(
      currentWall,
      floorOpenings,
      interiorPixelsPerMeter,
      currentWall.height,
    )) {
      const jv2 = buildWallSpanFootprint(
        currentWall,
        wallSolidPiece,
        interiorPixelsPerMeter,
        interiorToWorld,
        iy2[currentWall.id],
      )
      if (!jv2) continue
      const join5 = [
        // 去重键必须带墙 id：以前只有「足迹 + 高度 + 不透明度」，两段共线的独立墙
        // （比如八字墙的两个翼）会被判成同一块体，后一段直接丢掉。
        currentWall.id,
        canonicalPolygonKey2(jv2, 4),
        wallSolidPiece.bottom.toFixed(5),
        wallSolidPiece.top.toFixed(5),
        wallOpacity.toFixed(4),
      ].join('|')
      wallVolumeKeySet.has(join5) ||
        (wallVolumeKeySet.add(join5),
        wallVolumes.push({
          wallId: currentWall.id,
          footprint: jv2,
          bottom: wallSolidPiece.bottom,
          top: wallSolidPiece.top,
          opacity: wallOpacity,
          wallHeight: currentWall.height,
        }))
    }
  }
  const sort5 = [
    ...new Set(
      wallVolumes
        .flatMap((flatWallVolume) => [flatWallVolume.bottom, flatWallVolume.top])
        .map((wallLevelNumber) => wallLevelNumber.toFixed(6)),
    ),
  ]
    .map(Number)
    .sort((firstWallLevel, secondWallLevel) => firstWallLevel - secondWallLevel)
  createWallContactShadowMesh(
    deps,
    wallVolumes
      .filter((bottomWallVolume) => bottomWallVolume.bottom <= 0.000001)
      .map((lowWallVolume) => lowWallVolume.footprint),
    interiorFloorSurfaceY + 0.0025,
  )
  /**
   * 按高度层画墙：每层一次性交给 `buildWallLevelLayers`（墙带 / 顶盖 / 过梁底面 /
   * 选中高亮层都在那边）。这里只负责「层从哪来、层间顺序」。
   */
  const wallLevelContext: WallLevelContext = {
    deps,
    capBuilder: createWallCapBuilder(deps),
    buildBand: buildWallBandMesh,
    tint: yt6,
    wallVolumes,
    floorSurfaceY: interiorFloorSurfaceY,
  }
  sort5
    .slice(0, -1)
    .forEach((lowerWallLevel, wallLevelIndex) =>
      buildWallLevelLayers(wallLevelContext, lowerWallLevel, sort5[wallLevelIndex + 1]),
    )
  for (const openingWall of deps.studioState.walls) {
    const openingWallDeltaX = openingWall.end.x - openingWall.start.x,
      openingWallDeltaZ = openingWall.end.y - openingWall.start.y,
      hypot7 = Math.hypot(openingWallDeltaX, openingWallDeltaZ)
    if (!hypot7) continue
    const openingWallAngle = -Math.atan2(openingWallDeltaZ, openingWallDeltaX)
    for (const currentWindow of deps.studioState.windows.filter(
      (buildInteriorSceneWindowCandidate: any) => buildInteriorSceneWindowCandidate.wallId === openingWall.id,
    )) {
      const windowPositionT = clampWindowT2(openingWall, currentWindow, interiorPixelsPerMeter),
        windowCenterPlanPoint = {
          x: openingWall.start.x + openingWallDeltaX * windowPositionT,
          y: openingWall.start.y + openingWallDeltaZ * windowPositionT,
        },
        windowWorldPoint = interiorToWorld(windowCenterPlanPoint),
        windowGroup = new ns2.Group()
      windowGroup.position.set(windowWorldPoint.x, 0, windowWorldPoint.z), (windowGroup.rotation.y = openingWallAngle)
      const windowWidth = Math.min(currentWindow.width, wallLengthMeters2(openingWall, interiorPixelsPerMeter)),
        windowSillHeight = clamp2(currentWindow.sill, 0, openingWall.height),
        windowHeight = Math.min(currentWindow.height, openingWall.height - windowSillHeight)
      if (isCustomWindow(currentWindow)) {
        // 自定义窗型：走向由设计里的 wallDirection 决定，朝内开就要把整组掉个头。
        if (currentWindow.windowDesign?.wallDirection === -1) windowGroup.rotation.y += Math.PI
        const customWindowAccent = deps.createSelectionRef('window', currentWindow.id)
          ? yt6.accent
          : (yt6.windowFrame ?? yt6.furniture)
        try {
          addCustomWindow({
            group: windowGroup,
            window: currentWindow,
            width: windowWidth,
            height: windowHeight,
            sill: windowSillHeight,
            style: yt6,
            frameColor: customWindowAccent,
            addBoxes: deps.addArchitectureMesh,
            // 外框深度同样按墙厚收口，否则自定义窗还是一条缝。
            frameDepth: openingFrameDepth(openingWall.thickness),
            // 运行态要能开合；编辑器里保持静态，减少 draw call 也避免误触。
            animated: buildInteriorSceneIsEmbeddedStage,
          })
        } catch (customWindowError) {
          // 设计不合法时整层楼不能跟着消失：退回普通窗，让用户还能选中重画。
          console.warn('[studio] 自定义窗型构建失败，回退普通窗', currentWindow.id, customWindowError)
          windowGroup.clear()
          const fallbackParts = windowGeometryParts2(
            windowWidth,
            windowHeight,
            windowSillHeight,
            currentWindow.hasDivider !== false,
            openingWall.thickness,
          )
          if (!fallbackParts) continue
          deps.addArchitectureMesh(windowGroup, fallbackParts.glass, yt6.glass, WINDOW_GLASS_MESH_OPTIONS)
          deps.addArchitectureMesh(windowGroup, fallbackParts.frames, customWindowAccent, WINDOW_FRAME_MESH_OPTIONS)
        }
        if (buildInteriorSceneIsEmbeddedStage) {
          // 运行期按窗扇绑定选中：每个可动件都要能被 `window:<id>:<sash>` 找到。
          windowGroup.userData.windowOutline = {
            width: windowWidth,
            height: windowHeight,
            sill: windowSillHeight,
          }
          windowGroup.traverse((windowNode: any) => {
            if (!windowNode.userData.windowSashId) return
            const sashId = windowNode.userData.windowSashId
            const groupId = windowNode.userData.windowGroupId
            Object.assign(windowNode.userData, {
              environmentModelId: windowModelId(currentWindow.id, groupId || sashId),
              windowLegacyModelId: groupId ? windowModelId(currentWindow.id, sashId) : '',
              environmentFloorId: oe4,
              environmentModelType: 'window',
              editorModelId: windowModelId(currentWindow.id, groupId || sashId),
              editorFloorId: oe4,
            })
          })
        }
        deps.sceneRootNode.add(windowGroup)
        continue
      }
      const windowParts = windowGeometryParts2(
        windowWidth,
        windowHeight,
        windowSillHeight,
        currentWindow.hasDivider !== false,
        openingWall.thickness,
      )
      if (!windowParts) continue
      deps.addArchitectureMesh(windowGroup, windowParts.glass, yt6.glass, WINDOW_GLASS_MESH_OPTIONS)
      const accent = deps.createSelectionRef('window', currentWindow.id)
        ? yt6.accent
        : (yt6.windowFrame ?? yt6.furniture)
      deps.addArchitectureMesh(windowGroup, windowParts.frames, accent, WINDOW_FRAME_MESH_OPTIONS),
        (windowGroup.userData.optimizationStats = {
          type: windowParts.divided ? 'window-divided' : 'window-plain',
          before: windowParts.divided ? 6 : 5,
          after: 2,
        }),
        deps.sceneRootNode.add(windowGroup)
    }
    for (const currentRailing of deps.studioState.railings.filter(
      (buildInteriorSceneRailingCandidate: any) => buildInteriorSceneRailingCandidate.wallId === openingWall.id,
    )) {
      const railingPositionT = clampWindowT2(openingWall, currentRailing, interiorPixelsPerMeter),
        railingCenterPlanPoint = {
          x: openingWall.start.x + openingWallDeltaX * railingPositionT,
          y: openingWall.start.y + openingWallDeltaZ * railingPositionT,
        },
        railingWorldPoint = interiorToWorld(railingCenterPlanPoint),
        railingGroup = new ns2.Group()
      railingGroup.position.set(railingWorldPoint.x, 0, railingWorldPoint.z),
        (railingGroup.rotation.y = openingWallAngle)
      const railingWidth = Math.min(currentRailing.width, wallLengthMeters2(openingWall, interiorPixelsPerMeter)),
        railingHeight = Math.min(currentRailing.height, openingWall.height),
        accent2 = deps.createSelectionRef('railing', currentRailing.id) ? yt6.accent : yt6.frame,
        railingPostThickness = Math.min(Math.max(railingWidth * 0.012, 0.028), 0.05),
        railingRailInset = 0.08,
        railingClearHeight = Math.max(railingHeight - railingRailInset - railingPostThickness * 1.4, 0.2)
      deps.addArchitectureMesh(
        railingGroup,
        [
          [
            Math.max(railingWidth - railingPostThickness * 2.4, 0.2),
            railingClearHeight,
            0.018,
            0,
            railingRailInset + railingClearHeight * 0.5,
            0,
          ],
        ],
        yt6.glass,
        {
          rounded: false,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: ns2.DoubleSide,
          metalness: 0.04,
          roughness: 0.08,
          castShadow: false,
          receiveShadow: false,
          renderOrder: 6,
        },
      )
      const railingMaterialOptions = METAL_PART_MESH_OPTIONS,
        railingPostCount = Math.max(2, Math.min(16, Math.ceil(railingWidth / 1.5) + 1)),
        railingPostSpans = [[railingWidth, railingPostThickness, 0.055, 0, railingHeight, 0]],
        railingRailSpans: any[] = []
      for (let railingPostIndex = 0; railingPostIndex < railingPostCount; railingPostIndex += 1) {
        const railingPostX = -railingWidth / 2 + (railingWidth * railingPostIndex) / (railingPostCount - 1)
        railingPostSpans.push([railingPostThickness, railingHeight, 0.055, railingPostX, railingHeight * 0.5, 0]),
          railingRailSpans.push([
            railingPostThickness * 2,
            railingPostThickness * 0.8,
            0.08,
            railingPostX,
            railingPostThickness * 0.4,
            0,
          ])
      }
      deps.addArchitectureMesh(railingGroup, railingPostSpans, accent2, railingMaterialOptions),
        deps.addArchitectureMesh(railingGroup, railingRailSpans, yt6.furnitureSoft, railingMaterialOptions),
        (railingGroup.userData.optimizationStats = {
          type: 'glass-railing',
          before: 2 + railingPostCount * 2,
          after: 3,
        }),
        deps.sceneRootNode.add(railingGroup)
    }
    for (const currentDoor of deps.studioState.doors.filter(
      (buildInteriorSceneDoorCandidate: any) => buildInteriorSceneDoorCandidate.wallId === openingWall.id,
    )) {
      const doorPositionT = clampWindowT2(openingWall, currentDoor, interiorPixelsPerMeter),
        doorCenterPlanPoint = {
          x: openingWall.start.x + openingWallDeltaX * doorPositionT,
          y: openingWall.start.y + openingWallDeltaZ * doorPositionT,
        },
        doorWorldPoint = interiorToWorld(doorCenterPlanPoint),
        doorGroup = new ns2.Group()
      buildInteriorSceneIsEmbeddedStage &&
        Object.assign(doorGroup.userData, {
          editorModelId: 'door:' + currentDoor.id,
          editorFloorId: oe4,
        }),
        doorGroup.position.set(doorWorldPoint.x, 0, doorWorldPoint.z),
        (doorGroup.rotation.y = openingWallAngle),
        buildInteriorSceneIsEmbeddedStage &&
          ((doorGroup.userData.environmentModelId = 'door:' + currentDoor.id),
          (doorGroup.userData.environmentFloorId = oe4),
          (doorGroup.userData.environmentModelType = 'door'),
          (doorGroup.userData.doorAnimationType = resolveDoorMaterialType(currentDoor.doorType || 'solid')))
      const doorOpenRatio = defaultDoorOpening(currentDoor, buildInteriorSceneIsEmbeddedStage) / 100
      doorGroup.userData.defaultOpening = doorOpenRatio * 100
      const buildInteriorSceneDoorWidth = Math.min(
          currentDoor.width,
          wallLengthMeters2(openingWall, interiorPixelsPerMeter),
        ),
        buildInteriorSceneDoorHeight = Math.min(currentDoor.height, openingWall.height)
      buildInteriorSceneIsEmbeddedStage &&
        Object.assign(doorGroup.userData, doorHingePlacement(currentDoor, buildInteriorSceneDoorWidth), {
          doorInteriorSide: doorInteriorSide(openingWall, currentDoor, doorFloorPolygons, interiorPixelsPerMeter),
        })
      const ne8 = deps.createSelectionRef('door', currentDoor.id),
        doorType = currentDoor.doorType || 'solid',
        isSolidDoorLeaf = doorType === 'solid' || doorType === 'frame-only',
        doorParts = deps.resolveDoorPartMaterials(currentDoor, yt6),
        doorPartForRole = (roleName: any) => doorParts[doorMaterialPartRoleFor(doorType, roleName)],
        doorPartColor = (roleName: any) => deps.doorPartDisplayColor(doorPartForRole(roleName), ne8, yt6),
        doorPartOptions = (roleName: any, baseOptions: any) =>
          deps.doorPartMeshOptions(doorPartForRole(roleName), baseOptions),
        doorGlassColor = doorParts.glass?.colorValue ?? deps.doorPartThemeColor(doorType, 'glass', yt6),
        doorLeafMaterialOptions = yt6.warmWood
          ? {
              emissive: doorPartForRole('door')?.colorValue ?? yt6.doorLeaf,
              emissiveIntensity: 0.4,
            }
          : {},
        doorLeafThickness = 0.065,
        /**
         * 门套深度按墙厚收口：以前写死 90mm，200mm 的墙两侧各漏 55mm 空腔，
         * 门套看起来是悬在洞口里的一个 U 形框。门扇厚度不动（0.065）。
         */
        doorFrameDepth = openingFrameDepth(openingWall.thickness),
        // 门套 / 五金 / 门扇三组网格选项：同一扇门里多处部件共用，逐字内联会让
        // 「改一次金属粗糙度要记得改六处」。
        doorTrimMeshOptions = { rounded: false, roughness: 0.5, castShadow: false, receiveShadow: false },
        doorLeafPartMeshOptions = {
          rounded: false,
          roughness: 0.58,
          metalness: 0.1,
          castShadow: false,
          receiveShadow: false,
        },
        doorLeafOptions = {
          rounded: false,
          metalness: 0.08,
          castShadow: false,
          receiveShadow: false,
          ...(isSolidDoorLeaf ? doorLeafMaterialOptions : {}),
        },
        doorLeafPanels = [
          [
            doorLeafThickness,
            buildInteriorSceneDoorHeight,
            doorFrameDepth,
            -buildInteriorSceneDoorWidth / 2,
            buildInteriorSceneDoorHeight / 2,
            0,
          ],
          [
            doorLeafThickness,
            buildInteriorSceneDoorHeight,
            doorFrameDepth,
            buildInteriorSceneDoorWidth / 2,
            buildInteriorSceneDoorHeight / 2,
            0,
          ],
          [
            buildInteriorSceneDoorWidth + doorLeafThickness,
            doorLeafThickness,
            doorFrameDepth,
            0,
            buildInteriorSceneDoorHeight,
            0,
          ],
        ]
      if (doorType === 'roller-shutter') {
        const doorSwingSign = currentDoor.swing === -1 ? -1 : 1
        doorLeafPanels.push([
          buildInteriorSceneDoorWidth + doorLeafThickness * 0.6,
          doorLeafThickness * 1.8,
          0.13,
          0,
          buildInteriorSceneDoorHeight - doorLeafThickness * 0.35,
          doorSwingSign * 0.04,
        ])
      }
      if (
        (deps.addArchitectureMesh(
          doorGroup,
          doorLeafPanels,
          doorPartColor('frame'),
          doorPartOptions('frame', doorLeafOptions),
        ),
        doorType === 'frame-only')
      ) {
        ;(doorGroup.userData.optimizationStats = {
          type: 'door-frame-only',
          before: 3,
          after: 1,
        }),
          deps.sceneRootNode.add(doorGroup)
        continue
      }
      if (doorType === 'sliding-glass') {
        const doorLeafMaxHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.85, 0.4),
          doorLeafMaxWidth = Math.max(buildInteriorSceneDoorWidth * 0.54, 0.28),
          doorHingeSign = currentDoor.hinge === 'right' ? 1 : -1
        for (const slidingPanelSign of [-1, 1]) {
          const slidingPanelGroup = new ns2.Group(),
            slidingPanelOffset = slidingPanelSign * buildInteriorSceneDoorWidth * 0.23,
            slidingPanelRestOffset =
              slidingPanelSign === -doorHingeSign
                ? doorHingeSign * buildInteriorSceneDoorWidth * 0.46 * doorOpenRatio
                : 0
          ;(slidingPanelGroup.position.x = slidingPanelRestOffset),
            buildInteriorSceneIsEmbeddedStage &&
              Object.assign(slidingPanelGroup.userData, {
                doorSlidePivot: true,
                doorSlideSide: slidingPanelSign,
                doorRestTranslation: slidingPanelRestOffset,
                doorSlideTravel: buildInteriorSceneDoorWidth * 0.46,
              }),
            doorGroup.add(slidingPanelGroup),
            deps.addWindowFrames(
              slidingPanelGroup,
              [
                {
                  width: doorLeafMaxWidth,
                  height: doorLeafMaxHeight,
                  centerX: slidingPanelOffset,
                  centerZ: slidingPanelSign * 0.024,
                },
              ],
              doorPartColor('frame'),
              doorGlassColor,
            )
          const slidingPanelTrackOffset = slidingPanelOffset - slidingPanelSign * doorLeafMaxWidth * 0.36
          deps.addArchitectureMesh(
            slidingPanelGroup,
            [
              [
                0.026,
                0.15,
                0.055,
                slidingPanelTrackOffset,
                buildInteriorSceneDoorHeight * 0.52,
                slidingPanelSign * 0.052,
              ],
            ],
            doorPartColor('metal'),
            doorPartOptions('metal', {
              rounded: false,
              metalness: 0.5,
              castShadow: false,
              receiveShadow: false,
            }),
          )
        }
        buildInteriorSceneIsEmbeddedStage &&
          ((doorGroup.userData.doorSlideOpenTranslation = buildInteriorSceneDoorWidth * 0.46),
          (doorGroup.userData.doorSlideClosedTranslation = 0)),
          (doorGroup.userData.optimizationStats = {
            type: 'door-sliding-glass',
            before: 15,
            after: 5,
          }),
          deps.sceneRootNode.add(doorGroup)
        continue
      }
      if (doorType === 'roller-shutter') {
        const pocketDoorWidth = Math.max(buildInteriorSceneDoorWidth - doorLeafThickness * 1.3, 0.4),
          pocketDoorHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.85, 0.8),
          pocketSwingSign = currentDoor.swing === -1 ? -1 : 1,
          pocketDoorGroup = new ns2.Group()
        ;(pocketDoorGroup.position.y = pocketDoorHeight * doorOpenRatio),
          (pocketDoorGroup.scale.y = Math.max(0.001, 1 - doorOpenRatio)),
          buildInteriorSceneIsEmbeddedStage &&
            ((pocketDoorGroup.userData.doorRollerPivot = true),
            (pocketDoorGroup.userData.doorRestTranslation = pocketDoorGroup.position.y),
            (pocketDoorGroup.userData.doorRollerClosedTranslation = 0),
            (pocketDoorGroup.userData.doorRollerOpenTranslation = pocketDoorHeight)),
          deps.addArchitectureMesh(
            pocketDoorGroup,
            [[pocketDoorWidth, pocketDoorHeight, 0.045, 0, pocketDoorHeight * 0.5, pocketSwingSign * 0.04]],
            doorPartColor('shutter'),
            doorPartOptions('shutter', {
              ...doorLeafMaterialOptions,
              rounded: false,
              metalness: yt6.warmWood ? 0.08 : 0.36,
              roughness: 0.42,
              castShadow: false,
              receiveShadow: false,
            }),
          )
        const pocketSlatCount = Math.max(5, Math.min(36, Math.round(pocketDoorHeight / 0.12))),
          pocketSlatOffsets: any[] = []
        for (let pocketSlatIndex = 1; pocketSlatIndex < pocketSlatCount; pocketSlatIndex += 1) {
          const pocketSlatOffset = (pocketDoorHeight * pocketSlatIndex) / pocketSlatCount
          pocketSlatOffsets.push([pocketDoorWidth * 0.98, 0.012, 0.052, 0, pocketSlatOffset, pocketSwingSign * 0.052])
        }
        deps.addArchitectureMesh(
          pocketDoorGroup,
          pocketSlatOffsets,
          doorPartColor('slat'),
          doorPartOptions('slat', {
            ...doorLeafMaterialOptions,
            rounded: false,
            metalness: yt6.warmWood ? 0.08 : 0.42,
            roughness: 0.34,
            castShadow: false,
            receiveShadow: false,
          }),
        ),
          doorGroup.add(pocketDoorGroup),
          (doorGroup.userData.optimizationStats = {
            type: 'door-roller-shutter',
            before: 5 + pocketSlatCount,
            after: 3,
          }),
          deps.sceneRootNode.add(doorGroup)
        continue
      }
      if (doorType === 'entry') {
        const pocketLeafWidth = Math.max(buildInteriorSceneDoorWidth - doorLeafThickness * 1.5, 0.4),
          pocketLeafHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.85, 0.8),
          pocketSwingSign = currentDoor.swing === -1 ? -1 : 1,
          pocketLeafFaceZ = pocketSwingSign * Math.max(0, (0.09 - doorLeafThickness) / 2) * 0.9,
          pocketTrimZ = pocketLeafFaceZ + pocketSwingSign * 0.012,
          pocketHandleZ = pocketLeafFaceZ + pocketSwingSign * 0.055
        deps.addArchitectureMesh(
          doorGroup,
          [[pocketLeafWidth, pocketLeafHeight, 0.065, 0, pocketLeafHeight * 0.5, pocketLeafFaceZ]],
          doorPartColor('door'),
          doorPartOptions('door', doorLeafPartMeshOptions),
        ),
          deps.addArchitectureMesh(
            doorGroup,
            [
              [pocketLeafWidth * 0.76, 0.022, 0.078, 0, buildInteriorSceneDoorHeight * 0.68, pocketTrimZ],
              [pocketLeafWidth * 0.76, 0.022, 0.078, 0, buildInteriorSceneDoorHeight * 0.34, pocketTrimZ],
            ],
            doorPartColor('trim'),
            doorPartOptions('trim', doorTrimMeshOptions),
          )
        const pocketHingeOffset = currentDoor.hinge === 'right' ? -pocketLeafWidth * 0.34 : pocketLeafWidth * 0.34
        deps.addArchitectureMesh(
          doorGroup,
          [[0.035, 0.18, 0.085, pocketHingeOffset, buildInteriorSceneDoorHeight * 0.5, pocketHandleZ]],
          doorPartColor('metal'),
          doorPartOptions('metal', METAL_PART_MESH_OPTIONS),
        )
        const pocketLeafGroup = new ns2.Group()
        pocketLeafGroup.position.x = ((currentDoor.hinge === 'right' ? 1 : -1) * pocketLeafWidth) / 2
        for (const pocketPanel of [...doorGroup.children].slice(1))
          (pocketPanel.position.x -= pocketLeafGroup.position.x), pocketLeafGroup.add(pocketPanel)
        doorGroup.add(pocketLeafGroup),
          (pocketLeafGroup.rotation.y = doorDisplayRotation(
            doorLeafRotation2(currentDoor, Math.PI * 0.42),
            doorOpenRatio,
          )),
          buildInteriorSceneIsEmbeddedStage &&
            ((pocketLeafGroup.userData.entryDoorPivot = true),
            (pocketLeafGroup.userData.doorHingePivot = true),
            (pocketLeafGroup.userData.doorRestRotation = pocketLeafGroup.rotation.y),
            (doorGroup.userData.entryDoorSign =
              (currentDoor.hinge === 'right' ? 1 : -1) * (currentDoor.swing === -1 ? -1 : 1)),
            (doorGroup.userData.entryDoorLeafWidth = pocketLeafWidth),
            (doorGroup.userData.doorLeafWidth = pocketLeafWidth),
            (doorGroup.userData.doorClosedRotation = 0)),
          (doorGroup.userData.optimizationStats = {
            type: 'door-entry',
            before: 7,
            after: 4,
          }),
          deps.sceneRootNode.add(doorGroup)
        continue
      }
      if (doorType === 'entry-child-mother') {
        /** 入户子母门：宽扇（母门）带铰链可开，窄扇（子门）常闭，两扇不等宽。 */
        const childMotherHingeSign = currentDoor.hinge === 'right' ? 1 : -1,
          childMotherSwingSign = currentDoor.swing === -1 ? -1 : 1,
          childMotherLeafHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.85, 0.8),
          childMotherUsableWidth = Math.max(buildInteriorSceneDoorWidth - doorLeafThickness * 1.5, 0.34),
          childMotherChildWidth = Math.min(
            Math.max(childMotherUsableWidth * 0.3, 0.22),
            Math.max(childMotherUsableWidth * 0.45, childMotherUsableWidth - 0.4),
          ),
          childMotherMotherWidth = Math.max(childMotherUsableWidth - childMotherChildWidth, 0.2),
          /** 母门扇在铰链枢轴内的局部偏移；子门中心恰好与它同号同值。 */
          childMotherLeafOffsetX = -childMotherHingeSign * (childMotherMotherWidth / 2),
          childMotherFaceZ = childMotherSwingSign * Math.max(0, (0.09 - doorLeafThickness) / 2) * 0.9,
          childMotherTrimZ = childMotherFaceZ + childMotherSwingSign * 0.012,
          childMotherHandleZ = childMotherFaceZ + childMotherSwingSign * 0.055,
          childMotherMotherGroup = new ns2.Group()
        childMotherMotherGroup.position.x = (childMotherHingeSign * childMotherUsableWidth) / 2
        deps.addArchitectureMesh(
          childMotherMotherGroup,
          [
            [
              childMotherMotherWidth,
              childMotherLeafHeight,
              doorLeafThickness,
              childMotherLeafOffsetX,
              childMotherLeafHeight / 2,
              childMotherFaceZ,
            ],
          ],
          doorPartColor('door'),
          doorPartOptions('door', {
            ...doorLeafMaterialOptions,
            ...doorLeafPartMeshOptions,
          }),
        )
        deps.addArchitectureMesh(
          childMotherMotherGroup,
          [
            [
              childMotherMotherWidth * 0.76,
              0.022,
              0.078,
              childMotherLeafOffsetX,
              buildInteriorSceneDoorHeight * 0.68,
              childMotherTrimZ,
            ],
            [
              childMotherMotherWidth * 0.76,
              0.022,
              0.078,
              childMotherLeafOffsetX,
              buildInteriorSceneDoorHeight * 0.34,
              childMotherTrimZ,
            ],
          ],
          doorPartColor('trim'),
          doorPartOptions('trim', doorTrimMeshOptions),
        )
        deps.addArchitectureMesh(
          childMotherMotherGroup,
          [
            [
              0.035,
              0.18,
              0.085,
              -childMotherHingeSign * childMotherMotherWidth * 0.4,
              buildInteriorSceneDoorHeight * 0.5,
              childMotherHandleZ,
            ],
          ],
          doorPartColor('metal'),
          doorPartOptions('metal', METAL_PART_MESH_OPTIONS),
        )
        /** 子门：常闭窄扇，带上下两道插销。 */
        deps.addArchitectureMesh(
          doorGroup,
          [
            [
              childMotherChildWidth,
              childMotherLeafHeight,
              doorLeafThickness,
              childMotherLeafOffsetX,
              childMotherLeafHeight / 2,
              childMotherFaceZ,
            ],
          ],
          doorPartColor('door'),
          doorPartOptions('door', {
            ...doorLeafMaterialOptions,
            ...doorLeafPartMeshOptions,
          }),
        )
        deps.addArchitectureMesh(
          doorGroup,
          [
            [
              0.045,
              0.028,
              0.06,
              childMotherLeafOffsetX + childMotherHingeSign * childMotherChildWidth * 0.35,
              buildInteriorSceneDoorHeight * 0.62,
              childMotherHandleZ,
            ],
            [
              0.045,
              0.028,
              0.06,
              childMotherLeafOffsetX + childMotherHingeSign * childMotherChildWidth * 0.35,
              buildInteriorSceneDoorHeight * 0.36,
              childMotherHandleZ,
            ],
          ],
          doorPartColor('metal'),
          doorPartOptions('metal', {
            rounded: false,
            metalness: 0.52,
            roughness: 0.3,
            castShadow: false,
            receiveShadow: false,
          }),
        )
        doorGroup.add(childMotherMotherGroup),
          (childMotherMotherGroup.rotation.y = doorDisplayRotation(
            doorLeafRotation2(currentDoor, Math.PI * 0.42),
            doorOpenRatio,
          )),
          buildInteriorSceneIsEmbeddedStage &&
            (Object.assign(childMotherMotherGroup.userData, {
              entryDoorPivot: true,
              doorHingePivot: true,
              doorFixedHinge: true,
              doorRestRotation: childMotherMotherGroup.rotation.y,
              doorClosedRotation: 0,
            }),
            (doorGroup.userData.entryDoorSign = childMotherHingeSign * childMotherSwingSign),
            (doorGroup.userData.entryDoorLeafWidth = childMotherMotherWidth),
            (doorGroup.userData.doorLeafWidth = childMotherMotherWidth),
            (doorGroup.userData.doorClosedRotation = 0)),
          (doorGroup.userData.optimizationStats = {
            type: 'door-entry-child-mother',
            before: 9,
            after: 6,
          }),
          deps.sceneRootNode.add(doorGroup)
        continue
      }
      if (doorType === 'double') {
        const splitPanelWidth = Math.max((buildInteriorSceneDoorWidth - doorLeafThickness) / 2 - 0.003, 0.25),
          splitPanelHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness / 2 - 0.006, 0.4),
          splitPanelSwingAngle = (currentDoor.swing === -1 ? 1 : -1) * Math.PI * 0.42
        for (const splitPanelSign of [-1, 1]) {
          const splitPanelOffset = splitPanelSign * (buildInteriorSceneDoorWidth / 2 - doorLeafThickness * 0.5),
            splitPanelGroup = new ns2.Group()
          const splitPanelOpenRotation = splitPanelSign < 0 ? splitPanelSwingAngle : -splitPanelSwingAngle
          ;(splitPanelGroup.position.x = splitPanelOffset),
            (splitPanelGroup.rotation.y = doorDisplayRotation(splitPanelOpenRotation, doorOpenRatio)),
            buildInteriorSceneIsEmbeddedStage &&
              ((splitPanelGroup.userData.doorHingePivot = true),
              (splitPanelGroup.userData.doorFixedHinge = true),
              (splitPanelGroup.userData.doorRestRotation = splitPanelGroup.rotation.y),
              (splitPanelGroup.userData.doorOpenRotation = splitPanelOpenRotation))
          const splitPanelHandleOffset = splitPanelSign < 0 ? splitPanelWidth / 2 : -splitPanelWidth / 2
          deps.addArchitectureMesh(
            splitPanelGroup,
            [[splitPanelWidth, splitPanelHeight, 0.04, splitPanelHandleOffset, splitPanelHeight / 2, 0]],
            doorPartColor('door'),
            doorPartOptions('door', {
              ...doorLeafMaterialOptions,
              rounded: false,
              roughness: 0.66,
              castShadow: false,
              receiveShadow: false,
            }),
          )
          const splitPanelHandleX = splitPanelSign < 0 ? splitPanelWidth * 0.84 : -splitPanelWidth * 0.84
          deps.addArchitectureMesh(
            splitPanelGroup,
            [[0.035, 0.055, 0.065, splitPanelHandleX, buildInteriorSceneDoorHeight * 0.5, 0.04]],
            doorPartColor('metal'),
            doorPartOptions('metal', {
              rounded: false,
              metalness: 0.45,
              castShadow: false,
              receiveShadow: false,
            }),
          ),
            doorGroup.add(splitPanelGroup)
        }
        ;(doorGroup.userData.optimizationStats = {
          type: 'door-double',
          before: 7,
          after: 3,
        }),
          deps.sceneRootNode.add(doorGroup)
        continue
      }
      const isRightHingeLeaf = currentDoor.hinge === 'right',
        foldLeafWidth = Math.max(buildInteriorSceneDoorWidth - doorLeafThickness * 1.4, 0.2),
        foldLeafHeight = Math.max(buildInteriorSceneDoorHeight - doorLeafThickness * 0.8, 0.4),
        foldLeafGroup = new ns2.Group()
      ;(foldLeafGroup.position.x = isRightHingeLeaf
        ? buildInteriorSceneDoorWidth / 2 - doorLeafThickness * 0.5
        : -buildInteriorSceneDoorWidth / 2 + doorLeafThickness * 0.5),
        (foldLeafGroup.rotation.y = doorDisplayRotation(doorLeafRotation2(currentDoor, Math.PI * 0.42), doorOpenRatio)),
        buildInteriorSceneIsEmbeddedStage &&
          ((foldLeafGroup.userData.doorHingePivot = true),
          (foldLeafGroup.userData.doorRestRotation = foldLeafGroup.rotation.y)),
        doorGroup.add(foldLeafGroup)
      const foldLeafOffset = isRightHingeLeaf ? -foldLeafWidth / 2 : foldLeafWidth / 2
      doorType === 'glass'
        ? deps.addWindowFrames(
            foldLeafGroup,
            [
              {
                width: foldLeafWidth,
                height: foldLeafHeight,
                centerX: foldLeafOffset,
                centerZ: 0,
              },
            ],
            doorPartColor('frame'),
            doorGlassColor,
          )
        : deps.addArchitectureMesh(
            foldLeafGroup,
            [[foldLeafWidth, foldLeafHeight, 0.04, foldLeafOffset, foldLeafHeight / 2, 0]],
            doorPartColor('door'),
            doorPartOptions('door', {
              ...doorLeafMaterialOptions,
              rounded: false,
              roughness: 0.66,
              castShadow: false,
              receiveShadow: false,
            }),
          )
      const foldLeafHingeOffset = isRightHingeLeaf ? -foldLeafWidth * 0.84 : foldLeafWidth * 0.84
      deps.addArchitectureMesh(
        foldLeafGroup,
        [[0.035, 0.055, 0.065, foldLeafHingeOffset, buildInteriorSceneDoorHeight * 0.5, 0.04]],
        doorPartColor('metal'),
        doorPartOptions('metal', {
          rounded: false,
          metalness: 0.45,
          castShadow: false,
          receiveShadow: false,
        }),
      ),
        buildInteriorSceneIsEmbeddedStage &&
          ((doorGroup.userData.doorLeafWidth = foldLeafWidth),
          (doorGroup.userData.doorClosedRotation = 0),
          // 0.8.1 会给普通门扇写开门位：拿不到楼层多边形时（开放平面）靠它定开向。
          (doorGroup.userData.doorOpenRotation = doorLeafRotation2(currentDoor, Math.PI * 0.42))),
        (doorGroup.userData.optimizationStats = {
          type: doorType === 'glass' ? 'door-glass' : 'door-solid',
          before: doorType === 'glass' ? 9 : 5,
          after: doorType === 'glass' ? 4 : 3,
        }),
        deps.sceneRootNode.add(doorGroup)
    }
  }
  for (const interiorChildObject of deps.sceneRootNode.children)
    existingChildSet.has(interiorChildObject) ||
      ((interiorChildObject.userData.modelLayer = 'architecture'),
      interiorChildObject.traverse((interiorDescendant: any) => {
        interiorDescendant.userData.exportRole || (interiorDescendant.userData.exportRole = 'plan')
      }))
}
