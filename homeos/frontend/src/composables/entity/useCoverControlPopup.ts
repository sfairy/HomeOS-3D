/**
 * 窗帘控制弹窗组合式函数：壳层状态 + 调用 cover-control-core。
 */
import { computed } from 'vue'
import {
  useEntityPopupBase,
  useEntityPopupHeader,
  type EntityPopupBaseProps,
} from '@/composables/entity/useEntityPopupBase'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import {
  coverHasPositionControl,
  coverIsMoving,
  coverPositionFromAttributes,
  coverActionErrorMessage,
} from '@/composables/entity/control/cover-control-core'

export function useCoverControlPopup(props: EntityPopupBaseProps) {
  const { liveEntity, entityRef, entityName, callService } = useEntityPopupBase(props)
  const { stateLabel } = useEntityPopupHeader(entityRef, {
    stateLabelDomain: 'cover',
  })

  const isMoving = computed(() => coverIsMoving(liveEntity.value?.state))

  const positionSource = computed(() =>
    coverPositionFromAttributes(liveEntity.value?.attributes as Record<string, unknown>),
  )

  const {
    localValue: positionLocal,
    rangeValue: positionRange,
    trackStyle: positionTrackStyle,
    onInput: onPositionInput,
    onChange: onPositionChange,
    commit: commitPosition,
  } = useSliderCommit(positionSource, {
    parse: (v: unknown) => parseInt(String(v), 10),
    onCommit: (pos: number) => setPosition(pos),
    track: () => ({
      min: 0,
      max: 100,
      step: 1,
      color: '#a78bfa',
      trackColor: 'rgba(255,255,255,0.1)',
    }),
  })

  const hasPositionControl = computed(() =>
    coverHasPositionControl(liveEntity.value?.attributes?.supported_features),
  )

  async function setPosition(pos: number) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService(
      'cover',
      'set_cover_position',
      entityId,
      { position: pos },
      '设置窗帘位置失败',
    )
  }

  async function handleAction(action: string) {
    const entityId = liveEntity.value?.entity_id
    if (!entityId) return
    await callService(
      'cover',
      action,
      entityId,
      undefined,
      coverActionErrorMessage(action),
    )
  }

  return {
    liveEntity,
    entityName,
    stateLabel,
    isMoving,
    positionLocal,
    positionRange,
    positionTrackStyle,
    onPositionInput,
    onPositionChange,
    commitPosition,
    hasPositionControl,
    handleAction,
  }
}
