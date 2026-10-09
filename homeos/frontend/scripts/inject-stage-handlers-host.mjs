import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const handlersPath = path.join(root, "src/studio/runtime/core/stage/stage-handlers.ts");
const stagePath = path.join(root, "src/studio/runtime/core/stage.ts");

const handlers = fs.readFileSync(handlersPath, "utf8");
const hostRefs = new Set();
for (const m of handlers.matchAll(/host\.([a-zA-Z_][\w$]*)/g)) hostRefs.add(m[1]);
const assigned = new Set();
for (const m of handlers.matchAll(/host\.([a-zA-Z_][\w$]*)\s*=/g)) assigned.add(m[1]);
const handlerFns = new Set([
  "updateDevicePanel",
  "renderMarkerPositions",
  "pickMarkerAtPoint",
  "syncMarkers",
  "handleHostMessage",
  "runFrame",
]);
const props = [...hostRefs].filter((p) => !handlerFns.has(p)).sort();
const lines = [];
for (const p of props) {
  if (assigned.has(p)) {
    lines.push(`    get ${p}() { return ${p}; },`);
    lines.push(`    set ${p}(v: any) { ${p} = v; },`);
  } else {
    lines.push(`    ${p},`);
  }
}
const block = `  let lastRenderSignature = "";
  const stageHandlersHost: StageHandlersHost = {
${lines.join("\n")}
  };
  const updateDevicePanel = createUpdateDevicePanel(stageHandlersHost);
  stageHandlersHost.updateDevicePanel = updateDevicePanel;
  const renderMarkerPositions = createRenderMarkerPositions(stageHandlersHost);
  stageHandlersHost.renderMarkerPositions = renderMarkerPositions;
  const pickMarkerAtPoint = createPickMarkerAtPoint(stageHandlersHost);
  stageHandlersHost.pickMarkerAtPoint = pickMarkerAtPoint;
  const syncMarkers = createSyncMarkers(stageHandlersHost);
  stageHandlersHost.syncMarkers = syncMarkers;
  const handleHostMessage = createHandleHostMessage(stageHandlersHost);
  stageHandlersHost.handleHostMessage = handleHostMessage;
  const runFrame = createRunFrame(stageHandlersHost);
  stageHandlersHost.runFrame = runFrame;
`;

let stageLines = fs.readFileSync(stagePath, "utf8").split("\n");
if (!stageLines.some((l) => l.includes("createUpdateDevicePanel"))) {
  const importLine = `import {
  createHandleHostMessage,
  createPickMarkerAtPoint,
  createRenderMarkerPositions,
  createRunFrame,
  createSyncMarkers,
  createUpdateDevicePanel,
  type StageHandlersHost,
} from "./stage/stage-handlers";`;
  const importIdx = stageLines.findIndex((l) => l.includes('from "./stage/build-metadata"'));
  if (importIdx < 0) throw new Error("import anchor missing");
  stageLines.splice(importIdx + 1, 0, importLine);
}
const insertIdx = stageLines.findIndex(
  (l) => l.trim() === 'window.addEventListener("message", handleHostMessage);',
);
if (insertIdx < 0) throw new Error("insert point missing");
if (!stageLines[insertIdx - 1]?.includes("stageHandlersHost")) {
  stageLines.splice(insertIdx, 0, block);
}
fs.writeFileSync(stagePath, stageLines.join("\n"));
console.log("injected host wiring");
