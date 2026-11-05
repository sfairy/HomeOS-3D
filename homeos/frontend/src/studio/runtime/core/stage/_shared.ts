import { windowModels } from '@app/3d-studio/plan/window/window-models'

export const postHostMessage = (hostMessage: any) =>
  window.parent.postMessage(
    {
      channel: 'hb-i3d-v1',
      ...hostMessage,
    },
    location.origin,
  )

export const createStageElement = (elementTagName: any, elementClassName = '', elementTextContent = '') => {
  const createdElement = document.createElement(elementTagName)
  return (
    (createdElement.className = elementClassName || ''),
    elementTextContent && (createdElement.textContent = elementTextContent),
    createdElement
  )
}

export const lampIconSvgMarkup =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 15c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7l-1 3H9l-1-3Z"/><path d="M9 21h6M9 15h6"/></svg>',
  lightPresetEntries = [
    {
      label: '柔和',
      brightness: 25,
      temperaturePercent: 10,
    },
    {
      label: '日常',
      brightness: 60,
      temperaturePercent: 50,
    },
    {
      label: '明亮',
      brightness: 100,
      temperaturePercent: 100,
    },
  ]
/** 普通按钮的图标尺寸：按固定的「图标 / 按钮」比例（见 @app/bridge/button-icon-size），让按钮放大时图标跟着放大，又不会顶到圆形描边。 */
export function resolveMarkerIconSize(markerItem: any, markerSize: any, isVacuumDevice: any, buttonIconSize: any) {
  const rawIconSize = Number.isFinite(markerItem.iconSize) && markerItem.iconSize > 0 ? markerItem.iconSize : 0,
    usesIconSizeAsFont =
      isVacuumDevice ||
      markerItem.deviceKind === 'temperature-humidity' ||
      ['lock', 'camera', 'presence'].includes(markerItem.deviceKind)

  if (rawIconSize > 0 && usesIconSizeAsFont) return rawIconSize
  if (markerItem.deviceKind === 'temperature-humidity') {
    return Math.min(markerSize, Math.max(4, markerSize - 18))
  }
  return buttonIconSize(markerSize)
}

export { configuredModuleKinds } from '../../navigation/navigation-defaults'

export function createStageModelIndex(mountOptions: any) {
  let indexedDocument: any,
    indexedModelRoot: any,
    indexedSceneRevision: any,
    indexedEnvironmentRevision: any,
    indexedFloors: any,
    indexedFloorCount: any,
    floorsById = new Map()
  function floorEntryFor(floorId: any) {
    const document2 = mountOptions.document,
      floors = document2?.floors || []
    if (
      indexedDocument !== document2 ||
      indexedModelRoot !== mountOptions.modelRoot ||
      indexedSceneRevision !== mountOptions.sceneRevision ||
      indexedEnvironmentRevision !== mountOptions.environmentRevision ||
      indexedFloors !== floors ||
      indexedFloorCount !== floors.length
    ) {
      ;(indexedDocument = document2),
        (indexedModelRoot = mountOptions.modelRoot),
        (indexedSceneRevision = mountOptions.sceneRevision),
        (indexedEnvironmentRevision = mountOptions.environmentRevision),
        (indexedFloors = floors),
        (indexedFloorCount = floors.length),
        (floorsById = new Map())
      for (const floorRecord of floors)
        floorsById.has(floorRecord.id) || floorsById.set(floorRecord.id, { floor: floorRecord })
    }
    return floorsById.get(floorId)
  }
  return {
    item(floorId: any, modelId: any, modelTypes: any = undefined) {
      const floorEntry = floorEntryFor(floorId)
      if (!floorEntry) return
      const items = floorEntry.floor.scene?.items || []
      if (floorEntry.items !== items || floorEntry.count !== items.length) {
        ;(floorEntry.items = items), (floorEntry.count = items.length), (floorEntry.byId = new Map())
        for (const floorItem of items) {
          const itemId = floorItem.id
          floorEntry.byId.has(itemId) || floorEntry.byId.set(itemId, []), floorEntry.byId.get(itemId).push(floorItem)
        }
      }
      return floorEntry.byId
        .get(modelId)
        ?.find(
          (candidateItem: any) =>
            modelTypes === undefined ||
            (Array.isArray(modelTypes) ? modelTypes.includes(candidateItem.type) : candidateItem.type === modelTypes),
        )
    },
    /**
     * 窗扇模型：和 `.item()` 分开是因为窗扇不是 `scene.items`，而是由
     * `windowModels()` 从每扇自定义窗的分格树现算出来的。按 `modelId` 建索引，
     * 推开窗器时能带出它的 `legacyModels`（推拉组的历史面板）。
     */
    window(floorId: any, modelId: any) {
      const floorEntry = floorEntryFor(floorId)
      if (!floorEntry) return
      const windowRecords = floorEntry.floor.scene?.windows || floorEntry.floor.windowSashes,
        walls = floorEntry.floor.scene?.walls
      ;(!floorEntry.windowIndex ||
        floorEntry.windowRecords !== windowRecords ||
        floorEntry.windowCount !== windowRecords?.length ||
        floorEntry.walls !== walls ||
        floorEntry.wallCount !== walls?.length) &&
        ((floorEntry.windowRecords = windowRecords),
        (floorEntry.windowCount = windowRecords?.length),
        (floorEntry.walls = walls),
        (floorEntry.wallCount = walls?.length),
        (floorEntry.windowIndex = new Map(
          windowModels(floorEntry.floor, { includeLegacy: true }).map((windowModel: any) => [
            windowModel.modelId,
            windowModel,
          ]),
        )))
      return floorEntry.windowIndex.get(modelId)
    },
    invalidate() {
      ;(indexedDocument =
        indexedModelRoot =
        indexedSceneRevision =
        indexedEnvironmentRevision =
        indexedFloors =
        indexedFloorCount =
          undefined),
        floorsById.clear()
    },
  }
}

export function coverGeometryOverrides(
  coverModelSource: any,
  coverOverrides: {
    curtainFabricOverride?: boolean
    curtainFabric?: string
    coverKindOverride?: boolean
    coverKind?: string
    unboundPosition?: number
  } = {},
) {
  return {
    curtainWidth: Number(coverModelSource?.width) || 1.8,
    curtainPosition: coverModelSource?.curtainPosition || 'split',
    curtainTrack: coverModelSource?.curtainTrack || 'straight',
    curtainCorner: coverModelSource?.curtainCorner,
    curtainLeftLength: coverModelSource?.curtainLeftLength,
    curtainRightLength: coverModelSource?.curtainRightLength,
    curtainMeet: coverModelSource?.curtainMeet,
    curtainFabric:
      coverOverrides.curtainFabricOverride === true
        ? coverOverrides.curtainFabric === 'sheer'
          ? 'sheer'
          : 'cloth'
        : coverModelSource?.curtainFabric || coverOverrides.curtainFabric || 'cloth',
    coverKind:
      coverOverrides.coverKindOverride === true
        ? ['dream', 'roller'].includes(coverOverrides.coverKind!)
          ? coverOverrides.coverKind
          : 'standard'
        : coverModelSource?.curtainForm === 'roller'
          ? 'roller'
          : ['dream', 'roller'].includes(coverOverrides.coverKind!)
            ? coverOverrides.coverKind
            : 'standard',
    unboundPosition: Number.isFinite(coverOverrides.unboundPosition)
      ? coverOverrides.unboundPosition
      : Number(coverModelSource?.curtainPreview) || 0,
  }
}

export function expandGroupMembers(groupEntryList: any) {
  return groupEntryList.flatMap((groupEntry: any) =>
    groupEntry.isCurtainGroup
      ? groupEntry.memberItems.map((groupMemberEntry: any) => ({
          ...groupMemberEntry,
          id: groupEntry.id + ':member:' + groupMemberEntry.id,
          entryId: groupEntry.id,
          visible: groupEntry.visible,
          buttonHidden: groupEntry.buttonHidden,
          hiddenClickable: groupEntry.hiddenClickable,
        }))
      : [groupEntry],
  )
}

export function isSameCameraPose(cameraPoseA: any, cameraPoseB: any) {
  return (
    cameraPoseA.mode === cameraPoseB.mode &&
    Math.abs(cameraPoseA.zoom - cameraPoseB.zoom) < 0.000001 &&
    ['position', 'target', 'up'].every((poseVectorFieldKey) =>
      (cameraPoseA[poseVectorFieldKey] || [0, 1, 0]).every(
        (poseComponentValue: any, poseComponentIndex: any) =>
          Math.abs(poseComponentValue - (cameraPoseB[poseVectorFieldKey] || [0, 1, 0])[poseComponentIndex]) < 0.000001,
      ),
    ) &&
    ['frameSize', 'focalLength'].every(
      (poseScalarFieldKey) =>
        Math.abs((cameraPoseA[poseScalarFieldKey] || 0) - (cameraPoseB[poseScalarFieldKey] || 0)) < 0.000001,
    )
  )
}
