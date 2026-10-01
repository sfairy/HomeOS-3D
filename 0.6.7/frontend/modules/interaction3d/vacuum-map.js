const { vacuumStatus: j } = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/renderer/vacuum-runtime.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/renderer/vacuum-runtime.js?v=20260925-vacuum-state-v2-20260926-speaker-v1",
          import.meta.url,
        )
      )),
  {
    vacuumMapAvailable: N,
    vacuumMapSource: D,
    createVacuumMapImageLoader: $,
  } = await (import.meta.url.startsWith("file:")
    ? import(new URL("../../static/renderer/vacuum-map-state.js", import.meta.url))
    : import(
        new URL(
          "../../../../bridge-static/renderer/vacuum-map-state.js?v=20260929-map-availability-v1",
          import.meta.url,
        )
      ));
export { N as vacuumMapAvailable, $ as createVacuumMapImageLoader };
export function vacuumMapIdentity(arg1, arg2) {
  const value1 = (arg1?.newState || arg1)?.attributes || {},
    value2 = (arg2?.newState || arg2)?.attributes || {},
    fn1 = (arg3) =>
      (typeof arg3 == "string" && arg3) || (typeof arg3 == "number" && Number.isFinite(arg3));
  for (const value3 of [value1.saved_map_id, value1.selected_map_id, value2.selected_map_id])
    if (fn1(value3)) return "saved:" + value3;
  if (fn1(value1.map_index)) return "index:" + value1.map_index;
  for (const value4 of ["map_id", "current_map_id", "map_index", "selected_map_id"]) {
    const value5 = value1[value4];
    if (
      (typeof value5 == "string" && value5) ||
      (typeof value5 == "number" && Number.isFinite(value5))
    )
      return String(value5);
  }
  return "";
}
export function vacuumBindingsForMap(arg4, arg5) {
  return arg4.flatMap((arg6) => {
    const value6 = arg5[arg6.map?.entityId],
      value7 = arg5[arg6.entityId],
      value8 = (value6?.newState || value6)?.attributes || {},
      value9 = (value7?.newState || value7)?.attributes || {},
      value10 = vacuumMapIdentity(value6, value7),
      value11 = arg6.map?.sourceMapId,
      value12 = arg4.some(
        (arg7) =>
          arg7 !== arg6 &&
          arg7.floorId !== arg6.floorId &&
          arg7.entityId === arg6.entityId &&
          arg7.map?.entityId === arg6.map?.entityId,
      );
    if (!value11) return value12 ? [] : [arg6];
    if (value11 === value10) return [arg6];
    const value13 = !value11.includes(":");
    return value13 && String(value8.map_id ?? value8.current_map_id ?? "") === value11
      ? [arg6]
      : value13 && !value12 && value9.multi_floor_map === false && value10.startsWith("saved:")
        ? [
            {
              ...arg6,
              map: {
                ...arg6.map,
                sourceMapId: value10,
              },
            },
          ]
        : [];
  });
}
export function mapCorners(arg8) {
  const value14 = ((arg8.rotation || 0) * Math.PI) / 180,
    value15 = Math.cos(value14),
    value16 = Math.sin(value14);
  return [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ].map(([arg9, arg10]) => ({
    x: arg8.x + arg9 * arg8.width * value15 - arg10 * arg8.depth * value16,
    y: arg8.y + arg9 * arg8.width * value16 + arg10 * arg8.depth * value15,
  }));
}
export function mapSource(arg11, arg12 = Date.now()) {
  return D(arg11, arg12);
}
export function createVacuumMaps(arg13, arg14) {
  const { THREE: value17 } = arg13,
    map1 = new Map();
  let value18 = false,
    value19 = false,
    value20 = null,
    text1 = "",
    value21 = 5000,
    value22 = -Infinity,
    value23 = Infinity;
  const fn2 = (arg15, arg16) => {
    const value24 = arg16[arg15.map?.entityId],
      value25 = value24?.newState || value24 || {},
      value26 = value25.attributes || {},
      value27 = arg16[arg15.entityId],
      value28 = value27?.newState || value27 || {};
    return JSON.stringify([
      value25.state,
      value25.last_updated,
      value26.entity_picture,
      value26.image_last_updated,
      value26.vacuum_position,
      value26.robot_position,
      value26.charger_position,
      value28.state,
      value28.last_updated,
    ]);
  };
  function fn3(arg17) {
    if (!value18 || value19 || document.hidden || !map1.size) return;
    const value29 = performance.now() + arg17;
    (value20 !== null && value23 <= value29) ||
      (clearTimeout(value20), (value23 = value29), (value20 = setTimeout(fn11, arg17)));
  }
  const fn4 = () => fn3(Math.max(0, 1000 - (performance.now() - value22))),
    fn5 = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    fn6 = (arg18) => {
      (arg18.generation++,
        clearTimeout(arg18.timeout),
        (arg18.timeout = null),
        arg18.image &&
          ((arg18.image.onload = arg18.image.onerror = null),
          arg18.loading && (arg18.image.src = "")),
        (arg18.loading = false));
    },
    fn7 = (arg19) => {
      ((arg19.mesh.visible = false),
        (arg19.fading = false),
        arg19.mesh.material.map?.dispose(),
        (arg19.mesh.material.map = null),
        (arg19.mesh.material.needsUpdate = true));
    },
    fn8 = (arg20) => {
      (fn6(arg20),
        arg20.mesh.removeFromParent(),
        arg20.mesh.geometry.dispose(),
        arg20.mesh.material.map?.dispose(),
        arg20.mesh.material.dispose());
    };
  function fn9(arg21) {
    const value30 = mapCorners(arg21.map).map((arg22) =>
      arg13.worldPoint(arg21.floorId, arg22.x, arg22.y, arg21.height),
    );
    if (value30.some((arg23) => !arg23)) return false;
    const value31 = arg21.mesh.geometry.attributes.position;
    return (
      value30.forEach((arg24, arg25) => value31.setXYZ(arg25, arg24.x, arg24.y, arg24.z)),
      (value31.needsUpdate = true),
      arg21.mesh.geometry.computeBoundingBox(),
      arg21.mesh.geometry.computeBoundingSphere(),
      true
    );
  }
  function fn10(arg26) {
    ((arg26.mesh.visible = value18 && arg26.positioned && !!arg26.mesh.material.map),
      arg26.mesh.visible &&
        ((arg26.mesh.material.opacity = fn5() ? arg26.opacity : 0),
        (arg26.fadeStart = null),
        (arg26.fading = arg26.mesh.material.opacity < arg26.opacity)));
  }
  function fn11() {
    if (
      (clearTimeout(value20),
      (value20 = null),
      (value23 = Infinity),
      !(!value18 || value19 || document.hidden))
    ) {
      for (const value32 of map1.values()) {
        if (value32.loading) continue;
        ((value32.loading = true), (value32.pending = false), (value22 = performance.now()));
        const value33 = ++value32.generation,
          image1 = new Image();
        ((value32.image = image1),
          (image1.onload = () => {
            if (value19 || !value18 || value33 !== value32.generation) return;
            (clearTimeout(value32.timeout), (value32.timeout = null), (value32.loading = false));
            const value34 = !!value32.mesh.material.map;
            value32.mesh.material.map?.dispose();
            const value35 = new value17.Texture(image1);
            ((value35.colorSpace = value17.SRGBColorSpace),
              (value35.needsUpdate = true),
              (value32.mesh.material.map = value35),
              (value32.mesh.material.needsUpdate = true),
              value34 || fn10(value32),
              value32.pending && fn4(),
              arg14());
          }),
          (image1.onerror = () => {
            value19 ||
              !value18 ||
              value33 !== value32.generation ||
              (fn6(value32), fn7(value32), value32.pending && fn4(), arg14());
          }),
          (value32.timeout = setTimeout(() => image1.onerror?.(), 15000)),
          (image1.src = mapSource(value32.entityId)));
      }
      fn3(value21);
    }
  }
  return {
    diagnostics() {
      let value36 = 0,
        value37 = 0;
      for (const value38 of map1.values()) {
        const value39 = value38.mesh.material.map?.image;
        value39 &&
          (value37++,
          (value36 +=
            (value39.naturalWidth || value39.width || 0) *
            (value39.naturalHeight || value39.height || 0)));
      }
      return {
        mapPixels: value36,
        mapTextures: value37,
      };
    },
    sync(arg27, arg28, arg29, arg30 = {}) {
      if (!!!(arg28 && !value19 && !document.hidden)) {
        if (value18) {
          (clearTimeout(value20), (value20 = null), (value23 = Infinity));
          for (const value45 of map1.values())
            (fn6(value45), (value45.mesh.visible = false), (value45.fading = false));
          arg14();
        }
        value18 = false;
        return;
      }
      const value40 = !value18;
      ((value18 = true),
        (value21 = arg27.some((arg31) => vacuumStatusPresentation(arg31, arg30).active)
          ? 1000
          : 5000));
      const value41 = arg27.filter(
          (arg32) =>
            N(arg30[arg32.map?.entityId]) &&
            arg32.visible !== false &&
            arg32.modelAvailable !== false &&
            arg32.map?.visible !== false &&
            mapSource(arg32.map?.entityId) &&
            arg32.map.width > 0 &&
            arg32.map.depth > 0 &&
            (arg29 === "all" || arg32.floorId === arg29),
        ),
        value42 = JSON.stringify([
          arg13.sceneRevision,
          arg29,
          value41.map((arg33) => [arg33.id, arg33.floorId, arg33.map]),
        ]),
        value43 = value42 !== text1;
      if (value43) {
        (clearTimeout(value20), (value20 = null), (value23 = Infinity));
        for (const value46 of map1.values()) fn8(value46);
        (map1.clear(),
          (text1 = value42),
          value41.forEach((arg34, arg35) => {
            const value47 = new value17.BufferGeometry();
            (value47.setAttribute(
              "position",
              new value17.Float32BufferAttribute(new Float32Array(12), 3),
            ),
              value47.setAttribute(
                "uv",
                new value17.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2),
              ),
              value47.setIndex([0, 2, 1, 0, 3, 2]));
            const value48 = new value17.MeshBasicMaterial({
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: value17.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
                toneMapped: false,
              }),
              value49 = new value17.Mesh(value47, value48);
            ((value49.name = "vacuum-map-overlay"),
              (value49.userData.environmentEffect = true),
              (value49.raycast = () => {}),
              (value49.visible = false),
              arg13.overlayScene.add(value49));
            const object1 = {
              mesh: value49,
              image: null,
              entityId: arg34.map.entityId,
              generation: 0,
              loading: false,
              revision: fn2(arg34, arg30),
              pending: false,
              floorId: arg34.floorId,
              map: arg34.map,
              height: 0.025 + arg35 * 0.001,
              opacity: (arg34.map.opacity ?? 45) / 100,
              fading: false,
            };
            ((object1.positioned = fn9(object1)), map1.set(arg34.id, object1));
          }));
      } else {
        if (value40) {
          for (const value50 of map1.values()) ((value50.positioned = fn9(value50)), fn7(value50));
        }
      }
      let value44 = false;
      for (const value51 of value41) {
        const value52 = map1.get(value51.id),
          value53 = fn2(value51, arg30);
        value52 &&
          value52.revision !== value53 &&
          ((value52.revision = value53), (value52.pending = true), (value44 = true));
      }
      value43 || value40 ? (fn11(), arg14()) : value44 ? fn4() : fn3(value21);
    },
    tick(arg36) {
      if (!value18 || value19) return false;
      let value54 = false,
        value55 = false;
      for (const value56 of map1.values())
        if (value56.fading) {
          value56.fadeStart === null && (value56.fadeStart = arg36);
          const value57 = fn5() ? 1 : Math.max(0, Math.min(1, (arg36 - value56.fadeStart) / 280)),
            value58 = value56.opacity * value57 * value57 * (3 - 2 * value57);
          ((value55 ||= value56.mesh.material.opacity !== value58),
            (value56.mesh.material.opacity = value58),
            (value56.fading = value57 < 1),
            (value54 ||= value56.fading));
        }
      return (value55 && arg14(), value54);
    },
    dispose() {
      ((value19 = true), (value18 = false), clearTimeout(value20));
      for (const value59 of map1.values()) fn8(value59);
      map1.clear();
    },
  };
}
export function vacuumStatusPresentation(arg37, arg38 = {}) {
  const fn12 = (arg39) => arg39?.newState || arg39 || null,
    value60 = fn12(arg38[arg37.entityId]),
    value61 = value60?.attributes || {},
    value62 = (arg37.relatedEntityIds || []).map((arg40) => ({
      entityId: arg40,
      role: arg37.statusEntityRoles ? arg37.statusEntityRoles[arg40] || "" : undefined,
      state: arg38[arg40],
    })),
    value63 = j(value60, value62),
    { available: value64 } = value63,
    value65 = (arg37.relatedEntityIds || [])
      .filter((arg41) => arg41.startsWith("sensor."))
      .map((arg42) => ({
        id: arg42,
        state: fn12(arg38[arg42]),
      })),
    value66 =
      value65.find((arg43) => arg43.state?.attributes?.device_class === "battery") ||
      value65.find(
        (arg44) =>
          /(?:^|[._])battery(?:_|$)/.test(arg44.id) &&
          !/filter|brush|mop|life|consumable/.test(arg44.id),
      ),
    fn13 = (arg45) =>
      arg45 == null || String(arg45).trim() === "" || !Number.isFinite(parseFloat(arg45))
        ? null
        : Math.max(0, Math.min(100, parseFloat(arg45))),
    value67 = value64
      ? ([value61.battery_level, value61.battery_percentage, value61.battery, value66?.state?.state]
          .map(fn13)
          .find((arg46) => arg46 !== null) ?? null)
      : null;
  return {
    ...value63,
    battery: value67 === null ? "电量 —" : Math.round(value67) + "%",
  };
}
