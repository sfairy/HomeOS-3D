 
/**
 * 摄像头检查器控件回归（`studio/app/editor/home-camera-inspector.ts`）。
 *
 * 守护的故障（每条都对应一次真实踩坑）：
 *  1. **「挂过了」闩必须是每挂载一份**：`bootEditor()` 每次进编辑器都重跑整个引导体、并重新
 *     采集 DOM 契约（新节点），所以注册去重只能标在**元素自身**。若图省事写成模块级
 *     `let installed = false`，第二次进编辑器时闩仍为 `true` → 静默跳过注册 → 来源 / 填充 /
 *     显示方式 / 刷新间隔 / 显隐全部失灵（与 `_request_json_smoke.ts` 守的是同一类病：
 *     每实例状态被提到模块作用域）。
 *  2. **同一次挂载内不得重复注册**：每次同步都会过一遍挂载。若每次 `addEventListener`，
 *     显隐开关一次点击会连翻两次（等于点了没反应），来源切换同理。
 *  3. **go2rtc 地址非法不落库**：前端只做即时反馈，非法地址**不能**写进文档（否则保存后才
 *     被后端拒，用户体验是「填了个错地址，画面永远转圈」），只把输入框与说明染红。
 *  4. **合法地址写回并复原提示**：校验通过后写 `go2rtcUrl`，文案回到默认提示（换摄像头时
 *     不能留着上一台的红字，那由 `syncCameraInspector` 复位）。
 *  5. **刷新间隔下限 6 秒**：非法输入回落 10，小于 6 夹到 6，并把夹紧后的值回填输入框。
 *  6. **只写摄像头**：`findComponent` 拿到的不是 `camera` 类型时一律不写。
 *
 * 运行环境说明：Bun 里没有 DOM —— `window` 与元素桩都来自 `_smoke_harness`
 * （`createFakeElement` / `createFakeOptionElement` 只实现控件真正用到的面，事件直接跑监听）。
 * 用法：`bun run scripts/_camera_inspector_controls_smoke.ts`。
 *
 * 本文件豁免 `@typescript-eslint/no-explicit-any`：它是「假对象拼装」代码 —— 元素桩要能接住
 * 任意形状的 `target`，而这里的 `context` 就是控件的 deps bag（其真实类型属于
 * MONOLITH_BASELINE 的「deps bag 接口化」范围）。全仓其余位置该规则仍是 **error**。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CAMERA_GO2RTC_NOTE_TEXT,
  installCameraInspectorControls,
} from '../../src/studio/app/editor/home-camera-inspector'

import {
  check,
  createFakeElement,
  createFakeOptionElement,
  installWindow,
  report,
  section,
} from '../_smoke_harness'

/* ------------------------------------------------------------------ *
 * 环境桩：地址校验会建同源中继 URL（`new URL('/api/v1/go2rtc/ws', window.location.href)`）
 * ------------------------------------------------------------------ */

installWindow({ location: { href: 'https://home.local/studio/', origin: 'https://home.local' } })

/* ------------------------------------------------------------------ *
 * 挂载桩：一次「进编辑器」= 一套全新元素 + 一次 install
 * ------------------------------------------------------------------ */

function createMount() {
  const elements = {
    cameraSourceOptionsElement: createFakeElement(),
    cameraGo2rtcUrlElement: createFakeElement(),
    cameraGo2rtcNoteElement: createFakeElement(),
    cameraFitOptionsElement: createFakeElement(),
    cameraDisplayModeOptionsElement: createFakeElement(),
    cameraRefreshIntervalElement: createFakeElement(),
    cameraMediaVisibleElement: createFakeElement(),
    cameraFrameVisibleElement: createFakeElement(),
  }
  // 分段按钮：监听挂在容器上（与真实结构一致），点谁就把谁当事件 target。
  const sourceButtons = [
    createFakeOptionElement('data-camera-source', 'entity'),
    createFakeOptionElement('data-camera-source', 'go2rtc'),
  ]
  const fitButtons = [
    createFakeOptionElement('data-camera-fit', 'fill'),
    createFakeOptionElement('data-camera-fit', 'contain'),
  ]
  const displayModeButtons = [
    createFakeOptionElement('data-camera-display-mode', 'live'),
    createFakeOptionElement('data-camera-display-mode', 'snapshot'),
  ]
  elements.cameraSourceOptionsElement.querySelectorAll = () => sourceButtons
  elements.cameraFitOptionsElement.querySelectorAll = () => fitButtons
  elements.cameraDisplayModeOptionsElement.querySelectorAll = () => displayModeButtons

  const mounted = {
    id: 'camera-1',
    component: {
      type: 'camera',
      properties: { cameraSource: 'entity', go2rtcUrl: '' } as Record<string, any>,
    },
  }
  /** 控件写回后恒读最新对象：处理器是**整体替换** `component.properties`，持有旧引用会读到陈旧值。 */
  const propertiesOf = () => mounted.component.properties
  const mutations: string[] = []
  const context: any = {
    ...elements,
    cameraActionControlsElement: createFakeElement(),
    getSelectedComponentId: () => mounted.id,
    findComponent: () => mounted,
    mutateDocument: (mutate: (document: any) => void) => {
      mutations.push('write')
      mutate({})
    },
  }
  /** 点某个分段按钮：事件 target 是按钮自身。 */
  const clickOption = (container: any, button: any) => container.fire('click', button)
  return {
    context,
    elements,
    sourceButtons,
    fitButtons,
    displayModeButtons,
    mounted,
    propertiesOf,
    mutations,
    clickOption,
  }
}

/* ------------------------------------------------------------------ *
 * ① 注册语义：每次挂载重挂、同挂载内不重复
 * ------------------------------------------------------------------ */

section('① 注册语义（模块级闩会让第二次进编辑器全盘失灵）')

{
  const firstMount = createMount()
  installCameraInspectorControls(firstMount.context)
  const { elements: firstElements } = firstMount
  check(
    '首次挂载 → 七个控件都挂上监听',
    firstElements.cameraSourceOptionsElement.listenerCount('click') === 1 &&
      firstElements.cameraGo2rtcUrlElement.listenerCount('change') === 1 &&
      firstElements.cameraFitOptionsElement.listenerCount('click') === 1 &&
      firstElements.cameraDisplayModeOptionsElement.listenerCount('click') === 1 &&
      firstElements.cameraRefreshIntervalElement.listenerCount('change') === 1 &&
      firstElements.cameraMediaVisibleElement.listenerCount('click') === 1 &&
      firstElements.cameraFrameVisibleElement.listenerCount('click') === 1,
  )

  // 一次挂载里会同步很多次（每次选中组件、改属性都会重跑同步）。
  installCameraInspectorControls(firstMount.context)
  installCameraInspectorControls(firstMount.context)
  check(
    '同一次挂载反复同步 → 不重复注册（否则显隐开关一次点击连翻两次）',
    firstElements.cameraMediaVisibleElement.listenerCount('click') === 1 &&
      firstElements.cameraSourceOptionsElement.listenerCount('click') === 1,
  )

  // 第二次进编辑器：DOM 是新节点，模块级闩在这里会静默跳过注册。
  const secondMount = createMount()
  installCameraInspectorControls(secondMount.context)
  check(
    '重新挂载（全新 DOM）→ 仍然挂上',
    secondMount.elements.cameraSourceOptionsElement.listenerCount('click') === 1 &&
      secondMount.elements.cameraMediaVisibleElement.listenerCount('click') === 1,
  )
  secondMount.clickOption(secondMount.elements.cameraSourceOptionsElement, secondMount.sourceButtons[1])
  check(
    '重新挂载后点击真的写文档',
    secondMount.propertiesOf().cameraSource === 'go2rtc',
    secondMount.propertiesOf(),
  )
}

/* ------------------------------------------------------------------ *
 * ② 来源切换与 go2rtc 地址校验
 * ------------------------------------------------------------------ */

section('② 来源切换 / go2rtc 地址')

{
  const mount = createMount()
  installCameraInspectorControls(mount.context)
  const { elements } = mount

  mount.clickOption(elements.cameraSourceOptionsElement, mount.sourceButtons[1])
  check('点 go2rtc → cameraSource=go2rtc', mount.propertiesOf().cameraSource === 'go2rtc')
  mount.clickOption(elements.cameraSourceOptionsElement, mount.sourceButtons[0])
  check('点 HA 实体 → cameraSource=entity', mount.propertiesOf().cameraSource === 'entity')

  // 点到空白（不是选项按钮）不该动文档。
  const mutationCountBefore = mount.mutations.length
  elements.cameraSourceOptionsElement.fire('click', { closest: () => null })
  check('点到非选项 → 不写文档', mount.mutations.length === mutationCountBefore)

  // 非法地址：只染红、不落库。
  elements.cameraGo2rtcUrlElement.value = 'https://user:pass@192.168.1.9:1984/stream.html'
  elements.cameraGo2rtcUrlElement.fire('change')
  check(
    '非法地址（带账号密码）→ 不写文档',
    mount.propertiesOf().go2rtcUrl === '' && mount.mutations.length === mutationCountBefore,
    mount.propertiesOf(),
  )
  check(
    '非法地址 → 输入框与说明染红',
    elements.cameraGo2rtcUrlElement.classList.contains('is-invalid') &&
      elements.cameraGo2rtcNoteElement.classList.contains('is-invalid'),
  )
  check(
    '非法地址 → 说明换成具体错误',
    elements.cameraGo2rtcNoteElement.textContent !== CAMERA_GO2RTC_NOTE_TEXT &&
      elements.cameraGo2rtcNoteElement.textContent.length > 0,
    elements.cameraGo2rtcNoteElement.textContent,
  )

  // 合法地址（用户就是照占位符填的）：写入并复原。
  elements.cameraGo2rtcUrlElement.value = 'http://192.168.1.9:1984/stream.html?src=front-door'
  elements.cameraGo2rtcUrlElement.fire('change')
  check(
    '合法地址 → 写 go2rtcUrl',
    mount.propertiesOf().go2rtcUrl === 'http://192.168.1.9:1984/stream.html?src=front-door',
    mount.propertiesOf(),
  )
  check(
    '合法地址 → 红色与错误文案都复原',
    !elements.cameraGo2rtcUrlElement.classList.contains('is-invalid') &&
      !elements.cameraGo2rtcNoteElement.classList.contains('is-invalid') &&
      elements.cameraGo2rtcNoteElement.textContent === CAMERA_GO2RTC_NOTE_TEXT,
    elements.cameraGo2rtcNoteElement.textContent,
  )
}

/* ------------------------------------------------------------------ *
 * ③ 填充 / 显示方式 / 刷新间隔
 * ------------------------------------------------------------------ */

section('③ 填充 / 显示方式 / 刷新间隔')

{
  const mount = createMount()
  installCameraInspectorControls(mount.context)
  const { elements } = mount

  mount.clickOption(elements.cameraFitOptionsElement, mount.fitButtons[1])
  check('点「包含」→ fit=contain', mount.propertiesOf().fit === 'contain', mount.propertiesOf())

  mount.clickOption(elements.cameraDisplayModeOptionsElement, mount.displayModeButtons[1])
  check(
    '点「快照」→ displayMode=snapshot',
    mount.propertiesOf().displayMode === 'snapshot',
    mount.propertiesOf(),
  )

  elements.cameraRefreshIntervalElement.value = '2'
  elements.cameraRefreshIntervalElement.fire('change')
  check(
    '刷新间隔 2 秒 → 夹到 6 秒并回填输入框',
    mount.propertiesOf().refreshInterval === 6 && elements.cameraRefreshIntervalElement.value === '6',
    {
      refreshInterval: mount.propertiesOf().refreshInterval,
      input: elements.cameraRefreshIntervalElement.value,
    },
  )

  elements.cameraRefreshIntervalElement.value = 'abc'
  elements.cameraRefreshIntervalElement.fire('change')
  check('刷新间隔非法 → 回落 10', mount.propertiesOf().refreshInterval === 10, mount.propertiesOf())
}

/* ------------------------------------------------------------------ *
 * ④ 显隐开关与类型守卫
 * ------------------------------------------------------------------ */

section('④ 显隐开关 / 只写摄像头')

{
  const mount = createMount()
  installCameraInspectorControls(mount.context)
  const { elements } = mount
  const properties = mount.propertiesOf()
  properties.mediaVisible = true
  properties.frameVisible = true

  elements.cameraMediaVisibleElement.fire('click')
  check('点画面显隐 → mediaVisible 翻转成 false', mount.propertiesOf().mediaVisible === false)

  elements.cameraFrameVisibleElement.fire('click')
  check('点边框显隐 → frameVisible 翻转成 false', mount.propertiesOf().frameVisible === false)

  // 同一次挂载里同步多次后，一次点击仍然只翻一次。
  installCameraInspectorControls(mount.context)
  elements.cameraMediaVisibleElement.fire('click')
  check('重复同步后一次点击只翻一次', mount.propertiesOf().mediaVisible === true)

  mount.mounted.component.type = 'image'
  mount.clickOption(elements.cameraFitOptionsElement, mount.fitButtons[1])
  check('非 camera 组件 → 不写属性', mount.propertiesOf().fit === undefined, mount.propertiesOf())
}

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

report('摄像头检查器控件回归')
