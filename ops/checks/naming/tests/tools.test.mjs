import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFile, templateOccurrences } from "../lib.mjs";

const RENAME = fileURLToPath(new URL("../rename.mjs", import.meta.url));

function fixture(source, ext = ".ts") {
  const dir = mkdtempSync(path.join(tmpdir(), "naming-test-"));
  const file = path.join(dir, "fixture" + ext);
  writeFileSync(file, source, "utf8");
  return { dir, file };
}

function scan(file) {
  return scanFile(file).items;
}

function rename(file, item, extra = {}) {
  const dir = path.dirname(file);
  const input = path.join(dir, "renames.json");
  writeFileSync(
    input,
    JSON.stringify([
      {
        file,
        line: item.line,
        offset: item.offset,
        name: item.name,
        newName: item.newName,
        kind: item.kind,
        scriptSetupTopLevel: item.scriptSetupTopLevel,
        templateVisible: item.templateVisible,
        ...extra,
      },
    ]),
    "utf8",
  );
  const output = execFileSync(
    process.execPath,
    [RENAME, input, "--allow-outside", "--write", "--json"],
    { encoding: "utf8" },
  );
  return JSON.parse(output);
}

test("shorthand binding keeps the property key", () => {
  const { dir, file } = fixture("const source = { e: 1 };\nconst { e } = source;\nconsole.log(e);\n");
  try {
    const target = scan(file).find((i) => i.kind === "binding" && i.name === "e");
    assert.ok(target, "binding e should be scanned");
    const result = rename(file, { ...target, newName: "entry" });
    assert.equal(result.applied, 1);
    const text = readFileSync(file, "utf8");
    assert.match(text, /const \{ e: entry \} = source;/);
    assert.match(text, /console\.log\(entry\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dom event parameter uses the event hint", () => {
  const { dir, file } = fixture("function handler(e: MouseEvent) { return e.target; }\n");
  try {
    const target = scan(file).find((i) => i.kind === "param" && i.name === "e");
    assert.ok(target, "param e should be scanned");
    const result = rename(file, { ...target, newName: "event" });
    assert.equal(result.applied, 1);
    const text = readFileSync(file, "utf8");
    assert.match(text, /function handler\(event: MouseEvent\)/);
    assert.match(text, /return event\.target/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exported symbols are refused by default", () => {
  const { dir, file } = fixture("export const e = 1;\n");
  try {
    const target = scan(file).find((i) => i.name === "e");
    assert.ok(target, "exported e should be scanned");
    const result = rename(file, { ...target, newName: "count" });
    assert.equal(result.applied, 0);
    assert.equal(result.failed[0].reason, "exported symbol refused");
    assert.match(readFileSync(file, "utf8"), /export const e = 1;/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a new name already declared in the file is refused", () => {
  const { dir, file } = fixture("function f(source: number) { const v = source; return v; }\n");
  try {
    const target = scan(file).find((i) => i.name === "v");
    assert.ok(target, "v should be scanned");
    const result = rename(file, { ...target, newName: "source" });
    assert.equal(result.applied, 0);
    assert.equal(result.failed[0].reason, "new name conflicts in scope");
    assert.match(readFileSync(file, "utf8"), /const v = source/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a sibling scope declaration does not block a rename", () => {
  const { dir, file } = fixture("function first() { const client = 1; return client; }\nfunction second(c: number) { return c; }\n");
  try {
    const target = scan(file).find((i) => i.kind === "param" && i.name === "c");
    assert.ok(target, "param c should be scanned");
    const result = rename(file, { ...target, newName: "client" });
    assert.equal(result.applied, 1);
    const text = readFileSync(file, "utf8");
    assert.match(text, /function second\(client: number\)/);
    assert.match(text, /return client/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("vue script setup rename updates template occurrences", () => {
  const source = '<template>\n  <button @click="e">{{ e }}</button>\n</template>\n<script setup lang="ts">\nconst e = 1;\nfunction ping() { return e; }\n</script>\n';
  const { dir, file } = fixture(source, ".vue");
  try {
    const target = scan(file).find((i) => i.kind === "var" && i.name === "e");
    assert.ok(target, "e should be scanned");
    assert.equal(target.scriptSetupTopLevel, true);
    assert.equal(target.templateVisible, true);
    const result = rename(file, { ...target, newName: "count" }, { allowTemplate: true });
    assert.equal(result.applied, 1);
    const text = readFileSync(file, "utf8");
    assert.match(text, /@click="count"/);
    assert.match(text, /\{\{ count \}\}/);
    assert.match(text, /const count = 1;/);
    assert.match(text, /return count;/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("line-only targets resolve the declaration on that line", () => {
  const source =
    "function first() {\n  function n(a: number) { return a; }\n  return n(1);\n}\nfunction second() {\n  const n = 2;\n  return n;\n}\n";
  const { dir, file } = fixture(source);
  try {
    const input = path.join(dir, "renames.json");
    writeFileSync(
      input,
      JSON.stringify([
        { file, line: 2, name: "n", newName: "parseNumber" },
        { file, line: 6, name: "n", newName: "localCount" },
      ]),
      "utf8",
    );
    const output = execFileSync(
      process.execPath,
      [RENAME, input, "--allow-outside", "--write", "--json"],
      { encoding: "utf8" },
    );
    const result = JSON.parse(output);
    assert.equal(result.applied, 2);
    const text = readFileSync(file, "utf8");
    assert.match(text, /function parseNumber\(a: number\)/);
    assert.match(text, /return parseNumber\(1\)/);
    assert.match(text, /const localCount = 2/);
    assert.match(text, /return localCount/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("templateOccurrences ignores substrings", () => {
  const hits = templateOccurrences('<div :class="e">{{ e }}</div><span>{{ event }}</span>', "e");
  assert.equal(hits.length, 2);
});
