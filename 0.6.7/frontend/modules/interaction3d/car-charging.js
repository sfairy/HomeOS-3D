import { carState } from "./car-state.js";
export function createCarCharging({ requestFrame: arg1 = () => {} } = {}) {
  let value1,
    value2,
    list1 = [],
    list2 = [],
    value3 = false,
    value4 = false,
    value5 = 1;
  const fn1 = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    fn2 = () => {
      for (const value6 of list2) fn3(value6);
      ((list2 = []), (value3 = false));
    },
    fn3 = (arg2) => {
      arg2.on.value = 0;
      for (const value7 of arg2.parts)
        (value7.mesh.material === value7.replacement && (value7.mesh.material = value7.original),
          value7.materials.forEach((arg3) => arg3.dispose()));
    },
    fn4 = (arg4) => {
      for (let value8 = arg4; value8; value8 = value8.parent) {
        if (value8.visible === false) return false;
        if (value8 === value1) return true;
      }
      return false;
    };
  return {
    setPresentationGain(arg5) {
      const value9 = Number.isFinite(arg5) ? Math.min(1, Math.max(0, arg5)) : 1;
      if (value4 || value9 === value5) return;
      ((value5 = value9), value9 === 0 && (value3 = false));
      let value10 = false;
      for (const value11 of list2) {
        const value12 = value11.charging ? value9 : 0;
        value11.on.value !== value12 && ((value11.on.value = value12), (value10 = true));
      }
      value10 && arg1();
    },
    sync({
      root: arg6,
      revision: arg7,
      retainedRoots: arg8 = [],
      bindings: arg9 = [],
      states: arg10 = {},
    }) {
      if (!value4) {
        if (
          value1 !== arg6 ||
          value2 !== arg7 ||
          list1.length !== arg8.length ||
          list1.some((arg11, arg12) => arg11 !== arg8[arg12])
        ) {
          const set1 = new Set([arg6, ...arg8].filter(Boolean));
          ((list2 = list2.filter((arg13) => {
            for (let value13 = arg13.model; value13; value13 = value13.parent)
              if (set1.has(value13)) return true;
            return (fn3(arg13), false);
          })),
            (value1 = arg6),
            (value2 = arg7),
            (list1 = [...arg8]),
            value1?.traverse((arg14) => {
              if (
                arg14.userData?.environmentModelType !== "smallcar" ||
                list2.some((arg15) => arg15.model === arg14)
              )
                return;
              const object1 = {
                model: arg14,
                parts: [],
                on: {
                  value: 0,
                },
                time: {
                  value: 0,
                },
              };
              (arg14.traverse((arg16) => {
                if (!arg16.isMesh || !arg16.material) return;
                const value14 = arg16.material,
                  list3 = [],
                  value15 = !!arg16.geometry?.getAttribute("hbVehicleLength"),
                  fn5 = (arg17) => {
                    if (!arg17.isMeshStandardMaterial) return arg17;
                    const value17 = arg17.clone(),
                      value18 = arg17.onBeforeCompile,
                      value19 = arg17.customProgramCacheKey?.call(arg17) || "";
                    return (
                      Object.defineProperty(value17, "runtimeSourceMaterial", {
                        value: arg17,
                        configurable: true,
                      }),
                      (value17.onBeforeCompile = function (arg18, arg19) {
                        (value18?.call(this, arg18, arg19),
                          (arg18.uniforms.hbChargeOn = object1.on),
                          (arg18.uniforms.hbChargeTime = object1.time),
                          (arg18.vertexShader =
                            (value15 ? "attribute float hbVehicleLength;\n" : "") +
                            "varying float hbChargeLength;\n" +
                            arg18.vertexShader),
                          (arg18.vertexShader = arg18.vertexShader.replace(
                            "#include <begin_vertex>",
                            "#include <begin_vertex>\nhbChargeLength = " +
                              (value15 ? "hbVehicleLength" : "-position.y") +
                              ";",
                          )),
                          (arg18.fragmentShader =
                            "varying float hbChargeLength;\nuniform float hbChargeOn;\nuniform float hbChargeTime;\n" +
                            arg18.fragmentShader),
                          (arg18.fragmentShader = arg18.fragmentShader.replace(
                            "#include <opaque_fragment>",
                            "\n                  float hbPhase = fract(hbChargeTime * .36);\n                  float hbBehind = mix(-3.4, 4.1, hbPhase) - hbChargeLength;\n                  float hbFlow = exp(-max(hbBehind, 0.0) * 1.9)\n                    * (1.0 - smoothstep(0.0, .20, -hbBehind)) * (1.0 - smoothstep(.90, 1.0, hbPhase));\n                  float hbRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);\n                  outgoingLight += vec3(.12, 1.2, .69) * hbRim * hbFlow * hbChargeOn * 3.2;\n                  #include <opaque_fragment>",
                          )));
                      }),
                      (value17.customProgramCacheKey = () =>
                        value19 + "|hb-car-charge-surface-v2:" + Number(value15)),
                      list3.push(value17),
                      value17
                    );
                  },
                  value16 = Array.isArray(value14) ? value14.map(fn5) : fn5(value14);
                ((arg16.material = value16),
                  object1.parts.push({
                    mesh: arg16,
                    original: value14,
                    replacement: value16,
                    materials: list3,
                  }));
              }),
                list2.push(object1));
            }));
        }
        for (const value20 of list2) {
          const value21 = arg9.find(
            (arg20) =>
              arg20.floorId === value20.model.userData.environmentFloorId &&
              arg20.modelId === value20.model.userData.environmentModelId,
          );
          value20.charging = !!(
            value21 &&
            value21.visible !== false &&
            carState(value21, arg10).charging === true
          );
          const value22 = value20.charging ? value5 : 0;
          value20.on.value !== value22 && ((value20.on.value = value22), arg1());
        }
      }
    },
    tick(arg21) {
      value3 = false;
      for (const value23 of list2)
        value23.on.value &&
          fn4(value23.model) &&
          ((value23.time.value = fn1() ? 1.4 : arg21 / 1000), (value3 ||= !fn1()));
      return (value3 && arg1(), value3);
    },
    nextDelay() {
      return value3 ? 1000 / 30 : Infinity;
    },
    dispose() {
      value4 || ((value4 = true), fn2(), (value1 = null), (list1 = []));
    },
  };
}
