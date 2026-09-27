/**
 * NAS 运行状态指示灯。
 */

type StateObject = {
  available?: boolean;
  state?: unknown;
  attributes?: { friendly_name?: unknown; [key: string]: unknown };
  [key: string]: unknown;
};

type NasItem = {
  id: string;
  entityId?: string;
  floorId?: unknown;
  modelId?: unknown;
  statusSource?: {
    primaryEntityId?: string;
    name?: string;
    metrics?: Array<{ entityId?: string }>;
  };
  [key: string]: unknown;
};

type DeviceStateView = {
  available?: boolean;
  on?: boolean;
  name?: unknown;
  color?: string;
  visible?: boolean;
  status?: string;
};

type Object3D = {
  parent: Object3D | null;
  userData: Record<string, unknown>;
  visible: boolean;
  isMesh?: boolean;
  material?: unknown;
  name?: string;
  renderOrder?: number;
  raycast?: () => void;
  onBeforeRender?: (renderer: { getSize: (v: unknown) => { y: number } }) => void;
  scale: { set: (x: number, y: number, z: number) => void };
  position: { set: (x: number, y: number, z: number) => void };
  traverse: (cb: (o: Object3D) => void) => void;
  add: (child: Object3D) => void;
  removeFromParent: () => void;
};

type LedMesh = Object3D & {
  material: {
    dispose: () => void;
    uniforms: Record<string, { value: any }>;
  };
};

type MeshEntry = {
  model: Object3D;
  mesh: LedMesh;
  indicators: Map<Object3D, boolean>;
  color?: string;
  breathing?: boolean;
};

type ThreeLib = {
  PlaneGeometry: new (w: number, h: number) => { dispose: () => void };
  ShaderMaterial: new (params: Record<string, unknown>) => { uniforms: Record<string, { value: unknown }> };
  Mesh: new (geometry: unknown, material: unknown) => Object3D;
  Vector3: new () => {
    x: number; y: number; z: number;
  };
  Vector2: new () => unknown;
  Color: new (hex: string) => { set: (hex: string) => void };
};

// 状态条目归一（变更对象 / 状态对象两种形态）与「按 ID 切域」只有一份实现（`/static/utils/`
import { readFromMapOrRecord, resolveStateEntry, stateTextOf } from "../core/static-helpers.js";
import { sceneModelKey } from "../core/scene-model-key.js";
import { modelWorldBounds } from "../core/scene-model-bounds.js";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "../core/motion-preference.js";
/**
 * 归一化单个 NAS 开关实体。
 */
function nasState(entityId: string, state: unknown) {
  const stateObject = (resolveStateEntry(state, {}) || {}) as StateObject;
  const stateValue = stateTextOf(stateObject);
  // 只接受三元组里明确的开 / 关：unknown、unavailable 等一律算不可用，
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
 */
export function nasDeviceState(item: NasItem, stateSources: unknown = {}) {
  // 状态源可能是 Map（舞台侧按 entityId 建的索引）也可能是普通对象；取值口径只有一份实现
  const readState = (stateEntityId: string) => readFromMapOrRecord(stateSources, stateEntityId);
  if (item.entityId) {
    return nasState(item.entityId, readState(item.entityId));
  }
  const hasActiveMetric = [
    ...new Set([
      item.statusSource?.primaryEntityId,
      ...(item.statusSource?.metrics || []).map((metricSource: { entityId?: string }) => metricSource.entityId)
    ])
  ].some((metricEntityId: string | undefined) => {
    const metricState = resolveStateEntry(readState(metricEntityId || "")) as StateObject | null;
    return (
      !!metricEntityId &&
      metricState?.available !== false &&
      // 数值型传感器只要 state 不是空 / 未知就算「有数据」，
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
// 内置绿渐变的「默认绿」哨兵色：readState 给出的颜色若是它，说明设备处于默认的正常色，
const DEFAULT_INDICATOR_COLOR = "#43ce82";
// indicatorColor uniform 的初值：NAS 走内置绿渐变用不到它，通用设备每次 sync 都会被
const FALLBACK_INDICATOR_COLOR = "#0fff33";
/**
 * 创建 NAS 指示灯控制器。
 */
export function createNasStatus({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
  modelType: modelType = "nas",
  readState: readState = nasDeviceState
}: {
  THREE: ThreeLib;
  requestFrame?: () => void;
  modelType?: string;
  readState?: (item: NasItem, states?: unknown) => DeviceStateView;
}) {
  const meshesByBindingId = new Map<string, MeshEntry>();
  // 指示灯尺寸靠 scale 控制，几何体只需一份 1×1 平面。
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  // 场景结构缓存：只有根节点、修订号或绑定签名变化时才重建索引。
  let syncedRoot: Object3D | null | undefined;
  let syncedRevision: unknown;
  let syncedBindingsSignature: string | undefined;
  let isDisposed = false;
  // 是否有「正在呼吸」的指示灯，决定 tick / nextDelay 是否需要继续工作；
  let hasVisibleIndicator = false;
  let lastTickMs = -Infinity;
  // 两个来源都查：某些嵌入环境里 globalThis.matchMedia 缺失而 window 上有，
  const prefersReducedMotion = () => prefersReducedMotionNow();
  /**
   * 释放一条记录：恢复被隐藏的原生指示灯，移除并销毁自制平面。
   */
  function releaseEntry(entry: MeshEntry) {
    // 逐个还原为「创建时记录的可见性」，而不是无脑设成 true，
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
  }: {
    root?: Object3D | null;
    revision?: unknown;
    bindings?: NasItem[];
    states?: unknown;
    enabled?: boolean;
    sizeScale?: number;
    brightness?: number;
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
        // 这里必须比对注入的 modelType，不能写死 "nas"：通用设备（冰箱 / 洗衣机 …）的模型
        if (sceneObject.userData?.environmentModelType !== modelType) {
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
          if (existing) {
            releaseEntry(existing);
          }
          const modelBounds = (modelWorldBounds as unknown as (model: Object3D, THREE: ThreeLib) => { getSize: (v: unknown) => { x: number; y: number; z: number }; getCenter: (v: unknown) => { x: number; y: number; z: number }; min: { y: number }; max: { z: number } } | null)(matchedModel, THREE);
          // 模型还没有几何体（正在加载）时不建立记录，下一轮结构变化会重试。
          if (!modelBounds) {
            meshesByBindingId.delete(binding.id);
            continue;
          }
          const modelSize = modelBounds.getSize(new THREE.Vector3());
          const modelCenter = modelBounds.getCenter(new THREE.Vector3());
          // 着色器绘制指示灯：顶点着色器贴点并保证最小屏幕尺寸，片元画「核心 + 光晕」并在
          const ledMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            uniforms: {
              // HA 侧解析出的具体颜色；customColor 为 1 时着色器会用它取代内置绿渐变。
              indicatorColor: {
                value: new THREE.Color(FALLBACK_INDICATOR_COLOR)
              },
              // 0/1 开关：非 NAS 模型且颜色不是默认绿时为 1（用 indicatorColor 覆盖调色板）；
              customColor: {
                value: modelType !== "nas" ? 1 : 0
              },
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
              "varying vec2 ledUv; uniform float pulse; uniform float brightness; uniform vec3 indicatorColor; uniform float customColor; void main(){float r=length(ledUv-0.5)*2.0;float core=1.0-smoothstep(0.28,0.50,r);float halo=pow(max(0.0,1.0-r),1.7)*0.8;float a=min((core+halo)*pulse,1.0)*brightness;if(a<0.005)discard;gl_FragColor=vec4(mix(vec3(0.06,1.0,0.20),vec3(0.48,1.0,0.60),core)*(1.0-customColor)+indicatorColor*customColor,a);}"
          });
          const ledMesh = new THREE.Mesh(planeGeometry, ledMaterial) as LedMesh;
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
          ledMesh.onBeforeRender = renderer => {
            (ledMaterial as { uniforms: Record<string, { value: unknown }> }).uniforms.viewportHeight.value = renderer.getSize(viewportSize).y;
          };
          // 尺寸取模型宽度的 22%，并夹在 0.025–0.075 之间，
          const indicatorSize = Math.max(0.025, Math.min(0.075, modelSize.x * 0.22));
          ledMesh.scale.set(indicatorSize, indicatorSize, indicatorSize);
          ledMesh.position.set(
            modelCenter.x + modelSize.x * 0.36,
            modelBounds.min.y + modelSize.y * 0.26,
            modelBounds.max.z + 0.003
          );
          const suppressedIndicators = new Map();
          matchedModel.traverse((child: Object3D) => {
            if (!child.isMesh || child === ledMesh || child.userData?.environmentEffect) {
              return;
            }
            // 模型自带的指示灯有两种特征：材质名以 nas-material-4 结尾（模型导出时的约定），
            if (
              (Array.isArray(child.material) ? child.material : [child.material]).some(
                (childMaterial: { name?: string; emissive?: { getHex: () => number } }) =>
                  /nas-material-4$/.test(childMaterial?.name || "") ||
                  (childMaterial?.emissive?.getHex() || 0) > 0
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
            indicators: suppressedIndicators,
            // 上次生效的颜色（用于判断是否需要重绘）与当前是否参与呼吸。
            color: undefined,
            breathing: false
          };
          meshesByBindingId.set(binding.id, existing);
        }
      }
      for (const [bindingId, staleEntry] of meshesByBindingId) {
        if (!activeBindingIds.has(bindingId) && staleEntry) {
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
      // 状态读取口径由调用方注入：NAS 默认 nasDeviceState（只回 on），通用设备回 deviceStatus
      const deviceState = readState(activeBinding, states);
      if (deviceState.color) {
        needsRender ||= bindingEntry.color !== deviceState.color;
        bindingEntry.color = deviceState.color;
        (uniforms.indicatorColor.value as { set: (c: string) => void }).set(deviceState.color);
      }
      // customColor 是片元着色器的调色板开关：只有「非 NAS 模型 + 颜色不是默认绿」才为 1，
      const customColor =
        modelType !== "nas" && deviceState.color !== DEFAULT_INDICATOR_COLOR ? 1 : 0;
      needsRender ||= uniforms.customColor.value !== customColor;
      uniforms.customColor.value = customColor;
      // 显示条件：NAS 看「开机」；通用设备看 readState 的 visible 与四态 ——
      const shouldShow = !!(
        enabled &&
        (modelType === "nas"
          ? deviceState.on
          : deviceState.visible && deviceState.status !== "off")
      );
      needsRender ||= bindingEntry.mesh.visible !== shouldShow;
      bindingEntry.mesh.visible = shouldShow;
      // 呼吸态：NAS 亮起就呼吸；通用设备只在正常（normal）或告警（warning）时呼吸，
      bindingEntry.breathing = !!(
        shouldShow &&
        (modelType === "nas" ||
          deviceState.status === "normal" ||
          deviceState.status === "warning")
      );
      if (bindingEntry.breathing) {
        hasVisibleIndicator = true;
      } else {
        // 不呼吸的灯固定 pulse = 1（常亮），并只在需要时重绘一次。
        needsRender ||= uniforms.pulse.value !== 1;
        uniforms.pulse.value = 1;
      }
    }
    if (needsRender || hasVisibleIndicator) {
      requestFrame();
    }
  }
  /**
   * 推进呼吸动画。
   */
  function tick(nowMs: number) {
    if (isDisposed || !hasVisibleIndicator) {
      return false;
    }
    const reducedMotion = prefersReducedMotion();
    // 正常模式下把刷新限制在 30fps：呼吸灯不需要更高帧率，省下 GPU 给场景本身。
    if (!reducedMotion && nowMs - lastTickMs < 1000 / 30) {
      return true;
    }
    lastTickMs = nowMs;
    const pulse = reducedMotion
      ? 1
      : 0.14 + (0.5 - Math.cos((nowMs / 1400) * Math.PI * 2) * 0.5) * 0.86;
    let changed = false;
    for (const meshEntry of meshesByBindingId.values()) {
      // 只推进正在呼吸的灯：常亮的灯固定 pulse = 1，不参与逐帧抖动。
      if (meshEntry.mesh.visible && meshEntry.breathing) {
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
    // 下次 tick 的间隔：没有正在呼吸的指示灯、或用户要求减少动态效果时返回 Infinity，
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
