/*
 * 绑定收集。
 */

import {
  GENERIC_DEVICE_KINDS,
  genericDeviceProfile,
  isGenericDeviceKind
} from "../../device/device-profiles.js";
import { doorModels, lockHinge } from "../../security/lock-state.js";
// 温湿度计的缺省落点：没有显式 x / y 时落在楼层几何中心，与工作室放置新标记的口径同源
import { temperatureHumidityFloorCenter } from "../static-helpers.js";
// 窗帘组合（一拖多）的归一与舞台条目 id 口径：编辑器的配对候选、组合面板与舞台绑定必须
import {
  curtainGroupEntryId,
  validCurtainGroups
} from "../../cover/cover-groups.js";

type AnyObj = Record<string, any>;


export function createBindingCollectors(ctx: any) {
  /**
   * 收集扫地机绑定：合并配置项、场景模型与运行期偏移（拖拽 / 动画位置）。
   */
  function collectVacuumBindings() {
    return (ctx.config.devices?.vacuums || []).map((vacuumBindingEntry: any) => {
      const vacuumSceneItem = ctx.stageOptions.document.floors
        .find((vacuumFloor: any) => vacuumFloor.id === vacuumBindingEntry.floorId)
        ?.scene.items.find(
          (vacuumSceneItemCandidate: any) =>
            vacuumSceneItemCandidate.id === vacuumBindingEntry.modelId &&
            vacuumSceneItemCandidate.type === "robotvacuum"
        );
      // 编辑态必须忽略运行期偏移：编辑器里显示与保存的都是配置坐标，
      const vacuumOffset = (!ctx.isEditing && ctx.vacuumMotion.offset(vacuumBindingEntry.id)) || {
        x: 0,
        y: 0
      };
      return {
        ...vacuumBindingEntry,
        deviceKind: "vacuum",
        clickAction: vacuumBindingEntry.clickAction || "focus-panel",
        x:
          (Number.isFinite(vacuumBindingEntry.x)
            ? vacuumBindingEntry.x
            : (vacuumSceneItem?.x ?? 0)) + vacuumOffset.x,
        y:
          (Number.isFinite(vacuumBindingEntry.y)
            ? vacuumBindingEntry.y
            : (vacuumSceneItem?.y ?? 0)) + vacuumOffset.y,
        height: Number.isFinite(vacuumBindingEntry.height)
          ? vacuumBindingEntry.height
          : (Number(vacuumSceneItem?.elevation) || 0) +
            (Number(vacuumSceneItem?.height) || 0.85) +
            0.25,
        modelAvailable: !!vacuumSceneItem,
        icon: vacuumBindingEntry.icon || "mdi:robot-vacuum"
      };
    });
  }

  // 收集摄像头绑定：尺寸缺省 0.2 / 0.3 / 0.2 米，用于画状态罩的包围盒。
  const collectCameraBindings = () =>
    (ctx.config.security?.cameras || []).map((securityCameraEntry: any) => {
      const securityCameraSceneItem = ctx.stageOptions.document.floors
        .find((securityCameraFloor: any) => securityCameraFloor.id === securityCameraEntry.floorId)
        ?.scene.items.find(
          (cameraSceneItemCandidate: any) =>
            cameraSceneItemCandidate.id === securityCameraEntry.modelId &&
            cameraSceneItemCandidate.type === "camera"
        );
      return {
        ...securityCameraEntry,
        buttonHidden: false,
        hiddenClickable: false,
        id: "camera:" + securityCameraEntry.id,
        deviceKind: "camera",
        clickAction: "focus",
        modelAvailable: !!securityCameraSceneItem,
        icon: securityCameraEntry.icon || "mdi:cctv",
        x: Number.isFinite(securityCameraEntry.x)
          ? securityCameraEntry.x
          : (securityCameraSceneItem?.x ?? 0),
        y: Number.isFinite(securityCameraEntry.y)
          ? securityCameraEntry.y
          : (securityCameraSceneItem?.y ?? 0),
        height: Number.isFinite(securityCameraEntry.height)
          ? securityCameraEntry.height
          : (Number(securityCameraSceneItem?.elevation) || 0) +
            (Number(securityCameraSceneItem?.height) || 0.3) / 2
      };
    });

  /**
   * 收集「环境」里成对的空调 / 净化器绑定：把配置项与场景模型合并。
   */
  function collectEnvironmentClimateEntries(entries: any, modelTypes: any, fallbackIcon: any, fallbackHeight: any) {
    return (entries || []).map((climateEntry: any) => {
      const climateSceneItem = ctx.stageOptions.document.floors
        .find((floorCandidate: any) => floorCandidate.id === climateEntry.floorId)
        ?.scene.items.find(
          (sceneItemCandidate: any) =>
            sceneItemCandidate.id === climateEntry.modelId &&
            modelTypes.includes(sceneItemCandidate.type)
        );
      return {
        ...climateEntry,
        deviceKind: "climate",
        x: Number.isFinite(climateEntry.x) ? climateEntry.x : (climateSceneItem?.x ?? 0),
        y: Number.isFinite(climateEntry.y) ? climateEntry.y : (climateSceneItem?.y ?? 0),
        height: Number.isFinite(climateEntry.height)
          ? climateEntry.height
          : climateSceneItem
            ? (Number(climateSceneItem.elevation) || 0) +
              (Number(climateSceneItem.height) || fallbackHeight) / 2
            : 0,
        modelAvailable: !!climateSceneItem,
        icon: climateEntry.icon || fallbackIcon
      };
    });
  }
  /**
   * 空调（挂机 / 柜机 / 出风口）+ 空气净化器的绑定。
   */
  function collectClimateBindings() {
    return [
      ...collectEnvironmentClimateEntries(
        ctx.config.environment?.airConditioners,
        ["wallac", "floorac", "airoutlet"],
        "mdi:air-conditioner",
        0.28
      ),
      // 净化器在场景里有两副外观：空气净化器（type === "airpurifier"，studio 有专用构建器）
      ...collectEnvironmentClimateEntries(
        ctx.config.environment?.airPurifiers,
        ["airpurifier", "freshair"],
        "mdi:air-purifier",
        0.7
      )
    ];
  }

  // 收集人体传感器绑定，供存在场景与点击热区布局共用。
  const collectPresenceBindings = () =>
    (ctx.config.security?.presenceSensors || []).map((presenceSensorBindingEntry: any) => {
      const presenceSceneItem = ctx.stageOptions.document.floors
        .find((sensorFloor: any) => sensorFloor.id === presenceSensorBindingEntry.floorId)
        ?.scene.items.find(
          (sensorSceneItemCandidate: any) =>
            sensorSceneItemCandidate.id === presenceSensorBindingEntry.modelId &&
            sensorSceneItemCandidate.type === "presence"
        );
      return {
        ...presenceSensorBindingEntry,
        modelAvailable: presenceSensorBindingEntry.modelId ? !!presenceSceneItem : undefined,
        id: "presence:" + presenceSensorBindingEntry.id,
        deviceKind: "presence",
        clickAction: "focus",
        icon: "mdi:motion-sensor",
        size: presenceSensorBindingEntry.modelId ? 36 : presenceSensorBindingEntry.size,
        x: presenceSceneItem?.x ?? presenceSensorBindingEntry.route?.[0]?.x ?? 0,
        y: presenceSceneItem?.y ?? presenceSensorBindingEntry.route?.[0]?.y ?? 0,
        height: presenceSceneItem
          ? (Number(presenceSceneItem.elevation) || 0) +
            (Number(presenceSceneItem.height) || 0.2) / 2
          : (presenceSensorBindingEntry.size ?? 1) * 0.7
      };
    });

  /**
   * 收集电视绑定：合并配置项与场景模型，坐标缺省取模型位置。
   */
  function collectTelevisionBindings() {
    return (ctx.config.devices?.televisions || []).map((televisionEntry: any) => {
      const televisionSceneItem = ctx.stageOptions.document.floors
        .find((televisionFloor: any) => televisionFloor.id === televisionEntry.floorId)
        ?.scene.items.find(
          (televisionSceneItemCandidate: any) =>
            televisionSceneItemCandidate.id === televisionEntry.modelId &&
            televisionSceneItemCandidate.type === "tv"
        );
      return {
        ...televisionEntry,
        clickAction: televisionEntry.clickAction || "focus-panel",
        deviceKind: "television",
        x: Number.isFinite(televisionEntry.x) ? televisionEntry.x : (televisionSceneItem?.x ?? 0),
        y: Number.isFinite(televisionEntry.y) ? televisionEntry.y : (televisionSceneItem?.y ?? 0),
        height: Number.isFinite(televisionEntry.height)
          ? televisionEntry.height
          : (Number(televisionSceneItem?.elevation) || 0) +
            (Number(televisionSceneItem?.height) || 0.92) * 0.62,
        modelAvailable: !!televisionSceneItem,
        icon: televisionEntry.icon || "mdi:television"
      };
    });
  }

  /**
   * 收集 NAS 绑定：clickAction 缺省为 focus（点击聚焦），坐标缺省取模型几何中心。
   */
  function collectNasBindings() {
    return (ctx.config.devices?.nas || []).map((nasEntry: any) => {
      const nasSceneItem = ctx.stageOptions.document.floors
        .find((nasFloor: any) => nasFloor.id === nasEntry.floorId)
        ?.scene.items.find(
          (nasSceneItemCandidate: any) =>
            nasSceneItemCandidate.id === nasEntry.modelId && nasSceneItemCandidate.type === "nas"
        );
      return {
        ...nasEntry,
        clickAction: nasEntry.clickAction || "focus",
        deviceKind: "nas",
        x: Number.isFinite(nasEntry.x) ? nasEntry.x : (nasSceneItem?.x ?? 0),
        y: Number.isFinite(nasEntry.y) ? nasEntry.y : (nasSceneItem?.y ?? 0),
        height: Number.isFinite(nasEntry.height)
          ? nasEntry.height
          : (Number(nasSceneItem?.elevation) || 0) + (Number(nasSceneItem?.height) || 0.34) / 2,
        modelAvailable: !!nasSceneItem,
        icon: nasEntry.icon || "mdi:nas"
      };
    });
  }

  /**
   * 收集窗帘绑定：合并配置项与场景模型，坐标 / 高度缺省取模型几何中心。
   */
  function collectCurtainBindings() {
    return (ctx.config.environment?.curtains || []).map((curtainBindingEntry: any) => {
      const curtainSceneItem = ctx.stageOptions.document.floors
        .find((matchingFloor: any) => matchingFloor.id === curtainBindingEntry.floorId)
        ?.scene.items.find(
          (matchingSceneItem: any) =>
            matchingSceneItem.id === curtainBindingEntry.modelId &&
            matchingSceneItem.type === "curtain"
        );
      return {
        ...curtainBindingEntry,
        deviceKind: "cover",
        x: Number.isFinite(curtainBindingEntry.x)
          ? curtainBindingEntry.x
          : (curtainSceneItem?.x ?? 0),
        y: Number.isFinite(curtainBindingEntry.y)
          ? curtainBindingEntry.y
          : (curtainSceneItem?.y ?? 0),
        height: Number.isFinite(curtainBindingEntry.height)
          ? curtainBindingEntry.height
          : curtainSceneItem
            ? (Number(curtainSceneItem.elevation) || 0) +
              (Number(curtainSceneItem.height) || 2.4) / 2
            : 0,
        ...ctx.resolveCurtainGeometry(curtainSceneItem, curtainBindingEntry),
        modelAvailable: !!curtainSceneItem,
        icon: curtainBindingEntry.icon || "mdi:curtains"
      };
    });
  }

  /**
   * 收集窗帘组合绑定（一拖多 / 双层帘）。
   */
  function collectCurtainGroupBindings() {
    const curtainBindingById = new Map(
      collectCurtainBindings().map((curtainBinding: any) => [curtainBinding.id, curtainBinding])
    );
    return validCurtainGroups(ctx.config.environment)
      .map((curtainGroupEntry: any) => {
        const memberItems = curtainGroupEntry.memberIds
          .map((memberId: any) => curtainBindingById.get(memberId))
          .filter(Boolean);
        // validCurtainGroups 已保证配置侧两名成员都存在；这里防的是绑定收集侧缺项（场景 / 状态
        if (memberItems.length !== 2) {
          return null;
        }
        const anchorMember = memberItems[0];
        return {
          ...curtainGroupEntry,
          id: curtainGroupEntryId(curtainGroupEntry),
          isCurtainGroup: true,
          deviceKind: "cover",
          // 组合没有自己的图标：标记层按 memberItems 的两枚图标合成，这里显式留空，
          icon: "",
          clickAction: curtainGroupEntry.clickAction || "focus",
          modelAvailable: true,
          // 组合未显式给坐标 / 高度时沿用第一副帘的落点，让新建组合与它替换掉的那副帘重合。
          x: Number.isFinite(curtainGroupEntry.x) ? curtainGroupEntry.x : anchorMember.x,
          y: Number.isFinite(curtainGroupEntry.y) ? curtainGroupEntry.y : anchorMember.y,
          height: Number.isFinite(curtainGroupEntry.height)
            ? curtainGroupEntry.height
            : anchorMember.height,
          memberItems
        };
      })
      .filter(Boolean);
  }

  /**
   * 舞台**渲染**用的窗帘绑定集合，与 collectCurtainBindings（控制 / 动画 / 反查用）区分开：
   */
  function collectCurtainDisplayBindings() {
    const groupedMemberIds = new Set(
      validCurtainGroups(ctx.config.environment).flatMap((group: any) => group.memberIds)
    );
    return [
      ...collectCurtainGroupBindings(),
      ...collectCurtainBindings().filter((curtainBinding: any) => !groupedMemberIds.has(curtainBinding.id))
    ];
  }

  // 收集扫地机房间快捷入口：visible === false 的扫地机不生成入口，
  function collectVacuumRoomShortcuts() {
    return collectVacuumBindings()
      .filter(
        (filteredVacuum: any) =>
          filteredVacuum.visible !== false &&
          (ctx.isEditing || filteredVacuum.entityId) &&
          (ctx.isEditing ||
            (!ctx.vacuumStatusPresentation(filteredVacuum, ctx.statesByEntityId).active &&
              ctx.resolveStateEntry(ctx.statesByEntityId[filteredVacuum.entityId])?.state !== "paused"))
      )
      .flatMap((shortcutOwnerVacuum: any) =>
        (shortcutOwnerVacuum.shortcuts || [])
          .filter((vacuumShortcutEntry: any) => ctx.isEditing || vacuumShortcutEntry.entityId)
          .map((roomShortcut: any) => ({
            ...roomShortcut,
            id: "vacuum-room:" + shortcutOwnerVacuum.id + ":" + roomShortcut.id,
            vacuumId: shortcutOwnerVacuum.id,
            shortcutId: roomShortcut.id,
            floorId: shortcutOwnerVacuum.floorId,
            height: roomShortcut.height ?? 0.08,
            deviceKind: "vacuum-room",
            modelAvailable: shortcutOwnerVacuum.modelAvailable,
            icon: roomShortcut.icon || "mdi:broom",
            size: roomShortcut.size ?? 44,
            iconSize: roomShortcut.iconSize ?? 26,
            hitSize: roomShortcut.hitSize ?? 44
          }))
      );
  }

  // 收集门锁绑定（安防模块的「门」）。
  const collectLockBindings = () =>
    (ctx.config.security?.locks || [])
      .map((securityLockEntry: any) => {
        const securityLockFloor = ctx.stageOptions.document.floors.find(
          (securityLockFloorCandidate: any) => securityLockFloorCandidate.id === securityLockEntry.floorId
        );
        // 与 stage.js 的动画清单、lock.py 同口径：先剥净 door: 前缀再补一次，裸门 ID 与
        const lockDoorRawModelId = String(securityLockEntry.modelId || "").replace(/^(?:door:)+/, "");
        const lockDoorModelId = lockDoorRawModelId ? "door:" + lockDoorRawModelId : "";
        const securityLockDoorModel =
          securityLockFloor &&
          doorModels(securityLockFloor).find(
            (securityLockDoorModelCandidate: any) =>
              securityLockDoorModelCandidate.modelId === lockDoorModelId
          );
        return {
          ...securityLockEntry,
          // 门轴方向：配置显式值 → 门模型自带 → 缺省左开。与舞台动画共用 lockHinge：两侧各写
          hinge: lockHinge(securityLockEntry, securityLockFloor),
          id: "lock:" + securityLockEntry.id,
          deviceKind: "lock",
          clickAction: "focus-panel",
          icon: securityLockEntry.icon || "mdi:door-closed",
          modelAvailable: !!securityLockDoorModel,
          x: Number.isFinite(securityLockEntry.x)
            ? securityLockEntry.x
            : (securityLockDoorModel?.x ?? 0),
          y: Number.isFinite(securityLockEntry.y)
            ? securityLockEntry.y
            : (securityLockDoorModel?.y ?? 0),
          // 门是立在地上的薄片：标记高度取门高的一半（即门的几何中心），而不是底面。
          height: Number.isFinite(securityLockEntry.height)
            ? securityLockEntry.height
            : (securityLockDoorModel?.height ?? 2.2) * 0.5
        };
      })
      // 展示态把「一个实体都没绑」的门丢掉：这种门点了也没有任何可看内容，
      .filter(
        (securityLockFilterEntry: any) =>
          ctx.isEditing ||
          securityLockFilterEntry.doorEntityId ||
          securityLockFilterEntry.doorEventEntityId ||
          securityLockFilterEntry.doorOpenEntityId ||
          securityLockFilterEntry.doorCloseEntityId ||
          securityLockFilterEntry.batteryEntityId ||
          securityLockFilterEntry.entityId
      );

  // 收集温湿度计绑定（环境模块的「温湿度计」）。
  const collectTemperatureHumidityBindings = () =>
    (ctx.config.environment?.temperatureHumidity || []).map((temperatureHumidityEntry: any) => {
      const temperatureHumidityFloor = ctx.stageOptions.document.floors.find(
        (temperatureHumidityFloorCandidate: any) =>
          temperatureHumidityFloorCandidate.id === temperatureHumidityEntry.floorId
      );
      const temperatureHumidityCenter = temperatureHumidityFloorCenter(temperatureHumidityFloor);
      return {
        ...temperatureHumidityEntry,
        deviceKind: "temperature-humidity",
        clickAction: "focus",
        icon: "",
        // 信息卡不依赖场景模型，标记永远可定位；缺省 `modelAvailable !== false` 同理，
        modelAvailable: true,
        x: Number.isFinite(temperatureHumidityEntry.x)
          ? temperatureHumidityEntry.x
          : temperatureHumidityCenter.x,
        y: Number.isFinite(temperatureHumidityEntry.y)
          ? temperatureHumidityEntry.y
          : temperatureHumidityCenter.y,
        // 1.8 米是人眼平视高度（参考实现给新建温湿度计的缺省值）。
        height: Number.isFinite(temperatureHumidityEntry.height)
          ? temperatureHumidityEntry.height
          : 1.8
      };
    });

  // 收集「场景里有窗帘模型但配置未绑定实体」的预览窗帘：按 楼层 + 模型 去重，
  function collectPreviewCovers() {
    const boundCoverKeys = new Set(
      collectCurtainBindings().map((boundCurtain: any) =>
        ctx.sceneModelKey(boundCurtain.floorId, boundCurtain.modelId)
      )
    );
    return ctx.stageOptions.document.floors.flatMap((previewFloor: any) =>
      (previewFloor.scene?.items || [])
        .filter(
          (previewSceneItem: any) =>
            previewSceneItem.type === "curtain" &&
            !boundCoverKeys.has(ctx.sceneModelKey(previewFloor.id, previewSceneItem.id))
        )
        .map((previewCurtainItem: any) => ({
          id: "preview-cover:" + JSON.stringify([previewFloor.id, previewCurtainItem.id]),
          floorId: previewFloor.id,
          modelId: previewCurtainItem.id,
          entityId: "",
          deviceKind: "cover",
          ...ctx.resolveCurtainGeometry(previewCurtainItem),
          modelAvailable: true,
          previewOnly: true
        }))
    );
  }

  // 收集通用设备绑定（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）。
  function collectGenericDeviceBindings(deviceKind: any) {
    const genericProfile = genericDeviceProfile(deviceKind);
    return genericProfile
      ? (ctx.config.devices?.[genericProfile.collection] || []).map((genericDeviceEntry: any) => {
          // 按「模型 id + 品类对应的模型类型」配对：同一楼层里可能有同名 id 的别的模型，
          const genericSceneItem = ctx.stageOptions.document.floors
            .find((genericFloor: any) => genericFloor.id === genericDeviceEntry.floorId)
            ?.scene.items.find(
              (genericSceneItemCandidate: any) =>
                genericSceneItemCandidate.id === genericDeviceEntry.modelId &&
                genericSceneItemCandidate.type === genericProfile.modelType
            );
          return {
            ...genericDeviceEntry,
            clickAction: genericDeviceEntry.clickAction || "focus-panel",
            deviceKind,
            deviceLabel: genericProfile.label,
            x: Number.isFinite(genericDeviceEntry.x)
              ? genericDeviceEntry.x
              : genericSceneItem?.x ?? 0,
            y: Number.isFinite(genericDeviceEntry.y)
              ? genericDeviceEntry.y
              : genericSceneItem?.y ?? 0,
            height: Number.isFinite(genericDeviceEntry.height)
              ? genericDeviceEntry.height
              : (Number(genericSceneItem?.elevation) || 0) +
                (Number(genericSceneItem?.height) || genericProfile.height) / 2,
            modelAvailable: !!genericSceneItem,
            icon: genericDeviceEntry.icon || genericProfile.icon
          };
        })
      : [];
  }

  // 所有已配置设备，不分它属于哪个模块。ID 约定与各模块保持一致，
  function collectAllDeviceBindings() {
    return [
      ...collectClimateBindings(),
      ...collectCurtainDisplayBindings(),
      ...collectNasBindings(),
      ...collectTelevisionBindings(),
      ...collectVacuumBindings(),
      ...collectCameraBindings(),
      ...collectPresenceBindings(),
      ...collectLockBindings(),
      ...collectTemperatureHumidityBindings(),
      ...GENERIC_DEVICE_KINDS.flatMap(collectGenericDeviceBindings)
    ].map((bindingEntry: any) => ({
      ...bindingEntry,
      // 这三类在收集时就带了带前缀的 id（lock: / camera: / presence:），再拼一次会变成
      id: ["camera", "presence", "lock"].includes(bindingEntry.deviceKind)
        ? bindingEntry.id
        : bindingEntry.deviceKind + ":" + bindingEntry.id
    }));
  }

  // 总览页的标记集合：灯光 + 全部设备。
  function collectOverviewBindings() {
    return [...(ctx.config.lights || []), ...collectAllDeviceBindings()];
  }

  // 模块绑定的统一入口：安防模块把摄像头与人体传感器合并，其余模块直接用
  const collectModuleBindings = () => {
    let moduleBindings =
      ctx.activeModule === "security"
        ? [
            ...collectLockBindings(),
            ...collectCameraBindings(),
            ...collectPresenceBindings().filter(
              (securitySensorEntry: any) => ctx.isEditing && securitySensorEntry.modelId
            )
          ]
        : ctx.activeModule === "light"
          ? ctx.config.lights || []
          : [
              ...resolveModuleBindings(),
              ...(ctx.activeModule === "vacuum" && !ctx.isEditing ? collectVacuumRoomShortcuts() : [])
            ];
    if (!ctx.isEditing && ctx.activeModule === "light") {
      moduleBindings = [
        ...moduleBindings,
        ...collectVacuumBindings()
          .filter(
            (overviewVacuumEntry: any) =>
              overviewVacuumEntry.entityId &&
              ctx.vacuumStatusPresentation(overviewVacuumEntry, ctx.statesByEntityId).active &&
              ctx.vacuumQuip(overviewVacuumEntry, ctx.statesByEntityId, performance.now())
          )
          .map((quipVacuum: any) => ({
            ...quipVacuum,
            id: "vacuum:" + quipVacuum.id,
            overviewQuip: true
          }))
      ];
    }
    return moduleBindings.filter(ctx.isOnActiveFloor);
  };

  /**
   * 按当前模块解析出要显示的标记绑定。
   */
  function resolveModuleBindings() {
    if (!ctx.isEditing && ctx.isOverviewMode()) {
      // 总览 / 全部楼层 只展示房子；设备按钮各自留在自己的页签里。
      return [];
    } else if (ctx.activeModule === "overview") {
      return collectOverviewBindings();
    } else if (ctx.activeModule === "security") {
      return [...collectLockBindings(), ...collectCameraBindings(), ...collectPresenceBindings()];
    } else if (ctx.activeModule === "vacuum-shortcut") {
      return collectVacuumRoomShortcuts().filter(
        (shortcutFilterEntry: any) => shortcutFilterEntry.vacuumId === ctx.editingVacuumId
      );
    } else if (ctx.activeModule === "nas") {
      return collectNasBindings();
    } else if (ctx.activeModule === "vacuum") {
      return collectVacuumBindings()
        .filter((vacuumFilterEntry: any) => ctx.isEditing || vacuumFilterEntry.entityId)
        .map((vacuumBinding: any) => ({
          ...vacuumBinding,
          id: ctx.isEditing ? vacuumBinding.id : "vacuum:" + vacuumBinding.id
        }));
    } else if (ctx.activeModule === "television") {
      return collectTelevisionBindings();
    } else if (isGenericDeviceKind(ctx.activeModule)) {
      // 编辑某一品类（冰箱 / 绿植 / …）时 activeModule 就是品类名：标记 id 保持裸 id，
      return collectGenericDeviceBindings(ctx.activeModule);
    } else if (ctx.activeModule === "devices") {
      // 「设备」是 NAS / 电视 / 五个通用设备品类的聚合页签：三者的绑定在同一份配置里，
      return [
        ...collectNasBindings(),
        ...collectTelevisionBindings(),
        ...GENERIC_DEVICE_KINDS.flatMap(collectGenericDeviceBindings)
      ].map((deviceBinding: any) => ({
        ...deviceBinding,
        id: deviceBinding.deviceKind + ":" + deviceBinding.id
      }));
    } else if (ctx.activeModule === "cover") {
      return collectCurtainDisplayBindings();
    } else if (ctx.activeModule === "climate") {
      return collectClimateBindings();
    } else if (ctx.activeModule === "temperature-humidity") {
      // 温湿度计是独立页签：标记 id 保持裸 id，编辑器的选中 / 拖拽回写才能直接对上配置项。
      return collectTemperatureHumidityBindings();
    } else {
      return [...collectClimateBindings(), ...collectCurtainDisplayBindings()].map(
        environmentDeviceBinding => ({
          ...environmentDeviceBinding,
          id: environmentDeviceBinding.deviceKind + ":" + environmentDeviceBinding.id
        })
      );
    }
  }
  return { collectAllDeviceBindings, collectCameraBindings, collectClimateBindings, collectCurtainBindings, collectCurtainDisplayBindings, collectCurtainGroupBindings, collectLockBindings, collectModuleBindings, collectNasBindings, collectOverviewBindings, collectPresenceBindings, collectPreviewCovers, collectTelevisionBindings, collectTemperatureHumidityBindings, collectVacuumBindings, collectVacuumRoomShortcuts, resolveModuleBindings };
}
