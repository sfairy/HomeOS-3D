/**
 * 窗型编辑器的 3D 预览（0.8.4）。
 *
 * 只服务「画窗格时看一眼」：独立的小 WebGLRenderer + 单向 OrbitControls，
 * 与主舞台完全隔离（否则预览里的选中态、相机、资源都不好收）。
 *
 * {@link createPreviewMotion} 是预览动画的状态机：移动到目标开度 → 停 holdTime →
 * 自动关闭（`play` 模式下循环）。它和运行期的 `window-motion` 是两套代码：
 * 预览用固定行程时间，运行期按设备行程时长换算。
 */

// three 在本工程一律以根绝对 URL 外置加载（见 vite-studio.ts 的构建契约）：
// 写成裸 `three` 会在产物里留下裸标识符，浏览器没有 import map，整条模块图会报
// `Failed to resolve module specifier "three"`，舞台/编辑器一起白屏。
import * as THREE from '/static/vendor/three/0.187.0/three.module.min.js'
import { OrbitControls } from '/static/vendor/three/0.187.0/OrbitControls.js'

import { addCustomWindow } from './model'

const VERTICAL_FOV_DEGREES = 38
const PREVIEW_BACKGROUND = 0x111820

export class WindowPreview {
  host: HTMLElement
  style: any
  closed = false
  renderer: any
  scene: any
  camera: any
  controls: any
  onChange: () => void
  observer: ResizeObserver
  root: any = null
  model: any = null
  dimensions: { w: number; h: number } | null = null
  interiorSide: 1 | -1 = 1
  fitted = false

  constructor(host: HTMLElement, style: any) {
    this.host = host
    this.style = style
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setClearColor(style.background ?? PREVIEW_BACKGROUND)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.setAttribute('aria-label', '窗户三维预览，可拖动旋转、滚轮缩放')
    host.replaceChildren(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 2.3))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2)
    keyLight.position.set(-3, 5, 5)
    this.scene.add(keyLight)

    this.camera = new THREE.PerspectiveCamera(VERTICAL_FOV_DEGREES, 1, 0.01, 200)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    this.controls.minDistance = 0.3
    this.controls.maxDistance = 100
    // 留一点仰角余量，但不允许转到窗户背后（否则正面立面会「消失」）。
    this.controls.maxPolarAngle = Math.PI * 0.86
    this.onChange = () => this.render()
    this.controls.addEventListener('change', this.onChange)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
  }

  render(): void {
    if (this.closed || document.hidden || !this.host.clientWidth || !this.host.clientHeight) return
    this.renderer.render(this.scene, this.camera)
  }

  resize(): void {
    if (this.closed || !this.host.clientWidth || !this.host.clientHeight) return
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight, false)
    this.camera.aspect = this.host.clientWidth / this.host.clientHeight
    this.camera.updateProjectionMatrix()
    this.render()
  }

  /** 清掉上一份预览的全部几何 / 材质：编辑器里会反复重画，不释放必漏显存。 */
  clear(): void {
    if (!this.root) return
    const geometries = new Set<any>()
    const materials = new Set<any>()
    this.root.traverse((object: any) => {
      if (object.geometry) geometries.add(object.geometry)
      if (object.material) materials.add(object.material)
    })
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    this.scene.remove(this.root)
    this.root = null
    this.model = null
  }

  setRecord(record: any, selectedSashId: string, refit = false): void {
    this.clear()
    this.root = new THREE.Group()
    this.scene.add(this.root)
    this.dimensions = { w: record.width, h: record.height }
    this.interiorSide = record.windowDesign.interiorSide
    const addBoxes = (parent: any, parts: any[], color: unknown, options: any = {}) => {
      const material: any = new THREE.MeshStandardMaterial({
        color: color as any,
        roughness: options.roughness ?? 0.52,
        metalness: options.metalness ?? 0.15,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        depthWrite: options.depthWrite ?? true,
        side: THREE.DoubleSide,
      })
      for (const [partWidth, partHeight, partDepth, x, y, z] of parts) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(partWidth, partHeight, partDepth), material)
        mesh.position.set(x, y, z)
        mesh.renderOrder = options.renderOrder ?? 0
        parent.add(mesh)
      }
    }
    this.model = addCustomWindow({
      group: this.root,
      window: record,
      sill: 0,
      style: this.style,
      addBoxes,
      selected: selectedSashId,
    })
    if (refit || !this.fitted) this.reset()
    this.setPosition(null)
    this.resize()
  }

  getPositions(): number[] {
    return this.model?.getPositions() ?? []
  }

  setPositions(percentages: number[]): void {
    this.model?.setPositions(percentages)
    this.render()
  }

  setPosition(percentage: number | null): void {
    this.model?.setPosition(percentage)
    this.render()
  }

  /**
   * 重置相机：`perspective` 斜看，`interior` / `exterior` 正对立面。
   * 距离按「整窗高宽都能放下」反推，再留 32% 余量。
   */
  reset(view: 'perspective' | 'interior' | 'exterior' = 'perspective'): void {
    if (!this.dimensions) return
    const { w: width, h: height } = this.dimensions
    const aspect = Math.max(0.3, this.host.clientWidth / Math.max(1, this.host.clientHeight))
    const halfFov = Math.tan(((VERTICAL_FOV_DEGREES / 2) * Math.PI) / 180)
    const distance = Math.max(width / (2 * halfFov * aspect), height / (2 * halfFov)) * 1.32
    const frontal = view === 'interior' || view === 'exterior'
    const depthSign = frontal ? this.interiorSide * (view === 'exterior' ? -1 : 1) : 1
    this.controls.target.set(0, height / 2, 0)
    this.camera.position.set(
      frontal ? 0 : distance * 0.38,
      height / 2 + (frontal ? 0 : distance * 0.18),
      distance * depthSign,
    )
    this.controls.update()
    this.fitted = true
    this.render()
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.observer.disconnect()
    this.controls.removeEventListener('change', this.onChange)
    this.controls.dispose()
    this.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}

/** 预览动画的状态机（乐观：先动起来，不控制设备）。 */
export function createPreviewMotion({
  onPosition,
  readPositions,
  onState = () => {},
  now = () => performance.now(),
  request = requestAnimationFrame,
  cancel = cancelAnimationFrame,
  travelTime = 2400,
  holdTime = 400,
}: {
  onPosition: (position: number, percentages: number[]) => void
  readPositions?: () => number[]
  onState?: (state: 'idle' | 'opening' | 'closing' | 'holding' | 'stopped') => void
  now?: () => number
  request?: (callback: FrameRequestCallback) => number
  cancel?: (handle: number) => void
  travelTime?: number
  holdTime?: number
}) {
  let current = 0
  let state: { from: number[]; to: number; start: number; duration: number; play: boolean; phase: 'move' } | null = null
  let hold: { phase: 'hold'; start: number } | null = null
  let frameHandle: number | null = null
  let frameToken = 0
  let disposed = false

  const clampPercent = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0))
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

  function positions(): number[] {
    const read = readPositions?.()
    return read?.length ? read.map(clampPercent) : [current]
  }

  function emit(percentages: number[]): void {
    current = mean(percentages)
    onPosition(current, percentages)
  }

  function cancelFrame(): void {
    frameToken += 1
    if (frameHandle !== null) cancel(frameHandle)
    frameHandle = null
    state = null
    hold = null
  }

  function stop(): void {
    const wasRunning = state !== null || hold !== null
    cancelFrame()
    if (wasRunning && !disposed) onState('stopped')
  }

  function seek(value: number): void {
    if (disposed) return
    stop()
    emit(positions().map(() => clampPercent(value)))
    onState('idle')
  }

  /** 移动到一个目标开度；`play` 时先开到底、停 holdTime、再自动关回。 */
  function animateTo(targetPercent: number, play = false): void {
    if (disposed) return
    cancelFrame()
    const from = positions()
    const target = clampPercent(targetPercent)
    const maxDelta = Math.max(...from.map((value) => Math.abs(target - value)))
    current = mean(from)
    if (maxDelta < 0.001 && !play) {
      emit(from.map(() => target))
      onState('idle')
      return
    }
    state = {
      from,
      to: target,
      start: now(),
      duration: maxDelta < 0.001 ? 0 : Math.max(180, (travelTime * maxDelta) / 100),
      play,
      phase: 'move',
    }
    onState(target >= current ? 'opening' : 'closing')
    schedule()
  }

  function schedule(): void {
    const token = frameToken
    frameHandle = request(() => {
      if (disposed || token !== frameToken) return
      frameHandle = null
      step()
    })
  }

  function step(): void {
    if (!state && !hold) return
    const time = now()
    if (hold) {
      if (time - hold.start >= holdTime) {
        animateTo(0)
        return
      }
      schedule()
      return
    }
    const motion = state!
    const progress = motion.duration ? Math.min(1, Math.max(0, (time - motion.start) / motion.duration)) : 1
    const eased = progress * progress * (3 - 2 * progress)
    emit(motion.from.map((value) => value + (motion.to - value) * eased))
    if (progress < 1) {
      schedule()
      return
    }
    if (motion.play) {
      state = null
      hold = { phase: 'hold', start: time }
      onState('holding')
      schedule()
    } else {
      state = null
      onState('idle')
    }
  }

  return {
    get position() {
      return mean(positions())
    },
    get running() {
      return state !== null || hold !== null
    },
    open: () => animateTo(100),
    close: () => animateTo(0),
    play: () => animateTo(100, true),
    seek,
    stop,
    dispose() {
      if (disposed) return
      cancelFrame()
      disposed = true
    },
  }
}
