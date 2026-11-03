/**
 * 舞台侧的地面投影发送器：把 3D 户型地板矩形投影成归一化屏幕四边形，发回宿主。
 *
 * 为什么要这层：天气覆盖层是宿主上的 2D canvas，看不见 3D 相机。只有拿到地板的
 * 投影，雨滴落地才能在**真实地板**上溅起水花，而不是在屏幕上随便一条水平带上。
 *
 * 约束：本模块跑在高频路径上（相机每帧都动），所以
 * - 地面包围盒按 `sceneRevision` 缓存，不重复遍历场景；
 * - 相机 / 视口 / 地面都没变时零开销返回；
 * - 变化时按 `minIntervalMs` 节流，避免相机滑动时刷消息。
 */

/** 户型地板在场景坐标系里的轴对齐范围。 */
export type WeatherGroundBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
};

/** 世界坐标 → NDC（`z` 保留，用来剔除相机背后的点）。 */
export type WeatherGroundProjector = (
  x: number,
  y: number,
  z: number,
) => readonly [number, number, number];

export type WeatherGroundMessage = {
  type: "weather-ground";
  /** 四个角的归一化屏幕坐标，顺序与外层世界顺序一致。 */
  quad: readonly (readonly [number, number])[];
  revision: number;
};

type WeatherGroundEmitterOptions = {
  /** 取地板范围；返回 null 表示还没有可用的户型（刚挂载 / 正在重建）。 */
  getBounds: () => WeatherGroundBounds | null;
  /** 取投影函数；相机未就绪时返回 null。 */
  getProjector: () => WeatherGroundProjector | null;
  /** 相机姿态指纹：变了才重新投影。 */
  getCameraKey: () => string;
  getViewportSize: () => { width: number; height: number };
  postMessage: (message: WeatherGroundMessage) => void;
  now?: () => number;
  minIntervalMs?: number;
};

const DEFAULT_MIN_INTERVAL_MS = 120;

export function createWeatherGroundEmitter({
  getBounds,
  getProjector,
  getCameraKey,
  getViewportSize,
  postMessage,
  now = () => performance.now(),
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
}: WeatherGroundEmitterOptions) {
  let lastKey = "";
  let lastSentAt = -Infinity;
  let revision = 0;
  let disposed = false;

  /** 地板四角（世界坐标）按「minX/minZ → maxX/minZ → maxX/maxZ → minX/maxZ」展开。 */
  function cornerWorldPoints(bounds: WeatherGroundBounds) {
    const { minX, maxX, minZ, maxZ, y } = bounds;
    return [
      [minX, y, minZ],
      [maxX, y, minZ],
      [maxX, y, maxZ],
      [minX, y, maxZ],
    ] as const;
  }

  /** NDC → 0~1 屏幕坐标；y 轴翻转，与 CSS 坐标一致。 */
  function toScreenPoint(ndc: readonly [number, number, number]) {
    return [(ndc[0] + 1) / 2, (1 - ndc[1]) / 2] as const;
  }

  function projectQuad(bounds: WeatherGroundBounds) {
    const projector = getProjector();
    if (!projector) return null;
    const points = cornerWorldPoints(bounds).map(([x, y, z]) => projector(x, y, z));
    // 任一角跑到相机背后：这一帧的四边形没有意义，等相机转回来再发。
    if (points.some((point) => point[2] < -1 || point[2] > 1)) return null;
    return points.map(toScreenPoint);
  }

  return {
    /** 相机 / 尺寸变化时调用；内部自行判断是否真的需要发消息。 */
    sync(force = false) {
      if (disposed) return;
      const viewport = getViewportSize();
      if (!(viewport.width > 0) || !(viewport.height > 0)) return;
      const bounds = getBounds();
      if (!bounds) return;
      const cameraKey = getCameraKey();
      const key = `${cameraKey}|${viewport.width}x${viewport.height}|${bounds.minX},${bounds.maxX},${bounds.minZ},${bounds.maxZ}`;
      if (!force && key === lastKey) return;
      const timestamp = now();
      if (!force && timestamp - lastSentAt < minIntervalMs) return;
      const quad = projectQuad(bounds);
      if (!quad) return;
      lastKey = key;
      lastSentAt = timestamp;
      revision += 1;
      postMessage({ type: "weather-ground", quad, revision });
    },
    dispose() {
      disposed = true;
      lastKey = "";
    },
  };
}
