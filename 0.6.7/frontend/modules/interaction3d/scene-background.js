import { createBackgroundTheme } from "./background-theme.js?v=20260927-background-uniform-reuse-v1";
export function backgroundFloorAnchor(arg1, arg2 = new WeakMap(), arg3 = arg1.backgroundFloor) {
  const value1 = arg1.document?.floors || [],
    value2 =
      arg3 === "all"
        ? value1.reduce(
            (arg4, arg5) => (!arg4 || arg5.elevation < arg4.elevation ? arg5 : arg4),
            null,
          )
        : value1.find((arg6) => arg6.id === arg3) || value1[0];
  if (!value2) return null;
  let value3 = arg2.get(value2.scene);
  if (!value3) {
    let value4 = Infinity,
      value5 = Infinity,
      value6 = -Infinity,
      value7 = -Infinity;
    for (const value8 of value2.scene.walls || [])
      for (const value9 of [value8.start, value8.end])
        ((value4 = Math.min(value4, value9.x)),
          (value5 = Math.min(value5, value9.y)),
          (value6 = Math.max(value6, value9.x)),
          (value7 = Math.max(value7, value9.y)));
    if (!Number.isFinite(value4))
      for (const value10 of value2.scene.items || []) {
        if (!["courtyard-area", "courtyard-path", "courtyard-fence"].includes(value10.type))
          continue;
        const value11 = value2.scene.calibration?.pixelsPerMeter || 100,
          value12 = ((value10.rotation || 0) * Math.PI) / 180,
          value13 = Math.cos(value12),
          value14 = Math.sin(value12);
        for (const value15 of value10.drawing?.points || []) {
          const value16 =
              value10.x +
              (value15.x * value10.width * value13 - value15.y * value10.depth * value14) * value11,
            value17 =
              value10.y +
              (value15.x * value10.width * value14 + value15.y * value10.depth * value13) * value11;
          !Number.isFinite(value16) ||
            !Number.isFinite(value17) ||
            ((value4 = Math.min(value4, value16)),
            (value5 = Math.min(value5, value17)),
            (value6 = Math.max(value6, value16)),
            (value7 = Math.max(value7, value17)));
        }
      }
    ((value3 = Number.isFinite(value4) ? [(value4 + value6) / 2, (value5 + value7) / 2] : [0, 0]),
      arg2.set(value2.scene, value3));
  }
  return arg1.presentationPoint(value2.id, ...value3, -0.203);
}
const B =
  "\nfloat warmMotes(vec2 p, float size, float threshold, float time) {\n vec2 cell=floor(p), f=fract(p);\n float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);\n float seed2=fract(sin(dot(cell,vec2(269.5,183.3)))*43758.5453);\n vec2 center=vec2(seed,seed2)*0.56+0.22;\n center+=vec2(sin(time*0.19+seed*6.28),cos(time*0.16+seed2*6.28))*0.065;\n float d=length(f-center), aa=max(length(fwidth(p)),0.0001);\n float radius=size*mix(.6,1.35,seed2);\n float core=(1.0-smoothstep(radius,radius+aa,d))*min(1.0,radius/aa);\n float halo=exp(-d*d/(radius*radius*18.0))*.11;\n return (core+halo)*step(threshold,seed)*(.66+.34*sin(time*.45+seed2*6.28));\n}";
export function createSceneBackground(arg7, arg8 = () => {}) {
  const value18 = createBackgroundTheme(arg7, arg8),
    { THREE: value19 } = arg7,
    weakMap1 = new WeakMap(),
    value20 = new value19.Vector3(),
    value21 = new value19.Vector3(),
    object1 = {
      warmAspect: {
        value: 1,
      },
      warmScale: {
        value: 1,
      },
      warmShift: {
        value: new value19.Vector2(),
      },
      warmAnchor: {
        value: new value19.Vector2(),
      },
      warmTime: {
        value: 0,
      },
      warmOverview: {
        value: 0,
      },
      warmFlow: {
        value: new value19.Vector2(),
      },
      warmDeep: {
        value: new value19.Color("#d9d6cc"),
      },
      warmInk: {
        value: new value19.Color("#fff6dd"),
      },
      warmAccent: {
        value: new value19.Color("#b59b72"),
      },
    };
  let value22 = null,
    value23 = false,
    value24 = false,
    value25 = true,
    value26 = true,
    value27 = false,
    value28 = false,
    list1 = [],
    value29 = null,
    value30 = -Infinity,
    value31 = null;
  const value32 =
    globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  function fn1() {
    if (value22) return;
    const value33 = new value19.MeshBasicMaterial({
      color: 15658212,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    ((value33.onBeforeCompile = (arg9) => {
      (Object.assign(arg9.uniforms, object1),
        (arg9.vertexShader = arg9.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\n        varying vec2 warmPoint; uniform float warmAspect; uniform float warmScale; uniform vec2 warmShift;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n          warmPoint=vec2(position.x*max(warmAspect,.5),-position.y)*12.0*warmScale+warmShift;",
          )
          .replace("#include <project_vertex>", "gl_Position=vec4(position.xy,0.9999,1.0);")),
        (arg9.fragmentShader = arg9.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\n        varying vec2 warmPoint; uniform vec2 warmAnchor; uniform float warmTime; uniform float warmOverview;\n        uniform vec2 warmFlow; uniform vec3 warmDeep; uniform vec3 warmInk; uniform vec3 warmAccent;\n        " +
              B,
          )
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\n          vec2 bgUV=warmPoint/6.0;\n          float fade=1.0-smoothstep(2.2,4.2,length(bgUV));\n          vec2 drift=vec2(warmTime*.009,-warmTime*.006);\n          vec2 flow=warmFlow*.11;\n          vec2 uv=bgUV/mix(1.0,1.22,warmOverview);\n          float nearDust=warmMotes(uv/.22+drift+flow,.021,.68,warmTime);\n          float farDust=warmMotes(uv/.095-drift*.42+flow*.32,.016,.80,warmTime+7.0);\n          vec2 wash=(warmPoint-warmAnchor)/6.0*vec2(.68,1.12);\n          float sunlight=exp(-dot(wash,wash)*.72);\n          float washStrength=1.0-smoothstep(.25,.85,warmOverview);\n          vec3 base=mix(warmDeep,vec3(.94,.914,.858),.42+sunlight*.18*washStrength);\n          float dust=(nearDust*.74+farDust*.26)*fade;\n          base=mix(base,warmAccent,min(.18,dust*.12));\n          base+=vec3(1.0,.93,.77)*(nearDust*.38+farDust*.15)*fade;\n          diffuseColor.rgb=(base+warmInk*sunlight*.008)*.88;",
          )));
    }),
      (value33.customProgramCacheKey = () => "warm-wood-backdrop-v9-flat-stars"),
      (value22 = new value19.Mesh(new value19.PlaneGeometry(2, 2), value33)),
      (value22.name = "warm-wood-background"),
      (value22.renderOrder = -10000),
      (value22.frustumCulled = false),
      (value22.userData.environmentEffect = true),
      arg7.overlayScene?.add(value22));
  }
  function fn2() {
    ((value29 = null),
      (value31 = null),
      value27 && ((value27 = false), arg7.backgroundFrame?.(false)));
  }
  function fn3() {
    if (
      (value18.sync(value23 ? [] : list1, value25),
      value22 && (value22.visible = value23 && value25),
      value23)
    ) {
      for (const value34 of list1)
        ((value34.userData.backgroundThemeHidden = true), (value34.visible = false));
    } else {
      for (const value35 of list1)
        value35.userData.exportRole !== "grid" && (value35.userData.backgroundThemeHidden = false);
    }
  }
  return {
    get theme() {
      return value23 ? (value24 ? "warm-dusk" : "warm-sunlight") : value18.theme;
    },
    get active() {
      return value23 ? value27 : value18.active;
    },
    get cacheBackground() {
      return value23 && value25 ? value22 : null;
    },
    configure(arg10, arg11 = {}) {
      const value36 = arg11.sceneStyle === "warm-wood",
        value37 = value36 && (arg11.warmBackgroundTheme || arg11.backgroundTheme) === "warm-dusk",
        value38 =
          value36 !== value23 ||
          value37 !== value24 ||
          value26 !== (arg11.backgroundMotion !== false);
      return (
        value38 && fn2(),
        (value23 = value36),
        (value24 = value37),
        (value26 = arg11.backgroundMotion !== false),
        object1.warmDeep.value.set(value24 ? "#746c67" : "#d9d6cc"),
        object1.warmInk.value.set(value24 ? "#f4dfb6" : "#fff6dd"),
        object1.warmAccent.value.set(value24 ? "#9c765a" : "#b59b72"),
        value18.configure(arg10),
        value23 && (value18.suspend(), fn1()),
        fn3(),
        value38 && arg8(),
        value38
      );
    },
    sync(arg12, arg13) {
      ((list1 = arg12), (value25 = arg13 !== false), value25 || fn2(), fn3());
    },
    interact(arg14, arg15) {
      value23 ? value25 && arg8() : value18.interact(arg14, arg15);
    },
    tick(arg16) {
      if (value28) return Infinity;
      if (!value23) return value18.tick(arg16);
      if (!value25 || globalThis.document?.hidden) return (fn2(), Infinity);
      const value39 = arg7.camera;
      (value39.updateMatrixWorld(), value39.getWorldDirection(value21));
      const value40 =
          value39.aspect || (value39.right - value39.left) / (value39.top - value39.bottom) || 1,
        value41 = Math.max(0.5, Math.min(2.5, value40));
      ((object1.warmAspect.value = value41),
        object1.warmShift.value.set(value21.x * 0.85, value21.z * 0.7 + value21.y * 0.25));
      const value42 = value39.position.distanceTo(arg7.controls?.target || new value19.Vector3()),
        value43 = 1 + Math.tanh(Math.log(Math.max(value42, 1) / 35)) * 0.12;
      object1.warmScale.value = value43;
      const value44 = backgroundFloorAnchor(arg7, weakMap1),
        value45 = arg7.backgroundFloorTransition;
      if (value44 && value45 && value45.from !== arg7.backgroundFloor) {
        const value48 = backgroundFloorAnchor(arg7, weakMap1, value45.from);
        value48 && value44.lerpVectors(value48, value44.clone(), value45.amount);
      }
      value44 &&
        (value20.copy(value44).project(value39),
        object1.warmAnchor.value
          .set(value20.x * value41 * 12 * value43, -value20.y * 12 * value43)
          .add(object1.warmShift.value));
      const value46 = value29 === null ? 0 : Math.min(0.06, Math.max(0, (arg16 - value29) / 1000));
      value29 = arg16;
      const value47 = arg7.backgroundFloor === "all" ? 1 : 0;
      return (
        (object1.warmOverview.value +=
          (value47 - object1.warmOverview.value) * (1 - Math.exp(-value46 * 4))),
        !value26 || value32
          ? (fn2(), Infinity)
          : ((object1.warmTime.value += value46),
            object1.warmFlow.value.multiplyScalar(Math.exp(-value46 * 2.4)),
            value31 &&
              ((object1.warmFlow.value.x += Math.max(
                -0.08,
                Math.min(0.08, (value39.position.x - value31.x) * 0.04),
              )),
              (object1.warmFlow.value.y += Math.max(
                -0.08,
                Math.min(0.08, (value39.position.z - value31.z) * 0.04),
              ))),
            value31 ? value31.copy(value39.position) : (value31 = value39.position.clone()),
            arg16 - value30 >= 50 &&
              ((value27 = true),
              arg7.backgroundFrame?.(true, {
                separate: true,
              }),
              (value30 = arg16)),
            Math.max(0, 50 - (arg16 - value30)))
      );
    },
    suspend() {
      (value18.suspend(), fn2());
    },
    dispose() {
      ((value28 = true), fn2(), value18.dispose());
      for (const value49 of list1) delete value49.userData.backgroundThemeHidden;
      value22 &&
        (value22.removeFromParent(), value22.geometry.dispose(), value22.material.dispose());
    },
  };
}
