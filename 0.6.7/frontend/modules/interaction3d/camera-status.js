export function cameraOnline(arg1) {
  const value1 = arg1?.newState || arg1,
    value2 = String(value1?.state || "")
      .trim()
      .toLowerCase();
  return (
    value1?.available !== false && !!value2 && !["unknown", "unavailable", "none"].includes(value2)
  );
}
export function createCameraStatus({ THREE: arg2, requestFrame: arg3 = () => {} }) {
  const map1 = new Map(),
    value3 = new arg2.SphereGeometry(1, 10, 8),
    fn1 = (arg4, arg5) => JSON.stringify([arg4, arg5]);
  let value4,
    value5,
    value6,
    value7 = false;
  const fn2 = (arg6) => {
    (arg6.mesh.removeFromParent(), arg6.mesh.material.dispose());
  };
  function fn3({
    root: arg7,
    revision: arg8,
    bindings: arg9 = [],
    states: arg10 = {},
    enabled: arg11 = false,
    brightness: arg12 = 1,
  }) {
    if (value7) return;
    let value8 = false;
    const value9 = JSON.stringify(
      arg9.map((arg13) => [
        arg13.id,
        arg13.floorId,
        arg13.modelId,
        arg13.width,
        arg13.height,
        arg13.depth,
      ]),
    );
    if (value4 !== arg7 || value5 !== arg8 || value6 !== value9) {
      ((value4 = arg7), (value5 = arg8), (value6 = value9));
      const map2 = new Map();
      value4?.traverse((arg14) => {
        if (arg14.userData?.environmentModelType !== "camera") return;
        let value10 = arg14.userData.environmentFloorId;
        for (let value11 = arg14.parent; value10 == null && value11; value11 = value11.parent)
          value10 = value11.userData.environmentFloorId;
        map2.set(fn1(value10, arg14.userData.environmentModelId), arg14);
      });
      const set1 = new Set();
      for (const value12 of arg9) {
        const value13 = map2.get(fn1(value12.floorId, value12.modelId));
        if (!value13) continue;
        set1.add(value12.id);
        let value14 = map1.get(value12.id);
        if (value14?.model !== value13) {
          value14 && fn2(value14);
          const value15 = new arg2.MeshBasicMaterial({
              color: 7830916,
              toneMapped: false,
              transparent: true,
              depthWrite: false,
            }),
            value16 = new arg2.Mesh(value3, value15);
          ((value16.name = "camera-status-" + value12.id),
            Object.assign(value16.userData, {
              environmentEffect: true,
              cameraStatus: true,
              externalModelSharedGeometry: true,
              externalModelSharedMaterial: true,
            }),
            (value16.raycast = () => {}),
            value13.add(value16),
            (value14 = {
              model: value13,
              mesh: value16,
            }),
            map1.set(value12.id, value14),
            (value8 = true));
        }
        (value14.mesh.position.set(0, value12.height * 0.84, value12.depth * 0.475),
          value14.mesh.scale.setScalar(Math.max(0.003, value12.width * 0.027)));
      }
      for (const [value17, value18] of map1)
        set1.has(value17) || (fn2(value18), map1.delete(value17), (value8 = true));
    }
    for (const value19 of arg9) {
      const value20 = map1.get(value19.id);
      if (!value20) continue;
      const value21 = arg11 && !!value19.entityId,
        value22 = cameraOnline(arg10[value19.entityId]) ? 8571275 : 7830916;
      ((value8 =
        value8 ||
        value20.mesh.visible !== value21 ||
        value20.mesh.material.color.getHex() !== value22 ||
        value20.mesh.material.opacity !== arg12),
        (value20.mesh.visible = value21),
        value20.mesh.material.color.setHex(value22),
        (value20.mesh.material.opacity = arg12));
    }
    value8 && arg3();
  }
  return {
    sync: fn3,
    dispose() {
      if (!value7) {
        value7 = true;
        for (const value23 of map1.values()) fn2(value23);
        (map1.clear(), value3.dispose());
      }
    },
  };
}
