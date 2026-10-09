#!/usr/bin/env node
/**
 * Studio dependency direction guard (Phase 0).
 *
 * Rules:
 * - app/shared must not import app/editor or app/renderer
 * - platform must not import editor / renderer / 3d-studio
 * - app/** must not import runtime/** except legacy whitelist (prefer platform/)
 *
 * Exit 1 on violations. Whitelist shrinks over time — do not grow it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.resolve(__dirname, "../src/studio");

/** app → runtime paths still allowed until Phase 1 callers are fully migrated. */
const APP_TO_RUNTIME_WHITELIST = new Set([
  // emptied after Phase 1; kept as schema for future exceptions
]);

const IMPORT_RE =
  /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;

/** @type {{ file: string, rule: string, spec: string }[]} */
const violations = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|vue|js|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function resolveImport(fromFile, spec) {
  if (spec.startsWith("@app/")) {
    return path.join(studioRoot, "app", spec.slice("@app/".length));
  }
  if (spec.startsWith("@runtime/")) {
    return path.join(studioRoot, "runtime", spec.slice("@runtime/".length));
  }
  if (spec.startsWith("@/studio/")) {
    return path.join(studioRoot, spec.slice("@/studio/".length));
  }
  if (spec.startsWith(".") || spec.startsWith("/")) {
    return path.resolve(path.dirname(fromFile), spec);
  }
  return null;
}

function relStudio(absPath) {
  return path.relative(studioRoot, absPath).split(path.sep).join("/");
}

function under(rel, prefix) {
  return rel === prefix || rel.startsWith(prefix + "/");
}

function isPureReexport(text) {
  const body = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trim();
  if (!body) return false;
  return body.split(/\n+/).every((line) => {
    const t = line.trim();
    return !t || /^export\s+\*\s+from\s+['"].+['"]\s*;?$/.test(t);
  });
}

function checkFile(file) {
  const rel = relStudio(file);
  const text = fs.readFileSync(file, "utf8");
  // Compat barrels that only re-export are allowed during migration.
  if (isPureReexport(text)) return;
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(text))) {
    const spec = match[1];
    const resolved = resolveImport(file, spec);
    if (!resolved) continue;
    // strip extension guesses
    let targetRel = relStudio(resolved);
    if (!targetRel || targetRel.startsWith("..")) {
      // try with .ts
      for (const ext of [".ts", ".vue", "/index.ts"]) {
        const candidate = resolved + ext;
        if (fs.existsSync(candidate)) {
          targetRel = relStudio(candidate);
          break;
        }
      }
    }
    if (!targetRel || targetRel.startsWith("..")) continue;

    // Rule: shared ↛ editor|renderer
    if (under(rel, "app/shared")) {
      if (under(targetRel, "app/editor") || under(targetRel, "app/renderer")) {
        violations.push({
          file: rel,
          rule: "shared must not import editor/renderer",
          spec,
        });
      }
    }

    // Rule: platform is a leaf
    if (under(rel, "platform")) {
      if (
        under(targetRel, "app/editor") ||
        under(targetRel, "app/renderer") ||
        under(targetRel, "app/3d-studio") ||
        under(targetRel, "app/display")
      ) {
        violations.push({
          file: rel,
          rule: "platform must not import creator/panel apps",
          spec,
        });
      }
    }

    // Rule: app ↛ runtime (except whitelist + runtime re-export shims we ignore if target is platform via re-export — still flag direct runtime imports)
    if (under(rel, "app") && under(targetRel, "runtime")) {
      const key = `${rel}→${targetRel}`;
      const bare = targetRel.replace(/\.ts$/, "");
      if (
        !APP_TO_RUNTIME_WHITELIST.has(rel) &&
        !APP_TO_RUNTIME_WHITELIST.has(key) &&
        !APP_TO_RUNTIME_WHITELIST.has(bare)
      ) {
        // Allow importing runtime re-export stubs only during migration if they only re-export platform —
        // still report so Phase 1 can clear them. Soft mode: only error when not already on platform path.
        violations.push({
          file: rel,
          rule: "app must not import runtime (use @/studio/platform/*)",
          spec,
        });
      }
    }
  }
}

for (const file of walk(studioRoot)) {
  checkFile(file);
}

if (violations.length) {
  console.error(`studio dependency violations: ${violations.length}\n`);
  for (const v of violations.slice(0, 80)) {
    console.error(`  ${v.file}\n    [${v.rule}] ${v.spec}`);
  }
  if (violations.length > 80) {
    console.error(`  … and ${violations.length - 80} more`);
  }
  process.exit(1);
}

console.log("studio dependency check: ok");
