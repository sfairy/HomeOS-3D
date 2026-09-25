/*
 * 绑定收集。
 *
 * 从配置与状态表里收集各设备类型的绑定项，供标记渲染、面板与命中测试共用。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
 */

// 通用设备的品类表：品类名 → { collection, modelType, label, icon, height }。
// 五个品类共用同一段收集逻辑，靠这张表把「集合名 / 模型类型 / 缺省高度」参数化。
import {
  GENERIC_DEVICE_KINDS,
  genericDeviceProfile
} from "../../device/device-profiles.js?v=2609251920";
// 门模型的展开口径与运行时 / 编辑器共用同一份实现（实现在 static/bridge/lock-state-runtime.js）：
// 锁绑定要靠它把配置里的 modelId 对到楼层场景里那扇门，从而拿到门轴、门型与缺省坐标。
import { doorModels } from "../../security/lock-state.js?v=2609251920";

export function createBindingCollectors(ctx) {
  /**
   * 收集扫地机绑定：合并配置项、场景模型与运行期偏移（拖拽 / 动画位置）。
   * 编辑态忽略偏移，保证编辑器里显示的一直是配置坐标。
   */
  function collectVacuumBindings() {
    return (ctx.config.devices?.vacuums || []).map(vacuumBindingEntry => {
      const vacuumSceneItem = ctx.stageOptions.document.floors
        .find(vacuumFloor => vacuumFloor.id === vacuumBindingEntry.floorId)
        ?.scene.items.find(
          vacuumSceneItemCandidate =>
            vacuumSceneItemCandidate.id === vacuumBindingEntry.modelId &&
            vacuumSceneItemCandidate.type === "robotvacuum"
        );
      // 编辑态必须忽略运行期偏移：编辑器里显示与保存的都是配置坐标，
      // 否则拖拽动画跑过之后会把动画位置当成用户摆的位置存下去。
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
    (ctx.config.security?.cameras || []).map(securityCameraEntry => {
      const securityCameraSceneItem = ctx.stageOptions.document.floors
        .find(securityCameraFloor => securityCameraFloor.id === securityCameraEntry.floorId)
        ?.scene.items.find(
          cameraSceneItemCandidate =>
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
   * 收集空调绑定：把配置项与场景模型（挂机 / 柜机 / 出风口）合并。
   * 坐标优先用配置里的显式值（编辑器拖拽过），缺省回落到模型坐标与几何中心高度。
   */
  function collectClimateBindings() {
    return (ctx.config.environment?.airConditioners || []).map(airConditionerEntry => {
      const climateSceneItem = ctx.stageOptions.document.floors
        .find(floorCandidate => floorCandidate.id === airConditionerEntry.floorId)
        ?.scene.items.find(
          sceneItemCandidate =>
            sceneItemCandidate.id === airConditionerEntry.modelId &&
            ["wallac", "floorac", "airoutlet"].includes(sceneItemCandidate.type)
        );
      return {
        ...airConditionerEntry,
        deviceKind: "climate",
        x: Number.isFinite(airConditionerEntry.x)
          ? airConditionerEntry.x
          : (climateSceneItem?.x ?? 0),
        y: Number.isFinite(airConditionerEntry.y)
          ? airConditionerEntry.y
          : (climateSceneItem?.y ?? 0),
        height: Number.isFinite(airConditionerEntry.height)
          ? airConditionerEntry.height
          : climateSceneItem
            ? (Number(climateSceneItem.elevation) || 0) +
              (Number(climateSceneItem.height) || 0.28) / 2
            : 0,
        modelAvailable: !!climateSceneItem,
        icon: airConditionerEntry.icon || "mdi:air-conditioner"
      };
    });
  }

  // 收集人体传感器绑定，供存在场景与点击热区布局共用。
  const collectPresenceBindings = () =>
    (ctx.config.security?.presenceSensors || []).map(presenceSensorBindingEntry => {
      const presenceSceneItem = ctx.stageOptions.document.floors
        .find(sensorFloor => sensorFloor.id === presenceSensorBindingEntry.floorId)
        ?.scene.items.find(
          sensorSceneItemCandidate =>
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
    return (ctx.config.devices?.televisions || []).map(televisionEntry => {
      const televisionSceneItem = ctx.stageOptions.document.floors
        .find(televisionFloor => televisionFloor.id === televisionEntry.floorId)
        ?.scene.items.find(
          televisionSceneItemCandidate =>
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
    return (ctx.config.devices?.nas || []).map(nasEntry => {
      const nasSceneItem = ctx.stageOptions.document.floors
        .find(nasFloor => nasFloor.id === nasEntry.floorId)
        ?.scene.items.find(
          nasSceneItemCandidate =>
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
    return (ctx.config.environment?.curtains || []).map(curtainBindingEntry => {
      const curtainSceneItem = ctx.stageOptions.document.floors
        .find(matchingFloor => matchingFloor.id === curtainBindingEntry.floorId)
        ?.scene.items.find(
          matchingSceneItem =>
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

  // 收集扫地机房间快捷入口：visible === false 的扫地机不生成入口，
  // 避免出现看得见却点不到的按钮。
  function collectVacuumRoomShortcuts() {
    return collectVacuumBindings()
      .filter(
        filteredVacuum =>
          filteredVacuum.visible !== false &&
          (ctx.isEditing || filteredVacuum.entityId) &&
          (ctx.isEditing ||
            (!ctx.vacuumStatusPresentation(filteredVacuum, ctx.statesByEntityId).active &&
              ctx.resolveStateEntry(ctx.statesByEntityId[filteredVacuum.entityId])?.state !== "paused"))
      )
      .flatMap(shortcutOwnerVacuum =>
        (shortcutOwnerVacuum.shortcuts || [])
          .filter(vacuumShortcutEntry => ctx.isEditing || vacuumShortcutEntry.entityId)
          .map(roomShortcut => ({
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
  //
  // 一条锁配置本身不是控件，它指向「一扇门」：门模型来自楼层的 scene.doors（要么是工作室导出的
  // 门模型，要么是画在墙上的户型门由 doorModels 插值出坐标）。这里把配置项与门模型合并成绑定，
  // 门轴方向、门型、缺省坐标都从门模型补 —— 舞台上的门动画要按门型选 rig、按门轴定旋转中心。
  const collectLockBindings = () =>
    (ctx.config.security?.locks || [])
      .map(securityLockEntry => {
        const securityLockFloor = ctx.stageOptions.document.floors.find(
          securityLockFloorCandidate => securityLockFloorCandidate.id === securityLockEntry.floorId
        );
        const securityLockDoorModel =
          securityLockFloor &&
          doorModels(securityLockFloor).find(
            securityLockDoorModelCandidate =>
              securityLockDoorModelCandidate.modelId === securityLockEntry.modelId
          );
        return {
          ...securityLockEntry,
          // 门轴方向：配置显式值 → 门模型自带 → 缺省左开。三级兜底是为了让旧配置
          // （没写 hinge）也能拿到一扇能正常旋转的门，而不是绕错边甩出去。
          hinge: securityLockEntry.hinge || securityLockDoorModel?.hinge || "left",
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
          // 2.2 米是标准门高，门模型没给高度时用它兜底。
          height: Number.isFinite(securityLockEntry.height)
            ? securityLockEntry.height
            : (securityLockDoorModel?.height ?? 2.2) * 0.5
        };
      })
      // 展示态把「一个实体都没绑」的门丢掉：这种门点了也没有任何可看内容，
      // 留在舞台上只会挡住场景。编辑态必须全部保留，否则用户没法把新门拖到舞台上配置。
      .filter(
        securityLockFilterEntry =>
          ctx.isEditing ||
          securityLockFilterEntry.doorEntityId ||
          securityLockFilterEntry.doorEventEntityId ||
          securityLockFilterEntry.doorOpenEntityId ||
          securityLockFilterEntry.doorCloseEntityId ||
          securityLockFilterEntry.batteryEntityId ||
          securityLockFilterEntry.entityId
      );

  // 收集「场景里有窗帘模型但配置未绑定实体」的预览窗帘：按 楼层 + 模型 去重，
  // 让编辑器在未绑定状态下也能看到窗帘。
  // 去重键走 core/scene-model-key.js：两侧都必须归一（配置侧可能没写楼层、场景项一侧可能缺字段），
  // 否则同一个窗帘会被判成「未绑定」而多出一条假预览。
  function collectPreviewCovers() {
    const boundCoverKeys = new Set(
      collectCurtainBindings().map(boundCurtain =>
        ctx.sceneModelKey(boundCurtain.floorId, boundCurtain.modelId)
      )
    );
    return ctx.stageOptions.document.floors.flatMap(previewFloor =>
      (previewFloor.scene?.items || [])
        .filter(
          previewSceneItem =>
            previewSceneItem.type === "curtain" &&
            !boundCoverKeys.has(ctx.sceneModelKey(previewFloor.id, previewSceneItem.id))
        )
        .map(previewCurtainItem => ({
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

  // 收集通用设备绑定（冰箱 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）。
  //
  // 五个品类只有「集合名、模型类型、缺省图标与高度」三处差异，全部走 device-profiles 表，
  // 这样后面再加品类时这里一行不用改。`deviceKind` 直接就是品类名 —— stage.js 的
  // isGenericDeviceKind(deviceKind) 靠它判是不是通用设备弹窗。
  function collectGenericDeviceBindings(deviceKind) {
    const genericProfile = genericDeviceProfile(deviceKind);
    return genericProfile
      ? (ctx.config.devices?.[genericProfile.collection] || []).map(genericDeviceEntry => {
          // 按「模型 id + 品类对应的模型类型」配对：同一楼层里可能有同名 id 的别的模型，
          // 只看 id 会把冰箱认成旁边的柜子，于是 modelAvailable 与坐标一起错。
          const genericSceneItem = ctx.stageOptions.document.floors
            .find(genericFloor => genericFloor.id === genericDeviceEntry.floorId)
            ?.scene.items.find(
              genericSceneItemCandidate =>
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
  // 这样总览页可以直接复用 findBinding / activateBinding。
  function collectAllDeviceBindings() {
    return [
      ...collectClimateBindings(),
      ...collectCurtainBindings(),
      ...collectNasBindings(),
      ...collectTelevisionBindings(),
      ...collectVacuumBindings(),
      ...collectCameraBindings(),
      ...collectPresenceBindings(),
      ...collectLockBindings(),
      ...GENERIC_DEVICE_KINDS.flatMap(collectGenericDeviceBindings)
    ].map(bindingEntry => ({
      ...bindingEntry,
      // 这三类在收集时就带了带前缀的 id（lock: / camera: / presence:），再拼一次会变成
      // "lock:lock:xxx"；其余设备类型的 id 是裸 id，需要在这里补前缀。
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
  // resolveModuleBindings 的结果。
  const collectModuleBindings = () => {
    let moduleBindings =
      ctx.activeModule === "security"
        ? [
            ...collectLockBindings(),
            ...collectCameraBindings(),
            ...collectPresenceBindings().filter(
              securitySensorEntry => ctx.isEditing && securitySensorEntry.modelId
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
            overviewVacuumEntry =>
              overviewVacuumEntry.entityId &&
              ctx.vacuumStatusPresentation(overviewVacuumEntry, ctx.statesByEntityId).active &&
              ctx.vacuumQuip(overviewVacuumEntry, ctx.statesByEntityId, performance.now())
          )
          .map(quipVacuum => ({
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
   * 展示态的「总览 / 全部楼层」刻意返回空数组：那两种模式只展示房子本体，
   * 设备按钮留给各自的模块页签。
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
        shortcutFilterEntry => shortcutFilterEntry.vacuumId === ctx.editingVacuumId
      );
    } else if (ctx.activeModule === "nas") {
      return collectNasBindings();
    } else if (ctx.activeModule === "vacuum") {
      return collectVacuumBindings()
        .filter(vacuumFilterEntry => ctx.isEditing || vacuumFilterEntry.entityId)
        .map(vacuumBinding => ({
          ...vacuumBinding,
          id: ctx.isEditing ? vacuumBinding.id : "vacuum:" + vacuumBinding.id
        }));
    } else if (ctx.activeModule === "television") {
      return collectTelevisionBindings();
    } else if (ctx.activeModule === "devices") {
      return [...collectNasBindings(), ...collectTelevisionBindings()].map(deviceBinding => ({
        ...deviceBinding,
        id: deviceBinding.deviceKind + ":" + deviceBinding.id
      }));
    } else if (ctx.activeModule === "cover") {
      return collectCurtainBindings();
    } else if (ctx.activeModule === "climate") {
      return collectClimateBindings();
    } else {
      return [...collectClimateBindings(), ...collectCurtainBindings()].map(
        environmentDeviceBinding => ({
          ...environmentDeviceBinding,
          id: environmentDeviceBinding.deviceKind + ":" + environmentDeviceBinding.id
        })
      );
    }
  }
  return { collectAllDeviceBindings, collectCameraBindings, collectClimateBindings, collectCurtainBindings, collectLockBindings, collectModuleBindings, collectNasBindings, collectOverviewBindings, collectPresenceBindings, collectPreviewCovers, collectTelevisionBindings, collectVacuumBindings, collectVacuumRoomShortcuts, resolveModuleBindings };
}
