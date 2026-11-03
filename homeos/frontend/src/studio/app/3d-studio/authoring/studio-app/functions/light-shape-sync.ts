/**
 * 「照射范围（m）」与「光束角（°）」的就地同步。
 *
 * 为什么需要它
 * ------------
 * 这两个值只活在灯对象自己身上（`SpotLight.distance` / `SpotLight.angle`），而灯对象是
 * **重建灯光层**时才新建的。亮度、色温没有这个限制：灯效通路（HA 灯态、灯光过渡、
 * 灯光缓存回显）每帧都会从 item 上重写一次 `intensity` / `color`。
 *
 * 于是只要重建没有立刻发生，用户就会看到「改亮度有色温有反应，改照射范围、光束角毫无变化」：
 * - 手动预览模式（`livePreviewEnabled !== true`）下 `requestSceneRebuild` 只会把场景标脏，
 *   等用户点「待更新 · 更新」；
 * - 场景还在装载、或重建被合并到下一帧时同理。
 *
 * 这里按 item 的当前值把锥体参数写回**已经存在**的灯对象，并把阴影相机的裁剪面一起对齐，
 * 再请一帧重绘，让这两个参数一次提交就能看见效果。重建照旧排队，负责灯带外形、光晕等
 * 几何层面的更新。
 *
 * 口径与 `addLightModel` 完全一致：`SpotLight.angle` 是**半角**（弧度），
 * `distance` 是照射范围，阴影相机 `near/far` 跟随照射范围。
 * 灯带是 `RectAreaLight`，没有锥角，光束角对它无效（0.8.2 同样如此）。
 */

import { clamp as clamp2 } from "../../../plan/geometry";
import { finite as finite2 } from "../../../loaders/studio-normalization";
import { lightAngleLimitForType, lightPresetCatalog } from "../../lights/studio-app-light-data";

/** 按灯型取预设（未知灯型按筒灯处理，与 `addLightModel` 同口径）。 */
function lightPresetFor(lightType: string) {
  return (
    (lightPresetCatalog as unknown as Record<string, typeof lightPresetCatalog.downlight>)[
      lightType
    ] ?? lightPresetCatalog.downlight
  );
}
import { lampItemTypeSet } from "../../items/item-catalog";
import type { StudioAppContext } from "../studio-app-context";

export interface LightShapeTarget {
  distance: number;
  halfAngleRad: number;
}

/** 灯具 item 里本模块关心的字段（其余字段一律不看）。 */
type LightItemLike = {
  id?: string;
  type?: string;
  lightRange?: number;
  lightAngle?: number;
};

/** 场景里的灯对象里本模块关心的字段（SpotLight / RectAreaLight 的公共子集）。 */
type SceneLightLike = {
  distance?: number;
  angle?: number;
  intensity?: number;
  visible?: boolean;
  isSpotLight?: boolean;
  type?: string;
  userData?: { lightItemId?: string };
  shadow?: { camera?: { near: number; far: number; updateProjectionMatrix: () => void }; needsUpdate?: boolean };
};

declare global {
  interface Window {
    /** 现场排查入口（见 `installLightShapeProbe`）。 */
    __homeosLightShapeProbe?: () => unknown;
  }
}

/** item → 灯对象上应有的锥体参数；不是灯或缺少 id 时返回 null。 */
export function resolveLightShapeTarget(lightItem: LightItemLike): LightShapeTarget | null {
  if (!lightItem?.id || !lampItemTypeSet.has(lightItem.type ?? "")) return null;
  const lightPreset = lightPresetFor(lightItem.type ?? ""),
    lightRange = clamp2(finite2(lightItem.lightRange, lightPreset.range), 0.5, 10),
    lightAngle = clamp2(
      finite2(lightItem.lightAngle, lightPreset.angle),
      15,
      lightAngleLimitForType(lightItem.type ?? ""),
    );
  return {
    distance: lightRange,
    // 与 addLightModel 同口径：SpotLight 的 angle 是半角（弧度）。
    halfAngleRad: ((lightAngle / 2) * Math.PI) / 180,
  };
}

function applyLightShapeTarget(sceneLight: SceneLightLike, shapeTarget: LightShapeTarget) {
  if (
    Math.abs(finite2(sceneLight.distance, 0) - shapeTarget.distance) < 0.0001 &&
    Math.abs(finite2(sceneLight.angle, 0) - shapeTarget.halfAngleRad) < 0.00001
  )
    return false;
  ((sceneLight.distance = shapeTarget.distance), (sceneLight.angle = shapeTarget.halfAngleRad));
  const spotShadowCamera = sceneLight.shadow?.camera;
  if (spotShadowCamera) {
    ((spotShadowCamera.near = clamp2(shapeTarget.distance * 0.05, 0.12, 0.24)),
      (spotShadowCamera.far = shapeTarget.distance),
      spotShadowCamera.updateProjectionMatrix());
  }
  // 锥体变了，旧阴影图里能看见的区域就不对了：标脏让它按新锥体重画一次。
  sceneLight.shadow && (sceneLight.shadow.needsUpdate = true);
  return true;
}

/**
 * 把给定灯具的照射范围/光束角同步到场景里已经存在的灯对象。
 *
 * @returns 实际被改动的灯对象数量（0 表示已一致，或场景里还没有对应的灯）。
 */
export function syncLightShapeFromItems(
  appCtx: StudioAppContext,
  lightItemList: LightItemLike[] = (appCtx.studioState?.items as LightItemLike[]) || [],
) {
  const sceneRoot = appCtx.sceneRootNode;
  if (!sceneRoot?.traverse || !lightItemList?.length) return 0;
  installLightShapeProbe(appCtx);
  const shapeByItemId = new Map<string, LightShapeTarget>();
  for (const lightItem of lightItemList) {
    const shapeTarget = resolveLightShapeTarget(lightItem);
    shapeTarget && lightItem.id && shapeByItemId.set(lightItem.id, shapeTarget);
  }
  if (!shapeByItemId.size) return 0;
  let updatedLightCount = 0;
  sceneRoot.traverse((sceneLight: SceneLightLike) => {
    const shapeTarget = sceneLight?.userData?.lightItemId
      ? shapeByItemId.get(sceneLight.userData.lightItemId) ?? null
      : null;
    if (!shapeTarget || !sceneLight.isSpotLight) return;
    applyLightShapeTarget(sceneLight, shapeTarget) && (updatedLightCount += 1);
  });
  // 现场自检：改完这两个值应该能看到 updated/候选 这个计数变化（0/N 说明没匹配到灯）。
  updatedLightCount > 0 &&
    (document.documentElement.dataset.lightShapeSync = `${updatedLightCount}/${shapeByItemId.size}`);
  return updatedLightCount;
}

/**
 * 就地同步 + 请一帧重绘。
 *
 * 重绘走的是 `isFrameDirty` + 帧循环 `wake()`：与 `requestStudioRender` 同一条通路，
 * 但只依赖 `appCtx`，因此属性提交（`applyToolSetting`）这种拿不到 runtime 的位置也能用。
 */
export function syncLightShapeAndRepaint(appCtx: StudioAppContext, lightItemList?: LightItemLike[]) {
  const updatedLightCount = syncLightShapeFromItems(appCtx, lightItemList);
  if (updatedLightCount > 0) ((appCtx.isFrameDirty = true), appCtx.lightingScheduler?.wake?.());
  return updatedLightCount;
}

let probeAppCtx: StudioAppContext | null = null;

/**
 * 现场排查入口：控制台执行 `__homeosLightShapeProbe()`，列出每盏灯
 * 「item 上期望的 range/angle」与「场景里灯对象实际的 distance/angle」的对照。
 *
 * 用来区分三种情况：
 * - item 列表里根本没有这盏灯 → 选中的不是当前楼层的灯具；
 * - 有 item、没有对应的 spot → 灯光层没建出来（或该类型是灯带）；
 * - 两边不一致 → 重建没跑到灯光层，就地同步也没命中。
 */
export function installLightShapeProbe(appCtx: StudioAppContext) {
  probeAppCtx = appCtx;
  if (typeof window === "undefined" || window.__homeosLightShapeProbe) return;
  window.__homeosLightShapeProbe = () => {
    const probeItemList = ((probeAppCtx?.studioState?.items || []) as LightItemLike[]).filter((probeItem) =>
        lampItemTypeSet.has(probeItem?.type ?? ""),
      ),
      probeLightsByItemId = new Map<string, SceneLightLike>();
    probeAppCtx?.sceneRootNode?.traverse?.((probeLight: SceneLightLike) => {
      const probeLightItemId = probeLight?.userData?.lightItemId;
      probeLightItemId && !probeLightsByItemId.has(probeLightItemId)
        ? probeLightsByItemId.set(probeLightItemId, probeLight)
        : null;
    });
    return {
      sync: document.documentElement.dataset.lightShapeSync || "(还没同步过)",
      itemCount: probeItemList.length,
      lightCount: probeLightsByItemId.size,
      rows: probeItemList.map((probeItem) => {
        const probeTarget = resolveLightShapeTarget(probeItem),
          probeLight = probeItem.id ? probeLightsByItemId.get(probeItem.id) : undefined;
        return {
          id: probeItem.id,
          type: probeItem.type,
          itemRange: probeItem.lightRange ?? "(默认)",
          itemAngle: probeItem.lightAngle ?? "(默认)",
          expectRange: probeTarget?.distance ?? null,
          expectAngleDeg: probeTarget ? Math.round((probeTarget.halfAngleRad * 2 * 180) / Math.PI) : null,
          lightKind: probeLight ? (probeLight.isSpotLight ? "spot" : probeLight.type) : "缺失",
          lightRange: probeLight?.distance ?? null,
          lightAngleDeg: probeLight?.isSpotLight
            ? Math.round(((probeLight.angle ?? 0) * 2 * 180) / Math.PI)
            : null,
          visible: probeLight?.visible ?? null,
          intensity: probeLight?.intensity ?? null,
        };
      }),
    };
  };
}
