const J = 1e-8,
  K = 10000,
  L = (arg1, arg2, arg3) => Math.max(arg2, Math.min(arg3, arg1)),
  y = (arg4, arg5) => (Number.isFinite(arg4) ? arg4 : arg5);
function A(arg6) {
  return Object.fromEntries(
    Object.entries(arg6).map(([arg7, arg8]) => [arg7, Array.isArray(arg8) ? [...arg8] : arg8]),
  );
}
function z(arg9, arg10, arg11) {
  return new arg9.Vector3(...[0, 1, 2].map((arg12) => y(arg10?.[arg12], arg11[arg12])));
}
function V(arg13, arg14) {
  const value1 = z(arg13, arg14.target, [0, 0, 0]),
    value2 = z(arg13, arg14.position, [0, 3, 6]).clone().sub(value1),
    value3 = Math.max(value2.length(), 1e-8);
  (value2.lengthSq() < 1e-8 * 1e-8 && value2.set(0, 0, 1), value2.normalize());
  const value4 = z(arg13, arg14.up, [0, 1, 0]);
  (value4.addScaledVector(value2, -value4.dot(value2)),
    value4.lengthSq() < 1e-8 * 1e-8 &&
      (value4.set(0, Math.abs(value2.y) < 0.9 ? 1 : 0, Math.abs(value2.y) < 0.9 ? 0 : -1),
      value4.addScaledVector(value2, -value4.dot(value2))),
    value4.normalize());
  const value5 = value4.clone().cross(value2).normalize();
  value4.crossVectors(value2, value5).normalize();
  const value6 = new arg13.Quaternion().setFromRotationMatrix(
    new arg13.Matrix4().makeBasis(value5, value4, value2),
  );
  return {
    target: value1,
    distance: value3,
    rotation: value6,
  };
}
function F(arg15, arg16, arg17) {
  if (arg16.view === "top") return null;
  const value7 = new arg15.Vector3(0, 0, 1).applyQuaternion(arg17.rotation);
  return Math.hypot(value7.x, value7.z) < 0.00001 ||
    new arg15.Quaternion()
      .setFromRotationMatrix(
        new arg15.Matrix4().lookAt(value7, new arg15.Vector3(), new arg15.Vector3(0, 1, 0)),
      )
      .angleTo(arg17.rotation) > 0.00001
    ? null
    : {
        theta: Math.atan2(value7.x, value7.z),
        phi: Math.acos(L(value7.y, -1, 1)),
      };
}
export function cameraMotionProgress(arg18, arg19) {
  return arg19 <= 0 || arg18 >= arg19
    ? 1
    : 1 - (1 - L(Number.isNaN(arg18) ? 0 : arg18 / arg19, 0, 1)) ** 3;
}
const D = 0.0001,
  j = 500,
  k = 900,
  B = 300,
  _ = 80;
function G(arg20) {
  const value8 = Math.max(0, y(arg20, 0));
  if (value8 >= _) return value8 - _ / 2;
  const value9 = value8 / _;
  return _ * value9 ** 3 * (1 - value9 / 2);
}
export function createReleasedFocusMotion(arg21, arg22, arg23, { immediate: arg24 = false } = {}) {
  const value10 = arg24 ? 0 : 1100,
    fn1 = (arg25) => value10 === 0 || arg25 >= value10,
    fn2 = (arg26, arg27) =>
      fn1(arg26)
        ? 1
        : -Math.expm1((-arg27 * Math.max(0, Number.isNaN(arg26) ? 0 : arg26)) / 1000) /
          -Math.expm1((-arg27 * value10) / 1000),
    object1 = {
      settled: fn1,
      move: (arg28) => fn2(arg28, 5),
      turn: (arg29) => fn2(arg29, 4),
    };
  return {
    settled: fn1,
    progress: object1.move,
    sample: createFocusCameraSampler(arg21, arg22, arg23, value10, "focus", null, object1),
  };
}
export function createDampedCameraMotion(
  arg30,
  arg31,
  arg32,
  { immediate: arg33 = false, owner: arg34 = "focus", floorFrame: arg35 = null } = {},
) {
  const value11 = arg34 === "focus",
    value12 = arg34 === "floor" ? 8 : value11 ? 5 : 6,
    value13 = arg34 === "floor" ? 7 : value11 ? 4 : 5,
    value14 = D,
    value15 = arg34 === "floor",
    value16 = value15 ? B : j,
    fn3 = (arg36, arg37) => Math.exp((-arg37 * Math.max(0, y(arg36, 0))) / 1000),
    fn4 = (arg38) => arg33 || (value15 ? arg38 >= k : fn3(arg38, value13) <= value14),
    value17 = value15 ? k - value16 : (-Math.log(value14) * 1000) / value13 - value16,
    value18 = value11 ? G : (arg39) => arg39,
    fn5 = (arg40, arg41 = value12) => {
      if (fn4(arg40)) return 1;
      if ((!value11 && !value15) || arg40 <= value17) return 1 - fn3(value18(arg40), arg41);
      const value19 = L((arg40 - value17) / value16, 0, 1),
        value20 = 1 - value19,
        value21 = (arg41 * value16) / 1000,
        value22 =
          value20 ** 3 *
          (1 +
            (3 - value21) * value19 +
            (6 - 3 * value21 + 0.5 * value21 * value21) * value19 * value19);
      return 1 - fn3(value18(value17), arg41) * value22;
    },
    object2 = {
      settled: fn4,
      move: (arg42) => fn5(arg42),
      turn: (arg43) => fn5(arg43, value13),
    };
  return {
    settled: fn4,
    progress: object2.move,
    sample: createFocusCameraSampler(
      arg30,
      arg31,
      arg32,
      0,
      value11 ? "focus-orbit" : arg34,
      arg35,
      object2,
    ),
  };
}
export function sampleFocusCamera(arg44, arg45, arg46, arg47, arg48 = 1100) {
  return createFocusCameraSampler(arg44, arg45, arg46, arg48)(arg47);
}
export function createFocusCameraSampler(
  arg49,
  arg50,
  arg51,
  arg52 = 1100,
  arg53 = "focus",
  arg54 = null,
  arg55 = null,
) {
  ((arg50 = A(arg50)), (arg51 = A(arg51)));
  const value23 = Math.max(0, y(arg52, 1100));
  let value24, value25, value26, value27;
  return function (arg56) {
    const value28 = Number.isNaN(arg56) ? 0 : arg56;
    if (arg55 ? arg55.settled(value28) : value23 === 0 || value28 >= value23) return A(arg51);
    if (!(value28 > 0)) return A(arg50);
    ((value24 ||= V(arg49, arg50)), (value25 ||= V(arg49, arg51)));
    const value29 = arg55 ? arg55.move(value28) : cameraMotionProgress(value28, value23),
      value30 = arg55 ? arg55.turn(value28) : value29,
      value31 = value24.rotation.clone().slerp(value25.rotation, value30).normalize();
    if (arg53 === "focus-orbit") {
      if (value27 === undefined) {
        const value36 = F(arg49, arg50, value24),
          value37 = F(arg49, arg51, value25);
        value27 =
          value36 && value37
            ? {
                start: value36,
                end: value37,
                deltaTheta: Math.atan2(
                  Math.sin(value37.theta - value36.theta),
                  Math.cos(value37.theta - value36.theta),
                ),
              }
            : null;
      }
      if (value27) {
        const { start: value38, end: value39, deltaTheta: value40 } = value27,
          value41 = new arg49.Vector3().setFromSphericalCoords(
            1,
            value38.phi + (value39.phi - value38.phi) * value30,
            value38.theta + value40 * value30,
          );
        value31.setFromRotationMatrix(
          new arg49.Matrix4().lookAt(value41, new arg49.Vector3(), new arg49.Vector3(0, 1, 0)),
        );
      }
    }
    let value32 = value24.target.clone().lerp(value25.target, value29);
    const value33 = Math.max(
      1e-8,
      value24.distance + (value25.distance - value24.distance) * value29,
    );
    let value34 = new arg49.Vector3(0, 0, value33).applyQuaternion(value31).add(value32);
    if (arg53 === "floor" && arg54?.fromPivot && arg54?.toPivot) {
      if (!value26) {
        const value43 = z(arg49, arg54.fromPivot, [0, 0, 0]),
          value44 = z(arg49, arg54.toPivot, [0, 0, 0]),
          fn6 = (arg57, arg58, arg59) =>
            z(arg49, arg57, [0, 0, 0]).sub(arg58).applyQuaternion(arg59.clone().invert());
        value26 = {
          fromPivot: value43,
          toPivot: value44,
          fromPosition: fn6(arg50.position, value43, value24.rotation),
          toPosition: fn6(arg51.position, value44, value25.rotation),
          fromTarget: fn6(arg50.target, value43, value24.rotation),
          toTarget: fn6(arg51.target, value44, value25.rotation),
        };
      }
      const value42 = value26.fromPivot.clone().lerp(value26.toPivot, value29);
      ((value34 = value26.fromPosition
        .clone()
        .lerp(value26.toPosition, value29)
        .applyQuaternion(value31)
        .add(value42)),
        (value32 = value26.fromTarget
          .clone()
          .lerp(value26.toTarget, value29)
          .applyQuaternion(value31)
          .add(value42)));
    }
    const value35 = new arg49.Vector3(0, 1, 0).applyQuaternion(value31).normalize(),
      object3 = {
        ...A(arg50),
        ...A(arg51),
        position: value34.toArray(),
        target: value32.toArray(),
        up: value35.toArray(),
      };
    for (const [value45, value46] of [
      ["zoom", 1],
      ["focalLength", 50],
      ["frameSize", 10],
    ])
      if (value45 in arg50 || value45 in arg51) {
        const value47 = y(arg50[value45], value46),
          value48 = y(arg51[value45], value46);
        object3[value45] = value47 + (value48 - value47) * value29;
      }
    return object3;
  };
}
function Q(arg60, arg61, arg62, arg63) {
  let value49 = arg63;
  for (const value50 of ["x", "y", "z"])
    if (Math.abs(arg62[value50]) > 1e-8) {
      const value51 = Math.sign(arg62[value50]) * 10000;
      value49 = Math.min(value49, Math.max(0, (value51 - arg61[value50]) / arg62[value50]));
    }
  return value49 < 1e-8
    ? (arg62.copy(arg61).negate(),
      arg62.lengthSq() < 1e-8 && arg62.set(0, 0, 1),
      arg62.normalize(),
      Q(arg60, arg61, arg62, Math.min(arg63, 10000)))
    : arg61.clone().addScaledVector(arg62, value49);
}
export function automaticLightCamera(arg64, arg65, arg66) {
  const value52 = arg65 || {},
    { distance: value53, rotation: value54 } = V(arg64, value52),
    value55 = z(arg64, arg66, [0, 0, 0]).clampScalar(-10000, 10000),
    value56 = value52.mode === "perspective",
    value57 = new arg64.Vector3(0, 0, 1).applyQuaternion(value54).normalize(),
    value58 = value56 ? Math.max(3, value53 * 0.5) : Math.max(3, value53),
    value59 = Q(arg64, value55, value57, value58),
    value60 = value59.clone().sub(value55).normalize(),
    value61 = z(arg64, value52.up, [0, 1, 0]),
    value62 = value61.length(),
    value63 =
      value62 > 1e-8 &&
      value61.clone().divideScalar(value62).cross(value60).lengthSq() > 1e-8 * 1e-8,
    value64 = value63 ? value61 : new arg64.Vector3(0, 1, 0).applyQuaternion(value54).normalize(),
    object4 = {
      mode: value56 ? "perspective" : "orthographic",
      position: value59.toArray(),
      target: value55.toArray(),
      up: value64.toArray(),
      zoom: L(y(value52.zoom, 1) * (value56 ? 1 : 2.2), 0.01, 100),
      frameSize: L(y(value52.frameSize, 10), 0.001, 20000),
      focalLength: L(y(value52.focalLength, 50), 18, 120),
      view: value52.view === "top" ? "top" : "free",
      topRotation: L(y(value52.topRotation, 0), 0, 360),
    };
  if (!value63) {
    const value65 = V(arg64, object4);
    object4.up = new arg64.Vector3(0, 1, 0).applyQuaternion(value65.rotation).normalize().toArray();
  }
  return object4;
}
export function automaticAirConditionerCamera(
  arg67,
  arg68,
  arg69,
  arg70,
  arg71,
  { minimumFrameSize: arg72 = 3, minimumDistance: arg73 = 3 } = {},
) {
  const value66 = arg68 || {},
    value67 = z(arg67, arg69, [0, 0, 0]).clampScalar(-10000, 10000),
    value68 = z(arg67, arg70, [0, 0, 1]);
  value68.y = 0;
  const value69 = Math.max(Math.abs(value68.x), Math.abs(value68.z));
  value69 < 1e-8 ? value68.set(0, 0, 1) : value68.divideScalar(value69).normalize();
  const value70 = new arg67.Vector3(0, 1, 0),
    value71 = value68.clone().addScaledVector(value70, 0.38).normalize(),
    value72 = value70.clone().cross(value71).normalize(),
    value73 = value71.clone().cross(value72).normalize(),
    value74 = z(arg67, arg71, [0.9, 0.28, 0.22]);
  for (const value84 of ["x", "y", "z"])
    value74[value84] = L(Math.abs(value74[value84]), 0.01, 10000);
  const fn7 = (arg74) =>
      Math.abs(arg74.x) * value74.x + Math.abs(arg74.y) * value74.y + Math.abs(arg74.z) * value74.z,
    value75 = L(y(value66.aspect, y(value66.viewportAspect, 1.6)), 0.25, 4),
    value76 = fn7(value73),
    value77 = fn7(value72),
    value78 = fn7(value71),
    value79 = L(Math.max(arg72, value76 * 2.1, (value77 / value75) * 1.8), arg72, 20000),
    value80 = value66.mode === "perspective",
    value81 = 35,
    value82 = L(
      value80 ? value79 * Math.max(value75, 1) + value78 * 0.5 : value78 * 0.5 + 2,
      arg73,
      10000,
    );
  let value83 = Q(arg67, value67, value71.clone(), value82);
  if (value83.distanceTo(value67) < arg73 - 1e-8) {
    const value85 = new arg67.Vector3(
      -Math.sign(value67.x),
      -Math.sign(value67.y) * 0.38,
      -Math.sign(value67.z),
    );
    (Math.abs(value85.x) + Math.abs(value85.z) < 1e-8 && (value85.z = 1),
      (value83 = Q(arg67, value67, value85.normalize(), value82)));
  }
  return {
    mode: value80 ? "perspective" : "orthographic",
    position: value83.toArray(),
    target: value67.toArray(),
    up: value70.toArray(),
    zoom: 1,
    frameSize: value79,
    focalLength: value81,
    view: "free",
    topRotation: 0,
  };
}
