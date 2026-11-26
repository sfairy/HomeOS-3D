/** S9g · 摄像头编解码配置属共享能力 → domain/camera。 */
const SRC = 'homeos/frontend/src'
export default {
  moves: [{ from: `${SRC}/features/device/camera/mse-codec.ts`, to: `${SRC}/domain/camera/mse-codec.ts` }],
}
