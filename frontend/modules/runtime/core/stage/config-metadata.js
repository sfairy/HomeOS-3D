/*
 * 舞台快照序列化。
 *
 * 把当前配置与运行时状态摊平成宿主可读的快照；以及把宿主下发的配置归一到当前楼层坐标系。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
 */
// 分页观感与固定灯光效果两组预设：宿主下发的旧草稿里存的是历史值，这里统一按当前预设归一，
// 保证「新老草稿」在舞台上呈现一致（这正是「观感收敛」的落点）。见各模块头部的沿革说明。
import {
  withFixedLightEffects,
  withPageAppearancePreset,
  withRegionLightingPreset
} from "../static-helpers.js?v=2609260900";
// 门模型展开的唯一实现在 lock-state.js（舞台收集门锁绑定、门动画找模型共用同一份）：
// 这份快照多带一个 doors 清单给门锁编辑器，靠的就是它，别在这里另写一套门 → 坐标的口径。
import { doorModels } from "../../security/lock-state.js?v=2609260900";
export function createStageMetadata(ctx) {
  /**
   * 汇总舞台元数据（楼层、墙体高度、各类型模型坐标、灯光分组等）回报宿主。
   * 编辑器 / 展示页靠它做下拉选项与坐标换算，即「从场景文档反推可编辑信息」，
   * 字段一律 camelCase。墙体高度优先取场景设置，缺失时取所有墙的最大值，再夹到 0.01~6 米。
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
          // （工作室导出的门模型，或画在墙上的户型门 —— 后者还要按 wallId + t 插值出平面坐标），
          // 而把这批门展开成「与 3D 模型一一对应、带 modelId 与平面坐标」的正是 lock-state.js 的
          // doorModels：舞台收集门锁绑定、门动画找模型都走它。这里只把同一份结果透传给宿主，
          // 绝不在快照里另算一遍坐标口径（两套算法一旦漂移，就是「编辑器里选得到、舞台上找不到」）。
          doors: doorModels(metadataFloor.scene)
        };
      })
    };
  }

  /**
   * 归一化宿主下发的配置：深拷贝，并把所有相机姿态转换到当前楼层坐标系。
   * 相机字段分散在 lights / security.cameras / security.presenceSensors / environment.* /
   * devices.*，都可能 undefined 故逐个可选补齐；只补坐标、不新增配置项，结构原样透传。
   */
  function normalizeSceneConfig(sourceConfig) {
    // 轻量柔光（region）下用固定光照参数整体覆盖 baseLighting（见 region-lighting-presets.js）：
    // region 的逐区域布光只在固定参数下成立，非 region 时该函数原样返回、不写入 baseLighting。
    const normalizedConfig = withRegionLightingPreset(
      withPageAppearancePreset(structuredClone(sourceConfig))
    );
    normalizedConfig.camera = ctx.transformCameraPose(
      normalizedConfig.floorCameras?.[normalizedConfig.floorSelection] || normalizedConfig.camera,
      normalizedConfig.floorSelection
    );
    // 灯光项一律套上固定效果区间：区间/默认值不再随实体能力漂移，只影响「能调到哪」，
    // 不改实体上报的状态本身（映射逻辑见 static/bridge/light-motion.js）。
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
      // 它的其余字段（memberIds / panelLayout 等）原样保留。
      // airPurifiers 与空调同一口径：净化器的 focusCamera 也要跟着楼层坐标系变换，
      // 漏一个键的后果是「换楼层后净化器聚焦视角还停在旧坐标系」。
      for (const environmentKey of [
        "airConditioners",
        "airPurifiers",
        "curtains",
        "curtainGroups"
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
    for (const deviceKey of ["nas", "televisions", "vacuums"]) {
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
