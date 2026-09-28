/**
 * 运行时弹窗与设备入场的动画补丁，只在「3D 运行时」这类全屏场景使用，编辑器不加载。
 */


/**
 * 判断当前浏览器是否为「非 Chromium 的 Safari / WebKit」。
 */
export function runtimeDialogUsesStableMotion({
  userAgent: userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent || ""
} = {}) {
  const userAgentText = String(userAgent || "");
  return (
    /AppleWebKit/i.test(userAgentText) &&
    /Safari/i.test(userAgentText) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|OPiOS|FxiOS/i.test(userAgentText)
  );
}
/**
 * 播放入场动画，保证弹窗内容可见。
 */
export function playStableRuntimeDialogEntrance(dialogElement: any, contentElement: any) {
  if (!runtimeDialogUsesStableMotion()) {
    return [];
  }
  const motionRoots = dialogElement.classList.contains("hb-runtime-simplified-motion")
    ? [dialogElement, contentElement, ...contentElement.querySelectorAll("*")]
    : [dialogElement, contentElement];
  for (const motionRoot of motionRoots) {
    for (const animation of motionRoot.getAnimations?.() || []) {
      if (animation.effect?.getTiming?.().iterations === 1) {
        animation.cancel();
      }
    }
  }
  const firstChildElement = contentElement.firstElementChild;
  const animations: any[] = [];
  if (firstChildElement?.animate) {
    // 240ms 的时长按「能看出过渡但不等」来定；缓动与全局弹窗动效保持同一曲线。
    animations.push(
      firstChildElement.animate(
        [
          {
            opacity: 0
          },
          {
            opacity: 1
          }
        ],
        {
          duration: 240,
          easing: "cubic-bezier(.22,.61,.36,1)",
          fill: "both"
        }
      )
    );
  } else if (firstChildElement) {
    // 元素不支持 Web Animations 时只能直接置为可见，宁可没有动效也不能空着。
    firstChildElement.style.opacity = "1";
  }
  return animations;
}
/**
 * 播放音箱控件的滑入入场动画。
 */
export function playMediaSpeakerEntrance(speakerElement: any) {
  // 尊重系统的 prefers-reduced-motion：前庭敏感用户不应看到位移与旋转。
  if (!speakerElement || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return null;
  } else {
    return speakerElement.animate(
      [
        {
          opacity: 0,
          transform: "translate3d(148px,0,0) scale(.78) rotate(10deg)",
          offset: 0
        },
        {
          opacity: 1,
          transform: "translate3d(-8px,0,0) scale(1.035) rotate(-1deg)",
          offset: 0.68
        },
        {
          opacity: 0.96,
          transform: "translate3d(3px,0,0) scale(.992) rotate(0)",
          offset: 0.84
        },
        {
          opacity: 0.94,
          transform: "translate3d(0,0,0) scale(1) rotate(0)",
          offset: 1
        }
      ],
      {
        duration: 720,
        delay: 140,
        easing: "cubic-bezier(.18,.78,.24,1)",
        fill: "both"
      }
    );
  }
}
/**
 * 播放固定式设备的「下落归位」入场动画。
 */
export function playFixedDeviceDropEntrance(
  deviceElement: any,
  { distance: distancePx = 150, delay: delayMs = 90 } = {}
) {
  if (!deviceElement || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return null;
  } else {
    // 用 translate 而不是 top / left：位移交给合成层，长列表里不会触发重排。
    return deviceElement.animate(
      [
        {
          filter: "blur(2px)",
          translate: "0 -" + distancePx + "px",
          offset: 0
        },
        {
          filter: "blur(0)",
          translate: "0 7px",
          offset: 0.7
        },
        {
          filter: "blur(0)",
          translate: "0 -3px",
          offset: 0.86
        },
        {
          filter: "blur(0)",
          translate: "0 0",
          offset: 1
        }
      ],
      {
        duration: 660,
        delay: delayMs,
        easing: "cubic-bezier(.2,.78,.28,1)",
        fill: "both"
      }
    );
  }
}
