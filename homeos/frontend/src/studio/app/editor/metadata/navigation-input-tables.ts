/**
 * 导航检查器的「表单输入 → 属性」元数据表 —— 从 home.ts 单体切出。
 *
 * 纯查表数据（元素 → 属性名 / 数值范围 / 开关态），无闭包捕获、无 store：
 * 表单元素引用由宿主按 ctx 注入，取值与写回逻辑仍在 home.ts 的输入监听里。
 * 多声明语句已整条随切片搬出（`--whole-statement`），调用点零改写。
 */

export interface NavigationInputElementRefs {
  navigationFrameActiveOpacityElement: any;
  navigationFrameAngleElement: any;
  navigationFrameColorElement: any;
  navigationFrameIdleOpacityElement: any;
  navigationFrameVisibleElement: any;
  navigationFrameWidthElement: any;
  navigationGlowActiveSizeElement: any;
  navigationGlowActiveStrengthElement: any;
  navigationGlowAngleElement: any;
  navigationGlowColorElement: any;
  navigationGlowIdleSizeElement: any;
  navigationGlowIdleStrengthElement: any;
  navigationGlowVisibleElement: any;
  navigationIconActiveOpacityElement: any;
  navigationIconColorElement: any;
  navigationIconIdleOpacityElement: any;
  navigationIconLeftElement: any;
  navigationIconSizeElement: any;
  navigationIconTopElement: any;
  navigationIconVisibleElement: any;
  navigationMainColorElement: any;
  navigationMainSizeElement: any;
  navigationMainSpacingElement: any;
  navigationMainTextElement: any;
  navigationMainTextLeftElement: any;
  navigationMainTextTopElement: any;
  navigationMainVisibleElement: any;
  navigationMainWeightElement: any;
  navigationRadiusElement: any;
  navigationSecondaryColorElement: any;
  navigationSecondarySizeElement: any;
  navigationSecondarySpacingElement: any;
  navigationSecondaryTextElement: any;
  navigationSecondaryTextLeftElement: any;
  navigationSecondaryTextTopElement: any;
  navigationSecondaryVisibleElement: any;
  navigationSecondaryWeightElement: any;
  navigationTextActiveOpacityElement: any;
  navigationTextIdleOpacityElement: any;
}

/**
 * 建表一次（与 `setupEventLogWallInspector` 等同一形态：表单元素引用按 ctx 注入）。
 * 正文逐字保留，只有「残留依赖显式化」这一处人工改动。
 */
export function createNavigationInputTables(
  ctx: NavigationInputElementRefs,
) {
  const {
    navigationFrameActiveOpacityElement,
    navigationFrameAngleElement,
    navigationFrameColorElement,
    navigationFrameIdleOpacityElement,
    navigationFrameVisibleElement,
    navigationFrameWidthElement,
    navigationGlowActiveSizeElement,
    navigationGlowActiveStrengthElement,
    navigationGlowAngleElement,
    navigationGlowColorElement,
    navigationGlowIdleSizeElement,
    navigationGlowIdleStrengthElement,
    navigationGlowVisibleElement,
    navigationIconActiveOpacityElement,
    navigationIconColorElement,
    navigationIconIdleOpacityElement,
    navigationIconLeftElement,
    navigationIconSizeElement,
    navigationIconTopElement,
    navigationIconVisibleElement,
    navigationMainColorElement,
    navigationMainSizeElement,
    navigationMainSpacingElement,
    navigationMainTextElement,
    navigationMainTextLeftElement,
    navigationMainTextTopElement,
    navigationMainVisibleElement,
    navigationMainWeightElement,
    navigationRadiusElement,
    navigationSecondaryColorElement,
    navigationSecondarySizeElement,
    navigationSecondarySpacingElement,
    navigationSecondaryTextElement,
    navigationSecondaryTextLeftElement,
    navigationSecondaryTextTopElement,
    navigationSecondaryVisibleElement,
    navigationSecondaryWeightElement,
    navigationTextActiveOpacityElement,
    navigationTextIdleOpacityElement,
  } = ctx;
  const navigationColorPropertiesByElement = new Map([
      [navigationMainTextElement, "mainText"],
      [navigationSecondaryTextElement, "secondaryText"],
      [navigationMainColorElement, "mainColor"],
      [navigationSecondaryColorElement, "secondaryColor"],
      [navigationIconColorElement, "iconColor"],
      [navigationFrameColorElement, "frameColor"],
      [navigationGlowColorElement, "glowColor"],
    ]),
    navigationPropertyConfigsByElement = new Map([
      [
        navigationMainSizeElement,
        {
          property: "mainSize",
          minimum: 1,
          maximum: 500,
          divisor: 1,
        },
      ],
      [
        navigationSecondarySizeElement,
        {
          property: "secondarySize",
          minimum: 1,
          maximum: 500,
          divisor: 1,
        },
      ],
      [
        navigationMainWeightElement,
        {
          property: "mainWeight",
          minimum: 0,
          maximum: 3,
          divisor: 1,
        },
      ],
      [
        navigationSecondaryWeightElement,
        {
          property: "secondaryWeight",
          minimum: 0,
          maximum: 3,
          divisor: 1,
        },
      ],
      [
        navigationMainSpacingElement,
        {
          property: "mainSpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
        },
      ],
      [
        navigationSecondarySpacingElement,
        {
          property: "secondarySpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
        },
      ],
      [
        navigationMainTextLeftElement,
        {
          property: "mainTextLeft",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        navigationMainTextTopElement,
        {
          property: "mainTextTop",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        navigationSecondaryTextLeftElement,
        {
          property: "secondaryTextLeft",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        navigationSecondaryTextTopElement,
        {
          property: "secondaryTextTop",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        navigationTextIdleOpacityElement,
        {
          property: "textIdleOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        navigationTextActiveOpacityElement,
        {
          property: "textActiveOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        navigationIconSizeElement,
        {
          property: "iconSize",
          minimum: 1,
          maximum: 500,
          divisor: 1,
        },
      ],
      [
        navigationIconLeftElement,
        {
          property: "iconLeft",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        navigationIconTopElement,
        {
          property: "iconTop",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        navigationIconIdleOpacityElement,
        {
          property: "iconIdleOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        navigationIconActiveOpacityElement,
        {
          property: "iconActiveOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        navigationFrameWidthElement,
        {
          property: "frameWidth",
          minimum: 0,
          maximum: 20,
          divisor: 1,
        },
      ],
      [
        navigationFrameIdleOpacityElement,
        {
          property: "frameIdleOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        navigationFrameActiveOpacityElement,
        {
          property: "frameActiveOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        navigationRadiusElement,
        {
          property: "radius",
          minimum: 0,
          maximum: 50,
          divisor: 100,
        },
      ],
      [
        navigationFrameAngleElement,
        {
          property: "frameAngle",
          minimum: 0,
          maximum: 360,
          divisor: 1,
        },
      ],
      [
        navigationGlowAngleElement,
        {
          property: "glowAngle",
          minimum: 0,
          maximum: 360,
          divisor: 1,
        },
      ],
      [
        navigationGlowIdleStrengthElement,
        {
          property: "glowIdleStrength",
          minimum: 0,
          maximum: 500,
          divisor: 100,
        },
      ],
      [
        navigationGlowIdleSizeElement,
        {
          property: "glowIdleSize",
          minimum: 0,
          maximum: 300,
          divisor: 100,
        },
      ],
      [
        navigationGlowActiveStrengthElement,
        {
          property: "glowActiveStrength",
          minimum: 0,
          maximum: 500,
          divisor: 100,
        },
      ],
      [
        navigationGlowActiveSizeElement,
        {
          property: "glowActiveSize",
          minimum: 0,
          maximum: 300,
          divisor: 100,
        },
      ],
    ]),
    navigationToggleStateByElement = new Map([
      [navigationTextIdleOpacityElement, "off"],
      [navigationIconIdleOpacityElement, "off"],
      [navigationFrameIdleOpacityElement, "off"],
      [navigationGlowIdleStrengthElement, "off"],
      [navigationGlowIdleSizeElement, "off"],
      [navigationTextActiveOpacityElement, "on"],
      [navigationIconActiveOpacityElement, "on"],
      [navigationFrameActiveOpacityElement, "on"],
      [navigationGlowActiveStrengthElement, "on"],
      [navigationGlowActiveSizeElement, "on"],
    ]);

  const navigationVisibilityPropertiesByButton = new Map([
    [navigationMainVisibleElement, "mainTextVisible"],
    [navigationSecondaryVisibleElement, "secondaryTextVisible"],
    [navigationIconVisibleElement, "iconVisible"],
    [navigationFrameVisibleElement, "frameVisible"],
    [navigationGlowVisibleElement, "glowVisible"],
  ]);

  return {
    navigationColorPropertiesByElement,
    navigationPropertyConfigsByElement,
    navigationToggleStateByElement,
    navigationVisibilityPropertiesByButton,
  };
}
