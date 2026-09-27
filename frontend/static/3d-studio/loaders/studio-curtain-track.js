/**
 * 窗帘轨道与帘布的生成（含轨道帘、卷帘、梦幻帘）：3D 工作室生成窗帘时的几何构造模块，
 */
import { clampOptionalNumber } from "../../utils/numbers.js?v=2609271226";
// 未绑定窗帘的默认开合度：与运行时的未绑定兜底（curtain-motion）必须同值，故只定义在
import { COVER_DEFAULT_PREVIEW_POSITION } from "../../utils/cover-features.js?v=2609271226";

/**
 * 窗帘形态（curtainForm）取值。
 */
export const CURTAIN_FORM_STANDARD = "standard";
export const CURTAIN_FORM_ROLLER = "roller";

export function resolveCurtainForm(inputOptions = {}) {
  const rawCurtainForm = inputOptions.curtainForm ?? inputOptions.curtainStyle;
  return rawCurtainForm === CURTAIN_FORM_ROLLER ? CURTAIN_FORM_ROLLER : CURTAIN_FORM_STANDARD;
}

/**
 * 归一化窗帘轨道参数。
 */
export function normalizeCurtainTrack(inputOptions = {}) {
  // 卷帘没有轨道形态可言：没有回折段、没有拐角，帘布也不会分成左右两片。
  const curtainIsRoller = resolveCurtainForm(inputOptions) === CURTAIN_FORM_ROLLER;
  return {
    // 形态字段**始终落键**（非法值回落 standard）。若像 curtainFabric 那样「有值才写」，
    curtainForm: curtainIsRoller ? CURTAIN_FORM_ROLLER : CURTAIN_FORM_STANDARD,
    // 只有直轨 / L 型 / U 型三种形态，其余一律回落到直轨（未知值会让几何生成出错）；
    curtainTrack: curtainIsRoller
      ? "straight"
      : ["straight", "l", "u"].includes(inputOptions.curtainTrack)
        ? inputOptions.curtainTrack
        : "straight",
    // 拐角方向默认朝右，与常见户型主窗的布置一致。
    curtainCorner: inputOptions.curtainCorner === "left" ? "left" : "right",
    // 回折段限制在 0.2~7.8 米：太短看不出拐角，太长会超出常见的房间进深。
    curtainLeftLength: clampOptionalNumber(inputOptions.curtainLeftLength, 0.2, 7.8, 1.2),
    curtainRightLength: clampOptionalNumber(inputOptions.curtainRightLength, 0.2, 7.8, 1.2),
    curtainMeet: clampOptionalNumber(inputOptions.curtainMeet, 5, 95, 50),
    // 未设置时按默认开合度展示（见 COVER_DEFAULT_PREVIEW_POSITION）：新建 / 旧模型都得到一个
    curtainPreview: clampOptionalNumber(
      inputOptions.curtainPreview,
      0,
      100,
      COVER_DEFAULT_PREVIEW_POSITION
    ),
    // 面料是可选字段：未给出时不下发该键，由上层按默认面料处理。
    ...(inputOptions.curtainFabric === "cloth" || inputOptions.curtainFabric === "sheer"
      ? {
          curtainFabric: inputOptions.curtainFabric
        }
      : {})
  };
}

/**
 * 计算窗帘轨道的平面占用进深（米，沿 z 方向）。
 */
export function curtainFootprintDepth(trackConfig) {
  const trackModel = normalizeCurtainTrack(trackConfig);
  if (trackModel.curtainTrack === "straight") {
    // 直轨的进深由调用方给出，默认 0.18 米（轨道厚度 + 帘布褶皱所需余量）。
    return clampOptionalNumber(trackConfig.depth, 0.05, 8, 0.18);
  } else {
    return (
      0.18 +
      (trackModel.curtainTrack === "u"
        ? Math.max(trackModel.curtainLeftLength, trackModel.curtainRightLength)
        : trackModel.curtainCorner === "left"
          ? trackModel.curtainLeftLength
          : trackModel.curtainRightLength)
    );
  }
}

/**
 * 创建一条窗帘轨道的平面参数（折线顶点 + 弧长采样器）。
 */
export function createCurtainTrack(options = {}) {
  const normalizedTrack = normalizeCurtainTrack(options);
  const width = clampOptionalNumber(options.width ?? options.curtainWidth, 0.2, 8, 1.8);
  // 回折段只有 L 型（且拐角在对应一侧）与 U 型才有，其余情况长度为 0。
  const leftReturnLength =
    normalizedTrack.curtainTrack === "u" ||
    (normalizedTrack.curtainTrack === "l" && normalizedTrack.curtainCorner === "left")
      ? normalizedTrack.curtainLeftLength
      : 0;
  const rightReturnLength =
    normalizedTrack.curtainTrack === "u" ||
    (normalizedTrack.curtainTrack === "l" && normalizedTrack.curtainCorner === "right")
      ? normalizedTrack.curtainRightLength
      : 0;
  // 主轨在 z 方向居中：回折段只在前进方向伸出，居中后整体包围盒才不会偏。
  const baseZ = -Math.max(leftReturnLength, rightReturnLength) / 2;
  const vertices = [
    ...(leftReturnLength
      ? [
          {
            x: -width / 2,
            z: baseZ + leftReturnLength
          }
        ]
      : []),
    {
      x: -width / 2,
      z: baseZ
    },
    {
      x: width / 2,
      z: baseZ
    },
    ...(rightReturnLength
      ? [
          {
            x: width / 2,
            z: baseZ + rightReturnLength
          }
        ]
      : [])
  ];
  // 把折线拆成「直线段 + 圆角段」的序列，并按累计弧长采样；
  const segments = [];
  let totalLength = 0;
  // 把一条直线段登记到 segments：记录它在总弧长上的起点与长度，
  const addStraightSegment = (fromPoint, toPoint) => {
    const segmentLength = Math.hypot(toPoint.x - fromPoint.x, toPoint.z - fromPoint.z);
    // 零长度段（重复顶点）会让方向向量除零，直接跳过。
    if (segmentLength < 1e-8) {
      return;
    }
    // 单位方向向量的 x 分量（除以段长完成归一化）。
    const directionX = (toPoint.x - fromPoint.x) / segmentLength;
    // 单位方向向量的 z 分量；两者一起决定该段的采样与切线。
    const directionZ = (toPoint.z - fromPoint.z) / segmentLength;
    segments.push({
      start: totalLength,
      length: segmentLength,
      sample: distanceAlong => ({
        x: fromPoint.x + directionX * distanceAlong,
        z: fromPoint.z + directionZ * distanceAlong,
        tx: directionX,
        tz: directionZ
      })
    });
    totalLength += segmentLength;
  };
  let cursorPoint = vertices[0];
  // 只遍历「中间顶点」：首尾是端点，无需倒角。
  for (let vertexIndex = 1; vertexIndex < vertices.length - 1; vertexIndex++) {
    const previousPoint = vertices[vertexIndex - 1];
    const cornerPoint = vertices[vertexIndex];
    const nextPoint = vertices[vertexIndex + 1];
    const previousLength = Math.hypot(
      cornerPoint.x - previousPoint.x,
      cornerPoint.z - previousPoint.z
    );
    const nextLength = Math.hypot(nextPoint.x - cornerPoint.x, nextPoint.z - cornerPoint.z);
    const filletRadius = Math.min(0.08, previousLength / 3, nextLength / 3);
    // 入边（上一段）的单位方向向量 x 分量，用来往回推圆角起点。
    const previousDirectionX = (cornerPoint.x - previousPoint.x) / previousLength;
    // 入边单位方向向量 z 分量。
    const previousDirectionZ = (cornerPoint.z - previousPoint.z) / previousLength;
    // 出边（下一段）的单位方向向量 x 分量，用来求圆心与拐点后的新起点。
    const nextDirectionX = (nextPoint.x - cornerPoint.x) / nextLength;
    // 出边单位方向向量 z 分量。
    const nextDirectionZ = (nextPoint.z - cornerPoint.z) / nextLength;
    // 圆弧起点在拐点之前一个半径处，圆弧中心沿新方向再前进一个半径。
    const arcStartPoint = {
      x: cornerPoint.x - previousDirectionX * filletRadius,
      z: cornerPoint.z - previousDirectionZ * filletRadius
    };
    addStraightSegment(cursorPoint, arcStartPoint);
    const arcCenter = {
      x: arcStartPoint.x + nextDirectionX * filletRadius,
      z: arcStartPoint.z + nextDirectionZ * filletRadius
    };
    const startAngle = Math.atan2(arcStartPoint.z - arcCenter.z, arcStartPoint.x - arcCenter.x);
    // 二维叉积的符号给出转向（左转 / 右转），弧的采样方向与切线方向都依赖它。
    const turnSign = Math.sign(
      previousDirectionX * nextDirectionZ - previousDirectionZ * nextDirectionX
    );
    // 直角拐角对应四分之一圆弧。
    const arcLength = (filletRadius * Math.PI) / 2;
    segments.push({
      start: totalLength,
      length: arcLength,
      sample: arcDistance => {
        const arcAngle = startAngle + (turnSign * arcDistance) / filletRadius;
        return {
          x: arcCenter.x + filletRadius * Math.cos(arcAngle),
          z: arcCenter.z + filletRadius * Math.sin(arcAngle),
          tx: -turnSign * Math.sin(arcAngle),
          tz: turnSign * Math.cos(arcAngle)
        };
      }
    });
    totalLength += arcLength;
    // 下一段直线从圆弧终点开始。
    cursorPoint = {
      x: cornerPoint.x + nextDirectionX * filletRadius,
      z: cornerPoint.z + nextDirectionZ * filletRadius
    };
  }
  addStraightSegment(cursorPoint, vertices.at(-1));
  return {
    ...normalizedTrack,
    width: width,
    length: totalLength,
    vertices: vertices,
    sample(distance) {
      // 距离先夹到 [0, 总长]，再由所在段完成具体采样。
      const clampedDistance = clampOptionalNumber(distance, 0, totalLength, 0);
      // 找不到（浮点误差落在末尾之外）时退回最后一段。
      const activeSegment =
        segments.find(segment => clampedDistance <= segment.start + segment.length) ||
        segments.at(-1);
      return activeSegment.sample(
        Math.max(0, Math.min(activeSegment.length, clampedDistance - activeSegment.start))
      );
    }
  };
}

/**
 * 计算两片帘布各自占据的轨道区间。
 */
export function curtainPanelRanges(panelTrack, previewPercent = 0, position = "split") {
  // 预览开合按 0.88 的系数收缩而不是 1:1：即使拉到 100%，也要留一成多的帘布，
  const coverageScale = 1 - (clampOptionalNumber(previewPercent, 0, 100, 0) * 0.88) / 100;
  const trackLength = panelTrack.length;
  // 搭接点：两片帘布在轨道的这个位置重叠，由 curtainMeet 百分比决定。
  const meetOffset = (trackLength * panelTrack.curtainMeet) / 100;
  return [
    {
      visible: position !== "right",
      start: 0,
      end: (position === "split" ? meetOffset : trackLength) * coverageScale
    },
    {
      visible: position !== "left",
      start:
        trackLength -
        (position === "split" ? trackLength - meetOffset : trackLength) * coverageScale,
      end: trackLength
    }
  ];
}

/**
 * 创建一片帘布的几何体。
 */
export function createTrackClothGeometry(THREE, clothTrack, clothHeight, fabric = "cloth") {
  // 褶皱数按轨道长度除以褶间距得出：纱帘 0.1 米一褶（更密），布帘 0.15 米；夹在 4~160 褶。
  const folds = Math.max(
    4,
    Math.min(160, Math.round(clothTrack.length / (fabric === "sheer" ? 0.1 : 0.15)))
  );
  // 每褶 8 段、至少 64 段：分段越密，正弦褶皱越平滑。
  const segmentCount = Math.max(64, folds * 8);
  const geometry = new THREE.PlaneGeometry(1, 1, segmentCount, 1);
  // 顶点色通道：poseTrackCloth 会把褶皱的明暗写进来，材质开启 vertexColors 后生效。
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Float32Array((segmentCount + 1) * 6).fill(1), 3)
  );
  geometry.userData.curtainCloth = {
    segments: segmentCount,
    height: clothHeight,
    folds: folds,
    // 面料类型也带下去：poseTrackCloth 要据此决定褶皱暗部的深度。
    fabric: fabric,
    // 褶深：纱帘 2.3 厘米，布帘 4.6 厘米。
    amplitude: fabric === "sheer" ? 0.023 : 0.046
  };
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

/**
 * 按轨道姿态摆放一片帘布的顶点。
 */
export function poseTrackCloth(clothGeometry, posedTrack, panel) {
  const {
    segments: meshSegments,
    height: height,
    folds: foldCount,
    fabric: fabricKind,
    amplitude: amplitude
  } = clothGeometry.userData.curtainCloth;
  const positionAttribute = clothGeometry.attributes.position;
  const colorAttribute = clothGeometry.attributes.color;
  // 分片模式下两片帘布按搭接比例分配褶皱数，视觉上两片密度才协调。
  const foldRatio =
    panel.side === 0 ? posedTrack.curtainMeet / 100 : 1 - posedTrack.curtainMeet / 100;
  const panelFoldCount = Math.max(2, Math.round(foldCount * (panel.split ? foldRatio : 1)));
  for (let segmentIndex = 0; segmentIndex <= meshSegments; segmentIndex++) {
    const foldFraction = segmentIndex / meshSegments;
    // 沿轨道在本片区间内均匀采样，拿到位置与切线。
    const trackPoint = posedTrack.sample(panel.start + (panel.end - panel.start) * foldFraction);
    // 用正弦波在轨道法线方向上来回偏移，形成帘布的褶皱。
    const waveOffset = amplitude * Math.sin(foldFraction * panelFoldCount * Math.PI * 2);
    // 褶皱暗部：波峰处（sin = +1）亮度为 1，波谷处（sin = -1）压到最暗。
    const foldDarkness = 0.5 - Math.sin(foldFraction * panelFoldCount * Math.PI * 2) * 0.5;
    const foldShade = 1 - (fabricKind === "sheer" ? 0.16 : 0.34) * foldDarkness * foldDarkness;
    for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
      // 两排顶点写同一份明暗：帘布的明暗沿水平方向的褶皱变化，与高度无关。
      colorAttribute.setXYZ(
        rowIndex * (meshSegments + 1) + segmentIndex,
        foldShade,
        foldShade,
        foldShade
      );
      // 平面只有两排顶点：第 0 排是底边（离地 6 厘米），第 1 排是顶边（再往上 height - 0.12 米），
      positionAttribute.setXYZ(
        rowIndex * (meshSegments + 1) + segmentIndex,
        trackPoint.x - trackPoint.tz * waveOffset,
        0.06 + (rowIndex === 0 ? Math.max(0.1, height - 0.12) : 0),
        trackPoint.z + trackPoint.tx * waveOffset
      );
    }
  }
  positionAttribute.needsUpdate = true;
  colorAttribute.needsUpdate = true;
  clothGeometry.computeVertexNormals();
  clothGeometry.computeBoundingBox();
  clothGeometry.computeBoundingSphere();
}

/**
 * 生成一套窗帘（轨道杆 + 两片帘布）并挂到给定节点上。
 */
export function addTrackCurtain(three, rigRoot, curtainOptions, colorOverrides = {}) {
  const curtainTrack = createCurtainTrack(curtainOptions);
  const curtainHeight = clampOptionalNumber(curtainOptions.height, 0.2, 6, 2.4);
  const curtainFabric = curtainOptions.curtainFabric || "cloth";
  // 标记与基准尺寸：上层用它判断该节点的类型并做归一化缩放。
  rigRoot.userData.curtainRigRoot = true;
  rigRoot.userData.curtainTrackModel = true;
  rigRoot.userData.curtainRigBasis = [
    curtainTrack.width,
    curtainHeight,
    curtainFootprintDepth(curtainOptions)
  ];
  // 轨道杆用曲线扫掠成型：把弧长采样器包成一条 three.js 曲线即可直接喂给 TubeGeometry。
  class CurtainTrackCurve extends three.Curve {
    getPoint(curveT, target = new three.Vector3()) {
      const curvePoint = curtainTrack.sample(curveT * curtainTrack.length);
      return target.set(curvePoint.x, curtainHeight - 0.025, curvePoint.z);
    }
  }
  const rodMaterial = new three.MeshStandardMaterial({
    color: colorOverrides.dark ?? 6647932,
    roughness: 0.38,
    metalness: 0.5
  });
  // 管身分段按轨道长度取，每米至少 24 段，保证圆弧拐角足够圆滑；
  const rodMesh = new three.Mesh(
    new three.TubeGeometry(
      new CurtainTrackCurve(),
      Math.max(32, Math.ceil(curtainTrack.length * 24)),
      0.015,
      8,
      false
    ),
    rodMaterial
  );
  rodMesh.userData.curtainPart = "rod";
  rigRoot.add(rodMesh);
  // MeshStandardMaterial 的入场参数见下方逐项说明：帘布是受光的织物，
  const clothMaterial = new three.MeshStandardMaterial({
    // 纱帘用更浅的固有色；帘布颜色可由上层覆盖。
    color: curtainFabric === "sheer" ? 16118766 : (colorOverrides.light ?? 13094354),
    roughness: 0.94,
    // 开启顶点色以接收 poseTrackCloth 写入的褶皱明暗；
    vertexColors: true,
    side: three.DoubleSide,
    transparent: curtainFabric === "sheer",
    // 纱帘半透明，布帘完全不透明。
    opacity: curtainFabric === "sheer" ? 0.48 : 1,
    depthWrite: curtainFabric !== "sheer"
  });
  clothMaterial.forceSinglePass = true;
  const panelPosition = ["left", "right", "split"].includes(curtainOptions.curtainPosition)
    ? curtainOptions.curtainPosition
    : "split";
  curtainPanelRanges(curtainTrack, curtainTrack.curtainPreview, panelPosition).forEach(
    (panelRange, sideIndex) => {
      const clothPieceGeometry = createTrackClothGeometry(
        three,
        curtainTrack,
        curtainHeight,
        curtainFabric
      );
      poseTrackCloth(clothPieceGeometry, curtainTrack, {
        ...panelRange,
        side: sideIndex,
        split: panelPosition === "split"
      });
      const clothMesh = new three.Mesh(clothPieceGeometry, clothMaterial);
      // 单侧帘布时其中一片不可见，但仍保留在场景里，切换位置时无需重建。
      clothMesh.visible = panelRange.visible;
      clothMesh.userData.curtainPart = "cloth";
      // 纱帘不投射阴影：半透明物体的阴影会显得很脏。
      clothMesh.castShadow = curtainFabric !== "sheer";
      clothMesh.receiveShadow = true;
      rigRoot.add(clothMesh);
    }
  );
  return rigRoot;
}

/**
 * 创建一套卷帘几何：一根顶部卷管 + 一整片平帘布 + 底杆 + 两端支架。
 * @param {object} three three.js 命名空间（由调用方注入，构建体不直接 import）。
 * @param {object} rollerOptions 物件参数：width / height / curtainFabric / curtainPreview。
 * @param {object} colorOverrides 配色覆盖：light = 帘布色，dark = 卷管 / 底杆 / 支架等五金色。
 */
export function createRollerCurtain(three, rollerOptions = {}, colorOverrides = {}) {
  const rollerWidth = clampOptionalNumber(
    rollerOptions.width ?? rollerOptions.curtainWidth,
    0.2,
    8,
    1.8
  );
  const rollerHeight = clampOptionalNumber(rollerOptions.height, 0.2, 6, 2.4);
  // 卷管半径：封顶 4.5 厘米（再粗就不像家用卷帘），且不超过总高的 12%。
  const rollerTubeRadius = Math.min(0.045, rollerHeight * 0.12);
  // 布厚 1.6 毫米：只参与「卷起后管半径」的面积守恒反算，不参与渲染。
  const rollerFabricThickness = 0.0016;
  // 卷管轴心高度 = 总高 − 收卷所需的那一小段；帘布顶边因此略低于吊顶，卷得下最后一点布。
  const rollerTopY =
    rollerHeight - Math.sqrt(rollerTubeRadius ** 2 + (rollerHeight * rollerFabricThickness) / Math.PI);
  // 帘布平铺高度 = 顶边到离地 3.5 厘米（留一点缝，帘布不会插进地面）。
  const rollerPanelHeight = Math.max(0.04, rollerTopY - 0.035);
  const rollerCapSpan = Math.min(rollerTubeRadius * 2.5, (rollerHeight - rollerTopY) * 2);
  const rollerIsSheer = rollerOptions.curtainFabric === "sheer";
  const rollerGroup = new three.Group();
  const rollerParts = [];
  // 帘布材质：与轨道帘同一族参数（受光织物、粗糙度接近 1、双面），但**不开顶点色** ——
  const rollerClothMaterial = new three.MeshStandardMaterial({
    color: colorOverrides.light ?? 13094354,
    roughness: 0.94,
    side: three.DoubleSide,
    transparent: rollerIsSheer,
    opacity: rollerIsSheer ? 0.48 : 1,
    depthWrite: !rollerIsSheer
  });
  rollerClothMaterial.forceSinglePass = true;
  // 卷管两端支架与底杆是金属件：与轨道帘的轨道杆取同一档五金色。
  const rollerMetalMaterial = new three.MeshStandardMaterial({
    color: colorOverrides.dark ?? 6647932,
    roughness: 0.4,
    metalness: 0.45
  });
  /**
   * 挂一个部件到卷帘组上：统一打 userData.curtainPart（上层按它做暖阳换色与特效标记）、
   */
  const addRollerPart = (rollerGeometry, rollerMaterial, rollerPartName) => {
    const rollerMesh = new three.Mesh(rollerGeometry, rollerMaterial);
    rollerMesh.userData.curtainPart = rollerPartName;
    rollerMesh.castShadow = !rollerIsSheer;
    rollerMesh.receiveShadow = true;
    rollerParts.push(rollerMesh);
    rollerGroup.add(rollerMesh);
    return rollerMesh;
  };
  // 帘布：一整片平面（1×1 段 = 4 个顶点），顶点在 pose 里逐点改写，不在这里定形。
  const rollerPanelMesh = addRollerPart(
    new three.PlaneGeometry(rollerWidth, rollerPanelHeight),
    rollerClothMaterial,
    "cloth"
  );
  // 卷管：单位圆柱 + 姿态里按当前卷起半径缩放；rotation.z = 90° 让它横躺在窗口上方。
  const rollerTubeMesh = addRollerPart(
    new three.CylinderGeometry(1, 1, rollerWidth, 32),
    rollerClothMaterial,
    "cloth"
  );
  rollerTubeMesh.rotation.z = Math.PI / 2;
  rollerTubeMesh.position.y = rollerTopY;
  // 底杆（配重条）：压住帘布下沿，让它垂得平直；位置随开合在 pose 里上下走。
  const rollerBottomBarMesh = addRollerPart(
    new three.BoxGeometry(rollerWidth + 0.018, 0.025, 0.028),
    rollerMetalMaterial,
    "band"
  );
  // 两端支架：比卷管略高一点的方墩，夹住卷管两头，贴在窗口两侧。
  for (const rollerEndX of [-rollerWidth / 2 - 0.018, rollerWidth / 2 + 0.018]) {
    addRollerPart(
      new three.BoxGeometry(0.025, rollerCapSpan, rollerCapSpan),
      rollerMetalMaterial,
      "cap"
    ).position.set(rollerEndX, rollerTopY, 0);
  }
  /**
   * 按开合百分比摆姿势：curtainPreview ∈ [0, 100]，0 = 完全放下、100 = 完全卷起。
   * @param {number} previewPercent 开合预览百分比（0~100）。
   * @returns {{top:number, bottom:number, radius:number, hanging:number}} 供调试 / 断言。
   */
  const poseRollerCurtain = (previewPercent = 0) => {
    const rolledFraction = clampOptionalNumber(previewPercent, 0, 100, 0) / 100;
    const rolledLength = rollerPanelHeight * rolledFraction;
    const hangingLength = rollerPanelHeight - rolledLength;
    const currentTubeRadius = Math.sqrt(
      rollerTubeRadius ** 2 + (rolledLength * rollerFabricThickness) / Math.PI
    );
    const rollerPositionAttribute = rollerPanelMesh.geometry.attributes.position;
    const rollerUvAttribute = rollerPanelMesh.geometry.attributes.uv;
    // PlaneGeometry 的 4 个顶点顺序是「左上、右上、左下、右下」：前两个是顶边。
    for (let rollerVertexIndex = 0; rollerVertexIndex < 4; rollerVertexIndex++) {
      const rollerVertexIsTop = rollerVertexIndex < 2;
      rollerPositionAttribute.setXYZ(
        rollerVertexIndex,
        rollerVertexIndex % 2 ? rollerWidth / 2 : -rollerWidth / 2,
        rollerVertexIsTop ? rollerTopY : rollerTopY - hangingLength,
        currentTubeRadius
      );
      // 卷起的部分不显示，用 UV 的纵向取值把有花纹的贴图也一起收上去。
      rollerUvAttribute.setY(rollerVertexIndex, rollerVertexIsTop ? 1 - rolledFraction : 0);
    }
    rollerPositionAttribute.needsUpdate = true;
    rollerUvAttribute.needsUpdate = true;
    rollerPanelMesh.geometry.computeBoundingBox();
    rollerPanelMesh.geometry.computeBoundingSphere();
    // 完全卷起时平面退化成一条线，直接隐藏，免得留下一条零宽的面。
    rollerPanelMesh.visible = hangingLength > 0.0001;
    // 卷管按当前卷起半径缩放（圆柱轴向已被 rotation.z 转到 x，径向是 y / z 两个轴）。
    rollerTubeMesh.scale.set(currentTubeRadius, 1, currentTubeRadius);
    // 卷起多少就转多少：转过的周长等于卷上来的布长，视觉上布是「卷进去」的。
    rollerTubeMesh.rotation.x =
      (-2 * Math.PI * (currentTubeRadius - rollerTubeRadius)) / rollerFabricThickness;
    rollerBottomBarMesh.position.set(0, rollerTopY - hangingLength, currentTubeRadius);
    return {
      top: rollerTopY,
      bottom: rollerTopY - hangingLength,
      radius: currentTubeRadius,
      hanging: hangingLength
    };
  };
  poseRollerCurtain(rollerOptions.curtainPreview);
  return {
    group: rollerGroup,
    meshes: rollerParts,
    material: rollerClothMaterial,
    width: rollerWidth,
    height: rollerHeight,
    pose: poseRollerCurtain,
    dispose({ keepMaterial = false } = {}) {
      for (const rollerPart of rollerParts) {
        rollerPart.geometry.dispose();
      }
      rollerMetalMaterial.dispose();
      if (!keepMaterial) {
        rollerClothMaterial.dispose();
      }
    }
  };
}

/**
 * 生成一套卷帘（卷管 + 平帘布 + 底杆 + 支架）并挂到给定节点上。
 */
export function addRollerCurtain(three, rigRoot, rollerOptions = {}, colorOverrides = {}) {
  const rollerRig = createRollerCurtain(three, rollerOptions, colorOverrides);
  // 标记与基准尺寸：上层用它判断该节点的类型并做归一化缩放；
  rigRoot.userData.curtainRigRoot = true;
  rigRoot.userData.curtainRollerModel = true;
  rigRoot.userData.curtainRigBasis = [
    rollerRig.width,
    rollerRig.height,
    curtainFootprintDepth(rollerOptions)
  ];
  rigRoot.add(rollerRig.group);
  rollerRig.pose(rollerOptions.curtainPreview);
  return rigRoot;
}

/**
 * 创建梦幻帘（垂直叶片条带）的几何体。
 */
export function createDreamBladeGeometry(threeLib, bladeTrack, bladeHeight) {
  // 叶片间距约 12 厘米，夹在 4~160 片之间。
  const bladeCount = Math.max(4, Math.min(160, Math.ceil(bladeTrack.length / 0.12)));
  const bladeGeometry = new threeLib.BufferGeometry();
  bladeGeometry.setAttribute(
    "position",
    new threeLib.Float32BufferAttribute(new Float32Array(bladeCount * 12), 3)
  );
  // 顶点色：每片叶片的四个顶点依次取「外沿暗、中缝亮」的灰度，
  const bladeColorValues = [];
  for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex++) {
    for (const bladeShade of [0.72, 1, 0.72, 1]) {
      bladeColorValues.push(bladeShade, bladeShade, bladeShade);
    }
  }
  bladeGeometry.setAttribute(
    "color",
    new threeLib.Float32BufferAttribute(bladeColorValues, 3)
  );
  bladeGeometry.attributes.position.setUsage(threeLib.DynamicDrawUsage);
  const indices = [];
  for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex++) {
    const vertexOffset = bladeIndex * 4;
    // 顶点顺序为「左下、右下、左上、右上」，两个三角形拼成叶片矩形。
    indices.push(
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset + 3
    );
  }
  bladeGeometry.setIndex(indices);
  bladeGeometry.userData.dreamBlades = {
    count: bladeCount,
    height: bladeHeight,
    // 叶片宽度取间距的 1.08 倍：略微超出间距，闭合时叶片之间才有搭接而不露缝。
    width: (bladeTrack.length / bladeCount) * 1.08
  };
  return bladeGeometry;
}

/**
 * 按轨道姿态摆放梦幻帘的叶片。
 */
export function poseDreamBlades(bladeStripGeometry, dreamTrack, dreamPanel, tiltPercent = 50) {
  const {
    count: bladeTotal,
    height: bladeTopY,
    width: bladeWidth
  } = bladeStripGeometry.userData.dreamBlades;
  const bladePositions = bladeStripGeometry.attributes.position;
  // 分片模式下按搭接比例决定本片实际显示多少片；其余叶片宽度置 0（收缩成一条线）。
  const activeBladeCount = Math.max(
    2,
    Math.round(
      bladeTotal *
        (dreamPanel.split
          ? dreamPanel.side === 0
            ? dreamTrack.curtainMeet / 100
            : 1 - dreamTrack.curtainMeet / 100
          : 1)
    )
  );
  // 旋转角度：50% 对应 90°（叶片正对视线），0% 与 100% 对应展开与完全闭合。
  const tiltAngle = (clampOptionalNumber(tiltPercent, 0, 100, 50) * Math.PI) / 100;
  for (let bladeCursor = 0; bladeCursor < bladeTotal; bladeCursor++) {
    // 用「序号 + 0.5」的中心采样，叶片才会均匀铺满区间而不是挤在起止点。
    const bladeTrackPoint = dreamTrack.sample(
      dreamPanel.start +
        ((dreamPanel.end - dreamPanel.start) *
          (Math.min(bladeCursor, activeBladeCount - 1) + 0.5)) /
          activeBladeCount
    );
    // 超出显示片数的叶片半宽为 0，等价于不可见。
    const halfSpan = bladeCursor < activeBladeCount ? bladeWidth / 2 : 0;
    // 把叶片方向按倾斜角旋转后再取半宽，得到左右两个顶点的偏移量。
    const offsetX =
      (bladeTrackPoint.tx * Math.cos(tiltAngle) - bladeTrackPoint.tz * Math.sin(tiltAngle)) *
      halfSpan;
    const offsetZ =
      (bladeTrackPoint.tz * Math.cos(tiltAngle) + bladeTrackPoint.tx * Math.sin(tiltAngle)) *
      halfSpan;
    bladePositions.setXYZ(
      bladeCursor * 4,
      bladeTrackPoint.x - offsetX,
      0.06,
      bladeTrackPoint.z - offsetZ
    );
    bladePositions.setXYZ(
      bladeCursor * 4 + 1,
      bladeTrackPoint.x + offsetX,
      0.06,
      bladeTrackPoint.z + offsetZ
    );
    bladePositions.setXYZ(
      bladeCursor * 4 + 2,
      bladeTrackPoint.x - offsetX,
      bladeTopY - 0.06,
      bladeTrackPoint.z - offsetZ
    );
    bladePositions.setXYZ(
      bladeCursor * 4 + 3,
      bladeTrackPoint.x + offsetX,
      bladeTopY - 0.06,
      bladeTrackPoint.z + offsetZ
    );
  }
  bladePositions.needsUpdate = true;
  bladeStripGeometry.computeVertexNormals();
  bladeStripGeometry.computeBoundingBox();
  bladeStripGeometry.computeBoundingSphere();
}
