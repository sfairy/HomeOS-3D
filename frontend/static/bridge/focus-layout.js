/**
 * 3D 交互组件的聚焦让位布局：舞台页进入聚焦（点击组件、进入视图编辑）时，同页面的其它组件
 */
// 以画布元素为键的状态表：用 WeakMap 是为了让画布被移除后状态能随之回收。
const layoutStateByCanvas = new WeakMap();
// 每 1 个 amount 单位消耗 580ms：动画时长与位移量成正比，
const ANIMATION_MS_PER_UNIT = 580;
// 让位时额外留出的最小间隙，保证让位后组件之间不会贴在一起。
const BASE_DISTANCE_PX = 24;
const EXCLUDED_CONTENT_SELECTOR = ".hb-interaction3d-host, iframe, video, audio, object, embed";
const TRACKED_STYLE_PROPS = ["translate", "opacity", "transition", "willChange", "pointerEvents"];
function getSharedComponentIds(layoutClient) {
  return (
    (
      layoutClient.context.document?.pages?.find(
        contextPage => contextPage.id === layoutClient.context.page?.id
      ) || layoutClient.context.page
    )?.sharedComponentIds || []
  );
}
// 自定义缓动：用牛顿迭代解出「进度→曲线参数」的反函数（固定 8 次迭代足够收敛到 1e-3 级别），
function easeProgress(progress) {
  let curveParam = progress;
  for (let iterationIndex = 0; iterationIndex < 8; iterationIndex++) {
    curveParam = Math.max(
      0,
      Math.min(
        1,
        curveParam -
          (curveParam * 0.6 -
            curveParam * 0.6 * curveParam +
            curveParam * curveParam * curveParam -
            progress) /
            (0.6 - curveParam * 1.2 + curveParam * 3 * curveParam)
      )
    );
  }
  return curveParam * curveParam * (3 - curveParam * 2);
}
// 拆分 computed style 的 translate：兼容 calc() 整体作为一个分量（不拆开其中的运算符），
function parseTranslateValue(translateValue) {
  if (!translateValue || translateValue === "none") {
    return ["0px", "0px"];
  } else {
    return translateValue.match(/(?:calc\([^)]*\)|[^\s])+/g) || ["0px", "0px"];
  }
}
// 可聚焦元素的通用选择器，用于把已让位（隐藏）的组件从键盘 Tab 序列里摘出去。
const FOCUSABLE_SELECTOR =
  "a[href], area[href], button, input, select, textarea, [tabindex], [contenteditable], summary";
// 需要拦截的事件：让位过程中的组件不应再接受点击 / 键盘 / 焦点，
const GUARD_EVENT_TYPES = ["pointerdown", "click", "dblclick", "contextmenu", "keydown", "focusin"];
function suspendTabStops(subtreeRootElement, memberState) {
  const tabbableElements = [
    subtreeRootElement,
    ...subtreeRootElement.querySelectorAll(FOCUSABLE_SELECTOR)
  ];
  for (const tabbableElement of tabbableElements) {
    if (tabbableElement.tabIndex >= 0 && !memberState.tabStops.has(tabbableElement)) {
      memberState.tabStops.set(tabbableElement, tabbableElement.getAttribute("tabindex"));
      tabbableElement.setAttribute("tabindex", "-1");
    }
  }
}
// 幂等地切换某个成员的「隐藏」状态：状态未变直接返回，
function applyHiddenState(memberElement, memberRecord, isHidden) {
  if (memberRecord.hidden === isHidden) {
    return;
  }
  memberRecord.hidden = isHidden;
  if (isHidden) {
    // 隐藏的三件套：摘出 Tab 序列、把内部焦点还回去、屏蔽指针事件。
    suspendTabStops(memberElement, memberRecord);
    if (memberElement.contains(memberElement.ownerDocument.activeElement)) {
      memberElement.ownerDocument.activeElement.blur();
    }
    memberElement.style.pointerEvents = "none";
  } else {
    for (const [tabStopElement, previousTabIndex] of memberRecord.tabStops) {
      if (previousTabIndex === null) {
        tabStopElement.removeAttribute("tabindex");
      } else {
        tabStopElement.setAttribute("tabindex", previousTabIndex);
      }
    }
    memberRecord.tabStops.clear();
    memberElement.style.pointerEvents = memberRecord.style.pointerEvents;
  }
  const ariaHiddenValue = isHidden ? "true" : memberRecord.ariaHidden;
  // 只在值真的变化时写 DOM：无谓的属性写入会触发可访问性树的重复计算。
  if (memberElement.getAttribute("aria-hidden") !== ariaHiddenValue) {
    if (ariaHiddenValue === null) {
      memberElement.removeAttribute("aria-hidden");
    } else {
      memberElement.setAttribute("aria-hidden", ariaHiddenValue);
    }
  }
}
// 用 calc 在原位移上叠加让位量，而不是覆盖原 translate：
function applyMemberMotion(layoutState, motionElement, memberSnapshot, amount) {
  const [translateX, translateY = "0px", translateZ] = memberSnapshot.translate;
  motionElement.style.translate =
    "calc(" +
    translateX +
    " - " +
    layoutState.distance * amount +
    "px) " +
    translateY +
    (translateZ ? " " + translateZ : "");
  motionElement.style.opacity = String(memberSnapshot.opacity * (1 - amount));
  // 只要开始让位（amount > 0）就算隐藏；已经进入让位集合的目标同样算，
  applyHiddenState(
    motionElement,
    memberSnapshot,
    amount > 0 || (layoutState.owners.size > 0 && layoutState.targets.has(motionElement))
  );
}
// 成员不再需要让位时逐项还原内联样式；顺序无关但必须全量覆盖，
function detachMember(layout, detachedElement, detachedMemberState) {
  for (const styleProperty of TRACKED_STYLE_PROPS) {
    detachedElement.style[styleProperty] = detachedMemberState.style[styleProperty];
  }
  applyHiddenState(detachedElement, detachedMemberState, false);
  layout.members.delete(detachedElement);
  layout.targets.delete(detachedElement);
}
// 取消在途动画帧，并把句柄清空（置 null 才能让 animateAmount 判出「当前没有动画」）。
function cancelMotionFrame(frameOwner) {
  if (frameOwner.frame !== null) {
    frameOwner.view.cancelAnimationFrame(frameOwner.frame);
  }
  frameOwner.frame = null;
}
// 只对 targets 里的元素应用动画：members 是「曾出现过」的全集，targets 才是本次需要让位的集合。
function renderMembers(renderingLayout) {
  for (const renderedElement of renderingLayout.targets) {
    const renderedMemberState = renderingLayout.members.get(renderedElement);
    if (renderedMemberState) {
      applyMemberMotion(
        renderingLayout,
        renderedElement,
        renderedMemberState,
        renderingLayout.amount
      );
    }
  }
}
// 驱动让位量 amount 向目标值过渡。
function animateAmount(animatingLayout, targetAmount, shouldAnimate = true) {
  // 目标未变且（要么正在动画中、要么已经到位）时只重排一次 DOM：重复启动 rAF 会打断进行中的动画。
  if (
    animatingLayout.to === targetAmount &&
    ((shouldAnimate && animatingLayout.frame !== null) || animatingLayout.amount === targetAmount)
  ) {
    renderMembers(animatingLayout);
    return;
  }
  cancelMotionFrame(animatingLayout);
  const fromAmount = animatingLayout.amount;
  animatingLayout.to = targetAmount;
  if (
    !shouldAnimate ||
    animatingLayout.view.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    animatingLayout.amount = targetAmount;
    renderMembers(animatingLayout);
    return;
  }
  const startTimeMs = animatingLayout.view.performance.now();
  // 时长与位移量成正比：从 0 到 1 用满 580ms，中途反转只走剩余的比例。
  const durationMs = ANIMATION_MS_PER_UNIT * Math.abs(targetAmount - fromAmount);
  // 动画帧回调：按时间线推进 amount 并重绘；走完就停手不再排帧，中途反转会重算时长与起点。
  const advanceMotion = timestampMs => {
    animatingLayout.frame = null;
    const elapsedFraction = durationMs
      ? Math.max(0, Math.min(1, (timestampMs - startTimeMs) / durationMs))
      : 1;
    animatingLayout.amount =
      fromAmount + (targetAmount - fromAmount) * easeProgress(elapsedFraction);
    renderMembers(animatingLayout);
    if (elapsedFraction < 1) {
      animatingLayout.frame = animatingLayout.view.requestAnimationFrame(advanceMotion);
    }
  };
  animatingLayout.frame = animatingLayout.view.requestAnimationFrame(advanceMotion);
}
/**
 * 让画布上的兄弟组件为聚焦中的 3D 组件「让位」。
 */
function updateLayout(canvasLayout) {
  // 两份 ID 集合：clientComponentIds 决定「哪些兄弟组件可能需要让位」，
  const clientList = [...canvasLayout.clients];
  const clientComponentIds = new Set(clientList.flatMap(getSharedComponentIds));
  const ownerComponentIds = new Set([...canvasLayout.owners].flatMap(getSharedComponentIds));
  // 候选成员：画布的直接子节点里，属于同一页面的共享组件、
  const componentElements = [...canvasLayout.canvas.children].filter(canvasChild => {
    const componentId =
      canvasChild.dataset?.componentId ||
      canvasChild.dataset?.effectFor ||
      canvasChild.dataset?.airflowFor;
    return (
      clientComponentIds.has(componentId) &&
      !clientList.some(clientEntry => canvasChild.contains(clientEntry.root)) &&
      !canvasChild.matches?.(EXCLUDED_CONTENT_SELECTOR) &&
      !canvasChild.querySelector?.(EXCLUDED_CONTENT_SELECTOR)
    );
  });
  const componentElementSet = new Set(componentElements);
  for (const [trackedElement, trackedMemberState] of canvasLayout.members) {
    if (!componentElementSet.has(trackedElement)) {
      detachMember(canvasLayout, trackedElement, trackedMemberState);
    }
  }
  const canvasRect = canvasLayout.canvas.getBoundingClientRect();
  // 设计器可能整体缩放过画布：getBoundingClientRect 给的是屏幕尺寸，而 style.translate
  const canvasScale = canvasRect.width / canvasLayout.canvas.clientWidth || 1;
  // 让位距离取所有成员中最靠右者的右边界，再加基础间隙 —— 一次平移即可把整排成员推出可视区。
  let distancePx = BASE_DISTANCE_PX;
  for (const childElement of componentElements) {
    let childMemberState = canvasLayout.members.get(childElement);
    const childRect = childElement.getBoundingClientRect();
    distancePx = Math.max(
      distancePx,
      (childRect.right - canvasRect.left) / canvasScale +
        BASE_DISTANCE_PX +
        (childMemberState && canvasLayout.targets.has(childElement)
          ? canvasLayout.distance * canvasLayout.amount
          : 0)
    );
    if (!childMemberState) {
      // 首次遇到该成员时做一次快照：内联样式、计算后的 opacity 与 translate、原有 aria-hidden。
      const computedStyle = canvasLayout.view.getComputedStyle(childElement);
      childMemberState = {
        style: Object.fromEntries(
          TRACKED_STYLE_PROPS.map(trackedProperty => [
            trackedProperty,
            childElement.style[trackedProperty] || ""
          ])
        ),
        opacity: Number(computedStyle.opacity),
        translate: parseTranslateValue(computedStyle.translate),
        hidden: false,
        tabStops: new Map(),
        ariaHidden: childElement.getAttribute("aria-hidden")
      };
      canvasLayout.members.set(childElement, childMemberState);
      childElement.style.transition = "none";
      childElement.style.willChange = [childMemberState.style.willChange, "opacity", "translate"]
        .filter(styleValue => styleValue && styleValue !== "auto")
        .join(",");
      applyMemberMotion(canvasLayout, childElement, childMemberState, 0);
    }
  }
  canvasLayout.distance = distancePx;
  // 只有存在聚焦组件时才需要重算让位目标；没有聚焦时 targets 保持为空，动画自然归位到 0。
  if (canvasLayout.owners.size) {
    // 目标是「与聚焦组件属于同一页面」的成员：其它页面的组件此刻不可见，不必为它们让位。
    const newTargetSet = new Set(
      componentElements.filter(ownerComponentElement =>
        ownerComponentIds.has(
          ownerComponentElement.dataset.componentId ||
            ownerComponentElement.dataset.effectFor ||
            ownerComponentElement.dataset.airflowFor
        )
      )
    );
    for (const staleTarget of canvasLayout.targets) {
      if (!newTargetSet.has(staleTarget) && canvasLayout.members.has(staleTarget)) {
        canvasLayout.targets.delete(staleTarget);
        applyMemberMotion(canvasLayout, staleTarget, canvasLayout.members.get(staleTarget), 0);
      }
    }
    canvasLayout.targets = newTargetSet;
  }
  // 最后统一按当前 amount 重排一次：无论本次是新增、移除还是位置变化，画面都落到一致的中间态。
  renderMembers(canvasLayout);
}
// 某个使用方退出：还有其它使用方时只更新布局；
function releaseLayout(releasedLayout, clientRegistration) {
  releasedLayout.owners.delete(clientRegistration);
  releasedLayout.clients.delete(clientRegistration);
  if (releasedLayout.clients.size) {
    updateLayout(releasedLayout);
    animateAmount(releasedLayout, releasedLayout.owners.size ? 1 : 0, false);
  } else {
    // 停掉在途动画帧：rAF 回调会持续引用这个布局对象，不取消就无法回收。
    cancelMotionFrame(releasedLayout);
    releasedLayout.observer.disconnect();
    for (const eventName of GUARD_EVENT_TYPES) {
      releasedLayout.canvas.removeEventListener(eventName, releasedLayout.guard, true);
    }
    for (const [releasedElement, releasedMemberState] of releasedLayout.members) {
      detachMember(releasedLayout, releasedElement, releasedMemberState);
    }
    if (layoutStateByCanvas.get(releasedLayout.canvas) === releasedLayout) {
      layoutStateByCanvas.delete(releasedLayout.canvas);
    }
  }
}
/**
 * 为某个 3D 宿主元素创建聚焦让位控制器。
 * @param {object} [context] 渲染上下文：`document` / `page` 用于取共享组件列表，
 */
export function createInteraction3dFocusLayout(rootElement, context = {}) {
  const registration = {
    root: rootElement,
    context: context
  };
  let activeLayout = null;
  let isActive = false;
  let isDisposed = false;
  // refresh 会被属性更新、尺寸变化、聚焦切换反复调用，因此实现必须是幂等的：
  const refreshLayout = () => {
    // 编辑器环境不参与让位：编辑时组件位置必须稳定，位移会让用户误以为组件被移动。
    if (isDisposed || context.editable) {
      return;
    }
    // 宿主不在渲染器画布内（例如设计器里）时找不到画布，直接不做处理。
    const canvasElement = rootElement.closest(".hb-renderer-canvas");
    if (activeLayout?.canvas !== canvasElement) {
      if (activeLayout) {
        releaseLayout(activeLayout, registration);
      }
      activeLayout = null;
      if (!canvasElement) {
        return;
      }
      activeLayout = layoutStateByCanvas.get(canvasElement);
      // 画布上还没有布局状态：创建一份并挂上两个长期监听 —— 捕获阶段的守卫与 DOM 变化观察器。
      if (!activeLayout) {
        const canvasView = canvasElement.ownerDocument.defaultView;
        activeLayout = {
          canvas: canvasElement,
          view: canvasView,
          clients: new Set(),
          owners: new Set(),
          members: new Map(),
          targets: new Set(),
          frame: null,
          amount: 0,
          to: 0,
          distance: BASE_DISTANCE_PX
        };
        const capturedLayout = activeLayout;
        activeLayout.guard = event => {
          for (const [blockedElement, blockingMemberState] of capturedLayout.members) {
            if (blockingMemberState.hidden && blockedElement.contains(event.target)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              if (event.type === "focusin") {
                event.target.blur();
              }
              return;
            }
          }
        };
        for (const eventType of GUARD_EVENT_TYPES) {
          canvasElement.addEventListener(eventType, activeLayout.guard, true);
        }
        activeLayout.observer = new canvasView.MutationObserver(mutationRecords => {
          if (mutationRecords.some(mutationRecord => mutationRecord.target === canvasElement)) {
            updateLayout(capturedLayout);
          }
          for (const [hiddenElement, hiddenMemberState] of capturedLayout.members) {
            if (hiddenMemberState.hidden) {
              suspendTabStops(hiddenElement, hiddenMemberState);
            }
          }
        });
        // 只观察结构变化：属性与样式变化大多由本模块自己写入，观察它们会形成回环。
        activeLayout.observer.observe(canvasElement, {
          childList: true,
          subtree: true
        });
        layoutStateByCanvas.set(canvasElement, activeLayout);
      }
      activeLayout.clients.add(registration);
    }
    if (activeLayout) {
      // 聚焦的组件加入 owners，让位目标变为 1；解除聚焦则移出，目标归 0。
      if (isActive) {
        activeLayout.owners.add(registration);
      } else {
        activeLayout.owners.delete(registration);
      }
      updateLayout(activeLayout);
      animateAmount(activeLayout, activeLayout.owners.size ? 1 : 0);
    }
  };
  return {
    // 组件属性 / 尺寸变化后调用，重新计算让位距离并落到当前动画量。
    refresh: refreshLayout,
    /**
     * 切换本组件的聚焦状态。
     */
    setActive(shouldActivate) {
      if (!isDisposed && !context.editable) {
        // 严格比较 true：外部可能传入 undefined / 事件对象，只有明确的 true 才算聚焦。
        isActive = shouldActivate === true;
        refreshLayout();
      }
    },
    /**
     * 释放控制器：撤销注册，最后一个使用者离开时还会还原所有被移动过的组件。
     */
    dispose() {
      if (!isDisposed) {
        isDisposed = true;
        if (activeLayout) {
          releaseLayout(activeLayout, registration);
        }
        activeLayout = null;
      }
    }
  };
}
