/** 把文件中连续的空白行压缩到最多 max 行（默认 1）。用于清理删除语句后留下的空行堆积。 */
import fs from "node:fs";
const [file, maxArg] = process.argv.slice(2);
const max = Number(maxArg || 1);
const lines = fs.readFileSync(file, "utf8").split("\n");
const out = [];
let run = 0, collapsed = 0;
for (const l of lines) {
  const blank = /^[ \t]*$/.test(l);
  if (blank) {
    run++;
    if (run > max) { collapsed++; continue; }
  } else run = 0;
  out.push(l);
}
fs.writeFileSync(file, out.join("\n"));
console.log(`${file}: ${lines.length} → ${out.length} 行（压缩 ${collapsed} 个空白行）`);
