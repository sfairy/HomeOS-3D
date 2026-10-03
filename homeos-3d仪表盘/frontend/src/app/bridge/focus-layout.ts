const layoutStateByCanvas = new WeakMap(),
  ANIMATION_MS_PER_UNIT = 580,
  BASE_DISTANCE_PX = 24,
  EXCLUDED_CONTENT_SELECTOR = ".hb-interaction3d-host, iframe, video, audio, object, embed",
  TRACKED_STYLE_PROPS = ["translate", "opacity", "transition", "willChange", "pointerEvents"];
function getSharedComponentIds(layoutClient) {
  return (
    (
      layoutClient.context.document?.pages?.find(
        (resolvedPage) => resolvedPage.id === layoutClient.context.page?.id,
      ) || layoutClient.context.page
    )?.sharedComponentIds || []
  );
}
function easeProgress(progress) {
  let curveParam = progress;
  for (let iterationIndex = 0; iterationIndex < 8; iterationIndex++)
    curveParam = Math.max(
      0,
      Math.min(
        1,
        curveParam -
          (0.6 * curveParam -
            0.6 * curveParam * curveParam +
            curveParam * curveParam * curveParam -
            progress) /
            (0.6 - 1.2 * curveParam + 3 * curveParam * curveParam),
      ),
    );
  return curveParam * curveParam * (3 - 2 * curveParam);
}
function parseTranslateValue(translateValue) {
  return !translateValue || translateValue === "none"
    ? ["0px", "0px"]
    : translateValue.match(/(?:calc\([^)]*\)|[^\s])+/g) || ["0px", "0px"];
}
const FOCUSABLE_SELECTOR =
    "a[href], area[href], button, input, select, textarea, [tabindex], [contenteditable], summary",
  GUARD_EVENT_TYPES = ["pointerdown", "click", "dblclick", "contextmenu", "keydown", "focusin"];
function suspendTabStops(subtreeRootElement, memberState) {
  const tabbableElements = [
    subtreeRootElement,
    ...subtreeRootElement.querySelectorAll(FOCUSABLE_SELECTOR),
  ];
  for (const tabbableElement of tabbableElements)
    tabbableElement.tabIndex >= 0 &&
      !memberState.tabStops.has(tabbableElement) &&
      (memberState.tabStops.set(tabbableElement, tabbableElement.getAttribute("tabindex")),
      tabbableElement.setAttribute("tabindex", "-1"));
}
function applyHiddenState(memberElement, memberRecordElement, isHidden) {
  if (memberRecordElement.hidden === isHidden) return;
  if (((memberRecordElement.hidden = isHidden), isHidden))
    (suspendTabStops(memberElement, memberRecordElement),
      memberElement.contains(memberElement.ownerDocument.activeElement) &&
        memberElement.ownerDocument.activeElement.blur(),
      (memberElement.style.pointerEvents = "none"));
  else {
    for (const [tabStopElement, previousTabIndex] of memberRecordElement.tabStops)
      previousTabIndex === null
        ? tabStopElement.removeAttribute("tabindex")
        : tabStopElement.setAttribute("tabindex", previousTabIndex);
    (memberRecordElement.tabStops.clear(),
      (memberElement.style.pointerEvents = memberRecordElement.style.pointerEvents));
  }
  const ariaHiddenValue = isHidden ? "true" : memberRecordElement.ariaHidden;
  memberElement.getAttribute("aria-hidden") !== ariaHiddenValue &&
    (ariaHiddenValue === null
      ? memberElement.removeAttribute("aria-hidden")
      : memberElement.setAttribute("aria-hidden", ariaHiddenValue));
}
function applyMemberMotion(layoutState, motionElement, memberSnapshot, amount) {
  const [translateX, translateY = "0px", translateZ] = memberSnapshot.translate;
  ((motionElement.style.translate =
    "calc(" +
    translateX +
    " - " +
    layoutState.distance * amount +
    "px) " +
    translateY +
    (translateZ ? " " + translateZ : "")),
    (motionElement.style.opacity = String(memberSnapshot.opacity * (1 - amount))),
    applyHiddenState(
      motionElement,
      memberSnapshot,
      amount > 0 || (layoutState.owners.size > 0 && layoutState.targets.has(motionElement)),
    ));
}
function detachMember(layout, detachedElement, detachedMemberState) {
  for (const styleProperty of TRACKED_STYLE_PROPS)
    detachedElement.style[styleProperty] = detachedMemberState.style[styleProperty];
  (applyHiddenState(detachedElement, detachedMemberState, false),
    layout.members.delete(detachedElement),
    layout.targets.delete(detachedElement));
}
function cancelMotionFrame(frameOwner) {
  (frameOwner.frame !== null && frameOwner.view.cancelAnimationFrame(frameOwner.frame),
    (frameOwner.frame = null));
}
function renderMembers(renderingLayout) {
  for (const renderedElement of renderingLayout.targets) {
    const renderedMemberState = renderingLayout.members.get(renderedElement);
    renderedMemberState &&
      applyMemberMotion(
        renderingLayout,
        renderedElement,
        renderedMemberState,
        renderingLayout.amount,
      );
  }
}
function animateAmount(animatingLayout, targetAmount, shouldAnimate = true) {
  if (
    animatingLayout.to === targetAmount &&
    ((shouldAnimate && animatingLayout.frame !== null) || animatingLayout.amount === targetAmount)
  ) {
    renderMembers(animatingLayout);
    return;
  }
  cancelMotionFrame(animatingLayout);
  const fromAmount = animatingLayout.amount;
  if (
    ((animatingLayout.to = targetAmount),
    !shouldAnimate || animatingLayout.view.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  ) {
    ((animatingLayout.amount = targetAmount), renderMembers(animatingLayout));
    return;
  }
  const startTimeMs = animatingLayout.view.performance.now(),
    durationMs = ANIMATION_MS_PER_UNIT * Math.abs(targetAmount - fromAmount),
    advanceMotion = (timestampMs) => {
      animatingLayout.frame = null;
      const elapsedFraction = durationMs
        ? Math.max(0, Math.min(1, (timestampMs - startTimeMs) / durationMs))
        : 1;
      ((animatingLayout.amount =
        fromAmount + (targetAmount - fromAmount) * easeProgress(elapsedFraction)),
        renderMembers(animatingLayout),
        elapsedFraction < 1 &&
          (animatingLayout.frame = animatingLayout.view.requestAnimationFrame(advanceMotion)));
    };
  animatingLayout.frame = animatingLayout.view.requestAnimationFrame(advanceMotion);
}
function updateLayout(canvasLayout) {
  const clientRegistrations = [...canvasLayout.clients],
    clientComponentIdSet = new Set(clientRegistrations.flatMap(getSharedComponentIds)),
    ownerComponentIdSet = new Set([...canvasLayout.owners].flatMap(getSharedComponentIds)),
    componentElements = [...canvasLayout.canvas.children].filter((canvasChildElement) => {
      const componentId =
        canvasChildElement.dataset?.componentId ||
        canvasChildElement.dataset?.effectFor ||
        canvasChildElement.dataset?.airflowFor;
      return (
        clientComponentIdSet.has(componentId) &&
        !clientRegistrations.some((clientEntry) => canvasChildElement.contains(clientEntry.root)) &&
        !canvasChildElement.matches?.(EXCLUDED_CONTENT_SELECTOR) &&
        !canvasChildElement.querySelector?.(EXCLUDED_CONTENT_SELECTOR)
      );
    }),
    componentElementSet = new Set(componentElements);
  for (const [trackedElement, trackedMemberState] of canvasLayout.members)
    componentElementSet.has(trackedElement) ||
      detachMember(canvasLayout, trackedElement, trackedMemberState);
  const canvasRect = canvasLayout.canvas.getBoundingClientRect(),
    canvasScale = canvasRect.width / canvasLayout.canvas.clientWidth || 1;
  let distancePx = BASE_DISTANCE_PX;
  for (const childElement of componentElements) {
    let childMemberState = canvasLayout.members.get(childElement);
    const childRect = childElement.getBoundingClientRect();
    if (
      ((distancePx = Math.max(
        distancePx,
        (childRect.right - canvasRect.left) / canvasScale +
          BASE_DISTANCE_PX +
          (childMemberState && canvasLayout.targets.has(childElement)
            ? canvasLayout.distance * canvasLayout.amount
            : 0),
      )),
      !childMemberState)
    ) {
      const computedStyle = canvasLayout.view.getComputedStyle(childElement);
      ((childMemberState = {
        style: Object.fromEntries(
          TRACKED_STYLE_PROPS.map((trackedProperty) => [
            trackedProperty,
            childElement.style[trackedProperty] || "",
          ]),
        ),
        opacity: Number(computedStyle.opacity),
        translate: parseTranslateValue(computedStyle.translate),
        hidden: false,
        tabStops: new Map(),
        ariaHidden: childElement.getAttribute("aria-hidden"),
      }),
        canvasLayout.members.set(childElement, childMemberState),
        (childElement.style.transition = "none"),
        (childElement.style.willChange = [childMemberState.style.willChange, "opacity", "translate"]
          .filter((styleValue) => styleValue && styleValue !== "auto")
          .join(",")),
        applyMemberMotion(canvasLayout, childElement, childMemberState, 0));
    }
  }
  if (((canvasLayout.distance = distancePx), canvasLayout.owners.size)) {
    const newTargetSet = new Set(
      componentElements.filter((ownerComponentElement) =>
        ownerComponentIdSet.has(
          ownerComponentElement.dataset.componentId ||
            ownerComponentElement.dataset.effectFor ||
            ownerComponentElement.dataset.airflowFor,
        ),
      ),
    );
    for (const staleTarget of canvasLayout.targets)
      !newTargetSet.has(staleTarget) &&
        canvasLayout.members.has(staleTarget) &&
        (canvasLayout.targets.delete(staleTarget),
        applyMemberMotion(canvasLayout, staleTarget, canvasLayout.members.get(staleTarget), 0));
    canvasLayout.targets = newTargetSet;
  }
  renderMembers(canvasLayout);
}
function releaseLayout(releasedLayout, clientRegistration) {
  if (
    (releasedLayout.owners.delete(clientRegistration),
    releasedLayout.clients.delete(clientRegistration),
    releasedLayout.clients.size)
  )
    (updateLayout(releasedLayout),
      animateAmount(releasedLayout, releasedLayout.owners.size ? 1 : 0, false));
  else {
    (cancelMotionFrame(releasedLayout), releasedLayout.observer.disconnect());
    for (const eventName of GUARD_EVENT_TYPES)
      releasedLayout.canvas.removeEventListener(eventName, releasedLayout.guard, true);
    for (const [releasedElement, releasedMemberState] of releasedLayout.members)
      detachMember(releasedLayout, releasedElement, releasedMemberState);
    layoutStateByCanvas.get(releasedLayout.canvas) === releasedLayout &&
      layoutStateByCanvas.delete(releasedLayout.canvas);
  }
}
export function createInteraction3dFocusLayout(
  rootElement,
  focusOptions: { editable?: boolean } = {},
) {
  const registration = {
    root: rootElement,
    context: focusOptions,
  };
  let activeLayout = null,
    isActive = false,
    isDisposed = false;
  const refreshLayout = () => {
    if (isDisposed || focusOptions.editable) return;
    const canvasElement = rootElement.closest(".hb-renderer-canvas");
    if (activeLayout?.canvas !== canvasElement) {
      if (
        (activeLayout && releaseLayout(activeLayout, registration),
        (activeLayout = null),
        !canvasElement)
      )
        return;
      if (((activeLayout = layoutStateByCanvas.get(canvasElement)), !activeLayout)) {
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
          distance: BASE_DISTANCE_PX,
        };
        const capturedLayout = activeLayout;
        activeLayout.guard = (event) => {
          for (const [blockedElement, blockingMemberStateElement] of capturedLayout.members)
            if (blockingMemberStateElement.hidden && blockedElement.contains(event.target)) {
              (event.preventDefault(),
                event.stopImmediatePropagation(),
                event.type === "focusin" && event.target.blur());
              return;
            }
        };
        for (const eventType of GUARD_EVENT_TYPES)
          canvasElement.addEventListener(eventType, activeLayout.guard, true);
        ((activeLayout.observer = new canvasView.MutationObserver((mutationRecords) => {
          mutationRecords.some((mutationRecord) => mutationRecord.target === canvasElement) &&
            updateLayout(capturedLayout);
          for (const [hiddenElement, hiddenMemberStateElement] of capturedLayout.members)
            hiddenMemberStateElement.hidden &&
              suspendTabStops(hiddenElement, hiddenMemberStateElement);
        })),
          activeLayout.observer.observe(canvasElement, {
            childList: true,
            subtree: true,
          }),
          layoutStateByCanvas.set(canvasElement, activeLayout));
      }
      activeLayout.clients.add(registration);
    }
    activeLayout &&
      (isActive ? activeLayout.owners.add(registration) : activeLayout.owners.delete(registration),
      updateLayout(activeLayout),
      animateAmount(activeLayout, activeLayout.owners.size ? 1 : 0));
  };
  return {
    refresh: refreshLayout,
    setActive(shouldActivate) {
      isDisposed ||
        focusOptions.editable ||
        ((isActive = shouldActivate === true), refreshLayout());
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        activeLayout && releaseLayout(activeLayout, registration),
        (activeLayout = null));
    },
  };
}
