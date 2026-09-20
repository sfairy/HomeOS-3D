/**
 * 3D 工作室的输入归一化工具箱。
 *
 * 位置：文档从后端读回、或用户在面板上输入参数之后，统一由本模块把可能缺失 /
 *   越界 / 类型不对的字段收敛成安全值，再交给渲染与状态逻辑使用。
 * 对外：基础数值工具、尺寸下限、标签文本、色温转色、固定机位与相机设置、
 *   以及默认基础照明与照明归一化。
 * 约定：长度单位一律米，角度单位度；相机位置 / 注视点用世界坐标；
 *   色温用开尔文。所有函数都是纯函数，不持有状态、不写回入参。
 *   夹取用 utils/numbers.js 的 clampNumber（唯一实现，P10 B 类收敛）——
 *   本模块原先那份的嵌套顺序与其余各处相反，区间上下限写反时结果会静默不同，
 *   收敛时按唯一实现的口径统一。
 */
import { clampNumber } from "../../utils/numbers.js?v=20260920103845";

/**
 * 转成有限数字，失败时用兜底值。
 *
 * JSON 里常见 null、""、"abc" 这类值，直接参与运算会得到 NaN 并污染整条数据链。
 */
export function finite(value, fallback = 0) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  } else {
    return fallback;
  }
}

/**
 * 把任意角度归一化到 [0, 360)。
 *
 * 已经落在 [0, 360] 区间内的值原样返回 —— 这里刻意保留 360 而不取模成 0，
 * 因为界面上「正好转了一圈」与「没转」是两种输入，取模会吞掉用户的意图。
 */
export function normalizeFullRotation(degrees, fallbackDegrees = 0) {
  const rotationDegrees = finite(degrees, fallbackDegrees);
  if (rotationDegrees >= 0 && rotationDegrees <= 360) {
    return rotationDegrees;
  } else {
    // 先取模再 +360 再取模，负数角度也能落到 [0, 360)。
    return ((rotationDegrees % 360) + 360) % 360;
  }
}

/**
 * 给出某类物件允许的最小平面尺寸（米）。
 *
 * 对应检查器里尺寸输入框的 min 属性。人体存在传感器外形细长，允许小到 1 厘米；
 * 其余家具最小 10 厘米，避免误输入后生成几乎不可见的碎片。
 */
export function itemMinimumFootprint(itemType) {
  if (itemType === "presence") {
    return 0.01;
  } else {
    return 0.1;
  }
}

/**
 * 给出某类物件允许的最小高度 / 厚度（米）。
 *
 * 平面标签是零厚度的贴片，1 毫米即可；地毯 4 毫米；其余物件至少 5 厘米。
 */
export function itemMinimumHeight(itemKind) {
  if (itemKind === "planlabel") {
    return 0.001;
  } else if (itemKind === "rug") {
    return 0.004;
  } else {
    return 0.05;
  }
}

/**
 * 归一化平面坐标点。
 */
export function normalizePoint(point) {
  return {
    x: finite(point?.x),
    y: finite(point?.y)
  };
}

/**
 * 归一化标签文本。
 *
 * 连续空白（含换行）折成一个空格再 trim：标签是画布上单行绘制的内容，
 * 换行符会画出异常的字距；超长文本按 maxLength 截断，空文本回落到占位文案。
 */
export function normalizeLabelText(labelText, fallbackText, maxLength) {
  return (
    String(labelText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength) || fallbackText
  );
}

/**
 * 把色温换算成 0xRRGGBB 整数（用于灯具发光色）。
 *
 * 采用常见的冷暖色温近似式（分段幂函数 / 对数式），只在 2200~6500 K 区间内准确；
 * 超出区间的输入先被夹到边界，避免出现负底数或非法对数。
 */
export function kelvinToRgbHex(kelvin) {
  // 近似式的自变量以百开尔文为单位，分界点 66 即 6600 K。
  const scaledKelvin = clampNumber(finite(kelvin, 3000), 2200, 6500) / 100;
  const redValue = scaledKelvin <= 66 ? 255 : (scaledKelvin - 60) ** -0.1332047592 * 329.698727446;
  const greenValue =
    scaledKelvin <= 66
      ? Math.log(scaledKelvin) * 99.4708025861 - 161.1195681661
      : (scaledKelvin - 60) ** -0.0755148492 * 288.1221695283;
  const blueValue =
    scaledKelvin >= 66
      ? 255
      : scaledKelvin <= 19
        ? 0
        : Math.log(scaledKelvin - 10) * 138.5177312231 - 305.0447927307;
  // 把近似式算出的通道值夹到 0~255 再取整：近似式在色温两端会给出负值或 >255 的值，
  // 不夹的话左移拼位会溢出 / 借位，把另外两个通道也污染掉。
  const clampChannel = channelValue => Math.round(clampNumber(channelValue, 0, 255));
  return (clampChannel(redValue) << 16) | (clampChannel(greenValue) << 8) | clampChannel(blueValue);
}

/**
 * 归一化「固定机位」视图。
 */
export function normalizeFixedCameraView(savedView) {
  if (!savedView || typeof savedView != "object") {
    return null;
  }
  // ±500 米足以覆盖任何住宅场景，同时挡住明显的脏数据（例如未初始化的极大值）。
  const positionVector = {
    x: clampNumber(finite(savedView.position?.x), -500, 500),
    y: clampNumber(finite(savedView.position?.y), -500, 500),
    z: clampNumber(finite(savedView.position?.z), -500, 500)
  };
  const targetVector = {
    x: clampNumber(finite(savedView.target?.x), -500, 500),
    y: clampNumber(finite(savedView.target?.y), -500, 500),
    z: clampNumber(finite(savedView.target?.z), -500, 500)
  };
  // 位置与目标重合时视线方向无定义，这类机位不可用，直接判为无效。
  if (
    Math.hypot(
      positionVector.x - targetVector.x,
      positionVector.y - targetVector.y,
      positionVector.z - targetVector.z
    ) < 0.1
  ) {
    return null;
  } else {
    return {
      mode: savedView.mode === "perspective" ? "perspective" : "orthographic",
      view: savedView.view === "top" ? "top" : "free",
      topRotation: (((Math.round(finite(savedView.topRotation, 0) / 90) * 90) % 360) + 360) % 360,
      position: positionVector,
      target: targetVector,
      // 固定机位的取景范围收得比导出预设更紧：1~100 米、视场角 20°~80°。
      visibleHeight: clampNumber(finite(savedView.visibleHeight, 10), 1, 100),
      fov: clampNumber(finite(savedView.fov, 36), 20, 80),
      // 焦距允许为 null（正交模式没有焦距）；只在确实给出数值时才换算与钳制。
      focalLength:
        savedView.focalLength !== null &&
        savedView.focalLength !== undefined &&
        Number.isFinite(Number(savedView.focalLength))
          ? clampNumber(finite(savedView.focalLength, 50), 18, 120)
          : null
    };
  }
}

/**
 * 归一化文档级相机设置。
 */
export function normalizeCameraSettings(cameraSettings) {
  return {
    cameraView: cameraSettings?.cameraView === "top" ? "top" : "free",
    // 顶视图旋转吸附到 90° 的倍数，避免出现 17° 这种手工拖出来的零碎角度。
    cameraTopRotation:
      (((Math.round(finite(cameraSettings?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360,
    cameraMode: cameraSettings?.cameraMode === "orthographic" ? "orthographic" : "perspective",
    cameraFocalLength: clampNumber(finite(cameraSettings?.cameraFocalLength, 50), 18, 120)
  };
}

// 默认基础照明：一组实测调好的数值，作为新建场景与「恢复默认」的基准。
// 角度说明：方位角以场景正前方为 0、顺时针为正，仰角自地平线向上度量；
// 强度均为各灯的相对系数，曝光为渲染器 toneMappingExposure。
// 冻结对象：这些值会被 normalizeBaseLighting 当作兜底读，运行期不允许被就地改写。
export const DEFAULT_BASE_LIGHTING = Object.freeze({
  exposure: 1.05,
  hemisphereIntensity: 0.58,
  ambientIntensity: 0.16,
  mainIntensity: 2.05,
  mainAzimuth: 139,
  mainElevation: 55,
  mainShadowIntensity: 0.18,
  fillIntensity: 0.16,
  fillAzimuth: -48,
  fillElevation: 28,
  topIntensity: 0.12,
  topAzimuth: 90,
  topElevation: 86
});

/**
 * 归一化基础照明参数。
 *
 * 各字段的上限按「明显过曝 / 过暗」的边界给出：强度类 0~5 之间，
 * 角度类方位限 ±180°、仰角限 0~89°（89° 而非 90° 是为了避免顶光与地面共面）。
 */
export function normalizeBaseLighting(lightingSettings) {
  // 非对象（null / 字符串）统一当空对象处理，后续全部走默认值。
  const lightingInput =
    lightingSettings && typeof lightingSettings == "object" ? lightingSettings : {};
  return {
    exposure: clampNumber(finite(lightingInput.exposure, DEFAULT_BASE_LIGHTING.exposure), 0.5, 2),
    // floorBrightness 是后加的字段：旧文档里没有，此时不输出该键，
    // 让上层能区分「未设置」与「显式设成默认值」。
    ...(lightingInput.floorBrightness !== undefined
      ? {
          floorBrightness: clampNumber(finite(lightingInput.floorBrightness, 100), 50, 150)
        }
      : {}),
    hemisphereIntensity: clampNumber(
      finite(lightingInput.hemisphereIntensity, DEFAULT_BASE_LIGHTING.hemisphereIntensity),
      0,
      3
    ),
    ambientIntensity: clampNumber(
      finite(lightingInput.ambientIntensity, DEFAULT_BASE_LIGHTING.ambientIntensity),
      0,
      2
    ),
    mainIntensity: clampNumber(
      finite(lightingInput.mainIntensity, DEFAULT_BASE_LIGHTING.mainIntensity),
      0,
      5
    ),
    mainAzimuth: clampNumber(
      finite(lightingInput.mainAzimuth, DEFAULT_BASE_LIGHTING.mainAzimuth),
      -180,
      180
    ),
    mainElevation: clampNumber(
      finite(lightingInput.mainElevation, DEFAULT_BASE_LIGHTING.mainElevation),
      5,
      89
    ),
    mainShadowIntensity: clampNumber(
      finite(lightingInput.mainShadowIntensity, DEFAULT_BASE_LIGHTING.mainShadowIntensity),
      0,
      1
    ),
    fillIntensity: clampNumber(
      finite(lightingInput.fillIntensity, DEFAULT_BASE_LIGHTING.fillIntensity),
      0,
      3
    ),
    fillAzimuth: clampNumber(
      finite(lightingInput.fillAzimuth, DEFAULT_BASE_LIGHTING.fillAzimuth),
      -180,
      180
    ),
    fillElevation: clampNumber(
      finite(lightingInput.fillElevation, DEFAULT_BASE_LIGHTING.fillElevation),
      0,
      89
    ),
    topIntensity: clampNumber(
      finite(lightingInput.topIntensity, DEFAULT_BASE_LIGHTING.topIntensity),
      0,
      3
    ),
    topAzimuth: clampNumber(
      finite(lightingInput.topAzimuth, DEFAULT_BASE_LIGHTING.topAzimuth),
      -180,
      180
    ),
    topElevation: clampNumber(
      finite(lightingInput.topElevation, DEFAULT_BASE_LIGHTING.topElevation),
      0,
      89
    )
  };
}
