import { lampItemTypeSet } from "../../items/item-catalog";
import type { StudioAppContext } from "../studio-app-context";

export function classifyLightingScope(appCtx: StudioAppContext, lightSelectionList: any) {
  if (!lightSelectionList.length) return null;
  if (
    lightSelectionList.every((archElementCheck: any) =>
      ["wall", "door", "window", "railing"].includes(archElementCheck.kind),
    )
  )
    return "architecture";
  if (lightSelectionList.some((nonItemCheck: any) => nonItemCheck.kind !== "item")) return "all";
  const lightSelectionIdSet = new Set(
      lightSelectionList.map((lightSelectionIdEntry: any) => lightSelectionIdEntry.id),
    ),
    lightSelectedItems = appCtx.studioState.items.filter((lightSelectedRef) =>
      lightSelectionIdSet.has(lightSelectedRef.id),
    );
  if (!lightSelectedItems.length) return null;
  const lightFixtureItems = lightSelectedItems.filter(
    (lightFixtureRef) =>
      !lampItemTypeSet.has(lightFixtureRef.type) || lightFixtureRef.type === "striplight",
  );
  if (!lightFixtureItems.length) return null;
  const lampFixtureCount = lightFixtureItems.filter((lampFixtureRef) =>
    lampItemTypeSet.has(lampFixtureRef.type),
  ).length;
  return lampFixtureCount === lightFixtureItems.length
    ? "lights"
    : lampFixtureCount === 0
      ? "items"
      : "all";
}
