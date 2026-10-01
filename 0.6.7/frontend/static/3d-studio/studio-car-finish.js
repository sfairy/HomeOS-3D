export const CAR_LAMP_LENSES = {
    front: [
      [
        [208, 193],
        [238, 197],
        [257, 208],
        [215, 208],
      ],
      [
        [376, 208],
        [404, 195],
        [421, 193],
        [416, 207],
      ],
      [
        [90, 373],
        [117, 360],
        [141, 357],
        [123, 373],
      ],
    ],
    rear: [
      [
        [461, 188],
        [470, 181],
        [482, 181],
        [482, 192],
      ],
      [
        [630, 181],
        [655, 181],
        [675, 189],
        [654, 192],
      ],
      [
        [626, 350],
        [639, 343],
        [657, 341],
        [655, 351],
      ],
    ],
  },
  CAR_GLASS_ATLAS_REGIONS = [
    [0.3, 0.655, 0.96, 0.975],
    [0.38, 0.395, 0.81, 0.49],
  ];
const b = (arg1) => "vec2(" + (arg1[0] / 700).toFixed(7) + ", " + (arg1[1] / 700).toFixed(7) + ")",
  U = (arg2) => {
    const value1 =
      arg2.reduce((arg3, arg4, arg5) => {
        const value2 = arg2[(arg5 + 1) % arg2.length];
        return arg3 + arg4[0] * value2[1] - value2[0] * arg4[1];
      }, 0) > 0
        ? arg2
        : [...arg2].reverse();
    return value1
      .map(
        (arg6, arg7) =>
          "hbCarLensEdge(carUv, " + b(arg6) + ", " + b(value1[(arg7 + 1) % value1.length]) + ")",
      )
      .join(" * ");
  },
  x = (arg8) =>
    CAR_LAMP_LENSES[arg8]
      .map(U)
      .map((arg9) => "(" + arg9 + ")")
      .join(" + ");
export function smoothCarSurfaceNormals(arg10, arg11) {
  const value3 = arg11?.attributes?.position,
    value4 = arg11?.attributes?.normal;
  if (!value3 || !value4 || value3.count !== value4.count) return arg11;
  const map1 = new Map(),
    float64Array1 = new Float64Array(value3.count),
    value5 = new arg10.Vector3(),
    value6 = new arg10.Vector3(),
    value7 = new arg10.Vector3(),
    value8 = new arg10.Vector3(),
    value9 = arg11.index,
    value10 = value9?.count ?? value3.count;
  for (let value15 = 0; value15 + 2 < value10; value15 += 3) {
    const value16 = [0, 1, 2].map((arg12) =>
      value9 ? value9.getX(value15 + arg12) : value15 + arg12,
    );
    (value5.fromBufferAttribute(value3, value16[0]),
      value6.fromBufferAttribute(value3, value16[1]),
      value7.fromBufferAttribute(value3, value16[2]));
    const value17 = value8.subVectors(value6, value5).cross(value7.sub(value5)).length();
    for (const value18 of value16) float64Array1[value18] += value17;
  }
  for (let value19 = 0; value19 < value3.count; value19++) {
    const value20 = [value3.getX(value19), value3.getY(value19), value3.getZ(value19)]
      .map((arg13) => Math.round(arg13 * 10000))
      .join("/");
    (map1.has(value20) || map1.set(value20, []), map1.get(value20).push(value19));
  }
  const value11 = arg11.clone(),
    value12 = value4.clone(),
    value13 = new arg10.Vector3(),
    value14 = Math.cos(arg10.MathUtils.degToRad(50));
  for (const value21 of map1.values())
    for (const value22 of value21) {
      (value5.fromBufferAttribute(value4, value22).normalize(), value13.set(0, 0, 0));
      for (const value23 of value21)
        (value6.fromBufferAttribute(value4, value23).normalize(),
          value5.dot(value6) >= value14 && value13.addScaledVector(value6, float64Array1[value23]));
      value13.lengthSq() > 1e-16 &&
        (value13.normalize(), value12.setXYZ(value22, value13.x, value13.y, value13.z));
    }
  return (value11.setAttribute("normal", value12), (value12.needsUpdate = true), value11);
}
const y = {
  value: 0.85,
};
export function applyCarFinish(arg14, { pearlWhite: arg15 = false } = {}) {
  if (!arg14?.isMeshStandardMaterial || arg14.userData.hbCarFinish) return arg14;
  const value24 = arg14.onBeforeCompile,
    value25 = arg14.customProgramCacheKey?.call(arg14) || "";
  return (
    (arg14.onBeforeCompile = function (arg16, arg17) {
      (value24?.call(this, arg16, arg17),
        (arg16.uniforms.hbCarSceneLight = y),
        (arg16.vertexShader =
          "varying float vHbCarHeight;\nvarying float vHbCarLength;\n" + arg16.vertexShader),
        (arg16.vertexShader = arg16.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvHbCarHeight = position.z;\nvHbCarLength = position.y;",
        )),
        (arg16.fragmentShader =
          "#define HB_CAR_GLASS_FINISH\n      uniform float hbCarSceneLight;\n      varying float vHbCarHeight;\n      varying float vHbCarLength;\n      vec3 hbCarRoofTex(sampler2D atlas, vec2 uv) {\n        vec3 center = mix(texture2D(atlas, vec2(uv.x, 0.770)).rgb,\n          texture2D(atlas, vec2(uv.x, 0.895)).rgb,\n          smoothstep(0.770, 0.895, uv.y));\n        float band = smoothstep(0.765, 0.795, uv.y)\n          * (1.0 - smoothstep(0.875, 0.902, uv.y));\n        return mix(texture2D(atlas, uv).rgb, center, band);\n      }\n      float hbCarLensEdge(vec2 uv, vec2 a, vec2 b) {\n        vec2 edge = b - a, offset = uv - a;\n        float distance = (edge.x * offset.y - edge.y * offset.x) / length(edge);\n        return smoothstep(-0.0005, 0.001, distance);\n      }\n      " +
          arg16.fragmentShader),
        (arg16.fragmentShader = arg16.fragmentShader.replace(
          "#include <color_fragment>",
          "\n      #include <color_fragment>\n      float hbCarGlass = 0.0;\n      float hbRoofInterior = 0.0;\n      #ifdef USE_MAP\n        vec2 glassUv = fract(vMapUv);\n        float glassIsland = clamp(" +
            CAR_GLASS_ATLAS_REGIONS.map(
              ([arg18, arg19, arg20, arg21]) =>
                "(step(" +
                arg18 +
                ", glassUv.x) * step(glassUv.x, " +
                arg20 +
                ") * step(" +
                arg19 +
                ", glassUv.y) * step(glassUv.y, " +
                arg21 +
                "))",
            ).join(" + ") +
            ", 0.0, 1.0);\n        float glassValue = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n        hbCarGlass = glassIsland * smoothstep(0.72, 0.92, vHbCarHeight)\n          * (1.0 - smoothstep(0.12, 0.30, glassValue));\n        // The atlas has a photographed exposure step across its lateral\n        // center (v ~= .82), which becomes the longitudinal stripe on the car.\n        // Reconstruct only that band from the neighboring rows at the same u:\n        // the real front/roof/rear boundaries and frame details remain in u.\n        float paneInterior = smoothstep(0.700, 0.718, glassUv.y)\n          * (1.0 - smoothstep(0.930, 0.945, glassUv.y));\n        hbRoofInterior = paneInterior * hbCarGlass;\n        vec3 glassAtlas = sampledDiffuseColor.rgb * 0.85;\n        vec3 upperRow = texture2D(map, vec2(glassUv.x, 0.770)).rgb;\n        vec3 lowerRow = texture2D(map, vec2(glassUv.x, 0.895)).rgb;\n        vec3 restoredBand = mix(upperRow, lowerRow, smoothstep(0.770, 0.895, glassUv.y));\n        float stripeBand = smoothstep(0.765, 0.795, glassUv.y)\n          * (1.0 - smoothstep(0.875, 0.902, glassUv.y));\n        vec3 roofAtlas = mix(sampledDiffuseColor.rgb, restoredBand, stripeBand);\n        // Remove the photographed double crease above the windscreen locally.\n        // Sample both sides with the same center-stripe correction so this\n        // repair cannot bring back the old longitudinal exposure boundary.\n        vec3 frontClean = mix(texture2D(map, vec2(0.460, glassUv.y)).rgb,\n          mix(texture2D(map, vec2(0.460, 0.770)).rgb,\n              texture2D(map, vec2(0.460, 0.895)).rgb,\n              smoothstep(0.770, 0.895, glassUv.y)), stripeBand);\n        vec3 roofClean = mix(texture2D(map, vec2(0.565, glassUv.y)).rgb,\n          mix(texture2D(map, vec2(0.565, 0.770)).rgb,\n              texture2D(map, vec2(0.565, 0.895)).rgb,\n              smoothstep(0.770, 0.895, glassUv.y)), stripeBand);\n        float creaseRepair = smoothstep(0.460, 0.483, glassUv.x)\n          * (1.0 - smoothstep(0.535, 0.565, glassUv.x));\n        roofAtlas = mix(roofAtlas, mix(frontClean, roofClean,\n          smoothstep(0.460, 0.565, glassUv.x)), creaseRepair);\n        // Transfer the existing rear roof joint's local texture contrast,\n        // including its soft bevel, instead of drawing a flat dark stroke.\n        // Normalize against neighboring glass to retain the front pane tone.\n        float sealAcross = clamp((glassUv.y - 0.823) / 0.123, -1.0, 1.0);\n        float sealU = 0.493 + 0.017 * sealAcross * sealAcross;\n        float sealOffset = glassUv.x - sealU;\n        float jointU = 0.635 + sealOffset;\n        vec3 jointTexel = hbCarRoofTex(map, vec2(jointU, glassUv.y));\n        vec3 jointBase = mix(hbCarRoofTex(map, vec2(0.610, glassUv.y)),\n          hbCarRoofTex(map, vec2(0.660, glassUv.y)),\n          clamp((jointU - 0.610) / 0.050, 0.0, 1.0));\n        vec3 jointRelief = clamp(jointTexel / max(jointBase, vec3(0.001)),\n          vec3(0.40), vec3(1.50));\n        float jointBlend = 1.0 - smoothstep(0.018, 0.025, abs(sealOffset));\n        roofAtlas *= mix(vec3(1.0), jointRelief, jointBlend);\n        diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * glassAtlas, hbCarGlass);\n        diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * roofAtlas, hbRoofInterior);\n      #endif",
        )),
        (arg16.fragmentShader = arg16.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          "\n      #include <roughnessmap_fragment>\n      roughnessFactor = mix(roughnessFactor, 0.32, hbCarGlass * (1.0 - hbRoofInterior));",
        )),
        arg15 &&
          (arg16.fragmentShader = arg16.fragmentShader.replace(
            "#include <roughnessmap_fragment>",
            "\n      #ifdef USE_MAP\n        // Keep atlas seams and shadow detail; exclude dark glazing, rubber and trim.\n        float pearlLuma = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n        float pearlPaint = smoothstep(0.20, 0.48, pearlLuma) * (1.0 - hbCarGlass);\n        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.925, 0.89) * (0.68 + 0.32 * pearlLuma), pearlPaint);\n      #endif\n      #include <roughnessmap_fragment>",
          )),
        (arg16.fragmentShader = arg16.fragmentShader.replace(
          "#include <opaque_fragment>",
          "\n      float carDark = 1.0 - smoothstep(0.035, 0.16, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));\n      float carUpper = smoothstep(0.68, 1.02, vHbCarHeight);\n      vec3 carView = normalize(vViewPosition);\n      vec3 carReflection = inverseTransformDirection(reflect(-carView, normal), viewMatrix);\n      float carSky = smoothstep(-0.15, 0.85, carReflection.y);\n      float carSoftbox = pow(max(dot(carReflection, normalize(vec3(-0.35, 0.8, 0.48))), 0.0), 12.0);\n      float carFresnel = pow(1.0 - max(dot(normal, carView), 0.0), 4.0);\n      " +
            (arg15
              ? "\n      #ifdef USE_MAP\n        // Retain most of the real lighting/shadow contrast on pearl paint.\n        // Strong fixed fill previously flattened the body into a uniform white.\n        vec3 pearlNormal = inverseTransformDirection(normal, viewMatrix);\n        float pearlFill = 0.64 + 0.20 * max(pearlNormal.y, 0.0)\n          + 0.12 * max(dot(pearlNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n        outgoingLight = mix(outgoingLight, diffuseColor.rgb * pearlFill, pearlPaint * 0.45);\n      #endif"
              : "") +
            "\n      // A continuous reflection across the roof avoids a black center with\n      // pale edge strips. The scene switch dims this environment approximation.\n      float roofReflection = mix(1.0, 0.85,\n        step(0.655, fract(vMapUv.y)) * hbCarGlass);\n      outgoingLight += carDark * carUpper * vec3(0.68, 0.79, 0.94)\n        * (0.012 + 0.025 * carSky + 0.07 * carSoftbox + 0.035 * carFresnel)\n        * roofReflection * hbCarSceneLight;\n      // Keep the sheen restrained so it cannot wash out the glazing seams.\n      outgoingLight += hbCarGlass * vec3(0.76, 0.84, 0.94)\n        * (0.008 + 0.014 * carSky + 0.02 * carSoftbox)\n        * roofReflection * hbCarSceneLight;\n      #ifdef USE_MAP\n        vec2 carUv = fract(vMapUv);\n        float carFrontLamp = clamp(" +
            x("front") +
            ", 0.0, 1.0)\n          * (1.0 - smoothstep(-1.95, -1.85, vHbCarLength));\n        float carRearLamp = clamp(" +
            x("rear") +
            ", 0.0, 1.0)\n          * smoothstep(1.85, 1.95, vHbCarLength);\n        outgoingLight += carFrontLamp * vec3(2.0, 2.3, 2.6)\n          + carRearLamp * vec3(0.84, 0.036, 0.018);\n      #endif\n      #include <opaque_fragment>",
        )));
    }),
    (arg14.customProgramCacheKey = () =>
      value25 + "|hb-car-finish-v10-matched-roof-joint|pearl-" + Number(arg15)),
    (arg14.userData.hbCarFinish = true),
    (arg14.userData.plan2SurfaceContact = false),
    arg14
  );
}
