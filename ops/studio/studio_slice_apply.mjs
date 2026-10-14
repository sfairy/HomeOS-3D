#!/usr/bin/env node
/**
 * `--mode=fn` 切片的一体化落地：`studio_slice_extract` + `studio_slice_wrap` + **把宿主接线贴回原位**。
 *
 * 为什么要有这一步
 * ----------------
 * 前两个工具各自只做一半，中间那截「宿主侧接线」原先刻意留给人手贴：
 * `studio_slice_wrap.mjs` 的注释写着「插入位置要跟原语句**同位**（注册顺序敏感），由人来定更稳」。
 *   - 语句级切片（`--mode=stmt`）确实必须手工 —— 那条语句是**事件注册**，插到别处就换了注册顺序，
 *     而且它的依赖袋必须写成 getter（见 wrap 的硬约束 1）。
 *   - 声明级切片（`--mode=fn`）**不需要**：宿主侧留的是**函数声明**形式的薄转发器与 thunk，
 *     两者都会被提升，调用点在上方还是下方都不影响语义（见 wrap 的硬约束 3）。
 *     手工贴只是把「插到哪一行」这件事变成了 20+ 次手工 diff 机会。
 *
 * 所以本脚本把 `--mode=fn` 的三步串起来，并只做**一处**位置判断：贴在**被搬声明原先的行首**。
 * 这个位置是唯一不需要猜的：`extract` 的删除区间起点就是它，删完之后该行号**不变**
 * （删除只发生在它之后），所以按行号插回去必然同位。
 *
 * 与逐字口径的关系
 * ----------------
 * 本脚本不生成任何业务文本：正文来自 `extract`，宿主接线的**每一个字符**都来自 `wrap` 的
 * `hostLines`（含缩进与 get/set 访问器）。它只做「替换回引 import」与「按行插入」两件事。
 *
 * 用法
 * ----
 *   node ops/studio/studio_slice_apply.mjs --file=<宿主> --out=<目标模块> --names=a,b \
 *        [--iface=XDeps] [--thunk=xDeps] [--header='/** … *\/'] [--also=h] [--max-lines=N] [--dry-run]
 *
 * `--iface` / `--thunk` 缺省由第一个切片名推导：`foo` → `FooDeps` / `fooDeps`。
 * 缺省 dry-run 到「报告」为止？不 —— `--dry-run` 只跑 extract 的 dry-run 并打印报告，不写盘；
 * 不带 `--dry-run` 时三步全跑完并写盘。
 *
 * 退出码：0 正常；1 工具报错（原样透传）；2 参数错。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import tsModule from "typescript";

const arg = (k) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : undefined;
};
const flag = (k) => process.argv.includes(`--${k}`);

const host = arg("file");
const out = arg("out");
const names = (arg("names") ?? "").split(",").filter(Boolean);
const dryRun = flag("dry-run");
if (!host || !out || !names.length) {
  console.error(
    "用法：node ops/studio/studio_slice_apply.mjs --file=<宿主> --out=<目标模块> --names=a,b [--iface=XDeps] [--thunk=xDeps] [--header=…] [--also=h] [--max-lines=N] [--dry-run]",
  );
  process.exit(2);
}

/** 与 `studio_slice_extract.mjs` 的 `toSpecifier` 同口径：目标相对宿主目录、无扩展名、必须以 `./` 起头。 */
function toSpecifier(fromDir, target) {
  let rel = path.relative(fromDir, target).replace(/\\/g, "/").replace(/\.[^.]+$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

const pascal = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const ifaceName = arg("iface") ?? `${pascal(names[0])}Deps`;
const thunkName = arg("thunk") ?? `${names[0]}Deps`;

/** 与 `studio_slice_extract.mjs --anchor-marker` 约定的同一个字面量。 */
const ANCHOR_MARKER = "/*__SLICE_ANCHOR__*/";

const extractArgs = [
  "ops/studio/studio_slice_extract.mjs",
  `--file=${host}`,
  `--out=${out}`,
  `--names=${names.join(",")}`,
  // 锚点标记：`extract --apply` 会同时改**导入区**（清死导入 + 插回引），于是它报告里的行号
  // 在产物里整体位移，按行号贴回接线会插进下一条函数的「签名与函数体之间」（语法合法、
  // tsc 才拦）。标记押在锚点、随文本一起走过所有改写，位置必然准。
  `--anchor-marker=${ANCHOR_MARKER}`,
];
if (arg("also")) extractArgs.push(`--also=${arg("also")}`);
if (arg("max-lines")) extractArgs.push(`--max-lines=${arg("max-lines")}`);
if (arg("header")) extractArgs.push(`--header=${arg("header")}`);
if (!dryRun) extractArgs.push("--apply");

function run(script, args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

let extractOut = "";
try {
  extractOut = run(extractArgs[0], extractArgs.slice(1));
} catch (err) {
  process.stderr.write(`${err.stdout ?? ""}${err.stderr ?? ""}`);
  process.exit(err.status ?? 1);
}
process.stdout.write(extractOut);

// —— 被搬声明原先的位置由 `extract` 留下的锚点标记给出（行号会因导入区改写而位移，见上）——
if (!fs.readFileSync(host, "utf8").includes(ANCHOR_MARKER)) {
  console.error(`✗ 宿主里没有锚点标记 ${ANCHOR_MARKER}，拒绝继续`);
  process.exit(1);
}

if (dryRun) {
  console.log("\n（--dry-run：只跑了 extract 的 dry-run，未写盘）");
  process.exit(0);
}

let wrapOut = "";
try {
  wrapOut = run("ops/studio/studio_slice_wrap.mjs", [
    "--mode=fn",
    `--module=${out}`,
    `--iface=${ifaceName}`,
    `--thunk=${thunkName}`,
  ]);
} catch (err) {
  process.stderr.write(`${err.stdout ?? ""}${err.stderr ?? ""}`);
  process.exit(err.status ?? 1);
}
const report = JSON.parse(wrapOut);
if (report.mode !== "fn") {
  console.error(`✗ wrap 返回的是 ${report.mode} 形态，本脚本只处理 fn`);
  process.exit(1);
}

const specifier = toSpecifier(path.dirname(path.resolve(host)), path.resolve(out));
const hostText = fs.readFileSync(host, "utf8");

// —— ① 把 extract 插进来的「回引原名的 import」换成 core 名（`import { aCore, bCore } from "./x"`）——
// 原名回引是给**调用点零改写**设计的，但本脚本用的是薄转发器：调用点仍走原名（转发器），
// 模块侧要的是 core。两者不可并存：同名 import 会被转发器遮蔽 → lint 判「定义了没人用」。
const importRe = new RegExp(`^import \\{[^}]*\\} from "${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}";$`, "m");
if (!importRe.test(hostText)) {
  console.error(`✗ 宿主里找不到回引 import（${specifier}），extract 的产物形态变了？`);
  process.exit(1);
}
const coreImport = `import { ${report.imports.join(", ")} } from "${specifier}";`;

const rewrittenHost = hostText.replace(importRe, coreImport);

// —— ② 把 wrap 给的宿主接线贴回**锚点标记所在行**，并把标记删掉 ——
// 标记是整份宿主里唯一的（`extract` 已断言恰好 1 次），所以这里不需要任何位置猜测。
const hostLines = rewrittenHost.split("\n");
const markerLineIndex = hostLines.findIndex((line) => line.includes(ANCHOR_MARKER));
if (markerLineIndex === -1) {
  console.error(`✗ 宿主里找不到锚点标记 ${ANCHOR_MARKER}（extract 与 wrap 之间文件被改过？）`);
  process.exit(1);
}
if (hostLines[markerLineIndex].trim() !== ANCHOR_MARKER) {
  console.error(`✗ 锚点标记行不是独占一行（${JSON.stringify(hostLines[markerLineIndex])}），拒绝猜测`);
  process.exit(1);
}
const block = report.hostLines.join("\n");
hostLines[markerLineIndex] = block;
const withHostBlock = hostLines.join("\n");

// 写盘前自查：宿主必须仍是可解析的 TS。插错位置最常见的结果是「插到函数体外」——
// 那在语法上往往**合法**（顶层多几个函数声明），只有 tsc 的后续报错才会暴露，所以这里先兜一道。
function assertParses(text, what) {
  const ts = tsModule;
  const parsed = ts.createSourceFile(`${what}.ts`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diags = parsed.parseDiagnostics ?? [];
  if (diags.length) {
    const at = parsed.getLineAndCharacterOfPosition(diags[0].start);
    const msg = ts.flattenDiagnosticMessageText(diags[0].messageText, " ");
    console.error(`\n✗ ${what} 有语法错误（第 ${at.line + 1} 行第 ${at.character + 1} 列）—— 未写盘：\n   ${msg}`);
    process.exit(1);
  }
}
assertParses(withHostBlock, "宿主接线后");
fs.writeFileSync(host, withHostBlock, "utf8");

console.log(
  JSON.stringify(
    {
      host,
      module: out,
      iface: ifaceName,
      thunk: thunkName,
      anchor: { markerLine: markerLineIndex + 1, deps: report.deps.length },
      stateWrites: report.stateWrites,
      forwarders: report.names,
      coreImport,
    },
    null,
    2,
  ),
);
