/**
 * 空调气流（出风）效果：根据空调 / 风口的模型包围盒自动推导「出风口」位置，挂一片着色器绘制的
 * 流动气幕；运行时淡入、停止时淡出。
 *
 * 与 HA 的字段约定：开关看实体 state（cool / heat / fan_only / drying 等），是否真的在吹风看
 * hvac_action（cooling / heating / fan / drying）；颜色按 state 取（cool 蓝、heat 橙、其余中性灰）。
 * 注意：下面两个着色器字符串里的 // 是 GLSL 注释，属于着色器源码本身，必须原样保留，不能改写或翻译。
 */

// 状态条目归一与「按 ID 切域」只有一份实现（/static/utils/），这里经 static-helpers 桥取用。
import { normalizedTextOf, readFromMapOrRecord, resolveStateEntry, stateTextOf } from "../core/static-helpers.js?v=2609220141";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js。
import { sceneModelKey } from "../core/scene-model-key.js?v=2609220141";
import { modelWorldBounds } from "../core/scene-model-bounds.js?v=2609220141";
// 「减少动态效果」偏好的唯一判定与订阅（实现见 core/motion-preference.js）。
import { onReducedMotionChange, prefersReducedMotionNow } from "../core/motion-preference.js?v=2609220141";
/** 气流颜色：按 HA 的 state（制冷 / 制热 / 其它）取色。 */
const FLOW_STATE_COLORS = {
  cool: "#73c8ff",
  heat: "#ff8a65",
  other: "#dce2e6"
};
/** hvac_action 里表示「风机确实在吹」的取值；不在集合内则不出风。 */
const AIRFLOW_ACTIONS = new Set([
  "cooling",
  "cool",
  "heating",
  "heat",
  "fan",
  "fan_only",
  "drying"
]);
/**
 * 创建气流效果控制器。
 */
export function createEnvironmentAirflow({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
  reducedMotion: reducedMotion
} = {}) {
  let sceneRoot = null;
  let rootRevision;
  let isEnabled = false;
  let bindings = [];
  let entityStates = {};
  let focusedId = "";
  let isDisposed = false;
  let objectsByBindingKey = new Map();
  let effectsByBindingKey = new Map();
  let hasIndexedScene = false;
  let lastTickMs = -Infinity;
  let overviewOverride;
  // 总览模式：显式指定优先，否则「没有聚焦任何设备」即视为总览。
  const isOverviewMode = () => overviewOverride ?? !focusedId;
  // reducedMotion 显式配置优先于系统偏好；两者都没有时按「不减少」处理。
  let reducedMotionOverride = typeof reducedMotion == "boolean" ? reducedMotion : undefined;
  // 每次调用都重读系统偏好（实现见 core/motion-preference.js）：用户可能在页面存活期间切换系统的
  // 「减少动态效果」，缓存成常量就再也听不到这次变化。显式配置（reducedMotion 参数）优先于系统偏好。
  const prefersReducedMotion = () => reducedMotionOverride ?? prefersReducedMotionNow();
  // 顶点着色器：总览模式下把气幕在三个方向上都放大，让远景也能看见气流；
  // 出风口一侧（uv.y = 0）保持原始位置与宽度，因此只会向远端扩张。
  const FLOW_VERTEX_SHADER =
    "attribute float flowLayer;\n    uniform float flowOverview;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    void main() {\n      vFlowUv = uv; vFlowLayer = flowLayer;\n      vec3 expanded = position;\n      // Expand away from the outlet; the mouth keeps its authored position and width.\n      expanded.x *= 1.0 + flowOverview * 0.15 * uv.y;\n      expanded.y *= 1.0 + flowOverview * 0.25;\n      expanded.z *= 1.0 + flowOverview * 0.35;\n      gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);\n    }";
  // 片元着色器：用值噪声做纵向纤维状气流，横向高斯边缘 + 纵向距离衰减；
  // 两层（flowLayer）叠加出厚度，总览模式下频率更低（更粗的纤维）、更不透。
  const FLOW_FRAGMENT_SHADER =
    "uniform vec3 flowColor;\n    uniform float flowOpacity;\n    uniform float flowTime;\n    uniform float flowOverview;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    float hash(vec2 p) {\n      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);\n    }\n    float noise(vec2 p) {\n      vec2 cell = floor(p), f = fract(p);\n      f = f * f * (3.0 - 2.0 * f);\n      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),\n        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);\n    }\n    void main() {\n      float t = vFlowUv.y, across = vFlowUv.x * 2.0 - 1.0;\n      float edge = exp(-0.8 * across * across) * (1.0 - smoothstep(0.45, 1.0, abs(across)));\n      float distanceFade = smoothstep(0.0, 0.025, t) * exp(-mix(1.15, 0.9, flowOverview) * t)\n        * (1.0 - smoothstep(0.62, 1.0, t));\n      // Advected, lengthwise fibres: deliberately much longer than they are\n      // wide, so the air reads as a continuous breeze, never dots or light bars.\n      float drift = sin(t * 4.0 - flowTime * 0.45 + vFlowLayer * 2.0) * t * 0.16;\n      // Keep individual strands fine even in overview; visibility comes from\n      // their bright cores rather than widening them into opaque white bands.\n      vec2 p = vec2(vFlowUv.x * mix(22.0, 16.0, flowOverview) + drift + vFlowLayer * 23.0,\n        t * mix(1.8, 1.25, flowOverview) - flowTime * 0.9);\n      float detail = 0.28;\n      float fibres = noise(p) * (1.0 - detail) + noise(p * vec2(1.9, 0.7) + 13.0) * detail;\n      // Give the moving strands enough coverage on both pale wood and dark\n      // floors. Keep the empty space clear instead of adding a uniform veil.\n      float density = 0.012 + 1.25 * fibres * fibres;\n      // A soft density ceiling keeps the stronger near-outlet strands\n      // translucent while letting their motion remain readable at room scale.\n      density = density / (1.0 + density * 0.65);\n      // Moving fibre crests catch a white highlight, with the mode color in\n      // their softer edges. This remains one transparent draw, without lights.\n      float crest = smoothstep(0.56, 0.9, fibres);\n      float highlight = crest * crest;\n      float alpha = min(0.56, flowOpacity * edge * distanceFade\n        * (density + highlight * 0.16) * mix(1.0, 0.42, vFlowLayer));\n      vec3 strandColor = mix(flowColor, vec3(1.0), highlight * 0.68);\n      gl_FragColor = vec4(strandColor, alpha);\n      #include <colorspace_fragment>\n    }";
  /**
   * 由模型包围盒推导出风口版式（位置、宽度、长度、下坠量）。
   * 三种形态各有经验参数：airoutlet（风口）口长沿 Z、旋转 90°；floorac（柜机）风道窄而长、略向下坠；
   * wallac（挂机）风道宽而短、下坠更多。
   */
  function resolveOutletLayout(model) {
    // 精确顶点包围盒（exact）：风口模型刚加载时几何体可能还没算过缓存盒，且要挡住 NaN 顶点。
    const modelBox = modelWorldBounds(model, THREE, { exact: true });
    if (!modelBox) {
      return null;
    }
    const modelSize = modelBox.getSize(new THREE.Vector3());
    if (modelSize.x <= 0 || modelSize.y <= 0 || modelSize.z <= 0) {
      return null;
    }
    // 模型没声明类型时按比例猜：明显又高又窄的当作柜机，否则当作挂机。
    const modelType =
      model.userData.environmentModelType ||
      (modelSize.y > modelSize.x * 1.5 && modelSize.y > modelSize.z * 1.5 ? "floorac" : "wallac");
    if (modelType === "airoutlet") {
      // 风口：口长沿 Z 轴，因此整体绕 Y 旋转 90°；口长夹在 0.6–2.4 米之间。
      const mouthLength = Math.min(2.4, Math.max(0.6, modelSize.z * 0.9));
      return {
        type: modelType,
        width: modelSize.z * 0.88,
        length: mouthLength,
        // 下坠量取口长的 28%：气流先水平再下垂的观感。
        fall: mouthLength * 0.28,
        rotationY: Math.PI / 2,
        spread: 0.3,
        // 出风口稍微外移（max.x + 3% 厚度，最小 3mm），避免与模型面共面闪烁。
        outlet: [
          modelBox.max.x + Math.max(0.003, modelSize.x * 0.03),
          modelBox.min.y + modelSize.y * 0.48,
          (modelBox.min.z + modelBox.max.z) / 2
        ]
      };
    }
    const isFloorUnit = modelType === "floorac";
    // 柜机出风道窄、挂机风道宽（覆盖整个机身宽度）。
    const ductWidth = modelSize.x * (isFloorUnit ? 0.48 : 0.84);
    // 风道长度：柜机至少 3 倍机宽（往下吹得远），挂机 1.8 倍机宽；统一夹在 0.3–2.8 米。
    const ductLength = Math.min(
      2.8,
      Math.max(0.3, isFloorUnit ? Math.max(modelSize.y * 0.95, modelSize.x * 3) : modelSize.x * 1.8)
    );
    return {
      type: modelType,
      width: ductWidth,
      length: ductLength,
      // 只有柜机需要额外的竖向张开（气流从柜机出风口向下扩散）。
      verticalSpan: isFloorUnit ? modelSize.y * 0.4 : 0,
      // 柜机下坠轻（12%），挂机下坠重（38%）—— 挂机装得高，气流要更快落到地面。
      fall: ductLength * (isFloorUnit ? 0.12 : 0.38),
      outlet: [
        (modelBox.min.x + modelBox.max.x) / 2,
        modelBox.min.y + modelSize.y * (isFloorUnit ? 0.68 : 0.18),
        modelBox.max.z + Math.max(0.003, modelSize.z * 0.03)
      ]
    };
  }
  /**
   * 构建气幕几何：两层 25×7 的网格面片。
   * UV 的 y 方向表示「离出风口的距离」，着色器按它做衰减与噪声取样；
   * flowLayer 属性区分两层，用于错开纤维相位与透明度。
   */
  function buildFlowGeometry(layout) {
    const positions = [];
    const uvs = [];
    const layerIndices = [];
    const indexTriples = [];
    for (let layerIndex = 0; layerIndex < 2; layerIndex++) {
      const baseVertexIndex = positions.length / 3;
      // 25 行 × 7 列的网格：列数是 6 段（保证中间有一列正好在轴线上）。
      for (let rowIndex = 0; rowIndex <= 24; rowIndex++) {
        const rowT = rowIndex / 24;
        // 越远离风口越宽，且带一点二次项，形成「喇叭口」式扩散。
        const rowExpansion = 1 + (rowT * 0.8 + rowT * rowT * 0.15) * (layout.spread ?? 1);
        for (let columnIndex = 0; columnIndex <= 6; columnIndex++) {
          const columnU = columnIndex / 6;
          const columnOffset = columnU * 2 - 1;
          // 靠近风口时向中间收拢（口沿形状），远离后逐渐展开。
          const mouthTaper = (1 - columnOffset * columnOffset) * layout.width * rowT * 0.09;
          // 第二层再向外扩一点，两层之间形成体积感而不是重合的两片。
          const layerSpread = layerIndex * layout.width * rowT * 0.075;
          const isMouthLayer = layout.verticalSpan > 0 && layerIndex === 0;
          positions.push(
            isMouthLayer ? mouthTaper : columnOffset * layout.width * 0.5 * rowExpansion,
            // 竖向：下坠按「线性 + 二次」混合，柜机的口沿层还要额外张开。
            -layout.fall * (rowT * 0.35 + rowT * 0.65 * rowT) +
              (isMouthLayer
                ? columnOffset * layout.verticalSpan * 0.5 * (1 + rowT * 0.2)
                : mouthTaper + layerSpread),
            layout.length * rowT
          );
          uvs.push(columnU, rowT);
          layerIndices.push(layerIndex);
          if (rowIndex < 24 && columnIndex < 6) {
            // 每个格子两个三角形；列宽 7 表示下一行的同列顶点偏移 7。
            const cellVertexIndex = baseVertexIndex + rowIndex * 7 + columnIndex;
            const nextRowVertexIndex = cellVertexIndex + 6 + 1;
            indexTriples.push(
              cellVertexIndex,
              cellVertexIndex + 1,
              nextRowVertexIndex,
              cellVertexIndex + 1,
              nextRowVertexIndex + 1,
              nextRowVertexIndex
            );
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("flowLayer", new THREE.Float32BufferAttribute(layerIndices, 1));
    geometry.setIndex(indexTriples);
    geometry.computeBoundingBox();
    // 顶点着色器会在总览模式下把顶点放大（x/y/z 分别最多 15% / 25% / 35%），
    // 而包围盒只按原始顶点算，因此这里按同样的放大系数手动撑大包围盒，
    // 否则气幕在远景下会被视锥剔除掉一截。
    const scratchVertex = new THREE.Vector3();
    for (let vertexIndex = 0; vertexIndex < positions.length / 3; vertexIndex++) {
      geometry.boundingBox.expandByPoint(
        scratchVertex.set(
          positions[vertexIndex * 3] * (1 + uvs[vertexIndex * 2 + 1] * 0.15),
          positions[vertexIndex * 3 + 1] * 1.25,
          positions[vertexIndex * 3 + 2] * 1.35
        )
      );
    }
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    return geometry;
  }
  /** 释放一片气流：摘除网格并销毁几何体与材质。 */
  function disposeEffect(effectToDispose) {
    effectToDispose.mesh.removeFromParent();
    effectToDispose.mesh.geometry.dispose();
    effectToDispose.mesh.material.dispose();
  }
  /** 重新推导版式；版式变化时重建几何体与位置，否则不动（避免每帧重建）。 */
  function refreshEffectLayout(effectEntry) {
    const nextLayout = resolveOutletLayout(effectEntry.model);
    if (!nextLayout) {
      return false;
    }
    const layoutSignature = JSON.stringify(nextLayout);
    if (layoutSignature !== effectEntry.layoutSignature) {
      effectEntry.mesh.geometry.dispose();
      effectEntry.mesh.geometry = buildFlowGeometry(nextLayout);
      effectEntry.mesh.position.fromArray(nextLayout.outlet);
      effectEntry.mesh.rotation.y = nextLayout.rotationY || 0;
      effectEntry.mesh.updateMatrix();
      effectEntry.layoutSignature = layoutSignature;
      effectEntry.mesh.userData.outletLayout = nextLayout;
    }
    return true;
  }
  /**
   * 为某个模型创建气流网格。
   */
  function createFlowEffect(modelObject, binding) {
    const outletLayout = resolveOutletLayout(modelObject);
    if (!outletLayout) {
      return null;
    }
    const overviewValue = isOverviewMode() ? 1 : 0;
    const material = new THREE.ShaderMaterial({
      vertexShader: FLOW_VERTEX_SHADER,
      fragmentShader: FLOW_FRAGMENT_SHADER,
      uniforms: {
        flowColor: {
          value: new THREE.Color(FLOW_STATE_COLORS.other)
        },
        // 初始不透明度为 0：等状态同步后再淡入，避免加载瞬间闪一片气流。
        flowOpacity: {
          value: 0
        },
        flowTime: {
          value: 0
        },
        flowOverview: {
          value: overviewValue
        }
      },
      transparent: true,
      // 不写深度：气幕是加性观感的效果层，写深度会遮住后面的家具；
      // 但仍做深度测试，保证被墙挡住时不会透出来。
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      // 双面渲染只算一遍光照，省一半开销。
      forceSinglePass: true,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(buildFlowGeometry(outletLayout), material);
    mesh.name = "environment-airflow-" + (binding.id || binding.modelId);
    mesh.userData.environmentAirflow = true;
    // environmentEffect 让场景清理逻辑把它当作环境效果统一处理。
    mesh.userData.environmentEffect = true;
    mesh.userData.outletLayout = outletLayout;
    mesh.position.fromArray(outletLayout.outlet);
    mesh.rotation.y = outletLayout.rotationY || 0;
    mesh.updateMatrix();
    // 位置固定不变，关掉自动矩阵更新（只在版式变化时手动 updateMatrix）。
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // renderOrder 4：压在半透明地面之上、状态点之下。
    mesh.renderOrder = 4;
    mesh.visible = false;
    mesh.raycast = () => {};
    modelObject.add(mesh);
    return {
      mesh: mesh,
      model: modelObject,
      binding: binding,
      layoutSignature: JSON.stringify(outletLayout),
      target: 0,
      startOpacity: 0,
      overviewTarget: overviewValue,
      startOverview: overviewValue,
      startTime: null
    };
  }
  /** 索引场景里所有环境模型，建立「(楼层, 模型) → 节点」的映射。 */
  function indexSceneModels() {
    objectsByBindingKey = new Map();
    sceneRoot?.traverse?.(traversedNode => {
      if (
        traversedNode.userData?.environmentAirflow ||
        traversedNode.userData?.environmentModelId == null
      ) {
        return;
      }
      // 楼层 ID 允许向上继承；模型自身的 environmentModelId 表示这是模型根节点。
      let nodeFloorId = traversedNode.userData.environmentFloorId;
      for (
        let ancestorNode = traversedNode.parent;
        nodeFloorId == null && ancestorNode;
        ancestorNode = ancestorNode.parent
      ) {
        nodeFloorId = ancestorNode.userData?.environmentFloorId;
      }
      objectsByBindingKey.set(
        sceneModelKey(nodeFloorId, traversedNode.userData.environmentModelId),
        traversedNode
      );
    });
    hasIndexedScene = true;
  }
  /**
   * 按绑定列表增删 / 复用气流效果。
   */
  function syncEffects(shouldRefreshLayouts = false) {
    // 惰性建索引：只有真正启用且有绑定时才遍历场景。
    if (!hasIndexedScene && isEnabled && bindings.length) {
      indexSceneModels();
    }
    const activeBindingKeys = new Set();
    for (const bindingConfig of bindings) {
      if (bindingConfig.visible === false || bindingConfig.modelId == null) {
        continue;
      }
      const bindingKey = sceneModelKey(bindingConfig.floorId, bindingConfig.modelId);
      const boundModel = objectsByBindingKey.get(bindingKey);
      if (!boundModel) {
        continue;
      }
      activeBindingKeys.add(bindingKey);
      let existingEffect = effectsByBindingKey.get(bindingKey);
      if (existingEffect && existingEffect.model !== boundModel) {
        // 模型被重建：旧网格挂在已废弃的节点上，必须重建。
        disposeEffect(existingEffect);
        effectsByBindingKey.delete(bindingKey);
        existingEffect = null;
      }
      if (!existingEffect && isEnabled) {
        existingEffect = createFlowEffect(boundModel, bindingConfig);
        if (existingEffect) {
          effectsByBindingKey.set(bindingKey, existingEffect);
        }
      }
      if (existingEffect) {
        existingEffect.binding = bindingConfig;
        // 结构变化时刷新版式；若模型已经量不出尺寸（正在卸载）就顺手回收。
        if (shouldRefreshLayouts && !refreshEffectLayout(existingEffect)) {
          disposeEffect(existingEffect);
          effectsByBindingKey.delete(bindingKey);
        }
      }
    }
    for (const [removedKey, removedEffect] of effectsByBindingKey) {
      if (!activeBindingKeys.has(removedKey)) {
        disposeEffect(removedEffect);
        effectsByBindingKey.delete(removedKey);
      }
    }
  }
  /** 按最新状态更新每片气流的颜色与目标不透明度。 */
  function updateEffectStates() {
    let didChange = false;
    for (const effect of effectsByBindingKey.values()) {
      const effectBinding = effect.binding;
      const stateRecord = readFromMapOrRecord(entityStates, effectBinding.entityId);
      const stateBody = resolveStateEntry(stateRecord, {});
      const stateValue = stateTextOf(stateBody);
      const hvacAction = normalizedTextOf(stateBody.attributes?.hvac_action || "");
      // 聚焦了别的设备时，本设备的气流不显示（画面里只保留一个焦点）。
      const isFocusTarget = !focusedId || effectBinding.id === focusedId;
      // 出风判定：state 不是关机 / 未知，且 hvac_action 为空（设备没上报）或落在白名单内。
      const isAirflowActive =
        !["", "off", "unknown", "unavailable"].includes(stateValue) &&
        (hvacAction === "" || AIRFLOW_ACTIONS.has(hvacAction));
      const overviewUniformValue = isOverviewMode() ? 1 : 0;
      // 总览模式下用满不透明度（远景本来就看不清）；聚焦时也保持不透明，
      // 让细腻的高光纤维能被看见 —— 之前聚焦降到 0.68 会把高光一起压掉。
      const targetOpacity =
        isEnabled && isFocusTarget && isAirflowActive ? (overviewUniformValue ? 1.45 : 1) : 0;
      const uniforms = effect.mesh.material.uniforms;
      const targetColor = new THREE.Color(FLOW_STATE_COLORS[stateValue] || FLOW_STATE_COLORS.other);
      // 只在可见时才换颜色：隐藏状态下换色会白白触发一次重绘。
      if (targetOpacity > 0 && !uniforms.flowColor.value.equals(targetColor)) {
        uniforms.flowColor.value.copy(targetColor);
        didChange = true;
      }
      if (effect.target !== targetOpacity || effect.overviewTarget !== overviewUniformValue) {
        // 目标变化：记录淡入淡出的起点，实际推进交给 tick。
        effect.target = targetOpacity;
        effect.startOpacity = uniforms.flowOpacity.value;
        effect.overviewTarget = overviewUniformValue;
        effect.startOverview = uniforms.flowOverview.value;
        effect.startTime = null;
        didChange = true;
      }
      if (!isFocusTarget || prefersReducedMotion()) {
        // 非焦点或用户要求减少动态效果：不做过渡，直接跳到目标值。
        if (
          uniforms.flowOpacity.value !== targetOpacity ||
          uniforms.flowOverview.value !== overviewUniformValue
        ) {
          didChange = true;
        }
        uniforms.flowOpacity.value = targetOpacity;
        uniforms.flowOverview.value = overviewUniformValue;
        effect.mesh.visible = targetOpacity > 0;
        if (prefersReducedMotion()) {
          // 冻结动画时间，气流保持静态形状。
          uniforms.flowTime.value = 0;
        }
      } else if (targetOpacity > 0) {
        effect.mesh.visible = true;
      } else if (uniforms.flowOpacity.value === 0) {
        // 淡出已经结束才真正隐藏，避免中途截断动画。
        effect.mesh.visible = false;
        uniforms.flowOverview.value = overviewUniformValue;
      }
    }
    if (didChange) {
      requestFrame();
    }
  }
  /**
   * 设置场景根节点。
   */
  function setRoot(nextRoot, revision) {
    if (!isDisposed && (sceneRoot !== nextRoot || rootRevision !== revision)) {
      if (sceneRoot !== nextRoot) {
        // 换了根节点：旧效果全部作废（它们挂在旧场景的节点上）。
        for (const staleEffect of effectsByBindingKey.values()) {
          disposeEffect(staleEffect);
        }
        effectsByBindingKey.clear();
        objectsByBindingKey.clear();
        hasIndexedScene = false;
      }
      sceneRoot = nextRoot || null;
      rootRevision = revision;
      hasIndexedScene = false;
      if (!!isEnabled || !!effectsByBindingKey.size) {
        // 场景重建后模型节点全变了，必须重索引并重算版式。
        indexSceneModels();
        syncEffects(true);
        updateEffectStates();
        requestFrame();
      }
    }
  }
  /**
   * 批量更新内部状态。
   */
  function setState(options = {}) {
    if (isDisposed) {
      return;
    }
    // 先记下旧的「减少动态效果」结果，用于判断是否需要补一次重绘。
    const previousReducedMotion = prefersReducedMotion();
    // 逐项用 hasOwn 判断而不是取默认值：调用方只传关心的字段。
    if (Object.hasOwn(options, "enabled")) {
      isEnabled = options.enabled === true;
    }
    if (Object.hasOwn(options, "bindings")) {
      bindings = Array.isArray(options.bindings) ? options.bindings : [];
    }
    if (Object.hasOwn(options, "states")) {
      entityStates = options.states || {};
    }
    if (Object.hasOwn(options, "focusedId")) {
      focusedId = options.focusedId || "";
    }
    if (Object.hasOwn(options, "overview")) {
      overviewOverride = typeof options.overview == "boolean" ? options.overview : undefined;
    }
    if (Object.hasOwn(options, "reducedMotion")) {
      reducedMotionOverride = options.reducedMotion === true;
    }
    syncEffects();
    updateEffectStates();
    if (previousReducedMotion !== prefersReducedMotion()) {
      requestFrame();
    }
  }
  /**
   * 推进淡入淡出与气流动画。
   */
  function tick(timestampMs) {
    if (
      isDisposed ||
      prefersReducedMotion() ||
      // 逗号表达式：先给非法时间戳补上当前时间，再判断有没有任何效果需要动画。
      (Number.isFinite(timestampMs) || (timestampMs = globalThis.performance?.now() ?? Date.now()),
      ![...effectsByBindingKey.values()].some(
        anyEffect => anyEffect.target > 0 || anyEffect.mesh.material.uniforms.flowOpacity.value > 0
      ))
    ) {
      return false;
    }
    // 气流动画限流在 30fps：噪声细节不需要更高帧率。
    const frameIntervalMs = 1000 / 30;
    if (timestampMs >= lastTickMs && timestampMs - lastTickMs < frameIntervalMs) {
      return true;
    }
    // 把上次更新时刻吸附到帧网格，避免长期节流下的累计漂移。
    lastTickMs =
      Number.isFinite(lastTickMs) && timestampMs >= lastTickMs
        ? timestampMs - ((timestampMs - lastTickMs) % frameIntervalMs)
        : timestampMs;
    let shouldAnimate = false;
    let didUniformsChange = false;
    for (const animatedEffect of effectsByBindingKey.values()) {
      const effectUniforms = animatedEffect.mesh.material.uniforms;
      if (
        effectUniforms.flowOpacity.value !== animatedEffect.target ||
        effectUniforms.flowOverview.value !== animatedEffect.overviewTarget
      ) {
        if (animatedEffect.startTime === null) {
          animatedEffect.startTime = timestampMs;
        }
        // 不透明度用线性过渡（240ms），总览系数用 smoothstep：
        // 前者短促干脆，后者涉及几何放大，缓和一点看起来更自然。
        const fadeProgress = Math.max(
          0,
          Math.min(1, (timestampMs - animatedEffect.startTime) / 240)
        );
        const opacityValue =
          animatedEffect.startOpacity +
          (animatedEffect.target - animatedEffect.startOpacity) * fadeProgress;
        const easedProgress = fadeProgress * fadeProgress * (3 - fadeProgress * 2);
        const animatedOverviewValue =
          animatedEffect.startOverview +
          (animatedEffect.overviewTarget - animatedEffect.startOverview) * easedProgress;
        if (
          effectUniforms.flowOpacity.value !== opacityValue ||
          effectUniforms.flowOverview.value !== animatedOverviewValue
        ) {
          didUniformsChange = true;
        }
        effectUniforms.flowOpacity.value = opacityValue;
        effectUniforms.flowOverview.value = animatedOverviewValue;
        if (fadeProgress === 1) {
          // 过渡结束：直接写入精确目标值，避免浮点残差。
          effectUniforms.flowOpacity.value = animatedEffect.target;
          effectUniforms.flowOverview.value = animatedEffect.overviewTarget;
          animatedEffect.mesh.visible = animatedEffect.target > 0;
        } else {
          shouldAnimate = true;
        }
      }
      if (
        animatedEffect.mesh.visible &&
        (animatedEffect.target > 0 || effectUniforms.flowOpacity.value > 0)
      ) {
        // 时间参数对 1000 取模：数值过大时着色器里的 sin 会因浮点精度不足而抖动。
        const flowTimeSeconds = (timestampMs / 1000) % 1000;
        if (effectUniforms.flowTime.value !== flowTimeSeconds) {
          didUniformsChange = true;
        }
        effectUniforms.flowTime.value = flowTimeSeconds;
        shouldAnimate = true;
      }
    }
    if (didUniformsChange) {
      requestFrame();
    }
    return shouldAnimate;
  }
  /** 系统「减少动态效果」设置变化时重新结算一次（可能需要立刻关掉动画，或把停掉的动画唤醒）。 */
  const handleReducedMotionChange = () => {
    if (!isDisposed) {
      updateEffectStates();
      requestFrame();
    }
  };
  // 停在偏好变化上：摘钩函数由 motion-preference.js 返回，拿不到 matchMedia 时是空函数，不必判空。
  const stopWatchingReducedMotion = onReducedMotionChange(handleReducedMotionChange);
  return {
    setRoot: setRoot,
    setState: setState,
    tick: tick,
    /** 下次推进的间隔：有需要动画的效果且未开启减少动态效果时按 30fps。 */
    nextDelay() {
      if (
        !isDisposed &&
        !prefersReducedMotion() &&
        [...effectsByBindingKey.values()].some(
          candidateEffect =>
            candidateEffect.target > 0 ||
            candidateEffect.mesh.material.uniforms.flowOpacity.value > 0
        )
      ) {
        return 1000 / 30;
      } else {
        return Infinity;
      }
    },
    dispose() {
      if (!isDisposed) {
        isDisposed = true;
        // 必须摘掉媒体查询监听：它是全局对象上的引用，不摘会阻止本模块被回收。
        stopWatchingReducedMotion();
        for (const disposedEffect of effectsByBindingKey.values()) {
          disposeEffect(disposedEffect);
        }
        effectsByBindingKey.clear();
        objectsByBindingKey.clear();
        bindings = [];
        entityStates = {};
        sceneRoot = null;
      }
    }
  };
}
