/**
 * 运行时弹窗与设备入场的动画补丁，只在「3D 运行时」这类全屏场景使用，编辑器不加载。
 *
 * 目的：绕开 Safari（WebKit）播放一次性 CSS 动画的渲染缺陷——动画结束后元素可能停在首帧
 * （全透明 / 错位），看起来像弹窗没出来。故宁可牺牲一部分动效，也保证内容一定可见。
 */

/**
 * 判断当前浏览器是否为「非 Chromium 的 Safari / WebKit」。
 *
 * 判定同时要求出现 AppleWebKit 与 Safari，并排除 Chrome、Edg、OPR、FxiOS 等
 * 同样带 AppleWebKit 字样的浏览器——它们的 UA 里都有这两段字符串，只有排除后才剩下真 Safari。
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
 * 非 Safari 直接返回空数组交给 CSS 原有动画；带 hb-runtime-simplified-motion 类时连后代一起扫描并取消
 * 「只播放一次」的动画（iterations === 1，正是它卡在首帧），无限循环的保留；只对第一个子元素做不透明度淡入。
 */
export function playStableRuntimeDialogEntrance(dialogElement, contentElement) {
  if (!runtimeDialogUsesStableMotion()) {
    return [];
  }
  // 简化动效模式下弹窗内部还有别的入场动画，需要连后代一起清掉，否则局部仍可能透明。
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
  const animations = [];
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
export function playMediaSpeakerEntrance(speakerElement) {
  // 尊重系统的 prefers-reduced-motion：前庭敏感用户不应看到位移与旋转。
  if (!speakerElement || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return null;
  } else {
    // 关键帧刻意做过冲：先滑过头再回弹，最后停在原位（offset 1 时 transform 已是恒等变换）。
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
        // 140ms 延迟让弹窗本体先出现，避免两个动画挤在同一帧上显得突兀。
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
  deviceElement,
  { distance: distancePx = 150, delay: delayMs = 90 } = {}
) {
  if (!deviceElement || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return null;
  } else {
    // 用 translate 而不是 top / left：位移交给合成层，长列表里不会触发重排。
    // 起始帧带 2px 模糊模拟景深，落定过程中清零，最后以 7px → -3px → 0 的二次回弹收尾。
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
