import { carState } from "./car-state";
import { CARD_TEXT_SIZE_PX } from "@app/bridge/card-text-size";
export function updateCarCard(containerElement: any, carConfig: any, carOptions: any) {
  let cardElement = containerElement.querySelector(".i3d-car-card");
  if (!cardElement) {
    ((cardElement = document.createElement("span")),
      (cardElement.className = "i3d-car-card i3d-temperature-humidity-card"));
    for (const [tagName, partName] of [
      ["strong", "name"],
      ["span", "reading"],
      ["span", "track"],
      ["span", "status"],
    ]) {
      const partElement = document.createElement(tagName);
      ((partElement.className = "i3d-car-" + partName), cardElement.append(partElement));
    }
    (cardElement.querySelector(".i3d-car-track").append(document.createElement("i")),
      containerElement.replaceChildren(cardElement));
  }
  const state = carState(carConfig, carOptions),
    cardWidth = Math.min(600, Math.max(100, carConfig.cardWidth ?? 180)),
    cardTextSize = carConfig.cardFontSize ?? CARD_TEXT_SIZE_PX;
  return (
    (cardElement.querySelector(".i3d-car-name").textContent =
      carConfig.label || carConfig.deviceName || "汽车"),
    (cardElement.querySelector(".i3d-car-reading").textContent = state.batteryText),
    (cardElement.querySelector(".i3d-car-status").textContent = state.status),
    (cardElement.querySelector(".i3d-car-track i").style.width = (state.battery ?? 0) + "%"),
    (cardElement.querySelector(".i3d-car-track").hidden = !state.batteryAvailable),
    cardElement.classList.toggle("is-charging", state.charging === true),
    cardElement.style.setProperty(
      "--meter-background-opacity",
      String(Math.min(1, Math.max(0, carConfig.cardOpacity ?? 1))),
    ),
    (cardElement.style.width = cardWidth + "px"),


    (cardElement.style.fontSize = Math.min(32, Math.max(9, cardTextSize ?? CARD_TEXT_SIZE_PX)) + "px"),
    (containerElement.style.width = cardWidth + "px"),
    (containerElement.style.height = cardElement.offsetHeight + "px"),
    (containerElement.title =
      (carConfig.label || "汽车") + " · 电量 " + state.batteryText + " · " + state.status),
    containerElement.setAttribute("aria-label", containerElement.title),
    state
  );
}
