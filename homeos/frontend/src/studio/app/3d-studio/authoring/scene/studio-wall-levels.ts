/**
 * 一层墙的分层绘制：墙带 → 顶盖 → 洞口过梁底面（soffit）→ 选中高亮层。
 *
 * 从 `studio-walls` 的 `buildInteriorScene` 里切出来，原因是那段循环体是整条链路里
 * 唯一「按高度层」变化的部分：它自己带着 4 个出口（不透明墙带、顶盖、soffit、高亮层），
 * 混在场景装配的主函数里会让那个函数继续膨胀，而且每加一种面片就再涨一次。
 *
 * `buildBand` 由宿主注入而不是 `import { buildWallBandMesh }`：两个模块互相引用会形成
 * 运行时循环依赖，而这里只需要一个函数值。
 */
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { buildWallCapSurface, shadeTint } from "./studio-wall-shell";
import type { WallCapContext, WallCapLoop } from "./studio-wall-shell";
import type { StudioWallsDeps } from "./studio-walls";
import type { WallBandOptions } from "../types/studio-app-types";

/** 高度比较用的 epsilon（米）。低于它视为同一层。 */
const LEVEL_EPSILON = 0.000001;

/** 墙带体块：一面墙被洞口和高度层切出来的一个矩形块（`bottom`/`top` 为世界高度）。 */
export interface WallVolumeSlice {
  wallId: string;
  footprint: WallCapLoop[];
  bottom: number;
  top: number;
  opacity: number;
  wallHeight?: number;
}

/** 主题里墙用到的三档颜色（`backgroundSettings()` 的墙分支）。 */
export interface WallLevelTint {
  wall: number;
  wallTop: number;
  accent: number;
  warmWood?: boolean;
}

/** 注入的墙带构建器（见文件头说明：避免运行时循环依赖）。 */
export type BuildWallBandMesh = (
  deps: StudioWallsDeps,
  loops: WallCapLoop[][],
  baseHeight: number,
  topHeight: number,
  color: number,
  opacity: number,
  options?: WallBandOptions,
) => void;

export interface WallLevelContext {
  deps: StudioWallsDeps;
  /** 顶盖 / soffit 共用的盖面上下文（并集缓存 + 墙顶材质）。 */
  capBuilder: WallCapContext;
  buildBand: BuildWallBandMesh;
  tint: WallLevelTint;
  wallVolumes: WallVolumeSlice[];
  /** 楼板完成面高度：最底层墙带向下延伸到这里，消掉墙脚那条缝。 */
  floorSurfaceY: number;
}

/** 最底层墙带的下沿：楼板面在 0 以下时把墙补到楼板里，其余层原样。 */
export function resolveWallBandBaseHeight(lowerWallLevel: number, floorSurfaceY: number) {
  return lowerWallLevel <= LEVEL_EPSILON ? Math.min(lowerWallLevel, floorSurfaceY) : lowerWallLevel;
}

/** 取横跨本层中线的体块（同高层的墙才会出现在这里）。 */
export function collectLevelVolumes(
  wallVolumes: WallVolumeSlice[],
  lowerWallLevel: number,
  upperWallLevel: number,
) {
  const midWallLevel = (lowerWallLevel + upperWallLevel) / 2;
  return wallVolumes.filter(
    (wallVolume) =>
      midWallLevel > wallVolume.bottom - LEVEL_EPSILON &&
      midWallLevel < wallVolume.top + LEVEL_EPSILON,
  );
}

/** 按透明度分组：不同透明度的墙要各自一套材质，不然半透明墙会被不透明墙带偏。 */
export function groupWallVolumesByOpacity(levelVolumes: WallVolumeSlice[]) {
  const groups = new Map<string, { opacity: number; volumes: WallVolumeSlice[] }>();
  for (const wallVolume of levelVolumes) {
    const groupKey = wallVolume.opacity.toFixed(4),
      existingGroup = groups.get(groupKey);
    existingGroup
      ? existingGroup.volumes.push(wallVolume)
      : groups.set(groupKey, { opacity: wallVolume.opacity, volumes: [wallVolume] });
  }
  return groups;
}

/**
 * 取「上边界 / 下边界正好落在 `height`」的体块足迹。
 *
 * 下边界额外排除贴着地面的体块（`bottom > 0`）：地面那侧由接触阴影和楼板负责，
 * 再补一层朝下的面片只会在视线高度糊一条暗带。
 */
export function levelFootprintsAt(
  volumes: WallVolumeSlice[],
  height: number,
  edge: "top" | "bottom",
) {
  return volumes
    .filter((wallVolume) =>
      edge === "top"
        ? Math.abs(wallVolume.top - height) <= LEVEL_EPSILON
        : wallVolume.bottom > LEVEL_EPSILON &&
          Math.abs(wallVolume.bottom - height) <= LEVEL_EPSILON,
    )
    .map((wallVolume) => wallVolume.footprint);
}

function selectedFootprints(context: WallLevelContext, volumes: WallVolumeSlice[]) {
  return volumes
    .filter((wallVolume) => context.deps.createSelectionRef("wall", wallVolume.wallId))
    .map((wallVolume) => wallVolume.footprint);
}

/** 一个透明度分组的墙带 + 顶盖 + 过梁底面。 */
function buildOpacityLayers(
  context: WallLevelContext,
  group: { opacity: number; volumes: WallVolumeSlice[] },
  lowerWallLevel: number,
  upperWallLevel: number,
  baseHeight: number,
) {
  const { deps, capBuilder, buildBand, tint } = context,
    soffitFactor = tint.warmWood ? 0.88 : 0.82;
  buildBand(
    deps,
    group.volumes.map((wallVolume) => wallVolume.footprint),
    baseHeight,
    upperWallLevel,
    tint.wall,
    group.opacity,
    { castShadow: true, lightOccluder: true, heightSpan: group.volumes[0]?.wallHeight },
  );
  buildWallCapSurface(capBuilder, {
    loops: levelFootprintsAt(group.volumes, upperWallLevel, "top"),
    height: upperWallLevel,
    color: tint.wall,
    opacity: group.opacity,
    facing: "up",
    options: { topColor: tint.warmWood ? tint.wallTop : tint.wall },
  });
  // 洞口上沿（= 上一块墙的下边界）：以前没有这层面片，斜看能顺着缝望进墙体内部。
  buildWallCapSurface(capBuilder, {
    loops: levelFootprintsAt(group.volumes, lowerWallLevel, "bottom"),
    height: lowerWallLevel,
    color: shadeTint(tint.wall, soffitFactor),
    opacity: group.opacity,
    facing: "down",
    options: {
      topColor: shadeTint(tint.warmWood ? tint.wallTop : tint.wall, soffitFactor),
      emissiveIntensity: 0.1,
    },
  });
}

/** 选中墙的高亮层（比墙带亮一档、`renderOrder` 更高）。 */
function buildAccentLayers(
  context: WallLevelContext,
  levelVolumes: WallVolumeSlice[],
  upperWallLevel: number,
  baseHeight: number,
) {
  const { deps, capBuilder, buildBand, tint } = context,
    accentFootprints = selectedFootprints(context, levelVolumes);
  if (!accentFootprints.length) return;
  buildBand(deps, accentFootprints, baseHeight, upperWallLevel, tint.accent, 0.28, {
    depthWrite: false,
    depthFunc: ns2.LessEqualDepth,
    polygonOffset: true,
    emissive: tint.accent,
    emissiveIntensity: 0.08,
    renderOrder: 5,
  });
  buildWallCapSurface(capBuilder, {
    loops: levelFootprintsAt(
      levelVolumes.filter((wallVolume) =>
        deps.createSelectionRef("wall", wallVolume.wallId),
      ),
      upperWallLevel,
      "top",
    ),
    height: upperWallLevel,
    color: tint.accent,
    opacity: 0.28,
    facing: "up",
    options: {
      depthWrite: false,
      depthFunc: ns2.LessEqualDepth,
      polygonOffset: true,
      emissive: tint.accent,
      emissiveIntensity: 0.08,
      topOpacity: 0.12,
      renderOrder: 6,
    },
  });
}

/** 画一层墙：[lowerWallLevel, upperWallLevel] 之间所有体块。 */
export function buildWallLevelLayers(
  context: WallLevelContext,
  lowerWallLevel: number,
  upperWallLevel: number,
) {
  if (upperWallLevel - lowerWallLevel <= LEVEL_EPSILON) return;
  const baseHeight = resolveWallBandBaseHeight(lowerWallLevel, context.floorSurfaceY),
    levelVolumes = collectLevelVolumes(context.wallVolumes, lowerWallLevel, upperWallLevel);
  for (const opacityGroup of groupWallVolumesByOpacity(levelVolumes).values())
    buildOpacityLayers(context, opacityGroup, lowerWallLevel, upperWallLevel, baseHeight);
  buildAccentLayers(context, levelVolumes, upperWallLevel, baseHeight);
}
