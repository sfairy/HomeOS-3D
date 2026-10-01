const gt = 30,
  be = ["floor", "wall", "furniture"],
  z = (arg1, arg2 = 0) => (Number.isFinite(Number(arg1)) ? Number(arg1) : arg2),
  y = (arg3, arg4, arg5) => Math.min(arg5, Math.max(arg4, arg3)),
  Je = (arg6) => Math.max(16, Math.ceil(arg6 / 16) * 16);
export const regionLightKey = (arg7, arg8) => JSON.stringify([String(arg7), String(arg8)]);
function Qe(arg9) {
  try {
    const value1 = JSON.parse(arg9);
    return (
      Array.isArray(value1) &&
      value1.length === 2 &&
      value1.every((arg10) => typeof arg10 == "string") &&
      regionLightKey(...value1) === arg9
    );
  } catch {
    return false;
  }
}
function dt(arg11) {
  const value2 = Object.create(null);
  if (!arg11 || typeof arg11 != "object" || Array.isArray(arg11)) return value2;
  for (const [value3, value4] of Object.entries(arg11)) {
    if (
      !Qe(value3) ||
      !value4 ||
      typeof value4 != "object" ||
      Array.isArray(value4) ||
      !["circle", "square", "ellipse", "strip"].includes(value4.shape) ||
      !["width", "depth"].every(
        (arg12) => typeof value4[arg12] == "number" && Number.isFinite(value4[arg12]),
      ) ||
      ["rotation", "softness"].some(
        (arg13) =>
          value4[arg13] !== undefined &&
          (typeof value4[arg13] != "number" || !Number.isFinite(value4[arg13])),
      ) ||
      ["offsetX", "offsetZ"].some(
        (arg14) =>
          value4[arg14] !== undefined &&
          (typeof value4[arg14] != "number" || !Number.isFinite(value4[arg14])),
      ) ||
      ["heightAbove", "heightBelow", "heightMin", "heightMax"].some(
        (arg15) =>
          value4[arg15] !== undefined &&
          (typeof value4[arg15] != "number" || !Number.isFinite(value4[arg15])),
      ) ||
      (value4.heightMin !== undefined &&
        value4.heightMax !== undefined &&
        value4.heightMin > value4.heightMax) ||
      (value4.moveCenterEnabled !== undefined && typeof value4.moveCenterEnabled != "boolean")
    )
      continue;
    const value5 = value4.rotation ?? 0,
      value6 = y(value4.width, 0.5, 20);
    value2[value3] = {
      width: value6,
      depth: y(value4.depth, 0.5, 20),
      rotation: (((value5 % 360) + 540) % 360) - 180,
      softness: y(value4.softness ?? 1, 0.05, 1),
      shape: value4.shape,
      ...(value4.heightMin !== undefined
        ? {
            heightMin: y(value4.heightMin, 0, 20),
          }
        : {}),
      ...(value4.heightMax !== undefined
        ? {
            heightMax: y(value4.heightMax, 0, 20),
          }
        : {}),
      ...(value4.heightAbove !== undefined
        ? {
            heightAbove: y(value4.heightAbove, 0, 20),
          }
        : {}),
      ...(value4.heightBelow !== undefined
        ? {
            heightBelow: y(value4.heightBelow, 0, 20),
          }
        : {}),
      ...(value4.offsetX !== undefined
        ? {
            offsetX: y(value4.offsetX, -100, 100),
          }
        : {}),
      ...(value4.offsetZ !== undefined
        ? {
            offsetZ: y(value4.offsetZ, -100, 100),
          }
        : {}),
      ...(value4.moveCenterEnabled !== undefined
        ? {
            moveCenterEnabled: value4.moveCenterEnabled,
          }
        : {}),
    };
  }
  return value2;
}
function O(arg16, arg17) {
  for (let value7 = arg16; value7; value7 = value7.parent)
    if (value7.userData?.[arg17] !== undefined) return value7.userData[arg17];
}
function ht(arg18) {
  return (
    arg18 &&
    (arg18.userData?.hbDedicatedWall ||
      arg18.isMeshStandardMaterial ||
      arg18.isMeshPhysicalMaterial ||
      arg18.isMeshPhongMaterial ||
      arg18.isMeshLambertMaterial)
  );
}
function Re(arg19, arg20) {
  for (let value8 = arg19; value8; value8 = value8.parent) {
    if (value8.visible === false) return false;
    if (value8 === arg20) return true;
  }
  return false;
}
function pt(arg21) {
  const value9 = O(arg21, "regionReceiverKind");
  if (be.includes(value9)) return value9;
  const value10 = O(arg21, "modelLayer");
  if (value10 === "items" || value10 === "lights") return "furniture";
  if (value10 === "walls" || /wall/i.test(arg21.name || "")) return "wall";
  if (/floor/i.test(arg21.name || "")) return "floor";
  const value11 = arg21.geometry;
  if (value11) {
    value11.boundingBox || value11.computeBoundingBox?.();
    const value12 = value11.boundingBox;
    if (value12) {
      const value13 = [
        value12.max.x - value12.min.x,
        value12.max.y - value12.min.y,
        value12.max.z - value12.min.z,
      ].sort((arg22, arg23) => arg22 - arg23);
      if (!value10 && value13[0] < 0.18 && value13[1] > 1.5) return "floor";
    }
  }
  return value10 ? "furniture" : "wall";
}
function Ae(arg24, arg25, arg26, arg27, arg28) {
  const value14 = arg24.x !== arg25 || arg24.y !== arg26 || arg24.z !== arg27 || arg24.w !== arg28;
  return (arg24.set(arg25, arg26, arg27, arg28), value14);
}
function mt(arg29) {
  return (
    "\n#define PLAN2_LIGHT_CAPACITY " +
    arg29.capacity +
    "\n#define PLAN2_TEXTURE_DATA " +
    (arg29.textureMode ? 1 : 0) +
    "\nuniform int plan2LightCount;\nuniform float plan2Gain;\nuniform float plan2ShadowPresentation;\nuniform float plan2AlbedoLift;\nuniform float plan2SunShadowStrength;\nuniform mat4 plan2MotionToLayout;\nvarying vec3 vPlan2WorldPosition;\n#if PLAN2_TEXTURE_DATA\nuniform sampler2D plan2LightData;\nvec4 plan2ReadData(int slot, float column) {\n  return texture2D(plan2LightData, vec2((column + 0.5) / 4.0, (float(slot) + 0.5) / float(PLAN2_LIGHT_CAPACITY)));\n}\n#else\nuniform vec4 plan2Centers[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Extents[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Colors[PLAN2_LIGHT_CAPACITY];\nuniform vec4 plan2Axes[PLAN2_LIGHT_CAPACITY];\n#endif\nvec3 plan2SurfaceLight(vec3 worldPoint) {\n  worldPoint = (plan2MotionToLayout * vec4(worldPoint, 1.0)).xyz;\n  vec3 weightedColor = vec3(0.0);\n  float totalWeight = 0.0;\n  float coverage = 0.0;\n  for (int slot = 0; slot < PLAN2_LIGHT_CAPACITY; slot++) {\n    if (slot >= plan2LightCount) break;\n    #if PLAN2_TEXTURE_DATA\n      vec4 center = plan2ReadData(slot, 0.0);\n    #else\n      vec4 center = plan2Centers[slot];\n    #endif\n    if (center.w < 0.00001) continue;\n    #if PLAN2_TEXTURE_DATA\n      vec4 extent = plan2ReadData(slot, 1.0);\n      vec4 axis = plan2ReadData(slot, 3.0);\n    #else\n      vec4 extent = plan2Extents[slot];\n      vec4 axis = plan2Axes[slot];\n    #endif\n    vec3 offset = worldPoint - center.xyz;\n    vec3 localPoint = vec3(dot(offset.xz, axis.xy), offset.y, dot(offset.xz, vec2(-axis.y, axis.x)));\n    float verticalDistance = max(abs(localPoint.y) - extent.y, 0.0);\n    if (verticalDistance >= extent.w) continue;\n    float fadeStart = axis.w > 0.0 ? 1.0 - clamp(axis.w, 0.05, 1.0) : 0.0;\n    float squareFalloff = 1.0;\n    float radialDistance;\n    if (axis.z > 3.5) {\n      // Retain straight zero-light edges, but fade each axis independently.\n      // Using max(x,z) for brightness changes derivatives on the diagonals,\n      // making four visible triangular wedges. max is only a bounds check.\n      vec2 fromCenter = abs(localPoint.xz) / max(extent.xz, vec2(0.001));\n      radialDistance = max(fromCenter.x, fromCenter.y);\n      vec2 edgeFade = vec2(1.0) - smoothstep(vec2(fadeStart), vec2(1.0), fromCenter);\n      squareFalloff = edgeFade.x * edgeFade.y;\n    } else if (axis.z > 2.5) {\n      // Edited strips are rounded rectangles with their zero-light boundary\n      // exactly at the requested width/depth, including both rounded ends.\n      float radius = max(min(extent.x, extent.z), 0.001);\n      vec2 fromCore = max(abs(localPoint.xz) - (extent.xz - vec2(radius)), vec2(0.0));\n      radialDistance = length(fromCore) / radius;\n    } else if (axis.z > 0.5 && axis.z < 1.5) {\n      // A strip is a line source. Brightness falls away from the line, rather\n      // than remaining constant throughout a wide rectangular room volume.\n      vec2 fromSegment = vec2(max(abs(localPoint.x) - extent.x, 0.0), localPoint.z);\n      radialDistance = length(fromSegment) / max(extent.z, 0.001);\n    } else {\n      radialDistance = length(localPoint.xz / max(extent.xz, vec2(0.001)));\n    }\n    if (radialDistance >= 1.0) continue;\n    float horizontalFalloff = axis.z > 3.5 ? squareFalloff : 1.0 - smoothstep(fadeStart, 1.0, radialDistance);\n    float influence = horizontalFalloff\n      * (1.0 - smoothstep(0.0, extent.w, verticalDistance)) * clamp(center.w, 0.0, 1.5);\n    #if PLAN2_TEXTURE_DATA\n      vec3 lightColor = plan2ReadData(slot, 2.0).rgb;\n    #else\n      vec3 lightColor = plan2Colors[slot].rgb;\n    #endif\n    weightedColor += lightColor * influence;\n    totalWeight += influence;\n    coverage += (1.0 - coverage) * influence;\n  }\n  // Smooth bounded union: max() produced a derivative crease wherever two\n  // lamps exchanged dominance. This preserves single-lamp falloff and blends\n  // overlaps continuously, with coverage capped at one rather than added HDR.\n  return weightedColor / max(totalWeight, 0.00001) * coverage;\n}\n"
  );
}
export function sampleRegionVolumes(arg30, arg31, arg32 = 1) {
  let value15 = 0,
    value16 = 0;
  const list1 = [0, 0, 0];
  for (const value17 of arg30) {
    const { center: value18, extent: value19, color: value20, axis: value21 } = value17;
    if (value18.w <= 0) continue;
    const value22 = arg31.x - value18.x,
      value23 = arg31.y - value18.y,
      value24 = arg31.z - value18.z,
      value25 = value22 * value21.x + value24 * value21.y,
      value26 = -value22 * value21.y + value24 * value21.x,
      value27 = Math.max(Math.min(value19.x, value19.z), 0.001),
      value28 =
        value21.z > 3.5
          ? Math.max(
              Math.abs(value25) / Math.max(value19.x, 0.001),
              Math.abs(value26) / Math.max(value19.z, 0.001),
            )
          : value21.z > 2.5
            ? Math.hypot(
                Math.max(Math.abs(value25) - (value19.x - value27), 0),
                Math.max(Math.abs(value26) - (value19.z - value27), 0),
              ) / value27
            : value21.z > 0.5 && value21.z < 1.5
              ? Math.hypot(Math.max(Math.abs(value25) - value19.x, 0), value26) /
                Math.max(value19.z, 0.001)
              : Math.hypot(
                  value25 / Math.max(value19.x, 0.001),
                  value26 / Math.max(value19.z, 0.001),
                ),
      value29 = value21.w > 0 ? 1 - y(value21.w, 0.05, 1) : 0,
      value30 = y((value28 - value29) / (1 - value29), 0, 1),
      value31 = y(Math.max(Math.abs(value23) - value19.y, 0) / value19.w, 0, 1);
    let value32 = 1 - value30 * value30 * (3 - 2 * value30);
    if (value21.z > 3.5) {
      const value34 = y(
          (Math.abs(value25) / Math.max(value19.x, 0.001) - value29) / (1 - value29),
          0,
          1,
        ),
        value35 = y(
          (Math.abs(value26) / Math.max(value19.z, 0.001) - value29) / (1 - value29),
          0,
          1,
        );
      value32 =
        (1 - value34 * value34 * (3 - 2 * value34)) * (1 - value35 * value35 * (3 - 2 * value35));
    }
    const value33 = value32 * (1 - value31 * value31 * (3 - 2 * value31)) * y(value18.w, 0, 1.5);
    ((value16 += value33),
      (value15 += (1 - value15) * value33),
      (list1[0] += value20.x * value33),
      (list1[1] += value20.y * value33),
      (list1[2] += value20.z * value33));
  }
  return list1.map((arg33) => (value16 > 0 ? (arg33 / value16) * value15 * arg32 : 0));
}
export function createRegionLightController({
  THREE: arg34,
  renderer: arg35,
  scene: arg36,
  getRoot: arg37,
  contactShadows: arg38 = null,
  requestFrame: arg39 = () => {},
}) {
  const map1 = new Map(),
    set1 = new Set(),
    map2 = new Map(),
    weakMap1 = new WeakMap(),
    map3 = new Map(),
    map4 = new Map(),
    set2 = new Set(),
    value36 = new arg34.Vector3(),
    value37 = new arg34.Vector3(),
    value38 = new arg34.Vector3(),
    value39 = new arg34.Matrix4();
  let value40 = null;
  const object1 = {
      value: new arg34.Matrix4(),
    },
    object2 = {
      value: 1,
    },
    list2 = [],
    object3 = {
      value: 0.6,
    },
    object4 = {
      value: 0,
    };
  let value41 = 0.8,
    value42 = 1;
  const object5 = {
      value: 1,
    },
    object6 = {
      gain: 3,
      floorGain: 1,
      wallGain: 0.9,
      furnitureGain: 1,
      rangeScale: 0.8,
      sunShadowStrength: 0.6,
    },
    object7 = {
      mode: "region",
      registered: 0,
      slotCount: 0,
      active: 0,
      capacity: 0,
      floorCount: 0,
      materials: 0,
      detailedMaterials: 0,
      meshCount: 0,
      nativeLights: 0,
      structureScans: 0,
      uniformUpdates: 0,
      volumeCacheHits: 0,
      shaderCompiles: 0,
      textureFloors: 0,
      disposed: false,
    };
  let value43 = null,
    value44 = true,
    value45 = false,
    list3 = [],
    map5 = new Map(),
    value46 = Object.create(null),
    value47 = null,
    value48 = false,
    value49 = false,
    value50 = null;
  const fn1 = () => {
      value44 = true;
    },
    value51 = arg36.onBeforeRender;
  function fn2(arg40, arg41, arg42) {
    const value52 = arg40 + "\0" + arg41;
    let value53 = map4.get(value52);
    value53 ||
      ((value53 = {
        key: value52,
        floorId: arg40,
        kind: arg41,
        capacity: 0,
        textureMode: false,
        slots: [],
        materials: new Set(),
        uniforms: {
          plan2LightCount: {
            value: arg42,
          },
          plan2Gain: {
            value: 1,
          },
          plan2ShadowPresentation: object5,
          plan2AlbedoLift: object3,
          plan2ContactContrast: object4,
          plan2SunShadowStrength: {
            value: 0,
          },
          plan2Centers: {
            value: [],
          },
          plan2Extents: {
            value: [],
          },
          plan2Colors: {
            value: [],
          },
          plan2Axes: {
            value: [],
          },
          plan2ViewToWorld: object1,
          plan2MotionToLayout: {
            value: new arg34.Matrix4(),
          },
          plan2LightData: {
            value: null,
          },
        },
      }),
      arg41 !== "wall" && arg38 && Object.assign(value53.uniforms, arg38.getUniforms(arg40)),
      map4.set(value52, value53));
    const value54 = Je(arg42);
    if (value53.capacity !== value54) {
      value53.capacity = value54;
      const value55 = z(arg35?.capabilities?.maxFragmentUniforms, 1024);
      ((value53.textureMode = value54 * 4 + 128 > value55),
        value53.texture?.dispose(),
        (value53.texture = null),
        (value53.slots = Array.from(
          {
            length: value54,
          },
          () => ({
            center: new arg34.Vector4(),
            extent: new arg34.Vector4(),
            color: new arg34.Vector4(),
            axis: new arg34.Vector4(),
          }),
        )));
      for (const [value56, value57] of [
        ["plan2Centers", "center"],
        ["plan2Extents", "extent"],
        ["plan2Colors", "color"],
        ["plan2Axes", "axis"],
      ])
        value53.uniforms[value56].value = value53.slots.map((arg43) => arg43[value57]);
      if (value53.textureMode) {
        const value58 = z(arg35?.capabilities?.maxTextureSize, 4096);
        if (value54 > value58)
          throw new RangeError("区域灯数量 " + arg42 + " 超出本机数据纹理容量 " + value58);
        ((value53.texture = new arg34.DataTexture(
          new Float32Array(value54 * 16),
          4,
          value54,
          arg34.RGBAFormat,
          arg34.FloatType,
        )),
          (value53.texture.minFilter = value53.texture.magFilter = arg34.NearestFilter),
          (value53.texture.generateMipmaps = false),
          (value53.texture.needsUpdate = true));
      }
      value53.uniforms.plan2LightData.value = value53.texture;
      for (const value59 of value53.materials) value59.needsUpdate = true;
    }
    return ((value53.uniforms.plan2LightCount.value = arg42), value53);
  }
  function fn3(arg44) {
    const set3 = new Set();
    for (let value60 = arg44; value60 && !set3.has(value60);)
      if (
        (set3.add(value60),
        (value60 = value60.runtimeSourceMaterial || value60.environmentSourceMaterial),
        weakMap1.has(value60))
      )
        return value60;
    return null;
  }
  function fn4(arg45, arg46, arg47, arg48, arg49 = false, arg50 = false) {
    const value61 = fn3(arg45);
    if (value61) return (arg48.add(value61), arg45);
    if (((arg45 = weakMap1.get(arg45) || arg45), !ht(arg45))) return arg45;
    let value62 = map3.get(arg45);
    value62 || ((value62 = new Map()), map3.set(arg45, value62));
    const value63 = arg46 + "\0" + arg47,
      value64 = value63 + "\0" + (arg49 ? "detailed" : "simple") + (arg50 ? "-floor-tone" : "");
    let value65 = value62.get(value64);
    const value66 = map4.get(value63);
    if (!value65) {
      ((value65 = arg45.clone()),
        arg45.userData.hbDedicatedWall && (value65.color = arg45.color.clone()),
        (value65.name = (arg45.name || arg45.type || "material") + " / region " + arg47));
      const value67 = arg45.onBeforeCompile;
      value65.onBeforeCompile = function (arg51, arg52) {
        (value67?.call(this, arg51, arg52),
          Object.assign(arg51.uniforms, value66.uniforms),
          arg50 &&
            ((arg51.uniforms.plan2FloorBrightness = object2),
            (arg51.fragmentShader = "uniform float plan2FloorBrightness;\n" + arg51.fragmentShader),
            (arg51.fragmentShader = arg51.fragmentShader.replace(
              "#include <color_fragment>",
              "#include <color_fragment>\ndiffuseColor.rgb *= plan2FloorBrightness;",
            ))),
          (arg51.uniforms.plan2ContactViewToWorld = value66.uniforms.plan2ViewToWorld),
          (arg51.vertexShader =
            "uniform mat4 plan2ViewToWorld;\nvarying vec3 vPlan2WorldPosition;\n" +
            arg51.vertexShader));
        const text1 = "#include <project_vertex>";
        if (!arg51.vertexShader.includes(text1)) throw new Error("区域灯材质缺少 project_vertex");
        if (
          ((arg51.vertexShader = arg51.vertexShader.replace(
            text1,
            text1 + "\nvPlan2WorldPosition = (plan2ViewToWorld * mvPosition).xyz;",
          )),
          (arg51.fragmentShader = mt(value66) + arg51.fragmentShader),
          arg45.userData.hbDedicatedWall)
        ) {
          ((arg51.uniforms.diffuse = {
            value: value65.color,
          }),
            (arg51.uniforms.opacity = {
              get value() {
                return value65.opacity;
              },
            }),
            (object7.shaderCompiles += 1));
          return;
        }
        const text2 = "#include <lights_fragment_end>";
        if (!arg51.fragmentShader.includes(text2))
          throw new Error("区域灯材质缺少 lights_fragment_end");
        const value69 =
          arg47 === "wall"
            ? ""
            : "\n          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n            if (receiveShadow && plan2SunShadowStrength > 0.0 && directionalLightShadows[0].shadowIntensity > 0.0) {\n              // The studio's single shadow-casting directional light is the\n              // first shadow slot. Reuse its resident VSM map; no new capture.\n              DirectionalLightShadow plan2SunShadow = directionalLightShadows[0];\n              plan2ShadowMask = getShadow(directionalShadowMap[0], plan2SunShadow.shadowMapSize,\n                min(1.0, plan2SunShadow.shadowIntensity * plan2SunShadowStrength / 0.18),\n                plan2SunShadow.shadowBias, plan2SunShadow.shadowRadius, vDirectionalShadowCoord[0]);\n            }\n          #endif";
        ((arg51.fragmentShader = arg51.fragmentShader.replace(
          text2,
          text2 +
            "\nvec3 plan2ReceivingColor = mix(diffuseColor.rgb, sqrt(max(diffuseColor.rgb, vec3(0.0))), plan2AlbedoLift);\n          #ifdef HB_CAR_GLASS_FINISH\n            // Keep moderate fill on glass while avoiding the full furniture\n            // albedo lift, which exaggerates the atlas' photographed lighting.\n            plan2ReceivingColor = mix(plan2ReceivingColor, diffuseColor.rgb, hbCarGlass * 0.6);\n          #endif\n          float plan2ShadowMask = 1.0;" +
            value69 +
            "\n          reflectedLight.indirectDiffuse += plan2ReceivingColor * plan2SurfaceLight(vPlan2WorldPosition) * plan2Gain * plan2ShadowMask;",
        )),
          arg47 !== "wall" &&
            arg38 &&
            ((arg51.fragmentShader =
              "uniform sampler2D plan2ContactMap;\n            uniform mat4 plan2ContactTransform;\n            uniform vec4 plan2ContactBounds;\n            uniform float plan2ContactY, plan2ContactOpacity;\n            uniform sampler2D plan2SurfaceMap;\n            uniform vec4 plan2SurfaceBounds;\n            uniform sampler2D plan2SurfaceLookup;\n            uniform vec2 plan2SurfaceLayout;\n            uniform mat4 plan2ContactViewToWorld;\n            uniform float plan2SurfaceOpacity, plan2ContactContrast;\n            // Deepen soft contact midtones without changing clear pixels or\n            // maximum occlusion. Opacity and motion fades stay linear outside.\n            float plan2ContactCoverage(float coverage, float weight) {\n              return coverage + plan2ContactContrast * weight * coverage * (1.0 - coverage);\n            }\n" +
              arg51.fragmentShader),
            (arg51.fragmentShader = arg51.fragmentShader.replace(
              "#include <opaque_fragment>",
              "\n            float plan2ContactTransmission = 1.0;\n            vec3 contactPosition = (plan2ContactTransform * vec4(vPlan2WorldPosition, 1.0)).xyz;\n            // Derivatives must be evaluated outside the height/tile branches.\n            float contactFaceUp = abs(normalize(cross(dFdx(contactPosition), dFdy(contactPosition))).y);\n            float contactNormalUp = normalize(mat3(plan2ContactTransform) * mat3(plan2ContactViewToWorld) * normal).y;\n            vec2 contactUv = (contactPosition.xz - plan2ContactBounds.xy) / plan2ContactBounds.zw;\n            float contactHeight = contactPosition.y - plan2ContactY;\n            if (contactHeight >= -0.015 && contactHeight < 0.12" +
                (arg50 ? " && contactHeight <= 0.015" : "") +
                "\n                && all(greaterThanEqual(contactUv, vec2(0.0))) && all(lessThanEqual(contactUv, vec2(1.0)))) {\n              // Rugs and the lowest furniture surfaces also receive contact\n              // shading. Fade it over the first 12cm; upper surfaces stay lit.\n              float contactWeight = 1.0 - smoothstep(0.035, 0.12, max(contactHeight, 0.0));\n              plan2ContactTransmission *= 1.0 - plan2ContactCoverage(texture2D(plan2ContactMap, contactUv).r, 1.0) * plan2ContactOpacity * contactWeight * plan2ShadowPresentation;\n            }\n            " +
                (arg45.userData?.plan2SurfaceContact === false
                  ? ""
                  : "if (contactHeight > " +
                    (arg50 ? "0.015" : "0.12") +
                    " && plan2SurfaceOpacity > 0.0) {\n              // These are already baked shadow pixels, not an occluder depth\n              // map. No shadow comparison or light-space projection per frame.\n              vec4 tile = texture2D(plan2SurfaceLookup, vec2(clamp(contactHeight / plan2SurfaceLayout.y, 0.0, 1.0), 0.5));\n              float surfaceCaptureCode = dot(floor(tile.ba * 255.0 + 0.5), vec2(256.0, 1.0));\n              float surfaceCaptureHeight = surfaceCaptureCode * (plan2SurfaceLayout.y / 65535.0);\n              vec2 localUv = (contactPosition.xz - plan2SurfaceBounds.xy) / plan2SurfaceBounds.zw;\n              if (surfaceCaptureCode > 0.0 && contactHeight <= surfaceCaptureHeight\n                  && all(greaterThanEqual(localUv, vec2(0.0))) && all(lessThanEqual(localUv, vec2(1.0)))) {\n                // Keep cushion self-shadow rejection. Wide cloth shoulders instead fade\n                // with slope and height, with a softer contact than rigid tabletops.\n                float upward = " +
                    (arg45.userData?.plan2SurfaceSlope === true
                      ? "0.5 * smoothstep(0.8, 0.98, contactNormalUp) * smoothstep(0.9, 0.999, contactFaceUp) * (1.0 - smoothstep(0.006, 0.018, surfaceCaptureHeight - contactHeight))"
                      : "step(0.8, contactNormalUp) * smoothstep(0.999, 0.9999, contactFaceUp)") +
                    ";\n                vec2 tileOrigin = floor(tile.rg * 255.0 + 0.5);\n                vec2 surfaceUv = (tileOrigin + clamp(localUv, vec2(0.002), vec2(0.998))) / plan2SurfaceLayout.x;\n                plan2ContactTransmission *= 1.0 - plan2ContactCoverage(texture2D(plan2SurfaceMap, surfaceUv).r, 0.75) * plan2SurfaceOpacity * upward * plan2ShadowPresentation;\n              }\n            }") +
                "\n            #include <opaque_fragment>",
            )),
            (arg51.fragmentShader = arg51.fragmentShader.replace(
              "#include <tonemapping_fragment>",
              "#include <tonemapping_fragment>\ngl_FragColor.rgb *= plan2ContactTransmission;",
            ))),
          !arg49 &&
            !arg45.userData.alphaWallBand &&
            (arg45.transmission == null || arg45.transmission === 0) &&
            ((arg51.fragmentShader = "uniform mat4 plan2ViewToWorld;\n" + arg51.fragmentShader),
            (arg51.fragmentShader = arg51.fragmentShader
              .replace(
                "#include <lights_fragment_begin>",
                "\n              vec3 simpleNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n              float simpleUp = simpleNormal.y * 0.5 + 0.5;\n              float simpleKey = max(dot(simpleNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n              vec3 simpleTint = mix(vec3(0.82, 0.85, 0.91), vec3(1.0, 1.0, 1.0), simpleUp);\n              reflectedLight.indirectDiffuse = diffuseColor.rgb * simpleTint * (0.30 + 0.40 * simpleUp + 0.18 * simpleKey);\n            ",
              )
              .replace("#include <lights_fragment_maps>", "")
              .replace("#include <lights_fragment_end>", ""))),
          (object7.shaderCompiles += 1));
      };
      const value68 = arg45.customProgramCacheKey?.call(arg45) || "";
      ((value65.customProgramCacheKey = () =>
        value68 +
        "|plan2-baked-surface-v17-sloped-duvet|" +
        +(arg45.userData?.plan2SurfaceContact !== false) +
        "|" +
        +(arg45.userData?.plan2SurfaceSlope === true) +
        "|" +
        +!!arg45.userData.alphaWallBand +
        "|" +
        Number(arg49) +
        "|" +
        Number(arg50) +
        "|" +
        arg47 +
        "|" +
        value66.capacity +
        "|" +
        Number(value66.textureMode) +
        "|" +
        !!arg38),
        (value65.userData.plan2RegionMaterial = true),
        (value65.userData.plan2DetailedSurface = arg49),
        weakMap1.set(value65, arg45),
        value62.set(value64, value65),
        value66.materials.add(value65));
    }
    return (arg48.add(value65), value65);
  }
  function fn5() {
    object7.structureScans += 1;
    const set4 = new Set(),
      list4 = [],
      set5 = new Set();
    value43?.traverse((arg53) => {
      (set4.add(arg53), map1.has(arg53) && set5.add(arg53), arg53.isMesh && list4.push(arg53));
    });
    for (const value71 of set1)
      set4.has(value71) ||
        (value71.removeEventListener("childadded", fn1),
        value71.removeEventListener("childremoved", fn1),
        set1.delete(value71));
    for (const value72 of set4)
      set1.has(value72) ||
        (value72.addEventListener("childadded", fn1),
        value72.addEventListener("childremoved", fn1),
        set1.add(value72));
    for (const [value73, value74] of map1)
      set5.has(value73) || ((value73.layers.mask = value74.originalLayers), map1.delete(value73));
    map5 = new Map();
    for (const value75 of map1.values()) {
      ((value75.floorId = String(
        value75.light.userData?.regionFloorId ??
          value75.light.userData?.lightFloorId ??
          O(value75.light, "regionFloorId") ??
          O(value75.light, "floorId") ??
          "default",
      )),
        (value75.id = String(value75.item.id ?? value75.light.uuid)),
        (value75.key = regionLightKey(value75.floorId, value75.id)));
      let value76 = value43;
      for (
        let value78 = value75.light.parent;
        value78 && value78 !== value43;
        value78 = value78.parent
      )
        if (
          value78.userData?.regionFloorId !== undefined ||
          value78.userData?.floorId !== undefined
        ) {
          value76 = value78;
          break;
        }
      value75.floorRoot = value76;
      const value77 = map5.get(value75.floorId) || [];
      (value77.push(value75), map5.set(value75.floorId, value77));
    }
    const value70 = map5.size === 1 ? map5.keys().next().value : "default";
    map5.size || map5.set(value70, []);
    for (const [value79, value80] of map5)
      for (const value81 of be) fn2(value79, value81, value80.length);
    const set6 = new Set(),
      set7 = new Set();
    for (const value82 of list4) {
      if (
        ["background", "grid", "outline", "light-source-preview"].includes(O(value82, "exportRole"))
      )
        continue;
      const value83 = String(O(value82, "regionFloorId") ?? O(value82, "floorId") ?? value70);
      if (!map5.has(value83)) {
        map5.set(value83, []);
        for (const value89 of be) fn2(value83, value89, 0);
      }
      const value84 = pt(value82),
        value85 = value82.material,
        value86 = O(value82, "preserveDetailedSurface") === true,
        value87 = O(value82, "regionReceiverKind") === "floor",
        value88 = Array.isArray(value85)
          ? value85.map((arg54) => fn4(arg54, value83, value84, set6, value86, value87))
          : fn4(value85, value83, value84, set6, value86, value87);
      ((Array.isArray(value85)
        ? value88.some((arg55, arg56) => arg55 !== value85[arg56])
        : value88 !== value85) && (value82.material = value88),
        (Array.isArray(value88)
          ? value88.some((arg57) => weakMap1.has(arg57))
          : weakMap1.has(value88)) &&
          (set7.add(value82),
          map2.set(value82, {
            assigned: value82.material,
          })));
    }
    const set8 = new Set();
    for (const value90 of set2)
      value90.traverse((arg58) => {
        if (map2.has(arg58)) {
          set8.add(arg58);
          for (const value91 of Array.isArray(arg58.material) ? arg58.material : [arg58.material]) {
            const value92 = fn3(value91) || value91;
            weakMap1.has(value92) && set6.add(value92);
          }
        }
      });
    for (const [value93, value94] of map2)
      !set7.has(value93) && !set8.has(value93) && (fn6(value93, value94), map2.delete(value93));
    for (const [value95, value96] of map3) {
      for (const [value97, value98] of value96)
        set6.has(value98) ||
          (map4.get(value97.slice(0, value97.lastIndexOf("\0")))?.materials.delete(value98),
          value98.dispose(),
          value96.delete(value97));
      value96.size || map3.delete(value95);
    }
    for (const [value99, value100] of map4)
      !map5.has(value100.floorId) &&
        !value100.materials.size &&
        (value100.texture?.dispose(), map4.delete(value99));
    ((list3 = []),
      arg36.traverse((arg59) => {
        arg59.isLight && !map1.has(arg59) && list3.push(arg59);
      }),
      (object7.registered = object7.slotCount = map1.size),
      (object7.materials = set6.size),
      (object7.meshCount = set7.size),
      (object7.floorCount = map5.size),
      (object7.detailedMaterials = [...set6].filter(
        (arg60) =>
          arg60.userData.plan2DetailedSurface ||
          arg60.userData.alphaWallBand ||
          arg60.transmission > 0,
      ).length),
      (object7.capacity = [...map5].reduce((arg61, [, arg62]) => arg61 + Je(arg62.length), 0)),
      (object7.textureFloors = [...map5.keys()].filter(
        (arg63) => map4.get(arg63 + "\0floor")?.textureMode,
      ).length),
      (value44 = false));
  }
  function fn6(arg64, arg65) {
    arg64.material === arg65.assigned &&
      (arg64.material = Array.isArray(arg64.material)
        ? arg64.material.map((arg66) => weakMap1.get(arg66) || arg66)
        : weakMap1.get(arg64.material) || arg64.material);
  }
  function fn7(arg67, arg68 = {}) {
    if (value45 || !arg67?.isLight) return;
    (map1.get(arg67) ||
      map1.set(arg67, {
        light: arg67,
        item: {
          ...arg68,
        },
        originalLayers: arg67.layers.mask,
        fullIntensity: Math.max(
          0.00001,
          z(
            arg67.userData?.regionFullIntensity,
            z(arg67.userData?.lightOnIntensity, arg67.intensity) || 1,
          ),
        ),
      }),
      arg67.layers.set(30),
      (arg67.castShadow = false),
      (value44 = true));
  }
  function fn8(arg69) {
    !value45 && arg69?.matrixWorld && (object1.value = arg69.matrixWorld);
  }
  function fn9(arg70, arg71) {
    arg71.has(arg70) ||
      (arg70.parent && fn9(arg70.parent, arg71),
      arg70.updateWorldMatrix(false, false),
      arg71.add(arg70));
  }
  function fn10() {
    if (value45) return;
    const value101 = arg37?.() || null;
    (value101 !== value43 && ((value43 = value101), (value44 = true)), value44 && fn5());
  }
  function fn11(arg72, arg73 = false) {
    if (value45) return;
    if (!arg73) {
      arg38?.sync();
      const value104 = arg37?.() || null;
      (value104 !== value43 && ((value43 = value104), (value44 = true)),
        value44 && (!value48 || value49) && fn5());
    }
    if ((fn8(arg72), value48 && !value49)) return;
    const value102 =
      value50 === null ? 1 : Math.min(1, Math.max(0, (performance.now() - value50) / 280));
    (value102 < 1 ? arg39() : (value50 = null), (object7.active = 0));
    let value103 = false;
    const set9 = new Set();
    for (const [value105, value106] of map5) {
      const value107 = be.map((arg74) => map4.get(value105 + "\0" + arg74)),
        value108 = value48 && value49 ? value40?.(value105) : null;
      value48 && value49 && set9.clear();
      for (const value109 of value107) {
        (value108
          ? value109.uniforms.plan2MotionToLayout.value.copy(value108)
          : value109.uniforms.plan2MotionToLayout.value.identity(),
          (value109.presentationBaseGain =
            object6.gain * object6[value109.kind + "Gain"] * value41 * value102));
        const value110 = value109.presentationBaseGain * value42;
        ((value103 ||= value109.uniforms.plan2Gain.value !== value110),
          (value109.uniforms.plan2Gain.value = value110));
        const value111 =
          value109.kind === "wall" ? 0 : y(z(object6.sunShadowStrength, 0.6), 0, 1) * value102;
        ((value103 ||= value109.uniforms.plan2SunShadowStrength.value !== value111),
          (value109.uniforms.plan2SunShadowStrength.value = value111),
          (value109.changed = false));
      }
      value106.forEach((arg75, arg76) => {
        const { light: value112, item: value113 } = arg75;
        (fn9(value112, set9),
          value39.copy(value112.matrixWorld),
          value108 && value39.premultiply(value108),
          value36.setFromMatrixPosition(value39),
          arg75.floorRoot &&
            (fn9(arg75.floorRoot, set9),
            value37.setFromMatrixPosition(arg75.floorRoot.matrixWorld)),
          value108 && value37.applyMatrix4(value108));
        const value114 = arg75.floorRoot ? value37.y : 0,
          value115 = Re(value112, value43)
            ? y(z(value112.intensity) / arg75.fullIntensity, 0, 1.5)
            : 0,
          value116 =
            value47 === null ? value115 : value47.has(arg75.key) ? Math.max(0.6, value115) : 0,
          value117 = value116;
        if (
          (value116 > 0.00001 && (object7.active += 1),
          (list2.length = 0),
          list2.push(
            ...value39.elements,
            value114,
            value116,
            value115,
            value117,
            object6.rangeScale,
            value113.type,
            value113.lightRange,
            value113.width,
            value113.depth,
            value112.width,
            value112.height,
            value112.color.r,
            value112.color.g,
            value112.color.b,
            value46[arg75.key],
            object7.structureScans,
          ),
          arg75.volumeInputs && list2.every((arg77, arg78) => arg77 === arg75.volumeInputs[arg78]))
        ) {
          object7.volumeCacheHits++;
          return;
        }
        arg75.volumeInputs = list2.slice();
        const value118 =
            y(z(value113.lightRange, 3.5), 0.5, 10) * y(z(object6.rangeScale, 1), 0.2, 3),
          value119 = value113.type === "striplight" || value112.isRectAreaLight,
          value120 = value118 * (value113.type === "ceilinglight" ? 0.45 : 0.33),
          value121 = Math.max(0.05, z(value113.width, value112.width || 2) / 2),
          value122 = Math.max(0.025, z(value113.depth, value112.height || 0.2) / 2),
          value123 = value39.elements,
          value124 = Math.hypot(value123[0], value123[2]),
          value125 = value124 > 0.00001 ? value123[0] / value124 : 1,
          value126 = value124 > 0.00001 ? value123[2] / value124 : 0,
          value127 = value46[arg75.key],
          value128 = ((value127?.rotation || 0) * Math.PI) / 180,
          value129 = value128
            ? value125 * Math.cos(value128) - value126 * Math.sin(value128)
            : value125,
          value130 = value128
            ? value125 * Math.sin(value128) + value126 * Math.cos(value128)
            : value126,
          value131 = Math.max(0.3, value118 * 0.23),
          value132 = value119 ? value122 + value118 * 0.07 + value131 : value120 + value131,
          value133 = (arg75.region ||= {
            center: [0, 0, 0],
            lampCenter: [0, 0, 0],
            axis: [1, 0],
            defaults: {
              axis: [1, 0],
              rotation: 0,
              softness: 1,
            },
          }),
          value134 = value133.defaults;
        ((value134.width = 2 * (value119 ? value121 + value132 : value132)),
          (value134.depth = 2 * value132),
          (value134.shape = value119 ? "strip" : "ellipse"),
          (value134.axis[0] = value125),
          (value134.axis[1] = value126),
          (value133.floorId = value105),
          (value133.id = arg75.id),
          (value133.key = arg75.key),
          (value133.type = value113.type),
          (value133.lampCenter[0] = value36.x),
          (value133.lampCenter[1] = value36.y),
          (value133.lampCenter[2] = value36.z),
          (value133.offsetX = value127?.offsetX ?? 0),
          (value133.offsetZ = value127?.offsetZ ?? 0),
          (value133.moveCenterEnabled = value127?.moveCenterEnabled === true),
          (value133.center[0] = value36.x + value133.offsetX),
          (value133.center[1] = value36.y),
          (value133.center[2] = value36.z + value133.offsetZ),
          (value133.axis[0] = value129),
          (value133.axis[1] = value130),
          (value133.width = value127?.width ?? value134.width),
          (value133.depth = value127?.depth ?? value134.depth),
          (value133.rotation = value127?.rotation ?? 0),
          (value133.softness = value127?.softness ?? 1),
          (value133.shape = value127?.shape ?? value134.shape),
          (value133.overridden = !!value127),
          (value133.amount = value116),
          (value133.realAmount = value115),
          (value133.heightAbove = value127?.heightAbove),
          (value133.heightBelow = value127?.heightBelow),
          (value133.lampHeight = value36.y - value114),
          (value133.heightMin =
            value127?.heightMin ??
            (value127?.heightBelow === undefined
              ? undefined
              : value133.lampHeight - value127.heightBelow)),
          (value133.heightMax =
            value127?.heightMax ??
            (value127?.heightAbove === undefined
              ? undefined
              : value133.lampHeight + value127.heightAbove)));
        for (const value135 of value107) {
          const value136 = value135.slots[arg76],
            value137 = value135.kind;
          let value138 = value114 - (value137 === "floor" ? 0.18 : 0.1),
            value139 = Math.max(value114 + 0.2, value36.y + (value137 === "wall" ? 0.55 : 0.2)),
            value140 = Math.max(
              0.3,
              value118 * (value137 === "floor" ? 0.23 : value137 === "wall" ? 0.18 : 0.2),
            ),
            value141 = value117;
          if (
            value127?.heightAbove !== undefined ||
            value127?.heightBelow !== undefined ||
            value127?.heightMin !== undefined ||
            value127?.heightMax !== undefined
          ) {
            const value147 =
                value127.heightMin !== undefined
                  ? value127.heightMin === 0
                    ? value114 - 0.18 - value140
                    : value114 + value127.heightMin
                  : value127.heightBelow === undefined
                    ? value138 - value140
                    : value36.y - value127.heightBelow,
              value148 =
                value127.heightMax !== undefined
                  ? value114 + value127.heightMax
                  : value127.heightAbove === undefined
                    ? value139 + value140
                    : value36.y + value127.heightAbove,
              value149 = Math.max(0, value148 - value147);
            ((value140 = Math.max(0.00001, Math.min(value140, value149 / 2))),
              (value138 = value147 + value140),
              (value139 = Math.max(value138, value148 - value140)),
              value149 <= 0.00001 && (value141 = 0));
          }
          const value142 = value127
              ? value127.width / 2
              : value119
                ? value121
                : value120 + value140,
            value143 = value127
              ? value127.depth / 2
              : value119
                ? value122 + value118 * 0.07 + value140
                : value120 + value140;
          let value144 = Ae(
            value136.center,
            value133.center[0],
            (value138 + value139) / 2,
            value133.center[2],
            value141,
          );
          ((value144 =
            Ae(value136.extent, value142, (value139 - value138) / 2, value143, value140) ||
            value144),
            (value144 =
              Ae(value136.color, value112.color.r, value112.color.g, value112.color.b, 0) ||
              value144));
          const value145 = y((2 * Math.min(value142, value143) - 4) / 4, 0, 1),
            value146 = (value127?.softness ?? 1) * (1 - 0.3 * value145);
          if (
            ((value144 =
              Ae(
                value136.axis,
                value129,
                value130,
                value127
                  ? value127.shape === "square"
                    ? 4
                    : value127.shape === "strip"
                      ? 3
                      : 2
                  : value119
                    ? 1
                    : 0,
                value146,
              ) || value144),
            (value135.changed ||= value144),
            value144 && value135.texture)
          ) {
            const value150 = value135.texture.image.data,
              value151 = arg76 * 16;
            (value136.center.toArray(value150, value151),
              value136.extent.toArray(value150, value151 + 4),
              value136.color.toArray(value150, value151 + 8),
              value136.axis.toArray(value150, value151 + 12));
          }
        }
      });
      for (const value152 of value107)
        (value152.changed && value152.texture && (value152.texture.needsUpdate = true),
          (value103 ||= value152.changed));
    }
    (value103 && (object7.uniformUpdates += 1),
      (object7.nativeLights = list3.filter(
        (arg79) => Re(arg79, arg36) && (!arg72 || arg79.layers.test(arg72.layers)),
      ).length));
  }
  function fn12() {
    return {
      ...object7,
      settings: {
        ...object6,
      },
      overrides: fn14(),
      previewKeys: value47 ? [...value47] : null,
      regions: fn15(),
      floors: [...map5].map(([arg80, arg81]) => ({
        floorId: arg80,
        slots: arg81.length,
        capacity: map4.get(arg80 + "\0floor")?.capacity,
        lights: arg81.map((arg82) => ({
          id: arg82.item.id || arg82.light.uuid,
          type: arg82.item.type,
          intensity: arg82.light.intensity,
          fullIntensity: arg82.fullIntensity,
          amount: y(z(arg82.light.intensity) / arg82.fullIntensity, 0, 1.5),
          effectiveAmount: arg82.region?.amount ?? 0,
          regionKey: arg82.key,
          visible: Re(arg82.light, value43),
        })),
      })),
    };
  }
  function fn13(arg83) {
    return ((value46 = dt(arg83)), fn11(undefined, true), fn14());
  }
  function fn14() {
    return Object.fromEntries(
      Object.entries(value46).map(([arg84, arg85]) => [
        arg84,
        {
          ...arg85,
        },
      ]),
    );
  }
  function fn15() {
    return [...map1.values()]
      .filter((arg86) => arg86.region)
      .map(({ region: arg87 }) => ({
        ...arg87,
        center: [...arg87.center],
        lampCenter: [...arg87.lampCenter],
        axis: [...arg87.axis],
        defaults: {
          ...arg87.defaults,
          axis: [...arg87.defaults.axis],
        },
      }));
  }
  function fn16(arg88) {
    ((value47 = Array.isArray(arg88)
      ? new Set(arg88.filter((arg89) => typeof arg89 == "string" && Qe(arg89)))
      : null),
      fn11(undefined, true));
  }
  function fn17(arg90, arg91 = map5.keys().next().value, arg92 = "floor") {
    const value153 = map4.get(arg91 + "\0" + arg92);
    return value153
      ? sampleRegionVolumes(
          value153.slots.slice(0, value153.uniforms.plan2LightCount.value),
          value38.copy(arg90).applyMatrix4(value153.uniforms.plan2MotionToLayout.value),
          value153.uniforms.plan2Gain.value,
        )
      : [0, 0, 0];
  }
  function fn18() {
    if (!value45) {
      ((value45 = true),
        (object7.disposed = true),
        arg36.onBeforeRender === fn19 && (arg36.onBeforeRender = value51));
      for (const value154 of set1)
        (value154.removeEventListener("childadded", fn1),
          value154.removeEventListener("childremoved", fn1));
      for (const [value155, value156] of map2) fn6(value155, value156);
      for (const value157 of map3.values())
        for (const value158 of value157.values()) value158.dispose();
      for (const value159 of map4.values()) value159.texture?.dispose();
      for (const value160 of map1.values()) value160.light.layers.mask = value160.originalLayers;
      (set1.clear(),
        map2.clear(),
        map3.clear(),
        map1.clear(),
        map4.clear(),
        set2.clear(),
        typeof window < "u" && window.__plan2Region === object8 && delete window.__plan2Region);
    }
  }
  function fn19(...arg93) {
    (value51?.apply(this, arg93), fn11(arg93[2]));
  }
  const fn20 = (arg94) => {
    const value161 = y(z(arg94, 100), 50, 150) / 100;
    return value161 === object2.value
      ? false
      : ((object2.value = value161), (object7.uniformUpdates += 1), true);
  };
  function fn21(arg95) {
    const value162 = arg95 === "warm-wood",
      value163 = value162 ? 0.65 : 0.8;
    return value41 === value163
      ? false
      : ((value41 = value163),
        (object3.value = value162 ? 0 : 0.6),
        (object4.value = value162 ? 0.28 : 0),
        arg39(),
        true);
  }
  function fn22(arg96, arg97 = false) {
    if (value48 === (arg96 === true) && value49 === arg97) return;
    const value164 = value49;
    if (
      ((value49 = arg97),
      (value48 = arg96 === true),
      (value50 = value48 || arg97 || value164 ? null : performance.now()),
      value48 && !value49)
    ) {
      for (const value165 of map4.values())
        ((value165.uniforms.plan2Gain.value = 0),
          (value165.uniforms.plan2SunShadowStrength.value = 0));
    }
    ((value44 = true), arg39());
  }
  function fn23(arg98) {
    value42 = arg98;
    for (const value166 of map4.values())
      value166.uniforms.plan2Gain.value = (value166.presentationBaseGain ?? 1) * arg98;
  }
  const object8 = {
    register: fn7,
    sync: fn11,
    syncCamera: fn8,
    prepareMaterials: fn10,
    dispose: fn18,
    stats: object7,
    settings: object6,
    inspect: fn12,
    sample: fn17,
    invalidate: fn1,
    setFloorBrightness: fn20,
    setMotion: fn22,
    setPresentationGain(arg99) {
      const value167 = y(z(arg99, 1), 0, 1);
      value45 || value42 === value167 || (fn23(value167), arg39());
    },
    setShadowPresentationGain(arg100) {
      const value168 = y(z(arg100, 1), 0, 1);
      value45 || value168 === object5.value || ((object5.value = value168), arg39());
    },
    withPresentationGain(arg101, arg102) {
      const value169 = value42,
        value170 = object5.value;
      ((object5.value = 1), fn23(y(z(arg101, 1), 0, 1)));
      try {
        return arg102();
      } finally {
        (fn23(value169), (object5.value = value170));
      }
    },
    setMotionTransformProvider(arg103) {
      value40 = arg103;
    },
    setOverrides: fn13,
    getOverrides: fn14,
    listRegions: fn15,
    setPreview: fn16,
    setSceneStyle: fn21,
    retainRoot(arg104) {
      (set2.add(arg104), fn1());
    },
    releaseRoot(arg105) {
      (set2.delete(arg105), fn1());
    },
  };
  return (
    (arg36.onBeforeRender = fn19),
    typeof window < "u" && (window.__plan2Region = object8),
    object8
  );
}
