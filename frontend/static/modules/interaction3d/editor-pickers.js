import {
  EDITOR_PICKER_PAGE_SIZES,
  editorEntityPickerInitialPage,
  editorEntityPickerPage
} from "../../editor-picker-pagination.js?v=20260916013557";
import { createEditorPickerQueries } from "../../editor-picker-queries.js?v=20260916013557";
import { vacuumProfiles } from "./vacuum-catalog.js";
import { nasProfiles } from "./nas-catalog.js";
const DEFAULT_LIGHT_ICON = "mdi:lightbulb-outline";
const isValidIconId = iconId =>
  typeof iconId == "string" && /^mdi:[a-z0-9][a-z0-9-]{0,119}$/.test(iconId);
export function presenceDeviceProfiles(entities = [], devices = [], lookupState = () => null) {
  const devicesById = new Map();
  for (const entityEntry of entities) {
    if (
      entityEntry.disabledBy != null ||
      entityEntry.disabled_by != null ||
      entityEntry.enabled === false ||
      ["missing", "disabled"].includes(entityEntry.status) ||
      !/^(binary_sensor|event)\.[a-z0-9_]+$/.test(entityEntry.entityId || "")
    ) {
      continue;
    }
    const deviceClass =
      entityEntry.deviceClass ||
      entityEntry.device_class ||
      entityEntry.attributes?.device_class ||
      lookupState(entityEntry.entityId)?.attributes?.device_class;
    if (
      (deviceClass && !["occupancy", "presence", "motion"].includes(deviceClass)) ||
      (!deviceClass &&
        !/occupancy|presence|motion|(?:^|_)pir(?:_|$)|有人|无人|移动检测|运动检测|人体检测/i.test(
          entityEntry.entityId + " " + (entityEntry.name || "")
        )) ||
      ["diagnostic", "config"].includes(entityEntry.entityCategory || entityEntry.entity_category)
    ) {
      continue;
    }
    const deviceId = entityEntry.deviceId || entityEntry.device_id;
    if (!deviceId) {
      continue;
    }
    const registryDevice = devices.find(
      candidateDevice => (candidateDevice.id || candidateDevice.deviceId) === deviceId
    );
    if (registryDevice?.disabledBy == null && registryDevice?.disabled_by == null) {
      if (!devicesById.has(deviceId)) {
        devicesById.set(deviceId, {
          deviceId: deviceId,
          name:
            registryDevice?.nameByUser ||
            registryDevice?.name_by_user ||
            registryDevice?.name ||
            entityEntry.name ||
            deviceId,
          entities: []
        });
      }
      devicesById.get(deviceId).entities.push({
        entityId: entityEntry.entityId,
        name: entityEntry.name || entityEntry.entityId,
        rank:
          deviceClass === "occupancy" || deviceClass === "presence"
            ? 0
            : deviceClass === "motion"
              ? 1
              : 2
      });
    }
  }
  return [...devicesById.values()].map(profile => ({
    ...profile,
    entities: profile.entities.sort(
      (leftEntity, rightEntity) =>
        leftEntity.rank - rightEntity.rank ||
        leftEntity.entityId.localeCompare(rightEntity.entityId)
    )
  }));
}
export function createInteraction3dEditorPickers({
  openPicker: openPicker,
  fetchIcons: fetchIcons,
  getEntities: getEntities,
  getState: getState = () => null,
  ensureEntities: ensureEntities,
  entityPickerText: entityPickerText,
  elements: elements,
  deviceKind: deviceKind = "light",
  fetchAreas: fetchAreas = async () => {
    const areasResponse = await fetch("/api/v1/ha/areas");
    if (!areasResponse.ok) {
      throw new Error("房间目录暂时不可用");
    }
    return (await areasResponse.json()).items || [];
  },
  fetchDevices: fetchDevices = async () => {
    const devicesResponse = await fetch("/api/v1/ha/devices");
    if (!devicesResponse.ok) {
      throw new Error("设备目录暂时不可用，请稍后重试。");
    }
    return (await devicesResponse.json()).items || [];
  }
}) {
  async function loadDeviceProfiles() {
    const [deviceRecords, areaRecords] = await Promise.all([
      fetchDevices(),
      fetchAreas().catch(() => null)
    ]);
    const areaNamesById = new Map(
      (areaRecords || []).map(areaRecord => [areaRecord.areaId || areaRecord.id, areaRecord.name])
    );
    const platformsByDeviceId = new Map();
    for (const entityRecord of getEntities()) {
      const entityDeviceId = entityRecord.deviceId || entityRecord.device_id;
      if (!!entityDeviceId && !!entityRecord.platform) {
        if (!platformsByDeviceId.has(entityDeviceId)) {
          platformsByDeviceId.set(entityDeviceId, new Set());
        }
        platformsByDeviceId.get(entityDeviceId).add(entityRecord.platform);
      }
    }
    return deviceRecords.map(deviceRecord => ({
      ...deviceRecord,
      integrationName:
        [...(platformsByDeviceId.get(deviceRecord.deviceId || deviceRecord.id) || [])]
          .sort()
          .join("、") || "未知集成",
      roomName:
        areaNamesById.get(deviceRecord.areaId || deviceRecord.area_id) ||
        (deviceRecord.areaId || deviceRecord.area_id ? "房间名称暂不可用" : "未分配房间")
    }));
  }
  function resolveRoomName(targetDevice, targetDeviceList) {
    return (
      targetDeviceList.find(
        roomEntry => (roomEntry.deviceId || roomEntry.id) === targetDevice.deviceId
      )?.roomName || "未分配房间"
    );
  }
  function resolveIntegrationName(integrationDevice, integrationDeviceList) {
    return (
      integrationDeviceList.find(
        integrationEntry =>
          (integrationEntry.deviceId || integrationEntry.id) === integrationDevice.deviceId
      )?.integrationName || "未知集成"
    );
  }
  const formatDeviceDetail = deviceProfile =>
    "房间：" + deviceProfile.roomName + " · 集成：" + deviceProfile.integrationName;
  function createDeviceOption(optionProfile, currentValue, kindLabel = "设备") {
    const optionElement = elements.createEditorEntityPickerOption(optionProfile, currentValue);
    const kindElement = optionElement.querySelector?.(".inspector-entity-kind");
    const idElement = optionElement.querySelector?.(".inspector-entity-id");
    if (kindElement) {
      kindElement.textContent = "[" + kindLabel + "] ";
    }
    if (idElement) {
      idElement.textContent = formatDeviceDetail(optionProfile);
    }
    return optionElement;
  }
  function createCurrentDeviceOption(currentProfile) {
    const currentElement = elements.createEditorPickerCurrentEntity(currentProfile);
    const currentIdElement = currentElement.querySelector?.(
      ".editor-paged-picker-current-entity-id"
    );
    if (currentIdElement && currentProfile) {
      currentIdElement.textContent = formatDeviceDetail(currentProfile);
    }
    return currentElement;
  }
  return {
    presenceEntities(presenceDeviceId) {
      return (
        presenceDeviceProfiles(getEntities(), [], getState).find(
          matchedPresenceProfile => matchedPresenceProfile.deviceId === presenceDeviceId
        )?.entities || []
      );
    },
    async presence({
      trigger: presenceTrigger,
      current: currentPresenceDeviceId = "",
      onSelect: onPresenceSelect
    }) {
      await ensureEntities();
      const presenceDevices = await loadDeviceProfiles();
      if (!presenceTrigger.isConnected) {
        return null;
      }
      const presenceProfiles = presenceDeviceProfiles(getEntities(), presenceDevices, getState);
      const presenceOptions = presenceProfiles.map(presenceProfile => ({
        entityId: presenceProfile.deviceId,
        name: presenceProfile.name,
        roomName: resolveRoomName(presenceProfile, presenceDevices),
        integrationName: resolveIntegrationName(presenceProfile, presenceDevices),
        icon: "mdi:motion-sensor",
        domain: "binary_sensor"
      }));
      return openPicker({
        kind: "entity",
        title: "选择人体传感器设备",
        subtitle: "按设备匹配人在或移动检测实体；多实体可在设备内选择。",
        searchPlaceholder: "搜索设备名称、房间或集成",
        triggerButton: presenceTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "没有找到可用的人体传感器设备；无设备归属的模板实体可手动绑定。",
        getPage: ({ query: query, page: page }) =>
          editorEntityPickerPage(
            presenceOptions.filter(option =>
              (
                option.name +
                " " +
                (option.roomName || "") +
                " " +
                (option.integrationName || "") +
                " " +
                option.entityId
              )
                .toLowerCase()
                .includes(String(query || "").toLowerCase())
            ),
            page,
            null
          ),
        renderSelectedContent: () => [
          createCurrentDeviceOption(
            presenceOptions.find(
              selectedOption => selectedOption.entityId === currentPresenceDeviceId
            )
          )
        ],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不绑定设备", !currentPresenceDeviceId)
        ],
        renderItem: optionItem => createDeviceOption(optionItem, currentPresenceDeviceId),
        onSelect: selectedDeviceId => {
          const selectedPresenceProfile = presenceProfiles.find(
            matchedProfile => matchedProfile.deviceId === selectedDeviceId
          );
          if (!selectedDeviceId || selectedPresenceProfile) {
            onPresenceSelect(
              selectedPresenceProfile ? structuredClone(selectedPresenceProfile) : null
            );
          }
        }
      });
    },
    async vacuum({
      trigger: vacuumTrigger,
      current: currentVacuumDeviceId = "",
      onSelect: onVacuumSelect
    }) {
      await ensureEntities();
      const vacuumDevices = await loadDeviceProfiles();
      if (!vacuumTrigger.isConnected) {
        return null;
      }
      const vacuumDeviceProfiles = vacuumProfiles(getEntities(), vacuumDevices);
      const vacuumOptions = vacuumDeviceProfiles.map(vacuumProfile => ({
        entityId: vacuumProfile.deviceId,
        name: vacuumProfile.name,
        roomName: resolveRoomName(vacuumProfile, vacuumDevices),
        integrationName: resolveIntegrationName(vacuumProfile, vacuumDevices),
        domain: "vacuum",
        icon: "mdi:robot-vacuum"
      }));
      return openPicker({
        kind: "entity",
        title: "选择扫地机设备",
        subtitle: "自动识别主实体、地图和相关状态；支持多台设备独立配置。",
        searchPlaceholder: "搜索设备名称、房间或集成",
        triggerButton: vacuumTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "没有找到扫地机，请先在 Home Assistant 中接入设备并启用 vacuum 实体。",
        getPage: ({ query: vacuumQuery, page: vacuumPage }) =>
          editorEntityPickerPage(
            vacuumOptions.filter(vacuumOption =>
              (
                vacuumOption.name +
                " " +
                (vacuumOption.roomName || "") +
                " " +
                (vacuumOption.integrationName || "") +
                " " +
                vacuumOption.entityId
              )
                .toLowerCase()
                .includes(String(vacuumQuery || "").toLowerCase())
            ),
            vacuumPage,
            null
          ),
        renderSelectedContent: () => [
          createCurrentDeviceOption(
            vacuumOptions.find(
              selectedVacuumOption => selectedVacuumOption.entityId === currentVacuumDeviceId
            )
          )
        ],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不绑定设备", !currentVacuumDeviceId)
        ],
        renderItem: vacuumOptionItem => createDeviceOption(vacuumOptionItem, currentVacuumDeviceId),
        onSelect: selectedVacuumDeviceId => {
          const selectedVacuumDevice = vacuumDeviceProfiles.find(
            matchedVacuumProfile => matchedVacuumProfile.deviceId === selectedVacuumDeviceId
          );
          if (!selectedVacuumDeviceId || selectedVacuumDevice) {
            onVacuumSelect(selectedVacuumDevice ? structuredClone(selectedVacuumDevice) : null);
          }
        }
      });
    },
    async nas({ trigger: nasTrigger, current: currentNasDeviceId = "", onSelect: onNasSelect }) {
      await ensureEntities();
      const nasDevices = await loadDeviceProfiles();
      if (!nasTrigger.isConnected) {
        return null;
      }
      const nasDeviceProfiles = nasProfiles(getEntities(), nasDevices);
      const nasOptions = nasDeviceProfiles.map(nasProfile => ({
        entityId: nasProfile.deviceId,
        name:
          nasProfile.name +
          " · " +
          (nasProfile.metrics.length ? nasProfile.metrics.length + " 项状态" : "暂无状态指标"),
        roomName: resolveRoomName(nasProfile, nasDevices),
        integrationName: resolveIntegrationName(nasProfile, nasDevices),
        domain: "sensor",
        icon: "mdi:nas"
      }));
      return openPicker({
        kind: "entity",
        title: "选择 NAS 数据来源",
        subtitle: "选择整台 NAS，自动匹配它的状态实体。",
        searchPlaceholder: "搜索 NAS 名称、房间或集成",
        triggerButton: nasTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText:
          "未找到飞牛或群晖设备。请确认 Home Assistant 已接入对应集成，并在 HomeOS 同步设备目录。",
        getPage: ({ query: nasQuery, page: nasPage }) =>
          editorEntityPickerPage(
            nasOptions.filter(nasOption =>
              (
                nasOption.name +
                " " +
                (nasOption.roomName || "") +
                " " +
                (nasOption.integrationName || "") +
                " " +
                nasOption.entityId
              )
                .toLowerCase()
                .includes(String(nasQuery || "").toLowerCase())
            ),
            nasPage,
            null
          ),
        renderSelectedContent: () => [
          createCurrentDeviceOption(
            nasOptions.find(selectedNasOption => selectedNasOption.entityId === currentNasDeviceId)
          )
        ],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不使用数据来源", !currentNasDeviceId)
        ],
        renderItem: nasOptionItem => createDeviceOption(nasOptionItem, currentNasDeviceId, "NAS"),
        onSelect: selectedNasDeviceId => {
          const selectedNasDevice = nasDeviceProfiles.find(
            matchedNasProfile => matchedNasProfile.deviceId === selectedNasDeviceId
          );
          if (!selectedNasDeviceId || selectedNasDevice) {
            onNasSelect(selectedNasDevice ? structuredClone(selectedNasDevice) : null);
          }
        }
      });
    },
    icon({
      trigger: iconTrigger,
      current: currentIcon,
      onSelect: onIconSelect,
      deviceKind: resolvedDeviceKind = deviceKind
    }) {
      currentIcon ||=
        resolvedDeviceKind === "camera"
          ? "mdi:cctv"
          : resolvedDeviceKind === "vacuum"
            ? "mdi:robot-vacuum"
            : resolvedDeviceKind === "television"
              ? "mdi:television"
              : resolvedDeviceKind === "nas"
                ? "mdi:nas"
                : resolvedDeviceKind === "cover"
                  ? "mdi:curtains"
                  : resolvedDeviceKind === "climate"
                    ? "mdi:air-conditioner"
                    : DEFAULT_LIGHT_ICON;
      return openPicker({
        kind: "icon",
        title:
          resolvedDeviceKind === "camera"
            ? "选择摄像头按钮图标"
            : resolvedDeviceKind === "vacuum"
              ? "选择扫地机按钮图标"
              : resolvedDeviceKind === "television"
                ? "选择电视按钮图标"
                : resolvedDeviceKind === "nas"
                  ? "选择NAS按钮图标"
                  : resolvedDeviceKind === "cover"
                    ? "选择窗帘按钮图标"
                    : resolvedDeviceKind === "climate"
                      ? "选择空调按钮图标"
                      : "选择灯光按钮图标",
        searchPlaceholder: "搜索图标名称",
        triggerButton: iconTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.icon,
        emptyText: "没有匹配的图标",
        itemClass: "icon-grid",
        async getPage({ query: iconQuery, page: iconPage, pageSize: iconPageSize }) {
          const iconsResponse = await fetchIcons(
            iconQuery,
            iconPageSize,
            (iconPage - 1) * iconPageSize
          );
          return {
            items: iconsResponse.items || [],
            total: Number(iconsResponse.total) || 0
          };
        },
        renderSelectedActions: () => [
          elements.createEditorPickerCurrentIcon(currentIcon || DEFAULT_LIGHT_ICON)
        ],
        renderItem: iconOptionId =>
          elements.createIconPickerOption(iconOptionId, currentIcon, "editorPickerValue"),
        onSelect: selectedIconId => {
          if (isValidIconId(selectedIconId)) {
            onIconSelect(selectedIconId);
          }
        }
      });
    },
    async entity({
      trigger: entityTrigger,
      current: currentEntityId = "",
      onSelect: onEntitySelect,
      deviceKind: entityDeviceKind = deviceKind,
      domain: entityDomain
    }) {
      const isNasEntity = entityDeviceKind === "nas";
      const isTelevisionEntity = entityDeviceKind === "television";
      const isTelevisionPowerEntity = entityDeviceKind === "television-power";
      const isCoverEntity = entityDeviceKind === "cover" || entityDomain === "cover";
      const isClimateEntity =
        !isCoverEntity && (entityDeviceKind === "climate" || entityDomain === "climate");
      const isLightEntity = entityDeviceKind === "light" && !isCoverEntity && !isClimateEntity;
      const entityIdPattern =
        isLightEntity || isTelevisionPowerEntity || entityDeviceKind === "presence"
          ? /^[a-z_]+\.[a-z0-9_]+$/
          : entityDeviceKind === "camera"
            ? /^camera\.[a-z0-9_]+$/
            : entityDeviceKind === "vacuum"
              ? /^vacuum\.[a-z0-9_]+$/
              : entityDeviceKind === "vacuum-map"
                ? /^(camera|image)\.[a-z0-9_]+$/
                : entityDeviceKind === "vacuum-room"
                  ? /^[a-z_]+\.[a-z0-9_]+$/
                  : isTelevisionEntity
                    ? /^media_player\.[a-z0-9_]+$/
                    : isNasEntity
                      ? /^(binary_sensor|switch|input_boolean)\.[a-z0-9_]+$/
                      : isCoverEntity
                        ? /^cover\.[a-z0-9_]+$/
                        : isClimateEntity
                          ? /^climate\.[a-z0-9_]+$/
                          : /^(light|switch)\.[a-z0-9_]+$/;
      const { editorEntityMatches: entityMatches } = createEditorPickerQueries({
        entityPickerConfig: () => ({
          recommended: candidateEntity =>
            isLightEntity
              ? candidateEntity.entityId.startsWith("light.")
                ? 2
                : candidateEntity.entityId.startsWith("switch.")
                  ? 1
                  : 0
              : isTelevisionPowerEntity
                ? ["switch.", "media_player.", "binary_sensor.", "input_boolean."].some(
                    domainPrefix => candidateEntity.entityId.startsWith(domainPrefix)
                  )
                  ? 1
                  : 0
                : entityDeviceKind === "presence"
                  ? ["occupancy", "motion", "presence"].includes(
                      candidateEntity.deviceClass ||
                        candidateEntity.device_class ||
                        candidateEntity.attributes?.device_class ||
                        getState(candidateEntity.entityId)?.attributes?.device_class
                    )
                  : candidateEntity.entityId.startsWith(
                      isTelevisionEntity || isTelevisionPowerEntity
                        ? "media_player."
                        : isNasEntity || entityDeviceKind === "presence"
                          ? "binary_sensor."
                          : isCoverEntity
                            ? "cover."
                            : isClimateEntity
                              ? "climate."
                              : entityDeviceKind === "camera"
                                ? "camera."
                                : "light."
                    )
        }),
        pickerEntitiesForComponentType: () =>
          getEntities().filter(filteredEntity => entityIdPattern.test(filteredEntity.entityId)),
        entityPickerText: entityPickerText,
        entityDomain: pickerEntity => pickerEntity.entityId.split(".")[0]
      });
      await ensureEntities();
      if (!entityTrigger.isConnected) {
        return null;
      }
      const missingCurrentEntity =
        currentEntityId &&
        entityIdPattern.test(currentEntityId) &&
        !getEntities().some(existingEntity => existingEntity.entityId === currentEntityId)
          ? {
              entityId: currentEntityId,
              name: currentEntityId + "（当前未找到）"
            }
          : null;
      const filterEntities = searchQuery => {
        const matches = entityMatches("interaction3d", searchQuery);
        if (
          missingCurrentEntity &&
          (!searchQuery ||
            entityPickerText(missingCurrentEntity)
              .toLocaleLowerCase("zh-CN")
              .includes(String(searchQuery).trim().toLocaleLowerCase("zh-CN")))
        ) {
          matches.push(missingCurrentEntity);
        }
        return matches;
      };
      const allMatches = filterEntities("");
      const currentEntity =
        allMatches.find(matchedEntity => matchedEntity.entityId === currentEntityId) || null;
      return openPicker({
        kind: "entity",
        title:
          entityDeviceKind === "camera"
            ? "选择摄像头实体"
            : entityDeviceKind === "presence"
              ? "选择人在传感器"
              : entityDeviceKind === "vacuum"
                ? "选择扫地机实体"
                : entityDeviceKind === "vacuum-map"
                  ? "选择扫地机地图"
                  : entityDeviceKind === "vacuum-room"
                    ? "选择房间快捷指令"
                    : isTelevisionEntity
                      ? "选择电视媒体实体（Apple TV）"
                      : isTelevisionPowerEntity
                        ? "选择电视电源状态"
                        : isNasEntity
                          ? "选择 NAS 指示灯状态实体（旧版兼容）"
                          : isCoverEntity
                            ? "选择窗帘实体"
                            : isClimateEntity
                              ? "选择空调实体"
                              : "选择灯光实体",
        searchPlaceholder: "搜索实体名称或 ID",
        triggerButton: entityTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        initialPage: editorEntityPickerInitialPage(
          allMatches.findIndex(matchEntity => matchEntity.entityId === currentEntityId),
          null
        ),
        selectedText: currentEntityId || "不使用实体",
        emptyText:
          entityDeviceKind === "camera"
            ? "没有匹配的摄像头实体，请先在 Home Assistant 接入设备"
            : entityDeviceKind === "presence"
              ? "没有匹配的人在传感器或移动事件，请先在 Home Assistant 接入设备"
              : entityDeviceKind.startsWith("vacuum")
                ? "没有匹配的实体，请先在 Home Assistant 中接入"
                : isTelevisionEntity
                  ? "没有匹配的媒体播放器，请先在 Home Assistant 接入 Apple TV"
                  : isTelevisionPowerEntity
                    ? "没有匹配的电源状态实体"
                    : isNasEntity
                      ? "没有匹配的开关或二元传感器"
                      : isCoverEntity
                        ? "没有匹配的窗帘"
                        : isClimateEntity
                          ? "没有匹配的空调"
                          : "没有匹配的灯光或开关",
        itemClass: "entity-list",
        getPage: ({ query: entityQuery, page: entityPage }) =>
          editorEntityPickerPage(filterEntities(entityQuery), entityPage, null),
        renderSelectedContent: () => [elements.createEditorPickerCurrentEntity(currentEntity)],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不使用实体", !currentEntityId)
        ],
        renderItem: renderedEntity =>
          elements.createEditorEntityPickerOption(renderedEntity, currentEntityId),
        onSelect: selectedEntityId => {
          if (
            !selectedEntityId ||
            selectedEntityId === missingCurrentEntity?.entityId ||
            getEntities().some(
              knownEntity =>
                knownEntity.entityId === selectedEntityId && entityIdPattern.test(selectedEntityId)
            )
          ) {
            onEntitySelect(
              selectedEntityId,
              entityDeviceKind === "presence"
                ? getEntities().find(
                    matchedPresenceEntity => matchedPresenceEntity.entityId === selectedEntityId
                  )
                : undefined
            );
          }
        }
      });
    }
  };
}
