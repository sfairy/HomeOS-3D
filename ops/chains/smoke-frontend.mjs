/**
 * 前端纯逻辑冒烟链清单（`bun run verify:smoke:frontend`）。
 *
 * 改动原因见 `ops/chains/common.mjs` 顶部（`&&` 短路 + 参数展开）。
 * 这些冒烟只读源码、不依赖构建产物，故 CI 的 frontend-gates job 能直接跑。
 */
import { bun } from './common.mjs'

const SCRIPTS = [
  ['_esc_stack_smoke.ts', 'Esc 栈'],
  ['_background_inert_smoke.ts', '模态层背景隔离'],
  ['_a11y_contracts_smoke.ts', '无障碍交互契约'],
  ['_layout_contracts_smoke.ts', '布局契约'],
  ['_entity_control_logic_smoke.ts', '实体控制逻辑'],
  ['_scene_update_plan_smoke.ts', '场景更新计划'],
  ['_camera_inspector_controls_smoke.ts', '相机检查器控件'],
]

/**
 * 两个「假时钟 × 参数化 × 逐参数定位」的用例已按 ADR-0001 的 P3-b 迁到 `bun test`
 * （`scripts/smoke/*.test.ts`）：脚本式冒烟的分节输出在这类用例上只能给一行 `[FAIL] label`，
 * 而它们恰恰最容易在慢机器上抖动、最需要看清「哪一组参数」失败。
 *
 * 这一步仍在同一条链上（而不是另开 CI job）：改了被测模块却只跑脚本式冒烟、漏掉测试文件，
 * 是「迁完就没人跑」的典型形态 —— 链上一条步骤同时跑两者，就不会漏。
 */
const TESTS = [
  {
    name: '请求面 / go2rtc MSE（bun test：假时钟 + 参数化）',
    // 显式 `cwd` 而不是依赖调用者目录：步骤相对路径按调用者 cwd 解析，
    // CI 与本机分别从仓库根/包目录跑时就会指向不同文件。
    // 路径写成 `./` 前缀：`bun test <arg>` 不带 `./` 时是**子串过滤**（写错路径可能匹配到别的
    // 文件），带 `./` 才按路径解析、找不到就报「had no matches」并以 1 退出。
    cwd: 'homeos/frontend',
    cmd: ['bun', 'test', './scripts/smoke/request-json.test.ts', './scripts/smoke/go2rtc-mse.test.ts'],
  },
]

export default [
  ...SCRIPTS.map(([file, label]) => bun(`homeos/frontend/scripts/smoke/${file}`, label)),
  ...TESTS,
]
