/**
 * 3D 预览的「相机设置」折叠面板（0.8.9 `#preview-camera-panel`）。
 *
 * 上游把投影 / 焦段 / 保存视角 / 旋转 / 重置这一组收进折叠面板，只留一个
 * 「相机设置」按钮在主控件条上 —— 这些是**低频**操作，常驻会把「实时/手动」
 * 这类高频开关挤到看不见。
 *
 * 三条必须保持的行为：
 *
 * 1. `aria-expanded` 与面板 `hidden` **永远同步**：只改其中一个，读屏用户会拿到
 *    「已展开」但屏幕上什么都没有的矛盾状态。
 * 2. 点面板外部**不自动收起**：用户常常要在面板打开时去画布上试角度，
 *    自动收起会让焦段输入框在输入途中消失。
 * 3. `Esc` 收起并把焦点还给按钮（键盘用户不用再 Tab 一整圈找回去）。
 */

const TOGGLE_ID = 'preview-camera-toggle'
const PANEL_ID = 'preview-camera-panel'
const BOUND_FLAG = 'previewCameraPanelBound'

/** 面板当前是否展开（只读，供宿主同步其它 UI）。 */
export function isPreviewCameraPanelOpen(): boolean {
  const panel = document.getElementById(PANEL_ID)
  return panel ? !panel.hidden : false
}

/**
 * 设置展开状态（幂等）。
 *
 * 返回最终状态；面板或按钮缺失时返回 `false`（旧 DOM / 嵌入态没有这组控件）。
 */
export function setPreviewCameraPanelOpen(open: boolean): boolean {
  const panel = document.getElementById(PANEL_ID)
  const toggle = document.getElementById(TOGGLE_ID)
  if (!panel || !toggle) return false
  panel.hidden = !open
  toggle.setAttribute('aria-expanded', String(open))
  toggle.classList.toggle('active', open)
  return open
}

/** 绑定点击与 Esc（只绑一次）。 */
export function installPreviewCameraPanel(): void {
  const toggle = document.getElementById(TOGGLE_ID)
  if (!toggle || toggle.dataset[BOUND_FLAG] === '1') return
  toggle.dataset[BOUND_FLAG] = '1'
  toggle.addEventListener('click', () => {
    setPreviewCameraPanelOpen(!isPreviewCameraPanelOpen())
  })
  // Esc 只在面板打开时接管：否则会抢掉画布上「取消当前绘制」的 Esc。
  document.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key !== 'Escape' || !isPreviewCameraPanelOpen()) return
    setPreviewCameraPanelOpen(false)
    document.getElementById(TOGGLE_ID)?.focus()
  })
}

/** 切到「透视」以外的投影时，焦段控件置灰（与上游 `title` 提示一致）。 */
export function syncCameraFocalAvailability(mode: string): void {
  const focal = document.getElementById('preview-camera-focal-length') as HTMLInputElement | null
  if (focal) focal.disabled = mode !== 'perspective'
}
