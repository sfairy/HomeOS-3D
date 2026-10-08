import { floorNavigationChoices } from "../floor-navigation";
import { doorModels } from "../../security/lock-state";
import { genericDeviceMetadata } from "../../device/device-profiles";

export function buildMetadata(
  mountOptions: any,
  transformFloorCamera: (pose: any, floorSelectionId?: any, isImmediate?: boolean) => any,
  floorSelection: any,
) {
  const floorElevationByFloorId = new Map(
    floorNavigationChoices(mountOptions.document.floors)
      .filter(([buildMetadataFloorChoiceId]) => buildMetadataFloorChoiceId !== "all")
      .map(([floorId, floorNumberLabel]) => [
        floorId,
        floorNumberLabel.startsWith("B")
          ? -Number(floorNumberLabel.slice(1))
          : Number(floorNumberLabel.slice(0, -1)),
      ]),
  );
  return (
    mountOptions.regionLighting?.sync?.(mountOptions.camera),
    {
      floorGap: mountOptions.document.previewFloorGap,
      uniformOverviewStack: mountOptions.document.uniformOverviewStack === true,
      appearanceCapabilities: {
        detailedLighting: (mountOptions.regionLighting?.stats?.detailedMaterials || 0) > 0,
      },
      camera: transformFloorCamera(
        mountOptions.cameraState(),
        floorSelection || mountOptions.document.activeFloorId,
        true,
      ),
      baseLighting: mountOptions.document.baseLighting,
      defaults: mountOptions.defaults,
      floors: mountOptions.document.floors.map((metadataFloorItem: any) => {
        const wallHeightSetting = metadataFloorItem.scene.settings?.wallHeight,
          filteredWallHeights = metadataFloorItem.scene.walls
            .map((wallHeightItem: any) => wallHeightItem.height)
            .filter((wallHeightValue: any) => Number.isFinite(wallHeightValue) && wallHeightValue > 0),
          resolvedWallHeight = Math.max(
            0.01,
            Math.min(
              6,
              Number.isFinite(wallHeightSetting) && wallHeightSetting > 0
                ? wallHeightSetting
                : Math.max(0, ...filteredWallHeights) || 2.8,
            ),
          ),
          doorModelEntries = doorModels(metadataFloorItem).map((doorModel: any) => ({
            id: doorModel.modelId,
            name: doorModel.name,
            doorType: doorModel.doorType,
            doorLabel: doorModel.doorLabel,
          }));
        return {
          id: metadataFloorItem.id,
          name: metadataFloorItem.name,
          elevation: metadataFloorItem.elevation,
          number: floorElevationByFloorId.get(metadataFloorItem.id),
          wallHeight: resolvedWallHeight,
          doors: doorModelEntries,
          entryDoors: doorModelEntries,
          plan: {
            pixelsPerMeter: metadataFloorItem.scene.calibration?.pixelsPerMeter || 1,
            walls: metadataFloorItem.scene.walls.map((planWallItem: any) => ({
              start: planWallItem.start,
              end: planWallItem.end,
              thickness: planWallItem.thickness,
            })),
            items: metadataFloorItem.scene.items.map(
              ({
                id: planItemId,
                type: planItemType,
                name: planItemName,
                x: planItemX,
                y: planItemY,
                width: planItemWidth,
                depth: planItemDepth,
                rotation: planItemRotation,
                color: planItemColor,
              }: any) => ({
                id: planItemId,
                type: planItemType,
                name: planItemName,
                x: planItemX,
                y: planItemY,
                width: planItemWidth,
                depth: planItemDepth,
                rotation: planItemRotation,
                color: planItemColor,
              }),
            ),
          },
          cameras: metadataFloorItem.scene.items
            .filter((cameraSceneItem: any) => cameraSceneItem.type === "camera")
            .map((cameraMetadataItem: any, cameraMetadataIndex: any) => ({
              id: cameraMetadataItem.id,
              name: cameraMetadataItem.name || "摄像头 " + (cameraMetadataIndex + 1),
              x: cameraMetadataItem.x,
              y: cameraMetadataItem.y,
              height:
                (Number(cameraMetadataItem.elevation) || 0) +
                (Number(cameraMetadataItem.height) || 0.3) / 2,
            })),
          presenceSensors: metadataFloorItem.scene.items
            .filter((sensorSceneItem: any) => sensorSceneItem.type === "presence")
            .map((sensorMetadataItem: any, sensorMetadataIndex: any) => ({
              id: sensorMetadataItem.id,
              name: sensorMetadataItem.name || "人体传感器 " + (sensorMetadataIndex + 1),
            })),
          vacuums: metadataFloorItem.scene.items
            .filter(
              (buildMetadataVacuumSceneItem: any) =>
                buildMetadataVacuumSceneItem.type === "robotvacuum",
            )
            .map((vacuumMetadataItem: any, vacuumMetadataIndex: any) => ({
              id: vacuumMetadataItem.id,
              name: vacuumMetadataItem.name || "扫地机 " + (vacuumMetadataIndex + 1),
              x: vacuumMetadataItem.x,
              y: vacuumMetadataItem.y,
              height:
                (Number(vacuumMetadataItem.elevation) || 0) +
                (Number(vacuumMetadataItem.height) || 0.85) / 2,
            })),
          speakers: metadataFloorItem.scene.items
            .filter(
              (buildMetadataSpeakerSceneItem: any) => buildMetadataSpeakerSceneItem.type === "speaker",
            )
            .map((speakerMetadataItem: any, speakerMetadataIndex: any) => ({
              id: speakerMetadataItem.id,
              name: speakerMetadataItem.name || "智能音响 " + (speakerMetadataIndex + 1),
              type: speakerMetadataItem.type,
              x: speakerMetadataItem.x,
              y: speakerMetadataItem.y,
              height:
                (Number(speakerMetadataItem.elevation) || 0) +
                (Number(speakerMetadataItem.height) || 0.2336) / 2,
            })),
          televisions: metadataFloorItem.scene.items
            .filter(
              (buildMetadataTelevisionSceneItem: any) =>
                buildMetadataTelevisionSceneItem.type === "tv",
            )
            .map((televisionMetadataItem: any, televisionMetadataIndex: any) => ({
              id: televisionMetadataItem.id,
              name: televisionMetadataItem.name || "电视 " + (televisionMetadataIndex + 1),
              type: televisionMetadataItem.type,
              x: televisionMetadataItem.x,
              y: televisionMetadataItem.y,
              height:
                (Number(televisionMetadataItem.elevation) || 0) +
                (Number(televisionMetadataItem.height) || 0.92) * 0.62,
            })),
          ...genericDeviceMetadata(metadataFloorItem.scene.items),
          nas: metadataFloorItem.scene.items
            .filter((buildMetadataNasSceneItem: any) => buildMetadataNasSceneItem.type === "nas")
            .map((nasMetadataItem: any, nasMetadataIndex: any) => ({
              id: nasMetadataItem.id,
              name: nasMetadataItem.name || "NAS " + (nasMetadataIndex + 1),
              type: nasMetadataItem.type,
              x: nasMetadataItem.x,
              y: nasMetadataItem.y,
              height:
                (Number(nasMetadataItem.elevation) || 0) +
                (Number(nasMetadataItem.height) || 0.34) / 2,
            })),
          curtains: metadataFloorItem.scene.items
            .filter((curtainSceneItem: any) => curtainSceneItem.type === "curtain")
            .map((curtainMetadataItem: any, curtainMetadataIndex: any) => ({
              id: curtainMetadataItem.id,
              name: curtainMetadataItem.name || "窗帘 " + (curtainMetadataIndex + 1),
              type: curtainMetadataItem.type,
              x: curtainMetadataItem.x,
              y: curtainMetadataItem.y,
              height:
                (Number(curtainMetadataItem.elevation) || 0) +
                (Number(curtainMetadataItem.height) || 2.4) / 2,
              curtainPosition: curtainMetadataItem.curtainPosition || "split",
              curtainTrack: curtainMetadataItem.curtainTrack || "straight",
              curtainForm: curtainMetadataItem.curtainForm === "roller" ? "roller" : "standard",
              curtainFabric: curtainMetadataItem.curtainFabric,
            })),
          waterHeaters: metadataFloorItem.scene.items
            .filter((waterHeaterSceneItem: any) =>
              ["storagewaterheater", "gaswaterheater"].includes(waterHeaterSceneItem.type),
            )
            .map((waterHeaterMetadataItem: any, waterHeaterMetadataIndex: any) => ({
              ...waterHeaterMetadataItem,
              name: waterHeaterMetadataItem.name || "热水器 " + (waterHeaterMetadataIndex + 1),
            })),
          airers: metadataFloorItem.scene.items
            .filter((airerSceneItem: any) => airerSceneItem.type === "airer")
            .map((airerMetadataItem: any, airerMetadataIndex: any) => ({
              ...airerMetadataItem,
              height:
                (Number(airerMetadataItem.elevation) || 2.7) -
                (Number(airerMetadataItem.airerExtension) || 1.2) / 2,
              name: airerMetadataItem.name || "晾衣架 " + (airerMetadataIndex + 1),
            })),
          fans: metadataFloorItem.scene.items
            .filter((fanSceneItem: any) => fanSceneItem.type === "fan")
            .map((fanMetadataItem: any, fanMetadataIndex: any) => ({
              ...fanMetadataItem,
              name: fanMetadataItem.name || "电风扇 " + (fanMetadataIndex + 1),
            })),
          airPurifiers: metadataFloorItem.scene.items
            .filter((purifierSceneItem: any) => purifierSceneItem.type === "airpurifier")
            .map((purifierMetadataItem: any, purifierMetadataIndex: any) => ({
              ...purifierMetadataItem,
              name: purifierMetadataItem.name || "空气净化器 " + (purifierMetadataIndex + 1),
            })),
          airConditioners: metadataFloorItem.scene.items
            .filter((airConditionerSceneItem: any) =>
              ["wallac", "floorac", "airoutlet"].includes(airConditionerSceneItem.type),
            )
            .map((airConditionerMetadataItem: any, airConditionerMetadataIndex: any) => ({
              id: airConditionerMetadataItem.id,
              name:
                airConditionerMetadataItem.name ||
                (airConditionerMetadataItem.type === "airpurifier"
                  ? "空气净化器"
                  : airConditionerMetadataItem.type === "airoutlet"
                    ? "出风口"
                    : airConditionerMetadataItem.type === "wallac"
                      ? "挂机空调"
                      : "柜机空调") +
                " " +
                (airConditionerMetadataIndex + 1),
              type: airConditionerMetadataItem.type,
              x: airConditionerMetadataItem.x,
              y: airConditionerMetadataItem.y,
              height:
                (Number(airConditionerMetadataItem.elevation) || 0) +
                (Number(airConditionerMetadataItem.height) || 0.28) / 2,
            })),
          groups: metadataFloorItem.scene.lightGroups.map((lightGroup: any) => {
            const groupLightItems = metadataFloorItem.scene.items.filter(
                (groupLightSceneItem: any) => groupLightSceneItem.lightGroupId === lightGroup.id,
              ),
              groupAnchorPoints = groupLightItems.length
                ? groupLightItems
                : metadataFloorItem.scene.walls.map((groupWallItem: any) => groupWallItem.start);
            return {
              id: lightGroup.id,
              name: lightGroup.name,
              height: resolvedWallHeight,
              x: groupAnchorPoints.length
                ? groupAnchorPoints.reduce(
                    (accumulatedX: any, xAnchorPoint: any) => accumulatedX + xAnchorPoint.x,
                    0,
                  ) / groupAnchorPoints.length
                : 0,
              y: groupAnchorPoints.length
                ? groupAnchorPoints.reduce(
                    (accumulatedY: any, yAnchorPoint: any) => accumulatedY + yAnchorPoint.y,
                    0,
                  ) / groupAnchorPoints.length
                : 0,
            };
          }),
        };
      }),
    }
  );
}
