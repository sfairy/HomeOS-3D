import { bathHeaterState as bathHeaterState2 } from "./bath-heater.js";
import { purifierState as purifierState2 } from "./purifier-state.js";
const k = {
    cool: "#73c8ff",
    heat: "#ff8a65",
    other: "#dce2e6",
    purifier: "#69dc91",
  },
  de = new Set(["cooling", "cool", "heating", "heat", "fan", "fan_only", "drying"]),
  ee = (arg1, arg2) => JSON.stringify([String(arg1 ?? ""), String(arg2 ?? "")]);
export function createEnvironmentAirflow({
  THREE: v1,
  camera: v2 = null,
  requestFrame: v3 = () => {},
  reducedMotion: v4,
} = {}) {
  let value = null,
    v5,
    v6 = false,
    list = [],
    options = {},
    text = "",
    v7 = false,
    map = new Map(),
    map2 = new Map(),
    v8 = false,
    v9 = -Infinity;
  const v10 = (arg3) => {
      for (let parent = arg3.mesh.parent; parent; parent = parent.parent) {
        if (parent.visible === false) return false;
        if (parent === value) return true;
      }
      return false;
    },
    v11 = (arg4) =>
      v10(arg4) &&
      ((arg4.binding.bathEffect !== "light" && arg4.target > 0) ||
        arg4.mesh.material.uniforms.flowOpacity.value !== arg4.target ||
        arg4.mesh.material.uniforms.flowOverview.value !== arg4.overviewTarget);
  let v12;
  const v13 = () => v12 ?? !text;
  let v14 = typeof v4 == "boolean" ? v4 : undefined;
  const v15 = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)"),
    v16 = () => v14 ?? v15?.matches ?? false,
    text2 =
      "attribute float flowLayer;\n    uniform float flowOverview;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    void main() {\n      vFlowUv = uv; vFlowLayer = flowLayer;\n      vec3 expanded = position;\n      // Expand away from the outlet; the mouth keeps its authored position and width.\n      expanded.x *= 1.0 + flowOverview * 0.15 * uv.y;\n      expanded.y *= 1.0 + flowOverview * 0.25;\n      expanded.z *= 1.0 + flowOverview * 0.35;\n      gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);\n    }",
    text3 =
      "uniform vec3 flowColor;\n    uniform float flowOpacity;\n    varying vec2 vFlowUv;\n    void main() {\n      float edge = 1.0 - smoothstep(0.2, 0.5, abs(vFlowUv.x - 0.5));\n      gl_FragColor = vec4(flowColor, flowOpacity * edge * 0.35);\n      #include <colorspace_fragment>\n    }",
    text4 =
      "uniform vec3 flowColor;\n    uniform float flowOpacity;\n    uniform float flowTime;\n    uniform float flowOverview;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    float hash(vec2 p) {\n      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);\n    }\n    float noise(vec2 p) {\n      vec2 cell = floor(p), f = fract(p);\n      f = f * f * (3.0 - 2.0 * f);\n      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),\n        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);\n    }\n    void main() {\n      float t = vFlowUv.y, across = vFlowUv.x * 2.0 - 1.0;\n      // Keep the breeze as narrow strands; a broad alpha field reads as a\n      // floating transparent rectangle beside the purifier.\n      float edge = exp(-3.2 * across * across) * (1.0 - smoothstep(0.62, 1.0, abs(across)));\n      float distanceFade = smoothstep(0.0, 0.025, t) * exp(-mix(1.15, 0.9, flowOverview) * t)\n        * (1.0 - smoothstep(0.62, 1.0, t));\n      // Advected, lengthwise fibres: deliberately much longer than they are\n      // wide, so the air reads as a continuous breeze, never dots or light bars.\n      float drift = sin(t * 4.0 - flowTime * 0.45 + vFlowLayer * 2.0) * t * 0.16;\n      // Keep individual strands fine even in overview; visibility comes from\n      // their bright cores rather than widening them into opaque white bands.\n      vec2 p = vec2(vFlowUv.x * mix(22.0, 16.0, flowOverview) + drift + vFlowLayer * 23.0,\n        t * mix(1.8, 1.25, flowOverview) - flowTime * 0.9);\n      float detail = 0.28;\n      float fibres = noise(p) * (1.0 - detail) + noise(p * vec2(1.9, 0.7) + 13.0) * detail;\n      // Give the moving strands enough coverage on both pale wood and dark\n      // floors. Keep the empty space clear instead of adding a uniform veil.\n      float density = 0.012 + 1.25 * fibres * fibres;\n      // A soft density ceiling keeps the stronger near-outlet strands\n      // translucent while letting their motion remain readable at room scale.\n      density = density / (1.0 + density * 0.65);\n      // Moving fibre crests catch a white highlight, with the mode color in\n      // their softer edges. This remains one transparent draw, without lights.\n      float crest = smoothstep(0.56, 0.9, fibres);\n      float highlight = crest * crest;\n      float alpha = min(0.38, flowOpacity * edge * distanceFade\n        * (density + highlight * 0.16) * mix(1.0, 0.42, vFlowLayer));\n      vec3 strandColor = mix(flowColor, vec3(1.0), highlight * 0.68);\n      gl_FragColor = vec4(strandColor, alpha);\n      #include <colorspace_fragment>\n    }",
    text5 =
      "attribute float flowLayer;\n    uniform float flowTime, flowOverview, flowStrength, flowWidth;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    varying vec3 vNormal, vView;\n    void main() {\n      vFlowUv = uv; vFlowLayer = flowLayer;\n      float t = uv.y;\n      vec3 p = position;\n      p.xy *= 1.0 + flowOverview * 0.12 * t;\n      p.z *= (0.68 + flowStrength * 0.45) * (1.0 + flowOverview * 0.25);\n      // Motion grows away from the grille; the complete outlet stays anchored.\n      p.xy += flowWidth * t * t * vec2(\n        sin(t * 4.0 - flowTime * 0.65 + flowLayer * 1.7),\n        cos(t * 3.2 - flowTime * 0.5 + flowLayer * 2.3)) * 0.12;\n      vec4 view = modelViewMatrix * vec4(p, 1.0);\n      vNormal = normalize(normalMatrix * normal); vView = -view.xyz;\n      gl_Position = projectionMatrix * view;\n    }",
    text6 =
      "uniform vec3 flowColor;\n    uniform float flowOpacity, flowTime, flowStrength;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    varying vec3 vNormal, vView;\n    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n    float noise(vec2 p) {\n      vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),\n        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);\n    }\n    void main() {\n      float t = vFlowUv.y, angle = vFlowUv.x * 6.28318530718;\n      float travel = t * 1.8 - flowTime * 0.7;\n      // Circular coordinates make the texture continuous across the shell seam.\n      vec2 ring = vec2(cos(angle), sin(angle));\n      float fibres = noise(ring * 5.0 + vec2(travel, travel * 0.6) + vFlowLayer * 19.0);\n      float fine = noise(ring * 9.0 + vec2(travel * 0.65, travel) + vFlowLayer * 7.0);\n      float density = pow(smoothstep(0.28, 0.86, fibres * 0.75 + fine * 0.25), 2.0);\n      float fade = smoothstep(0.0, 0.045, t) * (1.0 - smoothstep(0.30, 1.0, t));\n      // Suppress grazing edges so a curved surface never reads as a solid tube.\n      float facing = abs(dot(normalize(vNormal), normalize(vView)));\n      float softness = smoothstep(0.0, 0.55, facing);\n      float alpha = min(0.22, flowOpacity * density * fade * softness\n        * (0.65 + flowStrength * 0.35) * mix(0.34, 0.24, vFlowLayer));\n      gl_FragColor = vec4(flowColor, alpha);\n      #include <colorspace_fragment>\n    }";
  function fn1(arg5) {
    const v17 = new v1.Box3(),
      v18 = new v1.Matrix4();
    function fn2(arg6, arg7) {
      if (
        !arg6.userData?.environmentAirflow &&
        !(arg6 !== arg5 && arg6.userData?.environmentModelId != null)
      ) {
        if (arg6.isMesh && arg6.geometry?.attributes?.position) {
          const position = arg6.geometry.attributes.position;
          if (position.count > 0 && typeof position.getX == "function") {
            const matrix4 = new v1.Box3().setFromBufferAttribute(position).applyMatrix4(arg7);
            [
              matrix4.min.x,
              matrix4.min.y,
              matrix4.min.z,
              matrix4.max.x,
              matrix4.max.y,
              matrix4.max.z,
            ].every(Number.isFinite) && v17.union(matrix4);
          }
        }
        for (const v19 of arg6.children || [])
          (v19.matrixAutoUpdate && v19.updateMatrix(),
            fn2(v19, new v1.Matrix4().multiplyMatrices(arg7, v19.matrix)));
      }
    }
    return (fn2(arg5, v18), v17.isEmpty() ? null : v17);
  }
  function fn3(arg8, v20 = {}) {
    const v21 = fn1(arg8);
    if (!v21) return null;
    const size = v21.getSize(new v1.Vector3());
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null;
    if (v20.climateType === "bath-heater") {
      const v22 = v20.bathEffect === "light",
        max = Math.max(0.12, Math.min(size.x, size.z) * (v22 ? 0.8 : 0.55));
      return {
        type: "bath-heater",
        width: max,
        length: v22 ? 0.025 : Math.max(0.5, max * 3),
        fall: 0,
        spread: 0.3,
        rotationX: Math.PI / 2,
        outlet: [
          (v21.min.x + v21.max.x) / 2 + (v22 ? 0 : -size.x * 0.2),
          v21.min.y - 0.006,
          (v21.min.z + v21.max.z) / 2,
        ],
      };
    }
    const text7 =
      arg8.userData.environmentModelType ||
      (size.y > size.x * 1.5 && size.y > size.z * 1.5 ? "floorac" : "wallac");
    if (text7 === "airpurifier")
      return {
        type: text7,
        width: Math.min(size.x, size.z) * 0.8,
        length: Math.max(0.5, size.y * 1.4),
        fall: 0,
        rotationX: -Math.PI / 2,
        spread: 0.3,
        outlet: [(v21.min.x + v21.max.x) / 2, v21.max.y + 0.005, (v21.min.z + v21.max.z) / 2],
      };
    if (text7 === "airoutlet") {
      const min = Math.min(2.4, Math.max(0.6, size.z * 0.9));
      return {
        type: text7,
        width: size.z * 0.88,
        length: min,
        fall: min * 0.28,
        rotationY: Math.PI / 2,
        spread: 0.3,
        outlet: [
          v21.max.x + Math.max(0.003, size.x * 0.03),
          v21.min.y + size.y * 0.48,
          (v21.min.z + v21.max.z) / 2,
        ],
      };
    }
    const v23 = text7 === "floorac",
      v24 = size.x * (v23 ? 0.48 : 0.84),
      min2 = Math.min(2.8, Math.max(0.3, v23 ? Math.max(size.y * 0.95, size.x * 3) : size.x * 1.8));
    return {
      type: text7,
      width: v24,
      length: min2,
      verticalSpan: v23 ? size.y * 0.4 : 0,
      fall: min2 * (v23 ? 0.12 : 0.38),
      outlet: [
        (v21.min.x + v21.max.x) / 2,
        v21.min.y + size.y * (v23 ? 0.68 : 0.18),
        v21.max.z + Math.max(0.003, size.z * 0.03),
      ],
    };
  }
  function fn4(arg9) {
    if (arg9.type === "airpurifier") return fn5(arg9);
    const list2 = [],
      list3 = [],
      list4 = [],
      list5 = [],
      num = 24,
      num2 = 6;
    for (let num3 = 0; num3 < 2; num3++) {
      const v25 = list2.length / 3;
      for (let num4 = 0; num4 <= num; num4++) {
        const v26 = num4 / num,
          v27 = 1 + (v26 * 0.8 + v26 * v26 * 0.15) * (arg9.spread ?? 1);
        for (let num5 = 0; num5 <= num2; num5++) {
          const v28 = num5 / num2,
            v29 = v28 * 2 - 1,
            v30 = (1 - v29 * v29) * arg9.width * v26 * 0.09,
            v31 = num3 * arg9.width * v26 * 0.075,
            v32 = arg9.verticalSpan > 0 && num3 === 0,
            v33 = v32 ? v30 : v29 * arg9.width * 0.5 * v27,
            v34 =
              -arg9.fall * (0.35 * v26 + 0.65 * v26 * v26) +
              (v32 ? v29 * arg9.verticalSpan * 0.5 * (1 + v26 * 0.2) : v30 + v31);
          if (
            (list2.push(v33, v34, arg9.length * v26),
            list3.push(v28, v26),
            list4.push(num3),
            num4 < num && num5 < num2)
          ) {
            const v35 = v25 + num4 * (num2 + 1) + num5,
              v36 = v35 + num2 + 1;
            list5.push(v35, v35 + 1, v36, v35 + 1, v36 + 1, v36);
          }
        }
      }
    }
    const element = new v1.BufferGeometry();
    (element.setAttribute("position", new v1.Float32BufferAttribute(list2, 3)),
      element.setAttribute("uv", new v1.Float32BufferAttribute(list3, 2)),
      element.setAttribute("flowLayer", new v1.Float32BufferAttribute(list4, 1)),
      element.setIndex(list5),
      element.computeBoundingBox());
    const v37 = new v1.Vector3();
    for (let num6 = 0; num6 < list2.length / 3; num6++)
      element.boundingBox.expandByPoint(
        v37.set(
          list2[num6 * 3] * (1 + 0.15 * list3[num6 * 2 + 1]),
          list2[num6 * 3 + 1] * 1.25,
          list2[num6 * 3 + 2] * 1.35,
        ),
      );
    return (
      (element.boundingSphere = element.boundingBox.getBoundingSphere(new v1.Sphere())),
      element
    );
  }
  function fn5(arg10) {
    const list6 = [],
      list7 = [],
      list8 = [],
      list9 = [],
      list10 = [];
    for (let num7 = 0; num7 < 2; num7++) {
      const v38 = list6.length / 3;
      for (let num8 = 0; num8 <= 16; num8++) {
        const v39 = num8 / 16,
          v40 = arg10.width * (num7 ? 0.31 : 0.48) * (1 + 0.38 * v39 + 0.18 * v39 * v39);
        for (let num9 = 0; num9 <= 32; num9++) {
          const v41 = num9 / 32,
            v42 = v41 * Math.PI * 2,
            cos = Math.cos(v42),
            sin = Math.sin(v42);
          if (
            (list6.push(cos * v40, sin * v40, arg10.length * v39),
            list7.push(cos, sin, 0),
            list8.push(v41, v39),
            list9.push(num7),
            num8 < 16 && num9 < 32)
          ) {
            const v43 = v38 + num8 * 33 + num9,
              v44 = v43 + 32 + 1;
            list10.push(v43, v43 + 1, v44, v43 + 1, v44 + 1, v44);
          }
        }
      }
    }
    const element2 = new v1.BufferGeometry();
    (element2.setAttribute("position", new v1.Float32BufferAttribute(list6, 3)),
      element2.setAttribute("normal", new v1.Float32BufferAttribute(list7, 3)),
      element2.setAttribute("uv", new v1.Float32BufferAttribute(list8, 2)),
      element2.setAttribute("flowLayer", new v1.Float32BufferAttribute(list9, 1)),
      element2.setIndex(list10));
    const v45 = arg10.width * (0.48 * 1.56 * 1.12 + 0.12);
    return (
      (element2.boundingBox = new v1.Box3(
        new v1.Vector3(-v45, -v45, 0),
        new v1.Vector3(v45, v45, arg10.length * 1.13 * 1.25),
      )),
      (element2.boundingSphere = element2.boundingBox.getBoundingSphere(new v1.Sphere())),
      element2
    );
  }
  function fn6(arg11) {
    (arg11.mesh.removeFromParent(), arg11.mesh.geometry.dispose(), arg11.mesh.material.dispose());
  }
  function fn7(arg12) {
    const v46 = fn3(arg12.model, arg12.binding);
    if (!v46) return false;
    const stringify = JSON.stringify(v46);
    return (
      stringify !== arg12.layoutSignature &&
        (arg12.mesh.geometry.dispose(),
        (arg12.mesh.geometry = fn4(v46)),
        arg12.mesh.position.fromArray(v46.outlet),
        (arg12.mesh.rotation.x = v46.rotationX || 0),
        (arg12.mesh.rotation.y = v46.rotationY || 0),
        arg12.mesh.updateMatrix(),
        (arg12.mesh.material.uniforms.flowWidth.value = v46.width),
        (arg12.layout = v46),
        (arg12.layoutSignature = stringify),
        (arg12.mesh.userData.outletLayout = v46)),
      true
    );
  }
  function fn8(arg13, arg14) {
    const v47 = fn3(arg13, arg14);
    if (!v47) return null;
    const num10 = v13() ? 1 : 0,
      v48 = v47.type === "airpurifier",
      v49 = new v1.ShaderMaterial({
        vertexShader: v48 ? text5 : text2,
        fragmentShader: arg14.bathEffect === "light" ? text3 : v48 ? text6 : text4,
        uniforms: {
          flowColor: {
            value: new v1.Color(k.other),
          },
          flowOpacity: {
            value: 0,
          },
          flowTime: {
            value: 0,
          },
          flowOverview: {
            value: num10,
          },
          flowStrength: {
            value: 0.5,
          },
          flowWidth: {
            value: v47.width,
          },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: v1.DoubleSide,
        forceSinglePass: true,
        toneMapped: false,
      }),
      v50 = new v1.Mesh(fn4(v47), v49);
    return (
      (v50.name = "environment-airflow-" + (arg14.id || arg14.modelId)),
      (v50.userData.bathEffect = arg14.bathEffect),
      (v50.userData.environmentAirflow = true),
      (v50.userData.environmentEffect = true),
      (v50.userData.outletLayout = v47),
      v50.position.fromArray(v47.outlet),
      (v50.rotation.x = v47.rotationX || 0),
      (v50.rotation.y = v47.rotationY || 0),
      v50.updateMatrix(),
      (v50.matrixAutoUpdate = false),
      (v50.castShadow = false),
      (v50.receiveShadow = false),
      (v50.renderOrder = 4),
      (v50.visible = false),
      (v50.raycast = () => {}),
      arg13.add(v50),
      {
        mesh: v50,
        model: arg13,
        binding: arg14,
        layout: v47,
        layoutSignature: JSON.stringify(v47),
        target: 0,
        startOpacity: 0,
        overviewTarget: num10,
        startOverview: num10,
        startTime: null,
        strengthTarget: 0.5,
        lastTick: null,
      }
    );
  }
  function fn9() {
    ((map = new Map()),
      value?.traverse?.((arg15) => {
        if (arg15.userData?.environmentAirflow || arg15.userData?.environmentModelId == null)
          return;
        let environmentFloorId = arg15.userData.environmentFloorId;
        for (
          let parent2 = arg15.parent;
          environmentFloorId == null && parent2;
          parent2 = parent2.parent
        )
          environmentFloorId = parent2.userData?.environmentFloorId;
        map.set(ee(environmentFloorId, arg15.userData.environmentModelId), arg15);
      }),
      (v8 = true));
  }
  function fn10(v51 = false) {
    !v8 && v6 && list.length && fn9();
    const set = new Set(),
      flatMap = list.flatMap((arg16) =>
        arg16.climateType === "bath-heater"
          ? ["fan", "light"].map((arg17) => ({
              ...arg16,
              bathEffect: arg17,
            }))
          : [arg16],
      );
    for (const v52 of flatMap) {
      if (v52.visible === false || v52.modelId == null) continue;
      const ee2 = ee(v52.floorId, v52.modelId),
        v53 = v52.bathEffect ? ee2 + "/" + v52.bathEffect : ee2,
        v54 = map.get(ee2);
      if (
        !v54 ||
        ["fan", "storagewaterheater", "gaswaterheater"].includes(v54.userData.environmentModelType)
      )
        continue;
      set.add(v53);
      let v55 = map2.get(v53);
      (v55 && v55.model !== v54 && (fn6(v55), map2.delete(v53), (v55 = null)),
        !v55 && v6 && ((v55 = fn8(v54, v52)), v55 && map2.set(v53, v55)),
        v55 && ((v55.binding = v52), v51 && !fn7(v55) && (fn6(v55), map2.delete(v53))));
    }
    for (const [v56, v57] of map2) set.has(v56) || (fn6(v57), map2.delete(v56));
  }
  function fn11() {
    let v58 = false;
    for (const v59 of map2.values()) {
      const binding = v59.binding,
        v60 = options instanceof Map ? options.get(binding.entityId) : options?.[binding.entityId],
        options2 = v60?.newState || v60 || {},
        lowerCase = String(options2.state || "").toLowerCase(),
        lowerCase2 = String(options2.attributes?.hvac_action || "").toLowerCase(),
        v61 = !text || binding.id === text,
        v62 = v59.layout?.type === "airpurifier",
        v63 = options2.attributes?.percentage,
        finite =
          (typeof v63 == "number" || (typeof v63 == "string" && v63.trim() !== "")) &&
          Number.isFinite(Number(v63)),
        value2 = v62 ? purifierState2(binding, options) : null,
        strength = value2
          ? value2.strength
          : finite
            ? Math.max(0, Math.min(1, Number(v63) / 100))
            : 0.5,
        value3 = binding.climateType === "bath-heater" ? bathHeaterState2(binding, options) : null,
        includes = value3
          ? value3.active.includes(binding.bathEffect)
          : value2
            ? value2.running
            : !["", "off", "unknown", "unavailable"].includes(lowerCase) &&
              (lowerCase2 === "" || de.has(lowerCase2)),
        num11 = v13() ? 1 : 0,
        num12 = v6 && v61 && includes ? (num11 ? 1.45 : 1) : 0,
        uniforms = v59.mesh.material.uniforms;
      v62 &&
        includes &&
        v59.strengthTarget !== strength &&
        ((v59.strengthTarget = strength), (v58 = true));
      const v64 = new v1.Color(
        v59.layout?.type === "airpurifier"
          ? k.purifier
          : binding.bathEffect
            ? k.other
            : k[lowerCase] || k.other,
      );
      (num12 > 0 &&
        !uniforms.flowColor.value.equals(v64) &&
        (uniforms.flowColor.value.copy(v64), (v58 = true)),
        (v59.target !== num12 || v59.overviewTarget !== num11) &&
          ((v59.target = num12),
          (v59.startOpacity = uniforms.flowOpacity.value),
          (v59.overviewTarget = num11),
          (v59.startOverview = uniforms.flowOverview.value),
          (v59.startTime = null),
          (v58 = true)),
        !v61 || v16()
          ? ((uniforms.flowOpacity.value !== num12 || uniforms.flowOverview.value !== num11) &&
              (v58 = true),
            (uniforms.flowOpacity.value = num12),
            (uniforms.flowOverview.value = num11),
            (v59.mesh.visible = num12 > 0),
            v16() &&
              ((uniforms.flowTime.value = 0),
              (uniforms.flowStrength.value = v59.strengthTarget),
              (v59.lastTick = null)))
          : num12 > 0
            ? (v59.mesh.visible = true)
            : uniforms.flowOpacity.value === 0 &&
              ((v59.mesh.visible = false), (uniforms.flowOverview.value = num11)));
    }
    v58 && v3();
  }
  function fn12(arg18, arg19) {
    if (!(v7 || (value === arg18 && v5 === arg19))) {
      if (value !== arg18) {
        for (const v65 of map2.values()) fn6(v65);
        (map2.clear(), map.clear(), (v8 = false));
      }
      ((value = arg18 || null),
        (v5 = arg19),
        (v8 = false),
        !(!v6 && !map2.size) && (fn9(), fn10(true), fn11(), v3()));
    }
  }
  function fn13(v66 = {}) {
    if (v7) return;
    const v67 = v16();
    (Object.hasOwn(v66, "enabled") && (v6 = v66.enabled === true),
      Object.hasOwn(v66, "bindings") && (list = Array.isArray(v66.bindings) ? v66.bindings : []),
      Object.hasOwn(v66, "states") && (options = v66.states || {}),
      Object.hasOwn(v66, "focusedId") && (text = v66.focusedId || ""),
      Object.hasOwn(v66, "overview") &&
        (v12 = typeof v66.overview == "boolean" ? v66.overview : undefined),
      Object.hasOwn(v66, "reducedMotion") && (v14 = v66.reducedMotion === true),
      fn10(),
      fn11(),
      v67 !== v16() && v3());
  }
  function fn14(arg20) {
    if (v7 || v16()) return false;
    if (
      (Number.isFinite(arg20) || (arg20 = globalThis.performance?.now() ?? Date.now()),
      ![...map2.values()].some(v11))
    ) {
      for (const v68 of map2.values()) v68.lastTick = null;
      return ((v9 = -Infinity), false);
    }
    const v69 = 1000 / 30;
    if (arg20 >= v9 && arg20 - v9 < v69) return true;
    v9 = Number.isFinite(v9) && arg20 >= v9 ? arg20 - ((arg20 - v9) % v69) : arg20;
    let v70 = false,
      v71 = false;
    for (const v72 of map2.values()) {
      if (!v10(v72)) {
        v72.lastTick = null;
        continue;
      }
      const uniforms2 = v72.mesh.material.uniforms;
      if (
        uniforms2.flowOpacity.value !== v72.target ||
        uniforms2.flowOverview.value !== v72.overviewTarget
      ) {
        v72.startTime === null && (v72.startTime = arg20);
        const max2 = Math.max(0, Math.min(1, (arg20 - v72.startTime) / 240)),
          v73 = v72.startOpacity + (v72.target - v72.startOpacity) * max2,
          v74 = max2 * max2 * (3 - 2 * max2),
          v75 = v72.startOverview + (v72.overviewTarget - v72.startOverview) * v74;
        ((uniforms2.flowOpacity.value !== v73 || uniforms2.flowOverview.value !== v75) &&
          (v71 = true),
          (uniforms2.flowOpacity.value = v73),
          (uniforms2.flowOverview.value = v75),
          max2 === 1
            ? ((uniforms2.flowOpacity.value = v72.target),
              (uniforms2.flowOverview.value = v72.overviewTarget),
              (v72.mesh.visible = v72.target > 0))
            : (v70 = true));
      }
      if (v72.mesh.visible && (v72.target > 0 || uniforms2.flowOpacity.value > 0)) {
        const v76 = v72.layout?.type === "airpurifier",
          num13 =
            v72.lastTick === null ? 0 : Math.max(0, Math.min(0.1, (arg20 - v72.lastTick) / 1000));
        if (
          ((v72.lastTick = arg20),
          v76 &&
            (uniforms2.flowStrength.value +=
              (v72.strengthTarget - uniforms2.flowStrength.value) * (1 - Math.exp(-num13 * 7))),
          v72.binding.bathEffect === "light")
        ) {
          v72.lastTick = null;
          continue;
        }
        const v77 = v76
          ? uniforms2.flowTime.value + num13 * (0.35 + uniforms2.flowStrength.value * 1.1)
          : (arg20 / 1000) % 1000;
        (uniforms2.flowTime.value !== v77 && (v71 = true),
          (uniforms2.flowTime.value = v77),
          (v70 = true));
      } else v72.lastTick = null;
    }
    return (v71 && v3(), v70);
  }
  const v78 = () => {
    v7 || (fn11(), v3());
  };
  return (
    v15?.addEventListener?.("change", v78),
    {
      setRoot: fn12,
      setState: fn13,
      tick: fn14,
      nextDelay() {
        return !v7 && !v16() && [...map2.values()].some(v11) ? 1000 / 30 : Infinity;
      },
      dispose() {
        if (!v7) {
          ((v7 = true), v15?.removeEventListener?.("change", v78));
          for (const v79 of map2.values()) fn6(v79);
          (map2.clear(), map.clear(), (list = []), (options = {}), (value = null));
        }
      },
    }
  );
}
