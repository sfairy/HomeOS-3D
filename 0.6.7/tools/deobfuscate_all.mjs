// deobfuscate_all.mjs -- driver: transform every .js under frontend/ into recovered/frontend/.
//
// usage: node deobfuscate_all.mjs [--filter <substr>] [--limit N] [--jobs N]

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { transform, importFingerprint, exportFingerprint, parseAny } from "./deobfuscate_js.mjs";

const ROOT = "/Users/sfairy/项目/HA-Bridge/源代码/0.6.7";
const SRC = path.join(ROOT, "frontend");
const DST = path.join(ROOT, "recovered", "frontend");
const WORK = path.join(ROOT, "recovered", ".work");

function walk(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(base, abs);
    if (ent.isDirectory()) walk(abs, base, out);
    else if (ent.isFile()) out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const argv = process.argv.slice(2);
  let filter = null, limit = 0, jobs = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--filter") filter = argv[++i];
    else if (argv[i] === "--limit") limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--jobs") jobs = parseInt(argv[++i], 10);
  }

  const all = walk(SRC, SRC, []).sort();
  let jsFiles = all.filter((f) => f.endsWith(".js"));
  if (filter) jsFiles = jsFiles.filter((f) => f.includes(filter));
  if (limit) jsFiles = jsFiles.slice(0, limit);
  const assetFiles = all.filter((f) => !f.endsWith(".js"));

  console.log("JS files: " + jsFiles.length + " | assets: " + assetFiles.length);

  const report = [];
  const decoded = {};
  const t0 = Date.now();
  let done = 0;
  let next = 0;
  const errors = [];

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= jsFiles.length) return;
      const rel = jsFiles[i];
      const srcPath = path.join(SRC, rel);
      const dstPath = path.join(DST, rel);
      const buf = fs.readFileSync(srcPath);
      const code = buf.toString("utf8");
      let r;
      try {
        r = await transform(code, rel);
      } catch (e) {
        r = {
          rel,
          bytesIn: buf.length,
          mode: "exception",
          parseOkBefore: false,
          parseOkAfter: false,
          stringsDecoded: 0,
          uniqueStrings: [],
          decoderCallsInlined: 0,
          dynamicDecoderCalls: 0,
          renamings: 0,
          bindings: 0,
          preambleRemoved: 0,
          preambleKept: [],
          exportsBefore: [],
          exportsAfter: [],
          importsBefore: [],
          importsAfter: [],
          notes: [],
          errors: [String(e && e.stack ? e.stack : e)],
          leftovers: 0,
          code,
        };
        errors.push({ rel, error: String(e && e.message) });
      }
      const outCode = r.code !== undefined ? r.code : code;
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.writeFileSync(dstPath, outCode);
      r.bytesOut = Buffer.byteLength(outCode);
      r.sourcePath = "frontend/" + rel;
      r.outputPath = "recovered/frontend/" + rel;
      r.contentChanged = outCode !== code;
      r.sha256In = sha256(buf);
      r.sha256Out = sha256(Buffer.from(outCode, "utf8"));
      r.exportsBeforeFp = exportFingerprint(r.exportsBefore);
      r.exportsAfterFp = exportFingerprint(r.exportsAfter);
      r.importsBeforeFp = importFingerprint(r.importsBefore);
      r.importsAfterFp = importFingerprint(r.importsAfter);
      r.exportsMatch = r.exportsBeforeFp === r.exportsAfterFp;
      r.importsMatch = r.importsBeforeFp === r.importsAfterFp;
      if (r.uniqueStrings && r.uniqueStrings.length) decoded[rel] = r.uniqueStrings;
      const entry = Object.assign({}, r);
      delete entry.code;
      entry.uniqueStrings = (r.uniqueStrings || []).length;
      report.push(entry);
      done++;
      if (done % 10 === 0 || done === jsFiles.length) {
        console.log("  [" + done + "/" + jsFiles.length + "] " + ((Date.now() - t0) / 1000).toFixed(1) + "s  " + rel);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, jobs) }, () => worker()));

  report.sort((a, b) => a.rel.localeCompare(b.rel));
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, "frontend_report.json"), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(WORK, "frontend_decoded.json"), JSON.stringify(decoded, null, 1));

  const totals = {
    jsFiles: report.length,
    elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
    byMode: {},
    parseOkBefore: 0,
    parseOkAfter: 0,
    exportsMatch: 0,
    importsMatch: 0,
    leftoversTotal: 0,
    filesWithLeftovers: 0,
    stringsDecodedTotal: 0,
    decoderCallsInlinedTotal: 0,
    dynamicDecoderCallsTotal: 0,
    renamingsTotal: 0,
    exceptions: errors.length,
  };
  for (const r of report) {
    totals.byMode[r.mode] = (totals.byMode[r.mode] || 0) + 1;
    if (r.parseOkBefore) totals.parseOkBefore++;
    if (r.parseOkAfter) totals.parseOkAfter++;
    if (r.exportsMatch) totals.exportsMatch++;
    if (r.importsMatch) totals.importsMatch++;
    totals.leftoversTotal += r.leftovers || 0;
    if (r.leftovers) totals.filesWithLeftovers++;
    totals.stringsDecodedTotal += r.stringsDecoded || 0;
    totals.decoderCallsInlinedTotal += r.decoderCallsInlined || 0;
    totals.dynamicDecoderCallsTotal += r.dynamicDecoderCalls || 0;
    totals.renamingsTotal += r.renamings || 0;
  }
  fs.writeFileSync(path.join(WORK, "frontend_totals.json"), JSON.stringify(totals, null, 1));
  console.log(JSON.stringify(totals, null, 1));
  if (errors.length) console.log("EXCEPTIONS: " + JSON.stringify(errors.slice(0, 20), null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
