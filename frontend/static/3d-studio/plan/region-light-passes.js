/**
 * 区域灯光的两趟独立工序：接收面材质的「区域体积」改造，与灯光组的建/查/登记。
 */


import { coercedFiniteNumberOr } from "../../utils/numbers.js?v=2609271508";

export function sanitizeRegionOverrides(rawOverrides, context) {
  const { isRegionLightKey, clamp } = context;

  const normalizedOverrides = Object.create(null);
  if (!rawOverrides || typeof rawOverrides != "object" || Array.isArray(rawOverrides)) {
    return normalizedOverrides;
  }
  for (const [regionKey, override] of Object.entries(rawOverrides)) {
    if (
      !isRegionLightKey(regionKey) ||
      !override ||
      typeof override != "object" ||
      Array.isArray(override) ||
      !["circle", "square", "ellipse", "strip"].includes(override.shape) ||
      !["width", "depth"].every(
        dimensionField =>
          typeof override[dimensionField] == "number" && Number.isFinite(override[dimensionField])
      ) ||
      ["rotation", "softness"].some(
        numericField =>
          override[numericField] !== undefined &&
          (typeof override[numericField] != "number" || !Number.isFinite(override[numericField]))
      ) ||
      ["offsetX", "offsetZ"].some(
        offsetField =>
          override[offsetField] !== undefined &&
          (typeof override[offsetField] != "number" || !Number.isFinite(override[offsetField]))
      ) ||
      ["heightAbove", "heightBelow", "heightMin", "heightMax"].some(
        heightField =>
          override[heightField] !== undefined &&
          (typeof override[heightField] != "number" || !Number.isFinite(override[heightField]))
      ) ||
      (override.heightMin !== undefined &&
        override.heightMax !== undefined &&
        override.heightMin > override.heightMax) ||
      (override.moveCenterEnabled !== undefined && typeof override.moveCenterEnabled != "boolean")
    ) {
      continue;
    }
    const rotationDeg = override.rotation ?? 0;
    // 夹到 [0.5, 20] 米：光斑小于 0.5m 看不出来（且会退化成噪点），
    const clampedWidth = clamp(override.width, 0.5, 20);
    normalizedOverrides[regionKey] = {
      width: clampedWidth,
      depth: clamp(override.depth, 0.5, 20),
      // 角度归一化到 [-180, 180)：先取模到 [0,360)，再偏移 540 后取模保证
      rotation: (((rotationDeg % 360) + 540) % 360) - 180,
      // softness 下限 0.05：等于 0 会让柔化起点与终点重合，产生除零与硬边。
      softness: clamp(override.softness ?? 1, 0.05, 1),
      shape: override.shape,
      ...(override.heightMin !== undefined
        ? {
            heightMin: clamp(override.heightMin, 0, 20)
          }
        : {}),
      ...(override.heightMax !== undefined
        ? {
            heightMax: clamp(override.heightMax, 0, 20)
          }
        : {}),
      ...(override.heightAbove !== undefined
        ? {
            heightAbove: clamp(override.heightAbove, 0, 20)
          }
        : {}),
      ...(override.heightBelow !== undefined
        ? {
            heightBelow: clamp(override.heightBelow, 0, 20)
          }
        : {}),
      ...(override.offsetX !== undefined
        ? {
            offsetX: clamp(override.offsetX, -100, 100)
          }
        : {}),
      ...(override.offsetZ !== undefined
        ? {
            offsetZ: clamp(override.offsetZ, -100, 100)
          }
        : {}),
      ...(override.moveCenterEnabled !== undefined
        ? {
            moveCenterEnabled: override.moveCenterEnabled
          }
        : {})
    };
  }
  return normalizedOverrides;
}

export function ensureLightGroup(groupFloorId, requestedKind, lightCount, context) {
  const { groupsByKey, viewToWorldUniform, THREE, contactShadows, renderer, alignTo16, RangeError } = context;

    const groupKey = groupFloorId + "\0" + requestedKind;
    let lightGroup = groupsByKey.get(groupKey);
    if (!lightGroup) {
      lightGroup = {
        key: groupKey,
        floorId: groupFloorId,
        kind: requestedKind,
        // capacity：uniform 数组的实际长度（16 的倍数），>= 实际灯数。
        capacity: 0,
        textureMode: false,
        slots: [],
        materials: new Set(),
        uniforms: {
          plan2LightCount: {
            value: lightCount
          },
          plan2Gain: {
            value: 1
          },
          plan2SunShadowStrength: {
            value: 0
          },
          plan2Centers: {
            value: []
          },
          plan2Extents: {
            value: []
          },
          plan2Colors: {
            value: []
          },
          plan2Axes: {
            value: []
          },
          plan2ViewToWorld: viewToWorldUniform,
          plan2MotionToLayout: {
            value: new THREE.Matrix4()
          },
          plan2LightData: {
            value: null
          }
        }
      };
      if (requestedKind !== "wall" && contactShadows) {
        // 墙面不接收接触阴影（墙脚本来就不会有贴地阴影），因此不挂它的 uniform。
        Object.assign(lightGroup.uniforms, contactShadows.getUniforms(groupFloorId));
      }
      groupsByKey.set(groupKey, lightGroup);
    }
    const capacity = alignTo16(lightCount);
    if (lightGroup.capacity !== capacity) {
      lightGroup.capacity = capacity;
      const maxFragmentUniforms = coercedFiniteNumberOr(renderer?.capabilities?.maxFragmentUniforms, 1024);
      // 每盏灯 4 个 vec4（占 4 个 uniform 槽），另留 128 给 three.js 自身的 uniform。
      lightGroup.textureMode = capacity * 4 + 128 > maxFragmentUniforms;
      lightGroup.texture?.dispose();
      lightGroup.texture = null;
      lightGroup.slots = Array.from(
        {
          length: capacity
        },
        () => ({
          center: new THREE.Vector4(),
          extent: new THREE.Vector4(),
          color: new THREE.Vector4(),
          axis: new THREE.Vector4()
        })
      );
      for (const [uniformName, slotProperty] of [
        ["plan2Centers", "center"],
        ["plan2Extents", "extent"],
        ["plan2Colors", "color"],
        ["plan2Axes", "axis"]
      ]) {
        lightGroup.uniforms[uniformName].value = lightGroup.slots.map(slot => slot[slotProperty]);
      }
      if (lightGroup.textureMode) {
        const maxTextureSize = coercedFiniteNumberOr(renderer?.capabilities?.maxTextureSize, 4096);
        if (capacity > maxTextureSize) {
          throw new RangeError(
            "区域灯数量 " + lightCount + " 超出本机数据纹理容量 " + maxTextureSize
          );
        }
        lightGroup.texture = new THREE.DataTexture(
          new Float32Array(capacity * 16),
          4,
          capacity,
          THREE.RGBAFormat,
          THREE.FloatType
        );
        // 数据纹理必须用 Nearest 过滤、关掉 mipmap：这是「按 texel 精确取数」的查表，
        lightGroup.texture.minFilter = lightGroup.texture.magFilter = THREE.NearestFilter;
        lightGroup.texture.generateMipmaps = false;
        lightGroup.texture.needsUpdate = true;
      }
      lightGroup.uniforms.plan2LightData.value = lightGroup.texture;
      for (const cachedMaterial of lightGroup.materials) {
        cachedMaterial.needsUpdate = true;
      }
    }
    lightGroup.uniforms.plan2LightCount.value = lightCount;
    return lightGroup;
  }

export function getRegionMaterial(sourceMaterial, materialFloorId, materialKind, resultMaterials, isDetailedSurface = false, isFloorTone = false, context) {
  const { sourceMaterialByClone, clonesByMaterial, groupsByKey, isRegionReceiverMaterial, floorBrightnessUniform, buildShaderChunk, stats, contactShadows } = context;

    const environmentSourceMaterial = sourceMaterial?.environmentSourceMaterial;
    // 环境层（天空盒 / 环境贴图代理）用自己的材质参与渲染，不能换成区域灯克隆，
    if (environmentSourceMaterial && sourceMaterialByClone.has(environmentSourceMaterial)) {
      resultMaterials.add(environmentSourceMaterial);
      return sourceMaterial;
    }
    sourceMaterial = sourceMaterialByClone.get(sourceMaterial) || sourceMaterial;
    if (!isRegionReceiverMaterial(sourceMaterial)) {
      return sourceMaterial;
    }
    let materialClones = clonesByMaterial.get(sourceMaterial);
    if (!materialClones) {
      materialClones = new Map();
      clonesByMaterial.set(sourceMaterial, materialClones);
    }
    const materialGroupKey = materialFloorId + "\0" + materialKind;
    // 变体键用 \0 做分隔（与 materialGroupKey 里的一致）：它不可能出现在楼层 ID 或
    const variantKey =
      materialGroupKey +
      "\0" +
      (isDetailedSurface ? "detailed" : "simple") +
      (isFloorTone ? "-floor-tone" : "");
    let cloneMaterial = materialClones.get(variantKey);
    const materialGroup = groupsByKey.get(materialGroupKey);
    if (!cloneMaterial) {
      cloneMaterial = sourceMaterial.clone();
      if (sourceMaterial.userData.hbDedicatedWall) {
        // 专用墙材质被 clone 后颜色是共享引用，必须再 clone 一次，
        cloneMaterial.color = sourceMaterial.color.clone();
      }
      cloneMaterial.name =
        (sourceMaterial.name || sourceMaterial.type || "material") + " / region " + materialKind;
      const originalOnBeforeCompile = sourceMaterial.onBeforeCompile;
      // 注意用 function 而非箭头函数：three.js 会用 this 指向材质调用它，
      cloneMaterial.onBeforeCompile = function (shader, webglRenderer) {
        originalOnBeforeCompile?.call(this, shader, webglRenderer);
        Object.assign(shader.uniforms, materialGroup.uniforms);
        if (isFloorTone) {
          // 地面亮度调色：挂在共享的 floorBrightnessUniform 上，
          shader.uniforms.plan2FloorBrightness = floorBrightnessUniform;
          shader.fragmentShader = "uniform float plan2FloorBrightness;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.rgb *= plan2FloorBrightness;"
          );
        }
        shader.uniforms.plan2ContactViewToWorld = materialGroup.uniforms.plan2ViewToWorld;
        shader.vertexShader =
          "uniform mat4 plan2ViewToWorld;\nvarying vec3 vPlan2WorldPosition;\n" +
          shader.vertexShader;
        const PROJECT_VERTEX_INCLUDE = "#include <project_vertex>";
        if (!shader.vertexShader.includes(PROJECT_VERTEX_INCLUDE)) {
          // 注入点缺失时立刻报错：静默跳过会导致「区域灯完全不亮」且很难排查，
          throw new Error("区域灯材质缺少 project_vertex");
        }
        shader.vertexShader = shader.vertexShader.replace(
          PROJECT_VERTEX_INCLUDE,
          PROJECT_VERTEX_INCLUDE + "\nvPlan2WorldPosition = (plan2ViewToWorld * mvPosition).xyz;"
        );
        shader.fragmentShader = buildShaderChunk(materialGroup) + shader.fragmentShader;
        if (sourceMaterial.userData.hbDedicatedWall) {
          // 专用墙材质是自绘的简单着色器，只有 diffuse / opacity 两个 uniform，
          shader.uniforms.diffuse = {
            value: cloneMaterial.color
          };
          shader.uniforms.opacity = {
            // 用 getter 代理到克隆材质的 opacity：外部改材质透明度时无需重新编译，
            get value() {
              return cloneMaterial.opacity;
            }
          };
          stats.shaderCompiles += 1;
          return;
        }
        const LIGHTS_FRAGMENT_END_INCLUDE = "#include <lights_fragment_end>";
        if (!shader.fragmentShader.includes(LIGHTS_FRAGMENT_END_INCLUDE)) {
          throw new Error("区域灯材质缺少 lights_fragment_end");
        }
        const sunShadowSnippet =
          materialKind === "wall"
            ? ""
            : "\n          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n            if (receiveShadow && plan2SunShadowStrength > 0.0 && directionalLightShadows[0].shadowIntensity > 0.0) {\n              // The studio's single shadow-casting directional light is the\n              // first shadow slot. Reuse its resident VSM map; no new capture.\n              DirectionalLightShadow plan2SunShadow = directionalLightShadows[0];\n              plan2ShadowMask = getShadow(directionalShadowMap[0], plan2SunShadow.shadowMapSize,\n                min(1.0, plan2SunShadow.shadowIntensity * plan2SunShadowStrength / 0.18),\n                plan2SunShadow.shadowBias, plan2SunShadow.shadowRadius, vDirectionalShadowCoord[0]);\n            }\n          #endif";
        shader.fragmentShader = shader.fragmentShader.replace(
          LIGHTS_FRAGMENT_END_INCLUDE,
          LIGHTS_FRAGMENT_END_INCLUDE +
            "\nvec3 plan2ReceivingColor = mix(diffuseColor.rgb, sqrt(max(diffuseColor.rgb, vec3(0.0))), 0.6);\n          #ifdef HB_CAR_GLASS_FINISH\n            // Keep moderate fill on glass while avoiding the full furniture\n            // albedo lift, which exaggerates the atlas' photographed lighting.\n            plan2ReceivingColor = mix(plan2ReceivingColor, diffuseColor.rgb, hbCarGlass * 0.6);\n          #endif\n          float plan2ShadowMask = 1.0;" +
            sunShadowSnippet +
            "\n          reflectedLight.indirectDiffuse += plan2ReceivingColor * plan2SurfaceLight(vPlan2WorldPosition) * plan2Gain * plan2ShadowMask;"
        );
        if (materialKind !== "wall" && contactShadows) {
          // 接触阴影 uniform 与区域灯一起声明在前置片段里（材质只允许一次前置拼接，
          shader.fragmentShader =
            "uniform sampler2D plan2ContactMap;\n            uniform mat4 plan2ContactTransform;\n            uniform vec4 plan2ContactBounds;\n            uniform float plan2ContactY, plan2ContactOpacity;\n            uniform sampler2D plan2SurfaceMap;\n            uniform vec4 plan2SurfaceBounds;\n            uniform sampler2D plan2SurfaceLookup;\n            uniform vec2 plan2SurfaceLayout;\n            uniform mat4 plan2ContactViewToWorld;\n            uniform float plan2SurfaceOpacity;\n" +
            shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <opaque_fragment>",
            "\n            vec3 contactPosition = (plan2ContactTransform * vec4(vPlan2WorldPosition, 1.0)).xyz;\n            vec2 contactUv = (contactPosition.xz - plan2ContactBounds.xy) / plan2ContactBounds.zw;\n            float contactHeight = contactPosition.y - plan2ContactY;\n            if (contactHeight >= -0.015 && contactHeight < 0.12\n                && all(greaterThanEqual(contactUv, vec2(0.0))) && all(lessThanEqual(contactUv, vec2(1.0)))) {\n              // Rugs and the lowest furniture surfaces also receive contact\n              // shading. Fade it over the first 12cm; upper surfaces stay lit.\n              float contactWeight = 1.0 - smoothstep(0.035, 0.12, max(contactHeight, 0.0));\n              outgoingLight *= 1.0 - texture2D(plan2ContactMap, contactUv).r * plan2ContactOpacity * contactWeight;\n            }\n            " +
              (sourceMaterial.userData?.plan2SurfaceContact === false
                ? ""
                : "if (contactHeight > 0.12 && plan2SurfaceOpacity > 0.0) {\n              // These are already baked shadow pixels, not an occluder depth\n              // map. No shadow comparison or light-space projection per frame.\n              vec4 tile = texture2D(plan2SurfaceLookup, vec2(clamp(contactHeight / plan2SurfaceLayout.y, 0.0, 1.0), 0.5));\n              vec2 localUv = (contactPosition.xz - plan2SurfaceBounds.xy) / plan2SurfaceBounds.zw;\n              if (tile.b > 0.5 && all(greaterThanEqual(localUv, vec2(0.0))) && all(lessThanEqual(localUv, vec2(1.0)))) {\n                float upward = smoothstep(0.8, 0.98, normalize(mat3(plan2ContactTransform) * mat3(plan2ContactViewToWorld) * normal).y);\n                vec2 tileOrigin = floor(tile.rg * 255.0 + 0.5);\n                vec2 surfaceUv = (tileOrigin + clamp(localUv, vec2(0.002), vec2(0.998))) / plan2SurfaceLayout.x;\n                outgoingLight *= 1.0 - texture2D(plan2SurfaceMap, surfaceUv).r * plan2SurfaceOpacity * upward;\n              }\n            }") +
              "\n            #include <opaque_fragment>"
          );
        }
        if (
          !isDetailedSurface &&
          // alphaWallBand：带透明渐变的墙（比如玻璃隔断）需要原生光照的透明处理。
          !sourceMaterial.userData.alphaWallBand &&
          (sourceMaterial.transmission == null || sourceMaterial.transmission === 0)
        ) {
          shader.fragmentShader = "uniform mat4 plan2ViewToWorld;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <lights_fragment_begin>",
              "\n              vec3 simpleNormal = normalize(mat3(plan2MotionToLayout) * mat3(plan2ViewToWorld) * normal);\n              float simpleUp = simpleNormal.y * 0.5 + 0.5;\n              float simpleKey = max(dot(simpleNormal, normalize(vec3(-0.4, 0.85, 0.32))), 0.0);\n              vec3 simpleTint = mix(vec3(0.82, 0.85, 0.91), vec3(1.0, 1.0, 1.0), simpleUp);\n              reflectedLight.indirectDiffuse = diffuseColor.rgb * simpleTint * (0.30 + 0.40 * simpleUp + 0.18 * simpleKey);\n            "
            )
            .replace("#include <lights_fragment_maps>", "")
            .replace("#include <lights_fragment_end>", "");
        }
        stats.shaderCompiles += 1;
      };
      const baseProgramCacheKey = sourceMaterial.customProgramCacheKey?.call(sourceMaterial) || "";
      cloneMaterial.customProgramCacheKey = () =>
        baseProgramCacheKey +
        "|plan2-baked-surface-v10-glass-albedo|" +
        +(sourceMaterial.userData?.plan2SurfaceContact !== false) +
        "|" +
        +!!sourceMaterial.userData.alphaWallBand +
        "|" +
        Number(isDetailedSurface) +
        "|" +
        Number(isFloorTone) +
        "|" +
        materialKind +
        "|" +
        materialGroup.capacity +
        "|" +
        Number(materialGroup.textureMode) +
        "|" +
        !!contactShadows;
      // 打上标记：后续扫描（重新材质替换 / 清理）靠这两个字段快速识别「这是我们的克隆」，
      cloneMaterial.userData.plan2RegionMaterial = true;
      cloneMaterial.userData.plan2DetailedSurface = isDetailedSurface;
      sourceMaterialByClone.set(cloneMaterial, sourceMaterial);
      materialClones.set(variantKey, cloneMaterial);
      materialGroup.materials.add(cloneMaterial);
    }
    resultMaterials.add(cloneMaterial);
    return cloneMaterial;
  }

export function registerLight(lightObject, lightConfig = {}, context) {
  const { isDisposed, registrationsByLight, shouldRescanStructure, REGION_LIGHT_LAYER } = context;

    if (isDisposed || !lightObject?.isLight) {
      return;
    }
    if (!registrationsByLight.get(lightObject)) {
      registrationsByLight.set(lightObject, {
        light: lightObject,
        item: {
          ...lightConfig
        },
        originalLayers: lightObject.layers.mask,
        // fullIntensity 是「这盏灯的标称满值」，用于把当前 intensity 归一化成 0~1 的
        fullIntensity: Math.max(
          0.00001,
          coercedFiniteNumberOr(
            lightObject.userData?.regionFullIntensity,
            coercedFiniteNumberOr(lightObject.userData?.lightOnIntensity, lightObject.intensity) || 1
          )
        )
      });
    }
    lightObject.layers.set(REGION_LIGHT_LAYER);
    // 区域灯用自己的光照体积，不需要 three.js 的实时阴影：那套阴影图会随每盏灯
    lightObject.castShadow = false;
    shouldRescanStructure = true;
  }

export function inspect(context) {
  const { stats, settings, getOverrides, previewKeys, listRegions, registrationsByFloorId, groupsByKey, clamp, isVisibleWithin, rootObject } = context;

    return {
      ...stats,
      settings: {
        ...settings
      },
      overrides: getOverrides(),
      previewKeys: previewKeys ? [...previewKeys] : null,
      regions: listRegions(),
      floors: [...registrationsByFloorId].map(([inspectFloorId, inspectRegistrations]) => ({
        floorId: inspectFloorId,
        slots: inspectRegistrations.length,
        capacity: groupsByKey.get(inspectFloorId + "\0floor")?.capacity,
        lights: inspectRegistrations.map(inspectEntry => ({
          id: inspectEntry.item.id || inspectEntry.light.uuid,
          type: inspectEntry.item.type,
          intensity: inspectEntry.light.intensity,
          fullIntensity: inspectEntry.fullIntensity,
          amount: clamp(
            coercedFiniteNumberOr(inspectEntry.light.intensity, 0) / inspectEntry.fullIntensity,
            0,
            1.5
          ),
          effectiveAmount: inspectEntry.region?.amount ?? 0,
          regionKey: inspectEntry.key,
          visible: isVisibleWithin(inspectEntry.light, rootObject)
        }))
      }))
    };
  }
