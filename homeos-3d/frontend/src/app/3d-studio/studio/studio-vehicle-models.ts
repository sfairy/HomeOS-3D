export const VEHICLE_MODEL_TYPES = Object.freeze(["smallcar", "suv", "scooter"]),
  isVehicleModelType = (modelType) => VEHICLE_MODEL_TYPES.includes(modelType);
export function prepareVehicleChargeGeometry(threeModule, rootObject) {
  rootObject.updateMatrixWorld(true);
  const bounds = new threeModule.Box3().setFromObject(rootObject),
    vehicleLength = bounds.max.z - bounds.min.z;
  if (!(vehicleLength > 0.001)) throw new Error("Vehicle length is invalid");
  const centerZ = (bounds.max.z + bounds.min.z) / 2,
    vertex = new threeModule.Vector3();
  rootObject.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const geometry = mesh.geometry.clone(),
      positionAttribute = geometry.attributes.position,
      lengthValues = new Float32Array(positionAttribute.count);
    for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex++)
      (vertex.fromBufferAttribute(positionAttribute, vertexIndex).applyMatrix4(mesh.matrixWorld),
        (lengthValues[vertexIndex] = ((vertex.z - centerZ) / vehicleLength) * 6));
    (geometry.setAttribute("hbVehicleLength", new threeModule.BufferAttribute(lengthValues, 1)),
      (mesh.geometry = geometry));
  });
}
/**
 * 车漆收尾用到的场景风格开关。三个字段都来自调用方（studio-app）的材质库 / 主题配置，
 * 缺省时用代码里既有的兜底色，所以整体可选。
 */
export type VehicleFinishOptions = {
  /** 暖木主题：车漆走米白高光，暗部发光也换成暖色。 */
  warmWood?: boolean;
  /** 暗色车漆的替换色（暖木主题下生效），默认 0x4B5455。 */
  applianceDark?: number;
  /** 座椅等家具件的替换色（暖木主题下生效），默认 0x655341。 */
  furnitureDark?: number;
};

export function applyVehicleFinish(
  model,
  material,
  sourceMaterial,
  options: VehicleFinishOptions = {},
) {
  const isBodyColor = ["body", "gogoro_color"].includes(sourceMaterial.name),
    isDarkColor = sourceMaterial.color.r + sourceMaterial.color.g + sourceMaterial.color.b < 0.08,
    isGlass = sourceMaterial.name === "glass",
    isEmissive = sourceMaterial.emissive?.getHex() !== 0;
  if (
    (material.emissive.copy(sourceMaterial.emissive),
    (material.emissiveIntensity = sourceMaterial.emissiveIntensity),
    isBodyColor)
  ) {
    if ((material.color.copy(sourceMaterial.color), options.warmWood)) {
      const fillScale =
        0.68 +
        0.32 *
          (sourceMaterial.color.r * 0.2126 +
            sourceMaterial.color.g * 0.7152 +
            sourceMaterial.color.b * 0.0722);
      material.color.setRGB(0.94 * fillScale, 0.925 * fillScale, 0.89 * fillScale);
    }
    material.roughness = options.warmWood ? 0.38 : 0.5;
  } else
    isDarkColor &&
      !isEmissive &&
      (material.color.setHex(options.warmWood ? (options.applianceDark ?? 4936789) : 2369836),
      (material.roughness = isGlass ? 0.32 : 0.65),
      options.warmWood &&
        (material.emissive.copy(material.color), (material.emissiveIntensity = 0.11)));
  (options.warmWood &&
    !isEmissive &&
    !isDarkColor &&
    (material.emissive.copy(material.color),
    (material.emissiveIntensity = isBodyColor ? 0.08 : 0.065)),
    sourceMaterial.name === "scooter-seat" &&
      options.warmWood &&
      (material.color.setHex(options.furnitureDark ?? 6640449),
      material.emissive.copy(material.color),
      (material.emissiveIntensity = 0.065)),
    isGlass &&
      ((material.transparent = false),
      (material.opacity = 1),
      (material.depthWrite = true),
      (material.metalness = 0.25)),
    (material.userData.plan2SurfaceContact = false));
  const originalOnBeforeCompile = material.onBeforeCompile,
    originalCacheKey = material.customProgramCacheKey();
  return (
    (material.onBeforeCompile = function (shader, renderer) {
      (originalOnBeforeCompile.call(this, shader, renderer),
        isGlass &&
          ((shader.fragmentShader = "#define HB_CAR_GLASS_FINISH\n" + shader.fragmentShader),
          (shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\nfloat hbCarGlass = 1.0;",
          ))),
        (shader.fragmentShader = shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          "\n      " +
            (isBodyColor && options.warmWood
              ? "vec3 vehicleNormal = inverseTransformDirection(normal, viewMatrix);\n      float vehicleFill = .64 + .20 * max(vehicleNormal.y, 0.0)\n        + .12 * max(dot(vehicleNormal, normalize(vec3(-.4,.85,.32))), 0.0);\n      outgoingLight = mix(outgoingLight, diffuseColor.rgb * vehicleFill, .45);"
              : "") +
            "\n      " +
            (isDarkColor && !isEmissive
              ? "vec3 vehicleReflection = inverseTransformDirection(reflect(-normalize(vViewPosition), normal), viewMatrix);\n      float vehicleSky = smoothstep(-.15,.85,vehicleReflection.y);\n      float vehicleFresnel = pow(1.0 - abs(dot(normal,normalize(vViewPosition))),4.0);\n      outgoingLight += vec3(.68,.79,.94) * (.012 + .025 * vehicleSky + .035 * vehicleFresnel) * .85;"
              : "") +
            "\n      #include <opaque_fragment>",
        )));
    }),
    (material.customProgramCacheKey = () =>
      originalCacheKey +
      "|vehicle-finish-v2:" +
      Number(isBodyColor) +
      ":" +
      Number(isDarkColor) +
      ":" +
      Number(isEmissive) +
      ":" +
      +(sourceMaterial.name === "scooter-seat") +
      ":" +
      +(options.warmWood === true)),
    material
  );
}
