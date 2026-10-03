import { COURTYARD_VARIANT_BASES } from "./courtyard-models";
export const isCourtyardPlanItem = (candidateItem) =>
    candidateItem?.type?.startsWith("garden-") || candidateItem?.type?.startsWith("courtyard-"),

  courtyardToolAllowed = (tool) =>
    [
      "select",
      "pan",
      "scale",
      "courtyard-area",
      "courtyard-path",
      "courtyard-fence",
      "courtyard-gate",
    ].includes(tool);
export function courtyardPlanColor(planItem, palette) {
  let variantBase = COURTYARD_VARIANT_BASES[planItem.type] || planItem.type;
  (variantBase === "courtyard-area" && (variantBase = "garden-" + planItem.drawing.style),
    variantBase === "courtyard-path" && (variantBase = "garden-stepping"),
    variantBase === "courtyard-fence" &&
      (variantBase =
        planItem.drawing.style === "hedge"
          ? "garden-hedge"
          : ["wall", "brick"].includes(planItem.drawing.style)
            ? "garden-low-wall"
            : "garden-fence"));
  let role = "pillar";
  return (
    [
      "lawn",
      "tree",
      "conifer",
      "shrub",
      "hedge",
      "bamboo",
      "grass-clump",
      "planter",
      "round-planter",
      "large-planter",
      "flowerbed",
      "flowers",
      "raised-bed",
      "vegetable-bed",
      "trellis",
    ].some((plantToken) => variantBase === "garden-" + plantToken)
      ? (role = "plant")
      : ["pond", "fountain", "pool", "rock-water"].some(
            (waterToken) => variantBase === "garden-" + waterToken,
          )
        ? (role = "aquarium")
        : [
              "bench",
              "chair",
              "table",
              "outdoor-coffee-table",
              "deck",
              "fence",
              "gate",
              "arch",
              "pergola",
              "gazebo",
              "carport",
              "storage-shed",
            ].some((furnitureToken) => variantBase === "garden-" + furnitureToken)
          ? (role = "table")
          : ["outdoor-sofa", "lounger", "swing", "hanging-chair", "hammock"].some(
                (softToken) => variantBase === "garden-" + softToken,
              )
            ? (role = "sofa")
            : variantBase === "garden-umbrella"
              ? (role = "bed")
              : ["bollard", "lantern"].some((lightToken) => variantBase === "garden-" + lightToken)
                ? (role = "floorlamp")
                : ["barbecue", "outdoor-sink"].some(
                    (kitchenToken) => variantBase === "garden-" + kitchenToken,
                  ) && (role = "kitchenbase"),
    palette[role].color
  );
}
