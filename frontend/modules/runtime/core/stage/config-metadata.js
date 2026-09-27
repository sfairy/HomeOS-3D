/*
 * 舞台快照序列化。
 */
import {
  withFixedLightEffects,
  withPageAppearancePreset,
  withRegionLightingPreset
} from "../static-helpers.js?v=2609271508";
// 门模型展开的唯一实现在 lock-state.js（舞台收集门锁绑定、门动画找模型共用同一份）：
import { doorModels } from "../../security/lock-state.js?v=2609271508";
// 通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）的集合名。它们与 NAS / 电视 / 扫地机
import { GENERIC_DEVICE_COLLECTIONS } from "../../device/device-profiles.js?v=2609271508";
export function createStageMetadata(ctx) {
  /**
   * 汇总舞台元数据（楼层、墙体高度、各类型模型坐标、灯光分组等）回报宿主。
   */
  function buildMetadata() {
    const floorNumbersById = new Map(
      ctx.floorNavigationChoices(ctx.stageOptions.document.floors)
        .filter(([metadataFloorKey]) => metadataFloorKey !== "all")
        .map(([metadataFloorName, metadataFloorNumberText]) => [
          metadataFloorName,
          metadataFloorNumberText.startsWith("B")
            ? -Number(metadataFloorNumberText.slice(1))
            : Number(metadataFloorNumberText.slice(0, -1))
        ])
    );
    ctx.stageOptions.regionLighting?.sync?.(ctx.stageOptions.camera);
    return {
      floorGap: ctx.stageOptions.document.previewFloorGap,
      uniformOverviewStack: ctx.stageOptions.document.uniformOverviewStack === true,
      appearanceCapabilities: {
        detailedLighting: (ctx.stageOptions.regionLighting?.stats?.detailedMaterials || 0) > 0
      },
      camera: ctx.transformCameraPose(
        ctx.stageOptions.cameraState(),
        ctx.config.floorSelection || ctx.stageOptions.document.activeFloorId,
        true
      ),
      baseLighting: ctx.stageOptions.document.baseLighting,
      defaults: ctx.stageOptions.defaults,
      floors: ctx.stageOptions.document.floors.map(metadataFloor => {
        const configuredWallHeight = metadataFloor.scene.settings?.wallHeight;
        const wallHeights = metadataFloor.scene.walls
          .map(wall => wall.height)
          .filter(wallHeight => Number.isFinite(wallHeight) && wallHeight > 0);
        const resolvedWallHeight = Math.max(
          0.01,
          Math.min(
            6,
            Number.isFinite(configuredWallHeight) && configuredWallHeight > 0
              ? configuredWallHeight
              : Math.max(0, ...wallHeights) || 2.8
          )
        );
        return {
          id: metadataFloor.id,
          name: metadataFloor.name,
          elevation: metadataFloor.elevation,
          number: floorNumbersById.get(metadataFloor.id),
          wallHeight: resolvedWallHeight,
          plan: {
            pixelsPerMeter: metadataFloor.scene.calibration?.pixelsPerMeter || 1,
            walls: metadataFloor.scene.walls.map(metadataWall => ({
              start: metadataWall.start,
              end: metadataWall.end,
              thickness: metadataWall.thickness
            })),
            items: metadataFloor.scene.items.map(
              ({
                id: itemId,
                type: itemType,
                name: itemName,
                x: itemX,
                y: itemY,
                width: itemWidth,
                depth: itemDepth,
                height: itemHeight,
                elevation: itemElevation,
                rotation: itemRotation,
                color: itemColor
              }) => ({
                id: itemId,
                type: itemType,
                name: itemName,
                x: itemX,
                y: itemY,
                width: itemWidth,
                depth: itemDepth,
                // 这两项是**机体原值**（离地高度与机身高度），不是「标记锚点高度」——
                height: itemHeight,
                elevation: itemElevation,
                rotation: itemRotation,
                color: itemColor
              })
            )
          },
          cameras: metadataFloor.scene.items
            .filter(sceneItem => sceneItem.type === "camera")
            .map((cameraSourceItem, cameraIndex) => ({
              id: cameraSourceItem.id,
              name: cameraSourceItem.name || "摄像头 " + (cameraIndex + 1),
              x: cameraSourceItem.x,
              y: cameraSourceItem.y,
              height:
                (Number(cameraSourceItem.elevation) || 0) +
                (Number(cameraSourceItem.height) || 0.3) / 2
            })),
          presenceSensors: metadataFloor.scene.items
            .filter(presenceSourceItem => presenceSourceItem.type === "presence")
            .map((presenceItem, presenceIndex) => ({
              id: presenceItem.id,
              name: presenceItem.name || "人体传感器 " + (presenceIndex + 1)
            })),
          vacuums: metadataFloor.scene.items
            .filter(vacuumSourceItem => vacuumSourceItem.type === "robotvacuum")
            .map((vacuumItem, vacuumIndex) => ({
              id: vacuumItem.id,
              name: vacuumItem.name || "扫地机 " + (vacuumIndex + 1),
              x: vacuumItem.x,
              y: vacuumItem.y,
              height: (Number(vacuumItem.elevation) || 0) + (Number(vacuumItem.height) || 0.85) / 2
            })),
          televisions: metadataFloor.scene.items
            .filter(televisionSourceItem => televisionSourceItem.type === "tv")
            .map((televisionItem, televisionIndex) => ({
              id: televisionItem.id,
              name: televisionItem.name || "电视 " + (televisionIndex + 1),
              type: televisionItem.type,
              x: televisionItem.x,
              y: televisionItem.y,
              height:
                (Number(televisionItem.elevation) || 0) +
                (Number(televisionItem.height) || 0.92) * 0.62
            })),
          nas: metadataFloor.scene.items
            .filter(nasSourceItem => nasSourceItem.type === "nas")
            .map((nasItem, nasIndex) => ({
              id: nasItem.id,
              name: nasItem.name || "NAS " + (nasIndex + 1),
              type: nasItem.type,
              x: nasItem.x,
              y: nasItem.y,
              height: (Number(nasItem.elevation) || 0) + (Number(nasItem.height) || 0.34) / 2
            })),
          curtains: metadataFloor.scene.items
            .filter(curtainSourceItem => curtainSourceItem.type === "curtain")
            .map((curtainItem, curtainIndex) => ({
              id: curtainItem.id,
              name: curtainItem.name || "窗帘 " + (curtainIndex + 1),
              type: curtainItem.type,
              x: curtainItem.x,
              y: curtainItem.y,
              height:
                (Number(curtainItem.elevation) || 0) + (Number(curtainItem.height) || 2.4) / 2,
              curtainPosition: curtainItem.curtainPosition || "split",
              curtainTrack: curtainItem.curtainTrack || "straight",
              // 帘型（standard 普通窗帘 / roller 卷帘 / dream 梦幻帘）默认取户型模型的形态，
              curtainForm: curtainItem.curtainForm,
              curtainFabric: curtainItem.curtainFabric
            })),
          airConditioners: metadataFloor.scene.items
            .filter(airConditionerSourceItem =>
              ["wallac", "floorac", "airoutlet"].includes(airConditionerSourceItem.type)
            )
            .map((airConditionerItem, airConditionerIndex) => ({
              id: airConditionerItem.id,
              name:
                airConditionerItem.name ||
                (airConditionerItem.type === "airoutlet"
                  ? "出风口"
                  : airConditionerItem.type === "wallac"
                    ? "挂机空调"
                    : "柜机空调") +
                  " " +
                  (airConditionerIndex + 1),
              type: airConditionerItem.type,
              x: airConditionerItem.x,
              y: airConditionerItem.y,
              height:
                (Number(airConditionerItem.elevation) || 0) +
                (Number(airConditionerItem.height) || 0.28) / 2
            })),
          groups: metadataFloor.scene.lightGroups.map(lightGroup => {
            const groupItems = metadataFloor.scene.items.filter(
              groupItem => groupItem.lightGroupId === lightGroup.id
            );
            const groupPoints = groupItems.length
              ? groupItems
              : metadataFloor.scene.walls.map(groupWall => groupWall.start);
            return {
              id: lightGroup.id,
              name: lightGroup.name,
              height: resolvedWallHeight,
              x: groupPoints.length
                ? groupPoints.reduce((sumX, pointX) => sumX + pointX.x, 0) / groupPoints.length
                : 0,
              y: groupPoints.length
                ? groupPoints.reduce((sumY, pointY) => sumY + pointY.y, 0) / groupPoints.length
                : 0
            };
          }),
          // 门模型：门锁编辑器要靠它列出「这层有哪些门可以配锁」。门只存在于 scene.doors 里
          doors: doorModels(metadataFloor)
        };
      })
    };
  }

  /**
   * 归一化宿主下发的配置：深拷贝，并把所有相机姿态转换到当前楼层坐标系。
   */
  function normalizeSceneConfig(sourceConfig) {
    const normalizedConfig = withRegionLightingPreset(
      withPageAppearancePreset(structuredClone(sourceConfig))
    );
    normalizedConfig.camera = ctx.transformCameraPose(
      normalizedConfig.floorCameras?.[normalizedConfig.floorSelection] || normalizedConfig.camera,
      normalizedConfig.floorSelection
    );
    // 灯光项一律套上固定效果区间：区间/默认值不再随实体能力漂移，只影响「能调到哪」，
    normalizedConfig.lights = (normalizedConfig.lights || []).map(lightItem => ({
      ...withFixedLightEffects(lightItem),
      ...(lightItem.focusCamera
        ? {
            focusCamera: ctx.transformCameraPose(lightItem.focusCamera, normalizedConfig.floorSelection)
          }
        : {})
    }));
    if (normalizedConfig.security?.cameras) {
      normalizedConfig.security.cameras = (normalizedConfig.security.cameras || []).map(
        cameraConfigItem => ({
          ...cameraConfigItem,
          ...(cameraConfigItem.focusCamera
            ? {
                focusCamera: ctx.transformCameraPose(
                  cameraConfigItem.focusCamera,
                  normalizedConfig.floorSelection
                )
              }
            : {})
        })
      );
    }
    if (normalizedConfig.security?.presenceSensors) {
      normalizedConfig.security.presenceSensors = normalizedConfig.security.presenceSensors.map(
        sensorItem => ({
          ...sensorItem,
          ...(sensorItem.focusCamera
            ? {
                focusCamera: ctx.transformCameraPose(
                  sensorItem.focusCamera,
                  normalizedConfig.floorSelection
                )
              }
            : {})
        })
      );
    }
    if (normalizedConfig.environment) {
      // curtainGroups 的 focusCamera 与 curtains 同一口径，也要跟着楼层坐标系变换；
      for (const environmentKey of [
        "airConditioners",
        "airPurifiers",
        "curtains",
        "curtainGroups",
        "temperatureHumidity"
      ]) {
        normalizedConfig.environment[environmentKey] = (
          normalizedConfig.environment[environmentKey] || []
        ).map(environmentItem => ({
          ...environmentItem,
          ...(environmentItem.focusCamera
            ? {
                focusCamera: ctx.transformCameraPose(
                  environmentItem.focusCamera,
                  normalizedConfig.floorSelection
                )
              }
            : {})
        }));
      }
    }
    // 六个通用设备品类（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）与上面三类同住 devices：
    for (const deviceKey of [
      "nas",
      "televisions",
      "vacuums",
      ...GENERIC_DEVICE_COLLECTIONS
    ]) {
      if (normalizedConfig.devices?.[deviceKey]) {
        normalizedConfig.devices[deviceKey] = normalizedConfig.devices[deviceKey].map(
          deviceItem => ({
            ...deviceItem,
            ...(deviceItem.focusCamera
              ? {
                  focusCamera: ctx.transformCameraPose(
                    deviceItem.focusCamera,
                    normalizedConfig.floorSelection
                  )
                }
              : {})
          })
        );
      }
    }
    if (normalizedConfig.devices?.vacuums) {
      for (const configuredVacuumItem of normalizedConfig.devices.vacuums) {
        configuredVacuumItem.followCamera &&= ctx.transformCameraPose(
          configuredVacuumItem.followCamera,
          normalizedConfig.floorSelection
        );
      }
    }
    return normalizedConfig;
  }
  return { buildMetadata, normalizeSceneConfig };
}
