/**
 * 窗帘轨道与帘布的生成（含轨道帘、卷帘、梦幻帘）：3D 工作室生成窗帘时的几何构造模块，
 * 由物件生成流程调用，产出轨道杆与两片帘布（轨道帘）或卷管与一整片帘布（卷帘）。
 *
 * 坐标与单位：长度一律米；轨道在水平面上用 x / z 描述（y 为竖直方向），帘布底边离地 0.06 米、
 * 顶边离地 height - 0.06 米（卷帘为底边 0.035 米、顶边见 createRollerCurtain）。约定：
 * curtainMeet 为两片帘布搭接百分比，curtainPreview 为开合预览百分比，curtainStyle 为形态；
 * 参数夹取用 utils/numbers.js 的 clampOptionalNumber（空串 / null 表示「未设置」，不能按 0 用）。
 */
import { clampOptionalNumber } from "../../utils/numbers.js?v=2609260929";
// 未绑定窗帘的默认开合度：与运行时的未绑定兜底（curtain-motion）必须同值，故只定义在
// utils/cover-features.js 一处。
import { COVER_DEFAULT_PREVIEW_POSITION } from "../../utils/cover-features.js?v=2609260929";

/**
 * 窗帘形态（curtainStyle）取值。
 *
 * cloth：布艺垂帘，也就是本模块一直以来的轨道帘，默认值，行为与新增这个字段之前逐值相同；
 * roller：卷帘，顶部一根卷管 + 一整片平帘布，无轨道、无左右两片、无褶皱。
 *
 * 为什么另起一轴而不是复用 curtainFabric：后者描述的是**布面材质**（布 / 纱），
 * 卷帘与轨道帘都可能用布面；两者正交，合成一个字段会让「卷帘 + 纱」这类组合无处安放。
 * 命名沿用本项目 `<东西>Style` 的既有写法（wallStyle / muralStyle / materialStyle）。
 */
export const CURTAIN_STYLE_CLOTH = "cloth";
export const CURTAIN_STYLE_ROLLER = "roller";

/**
 * 归一化窗帘轨道参数。
 */
export function normalizeCurtainTrack(inputOptions = {}) {
  // 卷帘没有轨道形态可言：没有回折段、没有拐角，帘布也不会分成左右两片。
  // 这里把 curtainTrack 收敛成直线型，调用方的进深计算（curtainFootprintDepth）
  // 与平面绘制才会走「单轨」这一支，不会去算 L / U 型的回折长度。
  const curtainIsRoller = inputOptions.curtainStyle === CURTAIN_STYLE_ROLLER;
  return {
    // 形态字段**始终落键**（非法值回落 cloth）。若像 curtainFabric 那样「有值才写」，
    // 用户把卷帘改回普通帘时旧的 "roller" 键会残留在文档里 —— 这正是本项目最在意的
    // 「静默残留」那一类 bug，所以这里宁可让每个窗帘都带一个明确的形态值。
    curtainStyle: curtainIsRoller ? CURTAIN_STYLE_ROLLER : CURTAIN_STYLE_CLOTH,
    // 只有直轨 / L 型 / U 型三种形态，其余一律回落到直轨（未知值会让几何生成出错）；
    // 卷帘强制直线型（见上）。
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
    // 搭接百分比限制在 5%~95%，两端留出余量避免两片帘布完全分开或完全重叠。
    curtainMeet: clampOptionalNumber(inputOptions.curtainMeet, 5, 95, 50),
    // 未设置时按默认开合度展示（见 COVER_DEFAULT_PREVIEW_POSITION）：新建 / 旧模型都得到一个
    // 明确读作「打开」的预览值，同时保留帘布的体积感。
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
 * L / U 型轨道的回折段垂直于墙面伸出，进深要把最长的那段回折算进去，
 * 否则物件包围盒偏小，贴墙摆放时会穿过家具。
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
 * 顶点顺序即行走方向：先左回折（若有）、再主轨、最后右回折（若有）；拐角处用
 * 四分之一圆弧倒角过渡，帘布经过拐角时才不会突然折出直角。
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
  // 否则帘布会缩成一条线，看起来像凭空消失。
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
 * 用 1×1 平面细分出足够多的横向分段（每褶 8 段）供 poseTrackCloth 逐顶点摆褶皱；
 * 顶点用量固定申请为动态更新，因为改开合 / 搭接都要重写整片顶点。
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
  // 两排顶点 × (segmentCount + 1) 个采样点，初始全白（不改变原色）。
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
    // 暗部深度按面料区分 —— 纱帘透光，只压 16%；布帘厚实，压 34%，层次更明显。
    // 用平方让暗部集中在波谷附近，褶脊不会被一起压灰。
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
  colorAttribute.needsUpdate = true;
  // 顶点整体挪过位置，法线与包围体都要重算，否则光照与剔除都会出错。
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
    // 开启顶点色以接收 poseTrackCloth 写入的褶皱明暗；
    // 不打开这一项，几何上的 color 属性会被完全忽略。
    vertexColors: true,
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
 * 创建一套卷帘几何：一根顶部卷管 + 一整片平帘布 + 底杆 + 两端支架。
 *
 * 与轨道帘的区别（也就是「卷帘」这个形态的定义）：没有轨道、没有左右两片、没有褶皱，
 * 帘布是一整片平面，靠顶部卷管垂直升降 —— 0% 完全放下（盖住窗口），100% 完全卷起。
 *
 * 坐标与单位沿用本模块的约定：长度米、y 竖直、x 为帘布宽度方向、z 为出墙进深方向。
 * 帘布底边离地 0.035 米，卷管轴心（帘布顶边）离地
 * `height - sqrt(卷管半径² + height × 布厚 / π)`：这样「放下的布 + 卷在管上的布」总面积
 * 恒定，卷起时管半径按面积守恒增大，不会出现卷到一半布面长度对不上的跳变。
 *
 * 返回值里的 pose(curtainPreview) 负责按开合百分比摆姿势，供工作台预览与后续运行时复用。
 *
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
  // 两端支架的截面边长：原本是卷管直径的 2.5 倍，但矮窗上卷管轴心离顶很近，
  // 这个尺寸会让支架戳出物件高度（包围盒超出 height），所以再按「到顶的余量」夹一次。
  const rollerCapSpan = Math.min(rollerTubeRadius * 2.5, (rollerHeight - rollerTopY) * 2);
  const rollerIsSheer = rollerOptions.curtainFabric === "sheer";
  const rollerGroup = new three.Group();
  const rollerParts = [];
  // 帘布材质：与轨道帘同一族参数（受光织物、粗糙度接近 1、双面），但**不开顶点色** ——
  // 卷帘没有褶皱，不需要逐顶点明暗。纱帘半透明、强制单遍，避免双面各画一次叠色。
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
   * 按面料决定投影（纱帘不投影，半透明阴影会显脏），并登记进 rollerParts 便于整组释放。
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
  // 材质用帘布那一份 —— 卷起来的就是布本身，不该是另一根金属杆。
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
   * 放下的布越长，卷在管上的布越多，管半径按面积守恒反算；帘布顶点始终落在卷管外侧
   * （z = 当前管半径），所以布面看起来是从管子上垂下来的，而不是从轴心穿过去。
   *
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
 * 与 addTrackCurtain 同签名、同约定：上层建立模型组后直接调用，自带 userData 标记与基准尺寸。
 */
export function addRollerCurtain(three, rigRoot, rollerOptions = {}, colorOverrides = {}) {
  const rollerRig = createRollerCurtain(three, rollerOptions, colorOverrides);
  // 标记与基准尺寸：上层用它判断该节点的类型并做归一化缩放；
  // curtainRollerModel 与轨道帘的 curtainTrackModel 并列，互不误判。
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
 * 用一块非索引缓冲承载所有叶片：每片 4 个顶点（上下 × 左右）、索引固定为两个
 * 三角形，顶点数据全部由 poseDreamBlades 填。
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
  // 让叶片之间的搭接处自然形成一道亮缝，闭合时也能看出层次。
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
