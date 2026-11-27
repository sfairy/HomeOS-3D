/**
 * S1 探针计划：只搬一个文件，用来验证 restructure 的 import 重写是否正确。
 * 验证通过后可以删除本文件。
 */
export default {
  moves: [{ from: 'homeos/frontend/src/services/api/csrf.ts', to: 'homeos/frontend/src/kernel/http/csrf.ts' }],
}
