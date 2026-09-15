/**
 * 窗帘轨道与帘布的生成（含梦幻帘）。
 *
 * 位置：3D 工作室生成窗帘（直轨 / L 型 / U 型）时的几何构造模块，
 *   由物件生成流程调用，产出轨道杆与两片帘布。
 * 对外：normalizeCurtainTrack、curtainFootprintDepth、createCurtainTrack、
 *   curtainPanelRanges、createTrackClothGeometry、poseTrackCloth、addTrackCurtain，
 *   以及梦幻帘用的 createDreamBladeGeometry / poseDreamBlades。
 * 坐标与单位：长度一律米；轨道在水平面上用 x / z 描述（y 为竖直方向），
 *   帘布底边离地 0.06 米、顶边离地 height - 0.06 米。
 * 约定：curtainMeet 为两片帘布的搭接百分比，curtainPreview 为开合预览百分比。
 */

/**
 * 把值夹到 [min, max]，非法（null / 空串 / 非数字）时返回兜底值。
 *
 * @param {*} rawValue 原始值。
 * @param {number} fallbackValue 兜底值。
 * @param {number} minValue 下限。
 * @param {number} maxValue 上限。
 * @returns {number} 夹取后的数字。
 */
const clampNumber = (rawValue, fallbackValue, minValue, maxValue) => {
  // 空串与 null 都视为「未设置」：Number("") 会得到 0，那是个合法但错误的默认值。
  const parsedValue = rawValue == null || rawValue === "" ? NaN : Number(rawValue);
  if (Number.isFinite(parsedValue)) {
    return Math.max(minValue, Math.min(maxValue, parsedValue));
  } else {
    return fallbackValue;
  }
};

/**
 * 归一化窗帘轨道参数。
 *
 * @param {object} [inputOptions] 原始参数。
 * @returns {object} 归一化后的轨道参数；curtainFabric 只在取值合法时才出现在结果里。
 */
export function normalizeCurtainTrack(inputOptions = {}) {
  return {
    // 只有直轨 / L 型 / U 型三种形态，其余一律回落到直轨（未知值会让几何生成出错）。
    curtainTrack: ["straight", "l", "u"].includes(inputOptions.curtainTrack)
      ? inputOptions.curtainTrack
      : "straight",
    // 拐角方向默认朝右，与常见户型主窗的布置一致。
    curtainCorner: inputOptions.curtainCorner === "left" ? "left" : "right",
    // 回折段限制在 0.2~7.8 米：太短看不出拐角，太长会超出常见的房间进深。
    curtainLeftLength: clampNumber(inputOptions.curtainLeftLength, 1.2, 0.2, 7.8),
    curtainRightLength: clampNumber(inputOptions.curtainRightLength, 1.2, 0.2, 7.8),
    // 搭接百分比限制在 5%~95%，两端留出余量避免两片帘布完全分开或完全重叠。
    curtainMeet: clampNumber(inputOptions.curtainMeet, 50, 5, 95),
    curtainPreview: clampNumber(inputOptions.curtainPreview, 0, 0, 100),
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
 *
 * L / U 型轨道的回折段垂直于墙面伸出，所以进深要把最长的那段回折算进去，
 * 否则物件包围盒会偏小，导致贴墙摆放时穿过家具。
 *
 * @param {object} trackConfig 轨道参数。
 * @returns {number} 进深（米）。
 */
export function curtainFootprintDepth(trackConfig) {
  const trackModel = normalizeCurtainTrack(trackConfig);
  if (trackModel.curtainTrack === "straight") {
    // 直轨的进深由调用方给出，默认 0.18 米（轨道厚度 + 帘布褶皱所需余量）。
    return clampNumber(trackConfig.depth, 0.18, 0.05, 8);
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
 *
 * 顶点顺序即沿轨道的行走方向：先左回折（若有）、再主轨、最后右回折（若有）；
 * 拐角处用四分之一圆弧倒角过渡，帘布经过拐角时才不会突然折出一个直角。
 *
 * @param {object} [options] 轨道参数，另可传 width（主轨长度，米）。
 * @returns {object} 归一化参数 + width / length / vertices / sample(distance)。
 */
export function createCurtainTrack(options = {}) {
  const normalizedTrack = normalizeCurtainTrack(options);
  const width = clampNumber(options.width ?? options.curtainWidth, 1.8, 0.2, 8);
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
  // 帘布的姿态计算只要给出一个弧长就能拿到位置与切线。
  const segments = [];
  let totalLength = 0;
  // 把一条直线段登记到 segments：记录它在总弧长上的起点与长度，
  // 并给出「给弧长偏移、还世界坐标与切线」的采样闭包。
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
    // 圆角半径上限 8 厘米，且不超过相邻边长度的三分之一，避免短边被圆角吃掉。
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
      const clampedDistance = clampNumber(distance, 0, 0, totalLength);
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
 *
 * @param {object} panelTrack createCurtainTrack 的结果。
 * @param {number} [previewPercent] 开合预览百分比，0 为完全闭合。
 * @param {string} [position] 帘布位置：left / right 为单侧，其余按 split 两侧处理。
 * @returns {Array<{visible: boolean, start: number, end: number}>} 两片帘布（左、右）的区间。
 */
export function curtainPanelRanges(panelTrack, previewPercent = 0, position = "split") {
  // 预览开合按 0.88 的系数收缩而不是 1:1：即使拉到 100%，也要留一成多的帘布，
  // 否则帘布会缩成一条线，看起来像凭空消失。
  const coverageScale = 1 - (clampNumber(previewPercent, 0, 0, 100) * 0.88) / 100;
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
 *
 * 用 1×1 的平面细分出足够多的横向分段（每褶 8 段），供 poseTrackCloth 逐顶点摆出褶皱；
 * 顶点用量固定申请为动态更新，因为每次改开合 / 搭接都要重写整片顶点。
 *
 * @param {object} THREE three.js 模块命名空间。
 * @param {object} clothTrack 轨道参数（取长度算褶皱数）。
 * @param {number} clothHeight 帘布高度（米）。
 * @param {string} [fabric] 面料：sheer 为纱帘。
 * @returns {object} 帘布几何，褶皱参数挂在 userData.curtainCloth 上。
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
  geometry.userData.curtainCloth = {
    segments: segmentCount,
    height: clothHeight,
    folds: folds,
    // 褶深：纱帘 2.3 厘米，布帘 4.6 厘米。
    amplitude: fabric === "sheer" ? 0.023 : 0.046
  };
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

/**
 * 按轨道姿态摆放一片帘布的顶点。
 *
 * @param {object} clothGeometry 帘布几何（由 createTrackClothGeometry 创建）。
 * @param {object} posedTrack 轨道参数（提供 sample 采样）。
 * @param {{start: number, end: number, side: number, split: boolean}} panel
 *   本片帘布的区间、左右侧序号与是否处于分片模式。
 * @returns {void}
 */
export function poseTrackCloth(clothGeometry, posedTrack, panel) {
  const {
    segments: meshSegments,
    height: height,
    folds: foldCount,
    amplitude: amplitude
  } = clothGeometry.userData.curtainCloth;
  const positionAttribute = clothGeometry.attributes.position;
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
    for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
      // 平面只有两排顶点：第 0 排是底边（离地 6 厘米），第 1 排是顶边（再往上 height - 0.12 米），
      // 上下各留 6 厘米，帘布才不会插进地面或顶死吊顶。
      positionAttribute.setXYZ(
        rowIndex * (meshSegments + 1) + segmentIndex,
        trackPoint.x - trackPoint.tz * waveOffset,
        0.06 + (rowIndex === 0 ? Math.max(0.1, height - 0.12) : 0),
        trackPoint.z + trackPoint.tx * waveOffset
      );
    }
  }
  positionAttribute.needsUpdate = true;
  // 顶点整体挪过位置，法线与包围体都要重算，否则光照与剔除都会出错。
  clothGeometry.computeVertexNormals();
  clothGeometry.computeBoundingBox();
  clothGeometry.computeBoundingSphere();
}

/**
 * 生成一套窗帘（轨道杆 + 两片帘布）并挂到给定节点上。
 *
 * @param {object} three three.js 模块命名空间。
 * @param {object} rigRoot 挂载节点（会写入窗帘相关的 userData）。
 * @param {object} curtainOptions 窗帘参数（轨道、高度、面料、位置、配色等）。
 * @param {object} [colorOverrides] 配色覆盖：dark 为杆色，light 为帘布色。
 * @returns {object} 传入的 rigRoot。
 */
export function addTrackCurtain(three, rigRoot, curtainOptions, colorOverrides = {}) {
  const curtainTrack = createCurtainTrack(curtainOptions);
  const curtainHeight = clampNumber(curtainOptions.height, 2.4, 0.2, 6);
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
  // 杆半径 1.5 厘米、圆周 8 段，末端不封闭（细杆看不到截面）。
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
  // 因此粗糙度接近 1、几乎无金属度。
  const clothMaterial = new three.MeshStandardMaterial({
    // 纱帘用更浅的固有色；帘布颜色可由上层覆盖。
    color: curtainFabric === "sheer" ? 16118766 : (colorOverrides.light ?? 13094354),
    roughness: 0.94,
    side: three.DoubleSide,
    transparent: curtainFabric === "sheer",
    // 纱帘半透明，布帘完全不透明。
    opacity: curtainFabric === "sheer" ? 0.48 : 1,
    depthWrite: curtainFabric !== "sheer"
  });
  // 纱帘是半透明双面材质，强制单遍渲染以避免两面各渲染一次造成颜色叠加。
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
 * 创建梦幻帘（垂直叶片条带）的几何体。
 *
 * 用一块非索引缓冲承载所有叶片：每片 4 个顶点（上下 × 左右），
 * 索引固定为两个三角形，顶点数据全部由 poseDreamBlades 填。
 *
 * @param {object} threeLib three.js 模块命名空间。
 * @param {object} bladeTrack 轨道参数。
 * @param {number} bladeHeight 叶片高度（米）。
 * @returns {object} 叶片条带几何，参数挂在 userData.dreamBlades 上。
 */
export function createDreamBladeGeometry(threeLib, bladeTrack, bladeHeight) {
  // 叶片间距约 12 厘米，夹在 4~160 片之间。
  const bladeCount = Math.max(4, Math.min(160, Math.ceil(bladeTrack.length / 0.12)));
  const bladeGeometry = new threeLib.BufferGeometry();
  bladeGeometry.setAttribute(
    "position",
    new threeLib.Float32BufferAttribute(new Float32Array(bladeCount * 12), 3)
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
 *
 * @param {object} bladeStripGeometry 叶片条带几何。
 * @param {object} dreamTrack 轨道参数（提供 sample 采样）。
 * @param {{start: number, end: number, side: number, split: boolean}} dreamPanel 本段叶片的区间。
 * @param {number} [tiltPercent] 叶片旋转百分比，0~100 映射到 0~180°。
 * @returns {void}
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
  const tiltAngle = (clampNumber(tiltPercent, 50, 0, 100) * Math.PI) / 100;
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
