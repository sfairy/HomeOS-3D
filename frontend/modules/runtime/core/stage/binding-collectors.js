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
} from "../../device/device-profiles.js?v=2609252218";
// 门模型的展开口径与运行时 / 编辑器共用同一份实现（实现在 static/bridge/lock-state-runtime.js）：
// 锁绑定要靠它把配置里的 modelId 对到楼层场景里那扇门，从而拿到门轴、门型与缺省坐标。
import { doorModels } from "../../security/lock-state.js?v=2609252218";
// 温湿度计的缺省落点：没有显式 x / y 时落在楼层几何中心，与工作室放置新标记的口径同源
// （实现在 static/bridge/temperature-humidity.js，经运行侧薄桥转出）。
import { temperatureHumidityFloorCenter } from "../static-helpers.js?v=2609252218";
// 窗帘组合（一拖多）的归一与舞台条目 id 口径：编辑器的配对候选、组合面板与舞台绑定必须
// 共用同一份判据，否则会出现「编辑器认的组合舞台不认」这类静默的两套逻辑。
import {
  curtainGroupEntryId,
  validCurtainGroups
} from "../../cover/cover-groups.js?v=2609252218";

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
   * 收集「环境」里成对的空调 / 净化器绑定：把配置项与场景模型合并。
   * 坐标优先用配置里的显式值（编辑器拖拽过），缺省回落到模型坐标与几何中心高度。
   *
   * 净化器与空调共用这一份，而不是各写一套：运行时它同属 `climate` 模块，面板按实体域
   * （fan → `deviceState.purifier`）决定渲染净化器控件，所以绑定的形状必须逐字一致。
   * 两者只有三处不同：配置集合名、场景模型的 type 白名单、兜底图标与兜底高度
   * （兜底高度取各自模型的真实高度，见 tools/models/model-specs.mjs）。
   */
  function collectEnvironmentClimateEntries(entries, modelTypes, fallbackIcon, fallbackHeight) {
    return (entries || []).map(climateEntry => {
      const climateSceneItem = ctx.stageOptions.document.floors
        .find(floorCandidate => floorCandidate.id === climateEntry.floorId)
        ?.scene.items.find(
          sceneItemCandidate =>
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
   *
   * 净化器必须在这里一起收集：它的配置项存在 `environment.airPurifiers` 里，漏了这一步
   * 场景里就不会生成它的绑定，模型不渲染、点不开面板、控制直接失效 —— 而配置与后端校验
   * 都是通过的，浏览器里一点报错都没有。
   */
  function collectClimateBindings() {
    return [
      ...collectEnvironmentClimateEntries(
        ctx.config.environment?.airConditioners,
        ["wallac", "floorac", "airoutlet"],
        "mdi:air-conditioner",
        0.28
      ),
      // 净化器在场景里是独立外观（type === "airpurifier"，studio 有专用构建器），
      // 后端 purifier.py 的 require_purifier_model 也只认它 —— 借用空调那套白名单
      // 会让每一台净化器都绑不上模型（modelAvailable 恒为 false）。
      ...collectEnvironmentClimateEntries(
        ctx.config.environment?.airPurifiers,
        ["airpurifier"],
        "mdi:air-purifier",
        0.7
      )
    ];
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

  /**
   * 收集窗帘组合绑定（一拖多 / 双层帘）。
   *
   * 一个组合在舞台上只呈现为**一个**条目，替换掉它的两名成员（否则两副帘会冒出三个图标）。
   * 组合本身不带状态：memberItems 是两名成员各自的**普通窗帘绑定**（与 collectCurtainBindings
   * 同一口径的字段名），组面板据此为每个成员各渲染一块子面板、各自开合。
   * id 走 curtainGroupEntryId（"curtain-group:" 前缀），与普通窗帘的裸 id 不会撞车，拖拽 /
   * 选中回写时也能靠前缀反查到配置里的组合。
   */
  function collectCurtainGroupBindings() {
    const curtainBindingById = new Map(
      collectCurtainBindings().map(curtainBinding => [curtainBinding.id, curtainBinding])
    );
    return validCurtainGroups(ctx.config.environment)
      .map(curtainGroupEntry => {
        const memberItems = curtainGroupEntry.memberIds
          .map(memberId => curtainBindingById.get(memberId))
          .filter(Boolean);
        // validCurtainGroups 已保证配置侧两名成员都存在；这里防的是绑定收集侧缺项（场景 / 状态
        // 尚未就绪时）。成员凑不齐就整条不渲染，避免面板为半条组合空出一块。
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
          // 免得下游的 `icon || 默认图标` 把组合画成单枚窗帘。
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
   * 这里把已被组合收录的成员滤掉，换成对应的组合条目。
   *
   * 不做这层过滤，一名成员会同时以「组合的一部分」和「独立窗帘」两种身份出现，画面上就是
   * 两副帘三个图标。控制路径刻意仍走 collectCurtainBindings：组内成员的子面板命令要通过
   * entityId 反查到成员绑定，滤掉就控不了。
   */
  function collectCurtainDisplayBindings() {
    const groupedMemberIds = new Set(
      validCurtainGroups(ctx.config.environment).flatMap(group => group.memberIds)
    );
    return [
      ...collectCurtainGroupBindings(),
      ...collectCurtainBindings().filter(curtainBinding => !groupedMemberIds.has(curtainBinding.id))
    ];
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

  // 收集温湿度计绑定（环境模块的「温湿度计」）。
  //
  // 与门锁不同，温湿度计不指向任何场景模型：它是一块悬在楼层上方的信息卡，位置完全由配置
  // 给出（编辑器拖拽写回 x / y）。缺省落点取楼层几何中心 —— 与工作室放置新标记的口径同源
  // （bridge 的 temperatureHumidityFloorCenter）。因此这里不做模型匹配，只补设备种类与缺省坐标。
  const collectTemperatureHumidityBindings = () =>
    (ctx.config.environment?.temperatureHumidity || []).map(temperatureHumidityEntry => {
      const temperatureHumidityFloor = ctx.stageOptions.document.floors.find(
        temperatureHumidityFloorCandidate =>
          temperatureHumidityFloorCandidate.id === temperatureHumidityEntry.floorId
      );
      const temperatureHumidityCenter = temperatureHumidityFloorCenter(temperatureHumidityFloor);
      return {
        ...temperatureHumidityEntry,
        deviceKind: "temperature-humidity",
        clickAction: "focus",
        icon: "",
        // 信息卡不依赖场景模型，标记永远可定位；缺省 `modelAvailable !== false` 同理，
        // 这里显式写成 true，免得下游把「没配模型」误读成「模型被移除」。
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
      ...collectCurtainDisplayBindings(),
      ...collectNasBindings(),
      ...collectTelevisionBindings(),
      ...collectVacuumBindings(),
      ...collectCameraBindings(),
      ...collectPresenceBindings(),
      ...collectLockBindings(),
      ...collectTemperatureHumidityBindings(),
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
      // 编辑态下 activeModule 就是 "cover"：标记 id 保持裸 id（组合是 "curtain-group:" 前缀），
      // 编辑器的选中 / 拖拽回写才能直接对上配置项。
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
