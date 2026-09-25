/**
 * 扫地机底图（地图）在 3D 舞台里的运行时支撑。
 * 在「绑定配置（后端持久化）↔ 舞台渲染（Three.js）」之间负责三件事：绑定解析（按实时地图身份
 * 过滤多楼层绑定，避免串图）、贴图加载（按 revision 轮询、换图淡入、隐藏/停用/切楼层即释放）、
 * 状态文案（原始状态翻译成中文标签、电量与是否运行中）。
 *
 * 约定：mapCorners 输出楼层平面坐标（与世界坐标同为「米」），经 worldPoint 换算到舞台空间；
 * 底图无厚度，靠 height（0.025 起、按索引递增 0.001 米）错开避免 z-fighting；图片地址一律走
 * mapSource 且带 hb 时间戳；空闲轮询 5 秒、运行态收紧到 1 秒、页面隐藏时不请求。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
// 里那两份），这里经 static-helpers 桥取用：运行侧（舞台页能以 file: 打开）不能写裸
// `/static/...` 的静态 import，桥按更严的那种口径分流（见该文件里的两条纪律）。
import { resolveStateEntry } from "../core/static-helpers.js?v=2609252218";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=2609252218";
/**
 * 计算「地图身份」字符串，用于判断绑定配置里的 sourceMapId 是否仍指向当前地图。
 * 取值优先级：saved_map_id / selected_map_id → "saved:<id>"，退化为 map_index → "index:<n>"，
 * 最后回退原始地图 ID 字符串；统一加前缀是因为 saved_map_id 与 map_id 可能数值相同但语义不同。
 */
export function vacuumMapIdentity(mapEntityEntry, vacuumEntityEntry) {
  // 兼容两种入参形态：事件回调包裹了一层 newState，轮询接口则直接给 state 本身。
  const mapIdentityAttributes = resolveStateEntry(mapEntityEntry)?.attributes || {};
  const vacuumIdentityAttributes =
    resolveStateEntry(vacuumEntityEntry)?.attributes || {};
  // HA 的属性值可能是字符串或数字，空串、NaN 都视为「没有这个 ID」。
  const isUsableIdValue = idValue =>
    (typeof idValue == "string" && idValue) ||
    (typeof idValue == "number" && Number.isFinite(idValue));
  // 首选持久化槽位：地图实体上的 saved/selected 槽位，或扫地机侧当前选中的槽位。
  for (const savedMapIdCandidate of [
    mapIdentityAttributes.saved_map_id,
    mapIdentityAttributes.selected_map_id,
    vacuumIdentityAttributes.selected_map_id
  ]) {
    if (isUsableIdValue(savedMapIdCandidate)) {
      return "saved:" + savedMapIdCandidate;
    }
  }
  // 次选建图序号：没有持久化槽位时（例如正在建图），用 map_index 区分第几张图。
  if (isUsableIdValue(mapIdentityAttributes.map_index)) {
    return "index:" + mapIdentityAttributes.map_index;
  }
  // 最后兜底：只认这几个约定字段名，防止把 name 之类同值字段误当成地图 ID。
  for (const mapIdKey of ["map_id", "current_map_id", "map_index", "selected_map_id"]) {
    const mapIdValue = mapIdentityAttributes[mapIdKey];
    if (
      (typeof mapIdValue == "string" && mapIdValue) ||
      (typeof mapIdValue == "number" && Number.isFinite(mapIdValue))
    ) {
      return String(mapIdValue);
    }
  }
  return "";
}
/**
 * 过滤出「当前应该渲染」的底图绑定：一条绑定记录「扫地机 + 地图实体 + 楼层 + 保存时的 sourceMapId」，
 * 设备换图或被多楼层复用，故按实时状态二次判定：sourceMapId 为空时多楼层兄弟只留一条、单条保留；
 * 与当前地图身份一致则保留，旧格式用 map_id/current_map_id 比对（单楼层 saved 图升级为 "saved:<id>"）。
 */
export function vacuumBindingsForMap(bindings, statesByEntityId) {
  return bindings.flatMap(binding => {
    // 实体状态可能来自事件（多包一层 newState）或轮询快照（本身就是 state），两种形态都取属性。
    const mapEntityState = statesByEntityId[binding.map?.entityId];
    const vacuumEntityState = statesByEntityId[binding.entityId];
    // 地图实体的属性表，缺失时兜底成空对象，后面取值不再判空。
    const mapAttributes = resolveStateEntry(mapEntityState)?.attributes || {};
    // 扫地机属性：多楼层标记（multi_floor_map）等判定依据都在这里。
    const vacuumStateAttributes =
      resolveStateEntry(vacuumEntityState)?.attributes || {};
    const mapIdentity = vacuumMapIdentity(mapEntityState, vacuumEntityState);
    const sourceMapId = binding.map?.sourceMapId;
    // 兄弟绑定：同一扫地机 + 同一地图实体，但落在别的楼层。多楼层共用一张图时用来去重。
    const hasSiblingBinding = bindings.some(
      sibling =>
        sibling !== binding &&
        sibling.floorId !== binding.floorId &&
        sibling.entityId === binding.entityId &&
        sibling.map?.entityId === binding.map?.entityId
    );
    // 没记录来源地图：多楼层复用时只让非兄弟的那一条生效，否则整栋楼都会贴同一张图。
    if (!sourceMapId) {
      if (hasSiblingBinding) {
        return [];
      } else {
        return [binding];
      }
    }
    // 来源地图与设备当前地图身份完全一致，直接沿用。
    if (sourceMapId === mapIdentity) {
      return [binding];
    }
    // 旧数据的 sourceMapId 是裸 ID（无 saved:/index: 前缀），需要单独兼容一套比对规则。
    const isPlainSourceMapId = !sourceMapId.includes(":");
    // 兼容旧格式：直接拿地图实体上报的 map_id/current_map_id 与裸 ID 比对；
    // 若比对不上，但属于单楼层设备（multi_floor_map === false）且当前是 saved 地图，
    // 就把裸 ID 原地升级成 "saved:<id>"，让这条绑定跟上新格式。
    if (
      isPlainSourceMapId &&
      String(mapAttributes.map_id ?? mapAttributes.current_map_id ?? "") === sourceMapId
    ) {
      return [binding];
    } else if (
      isPlainSourceMapId &&
      !hasSiblingBinding &&
      vacuumStateAttributes.multi_floor_map === false &&
      mapIdentity.startsWith("saved:")
    ) {
      return [
        {
          ...binding,
          map: {
            ...binding.map,
            sourceMapId: mapIdentity
          }
        }
      ];
    } else {
      return [];
    }
  });
}
/**
 * 把地图矩形换算成楼层平面坐标里的四个角点：以单位正方形四角 (-0.5,-0.5)…(0.5,0.5) 为基准，
 * 先按 width/depth 缩放（单位与 mapConfig.x/y 一致，即米），再绕地图中心旋转。
 * 输出顺序固定为左上、右上、右下、左下，调用方（Three.js 顶点属性与 SVG polygon）依赖此顺序不能调换。
 */
export function mapCorners(mapConfig) {
  // 角度转弧度；rotation 缺省或为 0 时按未旋转处理。
  const rotationRad = ((mapConfig.rotation || 0) * Math.PI) / 180;
  const cosRotation = Math.cos(rotationRad);
  const sinRotation = Math.sin(rotationRad);
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5]
  ].map(([unitX, unitY]) => ({
    x: mapConfig.x + unitX * mapConfig.width * cosRotation - unitY * mapConfig.depth * sinRotation,
    y: mapConfig.y + unitX * mapConfig.width * sinRotation + unitY * mapConfig.depth * cosRotation
  }));
}
/**
 * 生成地图（或摄像头预览）图片的代理地址：只有 `camera.xxx` / `image.xxx` 实体 ID 才走本函数，
 * 其余返回空串，调用方据此判断「这张图没有可加载的源」。
 * 地址一律带 hb（cache-bust）时间戳，否则浏览器一直用旧图；摄像头额外加 hb_live=1 表示实时画面流。
 */
export function mapSource(entityId, cacheBustTimestamp = Date.now()) {
  if (/^(camera|image)\.[a-z0-9_]+$/.test(entityId || "")) {
    // 摄像头实体走 camera_proxy 并开实时流，静态底图走 image_proxy；ID 整体 URL 编码。
    return (
      "/api/" +
      (entityId.startsWith("camera.") ? "camera" : "image") +
      "_proxy/" +
      encodeURIComponent(entityId) +
      "?hb=" +
      encodeURIComponent(cacheBustTimestamp) +
      (entityId.startsWith("camera.") ? "&hb_live=1" : "")
    );
  } else {
    return "";
  }
}
/**
 * 创建扫地机底图运行时。
 * 调用方用 sync/tick/dispose 驱动：sync 声明「当前哪些底图该显示」，tick 每帧推进淡入，
 * dispose 在页面/舞台卸载时释放资源；内部按 revision 变化轮询拉图，不依赖外部定时器。
 */
export function createVacuumMaps(sceneContext, requestRender) {
  const { THREE: THREE } = sceneContext;
  // 面板配置项 ID → 底图条目（网格 + 图片加载状态）。注意不是实体 ID：同一实体可被多条配置引用。
  const entriesByItemId = new Map();
  // 生命周期开关：isActive 由 sync 控制（可反复开关），isDisposed 一旦置位不可恢复。
  let isActive = false;
  let isDisposed = false;
  // 轮询状态：定时器句柄、已排期的触发时刻（用于去重）、当前轮询周期、上次真正发起加载的时刻。
  let refreshTimerId = null;
  let cachedSelectionKey = "";
  // 空闲 5 秒；设备处于运行态时由 sync 收紧到 1 秒，跟随位置的底图更新。
  let refreshIntervalMs = 5000;
  let lastLoadTimestamp = -Infinity;
  // -Infinity / Infinity 是刻意的初值：首次调度必定满足「没有更早排期」的判断条件。
  let nextRefreshAt = Infinity;
  /**
   * 构造底图的 revision 键：状态或图片资源任一处变化就换键。
   * 键里放地图实体与扫地机自身的 state / last_updated、图片地址与更新时间、机器人位置、
   * 充电座位置——这些字段一变底图内容就可能变，需重新拉图；返回 JSON 供调用方只做 === 比较。
   */
  const buildRevisionKey = (keyItem, revisionStates) => {
    // 状态可能来自事件包裹或轮询快照，两种形态都兼容；缺实体时退化成空对象。
    const revisionMapState = revisionStates[keyItem.map?.entityId];
    const mapState = resolveStateEntry(revisionMapState, {});
    const revisionAttributes = mapState.attributes || {};
    const revisionVacuumState = revisionStates[keyItem.entityId];
    const vacuumState = resolveStateEntry(revisionVacuumState, {});
    return JSON.stringify([
      mapState.state,
      mapState.last_updated,
      revisionAttributes.entity_picture,
      revisionAttributes.image_last_updated,
      revisionAttributes.vacuum_position,
      revisionAttributes.robot_position,
      revisionAttributes.charger_position,
      vacuumState.state,
      vacuumState.last_updated
    ]);
  };
  /**
   * 在 delayMs 之后安排一次底图刷新（覆盖式调度，同一时刻只会有一个定时器）。
   */
  function scheduleRefreshIn(delayMs) {
    // 页面切到后台、运行时未启用或当前没有任何条目时完全不排期，避免无意义的后台请求。
    if (!isActive || isDisposed || document.hidden || !entriesByItemId.size) {
      return;
    }
    const scheduledAt = performance.now() + delayMs;
    // 已有更早（或同刻）的排期就保持不动：状态推送很密集，每次都重排会让轮询无限延后。
    if (refreshTimerId === null || !(nextRefreshAt <= scheduledAt)) {
      clearTimeout(refreshTimerId);
      nextRefreshAt = scheduledAt;
      refreshTimerId = setTimeout(loadVisibleMaps, delayMs);
    }
  }
  /**
   * 以「距上次加载满 1 秒」为目标重新排期；数据已更新时用它尽快补一次拉取。
   */
  const rescheduleRefresh = () =>
    scheduleRefreshIn(Math.max(0, 1000 - (performance.now() - lastLoadTimestamp)));
  /**
   * 是否开启了系统「减少动态效果」（判定见 core/motion-preference.js）；开启时底图不做淡入，直接出图。
   */
  const prefersReducedMotion = () => prefersReducedMotionNow();
  /**
   * 作废一次尚未完成的图片加载。
   * generation 计数器是关键：onload 回调靠比对 generation 判断自己是否已被作废，
   * 这样即使图片已发出无法取消，回调也不会再把过期图片贴到网格上。
   */
  const cancelImageLoad = loadingEntry => {
    // 先自增代数使在途回调失效，再拆掉事件、清空 src 促使浏览器放弃下载。
    loadingEntry.generation++;
    if (loadingEntry.image) {
      loadingEntry.image.onload = loadingEntry.image.onerror = null;
      if (loadingEntry.loading) {
        loadingEntry.image.src = "";
      }
    }
    loadingEntry.loading = false;
  };
  /**
   * 彻底释放一个底图条目占用的 GPU 资源，并把网格从场景里摘掉。
   */
  const disposeMapEntry = disposalTarget => {
    // 先取消在途加载：否则回调可能在几何体、材质释放之后才把它贴回已销毁的网格。
    cancelImageLoad(disposalTarget);
    disposalTarget.mesh.removeFromParent();
    disposalTarget.mesh.geometry.dispose();
    disposalTarget.mesh.material.map?.dispose();
    disposalTarget.mesh.material.dispose();
  };
  /**
   * 用地图四角把平面网格的四个顶点摆到楼层平面上的正确位置。
   * 直接改顶点而不改 mesh transform：楼层本身可能带变换，顶点法能直接吃 worldPoint
   * 的换算结果，省去矩阵叠加；任一顶点换算失败（楼层未加载）就整体放弃本次摆放。
   */
  function positionMesh(positionedEntry) {
    const worldCorners = mapCorners(positionedEntry.map).map(corner =>
      sceneContext.worldPoint(positionedEntry.floorId, corner.x, corner.y, positionedEntry.height)
    );
    // 楼层还没就绪时 worldPoint 返回空值，此时保持原状，等下一次 sync 重试。
    if (worldCorners.some(validCorner => !validCorner)) {
      return false;
    }
    const positionAttribute = positionedEntry.mesh.geometry.attributes.position;
    worldCorners.forEach((cornerPoint, cornerIndex) =>
      positionAttribute.setXYZ(cornerIndex, cornerPoint.x, cornerPoint.y, cornerPoint.z)
    );
    positionAttribute.needsUpdate = true;
    positionedEntry.mesh.geometry.computeBoundingBox();
    positionedEntry.mesh.geometry.computeBoundingSphere();
    return true;
  }
  /**
   * 按「启用状态 + 是否已摆放 + 是否已有贴图」重算网格可见性，并重置淡入状态。
   *
   * 可见时才把不透明度归零等待淡入；开启系统减少动态效果时直接给到目标不透明度。
   */
  function applyVisibility(visibilityEntry) {
    visibilityEntry.mesh.visible =
      isActive && visibilityEntry.positioned && !!visibilityEntry.mesh.material.map;
    if (visibilityEntry.mesh.visible) {
      visibilityEntry.mesh.material.opacity = prefersReducedMotion() ? visibilityEntry.opacity : 0;
      visibilityEntry.fadeStart = null;
      visibilityEntry.fading = visibilityEntry.mesh.material.opacity < visibilityEntry.opacity;
    }
  }
  /**
   * 立即为所有底图条目拉一次图（定时器回调）。
   * 每条各持一个 generation：图片来源变化、条目被隐藏或运行时释放时，旧回调会因
   * generation 不匹配而直接返回，不会把过期图片贴上去。
   */
  function loadVisibleMaps() {
    // 进入本函数就说明本次排期已消费，先把定时器状态清干净，再由末尾重新排期。
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
    nextRefreshAt = Infinity;
    if (!!isActive && !isDisposed && !document.hidden) {
      for (const refreshEntry of entriesByItemId.values()) {
        // 上一次请求还没回来就跳过本条，避免同一张底图堆积并发请求。
        if (refreshEntry.loading) {
          continue;
        }
        refreshEntry.loading = true;
        refreshEntry.pending = false;
        lastLoadTimestamp = performance.now();
        // 记下本次加载的代数；onload 回调靠它识别自己是否已被后续加载取代。
        const generation = ++refreshEntry.generation;
        const mapImage = new Image();
        refreshEntry.image = mapImage;
        mapImage.onload = () => {
          // 三重校验：运行时已销毁、已停用、或已有更新的一轮加载，任一成立就丢弃这张图。
          if (isDisposed || !isActive || generation !== refreshEntry.generation) {
            return;
          }
          refreshEntry.loading = false;
          // 只有「从无贴图到有贴图」才触发淡入；换图时保留当前不透明度，避免整块闪一下。
          const hadTexture = !!refreshEntry.mesh.material.map;
          refreshEntry.mesh.material.map?.dispose();
          const texture = new THREE.Texture(mapImage);
          // 底图是 sRGB 图片，必须显式声明色彩空间，否则与场景内其他贴图颜色对不上。
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          refreshEntry.mesh.material.map = texture;
          refreshEntry.mesh.material.needsUpdate = true;
          if (!hadTexture) {
            applyVisibility(refreshEntry);
          }
          if (refreshEntry.pending) {
            rescheduleRefresh();
          }
          requestRender();
        };
        mapImage.onerror = () => {
          // 加载失败不弹错误：已保存的坐标继续保留，只是这张图先不显示，等下一轮重试。
          if (!isDisposed && !!isActive && generation === refreshEntry.generation) {
            refreshEntry.loading = false;
            if (!refreshEntry.mesh.material.map) {
              refreshEntry.mesh.visible = false;
            }
            if (refreshEntry.pending) {
              rescheduleRefresh();
            }
            requestRender();
          }
        };
        // mapSource 会带上破缓存时间戳，确保设备原地覆盖底图后能立刻拿到新图。
        mapImage.src = mapSource(refreshEntry.entityId);
      }
      // 一轮加载全部发起后再排下一轮，周期取当前设备状态对应的间隔。
      scheduleRefreshIn(refreshIntervalMs);
    }
  }
  return {
    /**
     * 声明「当前应该显示哪些底图」，并在需要时触发重建/重摆/重拉。
     */
    sync(items, isEnabled, floorFilter, syncStates = {}) {
      // 任一条件成立都按「本轮不显示」处理：停掉轮询并隐藏所有底图，但**不销毁**条目，
      // 这样页面切回前台、或在同一次会话里重新打开开关时能省掉一次资源重建。
      if (!isEnabled || !!isDisposed || !!document.hidden) {
        if (isActive) {
          clearTimeout(refreshTimerId);
          refreshTimerId = null;
          nextRefreshAt = Infinity;
          for (const hiddenEntry of entriesByItemId.values()) {
            cancelImageLoad(hiddenEntry);
            hiddenEntry.mesh.visible = false;
            hiddenEntry.fading = false;
          }
          requestRender();
        }
        isActive = false;
        return;
      }
      // 记住「从隐藏回到可见」这一跳：此时楼层可能刚加载完，需要重摆顶点并重新淡入。
      const wasInactive = !isActive;
      isActive = true;
      // 只要有一台扫地机在运行，就把轮询收紧到 1 秒，让底图上的实时轨迹跟得上。
      refreshIntervalMs = items.some(
        listedItem => vacuumStatusPresentation(listedItem, syncStates).active
      )
        ? 1000
        : 5000;
      // 可见性过滤：面板隐藏、模型不可用、地图被关、来源不是合法图片实体、尺寸为 0、
      // 不属于当前楼层过滤范围的条目，一律不参与渲染。
      const visibleItems = items.filter(
        candidateItem =>
          candidateItem.visible !== false &&
          candidateItem.modelAvailable !== false &&
          candidateItem.map?.visible !== false &&
          mapSource(candidateItem.map?.entityId) &&
          candidateItem.map.width > 0 &&
          candidateItem.map.depth > 0 &&
          (floorFilter === "all" || candidateItem.floorId === floorFilter)
      );
      // 选择指纹：场景版本 + 楼层过滤 + 可见项（含各自地图参数）。
      // 指纹相同就说明几何体不需要重建，避免每次状态推送都重新分配 GPU 缓冲。
      const selectionKey = JSON.stringify([
        sceneContext.sceneRevision,
        floorFilter,
        visibleItems.map(mappedItem => [mappedItem.id, mappedItem.floorId, mappedItem.map])
      ]);
      const didSelectionChange = selectionKey !== cachedSelectionKey;
      if (didSelectionChange) {
        // 选择变化时整体重建：几何体只有 4 个顶点，全量重建比增量维护更简单也更可靠。
        for (const staleEntry of entriesByItemId.values()) {
          disposeMapEntry(staleEntry);
        }
        entriesByItemId.clear();
        cachedSelectionKey = selectionKey;
        visibleItems.forEach((visibleItem, itemIndex) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(new Float32Array(12), 3)
          );
          // 纹理坐标按图片方向排布：贴图从几何体的左上角开始铺满整块平面。
          geometry.setAttribute(
            "uv",
            new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)
          );
          geometry.setIndex([0, 2, 1, 0, 3, 2]);
          // 不写深度、开启 polygonOffset 偏移，避免与地板共面时 z-fighting；
          // toneMapped 关掉，保证底图颜色不受色调映射影响。
          const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            toneMapped: false
          });
          const mapMesh = new THREE.Mesh(geometry, material);
          mapMesh.name = "vacuum-map-overlay";
          // 归入环境特效层：拾取、包围盒与阴影统计都会跳过它，底图不会挡住设备点击。
          mapMesh.userData.environmentEffect = true;
          // 关掉射线检测，进一步保证点击穿透到底下的房间/设备。
          mapMesh.raycast = () => {};
          mapMesh.visible = false;
          sceneContext.overlayScene.add(mapMesh);
          const mapEntry = {
            mesh: mapMesh,
            image: null,
            entityId: visibleItem.map.entityId,
            generation: 0,
            loading: false,
            revision: buildRevisionKey(visibleItem, syncStates),
            pending: false,
            floorId: visibleItem.floorId,
            map: visibleItem.map,
            // 0.025 米是贴地基准，按索引每张再抬 1 毫米，防止多张底图共面互相闪烁。
            height: 0.025 + itemIndex * 0.001,
            // 面板里存的是百分比，渲染用 0~1；缺省 45% 与面板默认值保持一致。
            opacity: (visibleItem.map.opacity ?? 45) / 100,
            fading: false
          };
          mapEntry.positioned = positionMesh(mapEntry);
          entriesByItemId.set(visibleItem.id, mapEntry);
        });
      } else if (wasInactive) {
        // 重新可见：楼层可能刚就绪，重摆一次顶点并按需重新淡入。
        for (const restoredEntry of entriesByItemId.values()) {
          restoredEntry.positioned = positionMesh(restoredEntry);
          applyVisibility(restoredEntry);
        }
      }
      // 只标脏、不当场拉图：一次状态风暴里可能连着变好几个字段，攒到下一轮统一请求。
      let hasPendingRevision = false;
      for (const changedItem of visibleItems) {
        const existingEntry = entriesByItemId.get(changedItem.id);
        const revisionKey = buildRevisionKey(changedItem, syncStates);
        if (existingEntry && existingEntry.revision !== revisionKey) {
          existingEntry.revision = revisionKey;
          existingEntry.pending = true;
          hasPendingRevision = true;
        }
      }
      if (didSelectionChange || wasInactive) {
        loadVisibleMaps();
        requestRender();
      } else if (hasPendingRevision) {
        // 有内容变化：按「距上次加载满 1 秒」尽快补拉，让用户更快看到新轨迹。
        rescheduleRefresh();
      } else {
        scheduleRefreshIn(refreshIntervalMs);
      }
    },
    /**
     * 推进底图淡入动画，由舞台每帧调用。
     */
    tick(timestampMs) {
      // 未启用时直接返回 false，让舞台不必再为底图维持帧循环。
      if (!isActive || isDisposed) {
        return false;
      }
      let isFading = false;
      let didFade = false;
      for (const fadingEntry of entriesByItemId.values()) {
        if (fadingEntry.fading) {
          if (fadingEntry.fadeStart === null) {
            fadingEntry.fadeStart = timestampMs;
          }
          // 280ms 完成淡入；开启减少动态效果时一步到位（比例为 1）。
          const fadeRatio = prefersReducedMotion()
            ? 1
            : Math.max(0, Math.min(1, (timestampMs - fadingEntry.fadeStart) / 280));
          // smoothstep 缓动 3t²-2t³：两端速度为零，比线性淡入更柔和。
          const fadeOpacity = fadingEntry.opacity * fadeRatio * fadeRatio * (3 - fadeRatio * 2);
          didFade ||= fadingEntry.mesh.material.opacity !== fadeOpacity;
          fadingEntry.mesh.material.opacity = fadeOpacity;
          fadingEntry.fading = fadeRatio < 1;
          isFading ||= fadingEntry.fading;
        }
      }
      if (didFade) {
        requestRender();
      }
      return isFading;
    },
    /**
     * 释放全部底图资源（几何体、材质、贴图）并停止轮询；调用后该实例不可再用。
     */
    dispose() {
      // 先置位销毁标记：在途的图片回调看到它会直接返回，不会再往已卸载的场景里写东西。
      isDisposed = true;
      isActive = false;
      clearTimeout(refreshTimerId);
      for (const disposedEntry of entriesByItemId.values()) {
        disposeMapEntry(disposedEntry);
      }
      entriesByItemId.clear();
    }
  };
}
/**
 * 把扫地机实体状态整理成面板要用的展示信息。
 * 纯函数、无副作用：给定绑定与实体状态快照，返回状态文案、电量文本、是否在线，
 * 以及是否处于运行态（舞台据此决定底图轮询周期）。
 */
export function vacuumStatusPresentation(statusBinding, statusStates = {}) {
  // 实体状态可能是事件包裹（newState）或轮询快照（state 本身），统一成「状态对象或 null」。
  const resolveEntityState = entityEntry => resolveStateEntry(entityEntry);
  const vacuumStateEntry = resolveEntityState(statusStates[statusBinding.entityId]);
  const vacuumAttributes = vacuumStateEntry?.attributes || {};
  const stateText = String(vacuumStateEntry?.state || "unknown");
  // unknown/unavailable 都当作「拿不到状态」：不给电量，也不算运行中（避免底图空转轮询）。
  const isAvailable = !["unknown", "unavailable"].includes(stateText);
  // 优先用厂商扩展字段 vacuum_state 做细分，没有该字段时退回实体自身的 state。
  const vacuumRawState = String(vacuumAttributes.vacuum_state || stateText);
  let statusLabel =
    {
      cleaning: "清扫中",
      sweeping: "扫地中",
      mopping: "拖地中",
      // 扫地机的细分清扫态：厂商用 zone/spot/auto 区分区域、局部与自动清扫，
      // 不细分时统一落回上面的 cleaning / sweeping / mopping。
      vacuuming: "清扫中",
      spot_cleaning: "局部清扫中",
      zone_cleaning: "区域清扫中",
      auto_cleaning: "自动清扫中",
      paused: "已暂停",
      returning: "回充中",
      docked: "已回充",
      charging: "充电中",
      charging_completed: "充电完成",
      idle: "待机",
      error: "设备异常",
      unavailable: "设备离线",
      unknown: "等待状态",
      washing: "清洗拖布",
      drying: "烘干拖布",
      mapping: "建图中"
    }[vacuumRawState] ||
    // 表里没有的取值：本身已是中文（厂商自定义状态）就原样显示，否则给一句中文兜底 ——
    // 不把英文状态码直接摊到界面上（与 0.6.5 的「状态更新中」口径一致）。
    (/[\u4e00-\u9fa5]/.test(vacuumRawState) ? vacuumRawState : "状态更新中");
  // 布尔子状态优先级更高：清洗/烘干/回充/建图会覆盖上面的通用文案。
  if (isAvailable) {
    if (vacuumAttributes.washing) {
      statusLabel = vacuumAttributes.washing_paused ? "清洗已暂停" : "清洗拖布";
    } else if (vacuumAttributes.drying) {
      statusLabel = "烘干拖布";
    } else if (vacuumAttributes.returning) {
      statusLabel = "回充中";
    } else if (vacuumAttributes.mapping) {
      statusLabel = "建图中";
    }
  }
  // 电量只在关联的 sensor.* 实体里找，避免把其他域下同名实体也算进来。
  const relatedSensors = (statusBinding.relatedEntityIds || [])
    .filter(relatedEntityId => relatedEntityId.startsWith("sensor."))
    .map(sensorEntityId => ({
      id: sensorEntityId,
      state: resolveEntityState(statusStates[sensorEntityId])
    }));
  // 先按 device_class=battery 精确匹配；退化时按实体 ID 里的 battery 关键字匹配，
  // 并排除滤网/刷子/拖布等「寿命百分比」传感器——它们的 ID 里同样带 battery。
  const batterySensor =
    relatedSensors.find(
      batteryCandidate => batteryCandidate.state?.attributes?.device_class === "battery"
    ) ||
    relatedSensors.find(
      batteryNameCandidate =>
        /(?:^|[._])battery(?:_|$)/.test(batteryNameCandidate.id) &&
        !/filter|brush|mop|life|consumable/.test(batteryNameCandidate.id)
    );
  // 属性值可能是字符串；空值与非法数字一律视为「没有电量」，其余夹到 0~100。
  const parseBatteryPercent = rawBatteryValue =>
    rawBatteryValue == null ||
    String(rawBatteryValue).trim() === "" ||
    !Number.isFinite(parseFloat(rawBatteryValue))
      ? null
      : Math.max(0, Math.min(100, parseFloat(rawBatteryValue)));
  // 电量候选按优先级取第一个可用值（属性字段优先于关联传感器）；设备离线时不给值。
  const batteryPercent = isAvailable
    ? ([
        vacuumAttributes.battery_level,
        vacuumAttributes.battery_percentage,
        vacuumAttributes.battery,
        batterySensor?.state?.state
      ]
        .map(parseBatteryPercent)
        .find(percentValue => percentValue !== null) ?? null)
    : null;
  return {
    status: statusLabel,
    battery: batteryPercent === null ? "电量 —" : Math.round(batteryPercent) + "%",
    available: isAvailable,
    // active 决定底图轮询是否收紧到 1 秒：只有设备真的在动、在建图时才为真。
    active:
      isAvailable &&
      (["cleaning", "sweeping", "mopping", "returning", "washing", "drying", "mapping"].includes(
        stateText
      ) ||
        !!vacuumAttributes.running ||
        !!vacuumAttributes.washing ||
        !!vacuumAttributes.drying ||
        !!vacuumAttributes.returning ||
        !!vacuumAttributes.mapping)
  };
}
