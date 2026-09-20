/**
 * 虚拟人物（人体模型）的程序化建模、步态动画与资源释放。
 *
 * 在 3D 子系统里的位置：presence-scene.js 需要「一个会沿路线走路的小人」，但项目里
 * 不引入外部人物模型资源，所有角色都用 three.js 基本几何体当场拼出来，于是把建模
 * 细节集中在本文件：DESIGNS 是可选角色表，createWalker 造模型，animateWalker 用
 * 行走相位驱动四肢摆动，disposeWalker 回收几何体与材质。
 *
 * 坐标系与单位约定（与舞台其它 overlay 一致，写错会导致人物悬空或穿地）：
 * - 场景 1 单位 = 1 米，Y 轴向上，模型正面朝 +Z（转向角按 atan2(dx, dz) 计算）。
 * - 根节点原点即脚底所在的水平面；实际贴地由 presence-scene.js 量脚底包围盒后微调。
 * - 角色总高 1.3~1.5 米（见 DESIGNS 的 height），鞋底高度写进 userData.soleHeight，
 *   场景侧用「模型缩放 × soleHeight」换算落地补偿，因此这个字段不能省。
 *
 * 根节点 userData 上的字段是跨文件契约，改名会静默失效：
 * - parts：{ body, headRig, arms, legs, ... }，animateWalker 的摆动入口；
 * - design：设计键，animateWalker 据此区分「豆豆」这类幅度更大的角色。
 *
 * 对外提供：DESIGNS、createWalker、animateWalker、disposeWalker。
 */

/** 可选人物方案；name / description 直接作为配置界面文案，height（米）与 pace 仅为设计参考值。 */
export const DESIGNS = {
  traveler: {
    name: "软帽小旅人",
    en: "THE SOFT-HAT TRAVELER",
    description: "偏向一侧的软帽，圆润短外套。\n小步轻走，停下来会看看周围。",
    height: 1.35,
    pace: 1
  },
  bean: {
    name: "豆豆小人",
    en: "THE LITTLE BEAN",
    description: "大圆头、豆子身体与迷你小帽。\n短腿交替迈步，带一点俏皮摇摆。",
    height: 1.33,
    pace: 0.78
  },
  glow: {
    name: "小灯灵",
    en: "THE LITTLE GLOW",
    description: "实心灯罩、温暖微光与小披肩。\n细腿慢走，光线像呼吸一样起伏。",
    height: 1.45,
    pace: 0.82
  }
};
/**
 * 按设计键拼装一个可走动的人物模型。
 */
export function createWalker(THREE, outfitColor = 5421233, designKey = "traveler") {
  // 容错而非抛错：历史配置里可能存着已下线的角色名，回退比让整个场景加载失败更合适。
  if (!DESIGNS[designKey]) {
    designKey = "traveler";
  }
  const walkerGroup = new THREE.Group();
  // HB- 前缀标记「应用自建节点」，在场景遍历时能一眼区分人物与户型模型。
  walkerGroup.name = "HB-" + designKey;
  // 布料统一高粗糙度、保持 metalness 默认 0，避免环境光下出现塑料感高光。
  const outfitMaterial = new THREE.MeshStandardMaterial({
    color: outfitColor,
    roughness: 0.9
  });
  // 0xFFF6E6 米白，用于脸、帽子、鞋等点缀；换外套色时不跟着变，保持配色层次。
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 16774886,
    roughness: 0.9
  });
  // 0x344641 深墨绿，用于眼睛与鞋底这类需要「压住」的深色部件。
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 3425857,
    roughness: 1
  });
  /**
   * 造一个网格并挂到指定父节点。
   */
  function addMesh(geometry, material, position, parentGroup = walkerGroup) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    // 人物投影是场景里唯一「与地面接触」的暗示，必须投射；自身不接收阴影也能省一次采样，
    // 这个体量的卡通角色自阴影肉眼几乎看不出。
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parentGroup.add(mesh);
    return mesh;
  }
  /**
   * 用「单位球 + 三轴缩放」造椭球，代替给每个部件单独建球体几何。
   */
  function addSphere(scaleVector, spherePosition, sphereMaterial, sphereParent = walkerGroup) {
    // 32×20 分段是顶点数与圆润度的折中：角色在屏幕里只占几十像素，再细分看不出差别。
    const sphereMesh = addMesh(
      new THREE.SphereGeometry(1, 32, 20),
      sphereMaterial,
      spherePosition,
      sphereParent
    );
    sphereMesh.scale.set(...scaleVector);
    return sphereMesh;
  }
  /**
   * 用旋转体（Lathe）造斗篷、灯罩这类回转曲面。
   */
  function addLathe(profilePoints, latheMaterial, latheParent = walkerGroup) {
    // 36 段环向分段：斗篷与灯罩接近圆柱，这个段数在屏幕尺寸下已看不出棱角。
    return addMesh(
      new THREE.LatheGeometry(
        profilePoints.map(([profileX, profileY]) => new THREE.Vector2(profileX, profileY)),
        36
      ),
      latheMaterial,
      [0, 0, 0],
      latheParent
    );
  }
  const bodyGroup = new THREE.Group();
  walkerGroup.add(bodyGroup);
  const headGroup = new THREE.Group();
  bodyGroup.add(headGroup);
  // 两套枢轴分别收集手臂与腿，animateWalker 靠数组下标推相位（下标 0 / 1 即左右两侧）。
  const armPivots = [];
  const legPivots = [];
  // parts 会被写进 userData 供场景侧驱动动画，键名是跨文件契约。
  const parts = {
    body: bodyGroup,
    headRig: headGroup,
    arms: armPivots,
    legs: legPivots
  };
  /**
   * 造一对眼睛。
   */
  function addEyes(eyeY, eyeZ, eyeSpacing = 0.055, eyeRadius = 0.012, eyeParent = headGroup) {
    for (const side of [-1, 1]) {
      addSphere(
        // z 向压到 0.01：眼球是贴在脸上的薄片，做圆球会凸出脸外。
        [eyeRadius, eyeRadius * 1.3, 0.01],
        [side * eyeSpacing, eyeY, eyeZ],
        darkMaterial,
        eyeParent
      );
    }
  }
  /**
   * 造一对手臂：每侧一个绕肩枢轴，摆动只改枢轴的 rotation.x。
   */
  function addArms(shoulderY, shoulderOffsetX, armLength, armRadius) {
    for (const sideSign of [-1, 1]) {
      const armPivot = new THREE.Group();
      armPivot.position.set(sideSign * shoulderOffsetX, shoulderY, 0);
      bodyGroup.add(armPivot);
      addSphere(
        // 上臂是「半个椭球」：y 向取 armLength/2、向下偏移半长，让顶点落在肩关节处。
        [armRadius, armLength / 2, armRadius],
        [sideSign * 0.012, -armLength / 2, 0],
        outfitMaterial,
        armPivot
      );
      addSphere(
        // 手掌比上臂小一圈（0.57 倍左右），用点缀色与袖子区分开。
        [armRadius * 0.57, armRadius * 0.66, armRadius * 0.58],
        [sideSign * 0.012, -armLength, 0],
        accentMaterial,
        armPivot
      );
      // 0.12 弧度让手臂微微外张，避免与躯干刚性穿插。
      armPivot.rotation.z = sideSign * 0.12;
      armPivots.push(armPivot);
    }
  }
  /**
   * 造两条腿：髋 → 膝两段式，便于膝盖只向后弯。
   */
  function addLegs(hipY, hipOffsetX, legLength, legRadius, footDepth, footHeight) {
    for (const legSideSign of [-1, 1]) {
      const hipGroup = new THREE.Group();
      hipGroup.position.set(legSideSign * hipOffsetX, hipY, 0);
      walkerGroup.add(hipGroup);
      // 圆柱上粗下细（1 : 0.94），避免直筒状看起来像塑料管。
      addMesh(
        new THREE.CylinderGeometry(legRadius, legRadius * 0.94, legLength, 12),
        accentMaterial,
        [0, -legLength / 2, 0],
        hipGroup
      );
      const kneeGroup = new THREE.Group();
      kneeGroup.position.y = -legLength;
      hipGroup.add(kneeGroup);
      addMesh(
        new THREE.CylinderGeometry(legRadius * 0.94, legRadius * 0.85, legLength, 12),
        accentMaterial,
        [0, -legLength / 2, 0],
        kneeGroup
      );
      const footMesh = addSphere(
        // 脚掌是压扁的椭球（z 向 footDepth 更长）；+0.025 让脚尖略微前伸。
        [legRadius * 1.6, footHeight, footDepth],
        [0, -legLength, 0.025],
        darkMaterial,
        kneeGroup
      );
      legPivots.push({
        hip: hipGroup,
        knee: kneeGroup,
        foot: footMesh
      });
    }
    // 鞋底高度是「原点在脚底平面」的补充信息：场景侧要按模型缩放换算贴地补偿。
    walkerGroup.userData.soleHeight = footHeight;
  }
  // 三种角色共用上面的枢轴与工具函数，下面只各自摆部件；所有数值单位都是米，为手调值。
  if (designKey === "traveler") {
    // 斗篷：剖面从下摆（y=0.36，半径 0.225）收到领口（y=0.884），中途略微外鼓。
    parts.robe = addLathe(
      [
        [0, 0.36],
        [0.16, 0.36],
        [0.209, 0.38],
        [0.225, 0.43],
        [0.224, 0.56],
        [0.21, 0.71],
        [0.176, 0.83],
        [0.105, 0.877],
        [0, 0.884]
      ],
      outfitMaterial,
      bodyGroup
    );
    // 脖子：一段短圆柱，压住斗篷领口与头之间的接缝。
    addMesh(
      new THREE.CylinderGeometry(0.049, 0.052, 0.09, 16),
      accentMaterial,
      [0, 0.903, 0],
      bodyGroup
    );
    // 头是略扁的椭球，z 方向 +0.01 让脸略微前探，正面看起来更有朝向感。
    addSphere([0.188, 0.206, 0.177], [0, 1.052, 0.01], accentMaterial, headGroup);
    // 眼睛略高于头心、贴在前表面；默认眼距/半适用于旅人的脸宽。
    addEyes(1.064, 0.184);
    const hatBrimGeometry = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.177, 0],
        [0.215, 0.019],
        [0.255, 0.072],
        [0.25, 0.104],
        [0.209, 0.153],
        [0.13, 0.19],
        [0, 0.203]
      ].map(([brimX, brimY]) => new THREE.Vector2(brimX, brimY)),
      40
    );
    const brimPositions = hatBrimGeometry.attributes.position;
    // 手工把帽檐顶点「向后翻卷」：按高度线性回收半径（0.088 是翻卷量，0.203 是檐口高度），
    // 再让 y 随新的 x 微抬（0.022），得到软帽特有的上翘弧线 —— 纯旋转体做不出这个弧度。
    for (let vertexIndex = 0; vertexIndex < brimPositions.count; vertexIndex++) {
      const vertexY = brimPositions.getY(vertexIndex);
      // 先写 X：下一行的 Y 补偿读回的是刚写入的新 X，两层修正有意耦合。
      brimPositions.setX(vertexIndex, brimPositions.getX(vertexIndex) - (vertexY * 0.088) / 0.203);
      brimPositions.setY(vertexIndex, vertexY + brimPositions.getX(vertexIndex) * 0.022);
    }
    // 手改顶点后法线仍是旧的，必须重算，否则帽檐光照会保持原旋转体的朝向。
    hatBrimGeometry.computeVertexNormals();
    // 帽子整体坐在头顶（1.152 米）之上。
    parts.hat = addMesh(hatBrimGeometry, outfitMaterial, [0, 1.152, 0], headGroup);
    // 肩高 0.801（领口略下）、臂长 0.205；髋高 0.404、腿长 0.174、鞋底高 0.028 米。
    addArms(0.801, 0.18, 0.205, 0.061);
    addLegs(0.404, 0.099, 0.174, 0.029, 0.066, 0.028);
  }
  if (designKey === "bean") {
    // 豆子身体：一颗略扁的球直接充当外衣，没有独立躯干与裙摆。
    parts.robe = addSphere([0.274, 0.298, 0.224], [0, 0.538, 0], outfitMaterial, bodyGroup);
    // 头身比刻意夸张（头半径 0.281 大于旅人的 0.188），这是豆豆最醒目的辨识特征。
    addSphere([0.281, 0.279, 0.253], [0, 0.998, 0.018], accentMaterial, headGroup);
    // 脸更大，眼睛相应放大并拉开眼距（0.075 / 半径 0.016）。
    addEyes(1.006, 0.269, 0.075, 0.016);
    // 帽子歪戴：整体向左后偏移（-0.052, -0.025），才有「随手扣上」的俏皮感。
    parts.hat = addSphere(
      [0.205, 0.073, 0.188],
      [-0.052, 1.238, -0.025],
      outfitMaterial,
      headGroup
    );
    // 帽顶小圆球（半径 0.026）是帽尖，位置跟着帽子的偏移走。
    addSphere([0.026, 0.037, 0.024], [-0.102, 1.308, -0.025], outfitMaterial, headGroup);
    // 短手短腿：肩高 0.646 / 臂长 0.135；髋高 0.282 / 腿长 0.096、鞋底 0.039 米。
    addArms(0.646, 0.258, 0.135, 0.051);
    addLegs(0.282, 0.125, 0.096, 0.039, 0.083, 0.039);
  }
  if (designKey === "glow") {
    // 小披肩：剖面 0.32（下摆）到 0.817（肩），腰身处略微收进再放开。
    parts.robe = addLathe(
      [
        [0, 0.32],
        [0.13, 0.32],
        [0.183, 0.35],
        [0.207, 0.43],
        [0.199, 0.57],
        [0.155, 0.72],
        [0.1, 0.8],
        [0, 0.817]
      ],
      outfitMaterial,
      bodyGroup
    );
    // 脖子用深色而不是点缀色：要与下方暖色灯罩形成对比，避免整体糊成一团亮色。
    addMesh(
      new THREE.CylinderGeometry(0.038, 0.043, 0.1, 16),
      darkMaterial,
      [0, 0.832, 0],
      bodyGroup
    );
    // 灯泡本体：自身发光（emissive 0xFFC56E，强度 1）代表「小灯灵」的光源。
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 16770998,
      emissive: 16762222,
      emissiveIntensity: 1,
      roughness: 0.6
    });
    const bulbMesh = addSphere([0.11, 0.143, 0.104], [0, 1.083, 0], glowMaterial, headGroup);
    // 灯泡藏在灯罩内部：渲染出来会在罩内壁穿帮产生硬边，因此只保留节点不渲染，
    // 观感由下面对灯罩材质的自发光承担。
    bulbMesh.castShadow = false;
    bulbMesh.visible = false;
    // 灯罩用 MeshPhysicalMaterial：需要一点半透「玻璃感」，标准材质做不到这种层次。
    const shadeMaterial = new THREE.MeshPhysicalMaterial({
      color: 16774877,
      emissive: 16765588,
      emissiveIntensity: 0.38,
      roughness: 0.72,
      metalness: 0
    });
    const shadeMesh = addLathe(
      [
        [0, 0.858],
        [0.135, 0.858],
        [0.189, 0.88],
        [0.222, 0.946],
        [0.228, 1.15],
        [0.2, 1.29],
        [0.155, 1.33],
        [0, 1.33]
      ],
      shadeMaterial,
      headGroup
    );
    // 灯罩不投影（自发光体不该有实心阴影），并显式排在默认层之后绘制，
    // 避免与内部灯泡共面时的透明排序闪烁。
    shadeMesh.castShadow = false;
    shadeMesh.renderOrder = 1;
    // 罩顶圆盘：封住灯罩口，兼作「帽子」。
    parts.hat = addSphere([0.213, 0.036, 0.213], [0, 1.316, 0], outfitMaterial, headGroup);
    // 提环（圆环体，管径 0.009），悬在罩顶上 0.057 米处。
    addMesh(
      new THREE.TorusGeometry(0.04, 0.009, 8, 24),
      outfitMaterial,
      [0, 1.387, 0],
      headGroup
    );
    // 脸更窄，眼睛也跟着收（眼距 0.06、半径 0.012）。
    addEyes(1.103, 0.229, 0.06, 0.012);
    // 细手细腿：肩高 0.694 / 臂长 0.14；髋高 0.363 / 腿长 0.145、鞋底 0.026 米。
    addArms(0.694, 0.172, 0.14, 0.045);
    addLegs(0.363, 0.085, 0.145, 0.024, 0.053, 0.026);
    // 两个自发光材质要留给 animateWalker 做呼吸式明暗，必须在 parts 上挂一份引用。
    parts.glowMat = glowMaterial;
    parts.shadeMat = shadeMaterial;
  }
  // 以下两个 userData 字段是跨文件契约（场景侧读 parts、动画分支读 design），
  // 返回前必须写全。
  walkerGroup.userData.parts = parts;
  walkerGroup.userData.design = designKey;
  return walkerGroup;
}
/**
 * 按行走相位摆一次姿势（每帧调用，纯函数式改动，不创建对象）。
 */
export function animateWalker(walkerRoot, walkPhase, walkAmount, elapsedSeconds) {
  const {
    body: bodyPivot,
    legs: legRigs,
    arms: armRigs,
    headRig: headRig
  } = walkerRoot.userData.parts;
  // 豆豆头重脚轻，同样幅度下观感更夸张，因此它的弹跳与侧摆单独取更大系数。
  const isBeanDesign = walkerRoot.userData.design === "bean";
  bodyPivot.position.y =
    // 用 |sin| 而不是 sin：每迈一步身体向上弹一次（一个步幅两次起伏中的「一次」）。
    Math.abs(Math.sin(walkPhase)) * (isBeanDesign ? 0.026 : 0.012) * walkAmount +
    // 站立时叠加呼吸起伏（1.65 rad/s），走动时淡出，否则会与步伐弹跳打架。
    Math.sin(elapsedSeconds * 1.65) * 0.003 * (1 - walkAmount);
  bodyPivot.rotation.z = Math.sin(walkPhase) * (isBeanDesign ? 0.055 : 0.018) * walkAmount;
  // 行走时轻微前倾 0.015 弧度，静止时回正。
  bodyPivot.rotation.x = walkAmount * 0.015;
  // 回头张望只在停下时出现（0.65 rad/s、±0.14 弧度），走动时视线保持朝前。
  headRig.rotation.y = Math.sin(elapsedSeconds * 0.65) * 0.14 * (1 - walkAmount);
  // 两条腿相位相差 π（反相），同一时刻一条前摆一条后摆。
  for (let legIndex = 0; legIndex < legRigs.length; legIndex++) {
    const legPhase = walkPhase + legIndex * Math.PI;
    // 抬腿幅度：豆豆 0.4、其它 0.3 弧度（约 17°），配短腿看起来频率更快。
    legRigs[legIndex].hip.rotation.x = Math.sin(legPhase) * (isBeanDesign ? 0.4 : 0.3) * walkAmount;
    // 膝盖只向后弯，因此取 -max(0, cos)：cos 为负的半周期不产生角度，且不会反关节。
    legRigs[legIndex].knee.rotation.x = -Math.max(0, Math.cos(legPhase)) * 0.24 * walkAmount;
  }
  // 手臂与同侧腿反相（对侧摆臂），幅度 0.14 弧度，比腿小得多。
  for (let armIndex = 0; armIndex < armRigs.length; armIndex++) {
    armRigs[armIndex].rotation.x = -Math.sin(walkPhase + armIndex * Math.PI) * 0.14 * walkAmount;
  }
  // 只有「小灯灵」带自发光材质，用同一相位（1.7 rad/s）做呼吸：灯泡幅度大、灯罩幅度小，
  // 形成「光源在罩内明暗」的层次。
  if (walkerRoot.userData.parts.glowMat) {
    walkerRoot.userData.parts.glowMat.emissiveIntensity =
      0.9 + Math.sin(elapsedSeconds * 1.7) * 0.13;
    walkerRoot.userData.parts.shadeMat.emissiveIntensity =
      0.38 + Math.sin(elapsedSeconds * 1.7) * 0.045;
  }
}
/**
 * 释放角色占用的显存并摘出场景。
 */
export function disposeWalker(walkerToDispose) {
  // 用 Set 去重：一次 createWalker 里多个网格共用同一几何体与材质（例如所有眼睛共用一个
  // 球体几何），逐个 dispose 会重复释放同一份资源。
  const geometrySet = new Set();
  const materialSet = new Set();
  walkerToDispose.traverse(childNode => {
    if (childNode.isMesh) {
      geometrySet.add(childNode.geometry);
      // material 可能是数组（多材质网格），两种形态都要收进来。
      for (const childMaterial of Array.isArray(childNode.material)
        ? childNode.material
        : [childNode.material]) {
        materialSet.add(childMaterial);
      }
    }
  });
  geometrySet.forEach(geometryToDispose => geometryToDispose.dispose());
  materialSet.forEach(materialToDispose => materialToDispose.dispose());
  // 顺手摘出父节点，调用方无需自己记挂在谁下面。
  walkerToDispose.removeFromParent();
}
