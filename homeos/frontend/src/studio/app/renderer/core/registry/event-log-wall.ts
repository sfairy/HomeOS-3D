import {
  EventLogWallBuffer,
  buildEventLogFingerprint,
  createEventLogEntry,
  eventLogWallEntityName,
  isEventLogWallDomain,
  resolveEntityStateChangeMessage,
  resolveStateSnapshot,
} from "../../controls/event-log-runtime";
import { clampNumber, applyTextOutline, resolveStatePayload, normalizeCssColor } from "./_shared";
import { componentContentUnitsPx } from "./content-units";

type ComponentControllerHooks = {
  pushEvent?: (...eventArgs: any[]) => any;
};

export function renderEventLogWall(eventLogWallComponent: any, eventLogWallRenderEnvironment: any) {
  const eventLogWallProperties = eventLogWallComponent.properties || {},
    { height: eventLogWallUnitHeight } = componentContentUnitsPx(
      eventLogWallComponent,
      eventLogWallRenderEnvironment,
    ),
    eventLogWallEditable = !!eventLogWallRenderEnvironment.editable,
    eventLogWallMaxEntries = clampNumber(eventLogWallProperties.maxEntries, 1, 200, 20),
    eventLogWallBuffer = new EventLogWallBuffer(eventLogWallMaxEntries),
    eventLogWallFontSizePx =
      clampNumber(eventLogWallProperties.fontSize, 8, 200, 21) * eventLogWallUnitHeight,
    eventLogWallRootElement: HTMLDivElement & ComponentControllerHooks =
      document.createElement("div");
  eventLogWallRootElement.className = "hb-event-log-wall";
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-font-size",
    eventLogWallFontSizePx + "px",
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-title-font-size",
    (eventLogWallFontSizePx * clampNumber(eventLogWallProperties.titleSize, 40, 300, 72)) / 100 +
      "px",
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-title-color",
    normalizeCssColor(eventLogWallProperties.titleColor, "#b8c2c8"),
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-title-align",
    ["left", "center", "right"].includes(String(eventLogWallProperties.titleAlign))
      ? { left: "flex-start", center: "center", right: "flex-end" }[
          String(eventLogWallProperties.titleAlign)
        ]!
      : "flex-start"!,
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-bg-opacity",
    String(clampNumber(eventLogWallProperties.panelBgOpacity, 0, 1, 0.3)),
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-blur",
    clampNumber(eventLogWallProperties.panelBlur, 0, 40, 8) + "px",
  );
  eventLogWallRootElement.style.setProperty(
    "--hb-event-log-wall-radius",
    clampNumber(eventLogWallProperties.cornerRadius, 0, 50, 12) + "px",
  );
  for (const [eventLogWallColorKey, eventLogWallColorFallback] of [
    ["on", "#fb923c"],
    ["off", "#93c5fd"],
    ["attr", "#7dd3fc"],
    ["climate", "#67e8f9"],
    ["alert", "#f87171"],
    ["muted", "#9ca3af"],
  ] as const)
    eventLogWallRootElement.style.setProperty(
      "--hb-event-log-wall-" + eventLogWallColorKey + "-color",
      normalizeCssColor(
        eventLogWallProperties["state" + eventLogWallColorKey[0].toUpperCase() + eventLogWallColorKey.slice(1) + "Color"],
        eventLogWallColorFallback,
      ),
    );

  const eventLogWallPanelElement = document.createElement("div");
  eventLogWallPanelElement.className = "hb-event-log-wall__panel";

  const isEventLogWallTitleVisible = eventLogWallProperties.titleVisible === true;
  if (isEventLogWallTitleVisible) {
    const eventLogWallTitleElement = document.createElement("div");
    eventLogWallTitleElement.className = "hb-event-log-wall__title";
    const eventLogWallTitleTextElement = document.createElement("strong");
    eventLogWallTitleTextElement.textContent = String(
      eventLogWallProperties.title || eventLogWallProperties.instanceName || "即时消息墙",
    );
    eventLogWallTitleElement.append(eventLogWallTitleTextElement);
    eventLogWallPanelElement.append(eventLogWallTitleElement);
  }

  const eventLogWallScrollElement = document.createElement("div");
  eventLogWallScrollElement.className = "hb-event-log-wall__scroll";
  const eventLogWallListElement = document.createElement("div");
  eventLogWallListElement.className = "hb-event-log-wall__list";
  eventLogWallScrollElement.append(eventLogWallListElement);
  eventLogWallPanelElement.append(eventLogWallScrollElement);
  eventLogWallRootElement.append(eventLogWallPanelElement);

  if (eventLogWallProperties.showFooter === true) {
    const eventLogWallFooterElement = document.createElement("div");
    eventLogWallFooterElement.className = "hb-event-log-wall__footer";
    eventLogWallFooterElement.textContent = String(eventLogWallProperties.footerText || "");
    eventLogWallPanelElement.append(eventLogWallFooterElement);
  }

  let eventLogWallHideTimer: ReturnType<typeof setTimeout> | null = null;
  const clearEventLogWallHideTimer = () => {
    if (eventLogWallHideTimer != null) {
      clearTimeout(eventLogWallHideTimer);
      eventLogWallHideTimer = null;
    }
  };
  const showEventLogWall = () => {
    eventLogWallRootElement.classList.add("is-visible");
    clearEventLogWallHideTimer();
    const eventLogWallDurationValue = Number(eventLogWallProperties.displayDuration);
    const eventLogWallDurationSeconds =
      Number.isFinite(eventLogWallDurationValue) && eventLogWallDurationValue > 0
        ? eventLogWallDurationValue
        : 4;
    eventLogWallHideTimer = setTimeout(() => {
      eventLogWallRootElement.classList.remove("is-visible");
      eventLogWallHideTimer = null;
    }, eventLogWallDurationSeconds * 1000);
  };

  const createEventLogWallEntryElement = (eventLogWallEntry: any) => {
    const eventLogWallEntryElement = document.createElement("button");
    eventLogWallEntryElement.type = "button";
    eventLogWallEntryElement.className = "hb-event-log-wall__entry is-entering";
    const eventLogWallStateElement = document.createElement("span");
    eventLogWallStateElement.className =
      "hb-event-log-wall__state hb-event-log-wall__state--" + eventLogWallEntry.colorToken;
    eventLogWallStateElement.textContent = "[" + eventLogWallEntry.state + "]";
    const eventLogWallTimeElement = document.createElement("span");
    eventLogWallTimeElement.className = "hb-event-log-wall__time";
    eventLogWallTimeElement.textContent = eventLogWallEntry.timestamp;
    const eventLogWallNameElement = document.createElement("span");
    eventLogWallNameElement.className = "hb-event-log-wall__name";
    eventLogWallNameElement.textContent = eventLogWallEntry.name;
    eventLogWallEntryElement.append(
      eventLogWallStateElement,
      eventLogWallTimeElement,
      eventLogWallNameElement,
    );
    if (
      eventLogWallProperties.entryClickMode !== "none" &&
      typeof eventLogWallRenderEnvironment.openEntityDetails === "function"
    ) {
      eventLogWallEntryElement.classList.add("is-clickable");
      eventLogWallEntryElement.addEventListener("click", () =>
        eventLogWallRenderEnvironment.openEntityDetails(eventLogWallEntry.entityId),
      );
    }
    return eventLogWallEntryElement;
  };

  const revealEventLogWallEntries = () => {
    for (const eventLogWallEnteringRow of eventLogWallListElement.querySelectorAll(
      ".hb-event-log-wall__entry.is-entering",
    ))
      eventLogWallEnteringRow.classList.remove("is-entering");
  };

  eventLogWallRootElement.pushEvent = (
    eventLogWallPushedEntityId,
    eventLogWallPreviousStateEntry,
    eventLogWallNextStateEntry,
  ) => {
    if (eventLogWallProperties.enabled === false) return;
    const eventLogWallResolvedEntityId = String(eventLogWallPushedEntityId || "");
    if (!eventLogWallResolvedEntityId || !isEventLogWallDomain(eventLogWallResolvedEntityId)) return;
    const eventLogWallPreviousSnapshot = resolveStateSnapshot(eventLogWallPreviousStateEntry),
      eventLogWallNextSnapshot = resolveStateSnapshot(eventLogWallNextStateEntry),
      eventLogWallResolvedChange = resolveEntityStateChangeMessage(
        eventLogWallResolvedEntityId,
        eventLogWallPreviousSnapshot,
        eventLogWallNextSnapshot,
      );
    if (!eventLogWallResolvedChange) return;
    const eventLogWallFingerprint = buildEventLogFingerprint(
        eventLogWallResolvedEntityId,
        eventLogWallPreviousSnapshot,
        eventLogWallNextSnapshot,
        eventLogWallResolvedChange,
      ),
      eventLogWallDisplayKey =
        eventLogWallResolvedEntityId + "|" + eventLogWallResolvedChange.label,
      eventLogWallDisplayName = eventLogWallEntityName(
        eventLogWallResolvedEntityId,
        eventLogWallNextSnapshot,
        eventLogWallRenderEnvironment.entityMetadata?.get?.(eventLogWallResolvedEntityId),
      ),
      eventLogWallEntry = createEventLogEntry(
        eventLogWallResolvedEntityId,
        eventLogWallResolvedChange,
        eventLogWallDisplayName,
      );
    if (!eventLogWallBuffer.push(eventLogWallEntry, eventLogWallFingerprint, eventLogWallDisplayKey))
      return;
    eventLogWallListElement.prepend(createEventLogWallEntryElement(eventLogWallEntry));
    while (eventLogWallListElement.children.length > eventLogWallMaxEntries)
      eventLogWallListElement.lastElementChild?.remove();
    eventLogWallScrollElement.scrollTop = 0;
    requestAnimationFrame(revealEventLogWallEntries);
    showEventLogWall();
  };

  if (eventLogWallEditable) eventLogWallRootElement.classList.add("is-visible", "is-editing");
  eventLogWallRenderEnvironment.cleanup?.(clearEventLogWallHideTimer);
  return eventLogWallRootElement;
}
