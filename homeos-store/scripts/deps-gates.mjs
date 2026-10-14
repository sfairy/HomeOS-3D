/**
 * `check:deps` 链的步骤清单（homeos-store）。
 *
 * 由 `ops/lib/run-chain.mjs` 并发执行；打印顺序即本数组顺序。
 * 引用可解析性复用 homeos/frontend 那份门禁（`--root frontend --alias @store/`），
 * 所以这里只有三条 —— 但路径是按**清单所在目录**解析的，单独调也能跑对。
 */
export default [
  { name: '域边界与分层依赖方向（store）', cmd: ['node', 'scripts/check-store-deps.mjs'] },
  {
    name: '域边界门禁自检（规则拦截 / 合法例外 / 白名单生效与过期）',
    cmd: ['node', 'scripts/_store_deps_selftest.mjs'],
  },
  {
    name: '引用可解析性（store，@store/ 别名）',
    cmd: ['node', '../homeos/frontend/scripts/gates/check-import-refs.mjs', '--root', 'frontend', '--alias', '@store/'],
  },
]
