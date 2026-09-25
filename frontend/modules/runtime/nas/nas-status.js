/**
 * NAS 运行状态指示灯。
 *
 * 在 NAS 模型正面叠加一颗着色器绘制的呼吸绿灯，并临时隐藏模型自带的指示灯网格，避免出现
 * 「两颗灯」。对外提供 nasDeviceState、createNasStatus。主开关可绑 binary_sensor /
 * switch / input_boolean；未直接绑定时改看 statusSource 下的「主指标 + 指标列表」是否有任意
 * 一项有有效数值。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
// 里那两份），这里经 static-helpers 桥取用：运行侧（舞台页能以 file: 打开）不能写裸
// `/static/...` 的静态 import，桥按更严的那种口径分流（见该文件里的两条纪律）。
import { readFromMapOrRecord, resolveStateEntry, stateTextOf } from "../core/static-helpers.js?v=2609251801";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js：模型 ID 只在一个楼层内唯一，
// 定位必须带上楼层；两侧缺字段 / 空串必须是同一个键，否则指示灯挂不上。
import { sceneModelKey } from "../core/scene-model-key.js?v=2609251801";
import { modelWorldBounds } from "../core/scene-model-bounds.js?v=2609251801";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=2609251801";
/**
 * 归一化单个 NAS 开关实体。
 */
function nasState(entityId, state) {
  const stateObject = resolveStateEntry(state, {});
  const stateValue = stateTextOf(stateObject);
  // 只接受三元组里明确的开 / 关：unknown、unavailable 等一律算不可用，
  // 否则设备掉线时指示灯会继续按「上一次的 on」亮着。
  const available =
    /^(binary_sensor|switch|input_boolean)\.[a-z0-9_]+$/.test(entityId || "") &&
    stateObject.available !== false &&
    ["on", "off"].includes(stateValue);
  return {
    available: available,
    on: available && stateValue === "on",
    name: stateObject.attributes?.friendly_name || entityId || "NAS"
  };
}
/**
 * 归一化 NAS 设备的整体状态：直接绑开关实体（item.entityId），或绑一组「状态指标」
 * （item.statusSource，常见于用 SNMP / 传感器间接判断在线）。
 */
export function nasDeviceState(item, stateSources = {}) {
  // 状态源可能是 Map（舞台侧按 entityId 建的索引）也可能是普通对象；取值口径只有一份实现
  // （utils/state-entry.js 的 readFromMapOrRecord），本地不再写第二遍。
  const readState = stateEntityId => readFromMapOrRecord(stateSources, stateEntityId);
  if (item.entityId) {
    return nasState(item.entityId, readState(item.entityId));
  }
  // 用 Set 去重：主指标常常同时出现在 metrics 列表里，重复查询没有意义。
  const hasActiveMetric = [
    ...new Set([
      item.statusSource?.primaryEntityId,
      ...(item.statusSource?.metrics || []).map(metricSource => metricSource.entityId)
    ])
  ].some(metricEntityId => {
    const metricState = resolveStateEntry(readState(metricEntityId));
    return (
      !!metricEntityId &&
      metricState?.available !== false &&
      // 数值型传感器只要 state 不是空 / 未知就算「有数据」，
      // 具体数值不参与判断 —— 这里只关心 NAS 是否在响应。
      metricState?.state != null &&
      !["", "unknown", "unavailable", "none"].includes(stateTextOf(metricState))
    );
  });
  // 指标模式下「有数据」即视为开机，没有单独的关闭态可言。
  return {
    available: hasActiveMetric,
    on: hasActiveMetric,
    name: item.statusSource?.name || "NAS"
  };
}
/**
 * 创建 NAS 指示灯控制器。
 */
export function createNasStatus({ THREE: THREE, requestFrame: requestFrame = () => {} }) {
  const meshesByBindingId = new Map();
  // 指示灯尺寸靠 scale 控制，几何体只需一份 1×1 平面。
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  // 场景结构缓存：只有根节点、修订号或绑定签名变化时才重建索引。
  let syncedRoot;
  let syncedRevision;
  let syncedBindingsSignature;
  let isDisposed = false;
  // 是否有可见指示灯，决定 tick / nextDelay 是否需要继续工作。
  let hasVisibleIndicator = false;
  // 初始为 -Infinity 是刻意的：第一次 tick 一定能通过下面的帧率节流判断。
  let lastTickMs = -Infinity;
  // 两个来源都查：某些嵌入环境里 globalThis.matchMedia 缺失而 window 上有，
  // 反之（测试桩）也可能只有前者，任何一处命中即视为要求「减少动态效果」。
  const prefersReducedMotion = () => prefersReducedMotionNow();
  /**
   * 释放一条记录：恢复被隐藏的原生指示灯，移除并销毁自制平面。
   */
  function releaseEntry(entry) {
    // 逐个还原为「创建时记录的可见性」，而不是无脑设成 true，
    // 因为有些原生灯本来就是隐藏的（由模型动画控制）。
    for (const [indicator, wasVisible] of entry.indicators) {
      indicator.visible = wasVisible;
    }
    entry.mesh.removeFromParent();
    entry.mesh.material.dispose();
  }
  /**
   * 同步指示灯：按最新绑定与状态创建 / 更新 / 回收平面。
   */
  function sync({
    root: root,
    revision: revision,
    bindings: bindings = [],
    states: states = {},
    enabled: enabled = false,
    sizeScale: sizeScale = 1,
    brightness: brightness = 1
  }) {
    if (isDisposed) {
      return;
    }
    // 只有 id / 楼层 / 模型三项影响「平面挂在哪里」，变化时才重建索引。
    const bindingsSignature = JSON.stringify(
      bindings.map(bindingConfig => [
        bindingConfig.id,
        bindingConfig.floorId,
        bindingConfig.modelId
      ])
    );
    if (
      syncedRoot !== root ||
      syncedRevision !== revision ||
      syncedBindingsSignature !== bindingsSignature
    ) {
      syncedRoot = root;
      syncedRevision = revision;
      syncedBindingsSignature = bindingsSignature;
      const modelsByLocation = new Map();
      syncedRoot?.traverse(sceneObject => {
        if (sceneObject.userData?.environmentModelType !== "nas") {
          return;
        }
        let ancestorFloorId = sceneObject.userData.environmentFloorId;
        // 模型自身可能没写楼层，向上找最近带楼层 ID 的祖先。
        for (
          let ancestor = sceneObject.parent;
          ancestorFloorId == null && ancestor;
          ancestor = ancestor.parent
        ) {
          ancestorFloorId = ancestor.userData.environmentFloorId;
        }
        modelsByLocation.set(
          sceneModelKey(ancestorFloorId, sceneObject.userData.environmentModelId),
          sceneObject
        );
      });
      const activeBindingIds = new Set();
      for (const binding of bindings) {
        const matchedModel = modelsByLocation.get(
          sceneModelKey(binding.floorId, binding.modelId)
        );
        if (!matchedModel) {
          continue;
        }
        activeBindingIds.add(binding.id);
        let existing = meshesByBindingId.get(binding.id);
        if (existing?.model !== matchedModel) {
          // 绑定的模型变了（重建或改了配置），旧平面必须回收，否则会留在旧模型上。
          if (existing) {
            releaseEntry(existing);
          }
          const modelBounds = modelWorldBounds(matchedModel, THREE);
          // 模型还没有几何体（正在加载）时不建立记录，下一轮结构变化会重试。
          if (!modelBounds) {
            meshesByBindingId.delete(binding.id);
            continue;
          }
          const modelSize = modelBounds.getSize(new THREE.Vector3());
          const modelCenter = modelBounds.getCenter(new THREE.Vector3());
          // 着色器绘制指示灯：顶点着色器贴点并保证最小屏幕尺寸，片元画「核心 + 光晕」并在
          // alpha 极低时 discard；transparent + depthTest: false + renderOrder 提高，让它始终画在外壳之上。
          const ledMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            uniforms: {
              pulse: {
                value: 1
              },
              viewportHeight: {
                value: 900
              },
              sizeScale: {
                value: 1
              },
              brightness: {
                value: 1
              }
            },
            vertexShader:
              "varying vec2 ledUv; uniform float viewportHeight; uniform float sizeScale; void main(){ledUv=uv;vec4 center=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);vec4 clip=projectionMatrix*center;float physicalSize=length(modelMatrix[0].xyz);float minimumSize=24.0*clip.w/(max(viewportHeight,1.0)*projectionMatrix[1][1]);center.xy+=position.xy*max(physicalSize,minimumSize)*sizeScale;gl_Position=projectionMatrix*center;}",
            fragmentShader:
              "varying vec2 ledUv; uniform float pulse; uniform float brightness; void main(){float r=length(ledUv-0.5)*2.0;float core=1.0-smoothstep(0.28,0.50,r);float halo=pow(max(0.0,1.0-r),1.7)*0.8;float a=min((core+halo)*pulse,1.0)*brightness;if(a<0.005)discard;gl_FragColor=vec4(mix(vec3(0.06,1.0,0.20),vec3(0.48,1.0,0.60),core),a);}"
          });
          const ledMesh = new THREE.Mesh(planeGeometry, ledMaterial);
          ledMesh.name = "nas-status-" + binding.id;
          Object.assign(ledMesh.userData, {
            environmentEffect: true,
            nasStatus: true,
            externalModelSharedGeometry: true,
            externalModelSharedMaterial: true
          });
          // 指示灯是纯展示元素，不能抢占模型本体的点击。
          ledMesh.raycast = () => {};
          ledMesh.renderOrder = 100;
          const viewportSize = new THREE.Vector2();
          // 顶点着色器需要知道视口高度才能反算「最小 24 像素」的尺寸，
          // 视口会在窗口缩放时变化，所以在每帧渲染前刷新而不是只在创建时取一次。
          ledMesh.onBeforeRender = renderer => {
            ledMaterial.uniforms.viewportHeight.value = renderer.getSize(viewportSize).y;
          };
          // 尺寸取模型宽度的 22%，并夹在 0.025–0.075 之间，
          // 免得大机柜上大得夸张、小设备上又小到看不见。
          const indicatorSize = Math.max(0.025, Math.min(0.075, modelSize.x * 0.22));
          ledMesh.scale.set(indicatorSize, indicatorSize, indicatorSize);
          // 摆在模型正面偏右、靠近下沿的位置；z 方向额外外移 0.003 避免与外壳共面闪烁。
          ledMesh.position.set(
            modelCenter.x + modelSize.x * 0.36,
            modelBounds.min.y + modelSize.y * 0.26,
            modelBounds.max.z + 0.003
          );
          const suppressedIndicators = new Map();
          matchedModel.traverse(child => {
            if (!child.isMesh || child === ledMesh || child.userData?.environmentEffect) {
              return;
            }
            // 模型自带的指示灯有两种特征：材质名以 nas-material-4 结尾（模型导出时的约定），
            // 或材质带自发光（emissive > 0）。两者任一命中就隐藏，由自制灯统一表达状态。
            if (
              (Array.isArray(child.material) ? child.material : [child.material]).some(
                childMaterial =>
                  /nas-material-4$/.test(childMaterial?.name || "") ||
                  childMaterial?.emissive?.getHex() > 0
              )
            ) {
              suppressedIndicators.set(child, child.visible);
              child.visible = false;
            }
          });
          matchedModel.add(ledMesh);
          existing = {
            model: matchedModel,
            mesh: ledMesh,
            indicators: suppressedIndicators
          };
          meshesByBindingId.set(binding.id, existing);
        }
      }
      for (const [bindingId, staleEntry] of meshesByBindingId) {
        if (!activeBindingIds.has(bindingId)) {
          releaseEntry(staleEntry);
          meshesByBindingId.delete(bindingId);
        }
      }
    }
    hasVisibleIndicator = false;
    let needsRender = false;
    for (const activeBinding of bindings) {
      const bindingEntry = meshesByBindingId.get(activeBinding.id);
      if (!bindingEntry) {
        continue;
      }
      const uniforms = bindingEntry.mesh.material.uniforms;
      // 用 ||= 累积「需要重绘」：省掉一次额外的条件判断，也不会短路掉后面的赋值。
      needsRender ||=
        uniforms.sizeScale.value !== sizeScale || uniforms.brightness.value !== brightness;
      uniforms.sizeScale.value = sizeScale;
      uniforms.brightness.value = brightness;
      const deviceState = nasDeviceState(activeBinding, states);
      // 只有总开关打开且设备在线时才显示；灯灭时不销毁实例，便于状态恢复后立刻显示。
      const shouldShow = enabled && deviceState.on;
      needsRender ||= bindingEntry.mesh.visible !== shouldShow;
      bindingEntry.mesh.visible = shouldShow;
      if (shouldShow) {
        hasVisibleIndicator = true;
      }
    }
    // 有可见指示灯时常驻重绘（呼吸动画），否则只在属性真的变化时重绘一次。
    if (needsRender || hasVisibleIndicator) {
      requestFrame();
    }
  }
  /**
   * 推进呼吸动画。
   */
  function tick(nowMs) {
    if (isDisposed || !hasVisibleIndicator) {
      return false;
    }
    const reducedMotion = prefersReducedMotion();
    // 正常模式下把刷新限制在 30fps：呼吸灯不需要更高帧率，省下 GPU 给场景本身。
    if (!reducedMotion && nowMs - lastTickMs < 1000 / 30) {
      return true;
    }
    lastTickMs = nowMs;
    // 呼吸曲线：cos 在 1400ms 周期内映射到 [0.14, 1.0] 亮度，不会全灭（看起来像掉线）；「减少动态效果」时固定常亮 1。
    const pulse = reducedMotion
      ? 1
      : 0.14 + (0.5 - Math.cos((nowMs / 1400) * Math.PI * 2) * 0.5) * 0.86;
    let changed = false;
    for (const meshEntry of meshesByBindingId.values()) {
      if (meshEntry.mesh.visible) {
        changed ||= meshEntry.mesh.material.uniforms.pulse.value !== pulse;
        meshEntry.mesh.material.uniforms.pulse.value = pulse;
      }
    }
    if (changed) {
      requestFrame();
    }
    // 固定常亮时不必再逐帧推进，返回 false 让外部停止调度。
    return !reducedMotion;
  }
  return {
    sync: sync,
    tick: tick,
    // 下次 tick 的间隔：无可见指示灯或用户要求减少动态效果时返回 Infinity，
    // 表示「不要再调度」，由 sync 在需要时重新唤起动画循环。
    nextDelay: () =>
      !isDisposed && hasVisibleIndicator && !prefersReducedMotion() ? 1000 / 30 : Infinity,
    dispose() {
      // 幂等释放：重复调用不会二次销毁共享平面几何体。
      if (!isDisposed) {
        isDisposed = true;
        for (const disposedEntry of meshesByBindingId.values()) {
          releaseEntry(disposedEntry);
        }
        meshesByBindingId.clear();
        planeGeometry.dispose();
      }
    }
  };
}
