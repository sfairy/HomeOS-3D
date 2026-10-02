// @ts-nocheck  (0.6.7 JS→TS 全量迁移：该文件保留原生 JS 写法，类型基线暂不收紧)
import { bathHeaterState as bathHeaterState2 } from "../bath-heater/bath-heater";
import { purifierState as purifierState2 } from "../purifier/purifier-state";
const flowStateColors = {
    cool: "#73c8ff",
    heat: "#ff8a65",
    other: "#dce2e6",
    purifier: "#69dc91",
  },
  airflowActionSet = new Set(["cooling", "cool", "heating", "heat", "fan", "fan_only", "drying"]),
  sceneModelKey = (floorId, modelId) =>
    JSON.stringify([String(floorId ?? ""), String(modelId ?? "")]);
export function createEnvironmentAirflow({
  THREE: THREE,
  camera: camera = null,
  requestFrame: requestFrame = () => {},
  reducedMotion: reducedMotion,
} = {}) {
  let value = null,
    rootRevision,
    isEnabled = false,
    list = [],
    options = {},
    text = "",
    isDisposed = false,
    map = new Map(),
    effectsByBindingKey = new Map(),
    hasIndexedScene = false,
    lastTickMs = -Infinity;
  const isVisibleInScene = (sceneEffect) => {
      for (let parent = sceneEffect.mesh.parent; parent; parent = parent.parent) {
        if (parent.visible === false) return false;
        if (parent === value) return true;
      }
      return false;
    },
    needsAnimation = (animationCandidate) =>
      isVisibleInScene(animationCandidate) &&
      ((animationCandidate.binding.bathEffect !== "light" && animationCandidate.target > 0) ||
        animationCandidate.mesh.material.uniforms.flowOpacity.value !== animationCandidate.target ||
        animationCandidate.mesh.material.uniforms.flowOverview.value !==
          animationCandidate.overviewTarget);
  let overviewOverride;
  const isOverviewMode = () => overviewOverride ?? !text;
  let reducedMotionOverride = typeof reducedMotion == "boolean" ? reducedMotion : undefined;
  const reducedMotionQuery = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)"),
    prefersReducedMotion = () => reducedMotionOverride ?? reducedMotionQuery?.matches ?? false,
    FLOW_VERTEX_SHADER =
      "attribute float flowLayer;\n    uniform float flowOverview;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    void main() {\n      vFlowUv = uv; vFlowLayer = flowLayer;\n      vec3 expanded = position;\n      // Expand away from the outlet; the mouth keeps its authored position and width.\n      expanded.x *= 1.0 + flowOverview * 0.15 * uv.y;\n      expanded.y *= 1.0 + flowOverview * 0.25;\n      expanded.z *= 1.0 + flowOverview * 0.35;\n      gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);\n    }",
    FLOW_LIGHT_FRAGMENT_SHADER =
      "uniform vec3 flowColor;\n    uniform float flowOpacity;\n    varying vec2 vFlowUv;\n    void main() {\n      float edge = 1.0 - smoothstep(0.2, 0.5, abs(vFlowUv.x - 0.5));\n      gl_FragColor = vec4(flowColor, flowOpacity * edge * 0.35);\n      #include <colorspace_fragment>\n    }",
    FLOW_FRAGMENT_SHADER =
      "uniform vec3 flowColor;\n    uniform float flowOpacity;\n    uniform float flowTime;\n    uniform float flowOverview;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    float hash(vec2 p) {\n      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);\n    }\n    float noise(vec2 p) {\n      vec2 cell = floor(p), f = fract(p);\n      f = f * f * (3.0 - 2.0 * f);\n      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),\n        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);\n    }\n    void main() {\n      float t = vFlowUv.y, across = vFlowUv.x * 2.0 - 1.0;\n      // Keep the breeze as narrow strands; a broad alpha field reads as a\n      // floating transparent rectangle beside the purifier.\n      float edge = exp(-3.2 * across * across) * (1.0 - smoothstep(0.62, 1.0, abs(across)));\n      float distanceFade = smoothstep(0.0, 0.025, t) * exp(-mix(1.15, 0.9, flowOverview) * t)\n        * (1.0 - smoothstep(0.62, 1.0, t));\n      // Advected, lengthwise fibres: deliberately much longer than they are\n      // wide, so the air reads as a continuous breeze, never dots or light bars.\n      float drift = sin(t * 4.0 - flowTime * 0.45 + vFlowLayer * 2.0) * t * 0.16;\n      // Keep individual strands fine even in overview; visibility comes from\n      // their bright cores rather than widening them into opaque white bands.\n      vec2 p = vec2(vFlowUv.x * mix(22.0, 16.0, flowOverview) + drift + vFlowLayer * 23.0,\n        t * mix(1.8, 1.25, flowOverview) - flowTime * 0.9);\n      float detail = 0.28;\n      float fibres = noise(p) * (1.0 - detail) + noise(p * vec2(1.9, 0.7) + 13.0) * detail;\n      // Give the moving strands enough coverage on both pale wood and dark\n      // floors. Keep the empty space clear instead of adding a uniform veil.\n      float density = 0.012 + 1.25 * fibres * fibres;\n      // A soft density ceiling keeps the stronger near-outlet strands\n      // translucent while letting their motion remain readable at room scale.\n      density = density / (1.0 + density * 0.65);\n      // Moving fibre crests catch a white highlight, with the mode color in\n      // their softer edges. This remains one transparent draw, without lights.\n      float crest = smoothstep(0.56, 0.9, fibres);\n      float highlight = crest * crest;\n      float alpha = min(0.38, flowOpacity * edge * distanceFade\n        * (density + highlight * 0.16) * mix(1.0, 0.42, vFlowLayer));\n      vec3 strandColor = mix(flowColor, vec3(1.0), highlight * 0.68);\n      gl_FragColor = vec4(strandColor, alpha);\n      #include <colorspace_fragment>\n    }",
    PURIFIER_FLOW_VERTEX_SHADER =
      "attribute float flowLayer;\n    uniform float flowTime, flowOverview, flowStrength, flowWidth;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    varying vec3 vNormal, vView;\n    void main() {\n      vFlowUv = uv; vFlowLayer = flowLayer;\n      float t = uv.y;\n      vec3 p = position;\n      p.xy *= 1.0 + flowOverview * 0.12 * t;\n      p.z *= (0.68 + flowStrength * 0.45) * (1.0 + flowOverview * 0.25);\n      // Motion grows away from the grille; the complete outlet stays anchored.\n      p.xy += flowWidth * t * t * vec2(\n        sin(t * 4.0 - flowTime * 0.65 + flowLayer * 1.7),\n        cos(t * 3.2 - flowTime * 0.5 + flowLayer * 2.3)) * 0.12;\n      vec4 view = modelViewMatrix * vec4(p, 1.0);\n      vNormal = normalize(normalMatrix * normal); vView = -view.xyz;\n      gl_Position = projectionMatrix * view;\n    }",
    PURIFIER_FLOW_FRAGMENT_SHADER =
      "uniform vec3 flowColor;\n    uniform float flowOpacity, flowTime, flowStrength;\n    varying vec2 vFlowUv;\n    varying float vFlowLayer;\n    varying vec3 vNormal, vView;\n    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n    float noise(vec2 p) {\n      vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),\n        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);\n    }\n    void main() {\n      float t = vFlowUv.y, angle = vFlowUv.x * 6.28318530718;\n      float travel = t * 1.8 - flowTime * 0.7;\n      // Circular coordinates make the texture continuous across the shell seam.\n      vec2 ring = vec2(cos(angle), sin(angle));\n      float fibres = noise(ring * 5.0 + vec2(travel, travel * 0.6) + vFlowLayer * 19.0);\n      float fine = noise(ring * 9.0 + vec2(travel * 0.65, travel) + vFlowLayer * 7.0);\n      float density = pow(smoothstep(0.28, 0.86, fibres * 0.75 + fine * 0.25), 2.0);\n      float fade = smoothstep(0.0, 0.045, t) * (1.0 - smoothstep(0.30, 1.0, t));\n      // Suppress grazing edges so a curved surface never reads as a solid tube.\n      float facing = abs(dot(normalize(vNormal), normalize(vView)));\n      float softness = smoothstep(0.0, 0.55, facing);\n      float alpha = min(0.22, flowOpacity * density * fade * softness\n        * (0.65 + flowStrength * 0.35) * mix(0.34, 0.24, vFlowLayer));\n      gl_FragColor = vec4(flowColor, alpha);\n      #include <colorspace_fragment>\n    }";
  function modelWorldBounds(modelNode) {
    const accumulatedBounds = new THREE.Box3(),
      worldMatrix = new THREE.Matrix4();
    function accumulateNodeBounds(sceneNode, parentMatrix) {
      if (
        !sceneNode.userData?.environmentAirflow &&
        !(sceneNode !== modelNode && sceneNode.userData?.environmentModelId != null)
      ) {
        if (sceneNode.isMesh && sceneNode.geometry?.attributes?.position) {
          const position = sceneNode.geometry.attributes.position;
          if (position.count > 0 && typeof position.getX == "function") {
            const matrix4 = new THREE.Box3()
              .setFromBufferAttribute(position)
              .applyMatrix4(parentMatrix);
            [
              matrix4.min.x,
              matrix4.min.y,
              matrix4.min.z,
              matrix4.max.x,
              matrix4.max.y,
              matrix4.max.z,
            ].every(Number.isFinite) && accumulatedBounds.union(matrix4);
          }
        }
        for (const childNode of sceneNode.children || [])
          (childNode.matrixAutoUpdate && childNode.updateMatrix(),
            accumulateNodeBounds(
              childNode,
              new THREE.Matrix4().multiplyMatrices(parentMatrix, childNode.matrix),
            ));
      }
    }
    return (
      accumulateNodeBounds(modelNode, worldMatrix),
      accumulatedBounds.isEmpty() ? null : accumulatedBounds
    );
  }
  function resolveOutletLayout(model, modelBinding = {}) {
    const modelBox = modelWorldBounds(model);
    if (!modelBox) return null;
    const size = modelBox.getSize(new THREE.Vector3());
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return null;
    if (modelBinding.climateType === "bath-heater") {
      const isLightEffect = modelBinding.bathEffect === "light",
        max = Math.max(0.12, Math.min(size.x, size.z) * (isLightEffect ? 0.8 : 0.55));
      return {
        type: "bath-heater",
        width: max,
        length: isLightEffect ? 0.025 : Math.max(0.5, max * 3),
        fall: 0,
        spread: 0.3,
        rotationX: Math.PI / 2,
        outlet: [
          (modelBox.min.x + modelBox.max.x) / 2 + (isLightEffect ? 0 : -size.x * 0.2),
          modelBox.min.y - 0.006,
          (modelBox.min.z + modelBox.max.z) / 2,
        ],
      };
    }
    const modelType =
      model.userData.environmentModelType ||
      (size.y > size.x * 1.5 && size.y > size.z * 1.5 ? "floorac" : "wallac");
    if (modelType === "airpurifier")
      return {
        type: modelType,
        width: Math.min(size.x, size.z) * 0.8,
        length: Math.max(0.5, size.y * 1.4),
        fall: 0,
        rotationX: -Math.PI / 2,
        spread: 0.3,
        outlet: [
          (modelBox.min.x + modelBox.max.x) / 2,
          modelBox.max.y + 0.005,
          (modelBox.min.z + modelBox.max.z) / 2,
        ],
      };
    if (modelType === "airoutlet") {
      const min = Math.min(2.4, Math.max(0.6, size.z * 0.9));
      return {
        type: modelType,
        width: size.z * 0.88,
        length: min,
        fall: min * 0.28,
        rotationY: Math.PI / 2,
        spread: 0.3,
        outlet: [
          modelBox.max.x + Math.max(0.003, size.x * 0.03),
          modelBox.min.y + size.y * 0.48,
          (modelBox.min.z + modelBox.max.z) / 2,
        ],
      };
    }
    const isFloorUnit = modelType === "floorac",
      ductWidth = size.x * (isFloorUnit ? 0.48 : 0.84),
      ductLength = Math.min(
        2.8,
        Math.max(0.3, isFloorUnit ? Math.max(size.y * 0.95, size.x * 3) : size.x * 1.8),
      );
    return {
      type: modelType,
      width: ductWidth,
      length: ductLength,
      verticalSpan: isFloorUnit ? size.y * 0.4 : 0,
      fall: ductLength * (isFloorUnit ? 0.12 : 0.38),
      outlet: [
        (modelBox.min.x + modelBox.max.x) / 2,
        modelBox.min.y + size.y * (isFloorUnit ? 0.68 : 0.18),
        modelBox.max.z + Math.max(0.003, size.z * 0.03),
      ],
    };
  }
  function buildFlowGeometry(layout) {
    if (layout.type === "airpurifier") return buildPurifierShellGeometry(layout);
    const positions = [],
      uvs = [],
      layerIndices = [],
      indexTriples = [],
      num = 24,
      columnSegments = 6;
    for (let layerIndex = 0; layerIndex < 2; layerIndex++) {
      const baseVertexIndex = positions.length / 3;
      for (let rowIndex = 0; rowIndex <= num; rowIndex++) {
        const rowT = rowIndex / num,
          rowExpansion = 1 + (rowT * 0.8 + rowT * rowT * 0.15) * (layout.spread ?? 1);
        for (let columnIndex = 0; columnIndex <= columnSegments; columnIndex++) {
          const columnU = columnIndex / columnSegments,
            columnOffset = columnU * 2 - 1,
            mouthTaper = (1 - columnOffset * columnOffset) * layout.width * rowT * 0.09,
            layerSpread = layerIndex * layout.width * rowT * 0.075,
            isMouthLayer = layout.verticalSpan > 0 && layerIndex === 0,
            offsetX = isMouthLayer ? mouthTaper : columnOffset * layout.width * 0.5 * rowExpansion,
            offsetY =
              -layout.fall * (0.35 * rowT + 0.65 * rowT * rowT) +
              (isMouthLayer
                ? columnOffset * layout.verticalSpan * 0.5 * (1 + rowT * 0.2)
                : mouthTaper + layerSpread);
          if (
            (positions.push(offsetX, offsetY, layout.length * rowT),
            uvs.push(columnU, rowT),
            layerIndices.push(layerIndex),
            rowIndex < num && columnIndex < columnSegments)
          ) {
            const cellVertexIndex = baseVertexIndex + rowIndex * (columnSegments + 1) + columnIndex,
              nextRowVertexIndex = cellVertexIndex + columnSegments + 1;
            indexTriples.push(
              cellVertexIndex,
              cellVertexIndex + 1,
              nextRowVertexIndex,
              cellVertexIndex + 1,
              nextRowVertexIndex + 1,
              nextRowVertexIndex,
            );
          }
        }
      }
    }
    const element = new THREE.BufferGeometry();
    (element.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)),
      element.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)),
      element.setAttribute("flowLayer", new THREE.Float32BufferAttribute(layerIndices, 1)),
      element.setIndex(indexTriples),
      element.computeBoundingBox());
    const scratchVertex = new THREE.Vector3();
    for (let vertexIndex = 0; vertexIndex < positions.length / 3; vertexIndex++)
      element.boundingBox.expandByPoint(
        scratchVertex.set(
          positions[vertexIndex * 3] * (1 + 0.15 * uvs[vertexIndex * 2 + 1]),
          positions[vertexIndex * 3 + 1] * 1.25,
          positions[vertexIndex * 3 + 2] * 1.35,
        ),
      );
    return (
      (element.boundingSphere = element.boundingBox.getBoundingSphere(new THREE.Sphere())),
      element
    );
  }
  function buildPurifierShellGeometry(shellLayout) {
    const shellPositions = [],
      shellNormals = [],
      shellUvs = [],
      shellLayerIndices = [],
      shellIndexTriples = [];
    for (let shellLayerIndex = 0; shellLayerIndex < 2; shellLayerIndex++) {
      const shellBaseVertexIndex = shellPositions.length / 3;
      for (let shellRowIndex = 0; shellRowIndex <= 16; shellRowIndex++) {
        const shellRowT = shellRowIndex / 16,
          shellRowRadius =
            shellLayout.width *
            (shellLayerIndex ? 0.31 : 0.48) *
            (1 + 0.38 * shellRowT + 0.18 * shellRowT * shellRowT);
        for (let shellColumnIndex = 0; shellColumnIndex <= 32; shellColumnIndex++) {
          const shellColumnU = shellColumnIndex / 32,
            shellAngle = shellColumnU * Math.PI * 2,
            cos = Math.cos(shellAngle),
            sin = Math.sin(shellAngle);
          if (
            (shellPositions.push(
              cos * shellRowRadius,
              sin * shellRowRadius,
              shellLayout.length * shellRowT,
            ),
            shellNormals.push(cos, sin, 0),
            shellUvs.push(shellColumnU, shellRowT),
            shellLayerIndices.push(shellLayerIndex),
            shellRowIndex < 16 && shellColumnIndex < 32)
          ) {
            const shellCellVertexIndex =
                shellBaseVertexIndex + shellRowIndex * 33 + shellColumnIndex,
              shellNextRowVertexIndex = shellCellVertexIndex + 32 + 1;
            shellIndexTriples.push(
              shellCellVertexIndex,
              shellCellVertexIndex + 1,
              shellNextRowVertexIndex,
              shellCellVertexIndex + 1,
              shellNextRowVertexIndex + 1,
              shellNextRowVertexIndex,
            );
          }
        }
      }
    }
    const shellGeometry = new THREE.BufferGeometry();
    (shellGeometry.setAttribute("position", new THREE.Float32BufferAttribute(shellPositions, 3)),
      shellGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(shellNormals, 3)),
      shellGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(shellUvs, 2)),
      shellGeometry.setAttribute(
        "flowLayer",
        new THREE.Float32BufferAttribute(shellLayerIndices, 1),
      ),
      shellGeometry.setIndex(shellIndexTriples));
    const shellHalfExtent = shellLayout.width * (0.48 * 1.56 * 1.12 + 0.12);
    return (
      (shellGeometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(-shellHalfExtent, -shellHalfExtent, 0),
        new THREE.Vector3(shellHalfExtent, shellHalfExtent, shellLayout.length * 1.13 * 1.25),
      )),
      (shellGeometry.boundingSphere = shellGeometry.boundingBox.getBoundingSphere(
        new THREE.Sphere(),
      )),
      shellGeometry
    );
  }
  function disposeEffect(effectToDispose) {
    (effectToDispose.mesh.removeFromParent(),
      effectToDispose.mesh.geometry.dispose(),
      effectToDispose.mesh.material.dispose());
  }
  function refreshEffectLayout(effectEntry) {
    const nextLayout = resolveOutletLayout(effectEntry.model, effectEntry.binding);
    if (!nextLayout) return false;
    const stringify = JSON.stringify(nextLayout);
    return (
      stringify !== effectEntry.layoutSignature &&
        (effectEntry.mesh.geometry.dispose(),
        (effectEntry.mesh.geometry = buildFlowGeometry(nextLayout)),
        effectEntry.mesh.position.fromArray(nextLayout.outlet),
        (effectEntry.mesh.rotation.x = nextLayout.rotationX || 0),
        (effectEntry.mesh.rotation.y = nextLayout.rotationY || 0),
        effectEntry.mesh.updateMatrix(),
        (effectEntry.mesh.material.uniforms.flowWidth.value = nextLayout.width),
        (effectEntry.layout = nextLayout),
        (effectEntry.layoutSignature = stringify),
        (effectEntry.mesh.userData.outletLayout = nextLayout)),
      true
    );
  }
  function createFlowEffect(modelObject, effectBinding) {
    const outletLayout = resolveOutletLayout(modelObject, effectBinding);
    if (!outletLayout) return null;
    const overviewValue = isOverviewMode() ? 1 : 0,
      isPurifierLayout = outletLayout.type === "airpurifier",
      material = new THREE.ShaderMaterial({
        vertexShader: isPurifierLayout ? PURIFIER_FLOW_VERTEX_SHADER : FLOW_VERTEX_SHADER,
        fragmentShader:
          effectBinding.bathEffect === "light"
            ? FLOW_LIGHT_FRAGMENT_SHADER
            : isPurifierLayout
              ? PURIFIER_FLOW_FRAGMENT_SHADER
              : FLOW_FRAGMENT_SHADER,
        uniforms: {
          flowColor: {
            value: new THREE.Color(flowStateColors.other),
          },
          flowOpacity: {
            value: 0,
          },
          flowTime: {
            value: 0,
          },
          flowOverview: {
            value: overviewValue,
          },
          flowStrength: {
            value: 0.5,
          },
          flowWidth: {
            value: outletLayout.width,
          },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        toneMapped: false,
      }),
      mesh = new THREE.Mesh(buildFlowGeometry(outletLayout), material);
    return (
      (mesh.name = "environment-airflow-" + (effectBinding.id || effectBinding.modelId)),
      (mesh.userData.bathEffect = effectBinding.bathEffect),
      (mesh.userData.environmentAirflow = true),
      (mesh.userData.environmentEffect = true),
      (mesh.userData.outletLayout = outletLayout),
      mesh.position.fromArray(outletLayout.outlet),
      (mesh.rotation.x = outletLayout.rotationX || 0),
      (mesh.rotation.y = outletLayout.rotationY || 0),
      mesh.updateMatrix(),
      (mesh.matrixAutoUpdate = false),
      (mesh.castShadow = false),
      (mesh.receiveShadow = false),
      (mesh.renderOrder = 4),
      (mesh.visible = false),
      (mesh.raycast = () => {}),
      modelObject.add(mesh),
      {
        mesh: mesh,
        model: modelObject,
        binding: effectBinding,
        layout: outletLayout,
        layoutSignature: JSON.stringify(outletLayout),
        target: 0,
        startOpacity: 0,
        overviewTarget: overviewValue,
        startOverview: overviewValue,
        startTime: null,
        strengthTarget: 0.5,
        lastTick: null,
      }
    );
  }
  function indexSceneModels() {
    ((map = new Map()),
      value?.traverse?.((traversedNode) => {
        if (
          traversedNode.userData?.environmentAirflow ||
          traversedNode.userData?.environmentModelId == null
        )
          return;
        let environmentFloorId = traversedNode.userData.environmentFloorId;
        for (
          let parent2 = traversedNode.parent;
          environmentFloorId == null && parent2;
          parent2 = parent2.parent
        )
          environmentFloorId = parent2.userData?.environmentFloorId;
        map.set(
          sceneModelKey(environmentFloorId, traversedNode.userData.environmentModelId),
          traversedNode,
        );
      }),
      (hasIndexedScene = true));
  }
  function syncEffects(shouldRefreshLayouts = false) {
    !hasIndexedScene && isEnabled && list.length && indexSceneModels();
    const set = new Set(),
      flatMap = list.flatMap((sourceBinding) =>
        sourceBinding.climateType === "bath-heater"
          ? ["fan", "light"].map((bathEffect) => ({
              ...sourceBinding,
              bathEffect: bathEffect,
            }))
          : [sourceBinding],
      );
    for (const bindingConfig of flatMap) {
      if (bindingConfig.visible === false || bindingConfig.modelId == null) continue;
      const ee2 = sceneModelKey(bindingConfig.floorId, bindingConfig.modelId),
        bindingKey = bindingConfig.bathEffect ? ee2 + "/" + bindingConfig.bathEffect : ee2,
        boundModel = map.get(ee2);
      if (
        !boundModel ||
        ["fan", "storagewaterheater", "gaswaterheater"].includes(
          boundModel.userData.environmentModelType,
        )
      )
        continue;
      set.add(bindingKey);
      let existingEffect = effectsByBindingKey.get(bindingKey);
      (existingEffect &&
        existingEffect.model !== boundModel &&
        (disposeEffect(existingEffect),
        effectsByBindingKey.delete(bindingKey),
        (existingEffect = null)),
        !existingEffect &&
          isEnabled &&
          ((existingEffect = createFlowEffect(boundModel, bindingConfig)),
          existingEffect && effectsByBindingKey.set(bindingKey, existingEffect)),
        existingEffect &&
          ((existingEffect.binding = bindingConfig),
          shouldRefreshLayouts &&
            !refreshEffectLayout(existingEffect) &&
            (disposeEffect(existingEffect), effectsByBindingKey.delete(bindingKey))));
    }
    for (const [removedKey, removedEffect] of effectsByBindingKey)
      set.has(removedKey) || (disposeEffect(removedEffect), effectsByBindingKey.delete(removedKey));
  }
  function updateEffectStates() {
    let hasChanged = false;
    for (const effect of effectsByBindingKey.values()) {
      const binding = effect.binding,
        stateRecord =
          options instanceof Map ? options.get(binding.entityId) : options?.[binding.entityId],
        stateBody = stateRecord?.newState || stateRecord || {},
        lowerCase = String(stateBody.state || "").toLowerCase(),
        lowerCase2 = String(stateBody.attributes?.hvac_action || "").toLowerCase(),
        isFocusTarget = !text || binding.id === text,
        isPurifierEffect = effect.layout?.type === "airpurifier",
        percentageValue = stateBody.attributes?.percentage,
        finite =
          (typeof percentageValue == "number" ||
            (typeof percentageValue == "string" && percentageValue.trim() !== "")) &&
          Number.isFinite(Number(percentageValue)),
        purifierReading = isPurifierEffect ? purifierState2(binding, options) : null,
        strength = purifierReading
          ? purifierReading.strength
          : finite
            ? Math.max(0, Math.min(1, Number(percentageValue) / 100))
            : 0.5,
        heaterReading =
          binding.climateType === "bath-heater" ? bathHeaterState2(binding, options) : null,
        includes = heaterReading
          ? heaterReading.active.includes(binding.bathEffect)
          : purifierReading
            ? purifierReading.running
            : !["", "off", "unknown", "unavailable"].includes(lowerCase) &&
              (lowerCase2 === "" || airflowActionSet.has(lowerCase2)),
        overviewUniformValue = isOverviewMode() ? 1 : 0,
        targetOpacity =
          isEnabled && isFocusTarget && includes ? (overviewUniformValue ? 1.45 : 1) : 0,
        uniforms = effect.mesh.material.uniforms;
      isPurifierEffect &&
        includes &&
        effect.strengthTarget !== strength &&
        ((effect.strengthTarget = strength), (hasChanged = true));
      const targetColor = new THREE.Color(
        effect.layout?.type === "airpurifier"
          ? flowStateColors.purifier
          : binding.bathEffect
            ? flowStateColors.other
            : flowStateColors[lowerCase] || flowStateColors.other,
      );
      (targetOpacity > 0 &&
        !uniforms.flowColor.value.equals(targetColor) &&
        (uniforms.flowColor.value.copy(targetColor), (hasChanged = true)),
        (effect.target !== targetOpacity || effect.overviewTarget !== overviewUniformValue) &&
          ((effect.target = targetOpacity),
          (effect.startOpacity = uniforms.flowOpacity.value),
          (effect.overviewTarget = overviewUniformValue),
          (effect.startOverview = uniforms.flowOverview.value),
          (effect.startTime = null),
          (hasChanged = true)),
        !isFocusTarget || prefersReducedMotion()
          ? ((uniforms.flowOpacity.value !== targetOpacity ||
              uniforms.flowOverview.value !== overviewUniformValue) &&
              (hasChanged = true),
            (uniforms.flowOpacity.value = targetOpacity),
            (uniforms.flowOverview.value = overviewUniformValue),
            (effect.mesh.visible = targetOpacity > 0),
            prefersReducedMotion() &&
              ((uniforms.flowTime.value = 0),
              (uniforms.flowStrength.value = effect.strengthTarget),
              (effect.lastTick = null)))
          : targetOpacity > 0
            ? (effect.mesh.visible = true)
            : uniforms.flowOpacity.value === 0 &&
              ((effect.mesh.visible = false),
              (uniforms.flowOverview.value = overviewUniformValue)));
    }
    hasChanged && requestFrame();
  }
  function setRoot(nextRoot, revision) {
    if (!(isDisposed || (value === nextRoot && rootRevision === revision))) {
      if (value !== nextRoot) {
        for (const staleEffect of effectsByBindingKey.values()) disposeEffect(staleEffect);
        (effectsByBindingKey.clear(), map.clear(), (hasIndexedScene = false));
      }
      ((value = nextRoot || null),
        (rootRevision = revision),
        (hasIndexedScene = false),
        !(!isEnabled && !effectsByBindingKey.size) &&
          (indexSceneModels(), syncEffects(true), updateEffectStates(), requestFrame()));
    }
  }
  function setState(stateUpdate = {}) {
    if (isDisposed) return;
    const previousReducedMotion = prefersReducedMotion();
    (Object.hasOwn(stateUpdate, "enabled") && (isEnabled = stateUpdate.enabled === true),
      Object.hasOwn(stateUpdate, "bindings") &&
        (list = Array.isArray(stateUpdate.bindings) ? stateUpdate.bindings : []),
      Object.hasOwn(stateUpdate, "states") && (options = stateUpdate.states || {}),
      Object.hasOwn(stateUpdate, "focusedId") && (text = stateUpdate.focusedId || ""),
      Object.hasOwn(stateUpdate, "overview") &&
        (overviewOverride =
          typeof stateUpdate.overview == "boolean" ? stateUpdate.overview : undefined),
      Object.hasOwn(stateUpdate, "reducedMotion") &&
        (reducedMotionOverride = stateUpdate.reducedMotion === true),
      syncEffects(),
      updateEffectStates(),
      previousReducedMotion !== prefersReducedMotion() && requestFrame());
  }
  function tick(timestampMs) {
    if (isDisposed || prefersReducedMotion()) return false;
    if (
      (Number.isFinite(timestampMs) || (timestampMs = globalThis.performance?.now() ?? Date.now()),
      ![...effectsByBindingKey.values()].some(needsAnimation))
    ) {
      for (const anyEffect of effectsByBindingKey.values()) anyEffect.lastTick = null;
      return ((lastTickMs = -Infinity), false);
    }
    const frameIntervalMs = 1000 / 30;
    if (timestampMs >= lastTickMs && timestampMs - lastTickMs < frameIntervalMs) return true;
    lastTickMs =
      Number.isFinite(lastTickMs) && timestampMs >= lastTickMs
        ? timestampMs - ((timestampMs - lastTickMs) % frameIntervalMs)
        : timestampMs;
    let shouldAnimate = false,
      hasUniformsChanged = false;
    for (const animatedEffect of effectsByBindingKey.values()) {
      if (!isVisibleInScene(animatedEffect)) {
        animatedEffect.lastTick = null;
        continue;
      }
      const uniforms2 = animatedEffect.mesh.material.uniforms;
      if (
        uniforms2.flowOpacity.value !== animatedEffect.target ||
        uniforms2.flowOverview.value !== animatedEffect.overviewTarget
      ) {
        animatedEffect.startTime === null && (animatedEffect.startTime = timestampMs);
        const fadeProgress = Math.max(
            0,
            Math.min(1, (timestampMs - animatedEffect.startTime) / 240),
          ),
          opacityValue =
            animatedEffect.startOpacity +
            (animatedEffect.target - animatedEffect.startOpacity) * fadeProgress,
          easedProgress = fadeProgress * fadeProgress * (3 - 2 * fadeProgress),
          animatedOverviewValue =
            animatedEffect.startOverview +
            (animatedEffect.overviewTarget - animatedEffect.startOverview) * easedProgress;
        ((uniforms2.flowOpacity.value !== opacityValue ||
          uniforms2.flowOverview.value !== animatedOverviewValue) &&
          (hasUniformsChanged = true),
          (uniforms2.flowOpacity.value = opacityValue),
          (uniforms2.flowOverview.value = animatedOverviewValue),
          fadeProgress === 1
            ? ((uniforms2.flowOpacity.value = animatedEffect.target),
              (uniforms2.flowOverview.value = animatedEffect.overviewTarget),
              (animatedEffect.mesh.visible = animatedEffect.target > 0))
            : (shouldAnimate = true));
      }
      if (
        animatedEffect.mesh.visible &&
        (animatedEffect.target > 0 || uniforms2.flowOpacity.value > 0)
      ) {
        const isPurifierAnimation = animatedEffect.layout?.type === "airpurifier",
          frameDeltaSeconds =
            animatedEffect.lastTick === null
              ? 0
              : Math.max(0, Math.min(0.1, (timestampMs - animatedEffect.lastTick) / 1000));
        if (
          ((animatedEffect.lastTick = timestampMs),
          isPurifierAnimation &&
            (uniforms2.flowStrength.value +=
              (animatedEffect.strengthTarget - uniforms2.flowStrength.value) *
              (1 - Math.exp(-frameDeltaSeconds * 7))),
          animatedEffect.binding.bathEffect === "light")
        ) {
          animatedEffect.lastTick = null;
          continue;
        }
        const flowTimeSeconds = isPurifierAnimation
          ? uniforms2.flowTime.value +
            frameDeltaSeconds * (0.35 + uniforms2.flowStrength.value * 1.1)
          : (timestampMs / 1000) % 1000;
        (uniforms2.flowTime.value !== flowTimeSeconds && (hasUniformsChanged = true),
          (uniforms2.flowTime.value = flowTimeSeconds),
          (shouldAnimate = true));
      } else animatedEffect.lastTick = null;
    }
    return (hasUniformsChanged && requestFrame(), shouldAnimate);
  }
  const handleReducedMotionChange = () => {
    isDisposed || (updateEffectStates(), requestFrame());
  };
  return (
    reducedMotionQuery?.addEventListener?.("change", handleReducedMotionChange),
    {
      setRoot: setRoot,
      setState: setState,
      tick: tick,
      nextDelay() {
        return !isDisposed &&
          !prefersReducedMotion() &&
          [...effectsByBindingKey.values()].some(needsAnimation)
          ? 1000 / 30
          : Infinity;
      },
      dispose() {
        if (!isDisposed) {
          ((isDisposed = true),
            reducedMotionQuery?.removeEventListener?.("change", handleReducedMotionChange));
          for (const disposedEffect of effectsByBindingKey.values()) disposeEffect(disposedEffect);
          (effectsByBindingKey.clear(), map.clear(), (list = []), (options = {}), (value = null));
        }
      },
    }
  );
}
