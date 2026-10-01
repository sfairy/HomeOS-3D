function he(arg1, arg2) {
  for (let v1 = arg1; v1; v1 = v1.parent)
    if (v1.userData?.[arg2] !== undefined) return v1.userData[arg2];
}
function et(arg3) {
  for (let v2 = arg3; v2; v2 = v2.parent) if (!v2.visible) return false;
  return true;
}
export function isContactCasterMaterial(arg4) {
  return !!(
    arg4 &&
    arg4.visible !== false &&
    arg4.opacity >= 0.98 &&
    !(arg4.transmission > 0) &&
    (!arg4.transparent || arg4.alphaTest > 0)
  );
}
export function surfaceBakeLevels(arg5, arg6, arg7, v3 = 32) {
  return $e(arg5, arg6, arg7, v3).map((arg8) => arg8.height);
}
function $e(arg9, arg10, arg11, v4 = 32) {
  const map = new Map(),
    vector = new arg9.Vector3(),
    vector2 = new arg9.Vector3(),
    vector3 = new arg9.Vector3(),
    v5 = new arg9.Vector3(),
    v6 = new arg9.Vector3(),
    v7 = new arg9.Vector3(),
    vector4 = new arg9.Matrix4(),
    v8 = new arg9.Matrix4();
  for (const v9 of arg10) {
    const material = Array.isArray(v9.material) ? v9.material : [v9.material];
    if (
      material.length &&
      material.every((arg12) => arg12?.userData?.plan2SurfaceContact === false)
    )
      continue;
    const geometry = v9.geometry,
      v10 = geometry?.attributes?.position;
    if (!v10) continue;
    const index = geometry.index,
      count = index?.count ?? v10.count,
      start = geometry.drawRange.start,
      min = Math.min(count, start + geometry.drawRange.count);
    for (let num = 0; num < (v9.isInstancedMesh ? v9.count : 1); num++) {
      (vector4.copy(v9.matrixWorld),
        v9.isInstancedMesh && (v9.getMatrixAt(num, v8), vector4.multiply(v8)));
      for (let v11 = start; v11 + 2 < min; v11 += 3) {
        (vector.fromBufferAttribute(v10, index ? index.getX(v11) : v11).applyMatrix4(vector4),
          vector2
            .fromBufferAttribute(v10, index ? index.getX(v11 + 1) : v11 + 1)
            .applyMatrix4(vector4),
          vector3
            .fromBufferAttribute(v10, index ? index.getX(v11 + 2) : v11 + 2)
            .applyMatrix4(vector4),
          v7.crossVectors(v5.subVectors(vector2, vector), v6.subVectors(vector3, vector)));
        const v12 = v7.length() * 0.5,
          v13 = (vector.y + vector2.y + vector3.y) / 3 - arg11,
          num2 = v9.userData?.regionReceiverKind === "floor" ? 0.015 : 0.12;
        if (v12 < 0.004 || v7.y < v12 * 1.9998 || v13 <= num2) continue;
        const round = Math.round(v13 * 100),
          options = map.get(round) || {
            height: 0,
            area: 0,
            top: -Infinity,
          };
        ((options.height += v13 * v12),
          (options.area += v12),
          (options.top = Math.max(
            options.top,
            vector.y - arg11,
            vector2.y - arg11,
            vector3.y - arg11,
          )),
          map.set(round, options));
      }
    }
  }
  return [...map.values()]
    .sort((arg13, arg14) => arg14.area - arg13.area)
    .slice(0, v4)
    .map((arg15) => ({
      height: arg15.height / arg15.area,
      top: arg15.top,
    }))
    .sort((arg16, arg17) => arg16.height - arg17.height);
}
export function createContactShadowController({
  THREE: v14,
  renderer: v15,
  getRoot: v16,
  canBuild: v17 = () => true,
  requestFrame: v18 = () => {},
  maxCapturesPerSync: v19 = Infinity,
  deferSurfaceBake: v20 = false,
  deferInitialBake: v21 = false,
  surfaceBatchSize: v22 = 2,
  surfaceBudgetMs: v23 = 4,
  now: v24 = () => performance.now(),
  followMotion: v25 = false,
}) {
  const options2 = {
      enabled: true,
      opacity: 0.78,
      resolution: 1024,
      maxHeight: 2.5,
      heightFalloff: 1.2,
      blurMeters: 0.055,
      offsetX: 0.28,
      offsetZ: -0.22,
      surfaceEnabled: true,
      surfaceOpacity: 0.75,
      surfaceResolution: 256,
      maxSurfaceLevels: 32,
    },
    options3 = {
      builds: 0,
      capturePasses: 0,
      floors: 0,
      casters: 0,
      instancedCasters: 0,
      receivers: 0,
      surfaceCaptures: 0,
      surfacePasses: 0,
      testedCasters: 0,
      culledCasters: 0,
      cacheHits: 0,
      cachedFloors: 0,
      cachedBytes: 0,
      disposed: false,
    },
    map2 = new Map(),
    map3 = new Map(),
    weakMap = new WeakMap(),
    weakMap2 = new WeakMap(),
    map4 = new Map(),
    v26 = new v14.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  v26.needsUpdate = true;
  let v27 = true,
    v28 = false,
    v29 = false,
    v30 = false,
    value = null,
    value2 = null,
    v31 = false,
    v32 = false,
    v33 = true,
    v34 = v21 === true,
    v35 = v21 && v20,
    v36 = v20 === true,
    v37 = false,
    v38 = true;
  const map5 = new Map();
  function fn1(v39 = null) {
    for (const [v40, v41] of map5)
      if (!v39 || v39.has(v40))
        try {
          v41.iterator.return();
        } finally {
          (v41.dispose(), map5.delete(v40));
        }
  }
  const set = new Set();
  let value3 = null;
  const v42 = (arg18) => value3 === null || arg18 === value3,
    v43 = new v14.Scene(),
    v44 = new v14.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    v45 = new v14.ShaderMaterial({
      uniforms: {
        source: {
          value: v26,
        },
        stepSize: {
          value: new v14.Vector2(),
        },
        spread: {
          value: 0,
        },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader:
        "varying vec2 shadowUv; void main() { shadowUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader:
        "uniform sampler2D source; uniform vec2 stepSize; uniform float spread; varying vec2 shadowUv;\n      void main() {\n        float center = texture2D(source, shadowUv).r;\n        float nearA = texture2D(source, shadowUv + stepSize * 1.384615).r;\n        float nearB = texture2D(source, shadowUv - stepSize * 1.384615).r;\n        float farA = texture2D(source, shadowUv + stepSize * 3.230769).r;\n        float farB = texture2D(source, shadowUv - stepSize * 3.230769).r;\n        float value = mix(center * 0.227027 + (nearA + nearB) * 0.316216 + (farA + farB) * 0.070270,\n          max(center, max(max(nearA, nearB), max(farA, farB))), spread);\n        gl_FragColor = vec4(vec3(value), 1.0);\n      }",
    }),
    v46 = new v14.Mesh(new v14.PlaneGeometry(2, 2), v45);
  ((v46.frustumCulled = false), v43.add(v46));
  function fn2(arg19) {
    const v47 = String(arg19);
    return (
      map2.has(v47) ||
        map2.set(v47, {
          id: v47,
          target: null,
          ping: null,
          surface: null,
          lookup: null,
          casters: 0,
          instancedCasters: 0,
          receivers: 0,
          uniforms: {
            plan2ContactTransform: {
              value: new v14.Matrix4(),
            },
            plan2ContactMap: {
              value: v26,
            },
            plan2ContactBounds: {
              value: new v14.Vector4(0, 0, 1, 1),
            },
            plan2ContactY: {
              value: 0,
            },
            plan2ContactOpacity: {
              value: 0,
            },
            plan2SurfaceMap: {
              value: v26,
            },
            plan2SurfaceBounds: {
              value: new v14.Vector4(),
            },
            plan2SurfaceLookup: {
              value: v26,
            },
            plan2SurfaceLayout: {
              value: new v14.Vector2(1, 1),
            },
            plan2SurfaceOpacity: {
              value: 0,
            },
          },
        }),
      map2.get(v47)
    );
  }
  function fn3(arg20, v48 = false) {
    if (!v28) {
      if (
        ((v33 = true),
        fn1(arg20 == null ? null : new Set(typeof arg20 == "string" ? [arg20] : arg20)),
        !v48)
      ) {
        v32 = false;
        const value4 = arg20 == null ? null : new Set(typeof arg20 == "string" ? [arg20] : arg20);
        for (const [v49, v50] of map4)
          (!value4 || value4.has(v50.id)) && (fn11(v50), map4.delete(v49));
      }
      if (arg20 == null) ((v27 = true), set.clear());
      else {
        if (!v27) {
          const list = typeof arg20 == "string" ? [arg20] : arg20;
          for (const v51 of list) v51 != null && set.add(String(v51));
        }
      }
      (v27 || set.size) && v18();
    }
  }
  function fn4() {
    if (!v28) {
      for (const v52 of map2.values()) fn11(v52);
      ((options3.floors = 0), fn3());
    }
  }
  function fn5(arg21) {
    ((options2.enabled = !!arg21), (options3.floors = 0));
    for (const v53 of map2.values()) {
      v53.fade = null;
      const motionReady = v30 ? v25 && v53.motionReady : v42(v53.id);
      ((v53.uniforms.plan2ContactOpacity.value =
        options2.enabled && !v29 && motionReady && v53.target ? options2.opacity : 0),
        (v53.uniforms.plan2SurfaceOpacity.value =
          options2.enabled &&
          !v29 &&
          motionReady &&
          options2.surfaceEnabled &&
          v53.surface &&
          !v53.surfacePending
            ? options2.surfaceOpacity
            : 0),
        v53.target && v53.uniforms.plan2ContactOpacity.value > 0 && options3.floors++);
    }
    v18();
  }
  function fn6(arg22) {
    const v54 = arg22 === true;
    if (v54 !== v29) {
      v29 = v54;
      for (const v55 of map2.values())
        ((v55.uniforms.plan2ContactOpacity.value = 0),
          (v55.uniforms.plan2SurfaceOpacity.value = 0));
      ((options3.floors = 0), fn3());
    }
  }
  function fn7(arg23) {
    if (v30 !== (arg23 === true)) {
      if (((v30 = arg23 === true), v30)) {
        for (const v56 of map2.values())
          ((v56.motionReady = false),
            (v56.fade = v25
              ? null
              : {
                  started: performance.now(),
                  from: v56.uniforms.plan2ContactOpacity.value,
                  fromSurface: v56.uniforms.plan2SurfaceOpacity.value,
                  to: 0,
                  toSurface: 0,
                }));
      }
      if (!v30) {
        for (const v57 of map2.values()) v57.fade = null;
        ((v31 = true), (v32 = true));
      }
      fn3(null, true);
    }
  }
  function fn8() {
    for (const v58 of map2.values()) {
      if (!v58.bakedFrame) continue;
      v58.anchor?.updateWorldMatrix(true, false);
      const v59 = value2?.(v58.id) || v58.anchor?.matrixWorld;
      v59 &&
        v58.uniforms.plan2ContactTransform.value.copy(v59).invert().premultiply(v58.bakedFrame);
    }
  }
  function fn9(arg24, v60 = false) {
    const stringify = JSON.stringify([
      v60,
      arg24.map?.uuid,
      arg24.alphaMap?.uuid,
      arg24.alphaTest,
      arg24.displacementMap?.uuid,
      arg24.displacementScale,
      arg24.displacementBias,
      options2.maxHeight,
      options2.heightFalloff,
      options2.offsetX,
      options2.offsetZ,
    ]);
    if (map3.has(stringify)) {
      const v61 = map3.get(stringify);
      return (map3.delete(stringify), map3.set(stringify, v61), v61);
    }
    const v62 = new v14.MeshDepthMaterial({
      depthPacking: v14.BasicDepthPacking,
      side: v14.DoubleSide,
      map: arg24.map ?? null,
      alphaMap: arg24.alphaMap ?? null,
      alphaTest: arg24.alphaTest ?? 0,
      displacementMap: arg24.displacementMap ?? null,
      displacementScale: arg24.displacementScale ?? 1,
      displacementBias: arg24.displacementBias ?? 0,
    });
    return (
      (v62.onBeforeCompile = (arg25) => {
        ((arg25.uniforms.contactNear = {
          value: 0.001,
        }),
          (arg25.uniforms.contactFar = {
            value: v60 ? 1.5 : options2.maxHeight + 0.06,
          }),
          (arg25.uniforms.contactFalloff = {
            value: v60 ? 0.5 : options2.heightFalloff,
          }),
          (arg25.uniforms.contactOffset = {
            value: new v14.Vector2(options2.offsetX, options2.offsetZ),
          }),
          (arg25.vertexShader = "uniform vec2 contactOffset;\n" + arg25.vertexShader));
        const text = "#include <project_vertex>";
        if (!arg25.vertexShader.includes(text)) throw new Error("接触阴影材质缺少 project_vertex");
        ((arg25.vertexShader = arg25.vertexShader.replace(
          text,
          text +
            "\n        // The capture looks up from 6cm below this floor. project_vertex has\n        // already applied instancing, skinning and the mesh world transform.\n        // Ground contact stays fixed; elevated surfaces reveal a short shadow\n        // beside the furniture using the same cached map and depth falloff.\n        float contactHeight = max(-mvPosition.z - " +
            (v60 ? "0.0" : "0.06") +
            ", 0.0);\n        gl_Position.xy += vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * contactHeight * contactOffset;",
        )),
          (arg25.fragmentShader =
            "uniform float contactNear, contactFar, contactFalloff;\n" + arg25.fragmentShader),
          (arg25.fragmentShader = arg25.fragmentShader.replace(
            "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
            "float height = max(mix(contactNear, contactFar, fragCoordZ) - " +
              (v60 ? "0.0" : "0.06") +
              ", 0.0);\n         float density = exp(-height / contactFalloff) * (1.0 - smoothstep(" +
              (v60 ? 0.8 : 1.8) +
              ", " +
              (v60 ? 1.5 : 2.5) +
              ", height));\n         gl_FragColor = vec4(vec3(density), 1.0);",
          )));
      }),
      (v62.customProgramCacheKey = () =>
        v60 ? "plan2-surface-bake-v1" : "plan2-contact-depth-v2-short-shadow"),
      map3.set(stringify, v62),
      v62
    );
  }
  function fn10() {
    for (; map3.size > 64;) {
      const v63 = map3.keys().next().value;
      (map3.get(v63).dispose(), map3.delete(v63));
    }
  }
  function fn11(arg26) {
    ((arg26.surfacePending = false),
      (arg26.fade = null),
      (arg26.anchor = null),
      (arg26.bakedFrame = null),
      arg26.target?.dispose(),
      arg26.ping?.dispose(),
      arg26.surface?.dispose(),
      arg26.lookup?.dispose(),
      (arg26.target = null),
      (arg26.ping = null),
      (arg26.surface = null),
      (arg26.lookup = null),
      (arg26.uniforms.plan2ContactMap.value = v26),
      (arg26.uniforms.plan2ContactOpacity.value = 0),
      (arg26.uniforms.plan2SurfaceMap.value = v26),
      (arg26.uniforms.plan2SurfaceLookup.value = v26),
      (arg26.uniforms.plan2SurfaceOpacity.value = 0));
  }
  function fn12(arg27, arg28) {
    return (
      (arg27.target?.width !== arg28 || arg27.target?.height !== arg28) &&
        (fn11(arg27),
        (arg27.target = new v14.WebGLRenderTarget(arg28, arg28, {
          format: v14.RedFormat,
          generateMipmaps: false,
        }))),
      arg27.ping ||
        (arg27.ping = new v14.WebGLRenderTarget(arg28, arg28, {
          format: v14.RedFormat,
          depthBuffer: false,
          generateMipmaps: false,
        })),
      {
        target: arg27.target,
        ping: arg27.ping,
      }
    );
  }
  function* fn13(arg29, arg30, arg31, arg32, arg33, arg34, arg35, arg36) {
    const $e2 = $e(v14, arg30, arg34, options2.maxSurfaceLevels),
      map6 = $e2.map((arg37) => arg37.height);
    if (((arg29.uniforms.plan2SurfaceOpacity.value = 0), !map6.length)) {
      (arg29.surface?.dispose(),
        arg29.lookup?.dispose(),
        (arg29.surface = arg29.lookup = null),
        (arg29.uniforms.plan2SurfaceMap.value = v26),
        (arg29.uniforms.plan2SurfaceLookup.value = v26));
      return;
    }
    const ceil = Math.ceil(Math.sqrt(map6.length)),
      min2 = Math.min(
        options2.surfaceResolution,
        Math.floor(v15.capabilities.maxTextureSize / ceil),
      ),
      v64 = ceil * min2;
    arg29.surface?.width !== v64 &&
      (arg29.surface?.dispose(),
      (arg29.surface = new v14.WebGLRenderTarget(v64, v64, {
        format: v14.RedFormat,
        depthBuffer: false,
        generateMipmaps: false,
      })));
    const clone = arg33.clone();
    clone.expandByVector(new v14.Vector3(0.5, 0, 0.5));
    const v65 = clone.max.x - clone.min.x,
      v66 = clone.max.z - clone.min.z,
      v67 = (clone.min.x + clone.max.x) / 2,
      v68 = (clone.min.z + clone.max.z) / 2,
      v69 = new v14.OrthographicCamera(-v65 / 2, v65 / 2, v66 / 2, -v66 / 2, 0.001, 1.5);
    v69.up.set(0, 0, 1);
    const v70 = new v14.WebGLRenderTarget(min2, min2, {
        format: v14.RedFormat,
        generateMipmaps: false,
      }),
      v71 = new v14.WebGLRenderTarget(min2, min2, {
        format: v14.RedFormat,
        depthBuffer: false,
        generateMipmaps: false,
      }),
      map7 = new Map(),
      v72 = (arg38) =>
        isContactCasterMaterial(arg38)
          ? (map7.has(arg38) || map7.set(arg38, fn9(arg38, true)), map7.get(arg38))
          : arg35;
    try {
      arg31.forEach((arg39, arg40) => {
        const material2 = arg30[arg40].material;
        arg39.material = Array.isArray(material2) ? material2.map(v72) : v72(material2);
      });
      let v73 = v24(),
        num3 = 0;
      for (let num4 = 0; num4 < map6.length; num4++) {
        (v69.position.set(v67, arg34 + $e2[num4].top + 0.003, v68),
          v69.lookAt(v67, v69.position.y + 1, v68),
          v69.updateMatrixWorld(true),
          arg36(v69),
          (v15.autoClear = true),
          v15.setClearColor(0, 1),
          v15.setRenderTarget(v70),
          v15.render(arg32, v69),
          options3.surfacePasses++);
        const v74 = (arg41, arg42, arg43, arg44, v75 = 0) => {
          ((v45.uniforms.source.value = arg41.texture),
            v45.uniforms.stepSize.value.set(arg43, arg44),
            (v45.uniforms.spread.value = v75),
            v15.setRenderTarget(arg42),
            v15.render(v43, v44));
        };
        (v74(v70, v71, 0.006 / v65, 0, 1),
          v74(v71, v70, 0, 0.006 / v66, 1),
          v74(v70, v71, 0.012 / v65, 0),
          v74(v71, v70, 0, 0.012 / v66),
          arg29.surface.viewport.set(
            (num4 % ceil) * min2,
            Math.floor(num4 / ceil) * min2,
            min2,
            min2,
          ),
          (v15.autoClear = false),
          v74(v70, arg29.surface, 0, 0),
          num3++,
          (num3 >= (v37 ? Math.min(2, v22) : v22) || v24() - v73 >= v23) &&
            num4 + 1 < map6.length &&
            (yield, (v73 = v24()), (num3 = 0)));
      }
      arg29.surface.viewport.set(0, 0, v64, v64);
      const v76 = map6.at(-1) + 0.05,
        num5 = 2048,
        uint8Array = new Uint8Array(num5 * 4);
      for (let num6 = 0; num6 < num5; num6++) {
        const v77 = ((num6 + 0.5) / num5) * v76;
        let v78 = -1,
          num7 = 0.018;
        if (
          (map6.forEach((arg45, arg46) => {
            const abs = Math.abs(arg45 - v77);
            abs < num7 && ((num7 = abs), (v78 = arg46));
          }),
          v78 < 0)
        )
          continue;
        const max = Math.max(
          1,
          Math.min(65535, Math.floor((($e2[v78].top + 0.003) / v76) * 65535)),
        );
        ((uint8Array[num6 * 4] = v78 % ceil),
          (uint8Array[num6 * 4 + 1] = Math.floor(v78 / ceil)),
          (uint8Array[num6 * 4 + 2] = max >> 8),
          (uint8Array[num6 * 4 + 3] = max & 255));
      }
      (arg29.lookup?.dispose(),
        (arg29.lookup = new v14.DataTexture(uint8Array, num5, 1)),
        (arg29.lookup.needsUpdate = true),
        (arg29.uniforms.plan2SurfaceMap.value = arg29.surface.texture),
        (arg29.uniforms.plan2SurfaceLookup.value = arg29.lookup),
        arg29.uniforms.plan2SurfaceLayout.value.set(ceil, v76),
        arg29.uniforms.plan2SurfaceBounds.value.set(clone.min.x, clone.min.z, v65, v66),
        (arg29.uniforms.plan2SurfaceOpacity.value = options2.enabled ? options2.surfaceOpacity : 0),
        options3.surfaceCaptures++);
    } finally {
      (v70.dispose(),
        v71.dispose(),
        fn10(),
        (v45.uniforms.source.value = v26),
        (v45.uniforms.spread.value = 0));
    }
  }
  function fn14() {
    return {
      target: v15.getRenderTarget(),
      face: v15.getActiveCubeFace(),
      mip: v15.getActiveMipmapLevel(),
      clear: v15.getClearColor(new v14.Color()),
      alpha: v15.getClearAlpha(),
      autoClear: v15.autoClear,
      shadows: v15.shadowMap.enabled,
      xr: v15.xr.enabled,
      viewport: v15.getViewport(new v14.Vector4()),
      scissor: v15.getScissor(new v14.Vector4()),
      scissorTest: v15.getScissorTest(),
    };
  }
  function fn15(arg47) {
    (v15.setViewport(arg47.viewport),
      v15.setScissor(arg47.scissor),
      v15.setScissorTest(arg47.scissorTest),
      v15.setRenderTarget(arg47.target, arg47.face, arg47.mip),
      v15.setClearColor(arg47.clear, arg47.alpha),
      (v15.autoClear = arg47.autoClear),
      (v15.shadowMap.enabled = arg47.shadows),
      (v15.xr.enabled = arg47.xr),
      (v45.uniforms.source.value = v26),
      (v45.uniforms.spread.value = 0));
  }
  function fn16(arg48, arg49, arg50) {
    const v79 = new v14.Box3();
    let v80 = Infinity;
    for (const v81 of arg49) {
      const setFromObject = new v14.Box3().setFromObject(v81);
      (v79.union(setFromObject),
        setFromObject.isEmpty() || (v80 = Math.min(v80, setFromObject.max.y)));
    }
    if (v79.isEmpty() || !arg50.length) {
      fn11(arg48);
      return;
    }
    ((v79.min.x -= 0.25), (v79.min.z -= 0.25), (v79.max.x += 0.25), (v79.max.z += 0.25));
    const max2 = Math.max(v79.max.x - v79.min.x, 0.1),
      max3 = Math.max(v79.max.z - v79.min.z, 0.1),
      min3 = Math.min(options2.resolution, v15.capabilities.maxTextureSize),
      { target: v82, ping: v83 } = fn12(arg48, min3),
      v84 = new v14.OrthographicCamera(
        -max2 / 2,
        max2 / 2,
        max3 / 2,
        -max3 / 2,
        0.001,
        options2.maxHeight + 0.06,
      ),
      v85 = (v79.min.x + v79.max.x) / 2,
      v86 = (v79.min.z + v79.max.z) / 2;
    (v84.position.set(v85, v80 - 0.06, v86),
      v84.up.set(0, 0, 1),
      v84.lookAt(v85, v80 + 1, v86),
      v84.updateMatrixWorld(true));
    const v87 = new v14.Scene(),
      map8 = new Map(),
      list2 = [],
      v88 = new v14.MeshDepthMaterial();
    v88.visible = false;
    const v89 = (arg51) =>
      isContactCasterMaterial(arg51)
        ? (map8.has(arg51) || map8.set(arg51, fn9(arg51)), map8.get(arg51))
        : v88;
    for (const v90 of arg50) {
      const clone2 = v90.clone(false);
      ((clone2.material = Array.isArray(v90.material) ? v90.material.map(v89) : v89(v90.material)),
        clone2.matrix.copy(v90.matrixWorld),
        clone2.matrixWorld.copy(v90.matrixWorld),
        (clone2.matrixAutoUpdate = false),
        (clone2.matrixWorldAutoUpdate = true),
        (clone2.castShadow = false),
        (clone2.receiveShadow = false),
        clone2.layers.set(0),
        (clone2.frustumCulled = false),
        v87.add(clone2),
        list2.push(clone2));
    }
    const map9 = new Map(),
      v91 = new v14.Matrix4(),
      v92 = new v14.Box3(),
      map10 = arg50.map((arg52) => {
        const material3 = Array.isArray(arg52.material) ? arg52.material : [arg52.material];
        if (
          arg52.isSkinnedMesh ||
          arg52.isBatchedMesh ||
          arg52.morphTexture ||
          arg52.morphTargetInfluences?.length ||
          material3.some((arg53) => arg53?.isShaderMaterial || arg53?.displacementMap) ||
          !arg52.geometry?.attributes.position
        )
          return null;
        map9.has(arg52.geometry) ||
          (arg52.geometry.computeBoundingBox(),
          map9.set(arg52.geometry, arg52.geometry.boundingBox));
        const v93 = map9.get(arg52.geometry);
        if (!v93) return null;
        const v94 = new v14.Box3();
        if (arg52.isInstancedMesh) {
          for (let num8 = 0; num8 < arg52.count; num8++)
            (arg52.getMatrixAt(num8, v91),
              v91.premultiply(arg52.matrixWorld),
              v94.union(v92.copy(v93).applyMatrix4(v91)));
        } else v94.copy(v93).applyMatrix4(arg52.matrixWorld);
        const max4 = Math.max(options2.maxHeight + 0.06, 1.5);
        return (
          v94?.expandByVector(
            new v14.Vector3(
              Math.abs(options2.offsetX) * max4 + 0.0001,
              0.0001,
              Math.abs(options2.offsetZ) * max4 + 0.0001,
            ),
          ),
          v94 &&
          Number.isFinite(v94.min.x + v94.min.y + v94.min.z + v94.max.x + v94.max.y + v94.max.z)
            ? v94
            : null
        );
      }),
      v95 = new v14.Frustum(),
      v96 = new v14.Matrix4(),
      v97 = v84,
      v98 = (arg54) => {
        v95.setFromProjectionMatrix(
          v96.multiplyMatrices(arg54.projectionMatrix, arg54.matrixWorldInverse),
        );
        for (let num9 = 0; num9 < list2.length; num9++) {
          const v99 = map10[num9],
            v100 =
              arg54 === v97 &&
              arg50[num9].userData?.regionReceiverKind === "floor" &&
              v99 &&
              v99.max.y <= v80 + 0.003;
          ((list2[num9].visible = !v100 && (!v99 || v95.intersectsBox(v99))),
            v99 && (options3.testedCasters++, list2[num9].visible || options3.culledCasters++));
        }
      },
      v101 = fn14();
    let v102 = false;
    const v103 = () => {
      v88.dispose();
      for (const v104 of list2) (v104.isInstancedMesh || v104.isBatchedMesh) && v104.dispose();
      v87.clear();
    };
    try {
      ((v15.xr.enabled = false),
        (v15.shadowMap.enabled = false),
        (v15.autoClear = true),
        v15.setScissorTest(false),
        v15.setClearColor(0, 1),
        v98(v84),
        v15.setRenderTarget(v82),
        v15.render(v87, v84),
        (options3.capturePasses += 1));
      const v105 = (arg55) => {
        ((v45.uniforms.source.value = v82.texture),
          v45.uniforms.stepSize.value.set((options2.blurMeters * arg55) / max2, 0),
          v15.setRenderTarget(v83),
          v15.render(v43, v44),
          (v45.uniforms.source.value = v83.texture),
          v45.uniforms.stepSize.value.set(0, (options2.blurMeters * arg55) / max3),
          v15.setRenderTarget(v82),
          v15.render(v43, v44));
      };
      if ((v105(1), v105(0.4), options2.surfaceEnabled)) {
        const v106 = fn13(arg48, arg50, list2, v87, v79, v80, v88, v98);
        if (v36 || v35)
          (fn1(new Set([arg48.id])),
            (arg48.surfacePending = true),
            (arg48.uniforms.plan2SurfaceOpacity.value = 0),
            map5.set(arg48.id, {
              record: arg48,
              iterator: v106,
              dispose: v103,
            }),
            (v102 = true));
        else {
          for (const v107 of v106);
          arg48.surfacePending = false;
        }
      } else ((arg48.surfacePending = false), (arg48.uniforms.plan2SurfaceOpacity.value = 0));
      ((arg48.uniforms.plan2ContactMap.value = v82.texture),
        arg48.uniforms.plan2ContactBounds.value.set(v79.min.x, v79.min.z, max2, max3),
        (arg48.uniforms.plan2ContactY.value = v80),
        (arg48.uniforms.plan2ContactOpacity.value = options2.enabled ? options2.opacity : 0));
    } catch (v108) {
      throw (fn1(new Set([arg48.id])), fn11(arg48), v108);
    } finally {
      (fn15(v101), v102 || v103(), fn10());
    }
  }
  function fn17(arg56) {
    const v109 = arg56.attributes.position?.version + ":" + arg56.index?.version,
      v110 = weakMap.get(arg56);
    if (
      v110?.version === v109 &&
      v110.position === arg56.attributes.position &&
      v110.index === arg56.index
    )
      return v110.key;
    let v111;
    if (arg56.parameters && arg56.attributes.position?.version === 0 && !(arg56.index?.version > 0))
      try {
        v111 = JSON.stringify([arg56.type, arg56.parameters], (arg57, arg58) =>
          arg57 === "uuid" ? undefined : arg58,
        );
      } catch {}
    if (!v111) {
      const v112 = (arg59) => {
        if (!arg59) return null;
        const array = arg59.array || arg59.data?.array;
        if (!array) return [arg59.count, arg59.version];
        const uint8Array2 = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        let num10 = 2166136261,
          num11 = 3339675911;
        for (const v113 of uint8Array2)
          ((num10 = Math.imul(num10 ^ v113, 16777619)),
            (num11 = Math.imul(num11 ^ v113, 2246822519)));
        return [
          arg59.itemSize,
          arg59.count,
          arg59.offset,
          arg59.data?.stride,
          num10 >>> 0,
          num11 >>> 0,
        ];
      };
      v111 = JSON.stringify([
        v112(arg56.attributes.position),
        v112(arg56.index),
        (arg56.morphAttributes.position || []).map(v112),
        arg56.groups,
        arg56.drawRange,
      ]);
    }
    return (
      weakMap.set(arg56, {
        version: v109,
        key: v111,
        position: arg56.attributes.position,
        index: arg56.index,
      }),
      v111
    );
  }
  function fn18(arg60, arg61) {
    const invert = arg61.clone().invert(),
      v114 = (arg62) => {
        const multiply = invert.clone().multiply(arg62.matrixWorld),
          v115 = (arg63) => arg63.elements.map((arg64) => Math.round(arg64 * 10000));
        if (!arg62.isInstancedMesh) return v115(multiply);
        const v116 = new v14.Matrix4(),
          list3 = [];
        for (let num12 = 0; num12 < arg62.count; num12++)
          (arg62.getMatrixAt(num12, v116), list3.push(v115(v116.premultiply(multiply))));
        return list3;
      },
      v117 = (arg65) => arg65.map((arg66) => JSON.stringify(arg66)).sort();
    return JSON.stringify([
      options2,
      v117(
        arg60.receivers.map((arg67) => {
          const geometry2 = arg67.geometry,
            position = geometry2.attributes.position,
            v118 = weakMap2.get(geometry2);
          (!v118 || v118.position !== position || v118.version !== position?.version) &&
            (geometry2.computeBoundingBox(),
            weakMap2.set(geometry2, {
              position: position,
              version: position?.version,
              box: geometry2.boundingBox?.clone(),
            }));
          const v119 = weakMap2
            .get(geometry2)
            .box?.clone()
            .applyMatrix4(invert.clone().multiply(arg67.matrixWorld));
          return v119
            ? [...v119.min.toArray(), ...v119.max.toArray()].map((arg68) =>
                Math.round(arg68 * 10000),
              )
            : null;
        }),
      ),
      v117(
        arg60.casters.map((arg69) => {
          const map11 = (Array.isArray(arg69.material) ? arg69.material : [arg69.material]).map(
              (arg70) => {
                const num13 = arg70.alphaTest || 0,
                  displacementMap = arg70.displacementMap,
                  v120 = (arg71) => (arg71 ? [arg71.uuid, arg71.version] : null);
                return [
                  isContactCasterMaterial(arg70),
                  num13,
                  num13 > 0 ? v120(arg70.map) : null,
                  num13 > 0 ? v120(arg70.alphaMap) : null,
                  v120(displacementMap),
                  displacementMap ? (arg70.displacementScale ?? 1) : 0,
                  displacementMap ? (arg70.displacementBias ?? 0) : 0,
                ];
              },
            ),
            every = map11.every((arg72) => JSON.stringify(arg72) === JSON.stringify(map11[0]));
          return [
            fn17(arg69.geometry),
            arg69.isInstancedMesh ? arg69.count : null,
            arg69.morphTargetInfluences,
            v114(arg69),
            every ? map11.slice(0, 1) : map11,
          ];
        }),
      ),
    ]);
  }
  const v121 = (arg73) =>
    (arg73.target
      ? arg73.target.width *
        arg73.target.height *
        (arg73.target.texture.format === v14.RedFormat ? 5 : 8)
      : 0) +
    (arg73.ping
      ? arg73.ping.width * arg73.ping.height * (arg73.ping.texture.format === v14.RedFormat ? 1 : 4)
      : 0) +
    (arg73.surface
      ? arg73.surface.width *
        arg73.surface.height *
        (arg73.surface.texture.format === v14.RedFormat ? 1 : 4)
      : 0) +
    (arg73.lookup?.image?.data?.byteLength || 0);
  function fn19(arg74) {
    if (!arg74.target || !arg74.contentKey || arg74.surfacePending) return;
    const stringify2 = JSON.stringify([arg74.id, arg74.contentKey]),
      v122 = map4.get(stringify2);
    (v122 && fn11(v122), arg74.ping?.dispose(), (arg74.ping = null));
    const options4 = {
      id: arg74.id,
      contentKey: arg74.contentKey,
      bakedFrame: arg74.bakedFrame,
      target: arg74.target,
      ping: arg74.ping,
      surface: arg74.surface,
      lookup: arg74.lookup,
      uniforms: Object.fromEntries(
        Object.entries(arg74.uniforms).map(([v123, v124]) => [
          v123,
          {
            value: v124.value?.clone && !v124.value.isTexture ? v124.value.clone() : v124.value,
          },
        ]),
      ),
    };
    (map4.delete(stringify2),
      map4.set(stringify2, options4),
      (arg74.target = arg74.ping = arg74.surface = arg74.lookup = null),
      (arg74.uniforms.plan2ContactOpacity.value = arg74.uniforms.plan2SurfaceOpacity.value = 0),
      (arg74.fade = null));
  }
  function fn20(arg75, arg76) {
    const stringify3 = JSON.stringify([arg75.id, arg76]),
      v125 = map4.get(stringify3);
    if (!v125) return false;
    (map4.delete(stringify3), fn19(arg75), arg75.surfacePending && fn11(arg75));
    for (const v126 of ["target", "ping", "surface", "lookup", "contentKey", "bakedFrame"])
      arg75[v126] = v125[v126];
    for (const [v127, v128] of Object.entries(v125.uniforms))
      arg75.uniforms[v127].value = v128.value;
    return (
      (arg75.uniforms.plan2ContactOpacity.value = arg75.uniforms.plan2SurfaceOpacity.value = 0),
      true
    );
  }
  function fn21(arg77) {
    const sort = [...map2.values()]
      .filter((arg78) => arg78.target && !arg77.has(arg78.id))
      .sort((arg79, arg80) => (arg80.lastUsed || 0) - (arg79.lastUsed || 0));
    let num14 = 0,
      num15 = 0;
    for (const v129 of sort) {
      (v129.ping?.dispose(), (v129.ping = null));
      const v130 = v121(v129);
      num14 + v130 > 32 * 1024 * 1024 ? fn11(v129) : ((num14 += v130), num15++);
    }
    let reduce = [...map4.values()].reduce((arg81, arg82) => arg81 + v121(arg82), 0);
    for (; map4.size > 8 || num14 + reduce > 32 * 1024 * 1024;) {
      const v131 = map4.keys().next().value,
        v132 = map4.get(v131);
      if (!v132) break;
      ((reduce -= v121(v132)), fn11(v132), map4.delete(v131));
    }
    ((options3.cachedFloors = num15),
      (options3.cachedLayouts = map4.size),
      (options3.cachedBytes = num14 + reduce));
  }
  function fn22() {
    if (v36 || !map5.size || v30 || !v17() || !options2.enabled) return;
    const [v133, v134] = map5.entries().next().value,
      v135 = fn14();
    try {
      ((v15.xr.enabled = false),
        (v15.shadowMap.enabled = false),
        v15.setScissorTest(false),
        v134.iterator.next().done &&
          ((v134.record.surfacePending = false), v134.dispose(), map5.delete(v133)));
    } catch (v136) {
      throw (fn1(new Set([v133])), fn11(v134.record), fn3(v133), v136);
    } finally {
      fn15(v135);
    }
    map5.size && v18();
  }
  function fn23(
    arg83,
    { motion: v137 = false, allFloors: v138 = true, affectedFloors: v139 } = {},
  ) {
    arg83.updateWorldMatrix(true, true);
    const map12 = new Map();
    return (
      arg83.traverse((arg84) => {
        if (!arg84.isMesh || !et(arg84) || (!v137 && he(arg84, "floorTransitionLeaving"))) return;
        const v140 = String(he(arg84, "regionFloorId") ?? he(arg84, "floorId") ?? "default");
        if ((!v137 && !v42(v140)) || (!v138 && !v139.has(v140))) return;
        const v141 = arg84.userData?.regionReceiverKind === "floor",
          some =
            arg84.castShadow &&
            !he(arg84, "disableContactShadow") &&
            he(arg84, "modelLayer") === "items" &&
            (Array.isArray(arg84.material) ? arg84.material : [arg84.material]).some(
              isContactCasterMaterial,
            );
        (!v141 && !some) ||
          (map12.has(v140) ||
            map12.set(v140, {
              receivers: [],
              casters: [],
            }),
          v141 && map12.get(v140).receivers.push(arg84),
          some && map12.get(v140).casters.push(arg84));
      }),
      map12
    );
  }
  function fn24(arg85) {
    const v142 = fn23(arg85, {
      motion: true,
    });
    for (const v143 of map2.values())
      ((v143.motionReady = false),
        (v143.fade = null),
        (v143.uniforms.plan2ContactOpacity.value = v143.uniforms.plan2SurfaceOpacity.value = 0));
    for (const [v144, v145] of v142) {
      const v146 = fn2(v144),
        v147 = v145.receivers[0],
        v148 = value2?.(v144) || v147?.matrixWorld;
      if (!v148 || (!v146.target && ![...map4.values()].some((arg86) => arg86.id === v144)))
        continue;
      const v149 = fn18(v145, v148);
      (v146.contentKey !== v149 && fn20(v146, v149),
        !(!v146.target || v146.surfacePending || !v146.bakedFrame || v146.contentKey !== v149) &&
          ((v146.anchor = v147),
          (v146.motionReady = true),
          (v146.uniforms.plan2ContactOpacity.value = options2.enabled ? options2.opacity : 0),
          (v146.uniforms.plan2SurfaceOpacity.value =
            options2.enabled && options2.surfaceEnabled && v146.surface
              ? options2.surfaceOpacity
              : 0)));
    }
    ((v33 = false), fn21(v142));
  }
  function fn25() {
    if (v28 || v29 || v34 || !v38) return;
    (!v27 && !set.size && !map5.size && (v35 = false), (options3.floors = 0));
    for (const v150 of map2.values()) {
      if (v150.fade) {
        const min4 = Math.min(
          1,
          Math.max(0, (performance.now() - v150.fade.started) / (v150.fade.to > 0 ? 160 : 240)),
        );
        ((v150.uniforms.plan2ContactOpacity.value =
          v150.fade.from + (v150.fade.to - v150.fade.from) * min4),
          (v150.uniforms.plan2SurfaceOpacity.value =
            v150.fade.fromSurface + (v150.fade.toSurface - v150.fade.fromSurface) * min4),
          min4 === 1 ? (v150.fade = null) : v18());
      }
      v150.target && v150.uniforms.plan2ContactOpacity.value > 0 && options3.floors++;
    }
    fn8();
    const v151 = v16();
    if (v151 !== value) {
      fn1();
      for (const v152 of map4.values()) fn11(v152);
      (map4.clear(), (value = v151), (v32 = false), (v27 = true), set.clear(), (v33 = true));
    }
    if (
      (v30 &&
        v25 &&
        v151 &&
        v33 &&
        (fn24(v151),
        fn8(),
        (options3.floors = [...map2.values()].filter(
          (arg87) => arg87.target && arg87.uniforms.plan2ContactOpacity.value > 0,
        ).length)),
      (!v27 && !set.size) || v30 || !v17() || !v151)
    ) {
      v151 && !v27 && !set.size && fn22();
      return;
    }
    const v153 = v27,
      set2 = new Set(set),
      v154 = fn23(v151, {
        allFloors: v153,
        affectedFloors: set2,
      });
    for (const v155 of map2.values())
      !v30 &&
        (v153 || set2.has(v155.id)) &&
        !v154.has(v155.id) &&
        (v32
          ? ((v155.uniforms.plan2ContactOpacity.value = 0),
            (v155.uniforms.plan2SurfaceOpacity.value = 0),
            (v155.fade = null))
          : fn11(v155),
        (v155.casters = v155.instancedCasters = v155.receivers = 0));
    const list4 = [],
      num16 = v31 ? 1 : Math.max(1, v19);
    let num17 = 0;
    for (const [v156, v157] of v154) {
      if (!v32 && num17 >= num16) {
        list4.push(v156);
        continue;
      }
      const v158 = fn2(v156),
        value5 = v157.receivers[0] || null,
        v159 = value2?.(v156)?.clone() || value5?.matrixWorld.clone(),
        value6 = v159 ? fn18(v157, v159) : null;
      v32 && value6 && v158.contentKey !== value6 && fn20(v158, value6);
      const bakedFrame =
        v32 &&
        value6 &&
        v158.target &&
        !v158.surfacePending &&
        v158.contentKey === value6 &&
        v158.bakedFrame;
      if (!bakedFrame && num17 >= num16) {
        list4.push(v156);
        continue;
      }
      v158.lastUsed = performance.now();
      const v160 = v158.uniforms.plan2ContactOpacity.value,
        v161 = v158.uniforms.plan2SurfaceOpacity.value;
      (bakedFrame
        ? (options3.cacheHits++,
          (v158.uniforms.plan2ContactOpacity.value = options2.enabled ? options2.opacity : 0),
          (v158.uniforms.plan2SurfaceOpacity.value =
            options2.enabled && options2.surfaceEnabled && v158.surface
              ? options2.surfaceOpacity
              : 0))
        : (num17++,
          v32 && fn19(v158),
          fn16(v158, v157.receivers, v157.casters),
          (v158.contentKey = value6),
          (v158.bakedFrame = v159),
          v158.uniforms.plan2ContactTransform.value.identity()),
        v158.fade
          ? ((v158.fade.to = v158.uniforms.plan2ContactOpacity.value),
            (v158.fade.toSurface = v158.uniforms.plan2SurfaceOpacity.value),
            (v158.uniforms.plan2ContactOpacity.value = v160),
            (v158.uniforms.plan2SurfaceOpacity.value = v161),
            v18())
          : v31 &&
            v160 < v158.uniforms.plan2ContactOpacity.value &&
            ((v158.fade = {
              started: performance.now(),
              from: v160,
              fromSurface: v161,
              to: v158.uniforms.plan2ContactOpacity.value,
              toSurface: v158.uniforms.plan2SurfaceOpacity.value,
            }),
            (v158.uniforms.plan2ContactOpacity.value = v160),
            (v158.uniforms.plan2SurfaceOpacity.value = v161),
            v18()),
        (v158.anchor = value5),
        (v158.casters = v157.casters.length),
        (v158.receivers = v157.receivers.length),
        (v158.instancedCasters = v157.casters.filter((arg88) => arg88.isInstancedMesh).length));
    }
    (fn8(),
      fn21(
        v153
          ? v154
          : new Map(
              [...map2.values()]
                .filter((arg89) => arg89.receivers > 0)
                .map((arg90) => [arg90.id, true]),
            ),
      ),
      (options3.casters = options3.instancedCasters = options3.receivers = options3.floors = 0));
    for (const v162 of map2.values())
      ((options3.casters += v162.casters),
        (options3.instancedCasters += v162.instancedCasters),
        (options3.receivers += v162.receivers),
        v162.target && v162.uniforms.plan2ContactOpacity.value > 0 && options3.floors++);
    ((options3.builds += 1),
      (v27 = false),
      set.clear(),
      list4.forEach((arg91) => set.add(arg91)),
      (v31 = v31 && list4.length > 0),
      (list4.length || (!v36 && map5.size)) && v18());
  }
  function fn26() {
    if (!v28) {
      ((v28 = true), (options3.disposed = true), (options3.floors = 0), fn1());
      for (const v163 of map2.values()) fn11(v163);
      for (const v164 of map4.values()) fn11(v164);
      (map4.clear(), set.clear(), (value = null), map2.clear());
      for (const v165 of map3.values()) v165.dispose();
      (map3.clear(), v26.dispose(), v46.geometry.dispose(), v45.dispose());
    }
  }
  const options5 = {
    sync: fn25,
    invalidate: fn3,
    invalidateContext: fn4,
    dispose: fn26,
    stats: options3,
    settings: options2,
    setEnabled: fn5,
    setSuspended: fn6,
    setMotion: fn7,
    prepareMotion() {
      !v28 && v25 && v30 && ((v33 = true), v18());
    },
    prepareDuringEntrance(arg92) {
      v28 ||
        ((v37 = true),
        (v38 = arg92 === true),
        v38 && ((v34 = false), (v36 = false), (map5.size || v27 || set.size) && v18()));
    },
    finishDeferredSurfaceBake() {
      ((v37 = false),
        (v38 = true),
        (v34 = false),
        (v36 = false),
        (map5.size || v27 || set.size) && v18());
    },
    hasPendingSurfaces: () => !v28 && map5.size > 0,
    isPending: () => !v28 && !v34 && (v27 || set.size > 0),
    setVisibleFloor(arg93) {
      const value7 = arg93 == null ? null : String(arg93);
      if (value7 !== value3) {
        (!v27 && !set.size && (v32 = true), (value3 = value7), (options3.floors = 0));
        for (const v166 of map2.values())
          (!v30 &&
            !v42(v166.id) &&
            ((v166.fade = null),
            (v166.uniforms.plan2ContactOpacity.value = v166.uniforms.plan2SurfaceOpacity.value =
              0)),
            v166.target && v166.uniforms.plan2ContactOpacity.value > 0 && options3.floors++);
        fn3(null, true);
      }
    },
    setFrameProvider(arg94) {
      ((value2 = arg94), fn3());
    },
    getUniforms: (arg95) => fn2(arg95).uniforms,
  };
  return (typeof window < "u" && (window.__plan2Contact = options5), options5);
}
