/**
 * 油烟机吸风动画（0.7.8 `rangehood-airflow`）。
 *
 * 沿油烟机正面生成 12 条向上收束的飘带，按动画实体的开关状态淡入淡出。
 * 飘带几何随模型包围盒自动缩放，不依赖固定模型尺寸。
 */

import { createAnimationCadence } from "../core/animation-work";
import { rangehoodState } from "./rangehood-state";

/** 单台油烟机的吸风飘带。 */
export function createRangehoodSuction(THREE: any) {
  const positionValues: number[] = [],
    uvValues: number[] = [],
    sideValues: number[] = [],
    phaseValues: number[] = [],
    indexValues: number[] = [];
  for (let stripeIndex = 0; stripeIndex < 12; stripeIndex++) {
    const sideSign = stripeIndex < 6 ? -1 : 1,
      stripeInSide = stripeIndex % 6,
      stripeStartVertex = positionValues.length / 3,
      bottomOffset = sideSign * (0.065 + stripeInSide * 0.058),
      topOffset = sideSign * (0.065 + stripeInSide * 0.044),
      bottomDepth = 0.03 + (stripeInSide % 2) * 0.15,
      topDepth = 0.005 + (stripeInSide % 2) * 0.055;
    for (let sampleIndex = 0; sampleIndex <= 56; sampleIndex++) {
      const sampleRatio = sampleIndex / 56,
        smoothT = sampleRatio * sampleRatio * (3 - 2 * sampleRatio),
        lateralOffset = THREE.MathUtils.lerp(bottomOffset, topOffset, smoothT),
        depthOffset = THREE.MathUtils.lerp(bottomDepth, topDepth, smoothT),
        yPosition = -0.54 + sampleRatio * 0.56;
      for (const side of [-1, 1])
        (positionValues.push(lateralOffset, yPosition, depthOffset),
          uvValues.push((side + 1) / 2, sampleRatio),
          sideValues.push(side),
          phaseValues.push(stripeIndex * 0.371));
      if (sampleIndex < 56) {
        const baseIndex = stripeStartVertex + sampleIndex * 2;
        indexValues.push(
          baseIndex,
          baseIndex + 1,
          baseIndex + 2,
          baseIndex + 1,
          baseIndex + 3,
          baseIndex + 2,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  (geometry.setAttribute("position", new THREE.Float32BufferAttribute(positionValues, 3)),
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvValues, 2)),
    geometry.setAttribute("flowSide", new THREE.Float32BufferAttribute(sideValues, 1)),
    geometry.setAttribute("flowPhase", new THREE.Float32BufferAttribute(phaseValues, 1)),
    geometry.setIndex(indexValues));

  const uniforms = {
    flowTime: { value: 0 },
    flowOpacity: { value: 0 },
    flowColor: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: `attribute float flowSide; attribute float flowPhase;
      uniform float flowTime; varying vec2 vUv; varying float vPhase;
      void main(){vUv=uv;vPhase=flowPhase;vec3 p=position;
        p.x+=sin(uv.y*7.0-flowTime*1.3+flowPhase*8.0)*0.010*sin(uv.y*3.14159);
        p.z+=sin(uv.y*5.0-flowTime+flowPhase*5.0)*0.006*sin(uv.y*3.14159);
        vec4 view=modelViewMatrix*vec4(p,1.0);
        view.x+=flowSide*mix(0.024,0.012,uv.y);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `uniform float flowTime;uniform float flowOpacity;uniform vec3 flowColor;
      varying vec2 vUv;varying float vPhase;
      void main(){float across=abs(vUv.x*2.0-1.0);
        float feather=exp(-across*across*5.0)*(1.0-smoothstep(0.65,1.0,across));
        float ends=smoothstep(0.0,0.18,vUv.y)*(1.0-smoothstep(0.87,1.0,vUv.y));
        float travel=fract(vUv.y*1.7-flowTime*0.52+vPhase);
        float wisp=exp(-pow((travel-0.5)*3.9,2.0));
        float alpha=feather*ends*(0.12+wisp*0.88)*flowOpacity*0.84;
        gl_FragColor=vec4(flowColor,alpha);
        #include <colorspace_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  ((mesh.name = "rangehood-suction"),
    (mesh.frustumCulled = false),
    (mesh.visible = false),
    Object.assign(mesh.userData, {
      environmentEffect: true,
      environmentAirflow: true,
      rangehoodAirflow: true,
      disableContactShadow: true,
    }),
    (mesh.raycast = () => {}));

  let targetOpacity = 0,
    isDisposed = false;
  return {
    mesh,
    get active() {
      return !isDisposed && (mesh.visible || targetOpacity > 0);
    },
    configure({ power, enabled = true, color }: any) {
      if (isDisposed) return;
      ((targetOpacity = power && enabled ? 1 : 0),
        color !== undefined && uniforms.flowColor.value.setHex(color));
    },
    update(elapsedSeconds: number) {
      if (isDisposed) return false;
      const deltaSeconds = Math.min(0.05, Math.max(0, elapsedSeconds)),
        nextOpacity =
          targetOpacity + (uniforms.flowOpacity.value - targetOpacity) * Math.exp(-deltaSeconds * (targetOpacity ? 4.5 : 5.5));
      return (
        (uniforms.flowOpacity.value =
          Math.abs(nextOpacity - targetOpacity) < 0.003 ? targetOpacity : nextOpacity),
        (uniforms.flowTime.value += deltaSeconds),
        (mesh.visible = uniforms.flowOpacity.value > 0),
        mesh.visible || targetOpacity > 0
      );
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        mesh.removeFromParent(),
        geometry.dispose(),
        material.dispose());
    },
  };
}

const sceneModelKey = (binding: any) => JSON.stringify([binding.floorId, binding.modelId]),
  isVisibleInSceneHierarchy = (sceneNode: any) => {
    for (let ancestor = sceneNode; ancestor; ancestor = ancestor.parent)
      if (ancestor.visible === false) return false;
    return true;
  };

export type RangehoodAirflowController = {
  sync: (payload: {
    root: any;
    revision: any;
    bindings?: any[];
    states?: any;
    enabled?: boolean;
  }) => void;
  tick: (nowMs: number) => boolean;
  nextDelay: () => number;
  setAvailable: (isAvailable: boolean) => void;
  dispose: () => void;
};

export function createRangehoodAirflow({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
  requestAnimation: requestAnimation = requestFrame,
  isVisible: isVisible = () => true,
  reducedMotion: reducedMotion,
}: {
  THREE?: any;
  requestFrame?: () => void;
  requestAnimation?: () => void;
  isVisible?: (model: any) => boolean;
  reducedMotion?: boolean;
} = {}): RangehoodAirflowController {
  let rootObject: any = null,
    rootRevision: any,
    modelsByKey = new Map<string, any>(),
    effectsByKey = new Map<string, any>(),
    isAvailable = true,
    isDisposed = false,
    lastTickMs: number | null = null;

  const reducedMotionQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)"),
    prefersReducedMotion = () =>
      typeof reducedMotion == "boolean" ? reducedMotion : reducedMotionQuery?.matches === true,
    animationCadence = createAnimationCadence(),
    isEffectVisible = (model: any) => isVisibleInSceneHierarchy(model) && isVisible(model);

  /** 按模型包围盒把飘带贴到油烟机下沿。 */
  function fitEffectToModel(effect: any, model: any) {
    model.updateWorldMatrix(true, true);
    const inverseWorldMatrix = new THREE.Matrix4().copy(model.matrixWorld).invert(),
      nodeMatrix = new THREE.Matrix4(),
      modelBounds = new THREE.Box3(),
      nodeBounds = new THREE.Box3();
    if (
      (model.traverse((sceneNode: any) => {
        !sceneNode.isMesh ||
          !sceneNode.geometry ||
          sceneNode.userData?.environmentEffect ||
          (sceneNode.geometry.computeBoundingBox(),
          sceneNode.geometry.boundingBox &&
            (nodeMatrix.multiplyMatrices(inverseWorldMatrix, sceneNode.matrixWorld),
            nodeBounds.copy(sceneNode.geometry.boundingBox).applyMatrix4(nodeMatrix),
            modelBounds.union(nodeBounds)));
      }),
      modelBounds.isEmpty())
    )
      return;
    const modelSize = modelBounds.getSize(new THREE.Vector3()),
      modelCenter = modelBounds.getCenter(new THREE.Vector3()),
      heightScale = Math.max(0.01, modelSize.y) / 0.55;
    (effect.mesh.scale.set(
      Math.max(0.01, modelSize.x) / 0.9,
      heightScale,
      Math.max(0.01, modelSize.z) / 0.45,
    ),
      effect.mesh.position.set(modelCenter.x, modelBounds.min.y - 0.02 * heightScale, modelCenter.z));
  }

  const handleMotionPreferenceChange = () => {
    lastTickMs = null;
    requestFrame();
  };
  reducedMotionQuery?.addEventListener?.("change", handleMotionPreferenceChange);

  return {
    sync({ root, revision, bindings = [], states = {}, enabled = true }) {
      if (isDisposed) return;
      const didSceneChange = rootObject !== root || rootRevision !== revision;
      didSceneChange &&
        ((rootObject = root),
        (rootRevision = revision),
        (modelsByKey = new Map()),
        rootObject?.traverse((sceneNode: any) => {
          sceneNode.userData?.environmentModelType === "rangehood" &&
            modelsByKey.set(
              sceneModelKey({
                floorId: sceneNode.userData.environmentFloorId,
                modelId: sceneNode.userData.environmentModelId,
              }),
              sceneNode,
            );
        }));

      const liveKeySet = new Set<string>();
      let shouldRequestFrame = false;
      for (const binding of bindings) {
        if (binding.visible === false) continue;
        const bindingKey = sceneModelKey(binding),
          model = modelsByKey.get(bindingKey);
        if (!model) continue;
        liveKeySet.add(bindingKey);
        let entryRecord = effectsByKey.get(bindingKey);
        if (entryRecord && entryRecord.model !== model) {
          (entryRecord.effect.dispose(), effectsByKey.delete(bindingKey), (entryRecord = null));
        }
        if (entryRecord) {
          didSceneChange && fitEffectToModel(entryRecord.effect, model);
        } else {
          const effect = createRangehoodSuction(THREE);
          (fitEffectToModel(effect, model),
            model.add(effect.mesh),
            (entryRecord = { model, effect, running: false }),
            effectsByKey.set(bindingKey, entryRecord),
            (shouldRequestFrame = true));
        }
        const shouldRun = enabled && rangehoodState(binding, states).running;
        (entryRecord.running !== shouldRun &&
          ((entryRecord.running = shouldRun), (shouldRequestFrame = true)),
          entryRecord.effect.configure({
            power: shouldRun,
            enabled: !prefersReducedMotion(),
            color: 0xffffff,
          }));
      }
      for (const [staleKey, staleRecord] of effectsByKey)
        liveKeySet.has(staleKey) ||
          (staleRecord.effect.dispose(), effectsByKey.delete(staleKey), (shouldRequestFrame = true));
      shouldRequestFrame && ((lastTickMs = null), animationCadence.reset(), requestFrame());
    },
    tick(nowMs: number) {
      if (isDisposed || !isAvailable) return ((lastTickMs = null), true);
      if (
        ![...effectsByKey.values()].some(
          (entryRecord) =>
            isEffectVisible(entryRecord.model) &&
            (entryRecord.running || entryRecord.effect.active),
        )
      )
        return ((lastTickMs = null), animationCadence.reset(), false);
      if (animationCadence.take(nowMs) === null) return true;
      const elapsedSeconds =
        lastTickMs === null ? 1 / 30 : Math.min(0.05, Math.max(0, (nowMs - lastTickMs) / 1000));
      lastTickMs = nowMs;
      let isActive = false;
      for (const entryRecord of effectsByKey.values()) {
        entryRecord.effect.configure({
          power: entryRecord.running,
          enabled: !prefersReducedMotion(),
          color: 0xffffff,
        });
        if (!isEffectVisible(entryRecord.model)) continue;
        const wasVisible = entryRecord.effect.mesh.visible;
        isActive = entryRecord.effect.update(elapsedSeconds) || wasVisible || isActive;
      }
      return (isActive ? requestAnimation() : (lastTickMs = null), isActive);
    },
    nextDelay() {
      if (isDisposed || !isAvailable) return Infinity;
      for (const entryRecord of effectsByKey.values())
        if (isEffectVisible(entryRecord.model) && entryRecord.effect.active) return 1000 / 30;
      return Infinity;
    },
    setAvailable(isNowAvailable: boolean) {
      ((isAvailable = !!isNowAvailable), (lastTickMs = null), isAvailable && requestFrame());
    },
    dispose() {
      if (isDisposed) return;
      ((isDisposed = true),
        reducedMotionQuery?.removeEventListener?.("change", handleMotionPreferenceChange));
      for (const entryRecord of effectsByKey.values()) entryRecord.effect.dispose();
      (modelsByKey.clear(), (rootObject = null), (lastTickMs = null));
    },
  };
}
