/**
 * 编辑器左上「当前仪表盘全局字体」区块 + 「管理字体」弹窗（0.8.6）。
 *
 * - 两个下拉分别写 `theme.fonts.chinese` / `theme.fonts.latin`（经宿主 `change` 走一次文档变更）；
 * - 弹窗列出内置 8 款与已上传字体，支持预览、上传（原始字节 + `X-File-Name`）、删除；
 *   预览只作用于弹窗内的示例文字，关闭即撤销，不碰文档。
 */
import { domElement } from '@app/shared/util/dom-factory'
import {
  createDashboardFonts,
  type DashboardFontCatalog,
  type DashboardFontDocument,
  type DashboardFontEntry,
  type DashboardFontRole,
  type DashboardFontsController,
  dashboardFontChoices,
} from '../shared/dashboard-fonts'

const MAX_FONT_BYTES = 32 * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 120_000

export interface DashboardFontSettingsOptions {
  root: HTMLElement
  getDocument: () => DashboardFontDocument
  isVisible?: () => boolean
  change: (role: DashboardFontRole, value: string) => unknown
  api: (path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<unknown>
  onError: (error: Error) => void
  renderSelect?: (select: HTMLSelectElement) => void
}

export interface DashboardFontSettings {
  sync(): void
}

function formatFontSize(bytes: number): string {
  return bytes < 1024 * 1024 ? Math.ceil(bytes / 1024) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error('缺少字体设置元素：' + selector)
  return element
}

function fontNameLabel(font: DashboardFontEntry) {
  const name = domElement(document, 'span', null, font.name)
  name.title = font.name
  name.dataset.overflowScrollPreview = 'true'
  name.dataset.overflowScrollFocus = 'true'
  return name
}

function rowButton(label: string, onClick: (button: HTMLButtonElement) => void) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', () => onClick(button))
  return button
}

function licenseLink(url: string) {
  const license = domElement(document, 'a', null, '许可')
  license.className = 'dashboard-font-license'
  license.href = url
  license.target = '_blank'
  license.rel = 'noopener'
  return license
}

class DashboardFontSettingsPanel implements DashboardFontSettings {
  private readonly root: HTMLElement
  private readonly getDocument: () => DashboardFontDocument
  private readonly isVisible: () => boolean
  private readonly change: DashboardFontSettingsOptions['change']
  private readonly api: DashboardFontSettingsOptions['api']
  private readonly onError: (error: Error) => void
  private readonly renderSelect: (select: HTMLSelectElement) => void
  private readonly chineseSelect: HTMLSelectElement
  private readonly latinSelect: HTMLSelectElement
  private readonly dialog: HTMLDialogElement
  private readonly message: HTMLElement
  private readonly fileInput: HTMLInputElement
  private readonly uploadButton: HTMLButtonElement
  private readonly previewName: HTMLElement
  private readonly preview: DashboardFontsController
  private catalog: DashboardFontCatalog | null = null
  private loading: Promise<DashboardFontCatalog> | null = null
  private uploading = false

  constructor(options: DashboardFontSettingsOptions) {
    this.root = options.root
    this.getDocument = options.getDocument
    this.isVisible = options.isVisible || (() => true)
    this.change = options.change
    this.api = options.api
    this.onError = options.onError
    this.renderSelect = options.renderSelect || (() => {})
    this.chineseSelect = query<HTMLSelectElement>(this.root, '[data-font-role="chinese"]')
    this.latinSelect = query<HTMLSelectElement>(this.root, '[data-font-role="latin"]')
    this.dialog = query<HTMLDialogElement>(document, '#dashboard-font-dialog')
    this.message = query<HTMLElement>(this.dialog, '.dashboard-font-message')
    this.fileInput = query<HTMLInputElement>(this.dialog, 'input[type=file]')
    this.uploadButton = query<HTMLButtonElement>(this.dialog, '[data-font-upload]')
    this.previewName = query<HTMLElement>(this.dialog, '[data-preview-name]')
    this.previewName.dataset.overflowScrollPreview = 'true'
    this.preview = createDashboardFonts(query<HTMLElement>(this.dialog, '.dashboard-font-sample'), {
      onError: (error) => this.showMessage(error.message, true),
    })
    this.bindSelects()
    this.bindDialog()
  }

  sync() {
    this.refreshSelects()
    if (this.getDocument()) this.loadCatalog().catch(this.onError)
  }

  private bindSelects() {
    for (const [role, select] of [
      ['chinese', this.chineseSelect],
      ['latin', this.latinSelect],
    ] as const) {
      select.addEventListener('change', () => this.changeFont(role, select.value))
    }
  }

  private async changeFont(role: DashboardFontRole, value: string) {
    if (!this.getDocument() || this.uploading) return
    this.chineseSelect.disabled = this.latinSelect.disabled = true
    try {
      await this.change(role, value)
    } finally {
      this.chineseSelect.disabled = this.latinSelect.disabled = false
      this.refreshSelects()
    }
  }

  private bindDialog() {
    query<HTMLButtonElement>(this.root, '[data-manage-fonts]').addEventListener('click', () => this.openDialog())
    query<HTMLButtonElement>(this.dialog, '[data-close]').addEventListener('click', () => this.dialog.close())
    this.uploadButton.addEventListener('click', () => this.fileInput.click())
    this.dialog.addEventListener('close', () => {
      this.resetPreview()
      this.fileInput.value = ''
    })
    this.fileInput.addEventListener('change', () => this.uploadSelectedFile())
  }

  private async openDialog() {
    this.showMessage('')
    this.dialog.showModal()
    try {
      await this.loadCatalog(true)
      if (this.dialog.open) this.renderLibrary()
    } catch (error) {
      this.showMessage((error as Error).message, true)
    }
  }

  private showMessage(text = '', isError = false) {
    this.message.textContent = text
    this.message.hidden = !text
    this.message.classList.toggle('error', isError)
    if (text && this.dialog.open) this.message.scrollIntoView({ block: 'nearest' })
  }

  private resetPreview() {
    this.preview.apply(null)
    this.previewName.textContent = '跟随设备'
  }

  private fillSelect(select: HTMLSelectElement, role: DashboardFontRole) {
    const current = dashboardFontChoices(this.getDocument())[role]
    select.replaceChildren()
    const add = (value: string, label: string) => select.add(new Option(label, value))
    add('device', '跟随设备')
    if (role === 'latin') add('chinese', '跟随中文字体')
    for (const font of this.catalog?.builtin || []) if (font.role === role) add(font.id, font.name)
    for (const font of this.catalog?.uploaded || []) add(font.id, font.name)
    if (![...select.options].some((option) => option.value === current)) add(current, '字体不可用（设备回退）')
    select.value = current
    this.renderSelect(select)
  }

  private refreshSelects() {
    this.root.hidden = !this.getDocument() || !this.isVisible()
    if (!this.getDocument()) return
    this.fillSelect(this.chineseSelect, 'chinese')
    this.fillSelect(this.latinSelect, 'latin')
  }

  private loadCatalog(force = false): Promise<DashboardFontCatalog> {
    if (!force && this.catalog) return Promise.resolve(this.catalog)
    this.loading ||= this.api('/fonts')
      .then((result) => {
        this.catalog = result as DashboardFontCatalog
        this.refreshSelects()
        return this.catalog
      })
      .finally(() => {
        this.loading = null
      })
    return this.loading
  }

  private previewFont(font: DashboardFontEntry, row: HTMLElement) {
    this.showMessage('')
    this.previewName.textContent = font.name
    this.previewName.title = font.name
    for (const other of this.dialog.querySelectorAll('.dashboard-font-row'))
      other.classList.toggle('is-previewing', other === row)
    this.preview.apply(
      font.role === 'latin' ? { chinese: 'device', latin: font.id } : { chinese: font.id, latin: 'chinese' },
    )
  }

  private async deleteFont(font: DashboardFontEntry, button: HTMLButtonElement) {
    if (Object.values(dashboardFontChoices(this.getDocument())).includes(font.id)) {
      this.showMessage('请先替换当前仪表盘使用的字体并保存，再删除。', true)
      return
    }
    button.disabled = true
    try {
      await this.api('/fonts/user/' + font.id.slice('font:'.length), { method: 'DELETE' })
      this.resetPreview()
      await this.loadCatalog(true)
      this.renderLibrary()
      this.showMessage('字体已删除。')
    } catch (error) {
      this.showMessage((error as Error).message, true)
    } finally {
      button.disabled = false
    }
  }

  private fontRow(font: DashboardFontEntry): HTMLElement {
    const row = domElement(document, 'div', 'dashboard-font-row')
    row.dataset.overflowScrollPreviewRow = 'true'
    const previewButton = rowButton('预览', () => this.previewFont(font, row))
    if (font.source === 'user') {
      const size = domElement(document, 'small', null, formatFontSize(font.size))
      row.append(
        fontNameLabel(font),
        size,
        previewButton,
        rowButton('删除', (button) => this.deleteFont(font, button)),
      )
    } else {
      row.append(fontNameLabel(font), previewButton)
      if (font.licenseUrl) row.append(licenseLink(font.licenseUrl))
    }
    return row
  }

  private renderLibrary() {
    const uploaded = this.catalog?.uploaded || []
    const userList = query<HTMLElement>(this.dialog, '[data-font-source="user"]')
    query<HTMLElement>(this.dialog, '[data-font-source="builtin"]').replaceChildren(
      ...(this.catalog?.builtin || []).map((font) => this.fontRow(font)),
    )
    userList.replaceChildren(...uploaded.map((font) => this.fontRow(font)))
    query<HTMLElement>(this.dialog, '[data-upload-count]').textContent = uploaded.length + ' 款'
    if (!uploaded.length) {
      const empty = domElement(document, 'p', 'dashboard-font-empty', '还没有上传字体。')
      userList.append(empty)
    }
  }

  private setUploading(uploading: boolean) {
    this.uploading = uploading
    this.fileInput.disabled = this.uploadButton.disabled = uploading
    this.uploadButton.textContent = uploading ? '正在上传…' : '上传字体'
  }

  private async uploadSelectedFile() {
    const file = this.fileInput.files?.[0]
    if (!file || this.uploading) return
    if (file.size > MAX_FONT_BYTES) {
      this.showMessage('字体文件最大为 32 MB。', true)
      this.fileInput.value = ''
      return
    }
    this.setUploading(true)
    this.showMessage('正在检查并上传字体…')
    try {
      // 先让浏览器自己解一遍：服务端只校验容器结构，字形能否渲染以浏览器为准。
      await new FontFace('HB_upload_check', await file.arrayBuffer()).load()
      await this.api('/fonts/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        body: file,
        timeoutMs: UPLOAD_TIMEOUT_MS,
      })
      await this.loadCatalog(true)
      if (this.dialog.open) this.renderLibrary()
      this.showMessage('上传完成，可在中文或英文与数字中选择。')
    } catch (error) {
      this.showMessage((error as Error)?.message || '字体无法读取，请检查文件后重试。', true)
    } finally {
      this.setUploading(false)
      this.fileInput.value = ''
    }
  }
}

export function createDashboardFontSettings(options: DashboardFontSettingsOptions): DashboardFontSettings {
  return new DashboardFontSettingsPanel(options)
}
