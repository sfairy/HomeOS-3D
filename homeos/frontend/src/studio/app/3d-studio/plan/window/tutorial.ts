/**
 * 自定义窗型的图文教程（0.8.4）：五步，每步一张示意图。
 *
 * 为什么要教程：「画分隔线 / 点选窗格 / 预览开合」这套交互在户型图里没有先例，
 * 纯文字说明用户会直接跳过。图是内联 SVG（不依赖静态图片），跟着弹窗一起走。
 */

interface TutorialStep {
  title: string
  tab: string
  text: string
  tip: string
  figure: 'size' | 'split' | 'kind' | 'preview' | 'apply'
}

const STEPS: TutorialStep[] = [
  {
    title: '先填整扇窗的大小',
    tab: '填尺寸',
    text: '在右侧「整窗尺寸」里填写宽度和高度。比如宽 2400、高 1500，单位都是毫米。',
    tip: '先确定外框大小，再把里面分成小格。',
    figure: 'size',
  },
  {
    title: '画一条线，把窗户分成小格',
    tab: '画分格',
    text: '点「竖向分隔」或「横向分隔」，再到想分开的区域里点一下。想多分几格，就继续画。',
    tip: '拖动调整整条分隔；点击线段后可只删除该段，合并两侧窗格。不对齐时先补线或调整，画错可撤销。',
    figure: 'split',
  },
  {
    title: '点选小格，决定怎么开',
    tab: '选窗型',
    text: '先点「选择 / 移动」，再点一个窗格，在右侧「区域类型」里选择固定、平开、上悬、下悬或推拉。',
    tip: '每格可以不同。想固定打开，在右侧填「默认开度」：0 是关闭，100 是完全打开，应用后会保留。',
    figure: 'kind',
  },
  {
    title: '播放一下，看看开合效果',
    tab: '看预览',
    text: '设置好可开启的窗格后，点 3D 预览下方的「播放动画」。也可以拖动「临时开合预览」滑条。',
    tip: '动画和滑条不会保存开度。点「恢复默认开度」看应用后的样子；这里不会控制真实窗户。',
    figure: 'preview',
  },
  {
    title: '满意了，点「应用窗型」',
    tab: '应用',
    text: '先关闭教程，再点右下角「应用窗型」，把设计放回户型图。之后选中这扇窗，还能继续修改。',
    tip: '点「取消」会放弃这次绘制。教程中的图只是示意，不会修改你的窗户。',
    figure: 'apply',
  },
]

/** 通用的窗框轮廓 + 中分隔线，后续每步在这个底图上叠加高亮。 */
const WINDOW_OUTLINE =
  '<rect x="54" y="56" width="278" height="174" rx="3" fill="#18303b" stroke="#b7c9d5" stroke-width="8"/>'
const WINDOW_MIDDLE_LINE = '<path d="M193 60V226" stroke="#b7c9d5" stroke-width="6"/>'

function svgText(x: number, y: number, text: string, fill = '#dbe7ef', fontSize = 16): string {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fontSize}" text-anchor="middle">${text}</text>`
}

/** 教程图里的「按钮」示意。 */
function figureButton(x: number, y: number, width: number, label: string, active = false): string {
  return (
    `<rect x="${x}" y="${y}" width="${width}" height="38" rx="7" fill="${active ? '#ff9d2e' : '#243441'}"/>` +
    svgText(x + width / 2, y + 25, label, active ? '#211305' : '#dbe7ef', 15)
  )
}

/** 按步骤生成示意图（宽版 + 窄版共用同一份内容）。 */
function figureMarkup(figure: TutorialStep['figure']): string {
  let content = WINDOW_OUTLINE
  if (figure === 'size') {
    content +=
      '<path d="M54 38H332M35 56V230" stroke="#ff9d2e" stroke-width="2"/>' +
      svgText(193, 28, '宽 2400 mm', '#ffc58d') +
      svgText(193, 148, '高 1500 mm', '#ffc58d') +
      figureButton(380, 85, 176, '宽度 / mm   2400') +
      figureButton(380, 140, 176, '高度 / mm   1500')
  } else if (figure === 'split') {
    content +=
      '<path d="M193 60V226" stroke="#ff9d2e" stroke-width="4" stroke-dasharray="7 5"/>' +
      '<circle cx="193" cy="145" r="18" fill="#ff9d2e"/>' +
      svgText(193, 151, '点', '#211305') +
      figureButton(375, 64, 185, '竖向分隔', true) +
      svgText(468, 136, '再点画布中的位置') +
      svgText(468, 177, '一条线，分成两格') +
      svgText(193, 270, '也可以画横线，分成上、下两格', '#91a1af', 14)
  } else if (figure === 'kind') {
    content +=
      WINDOW_MIDDLE_LINE +
      '<rect x="60" y="62" width="128" height="162" fill="#48321f" stroke="#ff9d2e" stroke-width="3"/>' +
      '<path d="M69 72L177 143L69 214" fill="none" stroke="#ffc58d" stroke-width="2"/>' +
      svgText(124, 258, '点选这一格', '#ffc58d') +
      svgText(263, 148, '固定玻璃') +
      svgText(467, 76, '区域类型') +
      figureButton(375, 92, 185, '平开窗', true) +
      svgText(467, 167, '也可选上悬、下悬') +
      svgText(467, 198, '或两扇 / 三扇推拉')
  } else if (figure === 'preview') {
    content +=
      WINDOW_MIDDLE_LINE +
      '<path d="M60 62L154 87V201L60 224Z" fill="#5a879477" stroke="#ffc58d" stroke-width="3"/>' +
      '<path d="M135 164Q175 181 178 141" fill="none" stroke="#ff9d2e" stroke-width="3"/>' +
      figureButton(375, 65, 185, '播放动画', true) +
      svgText(465, 145, '开合预览') +
      '<path d="M387 174H548" stroke="#637988" stroke-width="5"/>' +
      '<path d="M387 174H475" stroke="#ff9d2e" stroke-width="5"/>' +
      '<circle cx="475" cy="174" r="10" fill="#ffc58d"/>' +
      svgText(465, 226, '拖动滑条，看不同开度', '#91a1af', 14)
  } else {
    content +=
      WINDOW_MIDDLE_LINE +
      '<path d="M69 72L177 143L69 214" fill="none" stroke="#8bb1c1" stroke-width="2"/>' +
      svgText(263, 148, '固定玻璃') +
      figureButton(375, 90, 185, '应用窗型', true) +
      svgText(465, 168, '回到户型图') +
      svgText(465, 205, '保留你的设计', '#ffc58d')
  }
  const label = `${STEPS.find((step) => step.figure === figure)!.title}的操作示意图`
  return (
    `<svg class="wt-wide" viewBox="0 0 610 292" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${content}</svg>` +
    `<svg class="wt-compact" viewBox="0 0 360 292" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`
  )
}

/** 打开教程弹窗。返回 `{ close }`，调用方在编辑器关闭时一并关闭即可。 */
export function openWindowTutorial({ onClose = () => {} }: { onClose?: () => void } = {}): {
  close: () => void
} {
  const dialog = document.createElement('dialog')
  dialog.className = 'window-tutorial'
  dialog.setAttribute('aria-labelledby', 'wt-title')
  dialog.innerHTML =
    '<header><div><p>自定义窗户 · 图文教程</p><h2 id="wt-title">跟着做，五步画好一扇窗</h2></div>' +
    '<button type="button" data-close aria-label="关闭操作教程">×</button></header>' +
    '<nav aria-label="教程步骤">' +
    STEPS.map((step, index) => `<button type="button" data-step="${index}">${index + 1} ${step.tab}</button>`).join(
      '',
    ) +
    '</nav>' +
    '<section aria-live="polite" aria-atomic="true"><h3></h3><p data-text></p><div data-figure></div><p data-tip></p></section>' +
    '<footer><button type="button" data-prev>上一步</button><span data-count></span><button type="button" data-next>下一步</button></footer>'
  let stepIndex = 0
  let closed = false
  const query = (selector: string) => dialog.querySelector<HTMLElement>(selector)!

  function renderStep(): void {
    const step = STEPS[stepIndex]
    query('h3').textContent = `${stepIndex + 1}. ${step.title}`
    query('[data-text]').textContent = step.text
    query('[data-tip]').textContent = step.tip
    query('[data-figure]').innerHTML = figureMarkup(step.figure)
    query('[data-count]').textContent = `${stepIndex + 1} / ${STEPS.length}`
    query('[data-prev]').toggleAttribute('disabled', stepIndex === 0)
    query('[data-next]').textContent = stepIndex === STEPS.length - 1 ? '知道了，继续绘制' : '下一步'
    dialog.querySelectorAll<HTMLElement>('[data-step]').forEach((tab, index) => {
      tab.setAttribute('aria-current', index === stepIndex ? 'step' : 'false')
    })
  }

  function close(): void {
    if (closed) return
    closed = true
    window.removeEventListener('pagehide', close)
    dialog.close()
    dialog.remove()
    onClose()
  }

  query('[data-close]').onclick = close
  query('[data-prev]').onclick = () => {
    stepIndex = Math.max(0, stepIndex - 1)
    renderStep()
  }
  query('[data-next]').onclick = () => {
    if (stepIndex === STEPS.length - 1) close()
    else {
      stepIndex += 1
      renderStep()
    }
  }
  dialog.querySelectorAll<HTMLElement>('[data-step]').forEach((tab) => {
    tab.onclick = () => {
      stepIndex = Number(tab.dataset.step)
      renderStep()
    }
  })
  // Esc 也走 close()：关掉时要保证 onClose 只执行一次。
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  // 教程是模态的，但键盘事件不能漏给编辑器（否则 Backspace 会删分格）。
  for (const eventName of ['keydown', 'keyup']) dialog.addEventListener(eventName, (event) => event.stopPropagation())
  window.addEventListener('pagehide', close)
  document.body.append(dialog)
  renderStep()
  dialog.showModal()
  return { close }
}
