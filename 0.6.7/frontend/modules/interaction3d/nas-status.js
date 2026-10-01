export function nasState(arg1, arg2) {
  const value1 = arg2?.newState || arg2 || {},
    value2 = String(value1.state || "")
      .trim()
      .toLowerCase(),
    value3 =
      /^(binary_sensor|switch|input_boolean)\.[a-z0-9_]+$/.test(arg1 || "") &&
      value1.available !== false &&
      ["on", "off"].includes(value2);
  return {
    available: value3,
    on: value3 && value2 === "on",
    name: value1.attributes?.friendly_name || arg1 || "NAS",
  };
}
export function nasDeviceState(arg3, arg4 = {}) {
  const fn1 = (arg5) => (arg4 instanceof Map ? arg4.get(arg5) : arg4[arg5]);
  if (arg3.entityId) return nasState(arg3.entityId, fn1(arg3.entityId));
  const value4 = [
    ...new Set([
      arg3.statusSource?.primaryEntityId,
      ...(arg3.statusSource?.metrics || []).map((arg6) => arg6.entityId),
    ]),
  ].some((arg7) => {
    const value5 = fn1(arg7)?.newState || fn1(arg7);
    return (
      !!arg7 &&
      value5?.available !== false &&
      value5?.state != null &&
      !["", "unknown", "unavailable", "none"].includes(String(value5.state).trim().toLowerCase())
    );
  });
  return {
    available: value4,
    on: value4,
    name: arg3.statusSource?.name || "NAS",
  };
}
export function createNasStatus({
  THREE: arg8,
  requestFrame: arg9 = () => {},
  modelType: arg10 = "nas",
  readState: arg11 = nasDeviceState,
}) {
  const map1 = new Map(),
    value6 = new arg8.PlaneGeometry(1, 1);
  let value7,
    value8,
    value9,
    value10 = false,
    value11 = false,
    value12 = -Infinity;
  const fn2 = () => value13?.matches === true,
    fn3 = (arg12) => {
      for (let value14 = arg12; value14; value14 = value14.parent) {
        if (value14.visible === false) return false;
        if (value14 === value7) return true;
      }
      return false;
    },
    fn4 = () => {
      if (value11) {
        for (const value15 of map1.values())
          if (value15.breathing && fn3(value15.mesh)) return true;
      }
      return false;
    },
    value13 =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ??
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    fn5 = () => {
      !value10 && fn4() && arg9();
    };
  value13?.addEventListener?.("change", fn5);
  const fn6 = (arg13, arg14) => JSON.stringify([arg13 || "", arg14 || ""]);
  function fn7(arg15) {
    for (const [value16, value17] of arg15.indicators) value16.visible = value17;
    (arg15.mesh.removeFromParent(), arg15.mesh.material.dispose());
  }
  function fn8(arg16) {
    const value18 = new arg8.Box3();
    function fn12(arg17, arg18) {
      if (
        !arg17.userData?.environmentEffect &&
        !(arg17 !== arg16 && arg17.userData?.environmentModelId != null)
      ) {
        arg17.isMesh &&
          arg17.geometry &&
          (arg17.geometry.boundingBox || arg17.geometry.computeBoundingBox(),
          arg17.geometry.boundingBox &&
            value18.union(arg17.geometry.boundingBox.clone().applyMatrix4(arg18)));
        for (const value19 of arg17.children || [])
          (value19.matrixAutoUpdate && value19.updateMatrix(),
            fn12(value19, new arg8.Matrix4().multiplyMatrices(arg18, value19.matrix)));
      }
    }
    return (fn12(arg16, new arg8.Matrix4()), value18);
  }
  function fn9(arg19) {
    let value20 = null;
    function fn13(arg20, arg21) {
      if (
        value20 ||
        arg20.userData?.environmentEffect ||
        (arg20 !== arg19 && arg20.userData?.environmentModelId != null)
      )
        return;
      const value21 = arg20.userData?.nasStatusAnchor;
      if (Array.isArray(value21) && value21.length === 3 && value21.every(Number.isFinite)) {
        value20 = new arg8.Vector3().fromArray(value21).applyMatrix4(arg21);
        return;
      }
      for (const value22 of arg20.children || [])
        (value22.matrixAutoUpdate && value22.updateMatrix(),
          fn13(value22, new arg8.Matrix4().multiplyMatrices(arg21, value22.matrix)));
    }
    return (fn13(arg19, new arg8.Matrix4()), value20);
  }
  function fn10({
    root: arg22,
    revision: arg23,
    bindings: arg24 = [],
    states: arg25 = {},
    enabled: arg26 = false,
    sizeScale: arg27 = 1,
    brightness: arg28 = 1,
  }) {
    if (value10) return;
    const value23 = JSON.stringify(arg24.map((arg29) => [arg29.id, arg29.floorId, arg29.modelId]));
    if (value7 !== arg22 || value8 !== arg23 || value9 !== value23) {
      ((value7 = arg22), (value8 = arg23), (value9 = value23));
      const map2 = new Map();
      value7?.traverse((arg30) => {
        if (arg30.userData?.environmentModelType !== arg10) return;
        let value25 = arg30.userData.environmentFloorId;
        for (let value26 = arg30.parent; value25 == null && value26; value26 = value26.parent)
          value25 = value26.userData.environmentFloorId;
        map2.set(fn6(value25, arg30.userData.environmentModelId), arg30);
      });
      const set1 = new Set();
      for (const value27 of arg24) {
        const value28 = map2.get(fn6(value27.floorId, value27.modelId));
        if (!value28) continue;
        set1.add(value27.id);
        let value29 = map1.get(value27.id);
        if (value29?.model !== value28) {
          value29 && fn7(value29);
          const value30 = fn8(value28);
          if (value30.isEmpty()) {
            map1.delete(value27.id);
            continue;
          }
          const value31 = value30.getSize(new arg8.Vector3()),
            value32 = value30.getCenter(new arg8.Vector3()),
            value33 = new arg8.ShaderMaterial({
              transparent: true,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
              uniforms: {
                indicatorColor: {
                  value: new arg8.Color("#0fff33"),
                },
                customColor: {
                  value: arg10 !== "nas" ? 1 : 0,
                },
                pulse: {
                  value: 1,
                },
                viewportHeight: {
                  value: 900,
                },
                sizeScale: {
                  value: 1,
                },
                brightness: {
                  value: 1,
                },
              },
              vertexShader:
                "varying vec2 ledUv; uniform float viewportHeight; uniform float sizeScale; void main(){ledUv=uv;vec4 center=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);vec4 clip=projectionMatrix*center;float physicalSize=length(modelMatrix[0].xyz);float minimumSize=24.0*clip.w/(max(viewportHeight,1.0)*projectionMatrix[1][1]);center.xy+=position.xy*max(physicalSize,minimumSize)*sizeScale;gl_Position=projectionMatrix*center;}",
              fragmentShader:
                "varying vec2 ledUv; uniform float pulse; uniform float brightness; uniform vec3 indicatorColor; uniform float customColor; void main(){float r=length(ledUv-0.5)*2.0;float core=1.0-smoothstep(0.28,0.50,r);float halo=pow(max(0.0,1.0-r),1.7)*0.8;float a=min((core+halo)*pulse,1.0)*brightness;if(a<0.005)discard;gl_FragColor=vec4(mix(vec3(0.06,1.0,0.20),vec3(0.48,1.0,0.60),core)*(1.0-customColor)+indicatorColor*customColor,a);}",
            }),
            value34 = new arg8.Mesh(value6, value33);
          ((value34.name = "nas-status-" + value27.id),
            Object.assign(value34.userData, {
              environmentEffect: true,
              nasStatus: true,
              externalModelSharedGeometry: true,
              externalModelSharedMaterial: true,
            }),
            (value34.raycast = () => {}),
            (value34.renderOrder = 100));
          const value35 = new arg8.Vector2();
          value34.onBeforeRender = (arg31) => {
            value33.uniforms.viewportHeight.value = arg31.getSize(value35).y;
          };
          const value36 = Math.max(0.025, Math.min(0.075, value31.x * 0.22));
          (value34.scale.set(value36, value36, value36),
            value34.position.set(
              value32.x + value31.x * 0.36,
              value30.min.y + value31.y * 0.26,
              value30.max.z + 0.003,
            ),
            (arg10 === "storagewaterheater" || arg10 === "gaswaterheater") &&
              value34.position.set(
                value32.x,
                value30.min.y + value31.y * (arg10 === "gaswaterheater" ? 0.67 : 0.53),
                value30.max.z + 0.003,
              ));
          const value37 = arg10 === "nas" ? fn9(value28) : null;
          value37 && value34.position.copy(value37);
          const map3 = new Map();
          (value28.traverse((arg32) => {
            if (!arg32.isMesh || arg32 === value34 || arg32.userData?.environmentEffect) return;
            const value38 = Array.isArray(arg32.material) ? arg32.material : [arg32.material];
            (arg32.userData?.nasIndicator ||
              value38.some((arg33) => /^nas-material-4(?:$|\s)/.test(arg33?.name || ""))) &&
              (map3.set(arg32, arg32.visible), (arg32.visible = false));
          }),
            value28.add(value34),
            (value29 = {
              model: value28,
              mesh: value34,
              indicators: map3,
            }),
            map1.set(value27.id, value29));
        }
      }
      for (const [value39, value40] of map1)
        set1.has(value39) || (fn7(value40), map1.delete(value39));
    }
    value11 = false;
    let value24 = false;
    for (const value41 of arg24) {
      const value42 = map1.get(value41.id);
      if (!value42) continue;
      const value43 = value42.mesh.material.uniforms;
      ((value24 ||= value43.sizeScale.value !== arg27 || value43.brightness.value !== arg28),
        (value43.sizeScale.value = arg27),
        (value43.brightness.value = arg28));
      const value44 = arg11(value41, arg25);
      value44.color &&
        ((value24 ||= value42.color !== value44.color),
        (value42.color = value44.color),
        value43.indicatorColor.value.set(value44.color));
      const value45 = arg10 !== "nas" && value44.color !== "#43ce82" ? 1 : 0;
      ((value24 ||= value43.customColor.value !== value45), (value43.customColor.value = value45));
      const value46 =
        arg26 && (arg10 === "nas" ? value44.on : value44.visible && value44.status !== "off");
      ((value24 ||= value42.mesh.visible !== value46),
        (value42.mesh.visible = value46),
        (value42.breathing =
          value46 &&
          (arg10 === "nas" || value44.status === "normal" || value44.status === "warning")),
        value42.breathing
          ? (value11 = true)
          : ((value24 ||= value43.pulse.value !== 1), (value43.pulse.value = 1)));
    }
    (value24 || value11) && arg9();
  }
  function fn11(arg34) {
    if (value10 || !fn4()) return ((value12 = -Infinity), false);
    const value47 = fn2();
    if (!value47 && arg34 - value12 < 1000 / 30) return true;
    value12 = arg34;
    const value48 = value47
      ? 1
      : 0.14 + 0.86 * (0.5 - 0.5 * Math.cos((arg34 / 1400) * Math.PI * 2));
    let value49 = false;
    for (const value50 of map1.values())
      value50.breathing &&
        fn3(value50.mesh) &&
        ((value49 ||= value50.mesh.material.uniforms.pulse.value !== value48),
        (value50.mesh.material.uniforms.pulse.value = value48));
    return (value49 && arg9(), !value47);
  }
  return {
    sync: fn10,
    tick: fn11,
    nextDelay: () => (!value10 && fn4() && !fn2() ? 1000 / 30 : Infinity),
    dispose() {
      if (!value10) {
        ((value10 = true), value13?.removeEventListener?.("change", fn5));
        for (const value51 of map1.values()) fn7(value51);
        (map1.clear(), value6.dispose());
      }
    },
  };
}
