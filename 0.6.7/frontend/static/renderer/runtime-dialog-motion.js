export function runtimeDialogUsesStableMotion({
  userAgent: userAgent = typeof navigator > "u" ? "" : navigator.userAgent || "",
} = {}) {
  const agentText = String(userAgent || "");
  return (
    /AppleWebKit/i.test(agentText) &&
    (/Safari/i.test(agentText) || /\bHA-Bridge-Apple\/\d/.test(agentText)) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|OPiOS|FxiOS/i.test(agentText)
  );
}
export function playStableRuntimeDialogEntrance(rootElement, containerElement) {
  if (!runtimeDialogUsesStableMotion()) return [];
  const animatedRoots = rootElement.classList.contains("hb-runtime-simplified-motion")
    ? [rootElement, containerElement, ...containerElement.querySelectorAll("*")]
    : [rootElement, containerElement];
  for (const animatedRoot of animatedRoots)
    for (const animation of animatedRoot.getAnimations?.() || [])
      animation.effect?.getTiming?.().iterations === 1 && animation.cancel();
  const firstChildElement = containerElement.firstElementChild,
    entranceAnimations = [];
  if (firstChildElement?.animate) {
    const entranceAnimation = firstChildElement.animate(
      [
        {
          opacity: 0,
        },
        {
          opacity: 1,
        },
      ],
      {
        duration: 240,
        easing: "cubic-bezier(.22,.61,.36,1)",
        fill: "both",
      },
    );
    (entranceAnimations.push(entranceAnimation),
      (entranceAnimation.onfinish = () => {
        ((firstChildElement.style.opacity = "1"),
          (firstChildElement.style.willChange = "auto"),
          (entranceAnimation.onfinish = entranceAnimation.oncancel = null),
          entranceAnimation.cancel(),
          (entranceAnimations.length = 0));
      }),
      (entranceAnimation.oncancel = () => {
        ((entranceAnimation.onfinish = entranceAnimation.oncancel = null),
          (entranceAnimations.length = 0));
      }));
  } else
    firstChildElement &&
      ((firstChildElement.style.opacity = "1"), (firstChildElement.style.willChange = "auto"));
  return entranceAnimations;
}
export function playMediaSpeakerEntrance(speakerElement) {
  return !speakerElement || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? null
    : speakerElement.animate(
        [
          {
            opacity: 0,
            transform: "translate3d(148px,0,0) scale(.78) rotate(10deg)",
            offset: 0,
          },
          {
            opacity: 1,
            transform: "translate3d(-8px,0,0) scale(1.035) rotate(-1deg)",
            offset: 0.68,
          },
          {
            opacity: 0.96,
            transform: "translate3d(3px,0,0) scale(.992) rotate(0)",
            offset: 0.84,
          },
          {
            opacity: 0.94,
            transform: "translate3d(0,0,0) scale(1) rotate(0)",
            offset: 1,
          },
        ],
        {
          duration: 720,
          delay: 140,
          easing: "cubic-bezier(.18,.78,.24,1)",
          fill: "both",
        },
      );
}
export function playFixedDeviceDropEntrance(
  deviceElement,
  { distance: distance = 150, delay: delay = 90 } = {},
) {
  return !deviceElement || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? null
    : deviceElement.animate(
        [
          {
            filter: "blur(2px)",
            translate: "0 -" + distance + "px",
            offset: 0,
          },
          {
            filter: "blur(0)",
            translate: "0 7px",
            offset: 0.7,
          },
          {
            filter: "blur(0)",
            translate: "0 -3px",
            offset: 0.86,
          },
          {
            filter: "blur(0)",
            translate: "0 0",
            offset: 1,
          },
        ],
        {
          duration: 660,
          delay: delay,
          easing: "cubic-bezier(.2,.78,.28,1)",
          fill: "both",
        },
      );
}
