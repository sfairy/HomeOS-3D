/**
 * 排气扇的**向内吸风**气幕（0.8.0 `exhaust-airflow.js` 的等价实现）。
 *
 * 与吊扇 / 落地扇的通用气幕（`environment-airflow.ts`）不同：这里的 10 条带沿 Z 轴从
 * 扇面前方（`z = 0.5`）收束到进风筒口（`z = 0.013`），半径同时 0.195 → 0.08，
 * 再叠一层平滑脉冲，观感是「往里吸」而不是「往外吹」。因此排气扇**不进**环境设备
 * 集合（`environment-scene` 不登记它），避免两套气幕叠在一起。
 *
 * 几何 / 材质由本模块自己持有，销毁时一并释放；`userData.effectControllerOwned` 让
 * 场景级 `disposeObjectTree` 跳过它们，避免重复 dispose。
 */

const RIBBON_COUNT = 10,
  SEGMENT_COUNT = 40,
  /** 建模基准直径（m）：GLB 的额定尺寸，用来把气幕整体缩放到实际物品。 */
  BASE_SIZE = 0.34;

const VERTEX_SHADER = /* glsl */ `
  attribute float flowSide;
  attribute float flowPhase;
  uniform float flowTime;
  varying vec2 vUv;
  varying float vPhase;
  void main(){
    vUv = uv;
    vPhase = flowPhase;
    vec3 p = position;
    float ends = sin(uv.y * 3.14159265);
    p.x += sin(uv.y * 6.0 - flowTime * 1.2 + flowPhase * 4.0) * 0.006 * ends;
    p.y += cos(uv.y * 5.0 - flowTime + flowPhase * 5.0) * 0.005 * ends;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    view.x += flowSide * mix(.012, .0055, uv.y);
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float flowTime;
  uniform float flowOpacity;
  uniform vec3 flowColor;
  varying vec2 vUv;
  varying float vPhase;
  void main(){
    float across = abs(vUv.x * 2.0 - 1.0);
    float feather = exp(-across * across * 5.5) * (1.0 - smoothstep(.6, 1.0, across));
    float ends = smoothstep(0.0, .14, vUv.y) * (1.0 - smoothstep(.88, 1.0, vUv.y));
    float travel = fract(vUv.y * 2.0 - flowTime * .55 + vPhase);
    float pulse = exp(-pow((travel - .5) * 5.0, 2.0));
    gl_FragColor = vec4(flowColor, feather * ends * (.04 + pulse * .58) * flowOpacity);
    #include <colorspace_fragment>
  }
`;

export interface ExtractorAirflow {
  mesh: any;
  /** 目标开关：只有「已开启且实体可用」时才渐显。 */
  configure(isOn: boolean, available: boolean): void;
  /** 推进一帧；返回是否需要继续请求重绘。 */
  update(deltaSeconds: number): boolean;
  reset(): void;
  snapshot(): { target: number; opacity: number; time: number; visible: boolean };
  dispose(): void;
}

/**
 * 构建一组向内收束的气幕带。
 *
 * @param threeLib 宿主注入的 THREE 命名空间（本项目不直接 import，保持可测试）。
 * @param size 物品宽度（m）；气幕按 `size / 0.34` 等比缩放。
 * @param color 气幕基色（HEX）。
 */
export function createExtractorAirflow(
  threeLib: any,
  size: number,
  color: number,
): ExtractorAirflow {
  const positions: number[] = [],
    uvs: number[] = [],
    flowSides: number[] = [],
    flowPhases: number[] = [],
    indices: number[] = [],
    sizeScale = (Number(size) || BASE_SIZE) / BASE_SIZE;

  for (let ribbonIndex = 0; ribbonIndex < RIBBON_COUNT; ribbonIndex += 1) {
    const ribbonAngle = ((ribbonIndex + 0.25) * Math.PI * 2) / RIBBON_COUNT,
      baseVertexIndex = positions.length / 3;
    for (let segmentIndex = 0; segmentIndex <= SEGMENT_COUNT; segmentIndex += 1) {
      const flowT = segmentIndex / SEGMENT_COUNT,
        // 缓动 t²(3−2t)：口部收得慢、靠近筒口收得快，避免出现漏斗状的硬折角。
        eased = flowT * flowT * (3 - 2 * flowT),
        radius = (0.195 * (1 - eased) + 0.08 * eased) * sizeScale;
      for (const side of [-1, 1]) {
        positions.push(
          Math.cos(ribbonAngle) * radius,
          Math.sin(ribbonAngle) * radius,
          (0.5 * (1 - flowT) + 0.013 * flowT) * sizeScale,
        );
        uvs.push((side + 1) / 2, flowT);
        flowSides.push(side * sizeScale);
        flowPhases.push(ribbonIndex * 0.317);
      }
      if (segmentIndex < SEGMENT_COUNT) {
        const vertexIndex = baseVertexIndex + segmentIndex * 2;
        indices.push(
          vertexIndex,
          vertexIndex + 1,
          vertexIndex + 2,
          vertexIndex + 1,
          vertexIndex + 3,
          vertexIndex + 2,
        );
      }
    }
  }

  const geometry = new threeLib.BufferGeometry();
  geometry.setAttribute("position", new threeLib.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new threeLib.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("flowSide", new threeLib.Float32BufferAttribute(flowSides, 1));
  geometry.setAttribute("flowPhase", new threeLib.Float32BufferAttribute(flowPhases, 1));
  geometry.setIndex(indices);

  const uniforms = {
      flowTime: { value: 0 },
      flowOpacity: { value: 0 },
      flowColor: { value: new threeLib.Color(color) },
    },
    material = new threeLib.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: threeLib.DoubleSide,
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    }),
    mesh = new threeLib.Mesh(geometry, material);

  mesh.name = "extractor-inward-airflow";
  Object.assign(mesh.userData, {
    exhaustAirflow: true,
    environmentEffect: true,
    environmentAirflow: true,
    /** 接触阴影不烘这块半透明气幕（会把包围盒撑大、影子糊成一片）。 */
    disableContactShadow: true,
    /** 资源由本控制器管，场景销毁时不要二次 dispose。 */
    effectControllerOwned: true,
  });
  mesh.frustumCulled = false;
  mesh.visible = false;

  let opacityTarget = 0,
    flowTime = 0,
    isDisposed = false;

  return {
    mesh,
    configure(isOn: boolean, available: boolean) {
      opacityTarget = isOn && available ? 1 : 0;
    },
    update(deltaSeconds) {
      if (isDisposed) return false;
      const step = Math.max(0, Math.min(0.05, Number(deltaSeconds) || 0));
      let nextOpacity = opacityTarget + (uniforms.flowOpacity.value - opacityTarget) * Math.exp(-step * 9);
      if (Math.abs(nextOpacity - opacityTarget) < 0.002) nextOpacity = opacityTarget;
      uniforms.flowOpacity.value = nextOpacity;
      uniforms.flowTime.value += step;
      flowTime = uniforms.flowTime.value;
      mesh.visible = nextOpacity > 0;
      // 只要还有目标或残余透明度就继续请求帧：关机时也能把余量淡完。
      return mesh.visible || opacityTarget > 0;
    },
    reset() {
      opacityTarget = 0;
      uniforms.flowOpacity.value = 0;
      mesh.visible = false;
    },
    snapshot() {
      return {
        target: opacityTarget,
        opacity: uniforms.flowOpacity.value,
        time: flowTime,
        visible: mesh.visible,
      };
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
