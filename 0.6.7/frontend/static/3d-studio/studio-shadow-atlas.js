import { createRenderLightIndex } from "../modules/interaction3d/render-light-index.js?v=20260907-focus-work-v1";
const ye = 1;
function q(arg1, arg2 = 0) {
  const value1 = Math.floor(Number(arg1));
  return Number.isFinite(value1) && value1 > 0 ? value1 : arg2;
}
function Me(arg3) {
  let value2 = 1;
  const value3 = Math.max(1, Math.ceil(Number(arg3) || 1));
  for (; value2 < value3;) value2 *= 2;
  return value2;
}
function _e(arg4, arg5, arg6) {
  let value4 = arg6,
    value5 = arg6,
    value6 = 0;
  const list1 = [];
  for (const value7 of arg4) {
    const value8 = value7.size;
    if (
      (value4 + value8 + arg6 > arg5 &&
        ((value4 = arg6), (value5 += value6 + arg6 * 2), (value6 = 0)),
      value5 + value8 + arg6 > arg5)
    )
      return null;
    (list1.push({
      ...value7,
      x: value4,
      y: value5,
    }),
      (value4 += value8 + arg6 * 2),
      (value6 = Math.max(value6, value8)));
  }
  return list1;
}
export function packSpotShadowAtlasTiles(arg7 = [], arg8 = 4096, arg9 = ye) {
  const value9 = q(arg8, 4096),
    value10 = Math.max(0, Math.floor(Number(arg9) || 0)),
    value11 = arg7
      .map((arg10, arg11) => ({
        index: arg11,
        size: q(arg10),
      }))
      .filter((arg12) => arg12.size > 0 && arg12.size + value10 * 2 <= value9)
      .sort((arg13, arg14) => arg14.size - arg13.size || arg13.index - arg14.index);
  if (value11.length !== arg7.length) return null;
  if (!value11.length)
    return {
      size: 1,
      tiles: [],
    };
  const value12 = value11.reduce((arg15, arg16) => arg15 + (arg16.size + value10 * 2) ** 2, 0);
  let value13 = Me(Math.max(value11[0].size + value10 * 2, Math.sqrt(value12)));
  for (; value13 <= value9;) {
    const value14 = _e(value11, value13, value10);
    if (value14) {
      const list2 = Array(arg7.length);
      for (const value15 of value14) list2[value15.index] = value15;
      return {
        size: value13,
        tiles: list2,
      };
    }
    value13 *= 2;
  }
  return null;
}
function O(arg17) {
  const value16 = String(arg17?.userData?.lightFloorId || ""),
    value17 = String(arg17?.userData?.lightItemId || "");
  return value17 ? value16 + ":" + value17 : "";
}
function Z(arg18, { includeHidden: arg19 = true } = {}) {
  const list3 = [];
  return (
    arg18?.traverse((arg20) => {
      !arg20.isSpotLight ||
        arg20.userData?.shadowCandidate !== true ||
        !O(arg20) ||
        (!arg19 && arg20.visible === false) ||
        (Number(arg20.userData?.lightBrightness || 0) <= 0 &&
          arg20.userData?.prewarmShadow !== true) ||
        list3.push(arg20);
    }),
    list3
  );
}
function ne(arg21) {
  return !!(
    arg21 &&
    (arg21.isMeshStandardMaterial ||
      arg21.isMeshPhysicalMaterial ||
      arg21.isMeshLambertMaterial ||
      arg21.isMeshPhongMaterial ||
      arg21.isMeshToonMaterial)
  );
}
function be() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  uniform sampler2D userSpotShadowAtlas;\n  uniform float userSpotShadowAtlasEnabled;\n  uniform vec4 userSpotShadowRect[ NUM_SPOT_LIGHTS ];\n  uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];\n  varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];\n\n  float getUserSpotAtlasShadow( vec4 atlasRect, vec4 shadowParams, vec4 shadowCoord ) {\n    if ( userSpotShadowAtlasEnabled < 0.5 || shadowParams.z < 0.5 ) return 1.0;\n    shadowCoord.xyz /= shadowCoord.w;\n    shadowCoord.z += shadowParams.x;\n    bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0\n      && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n    if ( ! inFrustum || shadowCoord.z > 1.0 ) return 1.0;\n    vec2 atlasUv = atlasRect.xy + clamp( shadowCoord.xy, 0.0, 1.0 ) * atlasRect.zw;\n    vec2 distribution = texture2D( userSpotShadowAtlas, atlasUv ).rg;\n    float mean = distribution.x;\n    // The stock VSM Chebyshev tail turns half-float depth steps from a\n    // 256px local-light map into several visible contour rings. Preserve the\n    // authored VSM blur, but use its deviation only to size one bounded edge\n    // transition. This keeps the same single texture sample and removes the\n    // long probability tail that made furniture shadows look layered.\n    float softness = clamp( abs( distribution.y ) * 0.35, 0.0007, 0.004 );\n    // A slope-scaled receiver guard keeps the newly bounded edge from\n    // exposing quantized self-shadow stripes on cabinet fronts and tabletops.\n    // It changes only the depth comparison, not the map resolution or sample\n    // count, and is capped tightly so real contact shadows stay attached.\n    // Cover the complete soft transition at equal depth, then add only a\n    // small slope allowance. This prevents the half-float map's depth bands\n    // from reappearing on large floors or through transparent glass, while\n    // keeping the allowance proportional to the authored penumbra.\n    float receiverGuard = softness + clamp( fwidth( shadowCoord.z ) * 1.5, 0.0002, 0.0015 );\n    #ifdef USE_REVERSED_DEPTH_BUFFER\n      float occludedDistance = mean - shadowCoord.z;\n    #else\n      float occludedDistance = shadowCoord.z - mean;\n    #endif\n    // The atlas contains only solid architectural occluders. Once a receiver\n    // is safely behind a wall, collapse the remaining VSM depth transition\n    // quickly instead of letting it extend through nearby cabinet backs and\n    // reveal half-float depth rows. The authored blur in atlas UV space still\n    // keeps the wall silhouette soft; this only removes light bleeding behind\n    // the blocker. Equality and the complete receiver guard remain lit.\n    float blockerTransition = max( softness * 0.5, 0.00035 );\n    float shadow = 1.0 - smoothstep(\n      receiverGuard,\n      receiverGuard + blockerTransition,\n      occludedDistance\n    );\n    return mix( 1.0, shadow, shadowParams.y );\n  }\n#endif\n";
}
function Te() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  uniform mat4 userSpotShadowMatrix[ NUM_SPOT_LIGHTS ];\n  uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];\n  varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];\n#endif\n";
}
function Pe() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  vec3 userShadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n  vec4 userShadowWorldPosition;\n  #pragma unroll_loop_start\n  for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {\n    userShadowWorldPosition = worldPosition + vec4( userShadowWorldNormal * userSpotShadowParams[ i ].w, 0.0 );\n    vUserSpotShadowCoord[ i ] = userSpotShadowMatrix[ i ] * userShadowWorldPosition;\n  }\n  #pragma unroll_loop_end\n#endif\n";
}
export function guardZeroContributionSpotLights(arg22) {
  const value18 = arg22.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )"),
    value19 = arg22.indexOf("#if ( NUM_DIR_LIGHTS > 0 )", value18),
    text1 =
      "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
    value20 = arg22.slice(value18, value19);
  if (value18 < 0 || value19 < 0 || value20.split(text1).length !== 2)
    throw new Error("当前 Three.js 聚光灯反射 Shader 与零贡献优化不兼容。");
  const value21 =
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      if ( any( notEqual( directLight.color, vec3( 0.0 ) ) ) ) {\n    #endif\n      " +
    text1 +
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      }\n    #endif";
  return arg22.slice(0, value18) + value20.replace(text1, value21) + arg22.slice(value19);
}
function Ue(arg23) {
  const text2 =
      "\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )",
    text3 =
      "\n    #if defined( USE_USER_SPOT_SHADOW_ATLAS )\n      directLight.color *= ( directLight.visible && receiveShadow )\n        ? getUserSpotAtlasShadow( userSpotShadowRect[ i ], userSpotShadowParams[ i ], vUserSpotShadowCoord[ i ] )\n        : 1.0;\n    #endif\n",
    value22 = arg23.ShaderChunk.lights_fragment_begin;
  if (!value22.includes(text2)) throw new Error("当前 Three.js 灯光 Shader 与阴影图集不兼容。");
  return guardZeroContributionSpotLights(value22.replace(text2, "" + text3 + text2));
}
function Ce(arg24) {
  (arg24?.shadow?.map?.dispose?.(),
    arg24?.shadow?.mapPass?.dispose?.(),
    arg24?.shadow && ((arg24.shadow.map = null), (arg24.shadow.mapPass = null)));
}
export function createSpotShadowAtlasController({
  THREE: arg25,
  renderer: arg26,
  scene: arg27,
  camera: arg28,
  requestFrame: arg29 = () => {},
  canBuild: arg30 = () => true,
  buildDelay: arg31 = 80,
  syncBeforeRender: arg32 = false,
} = {}) {
  if (!arg25 || !arg26 || !arg27 || !arg28)
    throw new Error("创建阴影图集时缺少 Three.js 渲染上下文。");
  const object1 = {
      userSpotShadowAtlas: {
        value: null,
      },
      userSpotShadowAtlasEnabled: {
        value: 0,
      },
      userSpotShadowMatrix: {
        value: [],
      },
      userSpotShadowRect: {
        value: [],
      },
      userSpotShadowParams: {
        value: [],
      },
    },
    value23 = Ue(arg25),
    map1 = new Map();
  let value24 = null,
    value25 = null,
    weakSet1 = new WeakSet(),
    value26 = null,
    value27 = 0,
    value28 = 0,
    value29 = false,
    value30 = false,
    value31 = false,
    value32 = false,
    value33 = true,
    value34 = null,
    list4 = [],
    list5 = [],
    list6 = [];
  const value35 = new arg25.Matrix4(),
    value36 = new arg25.Vector4(),
    value37 = arg32 ? createRenderLightIndex() : null;
  let text4 = "";
  function fn1(arg33) {
    object1.userSpotShadowAtlasEnabled.value = arg33 && value33 && map1.size ? 1 : 0;
  }
  function fn2(arg34) {
    if (!ne(arg34) || weakSet1.has(arg34)) return;
    if (
      arg34.environmentSourceMaterial &&
      weakSet1.has(arg34.environmentSourceMaterial) &&
      arg34.defines?.USE_USER_SPOT_SHADOW_ATLAS === 1
    ) {
      weakSet1.add(arg34);
      return;
    }
    weakSet1.add(arg34);
    const value41 = arg34.onBeforeCompile,
      value42 = arg34.customProgramCacheKey?.bind(arg34);
    ((arg34.defines = {
      ...(arg34.defines || {}),
      USE_USER_SPOT_SHADOW_ATLAS: 1,
    }),
      arg32 && arg34.isMeshStandardMaterial && (arg34.defines.HB_SKIP_ZERO_SPOT_LIGHT = 1),
      (arg34.onBeforeCompile = (arg35, arg36) => {
        (value41?.call(arg34, arg35, arg36),
          Object.assign(arg35.uniforms, object1),
          (arg35.vertexShader = arg35.vertexShader
            .replace(
              "#include <shadowmap_pars_vertex>",
              "#include <shadowmap_pars_vertex>\n" + Te(),
            )
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>")
            .replace("#include <shadowmap_vertex>", "#include <shadowmap_vertex>\n" + Pe())),
          (arg35.fragmentShader = arg35.fragmentShader
            .replace(
              "#include <shadowmap_pars_fragment>",
              "#include <shadowmap_pars_fragment>\n" + be(),
            )
            .replace("#include <lights_fragment_begin>", value23)));
      }),
      (arg34.customProgramCacheKey = () =>
        (value42?.() || "") + "|user-spot-shadow-atlas-v7-zero-contribution"),
      (arg34.needsUpdate = true));
  }
  const weakMap1 = new WeakMap(),
    set1 = new Set();
  function fn3(arg37) {
    if (!ne(arg37) || set1.has(arg37)) return arg37;
    let value43 = weakMap1.get(arg37);
    return (
      value43 ||
        ((value43 = arg37.clone()),
        (value43.onBeforeCompile = arg37.onBeforeCompile),
        (value43.customProgramCacheKey = arg37.customProgramCacheKey),
        weakMap1.set(arg37, value43),
        set1.add(value43)),
      value43
    );
  }
  function fn4(arg38) {
    value31 ||
      arg38?.traverse((arg39) => {
        if (!arg39.isMesh || arg39.receiveShadow === false) return;
        (arg39.userData.externalModelSharedMaterial ||
          arg39.userData.sofaSharedMaterial ||
          arg39.userData.rugSharedMaterial ||
          arg39.userData.architectureSharedMaterial) &&
          (arg39.material = Array.isArray(arg39.material)
            ? arg39.material.map(fn3)
            : fn3(arg39.material));
        const value44 = Array.isArray(arg39.material)
          ? arg39.material
          : arg39.material
            ? [arg39.material]
            : [];
        for (const value45 of value44) fn2(value45);
      });
  }
  function fn5(arg40) {
    return Z(arg40, {
      includeHidden: false,
    });
  }
  function fn6(arg41 = value26) {
    if (value31) return 0;
    (fn4(arg41), (value34 = null));
    const value46 = object1.userSpotShadowMatrix.value,
      value47 = object1.userSpotShadowRect.value,
      value48 = object1.userSpotShadowParams.value;
    ((value46.length = 0), (value47.length = 0), (value48.length = 0));
    for (const value50 of fn5(arg41)) {
      const value51 = map1.get(O(value50));
      (value46.push(value51?.matrix || new arg25.Matrix4()),
        value47.push(value51?.rect || new arg25.Vector4()),
        value48.push(
          value51
            ? new arg25.Vector4(value51.bias, value51.intensity, 1, value51.normalBias)
            : new arg25.Vector4(0, 0, 0, 0),
        ),
        (value50.castShadow = false));
    }
    ((object1.userSpotShadowAtlas.value = value24?.texture || null), fn1(true));
    const value49 = value48.filter((arg42) => arg42.z > 0.5).length;
    return ((arg26.domElement.dataset.activeSpotShadows = String(value49)), value49);
  }
  function fn7(arg43, arg44) {
    if (value31 || !arg32 || !arg43) return;
    const value52 = list5,
      value53 = list6;
    value52.length = value53.length = 0;
    for (const value59 of value37.read(arg43, arg44)) value52.push(value59);
    const value54 = value37.stats.builds + ":" + value37.stats.sorts;
    value54 !== text4 &&
      ((text4 = value54),
      (arg26.domElement.dataset.lightIndexBuilds = String(value37.stats.builds)),
      (arg26.domElement.dataset.lightIndexSorts = String(value37.stats.sorts)));
    let value55 = value34?.length === value52.length;
    for (let value60 = 0; value60 < value52.length; value60++)
      (value53.push(map1.get(O(value52[value60]))),
        (value52[value60] !== value34?.[value60] || value53[value60] !== list4[value60]) &&
          (value55 = false));
    if (value55) return;
    ((list5 = value34 || []), (list6 = list4), (value34 = value52), (list4 = value53));
    const value56 = object1.userSpotShadowMatrix.value,
      value57 = object1.userSpotShadowRect.value,
      value58 = object1.userSpotShadowParams.value;
    value56.length = value57.length = value58.length = 0;
    for (const value61 of value53)
      (value56.push(value61?.matrix || value35),
        value57.push(value61?.rect || value36),
        value58.push(
          value61
            ? (value61.uniformParams ||= new arg25.Vector4(
                value61.bias,
                value61.intensity,
                1,
                value61.normalBias,
              ))
            : value36,
        ));
  }
  function fn8(arg45) {
    const value62 = new arg25.WebGLRenderTarget(arg45, arg45, {
      format: arg25.RGFormat,
      type: arg25.HalfFloatType,
      minFilter: arg25.LinearFilter,
      magFilter: arg25.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    return (
      (value62.texture.name = "HA Bridge shared spot shadow atlas"),
      (value62.texture.generateMipmaps = false),
      value62
    );
  }
  function fn9(arg46) {
    const value63 = arg26.getRenderTarget(),
      value64 = arg26.getClearColor(new arg25.Color()).clone(),
      value65 = arg26.getClearAlpha();
    (arg26.setRenderTarget(arg46),
      arg26.setClearColor(16777215, 1),
      arg26.clear(true, false, false),
      arg26.setRenderTarget(value63),
      arg26.setClearColor(value64, value65));
  }
  async function fn10() {
    return globalThis.scheduler?.yield
      ? globalThis.scheduler.yield()
      : new Promise((arg47) => setTimeout(arg47, 0));
  }
  async function fn11(arg48, arg49) {
    if (value31 || value32 || value29 || arg49 !== value28) return;
    if (!arg48) {
      value30 = false;
      return;
    }
    if (!arg30()) {
      fn12(160);
      return;
    }
    value30 = false;
    const value66 = Z(arg48);
    if (!value66.length) {
      (map1.clear(),
        value24?.dispose?.(),
        (value24 = null),
        (object1.userSpotShadowAtlas.value = null),
        fn1(false),
        arg29());
      return;
    }
    const value67 = q(arg26.capabilities?.maxTextureSize, 4096),
      value68 = value66.map((arg50) => q(arg50.shadow?.mapSize?.x, 256)),
      value69 = packSpotShadowAtlasTiles(value68, value67);
    if (!value69)
      throw new Error(
        "当前设备最大阴影图集 " + value67 + "px 无法容纳 " + value66.length + " 盏灯。",
      );
    let value70 = null;
    const map2 = new Map(),
      value71 = arg26.getRenderTarget(),
      value72 = value66.map((arg51) => ({
        light: arg51,
        visible: arg51.visible,
        intensity: arg51.intensity,
        castShadow: arg51.castShadow,
      }));
    value29 = true;
    try {
      (fn4(arg48),
        (value70 = fn8(value69.size)),
        arg26.initRenderTarget(value70),
        fn9(value70),
        (value25 ||= new arg25.WebGLRenderTarget(1, 1, {
          depthBuffer: true,
          stencilBuffer: false,
        })),
        fn1(false));
      for (const value74 of value72)
        ((value74.light.visible = false), (value74.light.castShadow = false));
      for (let value75 = 0; value75 < value66.length; value75 += 1) {
        if (arg49 !== value28) return;
        const value76 = value66[value75],
          value77 = value69.tiles[value75];
        ((value76.visible = true),
          (value76.intensity = Math.max(
            Number(value76.userData?.lightOnIntensity || value76.intensity || 1),
            0.001,
          )),
          fn6(arg48),
          fn1(false),
          (value76.castShadow = true),
          (value76.shadow.autoUpdate = false),
          (value76.shadow.needsUpdate = true),
          arg26.setRenderTarget(value25),
          arg26.render(arg27, arg28));
        const value78 = value76.shadow?.map?.texture;
        if (!value78) throw new Error("灯光 " + O(value76) + " 未生成阴影贴图。");
        arg26.copyTextureToTexture(
          value78,
          value70.texture,
          new arg25.Box2(new arg25.Vector2(0, 0), new arg25.Vector2(value77.size, value77.size)),
          new arg25.Vector2(value77.x, value77.y),
        );
        const value79 = 0.5;
        (map2.set(O(value76), {
          tile: {
            ...value77,
          },
          matrix: value76.shadow.matrix.clone(),
          rect: new arg25.Vector4(
            (value77.x + value79) / value69.size,
            (value77.y + value79) / value69.size,
            Math.max(0, value77.size - value79 * 2) / value69.size,
            Math.max(0, value77.size - value79 * 2) / value69.size,
          ),
          bias: Number(value76.shadow.bias || 0),
          normalBias: Number(value76.shadow.normalBias || 0),
          intensity: Number(value76.shadow.intensity ?? 1),
        }),
          (value76.castShadow = false),
          (value76.visible = false),
          Ce(value76),
          await fn10());
      }
      if (arg49 !== value28) return;
      (value24?.dispose?.(), (value24 = value70), map1.clear());
      for (const [value80, value81] of map2) map1.set(value80, value81);
      object1.userSpotShadowAtlas.value = value24.texture;
      const value73 = arg26.domElement;
      ((value73.dataset.spotShadowMode = "atlas"),
        (value73.dataset.spotShadowAtlasSize = String(value69.size)),
        (value73.dataset.spotShadowAtlasLights = String(map1.size)));
    } finally {
      arg26.setRenderTarget(value71);
      for (const value82 of value72)
        ((value82.light.visible = value82.visible),
          (value82.light.intensity = value82.intensity),
          (value82.light.castShadow = false));
      (value24 !== value70 && value70?.dispose(),
        (value29 = false),
        value31 || value32 ? fn16() : (fn6(value26), value30 && !value27 && fn12(0), arg29()));
    }
  }
  function fn12(arg52) {
    value31 ||
      value32 ||
      !value30 ||
      (clearTimeout(value27),
      (value27 = setTimeout(
        () => {
          ((value27 = 0),
            !(value31 || value29 || !value30) &&
              fn11(value26, value28).catch((arg53) => {
                value31 ||
                  (console.error(arg53), (arg26.domElement.dataset.spotShadowMode = "fallback"));
              }));
        },
        Math.max(0, Number(arg52) || 0),
      )));
  }
  function fn13(arg54, { delay: arg55 = arg31 } = {}) {
    if (value31) return 0;
    if (((value26 = arg54), value32)) return ((value30 = !!arg54), 0);
    fn4(arg54);
    for (const value83 of Z(arg54)) value83.castShadow = false;
    return (fn6(arg54), (value28 += 1), (value30 = true), fn12(arg55), Z(arg54).length);
  }
  let value38 = null,
    value39 = -1,
    value40 = -1,
    list7 = [];
  function fn14(arg56 = value26, arg57 = null) {
    if (value31) return true;
    if (value29 || value27 || value30) return false;
    if (!value24 || !map1.size) return true;
    const value84 = value37?.stats.builds || 0;
    (value38 !== arg56 || value39 !== value28 || value40 !== value84) &&
      ((value38 = arg56),
      (value39 = value28),
      (value40 = value84),
      (list7 = []),
      arg56?.traverse((arg58) => {
        arg58.isSpotLight && arg58.shadow && map1.has(O(arg58)) && list7.push(arg58);
      }));
    const value85 =
        arg57 === null ? null : arg57.filter((arg59) => arg59?.isBox3 && !arg59.isEmpty()),
      list8 = [];
    arg56?.updateWorldMatrix(true, true);
    for (const value86 of list7) {
      const value87 = map1.get(O(value86));
      value87?.tile &&
        (value86.target?.updateWorldMatrix(true, false),
        value86.shadow.updateMatrices(value86),
        !(value85 && !value85.some((arg60) => value86.shadow.getFrustum().intersectsBox(arg60))) &&
          list8.push({
            light: value86,
            entry: value87,
            matrix: value86.shadow.matrix.clone(),
            cast: value86.castShadow,
            visible: value86.visible,
            autoUpdate: value86.shadow.autoUpdate,
            needsUpdate: value86.shadow.needsUpdate,
            map: value86.shadow.map,
            mapPass: value86.shadow.mapPass,
          }));
    }
    if (!list8.length) return true;
    const object2 = {
      target: arg26.getRenderTarget(),
      face: arg26.getActiveCubeFace(),
      mip: arg26.getActiveMipmapLevel(),
      viewport: arg26.getViewport(new arg25.Vector4()),
      scissor: arg26.getScissor(new arg25.Vector4()),
      scissorTest: arg26.getScissorTest(),
      clear: arg26.getClearColor(new arg25.Color()),
      alpha: arg26.getClearAlpha(),
      enabled: arg26.shadowMap.enabled,
      autoUpdate: arg26.shadowMap.autoUpdate,
      needsUpdate: arg26.shadowMap.needsUpdate,
    };
    try {
      arg26.shadowMap.enabled = true;
      for (const value88 of list8) {
        const { light: value89 } = value88;
        try {
          if (
            ((value89.castShadow = true),
            (value89.visible = true),
            (value89.shadow.autoUpdate = false),
            (value89.shadow.needsUpdate = true),
            (arg26.shadowMap.needsUpdate = true),
            arg26.shadowMap.render([value89], arg27, arg28),
            !value89.shadow.map?.texture)
          )
            return false;
          ((value88.texture = value89.shadow.map.texture),
            value88.matrix.copy(value89.shadow.matrix));
        } finally {
          ((value89.castShadow = value88.cast), (value89.visible = value88.visible));
        }
      }
      for (const { texture: value90, entry: value91, matrix: value92 } of list8) {
        const value93 = value91.tile;
        (arg26.copyTextureToTexture(
          value90,
          value24.texture,
          new arg25.Box2(new arg25.Vector2(0, 0), new arg25.Vector2(value93.size, value93.size)),
          new arg25.Vector2(value93.x, value93.y),
        ),
          value91.matrix.copy(value92));
      }
    } finally {
      for (const value94 of list8) {
        const { light: value95 } = value94;
        ((value95.castShadow = value94.cast),
          (value95.visible = value94.visible),
          (value95.shadow.autoUpdate = value94.autoUpdate),
          (value95.shadow.needsUpdate = value94.needsUpdate),
          value95.shadow.map !== value94.map && value95.shadow.map?.dispose(),
          value95.shadow.mapPass !== value94.mapPass && value95.shadow.mapPass?.dispose(),
          (value95.shadow.map = value94.map),
          (value95.shadow.mapPass = value94.mapPass));
      }
      ((arg26.shadowMap.enabled = object2.enabled),
        (arg26.shadowMap.autoUpdate = object2.autoUpdate),
        (arg26.shadowMap.needsUpdate = object2.needsUpdate),
        arg26.setViewport(object2.viewport),
        arg26.setScissor(object2.scissor),
        arg26.setScissorTest(object2.scissorTest),
        arg26.setRenderTarget(object2.target, object2.face, object2.mip),
        arg26.setClearColor(object2.clear, object2.alpha));
    }
    return (
      (arg26.domElement.dataset.curtainShadowUpdates = String(
        Number(arg26.domElement.dataset.curtainShadowUpdates || 0) + 1,
      )),
      true
    );
  }
  function fn15(arg61) {
    value31 || ((value33 = arg61 !== false), fn1(true), arg29());
  }
  function fn16() {
    (value24?.dispose(),
      value25?.dispose(),
      (value24 = null),
      (value25 = null),
      map1.clear(),
      (object1.userSpotShadowAtlas.value = null),
      fn1(false));
  }
  function fn17(arg62) {
    value31 ||
      value32 === !!arg62 ||
      ((value32 = !!arg62),
      value32
        ? ((value28 += 1), (value30 = !!value26), clearTimeout(value27), (value27 = 0), fn16())
        : value26 &&
          fn13(value26, {
            delay: 0,
          }));
  }
  function fn18() {
    if (!value31) {
      ((value31 = true), (value28 += 1), (value30 = false));
      for (const value96 of set1) value96.dispose();
      (set1.clear(),
        clearTimeout(value27),
        (value27 = 0),
        (value26 = null),
        value37?.dispose(),
        (value38 = null),
        (list7 = []),
        (value34 = null),
        (list4 = []),
        (list5 = []),
        (list6 = []),
        value29 || fn16());
    }
  }
  if (arg32) {
    const value97 = arg27.onBeforeRender;
    arg27.onBeforeRender = function (...arg63) {
      (value97?.apply(this, arg63), fn7(arg63[1] || arg27, arg63[2] || arg28));
    };
  }
  return {
    prepareRoot: fn4,
    refreshGeometry: fn14,
    schedule: fn13,
    sync: fn6,
    setEnabled: fn15,
    setContextLost: fn17,
    dispose: fn18,
    activeCount: () => map1.size,
    isBuilding: () => value29,
    isPending: () => !!value27 || value30,
    releaseRenderIndex: () => value37?.dispose(),
  };
}
