export const DESIGNS = {
  traveler: {
    name: "软帽小旅人",
    en: "THE SOFT-HAT TRAVELER",
    description: "偏向一侧的软帽，圆润短外套。\n小步轻走，停下来会看看周围。",
    height: 1.35,
    pace: 1,
  },
  bean: {
    name: "豆豆小人",
    en: "THE LITTLE BEAN",
    description: "大圆头、豆子身体与迷你小帽。\n短腿交替迈步，带一点俏皮摇摆。",
    height: 1.33,
    pace: 0.78,
  },
  glow: {
    name: "小灯灵",
    en: "THE LITTLE GLOW",
    description: "实心灯罩、温暖微光与小披肩。\n细腿慢走，光线像呼吸一样起伏。",
    height: 1.45,
    pace: 0.82,
  },
};
export function createWalker(THREE, outfitColor = 5421233, designKey = "traveler") {
  DESIGNS[designKey] || (designKey = "traveler");
  const walkerGroup = new THREE.Group();
  walkerGroup.name = "HB-" + designKey;
  const outfitMaterial = new THREE.MeshStandardMaterial({
      color: outfitColor,
      roughness: 0.9,
    }),
    accentMaterial = new THREE.MeshStandardMaterial({
      color: 16774886,
      roughness: 0.9,
    }),
    darkMaterial = new THREE.MeshStandardMaterial({
      color: 3425857,
      roughness: 1,
    });
  function addMesh(geometry, material, position, parentGroup = walkerGroup) {
    const mesh = new THREE.Mesh(geometry, material);
    return (
      mesh.position.set(...position),
      (mesh.castShadow = true),
      (mesh.receiveShadow = false),
      parentGroup.add(mesh),
      mesh
    );
  }
  function addSphere(scaleVector, spherePosition, sphereMaterial, sphereParent = walkerGroup) {
    const sphereMesh = addMesh(
      new THREE.SphereGeometry(1, 32, 20),
      sphereMaterial,
      spherePosition,
      sphereParent,
    );
    return (sphereMesh.scale.set(...scaleVector), sphereMesh);
  }
  function addLathe(profilePoints, latheMaterial, latheParent = walkerGroup) {
    return addMesh(
      new THREE.LatheGeometry(
        profilePoints.map(([profileX, profileY]) => new THREE.Vector2(profileX, profileY)),
        36,
      ),
      latheMaterial,
      [0, 0, 0],
      latheParent,
    );
  }
  const bodyGroup = new THREE.Group();
  walkerGroup.add(bodyGroup);
  const headGroup = new THREE.Group();
  bodyGroup.add(headGroup);
/** 角色部件表：基础骨架在创建时就填好，帽子 / 长袍 / 发光材质等由各套装扮按需挂上，所以除骨架外都允许缺省。 */
type CharacterParts = {
  body: any;
  headRig: any;
  arms: any[];
  legs: any[];
  robe?: any;
  hat?: any;
  glowMat?: any;
  shadeMat?: any;
  [partName: string]: any;
};

  const armPivots = [],
    legPivots = [],
    parts: CharacterParts = {
      body: bodyGroup,
      headRig: headGroup,
      arms: armPivots,
      legs: legPivots,
    };
  function addEyes(eyeY, eyeZ, eyeSpacing = 0.055, eyeRadius = 0.012, eyeParent = headGroup) {
    for (const side of [-1, 1])
      addSphere(
        [eyeRadius, eyeRadius * 1.3, 0.01],
        [side * eyeSpacing, eyeY, eyeZ],
        darkMaterial,
        eyeParent,
      );
  }
  function addArms(shoulderY, shoulderOffsetX, armLength, armRadius) {
    for (const sideSign of [-1, 1]) {
      const armPivot = new THREE.Group();
      (armPivot.position.set(sideSign * shoulderOffsetX, shoulderY, 0),
        bodyGroup.add(armPivot),
        addSphere(
          [armRadius, armLength / 2, armRadius],
          [sideSign * 0.012, -armLength / 2, 0],
          outfitMaterial,
          armPivot,
        ),
        addSphere(
          [armRadius * 0.57, armRadius * 0.66, armRadius * 0.58],
          [sideSign * 0.012, -armLength, 0],
          accentMaterial,
          armPivot,
        ),
        (armPivot.rotation.z = sideSign * 0.12),
        armPivots.push(armPivot));
    }
  }
  function addLegs(hipY, hipOffsetX, legLength, legRadius, footDepth, footHeight) {
    for (const legSideSign of [-1, 1]) {
      const hipGroup = new THREE.Group();
      (hipGroup.position.set(legSideSign * hipOffsetX, hipY, 0),
        walkerGroup.add(hipGroup),
        addMesh(
          new THREE.CylinderGeometry(legRadius, legRadius * 0.94, legLength, 12),
          accentMaterial,
          [0, -legLength / 2, 0],
          hipGroup,
        ));
      const kneeGroup = new THREE.Group();
      ((kneeGroup.position.y = -legLength),
        hipGroup.add(kneeGroup),
        addMesh(
          new THREE.CylinderGeometry(legRadius * 0.94, legRadius * 0.85, legLength, 12),
          accentMaterial,
          [0, -legLength / 2, 0],
          kneeGroup,
        ));
      const footMesh = addSphere(
        [legRadius * 1.6, footHeight, footDepth],
        [0, -legLength, 0.025],
        darkMaterial,
        kneeGroup,
      );
      legPivots.push({
        hip: hipGroup,
        knee: kneeGroup,
        foot: footMesh,
      });
    }
    walkerGroup.userData.soleHeight = footHeight;
  }
  if (designKey === "traveler") {
    ((parts.robe = addLathe(
      [
        [0, 0.36],
        [0.16, 0.36],
        [0.209, 0.38],
        [0.225, 0.43],
        [0.224, 0.56],
        [0.21, 0.71],
        [0.176, 0.83],
        [0.105, 0.877],
        [0, 0.884],
      ],
      outfitMaterial,
      bodyGroup,
    )),
      addMesh(
        new THREE.CylinderGeometry(0.049, 0.052, 0.09, 16),
        accentMaterial,
        [0, 0.903, 0],
        bodyGroup,
      ),
      addSphere([0.188, 0.206, 0.177], [0, 1.052, 0.01], accentMaterial, headGroup),
      addEyes(1.064, 0.184));
    const hatBrimGeometry = new THREE.LatheGeometry(
        [
          [0, 0],
          [0.177, 0],
          [0.215, 0.019],
          [0.255, 0.072],
          [0.25, 0.104],
          [0.209, 0.153],
          [0.13, 0.19],
          [0, 0.203],
        ].map(([brimX, brimY]) => new THREE.Vector2(brimX, brimY)),
        40,
      ),
      brimPositions = hatBrimGeometry.attributes.position;
    for (let vertexIndex = 0; vertexIndex < brimPositions.count; vertexIndex++) {
      const vertexY = brimPositions.getY(vertexIndex);
      (brimPositions.setX(vertexIndex, brimPositions.getX(vertexIndex) - (0.088 * vertexY) / 0.203),
        brimPositions.setY(vertexIndex, vertexY + 0.022 * brimPositions.getX(vertexIndex)));
    }
    (hatBrimGeometry.computeVertexNormals(),
      (parts.hat = addMesh(hatBrimGeometry, outfitMaterial, [0, 1.152, 0], headGroup)),
      addArms(0.801, 0.18, 0.205, 0.061),
      addLegs(0.404, 0.099, 0.174, 0.029, 0.066, 0.028));
  }
  if (
    (designKey === "bean" &&
      ((parts.robe = addSphere([0.274, 0.298, 0.224], [0, 0.538, 0], outfitMaterial, bodyGroup)),
      addSphere([0.281, 0.279, 0.253], [0, 0.998, 0.018], accentMaterial, headGroup),
      addEyes(1.006, 0.269, 0.075, 0.016),
      (parts.hat = addSphere(
        [0.205, 0.073, 0.188],
        [-0.052, 1.238, -0.025],
        outfitMaterial,
        headGroup,
      )),
      addSphere([0.026, 0.037, 0.024], [-0.102, 1.308, -0.025], outfitMaterial, headGroup),
      addArms(0.646, 0.258, 0.135, 0.051),
      addLegs(0.282, 0.125, 0.096, 0.039, 0.083, 0.039)),
    designKey === "glow")
  ) {
    ((parts.robe = addLathe(
      [
        [0, 0.32],
        [0.13, 0.32],
        [0.183, 0.35],
        [0.207, 0.43],
        [0.199, 0.57],
        [0.155, 0.72],
        [0.1, 0.8],
        [0, 0.817],
      ],
      outfitMaterial,
      bodyGroup,
    )),
      addMesh(
        new THREE.CylinderGeometry(0.038, 0.043, 0.1, 16),
        darkMaterial,
        [0, 0.832, 0],
        bodyGroup,
      ));
    const glowMaterial = new THREE.MeshStandardMaterial({
        color: 16770998,
        emissive: 16762222,
        emissiveIntensity: 1,
        roughness: 0.6,
      }),
      bulbMesh = addSphere([0.11, 0.143, 0.104], [0, 1.083, 0], glowMaterial, headGroup);
    ((bulbMesh.castShadow = false), (bulbMesh.visible = false));
    const shadeMaterial = new THREE.MeshPhysicalMaterial({
        color: 16774877,
        emissive: 16765588,
        emissiveIntensity: 0.38,
        roughness: 0.72,
        metalness: 0,
      }),
      shadeMesh = addLathe(
        [
          [0, 0.858],
          [0.135, 0.858],
          [0.189, 0.88],
          [0.222, 0.946],
          [0.228, 1.15],
          [0.2, 1.29],
          [0.155, 1.33],
          [0, 1.33],
        ],
        shadeMaterial,
        headGroup,
      );
    ((shadeMesh.castShadow = false),
      (shadeMesh.renderOrder = 1),
      (parts.hat = addSphere([0.213, 0.036, 0.213], [0, 1.316, 0], outfitMaterial, headGroup)));
    addMesh(
      new THREE.TorusGeometry(0.04, 0.009, 8, 24),
      outfitMaterial,
      [0, 1.387, 0],
      headGroup,
    );
    (addEyes(1.103, 0.229, 0.06, 0.012),
      addArms(0.694, 0.172, 0.14, 0.045),
      addLegs(0.363, 0.085, 0.145, 0.024, 0.053, 0.026),
      (parts.glowMat = glowMaterial),
      (parts.shadeMat = shadeMaterial));
  }
  return (
    (walkerGroup.userData.parts = parts),
    (walkerGroup.userData.outfitMaterial = outfitMaterial),
    (walkerGroup.userData.design = designKey),
    walkerGroup
  );
}

export function animateWalker(walkerRoot, walkPhase, walkAmount, elapsedSeconds) {
  const {
      body: bodyPivot,
      legs: legRigs,
      arms: armRigs,
      headRig: headRig,
    } = walkerRoot.userData.parts,
    isBeanDesign = walkerRoot.userData.design === "bean";
  ((bodyPivot.position.y =
    Math.abs(Math.sin(walkPhase)) * (isBeanDesign ? 0.026 : 0.012) * walkAmount +
    Math.sin(elapsedSeconds * 1.65) * 0.003 * (1 - walkAmount)),
    (bodyPivot.rotation.z = Math.sin(walkPhase) * (isBeanDesign ? 0.055 : 0.018) * walkAmount),
    (bodyPivot.rotation.x = 0.015 * walkAmount),
    (headRig.rotation.y = Math.sin(elapsedSeconds * 0.65) * 0.14 * (1 - walkAmount)));
  for (let legIndex = 0; legIndex < legRigs.length; legIndex++) {
    const legPhase = walkPhase + legIndex * Math.PI;
    ((legRigs[legIndex].hip.rotation.x =
      Math.sin(legPhase) * (isBeanDesign ? 0.4 : 0.3) * walkAmount),
      (legRigs[legIndex].knee.rotation.x = -Math.max(0, Math.cos(legPhase)) * 0.24 * walkAmount));
  }
  for (let armIndex = 0; armIndex < armRigs.length; armIndex++)
    armRigs[armIndex].rotation.x = -Math.sin(walkPhase + armIndex * Math.PI) * 0.14 * walkAmount;
  walkerRoot.userData.parts.glowMat &&
    ((walkerRoot.userData.parts.glowMat.emissiveIntensity =
      0.9 + Math.sin(elapsedSeconds * 1.7) * 0.13),
    (walkerRoot.userData.parts.shadeMat.emissiveIntensity =
      0.38 + Math.sin(elapsedSeconds * 1.7) * 0.045));
}
export function disposeWalker(walkerToDispose) {
  const geometrySet = new Set(),
    materialSet = new Set();
  (walkerToDispose.traverse((childNode) => {
    if (childNode.isMesh) {
      geometrySet.add(childNode.geometry);
      for (const childMaterial of Array.isArray(childNode.material)
        ? childNode.material
        : [childNode.material])
        materialSet.add(childMaterial);
    }
  }),
    geometrySet.forEach((geometryToDispose: any) => geometryToDispose.dispose()),
    materialSet.forEach((materialToDispose: any) => materialToDispose.dispose()),
    walkerToDispose.removeFromParent());
}
