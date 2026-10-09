/**
 * One-shot helper: extract mountStage handler clusters into stage/stage-handlers.ts
 * with host.* wiring for mount-scoped symbols only (whitelist + blocklist).
 */
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const stagePath = path.join(root, "src/studio/runtime/core/stage.ts");
const outPath = path.join(root, "src/studio/runtime/core/stage/stage-handlers.ts");

const BLOCKLIST = new Set([
  "color",
  "value",
  "data",
  "type",
  "action",
  "name",
  "state",
  "kind",
  "open",
  "error",
  "patch",
  "visible",
  "held",
  "box",
  "key",
  "node",
  "root",
  "size",
  "label",
  "icon",
  "floor",
  "modes",
  "entity",
  "controls",
  "u",
  "id",
  "true",
  "false",
  "null",
  "undefined",
  "default",
  "from",
  "to",
  "some",
  "all",
  "any",
  "as",
  "in",
  "on",
  "off",
  "top",
  "free",
  "edit",
  "save",
  "flush",
  "held",
  "next",
  "prev",
  "left",
  "right",
  "width",
  "height",
  "hidden",
  "target",
  "source",
  "channel",
  "command",
  "requestId",
  "entityId",
  "deviceKind",
  "configId",
  "revision",
  "message",
  "active",
  "immediate",
  "preserveCamera",
  "owner",
  "position",
  "zoom",
  "mode",
  "view",
  "string",
  "number",
  "object",
  "includes",
  "filter",
]);

const lines = fs.readFileSync(stagePath, "utf8").split("\n");
const mountStart = lines.findIndex((l) => l.includes("export function mountStage"));

function extractFn(startPat) {
  const start = lines.findIndex((l) => l.match(startPat));
  if (start < 0) throw new Error("not found " + startPat);
  let depth = 0;
  let started = false;
  let end = start;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        depth++;
        started = true;
      }
      if (ch === "}") depth--;
    }
    if (started && depth === 0) {
      end = i;
      break;
    }
  }
  return { start, end, code: lines.slice(start, end + 1) };
}

const extractSpecs = [
  ["updateDevicePanel", /^  function updateDevicePanel/],
  ["renderMarkerPositions", /^  function renderMarkerPositions/],
  ["pickMarkerAtPoint", /^  function pickMarkerAtPoint/],
  ["syncMarkers", /^  function syncMarkers/],
  ["handleHostMessage", /^  function handleHostMessage/],
  ["runFrame", /^  function runFrame/],
];

const extracted = extractSpecs.map(([name, pat]) => ({ name, ...extractFn(pat) }));
const extractedNames = new Set(extracted.map((e) => e.name));
const extractedLineSet = new Set();
for (const e of extracted) for (let i = e.start; i <= e.end; i++) extractedLineSet.add(i);

const declNames = new Set(["mountOptions", "three", "element", "canvasElement"]);
const fnRe = /^  (?:async )?function ([a-zA-Z_$][\w$]*)/;
const declStartRe = /^  (?:const|let) /;

for (let i = mountStart; i < lines.length; i++) {
  if (extractedLineSet.has(i)) continue;
  const assignM = lines[i].match(/^    ([a-zA-Z_$][\w$]*)\s*=/);
  if (assignM) declNames.add(assignM[1]);
  const fnm = lines[i].match(fnRe);
  if (fnm) {
    declNames.add(fnm[1]);
    continue;
  }
  if (declStartRe.test(lines[i])) {
    let chunk = lines[i];
    let j = i;
    while (!chunk.includes(";") && j + 1 < lines.length) {
      j++;
      chunk += " " + lines[j].trim();
    }
    for (const m of chunk.matchAll(/\b([a-zA-Z_$][\w$]*)\s*(?=:|=)/g)) {
      const id = m[1];
      if (!["const", "let", "var", "Record", "as", "any"].includes(id)) declNames.add(id);
    }
    i = j;
  }
}
for (const n of extractedNames) declNames.add(n);

const replaceNames = [...declNames]
  .filter((n) => !BLOCKLIST.has(n))
  .sort((a, b) => b.length - a.length);

function localsInFn(codeLines, fnName) {
  const locals = new Set([fnName]);
  for (const line of codeLines) {
    for (const m of line.matchAll(/\b(?:const|let)\s+([a-zA-Z_$][\w$]*)/g)) locals.add(m[1]);
    for (const m of line.matchAll(/\bfunction\s+([a-zA-Z_$][\w$]*)/g)) locals.add(m[1]);
  }
  const sig = codeLines[0];
  const pm = sig.match(/\(([^)]*)\)/);
  if (pm) {
    for (const p of pm[1].split(",")) {
      const id = p.trim().split("=")[0].trim().replace(/^\.\.\./, "");
      if (id) locals.add(id);
    }
  }
  return locals;
}

function replaceOutsideStrings(code, name, replacement) {
  const esc = name.replace(/\$/g, "\\$");
  const part = new RegExp(
    `(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\\\`\\\\])*\`)|(?:(?<=\\.\\.)|(?<![.\\w]))\\b${esc}\\b(?!\\s*:)`,
    "g",
  );
  return code.replace(part, (m) =>
    m.startsWith('"') || m.startsWith("'") || m.startsWith("`") ? m : replacement,
  );
}

function transformFn(codeLines, fnName) {
  const locals = localsInFn(codeLines, fnName);
  let out = codeLines.join("\n");
  for (const name of replaceNames) {
    if (locals.has(name)) continue;
    if (!new RegExp("\\b" + name.replace(/\$/g, "\\$") + "\\b").test(out)) continue;
    out = replaceOutsideStrings(out, name, `host.${name}`);
  }
  return out;
}

const importBlock = `/** mountStage handler clusters — wired via explicit host from stage.ts */
import { bathHeaterState as bathHeaterState2 } from "../../bath-heater/bath-heater";
import { purifierState as purifierState2 } from "../../purifier/purifier-state";
import { carState as carState2 } from "../../vehicle/car-state";
import { speakerState as speakerState2 } from "../../speaker/speaker-state";
import { lockState as lockState2 } from "../../security/lock-state";
import { vacuumQuip as vacuumQuip2, vacuumBirdCamera as vacuumBirdCamera2 } from "../../vacuum/vacuum-motion";
import { vacuumStatusPresentation as vacuumStatusPresentation2 } from "../../vacuum/vacuum-map";
import { televisionState as televisionState2 } from "../../television/television-state";
import { deviceStatus as deviceStatus2 } from "../../device/device-status";
import {
  GENERIC_DEVICE_KINDS as GENERIC_DEVICE_KINDS2,
  genericDeviceProfile as genericDeviceProfile2,
  isGenericDeviceKind as isGenericDeviceKind2,
} from "../../device/generic-device-catalog";
import { nasDeviceState as nasDeviceState2 } from "../../nas/nas-status";
import { coverState as coverState2, coverIconIsOn as coverIconIsOn2 } from "../../cover/cover-state";
import { climateState as climateState2 } from "../../climate/climate-state";
import {
  lightPresetEntries,
  resolveMarkerIconSize,
  configuredModuleKinds,
  createStageElement,
  lampIconSvgMarkup,
  postHostMessage,
} from "./_shared";
import { buildMetadata } from "./build-metadata";
import { buildFloorCameraConfig as buildFloorCameraConfigExternal } from "./floor-camera-config";
import {
  temperatureHumidityReading as readTemperatureHumidity,
  temperatureHumidityEntities,
  DEFAULT_LABEL_SIZE as defaultLabelSize,
  DEFAULT_LABEL_ICON_SIZE as defaultLabelIconSize,
  MAX_LABEL_SIZE as maxLabelSize,
  MAX_LABEL_ICON_SIZE as maxLabelIconSize,
  MIN_LABEL_SIZE as minLabelSize,
  MIN_LABEL_ICON_SIZE as minLabelIconSize,
} from "@app/bridge/temperature-humidity";
import { createMarkerTouch, nearestMarkerTarget } from "../marker-input";
import { buttonIconSize as resolveButtonIconSize } from "@app/bridge/button-icon-size";
import { CARD_TEXT_SIZE_PX as cardTextSizePx } from "@app/bridge/card-text-size";
import { withRegionLightingPreset as applyRegionLightingPreset } from "@app/bridge/region-lighting-presets";
import {
  securityAlarmReadings,
  overlayEligibleAlarms,
  securityAlarmReading,
  renderSecurityAlarmCard,
} from "../../security/security-alarm";
import { updateCarCard as updateCarCard2 } from "../../vehicle/car-card";
import { cameraOnline as cameraOnline2 } from "../../camera/camera-status";
import { backgroundOpacity as labelBackgroundOpacity } from "../label-appearance";
import {
  ENVIRONMENT_METRICS as environmentMetricNames,
  layoutEnvironmentReadings,
} from "@app/bridge/temperature-humidity";
import { DEFAULT_BUTTON_SIZE as defaultButtonSize } from "@app/bridge/button-icon-size";

export interface StageHandlersHost {
  [key: string]: any;
}

`;

let file = importBlock;

for (const e of extracted) {
  const transformed = transformFn(e.code, e.name);
  const factoryName = "create" + e.name[0].toUpperCase() + e.name.slice(1);
  const inner = transformed.replace(/^  function (\w+)/, "  return function $1");
  file += `\nexport function ${factoryName}(host: StageHandlersHost) {\n${inner}\n}\n`;
}

fs.writeFileSync(outPath, file);

let stageLines = [...lines];
for (const e of [...extracted].sort((a, b) => b.start - a.start)) {
  stageLines.splice(e.start, e.end - e.start + 1);
}
const lr = stageLines.findIndex((l) => l.trim() === 'let lastRenderSignature = "";');
if (lr >= 0) stageLines.splice(lr, 1);

fs.writeFileSync(stagePath, stageLines.join("\n"));
console.log("wrote", outPath, "lines", file.split("\n").length);
console.log("stage.ts lines", stageLines.length);
