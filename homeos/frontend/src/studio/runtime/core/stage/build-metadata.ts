import { floorNavigationChoices } from '../floor-navigation'
import { doorModels } from '../../security/lock-state'
import { genericDeviceMetadata } from '../../device/generic-device-catalog'
import { MEDIA_DEVICE_PROFILES } from '@app/bridge/presets/media-device-profiles'
import { SPEAKER_MODEL_TYPES, speakerModelProfile } from '../../speaker/speaker-models'
import { normalizeModelRemark } from '@app/shared/model-remarks'
import { windowModels } from '@app/shared/scene/window/window-models'
import { heatingPanelStyleOf } from '../../climate/boiler-copy'

/** 本项目的壁挂炉绑定记录长这样（只取归一需要的那三个字段）。 */
type BoilerBindingLike = { floorId?: unknown; deviceId?: unknown; heatingPanelStyle?: unknown }

/** 取出绑定记录数组；脏值（非数组 / 非对象元素）直接滤掉，不让它们参与匹配。 */
function boilerBindingsFrom(
  mountOptions: { document?: { environment?: { heatingBoilers?: unknown } } } | null | undefined,
): BoilerBindingLike[] {
  const boilers = mountOptions?.document?.environment?.heatingBoilers
  if (!Array.isArray(boilers)) return []
  return boilers.filter((entry): entry is BoilerBindingLike => Boolean(entry) && typeof entry === 'object')
}

/**
 * 一条绑定记录是否属于「这个楼层的这台设备」。
 *
 * 主实体还没绑（`deviceId` 为空）时按楼层兜底：用户往往先调面板形态再选实体。
 * item 上没有实体 id 时同理 —— 只按楼层匹配，避免因为一个空字段把配置丢掉。
 */
function bindingMatchesFloor(binding: BoilerBindingLike, floorId: unknown, entityId: string): boolean {
  if (String(binding.floorId || '') !== String(floorId ?? '')) return false
  const boundId = String(binding.deviceId || '')
  return !boundId || !entityId || boundId === entityId
}

/**
 * 壁挂炉的面板形态：item 上显式配了就照它（0.8.9 的 `heatingPanelStyle`），
 * 否则回落到本项目的 `environment.heatingBoilers[]` 绑定记录（按楼层 + 主实体匹配）。
 * 判据与上游一致：只有 `climate` 是空调卡，其余（含缺省）一律温控卡。
 *
 * 为什么放在 metadata 这一层：运行态面板拿到的是 item，配置编辑器写的是 environment，
 * 两者之间必须有一处做归一，否则「配置改了、面板不变」。
 */
function boilerPanelStyleFor(
  mountOptions: { document?: { environment?: { heatingBoilers?: unknown } } } | null | undefined,
  floorId: unknown,
  sceneItem: Record<string, unknown>,
): 'climate' | 'thermostat' {
  const own = sceneItem.heatingPanelStyle
  if (own === 'climate' || own === 'thermostat') return own
  const entityId = String(sceneItem.entityId ?? sceneItem.deviceId ?? '')
  const record = boilerBindingsFrom(mountOptions).find((binding) => bindingMatchesFloor(binding, floorId, entityId))
  return heatingPanelStyleOf(record)
}

export function buildMetadata(
  mountOptions: any,
  transformFloorCamera: (pose: any, floorSelectionId?: any, isImmediate?: boolean) => any,
  floorSelection: any,
) {
  const floorElevationByFloorId = new Map(
    floorNavigationChoices(mountOptions.document.floors)
      .filter(([buildMetadataFloorChoiceId]) => buildMetadataFloorChoiceId !== 'all')
      .map(([floorId, floorNumberLabel]) => [
        floorId,
        floorNumberLabel.startsWith('B') ? -Number(floorNumberLabel.slice(1)) : Number(floorNumberLabel.slice(0, -1)),
      ]),
  )
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
            // 备注是配置期识别模型的依据：舞台元数据里必须带上，否则 3D 交互选不到「哪一个门」。
            remark: normalizeModelRemark(doorModel.remark),
            doorType: doorModel.doorType,
            doorLabel: doorModel.doorLabel,
            // 0.8.1：开合方向随模型进舞台元数据，运行时按铰链侧算旋转方向。
            hinge: doorModel.hinge === 'right' ? 'right' : 'left',
          }))
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
            .filter((cameraSceneItem: any) => cameraSceneItem.type === 'camera')
            .map((cameraMetadataItem: any, cameraMetadataIndex: any) => ({
              id: cameraMetadataItem.id,
              remark: normalizeModelRemark(cameraMetadataItem.remark),
              name: cameraMetadataItem.name || '摄像头 ' + (cameraMetadataIndex + 1),
              x: cameraMetadataItem.x,
              y: cameraMetadataItem.y,
              height: (Number(cameraMetadataItem.elevation) || 0) + (Number(cameraMetadataItem.height) || 0.3) / 2,
            })),
          presenceSensors: metadataFloorItem.scene.items
            .filter((sensorSceneItem: any) => sensorSceneItem.type === 'presence')
            .map((sensorMetadataItem: any, sensorMetadataIndex: any) => ({
              id: sensorMetadataItem.id,
              remark: normalizeModelRemark(sensorMetadataItem.remark),
              name: sensorMetadataItem.name || '人体传感器 ' + (sensorMetadataIndex + 1),
            })),
          vacuums: metadataFloorItem.scene.items
            .filter((buildMetadataVacuumSceneItem: any) => buildMetadataVacuumSceneItem.type === 'robotvacuum')
            .map((vacuumMetadataItem: any, vacuumMetadataIndex: any) => ({
              id: vacuumMetadataItem.id,
              remark: normalizeModelRemark(vacuumMetadataItem.remark),
              name: vacuumMetadataItem.name || '扫地机 ' + (vacuumMetadataIndex + 1),
              x: vacuumMetadataItem.x,
              y: vacuumMetadataItem.y,
              height: (Number(vacuumMetadataItem.elevation) || 0) + (Number(vacuumMetadataItem.height) || 0.85) / 2,
            })),
          speakers: metadataFloorItem.scene.items
            .filter((buildMetadataSpeakerSceneItem: any) =>
              SPEAKER_MODEL_TYPES.includes(buildMetadataSpeakerSceneItem.type),
            )
            .map((speakerMetadataItem: any, speakerMetadataIndex: any) => ({
              id: speakerMetadataItem.id,
              remark: normalizeModelRemark(speakerMetadataItem.remark),
              name:
                speakerMetadataItem.name ||
                `${speakerModelProfile(speakerMetadataItem.type)?.label || '智能音响'} ${speakerMetadataIndex + 1}`,
              type: speakerMetadataItem.type,
              x: speakerMetadataItem.x,
              y: speakerMetadataItem.y,
              height:
                (Number(speakerMetadataItem.elevation) || 0) +
                (Number(speakerMetadataItem.height) ||
                  speakerModelProfile(speakerMetadataItem.type)?.height ||
                  0.2336) /
                  2,
            })),
          ...Object.fromEntries(
            Object.values(MEDIA_DEVICE_PROFILES).map((mediaProfile) => [
              mediaProfile.collection,
              metadataFloorItem.scene.items
                .filter((mediaSceneItem: any) => mediaSceneItem.type === mediaProfile.modelType)
                .map((mediaMetadataItem: any, mediaMetadataIndex: number) => ({
                  id: mediaMetadataItem.id,
                  remark: normalizeModelRemark(mediaMetadataItem.remark),
                  name: mediaMetadataItem.name || mediaProfile.label + ' ' + (mediaMetadataIndex + 1),
                  type: mediaMetadataItem.type,
                  x: mediaMetadataItem.x,
                  y: mediaMetadataItem.y,
                  height:
                    (Number(mediaMetadataItem.elevation) || 0) +
                    (Number(mediaMetadataItem.height) || mediaProfile.height) * mediaProfile.markerHeight,
                })),
            ]),
          ),
          ...genericDeviceMetadata(metadataFloorItem.scene.items),
          nas: metadataFloorItem.scene.items
            .filter((buildMetadataNasSceneItem: any) => buildMetadataNasSceneItem.type === 'nas')
            .map((nasMetadataItem: any, nasMetadataIndex: any) => ({
              id: nasMetadataItem.id,
              remark: normalizeModelRemark(nasMetadataItem.remark),
              name: nasMetadataItem.name || 'NAS ' + (nasMetadataIndex + 1),
              type: nasMetadataItem.type,
              x: nasMetadataItem.x,
              y: nasMetadataItem.y,
              height: (Number(nasMetadataItem.elevation) || 0) + (Number(nasMetadataItem.height) || 0.34) / 2,
            })),
          curtains: metadataFloorItem.scene.items
            .filter((curtainSceneItem: any) => curtainSceneItem.type === 'curtain')
            .map((curtainMetadataItem: any, curtainMetadataIndex: any) => ({
              id: curtainMetadataItem.id,
              remark: normalizeModelRemark(curtainMetadataItem.remark),
              name: curtainMetadataItem.name || '窗帘 ' + (curtainMetadataIndex + 1),
              type: curtainMetadataItem.type,
              x: curtainMetadataItem.x,
              y: curtainMetadataItem.y,
              height: (Number(curtainMetadataItem.elevation) || 0) + (Number(curtainMetadataItem.height) || 2.4) / 2,
              curtainPosition: curtainMetadataItem.curtainPosition || 'split',
              curtainTrack: curtainMetadataItem.curtainTrack || 'straight',
              curtainForm: curtainMetadataItem.curtainForm === 'roller' ? 'roller' : 'standard',
              curtainFabric: curtainMetadataItem.curtainFabric,
            })),
          waterHeaters: metadataFloorItem.scene.items
            .filter((waterHeaterSceneItem: any) =>
              ['storagewaterheater', 'gaswaterheater'].includes(waterHeaterSceneItem.type),
            )
            .map((waterHeaterMetadataItem: any, waterHeaterMetadataIndex: any) => ({
              ...waterHeaterMetadataItem,
              name: waterHeaterMetadataItem.name || '热水器 ' + (waterHeaterMetadataIndex + 1),
            })),
          airers: metadataFloorItem.scene.items
            .filter((airerSceneItem: any) => airerSceneItem.type === 'airer')
            .map((airerMetadataItem: any, airerMetadataIndex: any) => ({
              ...airerMetadataItem,
              height:
                (Number(airerMetadataItem.elevation) || 2.7) - (Number(airerMetadataItem.airerExtension) || 1.2) / 2,
              name: airerMetadataItem.name || '晾衣架 ' + (airerMetadataIndex + 1),
            })),
          fans: metadataFloorItem.scene.items
            .filter((fanSceneItem: any) => fanSceneItem.type === 'fan' || fanSceneItem.type === 'ceiling-fan')
            .map((fanMetadataItem: any, fanMetadataIndex: any) => ({
              ...fanMetadataItem,
              // 吊扇锚点在机身中心（elevation 向下半个高度）
              ...(fanMetadataItem.type === 'ceiling-fan'
                ? {
                    height:
                      (Number(fanMetadataItem.elevation) || 0) -
                      // 吊扇机身高度默认 0.306（0.8.1），普通风扇仍是 0.28。
                      (Number(fanMetadataItem.height) || 0.306) / 2,
                  }
                : {}),
              name:
                fanMetadataItem.name ||
                (fanMetadataItem.type === 'ceiling-fan' ? '吊扇' : '电风扇') + ' ' + (fanMetadataIndex + 1),
            })),
          /**
           * 排气扇：挂墙设备，锚点与 wallac / floorac 同式 —— `elevation + height / 2`，
           * 不能沿用 fans 的吊扇负偏移。
           */
          exhaustFans: metadataFloorItem.scene.items
            .filter((exhaustSceneItem: any) => exhaustSceneItem.type === 'exhaust-fan')
            .map((exhaustMetadataItem: any, exhaustMetadataIndex: any) => ({
              ...exhaustMetadataItem,
              height: (Number(exhaustMetadataItem.elevation) || 0) + (Number(exhaustMetadataItem.height) || 0.34) / 2,
              name: exhaustMetadataItem.name || '排气扇 ' + (exhaustMetadataIndex + 1),
            })),
          airPurifiers: metadataFloorItem.scene.items
            .filter((purifierSceneItem: any) => purifierSceneItem.type === 'airpurifier')
            .map((purifierMetadataItem: any, purifierMetadataIndex: any) => ({
              ...purifierMetadataItem,
              name: purifierMetadataItem.name || '空气净化器 ' + (purifierMetadataIndex + 1),
            })),
          airConditioners: metadataFloorItem.scene.items
            .filter((airConditionerSceneItem: any) =>
              ['bath-heater', 'wallac', 'floorac', 'airoutlet'].includes(airConditionerSceneItem.type),
            )
            .map((airConditionerMetadataItem: any, airConditionerMetadataIndex: any) => ({
              id: airConditionerMetadataItem.id,
              remark: normalizeModelRemark(airConditionerMetadataItem.remark),
              name:
                airConditionerMetadataItem.name ||
                (airConditionerMetadataItem.type === 'bath-heater'
                  ? '浴霸'
                  : airConditionerMetadataItem.type === 'airoutlet'
                    ? '空调出风口'
                    : airConditionerMetadataItem.type === 'wallac'
                      ? '挂机空调'
                      : '柜机空调') +
                  ' ' +
                  (airConditionerMetadataIndex + 1),
              type: airConditionerMetadataItem.type,
              x: airConditionerMetadataItem.x,
              y: airConditionerMetadataItem.y,
              height:
                (Number(airConditionerMetadataItem.elevation) || 0) +
                (Number(airConditionerMetadataItem.height) || 0.28) / 2,
            })),
          /** 开窗器可绑定的窗扇：与舞台的窗扇索引同一份算法（推拉组按组、平开按扇）。 */
          windowOpeners: windowModels(metadataFloorItem),
          /** 取暖壁挂炉：挂墙设备，锚点与壁挂空调同式。 */
          heatingBoilers: metadataFloorItem.scene.items
            .filter((boilerSceneItem: Record<string, unknown>) => boilerSceneItem.type === 'heating-boiler')
            .map((boilerMetadataItem: Record<string, unknown>, boilerMetadataIndex: number) => ({
              ...boilerMetadataItem,
              // 面板形态配在 `environment.heatingBoilers[]`（本项目的绑定记录），
              // 运行态面板读的是 item 上的同名属性（与 0.8.9 一致），这里做一次楼层归一。
              heatingPanelStyle: boilerPanelStyleFor(mountOptions, metadataFloorItem.id, boilerMetadataItem),
              remark: normalizeModelRemark(boilerMetadataItem.remark),
              name: boilerMetadataItem.name || '取暖壁挂炉 ' + (boilerMetadataIndex + 1),
              height: (Number(boilerMetadataItem.elevation) || 0) + (Number(boilerMetadataItem.height) || 0.76) / 2,
            })),
          groups: metadataFloorItem.scene.lightGroups.map((lightGroup: any) => {
            const groupLightItems = metadataFloorItem.scene.items.filter(
                (groupLightSceneItem: any) => groupLightSceneItem.lightGroupId === lightGroup.id,
              ),
              groupAnchorPoints = groupLightItems.length
                ? groupLightItems
                : metadataFloorItem.scene.walls.map((groupWallItem: any) => groupWallItem.start)
            return {
              id: lightGroup.id,
              name: lightGroup.name,
              height: resolvedWallHeight,
              x: groupAnchorPoints.length
                ? groupAnchorPoints.reduce((accumulatedX: any, xAnchorPoint: any) => accumulatedX + xAnchorPoint.x, 0) /
                  groupAnchorPoints.length
                : 0,
              y: groupAnchorPoints.length
                ? groupAnchorPoints.reduce((accumulatedY: any, yAnchorPoint: any) => accumulatedY + yAnchorPoint.y, 0) /
                  groupAnchorPoints.length
                : 0,
            }
          }),
        }
      }),
    }
  )
}
