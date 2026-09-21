/**
 * 摄像头在线状态指示点。
 *
 * 在 3D 场景的摄像头模型上叠加一个小球，依据 HA 实体状态切换颜色，用最轻量的方式表达在线 /
 * 离线。对外提供 cameraOnline、createCameraStatus。颜色取家居面板的灰蓝（离线）与绿（在线），
 * 半透明小球不参与射线拾取（raycast 置空），避免挡住模型本体的点击。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
// 里那两份），这里经 static-helpers 桥取用：运行侧（舞台页能以 file: 打开）不能写裸
// `/static/...` 的静态 import，桥按更严的那种口径分流（见该文件里的两条纪律）。
import { resolveStateEntry, stateTextOf } from "../core/static-helpers.js?v=20260921152526";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js：模型 ID 只在一个楼层内唯一，
// 所以定位必须带上楼层，同一模型 ID 在不同楼层可以重复。
import { sceneModelKey } from "../core/scene-model-key.js?v=20260921152526";
/**
 * 判断摄像头实体是否在线。
 */
export function cameraOnline(stateOrChange) {
  // 同时兼容两种入参：事件对象走 newState，直接传 state 时用自身。
  const stateEntry = resolveStateEntry(stateOrChange);
  // 大小写与空格归一不归这里管，交给唯一的 state-entry.js。
  const stateText = stateTextOf(stateEntry);
  return (
    // available === false 是 HA 明确的「不可用」标记，优先于 state 文案判断。
    stateEntry?.available !== false &&
    !!stateText &&
    !["unknown", "unavailable", "none"].includes(stateText)
  );
}
/**
 * 创建摄像头状态点控制器。
 */
export function createCameraStatus({ THREE: THREE, requestFrame: requestFrame = () => {} }) {
  // 每帧都会调用 sync，缓存 Map 让「未变化」的路径几乎零成本。
  const entriesByBindingId = new Map();
  // 所有状态点共用同一份几何体（半径为 1，实际大小靠 scale 控制），减少 GPU 资源。
  const dotGeometry = new THREE.SphereGeometry(1, 10, 8);
  // 以下三个缓存用于判断「场景结构或绑定关系是否变化」，
  // 只有变化时才重建索引，避免每帧遍历整棵场景树。
  let cachedRoot;
  let cachedRevision;
  let cachedBindingsKey;
  let isDisposed = false;
  /** 释放单个状态点：先从父节点摘下，再销毁它独占的材质（几何体是共享的）。 */
  const disposeStatusEntry = entryToDispose => {
    entryToDispose.mesh.removeFromParent();
    entryToDispose.mesh.material.dispose();
  };
  /**
   * 刷新所有摄像头的状态点。
   */
  function syncCameraStatus({
    root: root,
    revision: revision,
    bindings: bindings = [],
    states: states = {},
    enabled: enabled = false,
    brightness: brightness = 1
  }) {
    if (isDisposed) {
      return;
    }
    // 记录本次是否真的改了可见性或颜色，仅在需要时请求重绘。
    let didChange = false;
    // 把影响显示的全部字段压成字符串，作为「绑定关系是否变化」的比较依据。
    const bindingsKey = JSON.stringify(
      bindings.map(bindingForKey => [
        bindingForKey.id,
        bindingForKey.floorId,
        bindingForKey.modelId,
        bindingForKey.width,
        bindingForKey.height,
        bindingForKey.depth
      ])
    );
    if (cachedRoot !== root || cachedRevision !== revision || cachedBindingsKey !== bindingsKey) {
      cachedRoot = root;
      cachedRevision = revision;
      cachedBindingsKey = bindingsKey;
      const modelsByKey = new Map();
      cachedRoot?.traverse(traversedObject => {
        // 只有环境模型且类型为 camera 的对象才是状态点的挂载候选。
        if (traversedObject.userData?.environmentModelType !== "camera") {
          return;
        }
        let objectFloorId = traversedObject.userData.environmentFloorId;
        // 模型自身可能没写楼层 ID，向上找最近的带了楼层 ID 的祖先。
        for (
          let ancestorObject = traversedObject.parent;
          objectFloorId == null && ancestorObject;
          ancestorObject = ancestorObject.parent
        ) {
          objectFloorId = ancestorObject.userData.environmentFloorId;
        }
        modelsByKey.set(
          sceneModelKey(objectFloorId, traversedObject.userData.environmentModelId),
          traversedObject
        );
      });
      const activeBindingIds = new Set();
      for (const activeBinding of bindings) {
        const matchedModel = modelsByKey.get(
          sceneModelKey(activeBinding.floorId, activeBinding.modelId)
        );
        // 绑定存在但场景里找不到模型：跳过，下一帧结构变化后会再试。
        if (!matchedModel) {
          continue;
        }
        activeBindingIds.add(activeBinding.id);
        let trackedEntry = entriesByBindingId.get(activeBinding.id);
        if (trackedEntry?.model !== matchedModel) {
          // 绑定的模型换了（例如模型被重建），旧状态点必须释放，否则会残留。
          if (trackedEntry) {
            disposeStatusEntry(trackedEntry);
          }
          // 0x777d84：离线灰蓝；toneMapped 关闭是为了让颜色不被色调映射改写。
          // depthWrite 关闭：状态点是叠加指示，不希望遮挡或与本体产生深度冲突。
          const dotMaterial = new THREE.MeshBasicMaterial({
            color: 7830916,
            toneMapped: false,
            transparent: true,
            depthWrite: false
          });
          const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
          dotMesh.name = "camera-status-" + activeBinding.id;
          // userData 是给清理逻辑看的标记：environmentEffect 让清理把它当作
          // 「环境效果」子对象统一摘除；后两项提示几何体与材质是共享的，不要重复销毁。
          Object.assign(dotMesh.userData, {
            environmentEffect: true,
            cameraStatus: true,
            externalModelSharedGeometry: true,
            externalModelSharedMaterial: true
          });
          // 覆盖为不可拾取：状态点只做展示，不能抢走摄像头本体的点击。
          dotMesh.raycast = () => {};
          matchedModel.add(dotMesh);
          trackedEntry = {
            model: matchedModel,
            mesh: dotMesh
          };
          entriesByBindingId.set(activeBinding.id, trackedEntry);
          didChange = true;
        }
        // 位置按模型包围盒比例摆放：略高于顶面（0.84 倍高），靠近正面（0.475 倍深）。
        trackedEntry.mesh.position.set(0, activeBinding.height * 0.84, activeBinding.depth * 0.475);
        // 半径取宽度的 2.7%，0.003 是下限，防止极小模型上出现零尺寸导致不可见。
        trackedEntry.mesh.scale.setScalar(Math.max(0.003, activeBinding.width * 0.027));
      }
      for (const [staleBindingId, staleEntry] of entriesByBindingId) {
        // 绑定已被删除的状态点属于陈旧对象，必须回收，否则会一直挂在模型上。
        if (!activeBindingIds.has(staleBindingId)) {
          disposeStatusEntry(staleEntry);
          entriesByBindingId.delete(staleBindingId);
          didChange = true;
        }
      }
    }
    for (const binding of bindings) {
      const existingEntry = entriesByBindingId.get(binding.id);
      if (!existingEntry) {
        continue;
      }
      // 没有绑定实体、或总开关关闭时隐藏；这里只改 visible，不销毁实例，便于快速恢复。
      const isCameraVisible = enabled && !!binding.entityId;
      // 0x82c98b：在线绿。颜色与可见性任一变化都要重绘。
      const statusColorHex = cameraOnline(states[binding.entityId]) ? 8571275 : 7830916;
      didChange =
        didChange ||
        existingEntry.mesh.visible !== isCameraVisible ||
        existingEntry.mesh.material.color.getHex() !== statusColorHex ||
        existingEntry.mesh.material.opacity !== brightness;
      existingEntry.mesh.visible = isCameraVisible;
      existingEntry.mesh.material.color.setHex(statusColorHex);
      existingEntry.mesh.material.opacity = brightness;
    }
    if (didChange) {
      requestFrame();
    }
  }
  return {
    sync: syncCameraStatus,
    dispose() {
      // 幂等释放：重复调用不会二次销毁共享资源。
      if (!isDisposed) {
        isDisposed = true;
        for (const disposedEntry of entriesByBindingId.values()) {
          disposeStatusEntry(disposedEntry);
        }
        entriesByBindingId.clear();
        dotGeometry.dispose();
      }
    }
  };
}
