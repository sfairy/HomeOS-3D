import { normalizeGroundReflection } from "../modules/interaction3d/reflection-settings.js?v=20260918-reflection-user-settings-v1-20260918-review-1234-v2";
import { createReflectionCulling } from "./studio-reflection-culling.js?v=20260929-fade-culling-v1";
export function createGroundReflections({
  THREE: arg1,
  renderer: arg2,
  scene: arg3,
  getRoot: arg4,
  syncLighting: arg5,
  getFloorCamera: arg6 = (arg17) => arg17,
  getStateKey: arg7 = () => "",
  getSceneRevision: arg8 = null,
  floorLighting: arg9 = false,
  detail: arg10 = null,
  passes: arg11 = null,
  cull: arg12 = true,
  blur: arg13 = true,
  fadeHeight: arg14 = 0,
  maxResumeCapturesPerFrame: arg15 = Infinity,
  requestFrame: arg16 = () => {},
}) {
  const object1 = {
      ...normalizeGroundReflection(),
      fps: 30,
    },
    value1 = createReflectionCulling(arg1, arg14),
    object2 = {
      captures: 0,
      renders: 0,
      lastMs: 0,
      totalMs: 0,
      allocations: 0,
      reuses: 0,
      cachedRecords: 0,
      cachedBytes: 0,
      inCapture: false,
    },
    weakMap1 = new WeakMap(),
    map1 = new Map(),
    map2 = new Map(),
    object3 = {
      groundReflectionPlane: {
        value: new arg1.Vector4(0, 1, 0, 0),
      },
      groundReflectionViewToWorld: {
        value: new arg1.Matrix4(),
      },
      groundReflectionFadeHeight: {
        value: arg14,
      },
    },
    weakMap2 = new WeakMap(),
    weakMap3 = new WeakMap(),
    value2 = new arg1.Vector3(),
    value3 = new arg1.Vector3(),
    value4 = new arg1.Vector3(),
    value5 = new arg1.Plane(),
    value6 = new arg1.Vector4(),
    value7 = new arg1.Vector4(),
    value8 = new arg1.Matrix4();
  function fn1(arg18) {
    if (!arg18 || (!(arg18.transmission > 0) && !arg18.userData.alphaWallBand))
      return arg11?.material(arg18) || arg18;
    if (!weakMap1.has(arg18)) {
      const value37 = arg18.clone();
      ((value37.transmission = 0),
        (value37.forceSinglePass = true),
        (value37.onBeforeCompile = arg18.onBeforeCompile),
        (value37.customProgramCacheKey = () =>
          arg18.customProgramCacheKey() + "|reflection-no-refraction"));
      const fn27 = () => {
        (arg18.removeEventListener("dispose", fn27),
          weakMap1.delete(arg18),
          map1.delete(value37),
          value37.dispose());
      };
      (arg18.addEventListener("dispose", fn27),
        weakMap1.set(arg18, value37),
        map1.set(value37, fn27));
    }
    return weakMap1.get(arg18);
  }
  function fn2(arg19) {
    const value38 = fn1(arg19);
    if (!(arg14 > 0) || !value38 || value38.isShaderMaterial) return value38;
    let value39 = map2.get(value38);
    if (
      (value39 &&
        value39.version !== value38.version &&
        (value39.copy.copy(value38),
        (value39.copy.needsUpdate = true),
        (value39.version = value38.version)),
      !value39)
    ) {
      const value41 = value38.clone();
      ((value41.onBeforeCompile = function (arg20, arg21) {
        (value38.onBeforeCompile.call(this, arg20, arg21),
          Object.assign(arg20.uniforms, object3),
          (arg20.vertexShader =
            "uniform vec4 groundReflectionPlane;\nuniform mat4 groundReflectionViewToWorld;\nvarying float vGroundReflectionHeight;\n" +
            arg20.vertexShader),
          (arg20.vertexShader = arg20.vertexShader.replace(
            "#include <project_vertex>",
            "#include <project_vertex>\n          vGroundReflectionHeight = dot(groundReflectionPlane, groundReflectionViewToWorld * mvPosition);",
          )),
          (arg20.fragmentShader =
            "uniform float groundReflectionFadeHeight;\nvarying float vGroundReflectionHeight;\n" +
            arg20.fragmentShader),
          (arg20.fragmentShader = arg20.fragmentShader.replace(
            "#include <dithering_fragment>",
            "#include <dithering_fragment>\n          float groundReflectionFade = 1.0 - smoothstep(0.0, groundReflectionFadeHeight, max(0.0, vGroundReflectionHeight));\n          if (groundReflectionFade <= 0.001) discard;\n          gl_FragColor.a *= groundReflectionFade;\n          " +
              (!value38.transparent || value38.premultipliedAlpha
                ? "gl_FragColor.rgb *= groundReflectionFade;"
                : ""),
          )));
      }),
        (value41.customProgramCacheKey = () =>
          value38.customProgramCacheKey() + "|reflection-root-fade-v1"),
        (value39 = {
          copy: value41,
          version: value38.version,
          release() {
            (value38.removeEventListener("dispose", value39.release),
              map2.delete(value38),
              value41.dispose());
          },
        }),
        value38.addEventListener("dispose", value39.release),
        map2.set(value38, value39));
    }
    const value40 = value39.copy;
    for (const value42 of ["color", "emissive"])
      value40[value42] && value38[value42] && value40[value42].copy(value38[value42]);
    for (const value43 of [
      "opacity",
      "emissiveIntensity",
      "roughness",
      "metalness",
      "map",
      "alphaMap",
      "lightMap",
      "lightMapIntensity",
      "aoMap",
      "aoMapIntensity",
      "visible",
    ])
      value43 in value38 && (value40[value43] = value38[value43]);
    return (arg11?.aliasMaterial?.(arg19, value40), value40);
  }
  function fn3(arg22) {
    if (!Array.isArray(arg22)) return fn2(arg22);
    let value44 = weakMap2.get(arg22);
    (value44 ||
      ((value44 = {
        next: [],
      }),
      weakMap2.set(arg22, value44)),
      (value44.next.length = arg22.length));
    let value45 = false;
    for (let value46 = 0; value46 < arg22.length; value46++)
      ((value44.next[value46] = fn2(arg22[value46])),
        (value45 ||= value44.next[value46] !== arg22[value46]));
    return value45 ? value44.next : arg22;
  }
  let list1 = [],
    value9 = null,
    value10 = null,
    value11 = true,
    value12 = -Infinity,
    text1 = "",
    text2 = "",
    value13 = false,
    text3 = "",
    list2 = [],
    value14 = 0,
    value15,
    value16 = false,
    value17 = false,
    value18 = null,
    value19 = null;
  const value20 = 160;
  let value21 = 1,
    value22 = null,
    value23 = null,
    value24 = null,
    value25 = 0,
    value26 = null;
  const map3 = new Map(),
    map4 = new Map(),
    value27 = 32 * 1024 * 1024;
  let map5 = new Map(),
    map6 = new Map(),
    list3 = [],
    value28 = null,
    value29 = null,
    value30;
  function fn4(arg23, arg24) {
    if (arg8 && value28 === arg23 && value29 === arg23.children[0] && value30 === arg24) return;
    ((list3 = []), (value28 = arg23), (value29 = arg23.children[0]), (value30 = arg24));
    const fn28 = (arg25, arg26 = -1) => {
      if (arg25.userData.reflectionOverlay) return;
      const value47 = list3.length,
        object4 = {
          object: arg25,
          parent: arg26,
          end: 0,
          id: "",
        };
      list3.push(object4);
      for (const value48 of arg25.children) fn28(value48, value47);
      object4.end = list3.length;
    };
    (fn28(arg23), (object2.candidateBuilds = (object2.candidateBuilds || 0) + 1));
  }
  const fn5 = (arg27) =>
      arg27.userData.floorId ||
      arg27.userData.regionFloorId ||
      arg27.userData.environmentFloorId ||
      arg27.userData.lightFloorId,
    value31 = new arg1.Group();
  value31.traverse = (arg28) => arg3.traverseVisible(arg28);
  function fn6(arg29, arg30) {
    if (!arg2.compile || !arg2.extensions?.has("KHR_parallel_shader_compile")) return true;
    const value49 = arg2.getContext();
    if (value49.isContextLost()) return false;
    let value50 = arg29.programWork;
    if (!value50 || value50.context !== value49 || value50.revision !== value15)
      return (
        arg2.compile(value31, arg30, arg3),
        (value50 = arg29.programWork =
          {
            context: value49,
            revision: value15,
            programs: [...arg2.info.programs],
            deadline: performance.now() + 4500,
            done: false,
          }),
        (object2.programPreparations = (object2.programPreparations || 0) + 1),
        false
      );
    if (value50.done) return true;
    const set1 = new Set(arg2.info.programs),
      fn29 = (arg31) => set1.has(arg31) && arg31.program && value49.isProgram(arg31.program);
    return (
      (value50.done =
        performance.now() >= value50.deadline ||
        value50.programs.some((arg32) => !fn29(arg32)) ||
        value50.programs.every((arg33) => arg33.isReady())),
      value50.done && (value50.programs = []),
      value50.done
    );
  }
  function fn7(arg34) {
    for (let value51 = arg34; value51; value51 = value51.parent) {
      const value52 =
        value51.userData?.floorId ||
        value51.userData?.regionFloorId ||
        value51.userData?.environmentFloorId ||
        value51.userData?.lightFloorId;
      if (value52) return String(value52);
    }
    return "";
  }
  const weakMap4 = new WeakMap();
  let value32 = 0;
  function fn8(arg35) {
    return arg35 ? (weakMap4.has(arg35) || weakMap4.set(arg35, ++value32), weakMap4.get(arg35)) : 0;
  }
  function fn9(arg36) {
    const value53 = arg36.geometry;
    return [
      value53.uuid,
      fn8(value53.index),
      value53.index?.version,
      ...Object.entries(value53.attributes).flatMap(([arg37, arg38]) => [
        arg37,
        fn8(arg38),
        arg38.version,
        arg38.data?.version,
        arg38.count,
      ]),
      value53.drawRange.start,
      value53.drawRange.count,
    ].join("|");
  }
  function fn10(arg39) {
    for (let value54 = arg39; value54; value54 = value54.parent)
      if (value54.userData.courtyardSurface || value54.userData.courtyardFoundation) return false;
    return (
      arg39.userData.backgroundThemeHidden !== true ||
      arg39.userData.groundReflectionReceiver === true
    );
  }
  function fn11(arg40) {
    (arg40.geometry.removeEventListener("dispose", arg40.onSourceDispose),
      arg40.overlay.removeFromParent(),
      arg40.overlay.geometry.dispose(),
      arg40.overlay.material.dispose(),
      arg40.map.dispose(),
      arg40.scratch?.dispose(),
      map3.delete(arg40.source));
  }
  function fn12() {
    const set2 = new Set(list1),
      value55 = [...map3.values()]
        .filter((arg41) => !set2.has(arg41))
        .sort((arg42, arg43) => arg43.used - arg42.used);
    let value56 = 0,
      value57 = 0;
    for (const value58 of value55) {
      const value59 =
        value58.map.width *
        value58.map.height *
        (12 * (1 + value58.map.samples) + (value58.scratch ? 8 : 0));
      if (value58.dead || value57 >= 4 || value56 + value59 > value27) {
        fn11(value58);
        continue;
      }
      ((value56 += value59), value57++);
    }
    ((object2.cachedRecords = value57), (object2.cachedBytes = value56));
  }
  function fn13(arg44) {
    return arg44
      .map((arg45) =>
        [
          arg45.uuid,
          fn22(arg45),
          arg45.intensity,
          arg45.color?.r,
          arg45.color?.g,
          arg45.color?.b,
          arg45.distance,
          arg45.decay,
          arg45.angle,
          arg45.penumbra,
          ...arg45.matrixWorld.elements,
          ...(arg45.target?.matrixWorld.elements || []),
        ].join(","),
      )
      .join(";");
  }
  function fn14(arg46) {
    return (
      value24 ??
      (arg46.kind === "outside" && value23 !== null ? value23 : fn7(arg46.source) || null)
    );
  }
  function fn15(arg47, arg48) {
    const value60 = fn14(arg47);
    return [...map5]
      .filter(([arg49]) => !arg9 || value60 === null || !arg49 || arg49 === value60)
      .map(([arg50]) => arg48.get(arg50))
      .join("|");
  }
  const fn16 = (arg51) => value24 === null || fn7(arg51) === value24;
  function fn17(arg52) {
    for (let value61 = arg52; value61; value61 = value61.parent)
      if (value61.userData?.floorTransitionLeaving) return true;
    return false;
  }
  function fn18(arg53) {
    if (value23 === null) return true;
    for (let value62 = arg53; value62; value62 = value62.parent) {
      const value63 = value62.userData?.floorId || value62.userData?.regionFloorId;
      if (value63) return value63 === value23;
    }
    return false;
  }
  const value33 = new arg1.Scene(),
    value34 = new arg1.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    value35 = new arg1.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        source: {
          value: null,
        },
        step: {
          value: new arg1.Vector2(),
        },
      },
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:
        "uniform sampler2D source; uniform vec2 step; varying vec2 vUv;\n      void main(){ gl_FragColor=texture2D(source,vUv)*.227027;\n      gl_FragColor+=(texture2D(source,vUv+step*1.384615)+texture2D(source,vUv-step*1.384615))*.316216;\n      gl_FragColor+=(texture2D(source,vUv+step*3.230769)+texture2D(source,vUv-step*3.230769))*.070270; }",
    }),
    value36 = new arg1.Mesh(new arg1.PlaneGeometry(2, 2), value35);
  value33.add(value36);
  const fn19 = (arg54, arg55 = false) =>
    new arg1.WebGLRenderTarget(arg54, arg54, {
      type: arg1.HalfFloatType,
      depthBuffer: !arg55,
      samples: arg55 ? 0 : Math.min(2, arg2.capabilities.maxSamples),
    });
  function fn20() {
    value26 = null;
    for (const value64 of [...map3.values()]) fn11(value64);
    ((list1 = []), (list2 = []), (object2.cachedRecords = object2.cachedBytes = 0));
  }
  function fn21(arg56) {
    const value65 = arg4();
    if (!value65) {
      (fn20(), (value9 = value10 = value28 = null), (list3 = []));
      return;
    }
    (fn4(value65, arg56),
      (!arg8 || value15 !== arg56 || value9 !== value65 || value10 !== value65.children[0]) &&
        ((list2 = []),
        value65.traverse((arg57) => {
          arg57.isMesh &&
            !arg57.userData.floorPlanGroundShadow &&
            arg57.userData.batchedWallContactShadowCount == null &&
            (arg57.userData.regionReceiverKind === "floor" ||
              arg57.userData.exportRole === "background") &&
            list2.push(arg57);
        })));
    const value66 = list2.map((arg58) => arg58.uuid + ":" + (fn10(arg58) ? 1 : 0)).join("|");
    if (
      value15 === arg56 &&
      value9 === value65 &&
      value10 === value65.children[0] &&
      value66 === text3 &&
      list1.every((arg59) => arg59.source.parent && !arg59.dead && fn10(arg59.source))
    )
      return;
    for (const value69 of list1)
      ((value69.overlay.visible = false), value69.overlay.removeFromParent());
    ((list1 = []),
      (value15 = arg56),
      (value9 = value65),
      (value10 = value65.children[0]),
      (text3 = value66),
      value9.updateWorldMatrix(true, true),
      (map5 = new Map()),
      (map6 = new Map()));
    const value67 = new arg1.Box3();
    value9.traverse((arg60) => {
      if (arg60.userData?.reflectionOverlay || arg60.userData?.environmentEffect) return;
      const value70 = fn7(arg60);
      if (
        (arg60.isLight &&
          (map6.has(value70) || map6.set(value70, []), map6.get(value70).push(arg60)),
        !arg60.isMesh || !arg60.geometry)
      )
        return;
      (arg60.geometry.boundingBox || arg60.geometry.computeBoundingBox(),
        arg60.isInstancedMesh && arg60.computeBoundingBox());
      const value71 = arg60.isInstancedMesh ? arg60.boundingBox : arg60.geometry.boundingBox,
        value72 =
          arg60.isSkinnedMesh || arg60.morphTargetInfluences?.length
            ? Infinity
            : value71
              ? value67.copy(value71).applyMatrix4(arg60.matrixWorld).max.y
              : Infinity;
      map5.set(value70, Math.max(map5.get(value70) ?? -Infinity, value72));
    });
    const value68 = list2.filter(fn10);
    for (const value73 of value68) {
      const value74 = value73.userData.exportRole === "background" ? "outside" : "inside";
      if (
        fn17(value73) ||
        !fn16(value73) ||
        (object1.mode !== "all" && value74 !== object1.mode) ||
        (value74 === "outside" && !fn18(value73))
      )
        continue;
      const value75 = new arg1.Box3().setFromObject(value73),
        value76 = value75.max.y,
        value77 = fn9(value73);
      let value78 = map3.get(value73);
      if (
        (value78 && (value78.dead || value78.key !== value77) && (fn11(value78), (value78 = null)),
        value78)
      ) {
        ((value78.height = value76),
          (value78.used = ++value25),
          (value78.hasCapture = false),
          value78.overlay.position.copy(value73.position),
          value78.overlay.quaternion.copy(value73.quaternion),
          value78.overlay.scale.copy(value73.scale),
          value73.parent.add(value78.overlay),
          list1.push(value78),
          object2.reuses++);
        continue;
      }
      const value79 = fn19(object1.resolution),
        value80 = arg13 ? fn19(object1.resolution, true) : null,
        value81 = new arg1.Matrix4(),
        value82 = new arg1.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
          uniforms: {
            reflection: {
              value: value79.texture,
            },
            reflectionMatrix: {
              value: value81,
            },
            strength: {
              value: object1.strength,
            },
          },
          vertexShader:
            "uniform mat4 reflectionMatrix; varying vec4 reflected; varying float up;\n          void main(){vec4 world=modelMatrix*vec4(position,1.);reflected=reflectionMatrix*world;\n          up=normalize(mat3(modelMatrix)*normal).y;gl_Position=projectionMatrix*viewMatrix*world;}",
          fragmentShader:
            "uniform sampler2D reflection; uniform float strength; varying vec4 reflected; varying float up;\n          void main(){if(up<.9||reflected.w<=0.)discard;vec2 uv=reflected.xy/reflected.w;\n          if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;\n          vec4 value=texture2D(reflection,uv);gl_FragColor=vec4(value.rgb/max(value.a,.001),clamp(value.a*strength,0.,.7));\n          #include <tonemapping_fragment>\n          #include <colorspace_fragment>\n          }",
        }),
        value83 = new arg1.Mesh(value73.geometry.clone(), value82);
      (value83.position.copy(value73.position),
        value83.quaternion.copy(value73.quaternion),
        value83.scale.copy(value73.scale),
        (value83.renderOrder = 1),
        (value83.userData.environmentEffect = true),
        (value83.userData.reflectionOverlay = true),
        (value83.userData.externalModelSharedGeometry =
          value83.userData.externalModelSharedMaterial =
          value83.userData.externalModelSharedTextures =
            true),
        (value78 = {
          source: value73,
          geometry: value73.geometry,
          kind: value74,
          height: value76,
          overlay: value83,
          map: value79,
          scratch: value80,
          matrix: value81,
          key: value77,
          used: ++value25,
          state: "",
          dead: false,
          hasCapture: false,
        }),
        (value78.onSourceDispose = () => {
          ((value78.dead = true), (value83.visible = false));
        }),
        value73.geometry.addEventListener("dispose", value78.onSourceDispose),
        map3.set(value73, value78),
        object2.allocations++,
        value73.parent.add(value83),
        list1.push(value78));
    }
    (arg10?.prepare(value9), arg11?.prepare(value9), fn12(), (value11 = true));
  }
  function fn22(arg61) {
    for (let value84 = arg61; value84; value84 = value84.parent) if (!value84.visible) return false;
    return true;
  }
  function fn23(arg62) {
    return (
      fn16(arg62.source) &&
      (object1.mode === "all" || object1.mode === arg62.kind) &&
      (arg62.kind !== "outside" || fn18(arg62.source))
    );
  }
  function fn24(arg63) {
    const value85 = normalizeGroundReflection(arg63);
    if (
      value85.mode === object1.mode &&
      value85.resolution === object1.resolution &&
      value85.strength === object1.strength
    )
      return false;
    const value86 = object1.resolution !== value85.resolution,
      value87 = object1.mode !== value85.mode;
    return (
      Object.assign(object1, value85),
      (value86 || value85.mode === "off" || value85.strength === 0) && (fn20(), (value10 = null)),
      value87 && (value10 = null),
      (value11 ||= value86 || value87),
      arg16(),
      true
    );
  }
  function fn25(arg64, arg65, arg66) {
    let value88 = weakMap3.get(arg64);
    (value88 || ((value88 = arg64.clone(false)), weakMap3.set(arg64, value88)),
      (value88.layers.mask = arg64.layers.mask));
    for (const value95 of [
      "near",
      "far",
      "zoom",
      "fov",
      "aspect",
      "focus",
      "filmGauge",
      "filmOffset",
      "left",
      "right",
      "top",
      "bottom",
      "coordinateSystem",
    ])
      value95 in arg64 && (value88[value95] = arg64[value95]);
    const value89 = value2.setFromMatrixPosition(arg64.matrixWorld),
      value90 = value3.setFromMatrixColumn(arg64.matrixWorld, 2).negate().normalize();
    (value89.addScaledVector(arg65.normal, -2 * arg65.distanceToPoint(value89)),
      value90.reflect(arg65.normal),
      value88.position.copy(value89),
      value88.up.setFromMatrixColumn(arg64.matrixWorld, 1).normalize().reflect(arg65.normal),
      value88.lookAt(value4.copy(value89).add(value90)),
      value88.updateMatrixWorld(true),
      value88.projectionMatrix.copy(arg64.projectionMatrix),
      (value88.projectionMatrix.elements[8] *= -1),
      (value88.projectionMatrix.elements[12] *= -1),
      arg66
        .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
        .multiply(value88.projectionMatrix)
        .multiply(value88.matrixWorldInverse));
    const value91 = value5.copy(arg65).applyMatrix4(value88.matrixWorldInverse),
      value92 = value6.set(value91.normal.x, value91.normal.y, value91.normal.z, value91.constant),
      value93 = value88.projectionMatrix.elements,
      value94 = value7
        .set(Math.sign(value92.x), Math.sign(value92.y), 1, 1)
        .applyMatrix4(value8.copy(value88.projectionMatrix).invert());
    return (
      value92.multiplyScalar(2 / value92.dot(value94)),
      (value93[2] = value92.x - value93[3]),
      (value93[6] = value92.y - value93[7]),
      (value93[10] = value92.z - value93[11]),
      (value93[14] = value92.w - value93[15]),
      value88.projectionMatrixInverse.copy(value88.projectionMatrix).invert(),
      value88
    );
  }
  function fn26(arg67, { worldMatricesCurrent: arg68 = false } = {}) {
    if (value13 || object2.inCapture || !arg67) return;
    if (value16) {
      if (value19 === null) return;
      const value108 = Math.min(1, Math.max(0, (performance.now() - value19) / 240));
      for (const value109 of list1) {
        let value110 = false;
        for (let value111 = value109.source; value111; value111 = value111.parent)
          if (value111 === arg4()) {
            value110 = true;
            break;
          }
        if (
          value108 === 1 ||
          !value110 ||
          value109.dead ||
          !value109.hasCapture ||
          !value109.fadeOutStrength
        ) {
          ((value109.overlay.visible = false), value109.overlay.removeFromParent());
          continue;
        }
        (value109.source.updateWorldMatrix(true, false),
          value109.matrix
            .copy(value109.fadeOutMatrix)
            .multiply(value109.fadeOutFrame)
            .multiply(new arg1.Matrix4().copy(value109.source.matrixWorld).invert()),
          value109.overlay.position.copy(value109.source.position),
          value109.overlay.quaternion.copy(value109.source.quaternion),
          value109.overlay.scale.copy(value109.source.scale),
          value109.overlay.parent !== value109.source.parent &&
            value109.source.parent.add(value109.overlay),
          value109.overlay.updateWorldMatrix(true, false),
          (value109.overlay.material.uniforms.strength.value =
            value109.fadeOutStrength * (1 - value108)),
          (value109.overlay.visible = fn22(
            value109.kind === "outside" ? value109.source.parent : value109.source,
          )));
      }
      value108 < 1 ? arg16() : (value19 = null);
      return;
    }
    if (
      object1.mode === "off" ||
      object1.strength === 0 ||
      (arg68 ||
        (arg3.matrixWorldAutoUpdate && arg3.updateMatrixWorld(),
        arg67.updateWorldMatrix(true, false)),
      fn21(arg8?.()),
      !value9)
    )
      return;
    const value96 = value17
      ? 0
      : value18 === null
        ? 1
        : Math.min(1, (performance.now() - value18) / value20);
    value96 < 1 ? arg16() : (value18 = null);
    for (const value112 of list1) {
      if (!value112.sourceFrame?.equals(value112.source.matrixWorld)) {
        ((value112.sourceFrame = (value112.sourceFrame || new arg1.Matrix4()).copy(
          value112.source.matrixWorld,
        )),
          value112.source.geometry.boundingBox || value112.source.geometry.computeBoundingBox());
        const value113 = value112.source.geometry.boundingBox,
          value114 = value113.getSize(new arg1.Vector3()),
          value115 =
            value114.x <= value114.y && value114.x <= value114.z
              ? "x"
              : value114.y <= value114.z
                ? "y"
                : "z",
          value116 = new arg1.Vector3();
        ((value116[value115] = 1),
          value116
            .applyMatrix3(new arg1.Matrix3().getNormalMatrix(value112.sourceFrame))
            .normalize());
        const value117 = value113.getCenter(new arg1.Vector3());
        ((value117[value115] = value116.y < 0 ? value113.min[value115] : value113.max[value115]),
          value116.y < 0 && value116.negate(),
          (value112.plane = (value112.plane || new arg1.Plane()).setFromNormalAndCoplanarPoint(
            value116,
            value117.applyMatrix4(value112.sourceFrame),
          )),
          (value112.height = new arg1.Box3()
            .copy(value113)
            .applyMatrix4(value112.sourceFrame).max.y),
          (value11 = true));
      }
      ((value112.eligible =
        !fn17(value112.source) &&
        fn22(value112.kind === "outside" ? value112.source.parent : value112.source) &&
        fn23(value112) &&
        value112.plane.distanceToPoint(arg6(arg67, value112.source).position) > 0),
        (value112.overlay.visible = value112.eligible && value112.hasCapture),
        (value112.presentationBaseStrength = object1.strength * value96),
        (value112.overlay.material.uniforms.strength.value =
          value112.presentationBaseStrength * value21));
    }
    if (object1.mode === "off" || !list1.length) return;
    const value97 = performance.now(),
      value98 = arg67.matrixWorld.elements.join(",") + arg67.projectionMatrix.elements.join(","),
      value99 = value98 !== text1,
      value100 = object1.resolution;
    for (const value118 of list1)
      value118.map.width !== value100 &&
        (value118.map.setSize(value100, value100),
        value118.scratch?.setSize(value100, value100),
        (value11 = true));
    const value101 =
        arg7() +
        "|" +
        value14 +
        "|" +
        fn13(map6.get("") || []) +
        "|" +
        (arg9 ? "" : fn13([...map6.values()].flat())),
      value102 = value11 || value99 || value101 !== text2,
      map7 = new Map(
        [...map5.keys()].map((arg69) => [
          arg69,
          arg69 + ":" + (map4.get(arg69) || 0) + ":" + (arg9 ? fn13(map6.get(arg69) || []) : ""),
        ]),
      ),
      map8 = new Map();
    let value103 = list1.filter((arg70) => {
      if (!arg70.eligible) return false;
      const value119 = fn15(arg70, map7);
      return (map8.set(arg70, value119), value102 || arg70.state !== value119);
    });
    if (
      (value26 &&
        (value103 = value103.filter((arg71) => !value26.has(arg71)).slice(0, Math.max(1, arg15))),
      !value103.length)
    )
      return;
    if (!value11 && !value99 && value97 - value12 < 1000 / object1.fps) {
      value22 === null &&
        (value22 = setTimeout(
          () => {
            ((value22 = null), arg16());
          },
          1000 / object1.fps - (value97 - value12),
        ));
      return;
    }
    const object5 = {
        target: arg2.getRenderTarget(),
        cubeFace: arg2.getActiveCubeFace(),
        mipmap: arg2.getActiveMipmapLevel(),
        xr: arg2.xr.enabled,
        shadow: arg2.shadowMap.autoUpdate,
        alpha: arg2.getClearAlpha(),
        color: arg2.getClearColor(new arg1.Color()),
        background: arg3.background,
        viewport: arg2.getViewport(new arg1.Vector4()),
        scissor: arg2.getScissor(new arg1.Vector4()),
        scissorTest: arg2.getScissorTest(),
        autoClear: arg2.autoClear,
        matrixWorldAutoUpdate: arg3.matrixWorldAutoUpdate,
      },
      list4 = [],
      list5 = [],
      list6 = [],
      list7 = [],
      list8 = [],
      value104 = value103.every((arg72) => arg72.kind === "inside");
    let value105 = false,
      value106 = false;
    value1.reset();
    const value107 = performance.now();
    ((object2.inCapture = true), (object2.lastDrawCalls = object2.lastTriangles = 0));
    try {
      const fn30 = (arg73, arg74, arg75) => {
          if (!arg73.visible) return false;
          if (
            (arg73 !== value9 && value24 !== null && arg74 && arg74 !== value24) ||
            arg73.userData.floorTransitionLeaving ||
            arg73.name === "interaction3d-curtain-shadow-refresh" ||
            arg73.userData.reflectionOverlay ||
            ["background", "grid", "outline"].includes(arg73.userData.exportRole) ||
            arg73.userData.regionReceiverKind === "floor" ||
            arg73.userData.environmentEffect ||
            arg73.userData.presenceId != null ||
            (value104 && arg73.userData.reflectionRole === "wall")
          )
            return (list4.push([arg73, arg73.visible]), (arg73.visible = false), false);
          (arg73 !== value9 &&
            arg74 &&
            arg74 !== arg75 &&
            list8.push({
              object: arg73,
              id: arg74,
            }),
            arg73.userData.reflectionRole === "wall" && list7.push(arg73),
            arg12 && value1.add(arg73, !arg9, arg74));
          const value122 = arg10?.get(arg73);
          if (
            (value122 && (list6.push([arg73, arg73.geometry]), (arg73.geometry = value122)),
            arg73.isMesh && arg73.material)
          ) {
            const value123 = arg73.material,
              value124 = fn3(value123);
            value124 !== value123 && (list5.push([arg73, value123]), (arg73.material = value124));
          }
          return true;
        },
        fn31 = (arg76, arg77 = "", arg78 = "") => {
          if (arg76 === value9) {
            for (const value126 of list1)
              value126.overlay.visible &&
                (list4.push([value126.overlay, true]), (value126.overlay.visible = false));
            for (let value127 = 0; value127 < list3.length;) {
              const value128 = list3[value127],
                value129 = list3[value128.parent];
              value128.id = String(fn5(value128.object) || (value129 ? value129.id : arg78));
              const value130 = value129 ? (value129.object === value9 ? "" : value129.id) : arg77;
              value127 = fn30(value128.object, value128.id, value130) ? value127 + 1 : value128.end;
            }
            return;
          }
          const value125 = String(fn5(arg76) || arg78);
          if (fn30(arg76, value125, arg77)) {
            for (const value131 of arg76.children) fn31(value131, value125, value125);
          }
        };
      let value120 = false;
      ((arg3.matrixWorldAutoUpdate = false),
        (arg2.xr.enabled = false),
        (arg2.shadowMap.autoUpdate = false),
        (arg2.autoClear = true),
        (arg3.background = null),
        arg2.setClearColor(0, 0),
        arg2.setScissorTest(false));
      for (const value132 of value103) {
        value132.hasCapture = false;
        const value133 = fn25(arg6(arg67, value132.source), value132.plane, value132.matrix);
        if (
          (object3.groundReflectionPlane.value.set(
            value132.plane.normal.x,
            value132.plane.normal.y,
            value132.plane.normal.z,
            value132.plane.constant,
          ),
          object3.groundReflectionViewToWorld.value.copy(value133.matrixWorld),
          arg12 && !value1.prepare(value132, value133))
        ) {
          ((value132.state = map8.get(value132)),
            (value132.preparedPose = value98),
            (value132.preparedStateKey = value101),
            value26?.add(value132));
          continue;
        }
        value120 || (fn31(arg3), (value120 = true));
        const list9 = [];
        try {
          const value134 = fn14(value132);
          if ((arg12 && value1.apply(value134), value134 !== null)) {
            for (const { object: value135, id: value136 } of list8)
              value135.visible &&
                value136 !== value134 &&
                (list9.push(value135), (value135.visible = false));
          }
          if (value132.kind === "inside") {
            for (const value137 of list7)
              value137.visible && (list9.push(value137), (value137.visible = false));
          }
          if (
            (arg11?.begin(arg3, value133, value100, value134),
            arg5(value133),
            arg2.setRenderTarget(value132.map),
            !fn6(value132, value133))
          ) {
            value105 = true;
            continue;
          }
          (arg2.clear(),
            arg2.render(arg3, value133),
            object2.renders++,
            (object2.lastDrawCalls += arg2.info?.render.calls || 0),
            (object2.lastTriangles += arg2.info?.render.triangles || 0));
        } finally {
          (arg11?.restore(), value1.restore());
          for (const value138 of list9) value138.visible = true;
        }
        if (value132.scratch) {
          for (const [value139, value140, value141, value142] of [
            [value132.map, value132.scratch, 1, 0],
            [value132.scratch, value132.map, 0, 1],
          ])
            ((value35.uniforms.source.value = value139.texture),
              value35.uniforms.step.value.set((value141 * 2) / 512, (value142 * 2) / 512),
              arg2.setRenderTarget(value140),
              arg2.clear(),
              arg2.render(value33, value34));
        }
        (object2.captures++,
          (value132.hasCapture = true),
          (value106 = true),
          (value132.capturedPose = value132.preparedPose = value98),
          (value132.capturedStateKey = value132.preparedStateKey = value101),
          value26?.add(value132),
          (value132.state = map8.get(value132)));
      }
      value17 && value106 && ((value17 = false), (value18 = performance.now()), arg16());
      const value121 = value26 && list1.some((arg79) => arg79.eligible && !value26.has(arg79));
      ((value11 =
        value105 ||
        !!value121 ||
        list1.some(
          (arg80) =>
            arg80.eligible &&
            arg80.hasCapture &&
            (arg80.capturedPose !== value98 || arg80.capturedStateKey !== value101),
        )),
        value121 || (value26 = null),
        value11 && arg16(),
        (value12 = value97),
        (text1 = value98),
        (text2 = value101));
    } finally {
      ((arg3.matrixWorldAutoUpdate = object5.matrixWorldAutoUpdate),
        arg11?.restore(),
        value1.restore(),
        (object2.culling = {
          ...value1.stats,
        }));
      for (const [value143, value144] of list6) value143.geometry = value144;
      for (const [value145, value146] of list4) value145.visible = value146;
      for (const [value147, value148] of list5) value147.material = value148;
      for (const value149 of list1)
        value149.overlay.visible =
          value149.eligible && value149.hasCapture && value149.capturedPose === value98;
      ((arg3.background = object5.background),
        arg2.setClearColor(object5.color, object5.alpha),
        arg2.setViewport(object5.viewport),
        arg2.setScissor(object5.scissor),
        arg2.setScissorTest(object5.scissorTest),
        arg2.setRenderTarget(object5.target, object5.cubeFace, object5.mipmap),
        (arg2.xr.enabled = object5.xr),
        (arg2.shadowMap.autoUpdate = object5.shadow),
        (arg2.autoClear = object5.autoClear),
        arg5(arg67),
        (object2.inCapture = false),
        (object2.lastMs = performance.now() - value107),
        (object2.totalMs += object2.lastMs));
    }
  }
  return {
    settings: object1,
    stats: object2,
    render: fn26,
    configure: fn24,
    setVisibleFloor(arg81) {
      const value150 = arg81 == null ? null : String(arg81);
      if (value150 !== value24) {
        value24 = value150;
        for (const value151 of list1)
          fn16(value151.source) ||
            ((value151.overlay.visible = false), value151.overlay.removeFromParent());
        ((value10 = null), (value11 = true), arg16());
      }
    },
    setOutsideFloor(arg82) {
      const value152 = arg82 == null ? null : String(arg82);
      if (value152 !== value23) {
        value23 = value152;
        for (const value153 of list1)
          value153.kind === "outside" &&
            !fn18(value153.source) &&
            (value153.overlay.visible = false);
        ((value10 = null), (value11 = true), arg16());
      }
    },
    setPresentationGain(arg83) {
      const value154 = Math.min(1, Math.max(0, Number.isFinite(arg83) ? arg83 : 1));
      if (!(value13 || value154 === value21)) {
        value21 = value154;
        for (const value155 of list1)
          value155.overlay.material.uniforms.strength.value =
            (value155.presentationBaseStrength ?? object1.strength) * value154;
        arg16();
      }
    },
    isPrepared: () =>
      value13 ||
      value16 ||
      object1.mode === "off" ||
      object1.strength === 0 ||
      (!value11 &&
        list1.every(
          (arg84) =>
            !arg84.eligible || (arg84.preparedPose === text1 && arg84.preparedStateKey === text2),
        )),
    setSuspended(arg85, { fade: arg86 = false, fadeIn: arg87 = true } = {}) {
      const value156 = arg85 === true;
      if (value16 === value156) {
        if (value156) {
          for (const value157 of list1)
            ((value157.overlay.visible = false), value157.overlay.removeFromParent());
        }
        value156 && !arg86 && (value19 = null);
        return;
      }
      ((value16 = value156),
        (value18 = null),
        (value17 = !value16 && arg87),
        (value26 = !value16 && Number.isFinite(arg15) ? new Set() : null),
        (value19 = value16 && arg86 ? performance.now() : null));
      for (const value158 of list1)
        (value16 &&
          arg86 &&
          ((value158.fadeOutStrength = value158.overlay.visible
            ? value158.overlay.material.uniforms.strength.value
            : 0),
          (value158.fadeOutMatrix = value158.matrix.clone()),
          value158.source.updateWorldMatrix(true, false),
          (value158.fadeOutFrame = value158.source.matrixWorld.clone())),
          (value158.overlay.visible = false),
          value158.overlay.removeFromParent());
      ((value11 = true), value16 || (value10 = null), arg16());
    },
    get records() {
      return list1;
    },
    invalidate() {
      value11 = true;
    },
    invalidateContext() {
      if (!value13) {
        (clearTimeout(value22), (value22 = null));
        for (const value159 of map3.values())
          ((value159.hasCapture = false),
            (value159.state = null),
            (value159.overlay.visible = false),
            (value159.programWork = null));
        ((value26 = !value16 && Number.isFinite(arg15) ? new Set() : null),
          (value19 = null),
          (value11 = true),
          (value12 = -Infinity),
          arg16());
      }
    },
    changed(arg88) {
      if (arg88 == null) value14++;
      else
        for (const value160 of new Set(arg88)) {
          if (!value160 || !map5.has(String(value160))) {
            value14++;
            continue;
          }
          map4.set(String(value160), (map4.get(String(value160)) || 0) + 1);
        }
    },
    dispose() {
      ((value13 = true), (list3 = []), (value28 = null));
      for (const value161 of [...map2.values()]) value161.release();
      (arg11?.dispose(),
        arg10?.dispose(),
        clearTimeout(value22),
        fn20(),
        value36.geometry.dispose(),
        value35.dispose());
      for (const value162 of [...map1.values()]) value162();
      (map4.clear(), map5.clear(), map6.clear());
    },
  };
}
