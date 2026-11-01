/**
 * edge-tts 神经音色清单（中文为主，附少量英文）。
 *
 * 只列「长期稳定」的神经音色：微软会不定期下线旧音色，列表太长反而让用户选到
 * 已经不可用的名字。`value` 是直接塞进 SSML `<voice name>` 的完整音色名。
 */
export interface EdgeVoiceOption {
  /** SSML 音色名 */
  value: string
  /** 展示名 */
  label: string
  /** 性别/风格提示 */
  hint: string
}

/** 中文神经音色（大陆普通话为主，含少量方言与港台） */
export const EDGE_VOICES_ZH: EdgeVoiceOption[] = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓', hint: '女声 · 温暖亲和（默认）' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊', hint: '女声 · 活泼' },
  { value: 'zh-CN-YunxiNeural', label: '云希', hint: '男声 · 阳光' },
  { value: 'zh-CN-YunjianNeural', label: '云健', hint: '男声 · 沉稳' },
  { value: 'zh-CN-YunyangNeural', label: '云扬', hint: '男声 · 新闻播报' },
  { value: 'zh-CN-YunxiaNeural', label: '云夏', hint: '男童声' },
  { value: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北', hint: '女声 · 东北话' },
  { value: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮', hint: '女声 · 陕西话' },
  { value: 'zh-HK-HiuMaanNeural', label: '曉曼', hint: '女声 · 粤语' },
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻', hint: '女声 · 台湾国语' },
]

/** 英文神经音色（双语家庭 / 英文界面时可用） */
export const EDGE_VOICES_EN: EdgeVoiceOption[] = [
  { value: 'en-US-AriaNeural', label: 'Aria', hint: 'Female · US' },
  { value: 'en-US-GuyNeural', label: 'Guy', hint: 'Male · US' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia', hint: 'Female · UK' },
]

/** 全部音色（下拉框按分组渲染用） */
export const EDGE_VOICES: EdgeVoiceOption[] = [...EDGE_VOICES_ZH, ...EDGE_VOICES_EN]

/** OpenAI 兼容引擎的常用音色 */
export const OPENAI_VOICES: EdgeVoiceOption[] = [
  { value: 'alloy', label: 'alloy', hint: '中性' },
  { value: 'echo', label: 'echo', hint: '男声' },
  { value: 'fable', label: 'fable', hint: '英式' },
  { value: 'onyx', label: 'onyx', hint: '低沉男声' },
  { value: 'nova', label: 'nova', hint: '明亮女声' },
  { value: 'shimmer', label: 'shimmer', hint: '柔和女声' },
]

/** 按引擎取音色清单 */
export function voicesForEngine(engine: string | undefined): EdgeVoiceOption[] {
  return engine === 'openai' ? OPENAI_VOICES : EDGE_VOICES
}

/** 当前音色不在清单里时（例如手填了自定义音色）补一个选项，避免下拉框显示空白 */
export function withCurrentVoice(list: EdgeVoiceOption[], current: string): EdgeVoiceOption[] {
  const name = String(current || '').trim()
  if (!name || list.some((item) => item.value === name)) return list
  return [{ value: name, label: name, hint: '自定义' }, ...list]
}
