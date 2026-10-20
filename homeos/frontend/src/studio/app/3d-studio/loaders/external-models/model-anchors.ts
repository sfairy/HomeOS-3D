/**
 * 模型锚点（0.7.8 `studio-external-models.js` 的 `statusAnchor` / `mistOutlet`）。
 *
 * 锚点是模型局部坐标，加载完成后写到模型根的 `userData` 上：
 * - `deviceStatusAnchor`：NAS 状态灯等指示点的位置（`nas-status` 优先读它）；
 * - `deviceMistOutlet`：加湿器 / 香氛机 / 油烟机的喷雾出口。
 *
 * 数值来自 0.7.8 的模型注册表（`approved-models` 自带锚点 + 外部模型表的补充），
 * 缺失时不写 userData，消费方各自回退到几何中心。
 */

type Vec3 = readonly [number, number, number];

/** 状态灯锚点（模型局部坐标）。 */
const MODEL_STATUS_ANCHORS: Readonly<Record<string, Vec3>> = Object.freeze({
  "water-purifier": [-0.032, 0.357, 0.1838],
  "pressure-cooker": [0, 0.175, 0.153],
  "pet-dryer": [-0.042, 0.56, 0.1075],
  "disinfection-cabinet": [0.12, 0.37, 0.1625],
  juicer: [-0.044, 0.108, 0.072],
  "bread-maker": [0, 0.312, 0.153],
  "power-blender": [-0.028, 0.113, 0.0982],
  microwave: [0.1771099, 0.2572229, 0.186587],
  "coffee-machine": [0.0000556, 0.3600371, 0.18],
  ricecooker: [0, 0.15684, 0.1529],
  steamoven: [0, 0.548, 0.2329],
  "air-fryer": [0, 0.308, 0.131],
  "pet-feeder": [0, 0.1895, 0.01925],
  "pet-fountain": [0, 0.07, 0.1145],
  "3d-printer": [-0.024, 0.108, 0.2132],
  "smart-socket-86": [-0.02, 0.012, 0.0049655],
  router: [-0.02613018, 0.03277181, 0.0895],
  humidifier: [0, 0.04226168, 0.11],
  "home-network-cabinet": [-0.187, 0.578, 0.2265],
  "aroma-diffuser": [0, 0.119, 0.0542],
  pipelinewaterpurifier: [0.13, 0.31, -0.026614],
  tea_bar_machine: [0.2, 1.0975, -0.2717],
  toilet: [0.1177796, 0.5140572, -0.2808737],
  printer: [0.15, 0.233, 0.1358],
});

/** 喷雾出口（模型局部坐标）。 */
const MODEL_MIST_OUTLETS: Readonly<Record<string, Vec3>> = Object.freeze({
  "aroma-diffuser": [0, 0.175, 0],
  humidifier: [0, 0.322, 0],
});

function isVec3(candidate: any): candidate is Vec3 {
  return (
    Array.isArray(candidate) &&
    candidate.length === 3 &&
    candidate.every((coordinate: any) => Number.isFinite(coordinate))
  );
}

/**
 * 把锚点写到模型根的 `userData`；没有锚点时不写，避免覆盖模型自带的同名数据。
 * 返回值仅用于测试断言（是否写入了任一锚点）。
 */
export function applyModelAnchors(modelType: string, modelObject: any): boolean {
  let applied = false;
  const mistOutlet = MODEL_MIST_OUTLETS[modelType];
  if (modelObject?.userData && isVec3(mistOutlet)) {
    modelObject.userData.deviceMistOutlet = [...mistOutlet];
    applied = true;
  }
  const statusAnchor = MODEL_STATUS_ANCHORS[modelType];
  if (modelObject?.userData && isVec3(statusAnchor)) {
    modelObject.userData.deviceStatusAnchor = [...statusAnchor];
    applied = true;
  }
  return applied;
}
