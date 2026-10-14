/**
 * 冒烟链的公共装配（三份清单共用）。
 *
 * 为什么要有这一层，而不是各清单各写一遍：
 *
 * 1. **`&&` 长链的短路问题**：原来的 `verify:smoke*` 是 `a && b && c && …`，第一步失败
 *    后面全部不跑 —— 修一个 bug、重跑、再发现下一个，n 个问题要 n 轮。改成 `run-chain.mjs`
 *    之后所有步骤都会跑完，一次拿到全部失败项（退出码语义不变：有任一步非 0 即为 1）。
 * 2. **`${PYTHON:-.venv-store/bin/python}` 的语义必须保留**：CI 里显式 `PYTHON=python`，
 *    本机无该变量时回落到 `.venv-store`。`run-chain.mjs` 用 `spawn` 直接起进程、**不过 shell**，
 *    所以 shell 的参数展开在这里不会发生，必须由本模块显式解析。
 * 3. **`PYTHON` 的值可能带空格**（如 `uv run python`），故按空白切成 argv 片段，
 *    而不是当成单个可执行文件名 —— 否则会得到一个「找不到文件 'uv run python'」的怪错。
 */

/** `PYTHON` 环境变量解析成 argv 前缀；未设置时回落仓库约定的 `.venv-store/bin/python`。 */
export function python() {
  const raw = (process.env.PYTHON || '').trim()
  return raw ? raw.split(/\s+/) : ['.venv-store/bin/python']
}

/** 一个 `python <脚本>` 步骤。 */
export function py(script, name = script) {
  return { name, cmd: [...python(), script] }
}

/** 一个 `bun run <脚本或 npm script>` 步骤。 */
export function bun(args, name = args.join(' ')) {
  return { name, cmd: ['bun', 'run', ...[].concat(args)] }
}

/**
 * 一个 `node <脚本>` 步骤（门禁/自检用）。
 *
 * 与 `bun()` 的区别：`bun()` 走的是 `bun run <name>`，那要求脚本在某个 `package.json` 的
 * `scripts` 里登记；`ops/**` 下的门禁是一堆独立脚本、没有登记过，直接 `node` 跑才对。
 */
export function node(script, name = script) {
  return { name, cmd: ['node', script] }
}
