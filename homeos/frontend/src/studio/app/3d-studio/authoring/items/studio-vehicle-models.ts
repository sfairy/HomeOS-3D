export function prepareVehicleChargeGeometry(threeModule: any, rootObject: any) {
  rootObject.updateMatrixWorld(true);
  const bounds = new threeModule.Box3().setFromObject(rootObject),
    vehicleLength = bounds.max.z - bounds.min.z;
  if (!(vehicleLength > 0.001)) throw new Error("Vehicle length is invalid");
  const centerZ = (bounds.max.z + bounds.min.z) / 2,
    vertex = new threeModule.Vector3();
  rootObject.traverse((mesh: any) => {
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
/** 车漆收尾用到的场景风格开关。 */
type VehicleFinishOptions = {
  /** 暖木主题：车漆走米白高光，暗部发光也换成暖色。 */
  warmWood?: boolean;
  /** 暗色车漆的替换色（暖木主题下生效），默认 0x4B5455。 */
  applianceDark?: number;
  /** 座椅等家具件的替换色（暖木主题下生效），默认 0x655341。 */
  furnitureDark?: number;
};

export function applyVehicleFinish(
  _model: any,
  material: any,
  sourceMaterial: any,
  options: VehicleFinishOptions = {},
) {
  const isBodyColor = ["body", "gogoro_color"].includes(sourceMaterial.name),
    isDarkColor = sourceMaterial.color.r + sourceMaterial.color.g + sourceMaterial.color.b < 0.08,
    /**
     * 车辆玻璃槽位：GLB 里是一族 `glass` / `glass_01` / `glass_02` / `glass_back`
     * （SUV 四个全在，`glass_back` 是尾灯灯罩），原先只认恰好等于 `"glass"` 的名字，
     * 于是其余三个玻璃件走了不透明分支；而被认出的那个又被下面强制 `transparent = false`，
     * 结果整台车的玻璃全变实心。
     */
    isGlass = /^glass(?:_|$)/.test(sourceMaterial.name || ""),
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
      // 暖木主题会给暗色件补一层自发光来抬暗部；玻璃吃这层光会变成磨砂奶白，跳过。
      options.warmWood &&
        !isGlass &&
        (material.emissive.copy(material.color), (material.emissiveIntensity = 0.11)));
  (options.warmWood &&
    !isEmissive &&
    !isDarkColor &&
    !isGlass &&
    (material.emissive.copy(material.color),
    (material.emissiveIntensity = isBodyColor ? 0.08 : 0.065)),
    sourceMaterial.name === "scooter-seat" &&
      options.warmWood &&
      (material.color.setHex(options.furnitureDark ?? 6640449),
      material.emissive.copy(material.color),
      (material.emissiveIntensity = 0.065)),
    /**
     * 玻璃：保留 GLB 的 `alphaMode: BLEND` 与 `baseColorFactor.a`（SUV 前挡 0.16、
     * 侧后窗 0.42），只把表面参数调成玻璃的观感。
     *
     * 之前这里把 `transparent` 强制关掉、`opacity` 拉满，是拿「不透明深色玻璃」当性能
     * 兜底；代价是玻璃彻底没了通透感，也和角色表里 `transparent: true` 的声明自相矛盾。
     * 透明件必须 `depthWrite = false`，否则会按绘制顺序挡住后面的物体（车身/座椅）。
     */
    isGlass &&
      ((material.transparent = sourceMaterial.transparent !== false),
      (material.opacity = material.transparent
        ? Math.max(0.06, Math.min(1, sourceMaterial.opacity ?? 0.42))
        : 1),
      (material.depthWrite = !material.transparent),
      (material.roughness = 0.08),
      (material.metalness = 0.02),
      (material.side = sourceMaterial.side ?? material.side),
      (material.needsUpdate = true)),
    (material.userData.plan2SurfaceContact = false));
  const originalOnBeforeCompile = material.onBeforeCompile,
    originalCacheKey = material.customProgramCacheKey();
  return (
    (material.onBeforeCompile = function (shader: any, renderer: any) {
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
      "|vehicle-finish-v3:" +
      Number(isBodyColor) +
      ":" +
      Number(isDarkColor) +
      ":" +
      Number(isEmissive) +
      ":" +
      Number(isGlass) +
      ":" +
      +(sourceMaterial.name === "scooter-seat") +
      ":" +
      +(options.warmWood === true)),
    material
  );
}
