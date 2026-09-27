/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { STUDIO_PALETTE } from "./studio-config-tables.js";

/**
 * 单层场景数据的结构版本（`floor.scene.schemaVersion`）。
 */
export const FLOOR_SCENE_SCHEMA_VERSION = 6;

/**
 * 新建一个空白场景（单层绘制数据）。默认值写死在此而非 UI 层：
 */
export function createEmptyScene() {
  return {
    schemaVersion: FLOOR_SCENE_SCHEMA_VERSION,
    background: null,
    calibration: null,
    settings: {
      wallHeight: 2.4,
      wallThickness: 0.15,
      wallOpacity: STUDIO_PALETTE.wallOpacity,
      floorEdgeVisible: true,
      planViewRotation: 0,
      cameraView: "free",
      cameraTopRotation: 0,
      cameraMode: "perspective",
      cameraFocalLength: 50,
      fixedCameraView: null,
      livePreviewEnabled: true,
      backgroundVisible: true,
      snapEnabled: true,
      snapEndpoints: true,
      snapIntersections: true,
      snapSegments: true,
      snapOrthogonal: true,
      snapAngles: true,
      snapGrid: true,
      snapTolerance: 13
    },
    walls: [],
    windows: [],
    doors: [],
    railings: [],
    areas: [],
    lightGroups: [
      {
        id: "light-group-default",
        name: "默认灯组",
        enabled: true,
        areaId: null
      }
    ],
    items: []
  };
}
