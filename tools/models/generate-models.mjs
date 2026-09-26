/**
 * 自建 GLB 模型的生成入口。
 *
 *   node tools/models/generate-models.mjs              # 生成全部
 *   node tools/models/generate-models.mjs armchair fan # 只生成指定条目
 *   node tools/models/generate-models.mjs --check      # 只校验（不写文件）：包围盒与顶点预算
 *
 * 产出（写进 frontend/static/3d-studio/models/）：
 *   <子目录>/<基名>.glb         完整版
 *   <子目录>/<基名>-lite.glb    首屏版（降段数 + 丢掉 fullOnly 小件）
 *
 * 两道校验都对着运行侧的约定，任何一条不过就退出码非零、**不写任何文件**：
 *   1. 实际包围盒与规格里的 size 逐轴比对（容差 1cm）。运行侧按 scaleBasis 做非等比缩放，
 *      包围盒不一致 = 成品被拉扁/拔高，而这种事在浏览器里只能靠肉眼发现。
 *   2. lite 版顶点数必须低于完整版的 `liteVertexBudgetRatio` 倍（缺省 0.9；方柱这类一件都丢不得、
 *      也没有分段落可降的类型在规格里写 1）。lite 是首屏加载的那一份，不达标等于白做这份产线。
 * 两道校验都在写盘之前跑完：宁可一个文件都不出，也不要出一半好一半坏的版本。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelGroup, exportGlb, measureModelGroup } from "./model-library.mjs";
import {
  DEFAULT_LITE_VERTEX_BUDGET_RATIO,
  MODEL_DIR_BY_SPEC,
  MODEL_FILE_KEY_BY_SPEC,
  MODEL_SPECS
} from "./model-specs.mjs";
import { isValidSlotRole, MODEL_SLOT_ROLE_SUFFIX_RE } from "./model-roles.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODELS_ROOT = resolve(REPOSITORY_ROOT, "frontend/static/3d-studio/models");

/**
 * 包围盒容差：1mm。规格里的 size 必须与 studio-external-models.js 的 scaleBasis 逐值相等，
 * 而 scaleBasis 是设计尺寸（0.85 这种两位小数、最细的 smartlock 是 0.08 / 0.05），零件尺寸
 * 加起来就该精确落上去，1mm 只是给浮点与三角化误差。
 *
 * 别往上放：放到 5mm 时 smartlock 的宽少 5mm（0.075 vs 0.08）正好被「> 容差」放过，而运行侧
 * 按 scaleBasis 非等比缩放会把它拉宽 6.7% —— 校验的意义就是不让这种误差悄悄过去。
 */
const FOOTPRINT_TOLERANCE_METERS = 0.001;

const requestedSpecKeys = process.argv.slice(2).filter(argument => !argument.startsWith("--"));
const isCheckOnly = process.argv.includes("--check");

const specKeys = requestedSpecKeys.length
  ? requestedSpecKeys
  : Object.keys(MODEL_SPECS);

for (const specKey of specKeys) {
  if (!MODEL_SPECS[specKey]) {
    console.error(`[error] 没有这个模型规格：${specKey}`);
    process.exit(1);
  }
}

/** 量出模型组的实际包围盒（米）。 */
function measureBounds(group) {
  const bounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  group.updateMatrixWorld(true);
  group.traverse(object => {
    if (!object.geometry) {
      return;
    }
    if (!object.geometry.boundingBox) {
      object.geometry.computeBoundingBox();
    }
    const box = object.geometry.boundingBox;
    bounds.min.x = Math.min(bounds.min.x, box.min.x);
    bounds.min.y = Math.min(bounds.min.y, box.min.y);
    bounds.min.z = Math.min(bounds.min.z, box.min.z);
    bounds.max.x = Math.max(bounds.max.x, box.max.x);
    bounds.max.y = Math.max(bounds.max.y, box.max.y);
    bounds.max.z = Math.max(bounds.max.z, box.max.z);
  });
  return bounds;
}

const failures = [];
const summaries = [];

for (const specKey of specKeys) {
  const modelSpec = MODEL_SPECS[specKey];
  // 角色先校验：写错一个字母不会报错，只会让这一块静默退回基础色 ——
  // 现象与「整件单色」的旧行为一模一样，肉眼判不出是没生效还是本来就长这样。
  for (const [slotIndex, slotDefinition] of modelSpec.slots.entries()) {
    const role = slotDefinition.role;
    if (role === undefined) {
      continue;
    }
    if (!isValidSlotRole(role)) {
      const reason = MODEL_SLOT_ROLE_SUFFIX_RE.test(String(role))
        ? "角色名以 -soft / -dark / -light 结尾，会被运行侧当成亮度分档（见 model-roles.mjs）"
        : "不在 MODEL_SLOT_ROLES 词表里";
      failures.push(`${specKey}：槽位 ${slotIndex} 的角色「${role}」非法 —— ${reason}`);
    }
  }
  const fullGroup = await buildModelGroup(modelSpec, "full");
  const liteGroup = await buildModelGroup(modelSpec, "lite");
  const fullBounds = measureBounds(fullGroup);
  const liteBounds = measureBounds(liteGroup);
  const actualSize = [
    fullBounds.max.x - fullBounds.min.x,
    fullBounds.max.y - fullBounds.min.y,
    fullBounds.max.z - fullBounds.min.z
  ];
  const axisNames = ["宽", "高", "深"];
  // 占地（x / z）必须与 `size` 逐值相等：运行侧按 scaleBasis（= `size`）分轴缩放，占地不等就会被拉扁。
  // 高度改按 `authoredHeight` 判（缺省等于 `size[1]`）—— 有些物件的几何**刻意伸出声明箱体之外**
  // （台盆的镜柜烘在台面以上），这类物件的声明高度只描述落地柜体，作者实际烘出的总高要另记一笔。
  // 不记的话只有两条坏路：要么把声明高度改成含镜子的总高（于是柜体被拉高、占位几何对不上），
  // 要么让校验放过一切高度偏差（那这条校验就废了）。
  const expectedSize = [
    modelSpec.size[0],
    modelSpec.authoredHeight ?? modelSpec.size[1],
    modelSpec.size[2]
  ];
  if (modelSpec.authoredHeight !== undefined && modelSpec.authoredHeight < modelSpec.size[1]) {
    failures.push(
      `${specKey}：authoredHeight（${modelSpec.authoredHeight}m）低于声明高度（${modelSpec.size[1]}m）—— ` +
        `它只用来声明「几何比声明箱体高出多少」，写小了没有任何意义`
    );
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const deviation = Math.abs(actualSize[axis] - expectedSize[axis]);
    if (deviation > FOOTPRINT_TOLERANCE_METERS) {
      failures.push(
        `${specKey}：${axisNames[axis]} 期望 ${expectedSize[axis].toFixed(3)}m、实际 ${actualSize[
          axis
        ].toFixed(3)}m（差 ${deviation.toFixed(3)}m）`
      );
    }
  }
  // 原点必须落在占地底面中心：运行侧的 preserveOrigin 直接把这个原点贴地。
  // 底面高度按规格里的 `mountHeight` 判（缺省 0）：挂墙件（吊柜）把挂高烘在几何里，柜底本来就在
  // 1.4m 那一档 —— 见 model-specs.mjs 的 wallcabinet 与 model-library.mjs 的 buildModelGroup。
  const expectedMinY = modelSpec.mountHeight ?? 0;
  if (modelSpec.mountHeight !== undefined && !(modelSpec.mountHeight > 0)) {
    failures.push(
      `${specKey}：mountHeight（${modelSpec.mountHeight}）必须为正 —— 写 0（或负数）与不写等价，` +
        "只会让下面那条底面校验失去意义"
    );
  }
  if (Math.abs(fullBounds.min.y - expectedMinY) > FOOTPRINT_TOLERANCE_METERS) {
    failures.push(
      `${specKey}：底面不在 y=${expectedMinY}（min.y = ${fullBounds.min.y.toFixed(3)}m），模型会被埋进地板或浮空`
    );
  }
  // lite 与完整版必须**逐值同包围盒**（六个面全部对齐）。
  //
  // 为什么单列一条：lite 是运行侧的主资源（完整版只是加载失败时的回退，见 studio-external-models.js），
  // 所以「lite 少了一块撑轮廓的零件」在浏览器里就是**物件本身小了** —— 抬高压根不报错，只表现为
  // 模型一到位就轻轻缩一圈。而这类错的来源很集中：给一件撑着外轮廓的零件打了 `fullOnly`
  // （历史上 31 件这么踩过：柜门把手、音箱接线盒、壁挂件挂板、地毯流苏、楼梯斜裙板……），
  // 或者 lite 的降段数没踩在极值角上（圆截面的极值只落在 4 的倍数段上，见 model-library.mjs）。
  //
  // 容差比尺寸校验紧：两版是同一份规格的两条分支，除了分段数以外没有别的自由度，
  // 差到 0.5mm 就说明轮廓真的变了，而不是浮点噪声。
  const LITE_PARITY_TOLERANCE_METERS = 0.0005;
  for (const axis of ["x", "y", "z"]) {
    for (const end of ["min", "max"]) {
      const deviation = Math.abs(liteBounds[end][axis] - fullBounds[end][axis]);
      if (deviation > LITE_PARITY_TOLERANCE_METERS) {
        failures.push(
          `${specKey}：lite 与完整版的包围盒不一致 —— ${end}.${axis} 完整 ${fullBounds[end][
            axis
          ].toFixed(4)}m、lite ${liteBounds[end][axis].toFixed(4)}m（差 ${deviation.toFixed(4)}m）。` +
            "多半是某件撑着外轮廓的零件打了 fullOnly，或 lite 降段数时没踩到极值角"
        );
      }
    }
  }
  const fullMeasure = measureModelGroup(fullGroup);
  const liteMeasure = measureModelGroup(liteGroup);
  const liteBudgetRatio = modelSpec.liteVertexBudgetRatio ?? DEFAULT_LITE_VERTEX_BUDGET_RATIO;
  if (!(liteBudgetRatio > 0 && liteBudgetRatio <= 1)) {
    failures.push(
      `${specKey}：liteVertexBudgetRatio 必须落在 (0, 1]，实际 ${liteBudgetRatio}（写错一位就会让守卫彻底失效）`
    );
  }
  if (liteMeasure.vertices > fullMeasure.vertices * liteBudgetRatio) {
    failures.push(
      `${specKey}：lite 版顶点数 ${liteMeasure.vertices} 未明显低于完整版 ${fullMeasure.vertices}（上限比例 ${liteBudgetRatio}）`
    );
  }
  summaries.push({
    specKey,
    expectedSize,
    actualSize,
    fullMeasure,
    liteMeasure,
    fullGroup,
    liteGroup
  });
}

if (failures.length) {
  console.error("模型规格校验未通过，未写入任何文件：");
  for (const failure of failures) {
    console.error("  - " + failure);
  }
  process.exit(1);
}

console.log("规格校验通过：");
for (const summary of summaries) {
  console.log(
    `  [ok] ${summary.specKey}  ${summary.actualSize.map(value => value.toFixed(2)).join(" × ")}m` +
      `  完整 ${summary.fullMeasure.vertices} 顶点 / ${summary.fullMeasure.triangles} 面` +
      `  lite ${summary.liteMeasure.vertices} 顶点 / ${summary.liteMeasure.triangles} 面`
  );
}

if (isCheckOnly) {
  console.log("--check：仅校验，未写入文件。");
  process.exit(0);
}

let writtenFiles = 0;
for (const summary of summaries) {
  const modelDir = MODEL_DIR_BY_SPEC[summary.specKey];
  if (!modelDir) {
    console.error(`[error] ${summary.specKey} 没有登记子目录（见 model-specs.mjs 的 MODEL_DIR_BY_SPEC）`);
    process.exit(1);
  }
  const fileKey = MODEL_FILE_KEY_BY_SPEC[summary.specKey] || summary.specKey;
  const targetDirectory = resolve(MODELS_ROOT, modelDir);
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(resolve(targetDirectory, `${fileKey}.glb`), await exportGlb(summary.fullGroup));
  await writeFile(resolve(targetDirectory, `${fileKey}-lite.glb`), await exportGlb(summary.liteGroup));
  writtenFiles += 2;
}
console.log(`已写出 ${writtenFiles} 个文件（${summaries.length} 个模型 × 完整 / lite）。`);
