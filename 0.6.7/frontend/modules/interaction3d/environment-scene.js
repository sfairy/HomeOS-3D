import { bathHeaterState as bathHeaterState2 } from "./bath-heater.js";
import { createEnvironmentHalos as createEnvironmentHalos2 } from "./environment-halos.js?v=20260925-heater-outline-v1-20260926-fan-v1-model-emphasis-v1-airer-no-halo-v1";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
} from "./device-profiles.js";
export function pageDimming(arg1, arg2, v1 = false) {
  const v2 =
    {
      "water-heater": "devices",
      airer: "devices",
      fan: "environment",
      purifier: "environment",
      climate: "environment",
      cover: "environment",
      "temperature-humidity": "environment",
      nas: "devices",
      speaker: "devices",
      television: "devices",
      "vacuum-shortcut": "vacuum",
      ...Object.fromEntries(GENERIC_DEVICE_KINDS2.map((arg3) => [arg3, "devices"])),
    }[arg2] || arg2;
  if (!["overview", "light", "environment", "devices", "vacuum", "security"].includes(v2))
    return {
      page: v2,
      strength: 0,
      enabled: false,
    };
  const v3 = (arg4, arg5) => (Number.isFinite(arg4) ? Math.max(0, Math.min(100, arg4)) : arg5),
    v4 = v3(
      arg1.pageDimStrength?.[v2],
      v2 === "overview" ? 0 : v3(arg1.environment?.dimStrength, 70),
    ),
    v5 = v3(arg1.pageSaturation?.[v2], v2 === "overview" ? 100 : 75);
  return {
    page: v2,
    saturation: v5,
    enabled: v2 !== "overview" || v4 > 0 || v5 < 100,
    strength: Math.min(100, v4 + (v1 && v2 !== "overview" ? v3(arg1.focusDimStrength, 15) : 0)),
  };
}
const Pe = {
    entry: "security",
    door: "security",
    storagewaterheater: "devices",
    gaswaterheater: "devices",
    airer: "devices",
    fan: "environment",
    airpurifier: "environment",
    wallac: "environment",
    floorac: "environment",
    airoutlet: "environment",
    curtain: "environment",
    nas: "devices",
    speaker: "devices",
    tv: "devices",
    robotvacuum: "vacuum",
    camera: "security",
    presence: "security",
    ...Object.fromEntries(
      GENERIC_DEVICE_KINDS2.flatMap((arg6) =>
        (genericDeviceProfile2(arg6).modelTypes || [genericDeviceProfile2(arg6).modelType]).map(
          (arg7) => [arg7, "devices"],
        ),
      ),
    ),
  },
  Se = {
    entry: "lock",
    door: "lock",
    storagewaterheater: "climate",
    gaswaterheater: "climate",
    airer: "cover",
    fan: "climate",
    airpurifier: "climate",
    wallac: "climate",
    floorac: "climate",
    airoutlet: "climate",
    curtain: "cover",
    nas: "nas",
    speaker: "speaker",
    tv: "television",
    robotvacuum: "vacuum",
    camera: "camera",
    presence: "presence",
    ...Object.fromEntries(
      GENERIC_DEVICE_KINDS2.flatMap((arg8) =>
        (genericDeviceProfile2(arg8).modelTypes || [genericDeviceProfile2(arg8).modelType]).map(
          (arg9) => [arg9, arg8],
        ),
      ),
    ),
  };
function je(arg10, arg11) {
  if (!arg11) return false;
  const v6 = Se[arg10];
  return GENERIC_DEVICE_KINDS2.includes(v6)
    ? !!arg11.deviceId
    : v6 === "lock"
      ? [
          "doorEntityId",
          "batteryEntityId",
          "entityId",
          "doorEventEntityId",
          "doorOpenEntityId",
          "doorCloseEntityId",
        ].some((arg12) => arg11[arg12])
      : v6 === "nas"
        ? !!(arg11.entityId || arg11.statusSource?.deviceId)
        : v6 === "television"
          ? !!(arg11.entityId || arg11.powerEntityId)
          : (["airpurifier", "storagewaterheater", "gaswaterheater"].includes(arg10) ||
                (["wallac", "floorac", "airoutlet"].includes(arg10) &&
                  arg11.climateType === "bath-heater")) &&
              arg11.deviceId
            ? true
            : !!arg11.entityId;
}
export function pageModelBindings(arg13, arg14, arg15, arg16) {
  const map = new Map(
    arg14.map((arg17) => [JSON.stringify([arg17.floorId, arg17.modelId]), arg17]),
  );
  return arg13
    .filter((arg18) => arg16 === "all" || arg18.id === arg16)
    .flatMap((arg19) =>
      [
        ...(arg19.scene?.items || []),
        ...(arg19.scene?.doors || []).map((arg20) => ({
          ...arg20,
          id: "door:" + arg20.id,
          type: "door",
        })),
      ].flatMap((arg21) => {
        const v7 = Pe[arg21.type];
        if (!v7 || (arg15 !== "overview" && v7 !== arg15)) return [];
        const stringify = JSON.stringify([arg19.id, arg21.id]),
          v8 = map.get(stringify);
        return je(arg21.type, v8)
          ? [
              {
                ...v8,
                id: v8?.id || "presentation:" + stringify,
                floorId: arg19.id,
                modelId: arg21.id,
                deviceKind: Se[arg21.type],
                modelType: arg21.type,
                modelAvailable: true,
                visible: true,
                previewOnly: !v8,
              },
            ]
          : [];
      }),
    );
}
export function createEnvironmentScene({
  THREE: v9,
  requestFrame: v10 = () => {},
  prepareMaterials: v11 = () => {},
}) {
  const options = {
      value: 0,
    },
    options2 = {
      value: 0,
    },
    options3 = {
      value: 0.75,
    },
    map2 = new Map(),
    map3 = new Map(),
    set = new Set(),
    set2 = new Set(),
    map4 = new Map(),
    map5 = new Map(),
    set3 = new Set(),
    set4 = new Set(),
    v12 = () =>
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    v13 = createEnvironmentHalos2({
      THREE: v9,
      modeAmount: options2,
    }),
    options4 = {
      cool: new v9.Color("#c8e2eb"),
      heat: new v9.Color("#efd1ae"),
      other: new v9.Color("#eee9df"),
      selected: new v9.Color("#ffe1aa"),
    };
  let value = null,
    v14,
    list = [],
    v15 = false,
    v16 = false,
    v17 = false,
    list2 = [],
    text = "[]",
    options5 = {},
    text2 = "",
    text3 = "";
  const map6 = new Map(),
    v18 = () => [...list2, ...map6.values()];
  let num = 0,
    num2 = 0,
    num3 = 0,
    num4 = 0,
    value2 = null,
    v19 = false,
    num5 = 0.7;
  const v20 = (arg22, arg23) => JSON.stringify([String(arg22 ?? ""), String(arg23 ?? "")]),
    v21 = (arg24) => JSON.stringify([String(arg24.id ?? ""), arg24.floorId, arg24.modelId]),
    v22 = (arg25) => (Array.isArray(arg25) ? arg25 : arg25 ? [arg25] : []),
    v23 = (arg26) =>
      arg26?.isMaterial &&
      !arg26.isShaderMaterial &&
      (arg26.isMeshStandardMaterial ||
        arg26.isMeshPhysicalMaterial ||
        arg26.isMeshBasicMaterial ||
        arg26.isMeshLambertMaterial ||
        arg26.isMeshPhongMaterial ||
        arg26.isMeshToonMaterial),
    v24 = () => ({
      amount: options,
      retain: {
        value: 0,
      },
      glow: {
        value: new v9.Color(0, 0, 0),
      },
      lift: {
        value: new v9.Vector2(0.12, 0.8),
      },
    }),
    v25 = v24();
  function fn1(arg27, arg28, v26 = null) {
    if (!v23(arg27) || map2.has(arg27)) return;
    const onBeforeCompile = arg27.onBeforeCompile,
      customProgramCacheKey = arg27.customProgramCacheKey,
      own = Object.hasOwn(arg27, "onBeforeCompile"),
      own2 = Object.hasOwn(arg27, "customProgramCacheKey"),
      value3 = v26 ? map2.get(v26) : null,
      v27 = value3?.priorCompile || onBeforeCompile,
      v28 = value3?.priorKey || customProgramCacheKey,
      v29 = v26 || arg27,
      v30 = function (arg29, arg30) {
        v27?.call(this, arg29, arg30);
        const text4 = "#include <opaque_fragment>";
        if (
          !arg29.fragmentShader.includes(text4) ||
          ((arg29.uniforms.hbEnvironmentAmount = arg28.amount),
          (arg29.uniforms.hbEnvironmentMode = options2),
          (arg29.uniforms.hbEnvironmentSaturation = options3),
          (arg29.uniforms.hbEnvironmentRetain = arg28.retain),
          (arg29.uniforms.hbEnvironmentGlow = arg28.glow),
          (arg29.uniforms.hbEnvironmentLift = arg28.lift),
          arg29.fragmentShader.includes("uniform float hbEnvironmentAmount;"))
        )
          return;
        arg29.fragmentShader =
          "uniform float hbEnvironmentAmount;\nuniform float hbEnvironmentMode;\nuniform float hbEnvironmentSaturation;\nuniform float hbEnvironmentRetain;\nuniform vec3 hbEnvironmentGlow;\nuniform vec2 hbEnvironmentLift;\n" +
          arg29.fragmentShader.replace(
            text4,
            "float hbEnvironmentLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\noutgoingLight = mix(outgoingLight, vec3(hbEnvironmentLuma) * vec3(1.005, 1.0, 0.99), hbEnvironmentMode * (1.0 - hbEnvironmentRetain) * (1.0 - hbEnvironmentSaturation));\noutgoingLight += hbEnvironmentGlow * hbEnvironmentMode * (vec3(hbEnvironmentLift.x) + clamp(outgoingLight, 0.0, 1.0) * hbEnvironmentLift.y);\n" +
              text4,
          );
        const text5 = "#include <colorspace_fragment>";
        arg29.fragmentShader = arg29.fragmentShader.replace(
          text5,
          text5 +
            ("\ngl_FragColor.rgb *= mix(1.0, " +
              (arg27.userData.environmentWallTop ? "1.0" : "0.15") +
              ", hbEnvironmentAmount * (1.0 - hbEnvironmentRetain));"),
        );
      },
      v31 = function () {
        return (
          (v28 === v9.Material.prototype.customProgramCacheKey
            ? v27?.toString() || ""
            : v28?.call(v29) || "") +
          "|hb-environment-saturation-v8:" +
          (arg27.userData.environmentWallTop ? "wall-top" : "ordinary")
        );
      };
    (map2.set(arg27, {
      oldCompile: onBeforeCompile,
      oldKey: customProgramCacheKey,
      hasCompile: own,
      hasKey: own2,
      priorCompile: v27,
      priorKey: v28,
      compile: v30,
      key: v31,
      source: v26,
    }),
      (arg27.onBeforeCompile = v30),
      (arg27.customProgramCacheKey = v31),
      (arg27.needsUpdate = true));
  }
  function fn2() {
    v13.setVisible(false);
    for (const v32 of list)
      v32.applied && v32.mesh.material === v32.applied && (v32.mesh.material = v32.original);
    v19 = false;
  }
  function fn3() {
    for (const v33 of map4.values())
      v33.applied && v33.mesh.material === v33.applied && (v33.mesh.material = v33.original);
    (map4.clear(),
      set2.clear(),
      map5.clear(),
      set3.clear(),
      set4.clear(),
      fn2(),
      v13.clear(),
      set.clear(),
      map6.clear());
    for (const [v34, v35] of map2) fn4(v34, v35);
    for (const v36 of map3.values()) for (const v37 of v36.values()) v37.material.dispose();
    (map2.clear(), map3.clear(), (list = []), (v17 = false));
  }
  function fn4(arg31, arg32) {
    let v38 = false;
    (arg31.onBeforeCompile === arg32.compile &&
      (arg32.hasCompile ? (arg31.onBeforeCompile = arg32.oldCompile) : delete arg31.onBeforeCompile,
      (v38 = true)),
      arg31.customProgramCacheKey === arg32.key &&
        (arg32.hasKey
          ? (arg31.customProgramCacheKey = arg32.oldKey)
          : delete arg31.customProgramCacheKey,
        (v38 = true)),
      v38 && (arg32.source || arg31.dispose(), (arg31.needsUpdate = true)));
  }
  function fn5(arg33, arg34) {
    if (!v23(arg33)) return arg33;
    let map7 = map3.get(arg33);
    map7 || ((map7 = new Map()), map3.set(arg33, map7));
    const v39 = v21(arg34);
    let v40 = map7.get(v39);
    if (!v40) {
      const clone = arg33.clone(),
        v41 = v24();
      (arg33.defines &&
        (clone.defines = {
          ...arg33.defines,
        }),
        Object.defineProperty(clone, "environmentSourceMaterial", {
          value: arg33,
          configurable: true,
        }),
        fn1(clone, v41, arg33),
        (v40 = {
          material: clone,
          uniforms: v41,
          binding: arg34,
        }),
        map7.set(v39, v40));
    }
    return (
      (v40.binding = arg34),
      v40.uniforms.lift.value.set(
        ...(arg34.deviceKind === "cover"
          ? [0.025, 0.9]
          : arg34.deviceKind === "climate"
            ? [0.16, 1.05]
            : [0.12, 0.8]),
      ),
      v13.setColor(arg34.id, v40.uniforms.glow.value),
      v40.material
    );
  }
  function fn6() {
    if (!value || (!v16 && options.value === 0 && options2.value === 0)) {
      (fn2(), fn7());
      return;
    }
    (v13.sync(
      value,
      v18(),
      v14,
      new Map(
        list.filter((arg35) => arg35.modelNode).map((arg36) => [arg36.modelKey, arg36.modelNode]),
      ),
    ),
      v13.setVisible(true));
    const map8 = new Map();
    for (const v42 of v18())
      if (v42.modelId != null && v42.visible !== false) {
        const v43 = v20(v42.floorId, v42.modelId);
        map8.has(v43) || map8.set(v43, v42);
      }
    for (const v44 of list) {
      const v45 = map8.get(v44.modelKey);
      if (v45) {
        const map9 = v22(v44.original).map((arg37) => fn5(arg37, v45));
        ((v44.applied = Array.isArray(v44.original) ? map9 : map9[0]),
          (v44.mesh.material = v44.applied));
      } else
        (v44.applied && v44.mesh.material === v44.applied && (v44.mesh.material = v44.original),
          (v44.applied = null));
    }
    ((v19 = true), fn7());
  }
  function fn7() {
    const set5 = new Set(v18().map(v21));
    for (const [v46, v47] of map3) {
      for (const [v48, v49] of v47) {
        const v50 = v20(v49.binding.floorId, v49.binding.modelId);
        set3.has(v50)
          ? (set.delete(v49), (v49.fade = null), (v49.target = null))
          : !set5.has(v48) &&
            !set4.has(v50) &&
            (set.delete(v49), map2.delete(v49.material), v49.material.dispose(), v47.delete(v48));
      }
      v47.size || map3.delete(v46);
    }
  }
  function fn8(v51 = false, v52 = new Set()) {
    const v53 = text3 || text2,
      some = !!v53 && list2.some((arg38) => (arg38.entryId || arg38.id) === v53);
    let v54 = false;
    for (const v55 of map3.values())
      for (const v56 of v55.values()) {
        const binding = v56.binding;
        if (set3.has(v20(binding.floorId, binding.modelId))) continue;
        const num6 =
            !map6.has(v21(binding)) && (!some || (binding.entryId || binding.id) === v53) ? 1 : 0,
          text6 =
            binding.entityId ||
            (binding.deviceKind === "nas" ? binding.statusSource?.primaryEntityId : ""),
          v57 = options5 instanceof Map ? options5.get(text6) : options5?.[text6],
          options6 = v57?.newState || v57 || {},
          lowerCase = String(options6.state || "").toLowerCase(),
          value4 =
            binding.climateType === "bath-heater" ? bathHeaterState2(binding, options5) : null,
          on = value4 ? value4.on : !["", "off", "unknown", "unavailable"].includes(lowerCase),
          v58 = (binding.entryId || binding.id) === text3,
          num7 = num6
            ? v58
              ? 1.45
              : binding.deviceKind === "cover"
                ? 1.2
                : binding.deviceKind === "climate"
                  ? on
                    ? 1.35
                    : 1
                  : on
                    ? 1.125
                    : 0.325
            : 0,
          selected = v58
            ? options4.selected
            : (on && options4[value4?.visualMode || lowerCase]) || options4.other,
          v59 = num7 * selected.r,
          v60 = num7 * selected.g,
          v61 = num7 * selected.b,
          uniforms = v56.uniforms,
          v62 = uniforms.glow.value,
          list3 = [num6, v59, v60, v61];
        v56.target?.every((arg39, arg40) => arg39 === list3[arg40]) ||
          ((v54 = true),
          v52.add(binding.floorId),
          v51 && options2.value > 0 && !v12()
            ? ((v56.fade = {
                from: [uniforms.retain.value, v62.r, v62.g, v62.b],
                started: null,
              }),
              set.add(v56))
            : (set.delete(v56),
              (v56.fade = null),
              (uniforms.retain.value = num6),
              v62.setRGB(v59, v60, v61),
              v13.setColor(binding.id, v62)),
          (v56.target = list3));
      }
    return v54;
  }
  function fn9(arg41, arg42) {
    v15 ||
      (value === arg41 && v14 === arg42) ||
      (value !== arg41 && fn3(),
      (value = arg41 || null),
      (v14 = arg42),
      !(!v17 && !v16 && !list2.length) && (fn11(), fn6(), fn8(), v10()));
  }
  function fn10(arg43, arg44) {
    v15 || (fn9(arg43, arg44), v17 || fn11());
  }
  function fn11() {
    if (!value?.traverse) return;
    v11();
    const map10 = new Map([...map4, ...list.map((arg45) => [arg45.mesh, arg45])]),
      list4 = [],
      set6 = new Set();
    value?.traverse?.((arg46) => {
      if (!arg46.isMesh || !arg46.material || arg46.userData?.environmentEffect) return;
      for (let v63 = arg46; v63; v63 = v63.parent) {
        if (["background", "grid"].includes(v63.userData?.exportRole)) return;
        if (v63 === value) break;
      }
      let v64, v65, v66;
      for (
        let v67 = arg46;
        v67 &&
        (v64 == null &&
          v67.userData?.environmentModelId != null &&
          ((v64 = v67.userData.environmentModelId), (v66 = v67)),
        v65 == null &&
          v67.userData?.environmentFloorId != null &&
          (v65 = v67.userData.environmentFloorId),
        v67 !== value);
        v67 = v67.parent
      );
      const v68 = map10.get(arg46),
        original = v68?.applied && arg46.material === v68.applied ? v68.original : arg46.material,
        options7 =
          v68 && original === v68.original
            ? v68
            : {
                mesh: arg46,
                original: original,
                applied: null,
              };
      ((options7.modelNode = v66),
        (options7.modelKey = v64 == null ? null : v20(v65, v64)),
        list4.push(options7),
        map10.delete(arg46));
      for (const v69 of v22(original)) (set6.add(v69), fn1(v69, v25));
    });
    for (const v70 of map10.values()) {
      let v71 = false;
      for (let mesh = v70.mesh; mesh; mesh = mesh.parent)
        if (set2.has(mesh)) {
          v71 = true;
          break;
        }
      !v71 &&
        v70.applied &&
        v70.mesh.material === v70.applied &&
        (v70.mesh.material = v70.original);
    }
    map4.clear();
    const v72 = (arg47) => {
      for (let v73 = arg47; v73; v73 = v73.parent) if (set2.has(v73)) return true;
      return false;
    };
    for (const v74 of map10.values())
      if (v72(v74.mesh)) {
        map4.set(v74.mesh, v74);
        for (const v75 of v22(v74.original)) set6.add(v75);
      }
    list = list4;
    for (const [v76, v77] of map3)
      if (!set6.has(v76)) {
        for (const v78 of v77.values())
          (set.delete(v78), map2.delete(v78.material), v78.material.dispose());
        map3.delete(v76);
      }
    for (const [v79, v80] of map2)
      !v80.source && !set6.has(v79) && (fn4(v79, v80), map2.delete(v79));
    v17 = true;
  }
  function fn12(v81 = {}) {
    if (v15) return;
    if (Number.isFinite(v81.saturation)) {
      const v82 = Math.max(0, Math.min(100, v81.saturation)) / 100;
      v82 !== options3.value && ((options3.value = v82), v10());
    }
    const v83 = Object.hasOwn(v81, "enabled") ? v81.enabled === true : v16;
    if (Object.hasOwn(v81, "dimStrength")) {
      const v84 = Number(v81.dimStrength);
      num5 = Number.isFinite(v84) ? Math.max(0, Math.min(100, v84)) / 100 : 0.7;
    }
    const own3 = Object.hasOwn(v81, "bindings") && set4.size > 0;
    own3 && set4.clear();
    const bindings = Object.hasOwn(v81, "bindings")
        ? Array.isArray(v81.bindings)
          ? v81.bindings
          : []
        : list2,
      stringify2 = JSON.stringify(
        bindings.map(
          ({ id: v85, entryId: v86, floorId: v87, modelId: v88, entityId: v89, visible: v90 }) => [
            v85,
            v86,
            v87,
            v88,
            v89,
            v90,
          ],
        ),
      ),
      v91 = text !== stringify2,
      v92 = v16 !== v83,
      v93 = v91 && v81.animateBindings === true && options2.value > 0 && !v12();
    if (v91) {
      if (v93) {
        const set7 = new Set(bindings.map(v21)),
          set8 = new Set(bindings.map((arg48) => v20(arg48.floorId, arg48.modelId)));
        for (const v94 of list2) set7.has(v21(v94)) || map6.set(v21(v94), v94);
        for (const [v95, v96] of map6)
          (set7.has(v95) || set8.has(v20(v96.floorId, v96.modelId))) && map6.delete(v95);
      } else map6.clear();
    }
    ((v16 = v83),
      (list2 = bindings),
      (text = stringify2),
      Object.hasOwn(v81, "states") && (options5 = v81.states || {}));
    const own4 =
      Object.hasOwn(v81, "focusedId") &&
      (v81.focusedId || "") !== text2 &&
      !(v81.selectedId ?? text3);
    (Object.hasOwn(v81, "focusedId") && (text2 = v81.focusedId || ""),
      Object.hasOwn(v81, "selectedId") && (text3 = v81.selectedId || ""));
    const num8 = v16 ? num5 : 0,
      num9 = v16 ? 1 : 0,
      v97 = num8 !== num || num9 !== num3;
    (v97 &&
      ((num2 = options.value),
      (num4 = options2.value),
      (num = num8),
      (num3 = num9),
      (value2 = null)),
      !v17 && (v16 || list2.length) && fn11(),
      (v91 || v92 || (!v19 && v16)) && fn6());
    const set9 = new Set();
    own3 && fn7();
    const v98 = fn8(own4 || v93, set9);
    (map6.size && !set.size && (map6.clear(), fn6()),
      v92 || v97 || v91 ? v10() : v98 && (v16 || options2.value > 0) && v10([...set9]));
  }
  function fn13(arg49) {
    if (v15) return false;
    v13.update();
    const v99 = options.value !== num || options2.value !== num3;
    if (!v99 && !set.size) return false;
    Number.isFinite(arg49) || (arg49 = globalThis.performance?.now() ?? Date.now());
    let v100 = false;
    const set10 = new Set();
    if (v99) {
      value2 === null && (value2 = arg49);
      const num10 = v12() ? 1 : Math.max(0, Math.min(1, (arg49 - value2) / 400)),
        v101 = options.value,
        v102 = options2.value;
      ((options.value = num10 === 1 ? num : num2 + (num - num2) * (1 - (1 - num10) ** 2)),
        (options2.value = num10 === 1 ? num3 : num4 + (num3 - num4) * (1 - (1 - num10) ** 2)),
        (v100 ||= v101 !== options.value || v102 !== options2.value));
    }
    for (const v103 of set) {
      const fade = v103.fade;
      fade.started === null && (fade.started = arg49);
      const num11 = v12() ? 1 : Math.max(0, Math.min(1, (arg49 - fade.started) / 360)),
        v104 = num11 * num11 * (3 - 2 * num11),
        map11 = v103.target.map((arg50, arg51) =>
          num11 === 1 ? arg50 : fade.from[arg51] + (arg50 - fade.from[arg51]) * v104,
        ),
        v105 = v103.uniforms.glow.value;
      ((v103.uniforms.retain.value !== map11[0] ||
        v105.r !== map11[1] ||
        v105.g !== map11[2] ||
        v105.b !== map11[3]) &&
        ((v100 = true), set10.add(v103.binding.floorId)),
        (v103.uniforms.retain.value = map11[0]),
        v105.setRGB(map11[1], map11[2], map11[3]),
        v13.setColor(v103.binding.id, v105),
        num11 === 1 && (set.delete(v103), (v103.fade = null)));
    }
    return (
      map6.size && !set.size && (map6.clear(), fn6()),
      !v16 && options.value === 0 && options2.value === 0 && fn2(),
      v100 && v10(v99 ? undefined : [...set10]),
      options.value !== num || options2.value !== num3 || set.size > 0
    );
  }
  function fn14(arg52) {
    set2.add(arg52);
    const set11 = new Set();
    (arg52.traverse((arg53) => {
      arg53.userData?.environmentModelId != null &&
        set11.add(v20(arg53.userData.environmentFloorId, arg53.userData.environmentModelId));
    }),
      map5.set(arg52, set11));
    for (const v106 of set11) (set3.add(v106), set4.delete(v106));
    fn7();
  }
  function fn15(arg54, { dispose: v107 = false } = {}) {
    const set12 = map5.get(arg54) || new Set();
    (set2.delete(arg54), map5.delete(arg54), set3.clear());
    for (const v108 of map5.values()) for (const v109 of v108) set3.add(v109);
    for (const v110 of set12) v107 ? set4.delete(v110) : set4.add(v110);
    if (v107) {
      fn11();
      const set13 = new Set(list.map((arg55) => arg55.modelKey));
      for (const [v111, v112] of map3) {
        for (const [v113, v114] of v112) {
          const v115 = v20(v114.binding.floorId, v114.binding.modelId);
          !set12.has(v115) ||
            set3.has(v115) ||
            set13.has(v115) ||
            (set.delete(v114),
            map2.delete(v114.material),
            v114.material.dispose(),
            v112.delete(v113));
        }
        v112.size || map3.delete(v111);
      }
      fn7();
    }
  }
  return {
    setRoot: fn9,
    setMode: fn12,
    tick: fn13,
    preparePresentationMaterials: fn10,
    retainRoot: fn14,
    releaseRoot: fn15,
    get isActive() {
      return !v15 && (v16 || options2.value > 0);
    },
    dispose() {
      v15 ||
        ((options.value = 0),
        (options2.value = 0),
        (v16 = false),
        fn3(),
        v13.dispose(),
        (value = null),
        (list2 = []),
        (options5 = {}),
        (v15 = true));
    },
  };
}
