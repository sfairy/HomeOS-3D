 
/**
 * 断言核心（跨运行时共用）：`.ts` 冒烟与 `.mjs` 门禁自检都用这一份。
 *
 * 为什么是 `.mjs` 而不是 `.ts`：前端 `scripts/*_selftest.mjs` 由 **node** 直接跑
 * （`check:deps` 链里写死了 `node scripts/…`），node 不能可靠加载 `.ts`；
 * 而冒烟脚本由 bun 跑且要浏览器桩。于是把「只依赖 console/process 的断言与收尾」
 * 放在这里，[`_smoke_harness.ts`](./_smoke_harness.ts) 再把它转出给 TS 冒烟，
 * 浏览器桩（`installWindow` / `FakeMediaSource` / `FakeTimers` …）留在 `.ts` 侧。
 *
 * 输出口径统一为 `  [PASS] label` / `  [FAIL] label detail`，收尾由 `report(name)` 打印
 * 计数并以非零码退出。
 */

const failures = []
let checked = 0

/** @param {unknown} detail */
function formatDetail(detail) {
  if (detail === '' || detail === undefined || detail === null) return ''
  return typeof detail === 'string' ? detail : JSON.stringify(detail)
}

/**
 * 记录并打印一项断言；失败计入清单，由 {@link report} 统一判定退出码。
 * @param {string} label
 * @param {boolean} condition
 * @param {unknown} [detail]
 * @returns {boolean}
 */
export function check(label, condition, detail = '') {
  checked += 1
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${condition ? '' : ` ${formatDetail(detail)}`}`)
  if (!condition) failures.push(label)
  return condition
}

/**
 * 打印一个小节标题（`\n` + 标题），统一各脚本的分节观感。
 * @param {string} title
 */
export function section(title) {
  console.log(`\n${title}`)
}

/** 是否已有失败项（供需要自行决定收尾方式的脚本使用）。 */
export function failed() {
  return failures.length > 0
}

/** 当前计数：`passed` / `checked`。 */
export function counts() {
  return { passed: checked - failures.length, checked }
}

/**
 * 打印收尾；有失败项即以非零码退出，可直接当门禁用。
 * @param {string} name
 */
export function report(name) {
  console.log('')
  if (failures.length > 0) {
    console.log(`${name}失败：${failures.length} 项`)
    for (const label of failures) console.log(`  - ${label}`)
    process.exit(1)
  }
  console.log(`${name}全部通过（${checked} 项）。`)
}
