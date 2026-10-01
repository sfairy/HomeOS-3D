import {
  mapSource,
  vacuumStatusPresentation,
  vacuumBindingsForMap,
} from "./vacuum-map.js?v=20260925-vacuum-state-v2-reload-diagnostics-v2";
const z = (arg1) => typeof arg1 == "number" && Number.isFinite(arg1),
  R = (arg2) => (arg2 && z(arg2.x) && z(arg2.y) ? arg2 : null);
export function vacuumMapPoint(arg3, arg4, arg5, arg6) {
  if (
    !R(arg3) ||
    !Array.isArray(arg4) ||
    arg4.length < 3 ||
    !(arg5?.width > 0 && arg5?.height > 0 && arg6?.width > 0 && arg6?.depth > 0)
  )
    return null;
  const [value1, value2, value3] = arg4;
  if (![value1, value2, value3].every((arg7) => R(arg7?.vacuum) && R(arg7?.map))) return null;
  const value4 = value2.vacuum.x - value1.vacuum.x,
    value5 = value2.vacuum.y - value1.vacuum.y,
    value6 = value3.vacuum.x - value1.vacuum.x,
    value7 = value3.vacuum.y - value1.vacuum.y,
    value8 = value4 * value7 - value5 * value6;
  if (Math.abs(value8) < 1e-8) return null;
  const value9 = arg3.x - value1.vacuum.x,
    value10 = arg3.y - value1.vacuum.y,
    value11 = (value9 * value7 - value10 * value6) / value8,
    value12 = (value4 * value10 - value5 * value9) / value8,
    value13 =
      value1.map.x +
      value11 * (value2.map.x - value1.map.x) +
      value12 * (value3.map.x - value1.map.x),
    value14 =
      value1.map.y +
      value11 * (value2.map.y - value1.map.y) +
      value12 * (value3.map.y - value1.map.y),
    value15 = (value13 / arg5.width - 0.5) * arg6.width,
    value16 = (value14 / arg5.height - 0.5) * arg6.depth,
    value17 = ((arg6.rotation || 0) * Math.PI) / 180;
  return {
    x: (arg6.x || 0) + value15 * Math.cos(value17) - value16 * Math.sin(value17),
    y: (arg6.y || 0) + value15 * Math.sin(value17) + value16 * Math.cos(value17),
  };
}
export function vacuumTelemetry(arg8, arg9, arg10) {
  if (arg8.map?.sourceMapId && !vacuumBindingsForMap([arg8], arg9).length) return null;
  const value18 = vacuumStatusPresentation(arg8, arg9),
    value19 = arg9[arg8.map?.entityId],
    value20 = (value19?.newState || value19)?.attributes || {},
    value21 = R(value20.charger_position),
    value22 = R(value20.vacuum_position || value20.robot_position);
  if (!value18.available || !value21 || !arg10) return null;
  const value23 = value18.docked,
    value24 = value23 ? value21 : value22,
    value25 = vacuumMapPoint(value21, value20.calibration_points, arg10, arg8.map),
    value26 = vacuumMapPoint(value24, value20.calibration_points, arg10, arg8.map);
  if (!value25 || !value26) return null;
  const fn1 = (arg11) => {
      if (!z(arg11?.a)) return null;
      const value29 = (arg11.a * Math.PI) / 180,
        value30 = vacuumMapPoint(arg11, value20.calibration_points, arg10, arg8.map),
        value31 = vacuumMapPoint(
          {
            x: arg11.x + Math.cos(value29) * 100,
            y: arg11.y + Math.sin(value29) * 100,
          },
          value20.calibration_points,
          arg10,
          arg8.map,
        );
      return value30 && value31 ? Math.atan2(value31.y - value30.y, value31.x - value30.x) : null;
    },
    value27 = fn1(value24),
    value28 = fn1(value21);
  return {
    x: value26.x - value25.x,
    y: value26.y - value25.y,
    angle:
      value27 !== null && value28 !== null
        ? Math.atan2(Math.sin(value27 - value28), Math.cos(value27 - value28))
        : 0,
    docked: value23,
    paused: value18.paused,
    active: value18.active,
  };
}
export const VACUUM_CHAT = {
  working: [
    "我真勤快！",
    "主人真懒，还好有我。",
    "好累啊，再坚持一小会儿。",
    "灰尘别跑，我来啦！",
    "今天也在认真营业。",
    "这一片，交给我！",
  ],
  returning: ["电量告急，回家吃饭！", "打工结束，回窝充电。", "基站，我回来啦！"],
  washing: ["洗个拖布，继续加油。", "爱干净，也要洗洗自己。"],
};
export function vacuumQuip(arg12, arg13, arg14) {
  if (arg12.funMessages === false) return "";
  const value32 = vacuumStatusPresentation(arg12, arg13);
  if (!value32.active) return "";
  const value33 =
    value32.key === "returning_to_wash" || value32.key === "washing"
      ? VACUUM_CHAT.washing
      : ["returning", "intelligent_recharging"].includes(value32.key)
        ? VACUUM_CHAT.returning
        : value32.returning
          ? ["基站，我回来啦！"]
          : value32.stationWorking
            ? ["基站维护中，稍等我一下。"]
            : VACUUM_CHAT.working;
  return value33[Math.floor(arg14 / 7000) % value33.length];
}
export function createVacuumMotion(arg15, arg16) {
  const { THREE: value34 } = arg15,
    map1 = new Map(),
    map2 = new Map();
  let list1 = [],
    object1 = {},
    value35 = false,
    value36 = false;
  const fn2 = (arg17) => {
    let value37;
    return (
      arg15.modelRoot?.traverse((arg18) => {
        arg18.userData?.environmentFloorId === arg17.floorId &&
          arg18.userData?.environmentModelId === arg17.modelId &&
          (value37 = arg18);
      }),
      value37
    );
  };
  function fn3(arg19, arg20) {
    arg19.updateWorldMatrix(true, true);
    const value38 = arg19.matrixWorld.clone().invert(),
      list2 = [],
      value39 = arg15.document.floors
        .find((arg21) => arg21.id === arg20.floorId)
        ?.scene.items.find((arg22) => arg22.id === arg20.modelId),
      value40 = value39?.height || 0.85,
      value41 = value39?.depth || 0.5;
    let value42 = null;
    if (
      (arg19.traverse((arg23) => {
        arg23.userData?.vacuumPart === "robot" && (value42 = arg23);
      }),
      value42
        ? value42.traverse((arg24) => {
            arg24.isMesh &&
              arg24.geometry &&
              !arg24.userData?.environmentEffect &&
              list2.push(arg24);
          })
        : arg19.traverse((arg25) => {
            if (!arg25.isMesh || !arg25.geometry || arg25.userData?.environmentEffect) return;
            arg25.geometry.computeBoundingBox();
            const value48 = arg25.geometry.boundingBox
              ?.clone()
              .applyMatrix4(value38.clone().multiply(arg25.matrixWorld));
            value48 &&
              value48.max.y < value40 * 0.3 &&
              value48.getCenter(new value34.Vector3()).z > value41 * 0.05 &&
              list2.push(arg25);
          }),
      !list2.length)
    )
      return null;
    const value43 = new value34.Box3();
    list2.forEach((arg26) => value43.expandByObject(arg26));
    const value44 = arg19.worldToLocal(
      value42
        ? value42.getWorldPosition(new value34.Vector3())
        : value43.getCenter(new value34.Vector3()),
    );
    value44.y = 0;
    const value45 = new value34.Group();
    ((value45.name = "vacuum-mobile-body"),
      value45.position.copy(value44),
      arg19.add(value45),
      arg19.updateWorldMatrix(true, true));
    const value46 = list2.map((arg27) => ({
      mesh: arg27,
      parent: arg27.parent,
      position: arg27.position.clone(),
      quaternion: arg27.quaternion.clone(),
      scale: arg27.scale.clone(),
    }));
    list2.forEach((arg28) => value45.attach(arg28));
    const value47 = value45.position.clone();
    return (
      (arg19.userData.vacuumMobileRoot = value45),
      {
        model: arg19,
        mobile: value45,
        rest: value47,
        originals: value46,
        x: 0,
        y: 0,
        angle: 0,
        target: null,
        initialized: false,
      }
    );
  }
  function fn4(arg29) {
    for (const value49 of arg29.originals)
      (value49.parent.add(value49.mesh),
        value49.mesh.position.copy(value49.position),
        value49.mesh.quaternion.copy(value49.quaternion),
        value49.mesh.scale.copy(value49.scale));
    (arg29.mobile.removeFromParent(),
      delete arg29.model.userData.vacuumMobileRoot,
      arg15.invalidateReflections?.([arg29.item.floorId]),
      arg15.setVacuumMoving?.(true),
      arg15.requestRender?.());
  }
  function fn5(arg30) {
    const value50 = arg30.map?.entityId;
    if (!value50 || !mapSource(value50)) return null;
    const value51 = object1[value50],
      value52 = (value51?.newState || value51)?.attributes || {};
    if (!value52.calibration_points || !value52.charger_position) return null;
    const value53 = JSON.stringify([value50, value52.calibration_points]);
    let value54 = map2.get(value50);
    if (value54?.key === value53 && (!value54.retryAt || performance.now() < value54.retryAt))
      return value54.size;
    const value55 = (value54?.key === value53 && value54.failures) || 0;
    value54 &&
      (clearTimeout(value54.timer),
      (value54.image.onload = value54.image.onerror = null),
      (value54.image.src = ""));
    const image1 = new Image();
    return (
      (value54 = {
        key: value53,
        image: image1,
        size: null,
        failures: value55,
        retryAt: 0,
        timer: null,
      }),
      map2.set(value50, value54),
      (image1.onload = () => {
        value36 ||
          map2.get(value50) !== value54 ||
          (clearTimeout(value54.timer),
          (value54.timer = null),
          (value54.retryAt = 0),
          (value54.failures = 0),
          (value54.size = {
            width: image1.naturalWidth,
            height: image1.naturalHeight,
          }),
          fn6(),
          arg16());
      }),
      (image1.onerror = () => {
        if (value36 || map2.get(value50) !== value54) return;
        const value56 = Math.min(5000, 1000 * 2 ** Math.min(value54.failures++, 3));
        ((value54.retryAt = performance.now() + value56),
          (value54.timer = setTimeout(() => {
            ((value54.timer = null),
              !value36 &&
                value35 &&
                map2.get(value50) === value54 &&
                ((value54.retryAt = performance.now()), fn6(), arg16()));
          }, value56)));
      }),
      (image1.src = mapSource(value50)),
      null
    );
  }
  function fn6() {
    for (const value57 of list1) {
      if (value57.motionEnabled === false || value57.visible === false || !value35) continue;
      const value58 = fn2(value57);
      let value59 = map1.get(value57.id);
      if (
        (value59?.model !== value58 &&
          (value59 && fn4(value59), map1.delete(value57.id), (value59 = null)),
        !value58)
      )
        continue;
      const value60 = vacuumTelemetry(value57, object1, fn5(value57));
      if (!value60) {
        value59 && (value59.target = null);
        continue;
      }
      if (!value59) {
        if (((value59 = fn3(value58, value57)), !value59)) continue;
        map1.set(value57.id, value59);
      }
      if (
        ((value59.item = value57),
        value59.initialized ||
          ((value59.x = value60.x),
          (value59.y = value60.y),
          (value59.angle = value60.angle),
          (value59.initialized = true),
          (value59.dirty = true)),
        value60.paused)
      ) {
        value59.target = null;
        continue;
      }
      (value59.target?.x === value60.x &&
        value59.target?.y === value60.y &&
        value59.target?.angle === value60.angle) ||
        (value59.target = value60);
    }
  }
  return {
    sync(arg31, arg32, arg33) {
      ((list1 = arg31), (object1 = arg32), (value35 = arg33 && !value36));
      const set1 = new Set(
        arg31
          .filter((arg34) => arg34.motionEnabled !== false && arg34.visible !== false)
          .map((arg35) => arg35.id),
      );
      for (const [value61, value62] of map1)
        (!set1.has(value61) || !value35) && (fn4(value62), map1.delete(value61));
      value35 ? fn6() : arg15.setVacuumMoving?.(false);
    },
    offset(arg36) {
      const value63 = map1.get(arg36.replace(/^vacuum:/, ""));
      return value63
        ? {
            x: value63.x,
            y: value63.y,
          }
        : null;
    },
    worldPosition(arg37) {
      const value64 = map1.get(arg37.replace(/^vacuum:/, ""));
      return value64 ? value64.mobile.getWorldPosition(new value34.Vector3()) : null;
    },
    tick(arg38) {
      if (!value35) return false;
      let value65 = false,
        value66 = false;
      for (const value67 of map1.values()) {
        const value68 =
          value67.target ||
          (value67.dirty
            ? {
                x: value67.x,
                y: value67.y,
                angle: value67.angle,
              }
            : null);
        if (!value68) continue;
        let value69 = value68.x - value67.x,
          value70 = value68.y - value67.y,
          value71 = Math.hypot(value69, value70);
        arg15
          .worldPoint(value67.item.floorId, value68.x, value68.y, 0)
          ?.distanceTo(arg15.worldPoint(value67.item.floorId, value67.x, value67.y, 0)) > 2.5 &&
          ((value67.x = value68.x),
          (value67.y = value68.y),
          (value69 = value70 = value71 = 0),
          (value67.dirty = true));
        const value72 = 1 - Math.exp(-Math.min(arg38, 0.1) * 5);
        ((value67.x += value69 * value72), (value67.y += value70 * value72));
        let value73 = Math.atan2(
          Math.sin(value68.angle - value67.angle),
          Math.cos(value68.angle - value67.angle),
        );
        if (
          ((value67.angle += value73 * value72),
          value71 > 0.02 || Math.abs(value73) > 0.002
            ? (value65 = true)
            : ((value67.x = value68.x), (value67.y = value68.y), (value67.angle = value68.angle)),
          value71 < 0.000001 && Math.abs(value73) < 0.000001 && !value67.dirty)
        )
          continue;
        ((value67.dirty = false), (value66 = true));
        const value74 = arg15.worldPoint(value67.item.floorId, 0, 0, 0),
          value75 = arg15.worldPoint(value67.item.floorId, value67.x, value67.y, 0);
        if (!value74 || !value75) continue;
        value67.model.updateWorldMatrix(true, false);
        const value76 = value67.model.localToWorld(value67.rest.clone()),
          value77 = value76.add(value75.sub(value74));
        (value67.mobile.position.copy(value67.model.worldToLocal(value77)),
          (value67.mobile.rotation.y = -value67.angle),
          value67.mobile.updateWorldMatrix(true, true),
          arg15.invalidateReflections?.([value67.item.floorId]));
      }
      return (
        arg15.setVacuumMoving?.(value65 || value66),
        value66 && arg15.requestRender?.(),
        value65 || value66
      );
    },
    hasTracking(arg39) {
      return map1.has(arg39.replace(/^vacuum:/, ""));
    },
    dispose() {
      value36 = true;
      for (const value78 of map1.values()) fn4(value78);
      map1.clear();
      for (const value79 of map2.values())
        (clearTimeout(value79.timer),
          (value79.image.onload = value79.image.onerror = null),
          (value79.image.src = ""));
      (map2.clear(), arg15.setVacuumMoving?.(false));
    },
  };
}
export function vacuumBirdCamera(arg40, arg41) {
  const value80 = (arg40?.position?.[0] || 0) - (arg40?.target?.[0] || 0),
    value81 = (arg40?.position?.[2] || 1) - (arg40?.target?.[2] || 0),
    value82 = Math.hypot(value80, value81) || 1;
  return {
    ...arg40,
    mode: "perspective",
    position: [
      arg41[0] + (value80 / value82) * 2.5,
      arg41[1] + 6,
      arg41[2] + (value81 / value82) * 2.5,
    ],
    target: [...arg41],
    up: [0, 1, 0],
    zoom: 1,
    focalLength: 40,
    frameSize: 5,
  };
}
export function vacuumFollowPose(arg42, arg43) {
  return {
    ...arg42,
    target: [...arg43],
    position: arg42.position.map((arg44, arg45) => arg43[arg45] + arg44 - arg42.target[arg45]),
  };
}
export function createVacuumFollowCamera(arg46) {
  const value83 = new arg46.Raycaster(),
    map3 = new Map();
  let value84 = null,
    value85 = null,
    text1 = "",
    list3 = [];
  function fn7(arg47, arg48) {
    const value86 = JSON.stringify([arg48.floorId, arg48.modelId]);
    (value84 === arg47.modelRoot && value85 === arg47.sceneRevision && text1 === value86) ||
      (fn8(),
      (value84 = arg47.modelRoot),
      (value85 = arg47.sceneRevision),
      (text1 = value86),
      (list3 = []),
      value84?.traverse((arg49) => {
        if (!(!arg49.isMesh || !arg49.geometry)) {
          for (let value87 = arg49; value87; value87 = value87.parent)
            if (
              value87.userData?.environmentEffect ||
              (value87.userData?.environmentFloorId === arg48.floorId &&
                value87.userData?.environmentModelId === arg48.modelId)
            )
              return;
          list3.push(arg49);
        }
      }));
  }
  function fn8() {
    for (const [value88, value89] of map3)
      (value88.material === value89.replacement && (value88.material = value89.original),
        value89.clones.forEach((arg50) => arg50.dispose()));
    map3.clear();
  }
  function fn9(arg51, arg52, arg53, arg54) {
    fn7(arg51, arg52);
    const set2 = new Set();
    for (const [value90, value91] of [
      [0, 0],
      [0.18, 0],
      [-0.18, 0],
      [0, 0.18],
      [0, -0.18],
    ]) {
      const value92 = arg53.clone().add(new arg46.Vector3(value90, 0, value91)),
        value93 = value92.sub(arg54),
        value94 = value93.length();
      (value83.set(arg54, value93.normalize()),
        (value83.near = 0),
        (value83.far = Math.max(0, value94 - 0.015)));
      for (const value95 of value83.intersectObjects(list3, false)) {
        let value96 = true;
        for (let value97 = value95.object; value97; value97 = value97.parent)
          value97.visible || (value96 = false);
        value96 && set2.add(value95.object);
      }
    }
    for (const [value98, value99] of map3)
      set2.has(value98) ||
        (value98.material === value99.replacement && (value98.material = value99.original),
        value99.clones.forEach((arg55) => arg55.dispose()),
        map3.delete(value98));
    for (const value100 of set2) {
      let value101 = map3.get(value100);
      if (!value101) {
        const value103 = value100.material,
          value104 = Array.isArray(value103) ? value103 : [value103],
          value105 = value104.map((arg56) => arg56.clone());
        ((value101 = {
          original: value103,
          clones: value105,
          replacement: Array.isArray(value103) ? value105 : value105[0],
        }),
          map3.set(value100, value101),
          (value100.material = value101.replacement));
      }
      const value102 = Array.isArray(value101.original) ? value101.original : [value101.original];
      value101.clones.forEach((arg57, arg58) => {
        (arg57.copy(value102[arg58]),
          (arg57.transparent = true),
          (arg57.opacity = Math.min(value102[arg58].opacity, 0.1)),
          (arg57.depthWrite = false));
      });
    }
  }
  return {
    reset: fn8,
    reveal: fn9,
  };
}
