/**
 * 3D 工作室的输入归一化工具箱。
 */
import { clampNumber, coercedFiniteNumberOr } from "../../utils/numbers.js?v=2609271226";
// 色温换算（含唯一的公式与单通道夹取）共用 utils/colors.js：studio 侧与灯光侧的系数不许各写一份。
import { kelvinToRgbHex as normalizedKelvinToRgbHex } from "../../utils/colors.js?v=2609271226";

/**
 * 转成有限数字，失败时用兜底值（JSON 里的 null / "" / "abc" 直接运算会得到 NaN）。
 */
export function finite(value, fallback = 0) {
  return coercedFiniteNumberOr(value, fallback);
}

/**
 * 把任意角度归一化到 [0, 360)。
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
    cameraTopRotation:
      (((Math.round(finite(cameraSettings?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360,
    cameraMode: cameraSettings?.cameraMode === "orthographic" ? "orthographic" : "perspective",
    cameraFocalLength: clampNumber(finite(cameraSettings?.cameraFocalLength, 50), 18, 120)
  };
}

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
 */
export function normalizeBaseLighting(lightingSettings) {
  // 非对象（null / 字符串）统一当空对象处理，后续全部走默认值。
  const lightingInput =
    lightingSettings && typeof lightingSettings == "object" ? lightingSettings : {};
  return {
    exposure: clampNumber(finite(lightingInput.exposure, DEFAULT_BASE_LIGHTING.exposure), 0.5, 2),
    // floorBrightness 是后加的字段：旧文档里没有，此时不输出该键，
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
