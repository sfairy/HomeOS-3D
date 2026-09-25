/**
 * 3D 交互编辑器里的各类选择器（picker）组装层：编辑器需要设备 / 图标 / 实体三种选择器，
 * 本模块集中「候选数据从哪来、怎么打分排序、选中后回调什么」，弹层 UI 由宿主通过 openPicker 与 elements 注入。
 *
 * 约定：设备 / 实体 / 房间目录来自 /api/v1/ha/devices 与 /api/v1/ha/areas，失败时抛中文文案；
 * 单选「清除绑定」用空字符串回调，各 onSelect 必须接受空值；回调的 profile 都经过 structuredClone，
 * 调用方可自由改动而不影响内部数据。副作用：会发起实体 / 设备 / 房间 / 图标请求。
 */
import {
  EDITOR_PICKER_PAGE_SIZES,
  editorEntityPickerInitialPage,
  editorEntityPickerPage
} from "../editor/picker/editor-picker-pagination.js?v=2609252203";
import { createEditorPickerQueries } from "../editor/picker/editor-picker-queries.js?v=2609252203";
// 「取实体域」走 utils/entities.js 的唯一实现：能进这个列表的实体都是 HA 目录里的行
// （`domain` 列就是 entity_id 的前缀），虚拟实体另被 `editorEntityMatches` 滤掉，两边同值。
import { entityDomainOf } from "../utils/entities.js?v=2609252203";
import { vacuumProfiles } from "./vacuum-catalog.js?v=2609252203";
import { nasProfiles } from "./nas-catalog.js?v=2609252203";
// 温湿度计的传感器判定与运行侧、后端同一份实现（static 共享层，零依赖）。
import { matchesTemperatureHumidityEntity } from "./temperature-humidity.js?v=2609252203";
// 灯光按钮的默认图标；与后端图标目录里的命名保持一致。
const DEFAULT_LIGHT_ICON = "mdi:lightbulb-outline";
// 只接受 Material Design Icons 的合法 ID（长度上限 120 与图标目录约定一致），
// 避免把任意字符串写进组件文档，导致渲染时取不到图标。
const isValidIconId = iconId =>
  typeof iconId == "string" && /^mdi:[a-z0-9][a-z0-9-]{0,119}$/.test(iconId);
/**
 * 按设备聚合人体传感器实体。
 * 用于「人在 / 移动」这类按设备绑定的交互：HA 里同一设备常有多个实体
 * （占用、移动、事件），面板希望用户选设备而不是逐个挑实体。
 */
function presenceDeviceProfiles(entities = [], devices = [], lookupState = () => null) {
  const devicesById = new Map();
  // 只考虑人体相关的域（binary_sensor / event），并剔除禁用、丢失的实体。
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
    // device_class 可能来自实体的属性，也可能是 HA 状态里才有；注册表字段缺失时回落到状态查询。
    const deviceClass =
      entityEntry.deviceClass ||
      entityEntry.device_class ||
      entityEntry.attributes?.device_class ||
      lookupState(entityEntry.entityId)?.attributes?.device_class;
    // 三者任一命中即排除：1) 有 device_class 但不在白名单 —— 明确是别的用途；
    // 2) 完全没有 device_class —— 用中英文关键词兜底（友好名可能是中文）；
    // 3) 分类为 diagnostic / config —— 非主功能实体。
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
    // 没有设备归属的实体无法参与「按设备绑定」，直接跳过。
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
        // rank 决定同设备内多个实体的优先顺序：占用 / 人在最语义正确（0），
        // 移动检测次之（1），靠关键词命中的兜底实体排最后（2）。
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
/**
 * 创建编辑器的选择器集合。
 * 所有依赖都从参数注入（openPicker / elements / fetchIcons / getEntities /
 * ensureEntities / entityPickerText），本模块既不依赖具体 UI，也便于测试里替换数据源。
 */
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
  // 设备与房间目录一次性并行取齐，避免用户在列表里逐项展开时再等网络。
  async function loadDeviceProfiles() {
    // 房间请求单独 catch 成 null：它失败不应让整个设备选择器不可用。
    const [deviceRecords, areaRecords] = await Promise.all([
      fetchDevices(),
      // 区域列表拿不到不阻塞设备选择：退化成「没有区域分组」。
      fetchAreas().catch(() => null)
    ]);
    const areaNamesById = new Map(
      (areaRecords || []).map(areaRecord => [areaRecord.areaId || areaRecord.id, areaRecord.name])
    );
    // HA 的设备注册表本身不带「集成名」，只能用实体上的 platform 反推，因此这里扫一遍实体表。
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
      // 同一设备可能被多个实体带出不同 platform，需要去重后按名排序，展示才稳定。
      integrationName:
        [...(platformsByDeviceId.get(deviceRecord.deviceId || deviceRecord.id) || [])]
          .sort()
          .join("、") || "未知集成",
      // 房间名的三级兜底刻意区分两种「没有名字」：设备挂了房间但名字取不到（房间目录失败），
      // 与设备确实没分配房间 —— 两者的处置方式不同。
      roomName:
        areaNamesById.get(deviceRecord.areaId || deviceRecord.area_id) ||
        (deviceRecord.areaId || deviceRecord.area_id ? "房间名称暂不可用" : "未分配房间")
    }));
  }
  // 房间 / 集成名都要在被补齐过的设备列表里按 deviceId 回查（profile 本身不带这两个字段）。
  function resolveRoomName(targetDevice, targetDeviceList) {
    return (
      targetDeviceList.find(
        roomEntry => (roomEntry.deviceId || roomEntry.id) === targetDevice.deviceId
      )?.roomName || "未分配房间"
    );
  }
  // 与 resolveRoomName 同源：集成名由实体表反推后挂在设备条目上，这里按 deviceId 回查并兜底。
  function resolveIntegrationName(integrationDevice, integrationDeviceList) {
    return (
      integrationDeviceList.find(
        integrationEntry =>
          (integrationEntry.deviceId || integrationEntry.id) === integrationDevice.deviceId
      )?.integrationName || "未知集成"
    );
  }
  // 「房间 · 集成」一行摘要，供设备条目的详情行与「当前选中」卡片共用。
  const formatDeviceDetail = deviceProfile =>
    "房间：" + deviceProfile.roomName + " · 集成：" + deviceProfile.integrationName;
  // 复用宿主提供的元素工厂，只改写内部两处文本：种类标签与「房间 · 集成」详情。
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
  // 构造「当前选中设备」的卡片：沿用宿主的当前值组件，只把 ID 行改写成「房间 · 集成」。
  function createCurrentDeviceOption(currentProfile) {
    const currentElement = elements.createEditorPickerCurrentEntity(currentProfile);
    // 「当前选中」卡片只显示一行 ID，需要换成更可读的「房间 · 集成」。
    const currentIdElement = currentElement.querySelector?.(
      ".editor-paged-picker-current-entity-id"
    );
    if (currentIdElement && currentProfile) {
      currentIdElement.textContent = formatDeviceDetail(currentProfile);
    }
    return currentElement;
  }
  return {
    // 只取该设备下已排序的实体列表（编辑器用它渲染「可选实体」下拉）。
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
      // 设备目录依赖实体表（集成名靠实体平台反推），因此必须先确保实体已加载。
      await ensureEntities();
      const presenceDevices = await loadDeviceProfiles();
      // 设备 / 房间请求期间用户可能已切走面板，触发按钮脱离 DOM 后不该再弹层。
      if (!presenceTrigger.isConnected) {
        return null;
      }
      // 设备选择器复用 HA 的 entity 选择器外观：entityId 装的是设备 ID，排序文本里带上房间与集成。
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
        // 搜索范围覆盖名称、房间、集成与设备 ID，便于按任一线索定位设备。
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
          // 已绑定时禁用「不绑定设备」，避免产生无意义的重复操作。
          elements.editorPickerClearAction("不绑定设备", !currentPresenceDeviceId)
        ],
        renderItem: optionItem => createDeviceOption(optionItem, currentPresenceDeviceId),
        onSelect: selectedDeviceId => {
          const selectedPresenceProfile = presenceProfiles.find(
            matchedProfile => matchedProfile.deviceId === selectedDeviceId
          );
          // 空字符串代表「清除绑定」，同样需要回调；非空但查不到 profile 说明数据已过期，忽略。
          if (!selectedDeviceId || selectedPresenceProfile) {
            // 传拷贝而不是内部对象，防止编辑器改动污染随后重新聚合出的 profile。
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
      // 与人体传感器同理：先确保实体表就绪，再聚合扫地机 profile。
      await ensureEntities();
      const vacuumDevices = await loadDeviceProfiles();
      // 等待目录期间面板可能已切换，触发器脱离 DOM 就放弃弹层。
      if (!vacuumTrigger.isConnected) {
        return null;
      }
      // 先把散落的实体聚合成「一台设备一个 profile」，再做设备级绑定。
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
          // 空值表示解除绑定；非空但查不到则视为数据已刷新，丢弃该次选择。
          if (!selectedVacuumDeviceId || selectedVacuumDevice) {
            onVacuumSelect(selectedVacuumDevice ? structuredClone(selectedVacuumDevice) : null);
          }
        }
      });
    },
    async nas({ trigger: nasTrigger, current: currentNasDeviceId = "", onSelect: onNasSelect }) {
      await ensureEntities();
      const nasDevices = await loadDeviceProfiles();
      // 目录请求是异步的，回来时触发器可能已经不在文档里（面板被切走）。
      if (!nasTrigger.isConnected) {
        return null;
      }
      // NAS 的状态实体同样按设备聚合，用户只需选整台 NAS。
      const nasDeviceProfiles = nasProfiles(getEntities(), nasDevices);
      const nasOptions = nasDeviceProfiles.map(nasProfile => ({
        entityId: nasProfile.deviceId,
        // 在名称后附上指标数量，让用户直观判断该 NAS 是否已被正确识别。
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
          // 空值表示「不使用数据来源」，也要回调（传 null）；查不到则忽略这次选择。
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
      // 未配置图标时按设备类型给一个语义贴切的默认值，而不是统一的灯泡。
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
                    : resolvedDeviceKind === "lock"
                      ? "mdi:door-closed"
                      : DEFAULT_LIGHT_ICON;
      // 图标目录条目里的 name 不带 mdi: 前缀（带前缀的是 slug），而本编辑器的图标 ID
      // 一律带前缀（默认值、已存文档与 isValidIconId / 后端校验都是这个形式）。
      // 展示当前选中态时要先把前缀剥掉，才能和条目的 name 相等。
      const currentIconName = String(currentIcon || "").replace(/^mdi:/, "");
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
                      : resolvedDeviceKind === "lock"
                        ? "选择门锁按钮图标"
                        : "选择灯光按钮图标",
        searchPlaceholder: "搜索图标名称",
        triggerButton: iconTrigger,
        pageSize: EDITOR_PICKER_PAGE_SIZES.icon,
        emptyText: "没有匹配的图标",
        itemClass: "icon-grid",
        async getPage({ query: iconQuery, page: iconPage, pageSize: iconPageSize }) {
          // 图标目录很大，必须交给服务端分页（offset 由页码换算），不能全量下发。
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
        renderItem(iconOption) {
          const iconOptionElement = elements.createIconPickerOption(
            iconOption,
            currentIconName,
            "editorPickerValue"
          );
          // 取值统一改回带 mdi: 前缀的 slug：元素工厂默认写的是不带前缀的 name，
          // 而 onSelect 的 isValidIconId 与后端校验都要求前缀，直接用 name 会被判非法，
          // 表现为「点了图标没反应、选择器关掉但图标没变」。
          iconOptionElement.dataset.editorPickerValue =
            iconOption.slug || "mdi:" + iconOption.name;
          return iconOptionElement;
        },
        onSelect: selectedIconId => {
          // 选择器的选中值来自服务端，但仍要复检格式：非法 ID 会让渲染阶段拿不到图标。
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
      domain: entityDomainName
    }) {
      // 交互语义比「实体域」复杂，这里先把各种特殊情形摊平成布尔量，
      // 后续所有判定都只看这些布尔量，避免条件散落各处。
      const isNasEntity = entityDeviceKind === "nas";
      const isTelevisionEntity = entityDeviceKind === "television";
      const isTelevisionPowerEntity = entityDeviceKind === "television-power";
      const isCoverEntity = entityDeviceKind === "cover" || entityDomainName === "cover";
      const isClimateEntity =
        !isCoverEntity && (entityDeviceKind === "climate" || entityDomainName === "climate");
      const isLightEntity = entityDeviceKind === "light" && !isCoverEntity && !isClimateEntity;
      // 温湿度计：同一套实体选择器服务两路，deviceKind 上带出「哪一路」，
      // 候选与排序都交给 bridge 的 matchesTemperatureHumidityEntity（唯一判定口径）。
      const isTemperatureHumidityEntity =
        entityDeviceKind === "temperature-humidity-temperature" ||
        entityDeviceKind === "temperature-humidity-humidity";
      const meterKind = entityDeviceKind === "temperature-humidity-humidity" ? "humidity" : "temperature";
      const matchesMeterEntity = candidateEntity =>
        matchesTemperatureHumidityEntity(
          candidateEntity,
          meterKind,
          getState(candidateEntity.entityId)
        );
      // 实体域白名单：决定「哪些实体有资格出现」。灯光 / 电视电源 / 人在允许任意域，
      // 因为这类功能真正绑定的是「任意可控实体」或某域下由 device_class 判定的实体。
      const entityIdPattern =
        isLightEntity || isTelevisionPowerEntity || entityDeviceKind === "presence"
          ? /^[a-z_]+\.[a-z0-9_]+$/
          : isTemperatureHumidityEntity
            ? /^sensor\.[a-z0-9_]+$/
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
          // recommended 返回一个粗粒度权重（2 首选 / 1 次选 / 0 其它），只用于排序：
          // 让最符合当前交互语义的实体排在最前，而不是过滤掉其余候选。
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
                  : isTemperatureHumidityEntity
                    ? matchesMeterEntity(candidateEntity)
                      ? 1
                      : 0
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
        // 候选来源在这里过滤：域不匹配的实体根本不进入选择器，避免用户绑上不可能生效的实体。
        // 温湿度计再叠一层语义判定（device_class / 单位 / 名称），只留温度或湿度传感器。
        pickerEntitiesForComponentType: () =>
          getEntities().filter(filteredEntity =>
            isTemperatureHumidityEntity
              ? matchesMeterEntity(filteredEntity)
              : entityIdPattern.test(filteredEntity.entityId)
          ),
        entityPickerText: entityPickerText,
        entityDomainResolver: entityDomainOf
      });
      await ensureEntities();
      // 打开选择器前用户可能已切走面板，触发器脱离 DOM 时不再弹层。
      if (!entityTrigger.isConnected) {
        return null;
      }
      // 已绑定但当前实体表里找不到的实体（HA 侧改名、离线或未同步）要保留占位条目，
      // 否则用户会以为配置丢失，实际它仍存在于组件文档里。
      const missingCurrentEntity =
        currentEntityId &&
        entityIdPattern.test(currentEntityId) &&
        !getEntities().some(existingEntity => existingEntity.entityId === currentEntityId)
          ? {
              entityId: currentEntityId,
              name: currentEntityId + "（当前未找到）"
            }
          : null;
      // 在实体匹配结果后追加「当前未找到」的占位条目；占位项只在自身命中搜索词时出现，
      // 既不污染搜索结果，又能让用户在任何搜索词下看到已绑定的实体 ID。
      const filterEntities = searchQuery => {
        const matches = entityMatches("interaction3d", searchQuery);
        // 占位条目只在自身匹配搜索词时补进结果，保持与正常实体一致的搜索行为。
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
      // 当前选中项要从空查询的全量列表里取，选中项必须在总列表中才能被定位到页码。
      const currentEntity =
        allMatches.find(matchedEntity => matchedEntity.entityId === currentEntityId) || null;
      return openPicker({
        kind: "entity",
        title: isTemperatureHumidityEntity
          ? meterKind === "humidity"
            ? "选择湿度传感器"
            : "选择温度传感器"
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
        // 打开时就翻到当前选中项所在页，长列表下不用手动寻找。
        initialPage: editorEntityPickerInitialPage(
          allMatches.findIndex(matchEntity => matchEntity.entityId === currentEntityId),
          null
        ),
        selectedText: currentEntityId || "不使用实体",
        emptyText: isTemperatureHumidityEntity
          ? "没有匹配的" +
            (meterKind === "humidity" ? "湿度" : "温度") +
            "传感器，可先在 Home Assistant 为其设置 device_class 或单位"
          : entityDeviceKind === "camera"
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
          // 允许清空；允许重新选中「当前未找到」的占位项；
          // 其余情况必须仍存在于实体表中且域合法，防止绑定到已失效的实体。
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
              // 人在传感器需要连同实体详情一起回传，编辑器据此推导 device_class；
              // 其它交互只关心实体 ID。
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
