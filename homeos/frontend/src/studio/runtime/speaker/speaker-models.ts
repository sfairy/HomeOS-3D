/** 音响造型（0.8.5 `speaker-models.js`）。设备种类仍是 speaker，模型类型有三种。 */
export const SPEAKER_MODELS = Object.freeze({
  speaker: Object.freeze({ label: '智能音响', height: 0.2336 }),
  soundbar: Object.freeze({ label: '长条音响', height: 0.08 }),
  'tower-speaker': Object.freeze({ label: '立式音响', height: 0.97 }),
})

export type SpeakerModelType = keyof typeof SPEAKER_MODELS

export const SPEAKER_MODEL_TYPES: readonly SpeakerModelType[] = Object.freeze(
  Object.keys(SPEAKER_MODELS) as SpeakerModelType[],
)

export function speakerModelProfile(modelType: string | undefined) {
  if (!modelType || !Object.hasOwn(SPEAKER_MODELS, modelType)) return undefined
  return SPEAKER_MODELS[modelType as SpeakerModelType]
}
