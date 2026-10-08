import {
  EDITOR_PICKER_PAGE_SIZES,
  editorEntityPickerInitialPage,
  editorEntityPickerPage,
} from "../editor/picker/editor-picker-pagination";
import { createEditorPickerQueries } from "../editor/picker/editor-picker-queries";
import { vacuumProfiles } from "./vacuum-catalog";
import { nasProfiles } from "./nas-catalog";
import {
  matchesTemperatureHumidityEntity,
  ENVIRONMENT_SENSORS,
} from "./temperature-humidity";
import type { HaEntityEntry } from "@app/utils/ha-entity";
import { alarmDeviceProfiles } from "@/studio/runtime/security/security-alarm-profile";
const DEFAULT_LIGHT_ICON = "mdi:lightbulb-outline",
  isValidIconId = (iconId: any) =>
    typeof iconId == "string" && /^mdi:[a-z0-9][a-z0-9-]{0,119}$/.test(iconId),
  isAvailableRecord = (record: any) =>
    record &&
    record.disabledBy == null &&
    record.disabled_by == null &&
    record.enabled !== false &&
    !["missing", "disabled"].includes(String(record.status || "").toLowerCase());
/** 交互 3D 编辑器实体选择器的依赖注入。 */
type EditorPickersOptions = {
  openPicker?: (...args: any[]) => any;
  fetchIcons?: (...args: any[]) => any;
  getEntities?: (...args: any[]) => any[];
  /** 按实体 id 读状态（状态中枢包装后的对象）。 */
  getState?: (entityId: string) => any;
  ensureEntities?: (...args: any[]) => any;
  entityPickerText?: any;
  elements?: any;
  /** 设备类型：light / cover / vacuum…，决定可选设备目录。 */
  deviceKind?: string;
  fetchAreas?: (...args: any[]) => any;
  fetchDevices?: (...args: any[]) => any;
  [dependencyName: string]: any;
};

function presenceDeviceProfiles(
  entities: HaEntityEntry[] = [],
  devices: any[] = [],
  lookupState: (entityId: string) => any = () => null,
) {
  const devicesById = new Map();
  for (const entityEntry of entities) {
    if (
      entityEntry.disabledBy != null ||
      entityEntry.disabled_by != null ||
      entityEntry.enabled === false ||
      ["missing", "disabled"].includes(entityEntry.status!) ||
      !/^(binary_sensor|event)\.[a-z0-9_]+$/.test(entityEntry.entityId || "")
    )
      continue;
    const deviceClass =
      entityEntry.deviceClass ||
      entityEntry.device_class ||
      entityEntry.attributes?.device_class ||
      lookupState(entityEntry.entityId!)?.attributes?.device_class;
    if (
      (deviceClass && !["occupancy", "presence", "motion"].includes(deviceClass)) ||
      (!deviceClass &&
        !/occupancy|presence|motion|(?:^|_)pir(?:_|$)|有人|无人|移动检测|运动检测|人体检测/i.test(
          entityEntry.entityId + " " + (entityEntry.name || ""),
        )) ||
      ["diagnostic", "config"].includes(entityEntry.entityCategory || entityEntry.entity_category)
    )
      continue;
    const deviceId = entityEntry.deviceId || entityEntry.device_id;
    if (!deviceId) continue;
    const registryDevice = devices.find(
      (candidateDevice) => (candidateDevice.id || candidateDevice.deviceId) === deviceId,
    );
    registryDevice?.disabledBy != null ||
      registryDevice?.disabled_by != null ||
      (devicesById.has(deviceId) ||
        devicesById.set(deviceId, {
          deviceId: deviceId,
          name:
            registryDevice?.nameByUser ||
            registryDevice?.name_by_user ||
            registryDevice?.name ||
            entityEntry.name ||
            deviceId,
          entities: [] as any[],
        }),
      devicesById.get(deviceId).entities.push({
        entityId: entityEntry.entityId,
        name: entityEntry.name || entityEntry.entityId,
        rank:
          deviceClass === "occupancy" || deviceClass === "presence"
            ? 0
            : deviceClass === "motion"
              ? 1
              : 2,
      }));
  }
  return [...devicesById.values()].map((profile) => ({
    ...profile,
    entities: profile.entities.sort(
      (leftEntity: any, rightEntity: any) =>
        leftEntity.rank - rightEntity.rank ||
        leftEntity.entityId.localeCompare(rightEntity.entityId),
    ),
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
    if (!areasResponse.ok) throw new Error("房间目录暂时不可用");
    return (await areasResponse.json()).items || [];
  },
  fetchDevices: fetchDevices = async () => {
    const devicesResponse = await fetch("/api/v1/ha/devices");
    if (!devicesResponse.ok) throw new Error("设备目录暂时不可用，请稍后重试。");
    return (await devicesResponse.json()).items || [];
  },
}: EditorPickersOptions) {
  const buildEntityCatalog = () =>
    getEntities!().map((entity) => {
      const entityState = getState(entity.entityId),
        latestEntityState = entityState?.newState || entityState;
      return {
        ...entity,
        attributes: {
          ...entity.attributes,
          ...latestEntityState?.attributes,
        },
      };
    });
  async function loadDeviceProfiles() {
    const [deviceRecords, areaRecords] = await Promise.all([
        fetchDevices(),
        fetchAreas().catch(() => null),
      ]),
      areaNamesById = new Map(
        (areaRecords || []).map((areaRecord: any) => [
          areaRecord.areaId || areaRecord.id,
          areaRecord.name,
        ]),
      ),
      platformsByDeviceId = new Map();
    for (const entityRecord of getEntities!()) {
      if (!isAvailableRecord(entityRecord)) continue;
      const entityDeviceId = entityRecord.deviceId || entityRecord.device_id;
      entityDeviceId &&
        entityRecord.platform &&
        (platformsByDeviceId.has(entityDeviceId) ||
          platformsByDeviceId.set(entityDeviceId, new Set()),
        platformsByDeviceId.get(entityDeviceId).add(entityRecord.platform));
    }
    return deviceRecords.filter(isAvailableRecord).map((deviceRecord: any) => ({
      ...deviceRecord,
      integrationName:
        [...(platformsByDeviceId.get(deviceRecord.deviceId || deviceRecord.id) || [])]
          .sort()
          .join("、") || "未知集成",
      roomName:
        areaNamesById.get(deviceRecord.areaId || deviceRecord.area_id) ||
        (deviceRecord.areaId || deviceRecord.area_id ? "房间名称暂不可用" : "未分配房间"),
    }));
  }
  function resolveRoomName(targetDevice: any, targetDeviceList: any) {
    return (
      targetDeviceList.find(
        (roomEntry: any) => (roomEntry.deviceId || roomEntry.id) === targetDevice.deviceId,
      )?.roomName || "未分配房间"
    );
  }
  function resolveIntegrationName(integrationDevice: any, integrationDeviceList: any) {
    return (
      integrationDeviceList.find(
        (integrationEntry: any) =>
          (integrationEntry.deviceId || integrationEntry.id) === integrationDevice.deviceId,
      )?.integrationName || "未知集成"
    );
  }
  const formatDeviceDetail = (deviceProfile: any) =>
    "房间：" + deviceProfile.roomName + " · 集成：" + deviceProfile.integrationName;
  function createDeviceOption(optionProfile: any, currentValue: any, kindLabel = "设备") {
    const optionElement = elements.createEditorEntityPickerOption(optionProfile, currentValue),
      kindElement = optionElement.querySelector?.(".inspector-entity-kind"),
      idElement = optionElement.querySelector?.(".inspector-entity-id");
    return (
      kindElement && (kindElement.textContent = "[" + kindLabel + "] "),
      idElement && (idElement.textContent = formatDeviceDetail(optionProfile)),
      optionElement
    );
  }
  function createCurrentDeviceOption(currentProfile: any) {
    const currentElement = elements.createEditorPickerCurrentEntity(currentProfile),
      currentIdElement = currentElement.querySelector?.(".editor-paged-picker-current-entity-id");
    return (
      currentIdElement &&
        currentProfile &&
        (currentIdElement.textContent = formatDeviceDetail(currentProfile)),
      currentElement
    );
  }
  return {
    entityCatalog: buildEntityCatalog,
    async loadEntities() {
      return (await ensureEntities!(), buildEntityCatalog());
    },
    presenceEntities(presenceDeviceId: any) {
      return (
        presenceDeviceProfiles(getEntities!(), [], getState).find(
          (matchedPresenceProfile) => matchedPresenceProfile.deviceId === presenceDeviceId,
        )?.entities || []
      );
    },
    async device({
      trigger: deviceTrigger,
      current: currentDeviceId = "",
      deviceIcon: deviceIconName = "mdi:devices",
      onSelect: onDeviceSelect,
      title: devicePickerTitle = "选择设备",
      deviceFilter: deviceFilterFn = (_deviceRecord: any, _deviceEntities: any[]) => true,
    }: any) {
      await ensureEntities!();
      const deviceProfiles = await loadDeviceProfiles();
      if (!deviceTrigger.isConnected) return null;
      const deviceOptions = deviceProfiles
          .filter((deviceFilterRecord: any) =>
            deviceFilterFn(
              deviceFilterRecord,
              getEntities!().filter(
                (deviceFilterEntity) =>
                  (deviceFilterEntity.deviceId || deviceFilterEntity.device_id) ===
                  (deviceFilterRecord.deviceId || deviceFilterRecord.id),
              ),
            ),
          )
          .map((deviceProfileRecord: any) => ({
            entityId: deviceProfileRecord.deviceId || deviceProfileRecord.id,
            name:
              deviceProfileRecord.nameByUser ||
              deviceProfileRecord.name_by_user ||
              deviceProfileRecord.name ||
              deviceProfileRecord.deviceId ||
              deviceProfileRecord.id,
            roomName: deviceProfileRecord.roomName,
            integrationName: deviceProfileRecord.integrationName,
            domain: "device",
            icon: deviceIconName,
          })),
        currentDeviceOption =
          deviceOptions.find((deviceOption: any) => deviceOption.entityId === currentDeviceId) ||
          (currentDeviceId
            ? {
                entityId: currentDeviceId,
                name: currentDeviceId + "（当前未找到）",
                roomName: "—",
                integrationName: "—",
                domain: "device",
                icon: deviceIconName,
                status: "missing",
              }
            : null);
      return openPicker!({
        kind: "entity",
        title: devicePickerTitle,
        subtitle: "按 HA 设备归属选择相关实体。",
        searchPlaceholder: "搜索设备、房间或集成",
        triggerButton: deviceTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "暂无设备，请先同步 Home Assistant 设备目录。",
        getPage: ({ query: deviceQuery, page: devicePage }: any) =>
          editorEntityPickerPage(
            deviceOptions.filter((deviceSearchOption: any) =>
              Object.values(deviceSearchOption)
                .join(" ")
                .toLowerCase()
                .includes(String(deviceQuery || "").toLowerCase()),
            ),
            devicePage,
            null,
          ),
        renderSelectedContent: () => [createCurrentDeviceOption(currentDeviceOption)],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不绑定设备", !currentDeviceId),
        ],
        renderItem: (deviceOptionItem: any) => createDeviceOption(deviceOptionItem, currentDeviceId),
        onSelect: (selectedDeviceId: any) => {
          const selectedDeviceOption = deviceOptions.find(
            (selectedDeviceMatch: any) => selectedDeviceMatch.entityId === selectedDeviceId,
          );
          (!selectedDeviceId || selectedDeviceOption) &&
            onDeviceSelect(
              selectedDeviceOption
                ? {
                    deviceId: selectedDeviceId,
                    name: selectedDeviceOption.name,
                    entities: getEntities!()
                      .filter(
                        (deviceEntityRecord) =>
                          (deviceEntityRecord.deviceId || deviceEntityRecord.device_id) ===
                          selectedDeviceId,
                      )
                      .map((deviceEntityEntry) => {
                        const deviceEntityState = getState(
                            deviceEntityEntry.entityId || deviceEntityEntry.entity_id,
                          ),
                          deviceEntityLatestState =
                            deviceEntityState?.newState || deviceEntityState;
                        return {
                          ...deviceEntityEntry,
                          attributes: {
                            ...deviceEntityEntry.attributes,
                            ...deviceEntityLatestState?.attributes,
                          },
                        };
                      }),
                  }
                : null,
            );
        },
      });
    },
    async alarm({
      trigger: alarmTrigger,
      current: currentAlarmEntityId = "",
      kind: alarmKind = "smoke",
      onSelect: onAlarmSelect,
    }: any) {
      await ensureEntities!();
      const alarmDevices = (await fetchDevices?.()) || [];
      const alarmProfiles = alarmDeviceProfiles(
        alarmKind,
        getEntities!() as HaEntityEntry[],
        alarmDevices,
      );
      const alarmOptions = alarmProfiles.flatMap((alarmProfile: any) =>
        (alarmProfile.entities || []).map((alarmEntity: HaEntityEntry) => ({
          entityId: alarmEntity.entityId,
          name: alarmEntity.name || alarmProfile.name,
          roomName: resolveRoomName(alarmProfile, alarmDevices),
          integrationName: resolveIntegrationName(alarmProfile, alarmDevices),
          icon:
            alarmKind === "moisture"
              ? "mdi:water-alert"
              : alarmKind === "gas"
                ? "mdi:fire-alert"
                : "mdi:smoke-detector-alert",
          domain: alarmEntity.entityId?.split(".")[0] || "binary_sensor",
          profile: alarmProfile,
          entity: alarmEntity,
        })),
      );
      return openPicker!({
        kind: "entity",
        title:
          alarmKind === "moisture"
            ? "选择水浸传感器实体"
            : alarmKind === "gas"
              ? "选择天然气传感器实体"
              : "选择烟雾传感器实体",
        searchPlaceholder: "搜索设备或实体",
        triggerButton: alarmTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText:
          alarmKind === "moisture"
            ? "没有匹配的水浸传感器实体"
            : alarmKind === "gas"
              ? "没有匹配的天然气传感器实体"
              : "没有匹配的烟雾传感器实体",
        getPage: ({ query: alarmQuery, page: alarmPage }: any) =>
          editorEntityPickerPage(
            alarmOptions.filter((alarmSearchOption: any) =>
              (
                alarmSearchOption.name +
                " " +
                (alarmSearchOption.roomName || "") +
                " " +
                alarmSearchOption.entityId
              )
                .toLowerCase()
                .includes(String(alarmQuery || "").toLowerCase()),
            ),
            alarmPage,
            null,
          ),
        renderSelectedContent: () => [
          elements.createEditorPickerCurrentEntity(
            alarmOptions.find(
              (selectedOption: any) => selectedOption.entityId === currentAlarmEntityId,
            ) || {
              entityId: currentAlarmEntityId,
              name: currentAlarmEntityId,
            },
          ),
        ],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不绑定实体", !currentAlarmEntityId),
        ],
        renderItem: (alarmOptionItem: any) =>
          elements.createEditorEntityPickerOption(alarmOptionItem, currentAlarmEntityId),
        onSelect: (selectedAlarmEntityId: any) => {
          const selectedOption = alarmOptions.find(
            (option: any) => option.entityId === selectedAlarmEntityId,
          );
          onAlarmSelect(selectedOption?.profile || null, selectedOption?.entity || null);
        },
      });
    },
    async presence({
      trigger: presenceTrigger,
      current: currentPresenceDeviceId = "",
      onSelect: onPresenceSelect,
    }: any) {
      await ensureEntities!();
      const presenceDevices = await loadDeviceProfiles();
      if (!presenceTrigger.isConnected) return null;
      const presenceProfiles = presenceDeviceProfiles(getEntities!(), presenceDevices, getState),
        presenceOptions = presenceProfiles.map((presenceProfile) => ({
          entityId: presenceProfile.deviceId,
          name: presenceProfile.name,
          roomName: resolveRoomName(presenceProfile, presenceDevices),
          integrationName: resolveIntegrationName(presenceProfile, presenceDevices),
          icon: "mdi:motion-sensor",
          domain: "binary_sensor",
        }));
      return openPicker!({
        kind: "entity",
        title: "选择人体传感器设备",
        subtitle: "按设备匹配人在或移动检测实体；多实体可在设备内选择。",
        searchPlaceholder: "搜索设备名称、房间或集成",
        triggerButton: presenceTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "没有找到可用的人体传感器设备；无设备归属的模板实体可手动绑定。",
        getPage: ({ query: presenceQuery, page: presencePage }: any) =>
          editorEntityPickerPage(
            presenceOptions.filter((presenceSearchOption) =>
              (
                presenceSearchOption.name +
                " " +
                (presenceSearchOption.roomName || "") +
                " " +
                (presenceSearchOption.integrationName || "") +
                " " +
                presenceSearchOption.entityId
              )
                .toLowerCase()
                .includes(String(presenceQuery || "").toLowerCase()),
            ),
            presencePage,
            null,
          ),
        renderSelectedContent: () => [
          createCurrentDeviceOption(
            presenceOptions.find(
              (selectedOption) => selectedOption.entityId === currentPresenceDeviceId,
            ),
          ),
        ],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不绑定设备", !currentPresenceDeviceId),
        ],
        renderItem: (presenceOptionItem: any) =>
          createDeviceOption(presenceOptionItem, currentPresenceDeviceId),
        onSelect: (selectedPresenceDeviceId: any) => {
          const selectedPresenceDevice = presenceProfiles.find(
            (matchedProfile) => matchedProfile.deviceId === selectedPresenceDeviceId,
          );
          (!selectedPresenceDeviceId || selectedPresenceDevice) &&
            onPresenceSelect(
              selectedPresenceDevice ? structuredClone(selectedPresenceDevice) : null,
            );
        },
      });
    },
    async vacuum({
      trigger: vacuumTrigger,
      current: currentVacuumDeviceId = "",
      onSelect: onVacuumSelect,
    }: any) {
      await ensureEntities!();
      const vacuumDevices = await loadDeviceProfiles();
      if (!vacuumTrigger.isConnected) return null;
      const vacuumDeviceProfiles = vacuumProfiles(getEntities!(), vacuumDevices),
        vacuumOptions = vacuumDeviceProfiles.map((vacuumProfile) => ({
          entityId: vacuumProfile.deviceId,
          name: vacuumProfile.name,
          roomName: resolveRoomName(vacuumProfile, vacuumDevices),
          integrationName: resolveIntegrationName(vacuumProfile, vacuumDevices),
          domain: "vacuum",
          icon: "mdi:robot-vacuum",
        }));
      return openPicker!({
        kind: "entity",
        title: "选择扫地机设备",
        subtitle: "自动识别主实体、地图和相关状态；支持多台设备独立配置。",
        searchPlaceholder: "搜索设备名称、房间或集成",
        triggerButton: vacuumTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText: "没有找到扫地机，请先在 Home Assistant 中接入设备并启用 vacuum 实体。",
        getPage: ({ query: vacuumQuery, page: vacuumPage }: any) =>
          editorEntityPickerPage(
            vacuumOptions.filter((vacuumSearchOption) =>
              (
                vacuumSearchOption.name +
                " " +
                (vacuumSearchOption.roomName || "") +
                " " +
                (vacuumSearchOption.integrationName || "") +
                " " +
                vacuumSearchOption.entityId
              )
                .toLowerCase()
                .includes(String(vacuumQuery || "").toLowerCase()),
            ),
            vacuumPage,
            null,
          ),
        renderSelectedContent: () => [
          createCurrentDeviceOption(
            vacuumOptions.find(
              (selectedVacuumOption) => selectedVacuumOption.entityId === currentVacuumDeviceId,
            ),
          ),
        ],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不绑定设备", !currentVacuumDeviceId),
        ],
        renderItem: (vacuumOptionItem: any) =>
          createDeviceOption(vacuumOptionItem, currentVacuumDeviceId),
        onSelect: (selectedVacuumDeviceId: any) => {
          const selectedVacuumDevice = vacuumDeviceProfiles.find(
            (matchedVacuumProfile) => matchedVacuumProfile.deviceId === selectedVacuumDeviceId,
          );
          (!selectedVacuumDeviceId || selectedVacuumDevice) &&
            onVacuumSelect(selectedVacuumDevice ? structuredClone(selectedVacuumDevice) : null);
        },
      });
    },
    async nas({ trigger: nasTrigger, current: currentNasDeviceId = "", onSelect: onNasSelect }: any) {
      await ensureEntities!();
      const nasDevices = await loadDeviceProfiles();
      if (!nasTrigger.isConnected) return null;
      const nasDeviceProfiles = nasProfiles(getEntities!(), nasDevices),
        nasOptions = nasDeviceProfiles.map((nasProfile) => ({
          entityId: nasProfile.deviceId,
          name:
            nasProfile.name +
            " · " +
            (nasProfile.metrics.length ? nasProfile.metrics.length + " 项状态" : "暂无状态指标"),
          roomName: resolveRoomName(nasProfile, nasDevices),
          integrationName: resolveIntegrationName(nasProfile, nasDevices),
          domain: "sensor",
          icon: "mdi:nas",
        }));
      return openPicker!({
        kind: "entity",
        title: "选择 NAS 数据来源",
        subtitle: "选择整台 NAS，自动匹配它的状态实体。",
        searchPlaceholder: "搜索 NAS 名称、房间或集成",
        triggerButton: nasTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        itemClass: "entity-list",
        emptyText:
          "未找到飞牛或群晖设备。请确认 Home Assistant 已接入对应集成，并在 HomeOS 同步设备目录。",
        getPage: ({ query: nasQuery, page: nasPage }: any) =>
          editorEntityPickerPage(
            nasOptions.filter((nasSearchOption) =>
              (
                nasSearchOption.name +
                " " +
                (nasSearchOption.roomName || "") +
                " " +
                (nasSearchOption.integrationName || "") +
                " " +
                nasSearchOption.entityId
              )
                .toLowerCase()
                .includes(String(nasQuery || "").toLowerCase()),
            ),
            nasPage,
            null,
          ),
        renderSelectedContent: () => [
          createCurrentDeviceOption(
            nasOptions.find(
              (selectedNasOption) => selectedNasOption.entityId === currentNasDeviceId,
            ),
          ),
        ],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不使用数据来源", !currentNasDeviceId),
        ],
        renderItem: (nasOptionItem: any) => createDeviceOption(nasOptionItem, currentNasDeviceId, "NAS"),
        onSelect: (selectedNasDeviceId: any) => {
          const selectedNasDevice = nasDeviceProfiles.find(
            (matchedNasProfile) => matchedNasProfile.deviceId === selectedNasDeviceId,
          );
          (!selectedNasDeviceId || selectedNasDevice) &&
            onNasSelect(selectedNasDevice ? structuredClone(selectedNasDevice) : null);
        },
      });
    },
    icon({
      trigger: iconTrigger,
      current: currentIcon,
      onSelect: onIconSelect,
      deviceKind: resolvedDeviceKind = deviceKind,
    }: any) {
      return (
        (currentIcon ||=
          resolvedDeviceKind === "speaker"
            ? "mdi:speaker"
            : resolvedDeviceKind === "water-heater"
              ? "mdi:water-boiler"
              : resolvedDeviceKind === "fan"
                ? "mdi:fan"
                : resolvedDeviceKind === "purifier"
                  ? "mdi:air-purifier"
                  : resolvedDeviceKind === "camera"
                    ? "mdi:cctv"
                    : resolvedDeviceKind === "lock"
                      ? "mdi:door-closed"
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
                                : DEFAULT_LIGHT_ICON),
        openPicker!({
          kind: "icon",
          title:
            resolvedDeviceKind === "speaker"
              ? "选择智能音响按钮图标"
              : resolvedDeviceKind === "water-heater"
                ? "选择热水器按钮图标"
                : resolvedDeviceKind === "fan"
                  ? "选择电风扇按钮图标"
                  : resolvedDeviceKind === "purifier"
                    ? "选择空气净化器按钮图标"
                    : resolvedDeviceKind === "camera"
                      ? "选择摄像头按钮图标"
                      : resolvedDeviceKind === "lock"
                        ? "选择门按钮图标"
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
          async getPage({ query: iconQuery, page: iconPage, pageSize: iconPageSize }: any) {
            const iconsResponse = await fetchIcons!(
              iconQuery,
              iconPageSize,
              (iconPage - 1) * iconPageSize,
            );
            return {
              items: iconsResponse.items || [],
              total: Number(iconsResponse.total) || 0,
            };
          },
          renderSelectedActions: () => [
            elements.createEditorPickerCurrentIcon(currentIcon || DEFAULT_LIGHT_ICON),
          ],
          renderItem: (iconOption: any) =>
            elements.createIconPickerOption(iconOption, currentIcon, "editorPickerValue"),
          onSelect: (selectedIconId: any) => {
            isValidIconId(selectedIconId) && onIconSelect(selectedIconId);
          },
        })
      );
    },
    async entity({
      trigger: entityTrigger,
      current: currentEntityId = "",
      onSelect: onEntitySelect,
      deviceKind: entityDeviceKind = deviceKind,
      domain: entityDomainName,
      entityFilter: entityCandidateFilter,
      title: entityPickerTitle,
    }: any) {
      const isSpeakerEntity = entityDeviceKind === "speaker",
        isDeviceStatusEntity = entityDeviceKind === "device-status",
        isLockDoorEntity = entityDeviceKind === "lock-door",
        isLockBatteryEntity = entityDeviceKind === "lock-battery",
        isTelevisionEntity = entityDeviceKind === "television",
        isTelevisionPowerEntity = entityDeviceKind === "television-power",
        environmentSensorKey = ENVIRONMENT_SENSORS.some(
          (environmentSensor) => environmentSensor.key === entityDomainName,
        )
          ? entityDomainName
          : "",
        isCoverEntity =
          ["cover", "airer"].includes(entityDeviceKind) || entityDomainName === "cover",
        isClimateEntity =
          !isCoverEntity && (entityDeviceKind === "climate" || entityDomainName === "climate"),
        isLightEntity = entityDeviceKind === "light" && !isCoverEntity && !isClimateEntity,
        vacuumRoomDomainRank: { [domainName: string]: number } = {
          script: 2,
          button: 1,
        },
        entityIdPattern =
          entityDeviceKind === "bath-heater"
            ? /^(climate|fan)\.[a-z0-9_]+$/
            : environmentSensorKey
              ? /^sensor\.[a-z0-9_]+$/
              : isLockDoorEntity
                ? /^(binary_sensor|sensor)\.[a-z0-9_]+$/
                : isLockBatteryEntity
                  ? /^sensor\.[a-z0-9_]+$/
                  : isDeviceStatusEntity || entityDeviceKind === "vacuum-room"
                    ? /^[a-z_]+\.[a-z0-9_]+$/
                    : entityDeviceKind === "water-heater"
                      ? /^water_heater\.[a-z0-9_]+$/
                      : ["fan", "purifier"].includes(entityDeviceKind)
                        ? /^fan\.[a-z0-9_]+$/
                        : isLightEntity ||
                            isTelevisionPowerEntity ||
                            entityDeviceKind === "presence"
                          ? /^[a-z_]+\.[a-z0-9_]+$/
                          : entityDeviceKind === "camera"
                            ? /^camera\.[a-z0-9_]+$/
                            : entityDeviceKind === "vacuum"
                              ? /^vacuum\.[a-z0-9_]+$/
                              : entityDeviceKind === "vacuum-map"
                                ? /^(camera|image)\.[a-z0-9_]+$/
                                : isTelevisionEntity || isSpeakerEntity
                                  ? /^media_player\.[a-z0-9_]+$/
                                  : isCoverEntity
                                    ? /^cover\.[a-z0-9_]+$/
                                      : isClimateEntity
                                        ? /^climate\.[a-z0-9_]+$/
                                        : /^(light|switch)\.[a-z0-9_]+$/,
        { editorEntityMatches: entityMatches } = createEditorPickerQueries({
          entityPickerConfig: () => ({
            recommended: (candidateEntity: any) => {
              if (entityDeviceKind === "vacuum-room")
                return vacuumRoomDomainRank[candidateEntity.entityId.split(".")[0]] || 0;
              return isSpeakerEntity
                ? (candidateEntity.deviceClass ||
                    candidateEntity.device_class ||
                    candidateEntity.attributes?.device_class ||
                    getState(candidateEntity.entityId)?.attributes?.device_class) === "speaker"
                  ? 2
                  : 1
                : isLightEntity
                  ? candidateEntity.entityId.startsWith("light.")
                    ? 2
                    : candidateEntity.entityId.startsWith("switch.")
                      ? 1
                      : 0
                  : isTelevisionPowerEntity
                    ? ["switch.", "media_player.", "binary_sensor.", "input_boolean."].some(
                        (domainPrefix) => candidateEntity.entityId.startsWith(domainPrefix),
                      )
                      ? 1
                      : 0
                    : entityDeviceKind === "presence"
                      ? ["occupancy", "motion", "presence"].includes(
                          candidateEntity.deviceClass ||
                            candidateEntity.device_class ||
                            candidateEntity.attributes?.device_class ||
                            getState(candidateEntity.entityId)?.attributes?.device_class,
                        )
                      : candidateEntity.entityId.startsWith(
                          entityDeviceKind === "water-heater"
                            ? "water_heater."
                            : ["fan", "purifier"].includes(entityDeviceKind)
                              ? "fan."
                                : isTelevisionEntity || isTelevisionPowerEntity
                                  ? "media_player."
                                  : entityDeviceKind === "presence"
                                    ? "binary_sensor."
                                    : isCoverEntity
                                      ? "cover."
                                      : isClimateEntity
                                        ? "climate."
                                        : entityDeviceKind === "camera"
                                          ? "camera."
                                          : "light.",
                        );
            },
          }),
          pickerEntitiesForComponentType: () =>
            buildEntityCatalog().filter(
              (filteredEntity) =>
                entityIdPattern.test(filteredEntity.entityId) &&
                (!environmentSensorKey ||
                  matchesTemperatureHumidityEntity(
                    filteredEntity,
                    environmentSensorKey,
                    getState(filteredEntity.entityId),
                  )) &&
                (!entityCandidateFilter || entityCandidateFilter(filteredEntity)),
            ),
          entityPickerText: entityPickerText,
          entityDomain: (domainEntity: any) => domainEntity.entityId.split(".")[0],
        });
      if ((await ensureEntities!(), !entityTrigger.isConnected)) return null;
      const missingCurrentEntity =
          currentEntityId &&
          entityIdPattern.test(currentEntityId) &&
          !getEntities!().some((existingEntity) => existingEntity.entityId === currentEntityId)
            ? {
                entityId: currentEntityId,
                name: currentEntityId + "（当前未找到）",
              }
            : null,
        filterEntities = (searchQuery: any) => {
          const matches = entityMatches("interaction3d", searchQuery);
          return (
            missingCurrentEntity &&
              (!searchQuery ||
                entityPickerText(missingCurrentEntity)
                  .toLocaleLowerCase("zh-CN")
                  .includes(String(searchQuery).trim().toLocaleLowerCase("zh-CN"))) &&
              matches.push(missingCurrentEntity),
            matches
          );
        },
        allMatches = filterEntities(""),
        currentEntity =
          allMatches.find((matchedEntity: any) => matchedEntity.entityId === currentEntityId) ||
          (environmentSensorKey && currentEntityId
            ? {
                entityId: currentEntityId,
                name: currentEntityId + "（当前不可选，可清除后重新绑定）",
              }
            : null);
      return openPicker!({
        kind: "entity",
        title:
          entityPickerTitle ||
          (entityDeviceKind === "bath-heater"
            ? "选择浴霸主实体（可不选）"
            : environmentSensorKey
              ? "选择" +
                ENVIRONMENT_SENSORS.find(
                  (environmentSensorTitleEntry) =>
                    environmentSensorTitleEntry.key === environmentSensorKey,
                )!.label +
                "实体"
              : isLockDoorEntity
                ? "选择门状态传感器"
                : isLockBatteryEntity
                  ? "选择电量传感器"
                  : entityDeviceKind === "device-status"
                    ? "选择状态实体"
                    : entityDeviceKind === "airer"
                      ? "选择晾衣架升降实体"
                      : entityDeviceKind === "water-heater"
                        ? "选择热水器实体"
                        : entityDeviceKind === "fan"
                          ? "选择电风扇实体"
                          : entityDeviceKind === "purifier"
                            ? "选择空气净化器实体"
                            : entityDeviceKind === "camera"
                              ? "选择摄像头实体"
                              : entityDeviceKind === "presence"
                                ? "选择人在传感器"
                                : entityDeviceKind === "vacuum"
                                  ? "选择扫地机实体"
                                  : entityDeviceKind === "vacuum-map"
                                    ? "选择扫地机地图"
                                    : entityDeviceKind === "vacuum-room"
                                      ? "选择房间快捷指令"
                                      : isSpeakerEntity
                                        ? "选择智能音响媒体实体"
                                        : isTelevisionEntity
                                          ? "选择电视媒体实体（Apple TV）"
                                          : isTelevisionPowerEntity
                                            ? "选择电视电源状态"
                                            : isCoverEntity
                                              ? "选择窗帘实体"
                                              : isClimateEntity
                                                ? "选择空调实体"
                                                : "选择灯光实体"),
        searchPlaceholder: "搜索实体名称或 ID",
        triggerButton: entityTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.entity,
        initialPage: editorEntityPickerInitialPage(
          allMatches.findIndex(
            (initialPageEntity: any) => initialPageEntity.entityId === currentEntityId,
          ),
          null,
        ),
        selectedText: currentEntityId || "不使用实体",
        emptyText: environmentSensorKey
          ? "没有匹配的" +
            ENVIRONMENT_SENSORS.find(
              (environmentSensorHintEntry) =>
                environmentSensorHintEntry.key === environmentSensorKey,
            )!.label +
            "传感器，请检查 Home Assistant 的实体类型或名称"
          : isLockDoorEntity
            ? "没有匹配的门状态传感器，请检查设备的门/开合实体"
            : isLockBatteryEntity
              ? "没有匹配的电量传感器，请检查设备的 battery 实体"
              : entityDeviceKind === "water-heater"
                ? "没有匹配的热水器（water_heater）实体，请先在 Home Assistant 接入设备"
                : ["fan", "purifier"].includes(entityDeviceKind)
                  ? "没有匹配的风扇（fan）实体，请先在 Home Assistant 接入设备"
                  : entityDeviceKind === "camera"
                    ? "没有匹配的摄像头实体，请先在 Home Assistant 接入设备"
                    : entityDeviceKind === "presence"
                      ? "没有匹配的人在传感器或移动事件，请先在 Home Assistant 接入设备"
                      : entityDeviceKind.startsWith("vacuum")
                        ? "没有匹配的实体，请先在 Home Assistant 中接入"
                        : isSpeakerEntity
                          ? "没有匹配的 media_player 实体，请先在 Home Assistant 接入音响"
                          : isTelevisionEntity
                            ? "没有匹配的媒体播放器，请先在 Home Assistant 接入 Apple TV"
                            : isTelevisionPowerEntity
                              ? "没有匹配的电源状态实体"
                              : isCoverEntity
                                ? "没有匹配的窗帘"
                                : isClimateEntity
                                  ? "没有匹配的空调"
                                  : "没有匹配的灯光或开关",
        itemClass: "entity-list",
        getPage: ({ query: entityQuery, page: entityPage }: any) =>
          editorEntityPickerPage(filterEntities(entityQuery), entityPage, null),
        renderSelectedContent: () => [elements.createEditorPickerCurrentEntity(currentEntity)],
        renderSelectedActions: () => [
          elements.editorPickerClearAction("不使用实体", !currentEntityId),
        ],
        renderItem: (renderedEntity: any) =>
          elements.createEditorEntityPickerOption(renderedEntity, currentEntityId),
        onSelect: (selectedEntityId: any) => {
          const knownEntity = buildEntityCatalog().find(
            (catalogEntity) => catalogEntity.entityId === selectedEntityId,
          );
          (!selectedEntityId ||
            (!environmentSensorKey &&
              !entityCandidateFilter &&
              selectedEntityId === missingCurrentEntity?.entityId) ||
            (knownEntity &&
              entityIdPattern.test(selectedEntityId) &&
              (!environmentSensorKey ||
                matchesTemperatureHumidityEntity(
                  knownEntity,
                  environmentSensorKey,
                  getState(selectedEntityId),
                )) &&
              (!entityCandidateFilter || entityCandidateFilter(knownEntity)))) &&
            onEntitySelect(selectedEntityId, knownEntity);
        },
      });
    },
  };
}
