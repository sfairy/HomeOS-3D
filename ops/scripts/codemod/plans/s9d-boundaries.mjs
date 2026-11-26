/**
 * S9d · `system` 资源访问下沉到 kernel/http。
 *
 * 它是唯一被 kernel/config 反向引用的 API 模块（bootstrap 期读公开配置）。
 * 该文件只依赖 kernel/http/client 与 shared 类型，没有任何领域状态，
 * 因此放在 kernel/http 下才是正确层次；其余资源访问仍留在 domain/api。
 */
const SRC = 'homeos/frontend/src'

export default {
  moves: [{ from: `${SRC}/domain/api/system.ts`, to: `${SRC}/kernel/http/system-api.ts` }],
}
