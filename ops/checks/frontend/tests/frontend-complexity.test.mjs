import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const script = join(root, "ops/checks/check_frontend_complexity.mjs");

function run(args) {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("frontend complexity ratchet：高于基线失败，持平通过", () => {
  const work = mkdtempSync(join(tmpdir(), "homeos-frontend-complexity-"));
  mkdirSync(join(work, "homeos/frontend/src"), { recursive: true });
  mkdirSync(join(work, "ops/checks"), { recursive: true });
  const file = join(work, "homeos/frontend/src/probe.ts");
  const base = "export function probe(a: number) {\n  if (a > 0) return 1;\n  return 0;\n}\n";
  writeFileSync(file, base);
  run(["--root", work, "--update"]);
  assert.match(run(["--root", work, "--check"]), /棘轮通过/);

  const complex = "export function probe(a: number) {\n" +
    Array.from({ length: 12 }, (_, i) => `  if (a > ${i}) return ${i};`).join("\n") +
    "\n  return 0;\n}\n";
  writeFileSync(file, complex);
  assert.throws(() => run(["--root", work, "--check"]), /Command failed/);
});
