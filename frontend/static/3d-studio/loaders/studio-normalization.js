/**
 * 3D 工作室的输入归一化工具箱。
 *
 * 文档从后端读回或用户在面板输入参数后，统一把缺失 / 越界 / 类型不对的字段收敛成安全值再
 * 交给渲染与状态逻辑。长度单位一律米，角度单位度，相机位置用世界坐标，色温用开尔文；全部
 * 是纯函数，不持有状态、不写回入参。夹取统一用 utils/numbers.js 的 clampNumber，区间上下
 * 限与其余各处相反时结果会静默不同，故按同一份口径。
 */
import { clampNumber, coercedFiniteNumberOr } from "../../utils/numbers.js?v=2609221415";
// 色温换算（含唯一的公式与单通道夹取）共用 utils/colors.js：studio 侧与灯光侧的系数不许各写一份。
import { kelvinToRgbHex as normalizedKelvinToRgbHex } from "../../utils/colors.js?v=2609221415";

/**
 * 转成有限数字，失败时用兜底值（JSON 里的 null / "" / "abc" 直接运算会得到 NaN）。
 *
 * 薄封装 `utils/numbers.js` 的 `coercedFiniteNumberOr`：这套换算在 studio 侧被大量调用，过去这里是
 * 裸 `Number(value)` + `Number.isFinite`，缺了那份挡板 —— `Number("")` 是 0、`Number(true)` 是 1、
 * `Number([])` 也是 0，于是「用户清空了输入框」会被当成 0 写进场景参数。保留这个名字只是因为
 * 调用点太多，实现不许再自己写一份。
 */
export function finite(value, fallback = 0) {
  return coercedFiniteNumberOr(value, fallback);
}

/**
 * 把任意角度归一化到 [0, 360)。
 * 落在 [0, 360] 内的值原样返回：刻意保留 360 而不取模成 0，取模会吞掉「正好转了一圈」的意图。
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
 * 给出某类物件允许的最小平面尺寸（米），对应检查器尺寸输入框的 min。
 * 人体存在传感器细长，允许小到 1 厘米；其余家具最小 10 厘米，避免生成几乎不可见的碎片。
 */
export function itemMinimumFootprint(itemType) {
  if (itemType === "presence") {
    return 0.01;
  } else {
    return 0.1;
  }
}

/**
 * 给出某类物件允许的最小高度 / 厚度（米）：标签贴片 1 毫米、地毯 4 毫米、其余至少 5 厘米。
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
 * 归一化标签文本：连续空白折成一个空格再 trim（换行会画出异常字距），超长按 maxLength 截断。
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
 * 把色温换算成 0xRRGGBB（灯具发光色），公式与单通道收尾的唯一实现在 utils/colors.js。
 *
 * 色温先夹到 2200~6500 K：这是场景里灯具实际可用的色温范围，近似式在此区间内才准。调用方的
 * 区间与灯光实体效果色那条路**有意不同**（那条按近似式名义范围 1000~20000 夹）。
 */
export function kelvinToRgbHex(kelvin) {
  return normalizedKelvinToRgbHex(kelvin, {
    minKelvin: 2200,
    maxKelvin: 6500,
    fallbackKelvin: 3000
  });
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

// 默认基础照明：新建场景与「恢复默认」的基准，会被 normalizeBaseLighting 兜底读取，运行期不可就地改写。
// 方位角以场景正前方为 0、顺时针为正，仰角自地平线向上度量；强度为各灯相对系数，曝光为 toneMappingExposure。
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
 * 上限按「明显过曝 / 过暗」的边界给出；仰角限 0~89°，89° 而非 90° 是为了避免顶光与地面共面。
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
