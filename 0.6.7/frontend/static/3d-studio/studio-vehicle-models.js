export const VEHICLE_MODEL_TYPES = Object.freeze(["smallcar", "suv", "scooter"]),
  isVehicleModelType = (arg1) => VEHICLE_MODEL_TYPES.includes(arg1);
export function prepareVehicleChargeGeometry(arg2, arg3) {
  arg3.updateMatrixWorld(true);
  const value1 = new arg2.Box3().setFromObject(arg3),
    value2 = value1.max.z - value1.min.z;
  if (!(value2 > 0.001)) throw new Error("Vehicle length is invalid");
  const value3 = (value1.max.z + value1.min.z) / 2,
    value4 = new arg2.Vector3();
  arg3.traverse((arg4) => {
    if (!arg4.isMesh || !arg4.geometry?.attributes?.position) return;
    const value5 = arg4.geometry.clone(),
      value6 = value5.attributes.position,
      float32Array1 = new Float32Array(value6.count);
    for (let value7 = 0; value7 < value6.count; value7++)
      (value4.fromBufferAttribute(value6, value7).applyMatrix4(arg4.matrixWorld),
        (float32Array1[value7] = ((value4.z - value3) / value2) * 6));
    (value5.setAttribute("hbVehicleLength", new arg2.BufferAttribute(float32Array1, 1)),
      (arg4.geometry = value5));
  });
}
export function applyVehicleFinish(arg5, arg6, arg7, arg8 = {}) {
  const value8 = ["body", "gogoro_color"].includes(arg7.name),
    value9 = arg7.color.r + arg7.color.g + arg7.color.b < 0.08,
    value10 = arg7.name === "glass",
    value11 = arg7.emissive?.getHex() !== 0;
  if (
    (arg6.emissive.copy(arg7.emissive), (arg6.emissiveIntensity = arg7.emissiveIntensity), value8)
  ) {
    if ((arg6.color.copy(arg7.color), arg8.warmWood)) {
      const value14 =
        0.68 + 0.32 * (arg7.color.r * 0.2126 + arg7.color.g * 0.7152 + arg7.color.b * 0.0722);
      arg6.color.setRGB(0.94 * value14, 0.925 * value14, 0.89 * value14);
    }
    arg6.roughness = arg8.warmWood ? 0.38 : 0.5;
  } else
    value9 &&
      !value11 &&
      (arg6.color.setHex(arg8.warmWood ? (arg8.applianceDark ?? 4936789) : 2369836),
      (arg6.roughness = value10 ? 0.32 : 0.65),
      arg8.warmWood && (arg6.emissive.copy(arg6.color), (arg6.emissiveIntensity = 0.11)));
  (arg8.warmWood &&
    !value11 &&
    !value9 &&
    (arg6.emissive.copy(arg6.color), (arg6.emissiveIntensity = value8 ? 0.08 : 0.065)),
    arg7.name === "scooter-seat" &&
      arg8.warmWood &&
      (arg6.color.setHex(arg8.furnitureDark ?? 6640449),
      arg6.emissive.copy(arg6.color),
      (arg6.emissiveIntensity = 0.065)),
    value10 &&
      ((arg6.transparent = false),
      (arg6.opacity = 1),
      (arg6.depthWrite = true),
      (arg6.metalness = 0.25)),
    (arg6.userData.plan2SurfaceContact = false));
  const value12 = arg6.onBeforeCompile,
    value13 = arg6.customProgramCacheKey();
  return (
    (arg6.onBeforeCompile = function (arg9, arg10) {
      (value12.call(this, arg9, arg10),
        value10 &&
          ((arg9.fragmentShader = "#define HB_CAR_GLASS_FINISH\n" + arg9.fragmentShader),
          (arg9.fragmentShader = arg9.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\nfloat hbCarGlass = 1.0;",
          ))),
        (arg9.fragmentShader = arg9.fragmentShader.replace(
          "#include <opaque_fragment>",
          "\n      " +
            (value8 && arg8.warmWood
              ? "vec3 vehicleNormal = inverseTransformDirection(normal, viewMatrix);\n      float vehicleFill = .64 + .20 * max(vehicleNormal.y, 0.0)\n        + .12 * max(dot(vehicleNormal, normalize(vec3(-.4,.85,.32))), 0.0);\n      outgoingLight = mix(outgoingLight, diffuseColor.rgb * vehicleFill, .45);"
              : "") +
            "\n      " +
            (value9 && !value11
              ? "vec3 vehicleReflection = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);\n      float vehicleSky = smoothstep(-.15,.85,vehicleReflection.y);\n      float vehicleFresnel = pow(1.0 - abs(dot(normal,normalize(vViewPosition))),4.0);\n      outgoingLight += vec3(.68,.79,.94) * (.012 + .025 * vehicleSky + .035 * vehicleFresnel) * .85;"
              : "") +
            "\n      #include <opaque_fragment>",
        )));
    }),
    (arg6.customProgramCacheKey = () =>
      value13 +
      "|vehicle-finish-v2:" +
      Number(value8) +
      ":" +
      Number(value9) +
      ":" +
      Number(value11) +
      ":" +
      +(arg7.name === "scooter-seat") +
      ":" +
      +(arg8.warmWood === true)),
    arg6
  );
}
