/**
 * floorplan-auto-diagram 控件的事件接线（从 `home.ts` 拆出）。
 *
 * 为什么单独拆：这段是编辑器里唯一成体系的「导图弹窗 + 灯组绑定」接线，原先以逗号表达式
 * 串在 `home.ts` 的模块级语句里，既没名字也无法单独阅读；拆出来后 `home.ts` 只留一行
 * `bindFloorplanAutoDiagramControls({...})`，元素与回调仍由 `home.ts` 提供（保持「谁持有
 * DOM 谁接线」的原则，避免把一大堆元素引用再导出一次）。
 *
 * 所有依赖都通过入参传入，且**惰性读取**（`selectedComponentId` / `projectCanvas` 是函数）：
 * 事件触发时必须读当前值，不能在接线时快照，否则切换选中组件后操作会落到旧组件上。
 */

/** 导图控件接线所需的最小依赖集合（元素 + 回调）。 */
export interface FloorplanAutoDiagramWiringDeps {
  /** 「在 3D 场景中生成」按钮。 */
  openStudioButton: HTMLButtonElement
  /** 视图 / 定位模式切换按钮。 */
  viewToggleButton: HTMLButtonElement
  /** 弹窗关闭按钮。 */
  closeButton: HTMLElement
  /** 弹窗「稍后」按钮。 */
  laterButton: HTMLElement
  /** 弹窗本体（`dataset.componentId` 记录当前组件）。 */
  dialog: HTMLDialogElement
  /** 弹窗「继续」按钮。 */
  continueButton: HTMLElement
  /** 灯组绑定列表（`change` 事件委托）。 */
  bindingList: HTMLElement
  /** 状态文案节点。 */
  status: HTMLElement
  /** 导出文件夹输入框。 */
  folderInput: HTMLInputElement
  /** 楼层选择下拉。 */
  floorSelect: HTMLSelectElement
  /** 当前选中组件（惰性）。 */
  selectedComponent: () => any
  /** 当前项目画布（惰性）。 */
  projectCanvas: () => any
  /** 文档变更入口。 */
  mutateDocument: (mutator: (document: any) => void) => void
  /** 在文档里定位组件（返回 `{ component }`）。 */
  findComponent: (document: any, componentId: string) => any
  /** 结算导图弹窗（生成失败 / 无 iframe 时）。 */
  settleDialog: (componentId: string) => void
  /** 关闭导图弹窗。 */
  closeDialog: () => void
  /** 取消「删除草稿文档」流程。 */
  cancelRemoveDraftDocument: (...args: any[]) => any
  /** 由组件位置 + 画布推算导出分辨率。 */
  exportResolution: (
    position: any,
    canvas: any,
  ) => { width: number; height: number }
}

/** 挂载导图控件的全部事件监听（幂等：每次 `home.ts` 模块初始化只调一次）。 */
export function bindFloorplanAutoDiagramControls(
  deps: FloorplanAutoDiagramWiringDeps,
): void {
  const {
    openStudioButton,
    viewToggleButton,
    closeButton,
    laterButton,
    dialog,
    continueButton,
    bindingList,
    status,
    folderInput,
    floorSelect,
    selectedComponent,
    projectCanvas,
    mutateDocument,
    findComponent,
    settleDialog,
    closeDialog,
    cancelRemoveDraftDocument,
    exportResolution,
  } = deps

  const markPreviewing = (componentId: string) => {
    mutateDocument((draftDocument: any) => {
      const component = findComponent(draftDocument, componentId)?.component
      if (component?.type !== "floorplan-auto-diagram") return
      component.properties = {
        ...(component.properties || {}),
        previewReady: true,
        previewing: true,
        interactionMode: "position",
      }
    })
  }

  openStudioButton.addEventListener("click", () => {
    const component = selectedComponent()
    if (component?.type !== "floorplan-auto-diagram") return
    // 已经生成过但还没进入预览：只补预览标记，不重复生成。
    if (component.properties?.generated === true && component.properties?.previewing !== true) {
      markPreviewing(component.id)
      return
    }
    const studioFrame = document.querySelector<HTMLIFrameElement>(
      '.hb-component[data-component-id="' +
        CSS.escape(component.id) +
        '"] .hb-floorplan-auto-diagram-preview',
    )
    if (!studioFrame?.contentWindow) {
      settleDialog(component.id)
      return
    }
    const folderName = String(component.properties?.exportFolder || "").trim()
    if (
      !folderName ||
      /[<>:"/\\|?*\x00-\x1f\x7f]/.test(folderName) ||
      folderName.startsWith(".") ||
      /[. ]$/.test(folderName)
    ) {
      status.textContent = "请先填写有效的导图文件夹名称。"
      folderInput.focus()
      return
    }
    const resolution = exportResolution(component.position || {}, projectCanvas() || {})
    status.textContent = "正在后台生成底图和灯组效果，请稍候…"
    openStudioButton.disabled = true
    floorSelect.disabled = true
    openStudioButton.textContent = "正在后台生成…"
    studioFrame.contentWindow.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-generate",
        componentId: component.id,
        width: resolution.width,
        height: resolution.height,
        folderName,
      },
      window.location.origin,
    )
  })

  viewToggleButton.addEventListener("click", () => {
    const componentId = selectedComponent()?.id
    if (!componentId) return
    mutateDocument((draftDocument: any) => {
      const component = findComponent(draftDocument, componentId)?.component
      if (component?.type !== "floorplan-auto-diagram") return
      component.properties = {
        ...(component.properties || {}),
        interactionMode:
          component.properties?.interactionMode === "view" ? "position" : "view",
      }
    })
  })

  closeButton.addEventListener("click", cancelRemoveDraftDocument)
  laterButton.addEventListener("click", cancelRemoveDraftDocument)
  dialog.addEventListener("cancel", (cancelEvent: Event) => {
    cancelEvent.preventDefault()
    cancelRemoveDraftDocument()
  })

  continueButton.addEventListener("click", () => {
    const componentId = dialog.dataset.componentId
    if (!componentId) return
    markPreviewing(componentId)
    closeDialog()
  })

  bindingList.addEventListener("change", (changeEvent: any) => {
    const lightGroupSelect = changeEvent.target.closest("[data-floorplan-light-group-id]")
    const componentId = selectedComponent()?.id
    if (!lightGroupSelect || !componentId) return
    const lightGroupId = lightGroupSelect.dataset.floorplanLightGroupId
    mutateDocument((draftDocument: any) => {
      const component = findComponent(draftDocument, componentId)?.component
      if (!component || component.type !== "floorplan-auto-diagram") return
      component.bindings = { ...(component.bindings || {}) }
      const bindingKey = "lightGroup:" + lightGroupId
      if (lightGroupSelect.value) {
        component.bindings[bindingKey] = { entityId: lightGroupSelect.value }
      } else {
        delete component.bindings[bindingKey]
      }
    })
  })
}
