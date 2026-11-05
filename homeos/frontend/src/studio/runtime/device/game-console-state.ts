/**
 * 游戏机（Switch / PlayStation）状态与指令（0.8.4 `game-console-state`）。
 *
 * 两类主机在 HA 里的形态完全不同：
 * - `playstation`：`media_player.*`，靠 `state` + `supported_features` 位图；
 * - `switch-console`：`sensor.*`，靠 `Status` / `Game Name` / `Game Image URL` 等属性。
 *
 * 这里把两者归一成同一份视图（`mode` / `title` / `artwork` / `avatar` / `hours` / `sources`），
 * 面板只管照着渲染，不再关心底层差异。
 */

import { televisionArtwork } from '../../runtime/television/television-state'

/** 支持主机控制面板的设备类型。 */
export const GAME_CONSOLE_KINDS = Object.freeze(['switch-console', 'playstation'])

export function isGameConsoleKind(deviceKind: any): boolean {
  return GAME_CONSOLE_KINDS.includes(deviceKind)
}

/** HA 的哨兵值（`unknown` / `unavailable` …）一律当空串，避免渲染出「unknown」。 */
const readText = (value: any) =>
    typeof value === 'string' && !['', 'unknown', 'unavailable', 'none', 'null'].includes(value.trim().toLowerCase())
      ? value.trim()
      : '',
  /** 读主实体状态：`states` 既可能是 Map，也可能是普通对象。 */
  readMainState = (gameConfig: any, stateSource: any) => {
    const stateEntry = stateSource?.get
      ? stateSource.get(gameConfig.mainEntityId)
      : stateSource?.[gameConfig.mainEntityId]
    return stateEntry?.newState || stateEntry || {}
  }

/** FNV-1a 32 位：给图片 URL 加内容指纹，状态变了才换 URL（浏览器缓存才不会命中旧图）。 */
function contentHash(payload: any) {
  const serialized = JSON.stringify(payload)
  let hash = 0x811c9dc5
  for (let characterIndex = 0; characterIndex < serialized.length; characterIndex += 1)
    hash = Math.imul(hash ^ serialized.charCodeAt(characterIndex), 0x01000193)
  return (hash >>> 0).toString(36)
}

const gameImageUrl = (entityId: any, role: any, versionSeed: any) =>
  '/api/v1/modules/interaction3d/game-image/' +
  encodeURIComponent(entityId) +
  '/' +
  role +
  '?v=' +
  contentHash(versionSeed)

/** PlayStation 的 `state` → 归一后的 `mode`。 */
const PLAYSTATION_MODES: Record<string, string> = {
  off: 'offline',
  standby: 'offline',
  on: 'online',
  idle: 'online',
  playing: 'running',
  paused: 'running',
  buffering: 'running',
}

/** 归一后的 `mode` → 状态文案。 */
const MODE_LABELS: Record<string, string> = {
  offline: '离线',
  online: '在线',
  running: '运行中',
}

/** 归一后的 `mode` → 状态点颜色。 */
const MODE_COLORS: Record<string, string> = {
  offline: '#89929b',
  online: '#5ca9f4',
  running: '#43ce82',
  unknown: '#89929b',
}

/**
 * 生成游戏机视图。
 *
 * @param gameConfig 舞台上的设备项（`deviceKind` / `mainEntityId`）
 * @param stateSource HA 实体状态（Map 或普通对象）
 */
export function gameConsoleState(gameConfig: any, stateSource: any = {}) {
  const deviceKind = gameConfig.deviceKind,
    mainState = readMainState(gameConfig, stateSource),
    stateAttributes = mainState.attributes || {},
    entityStateCode = String(mainState.state || '').trim(),
    hasMainEntity = !!gameConfig.mainEntityId,
    isAvailable =
      hasMainEntity &&
      mainState.available !== false &&
      !['', 'unknown', 'unavailable'].includes(entityStateCode.toLowerCase())
  let mode = 'unknown',
    title = '',
    artwork = '',
    avatar = '',
    account = '',
    platform = '',
    hours: number | null = null
  if (deviceKind === 'playstation') {
    isAvailable && (mode = PLAYSTATION_MODES[entityStateCode.toLowerCase()] || 'unknown'),
      mode === 'running' &&
        ((title = readText(stateAttributes.media_title) || readText(stateAttributes.source)),
        (artwork = televisionArtwork(stateAttributes)),
        artwork &&
          (artwork +=
            (artwork.includes('?') ? '&' : '?') +
            'hb_game=' +
            contentHash([stateAttributes.media_content_id, title, stateAttributes.source]))),
      (platform = 'PlayStation')
  } else if (deviceKind === 'switch-console') {
    const upperState = entityStateCode.toUpperCase(),
      gameName = readText(stateAttributes['Game Name'])
    isAvailable &&
      (mode =
        upperState === 'OFFLINE'
          ? 'offline'
          : upperState === 'INACTIVE'
            ? 'online'
            : upperState === 'PLAYING' || (upperState === 'ONLINE' && gameName)
              ? 'running'
              : upperState === 'ONLINE'
                ? 'online'
                : 'unknown'),
      (account = readText(stateAttributes['Account Name']) || readText(stateAttributes.Name)),
      (platform = readText(stateAttributes.Platform)),
      mode !== 'unknown' &&
        readText(stateAttributes.entity_picture) &&
        (avatar = gameImageUrl(gameConfig.mainEntityId, 'avatar', [stateAttributes.entity_picture])),
      mode === 'running' &&
        ((title = gameName),
        readText(stateAttributes['Game Image URL']) &&
          (artwork = gameImageUrl(gameConfig.mainEntityId, 'game', [stateAttributes['Game Image URL'], title])))
    const totalPlayTime = stateAttributes['Total Play Time']
    hours =
      (typeof totalPlayTime == 'number' || (typeof totalPlayTime == 'string' && totalPlayTime.trim())) &&
      Number.isFinite(Number(totalPlayTime)) &&
      Number(totalPlayTime) >= 0
        ? Number(totalPlayTime)
        : null
  }
  const isAvailableMode = isAvailable && mode !== 'unknown',
    isOn = isAvailableMode && mode !== 'offline',
    supportedFeatures =
      Number.isInteger(stateAttributes.supported_features) && stateAttributes.supported_features >= 0
        ? stateAttributes.supported_features
        : 0,
    sources: string[] = Array.isArray(stateAttributes.source_list)
      ? [...new Set<string>(stateAttributes.source_list.filter((sourceEntry: any) => readText(sourceEntry)))]
      : []
  return {
    kind: deviceKind,
    entityId: gameConfig.mainEntityId || '',
    state: entityStateCode,
    mode: mode,
    available: isAvailableMode,
    on: isOn,
    title: title,
    artwork: artwork,
    avatar: avatar,
    account: account,
    platform: platform,
    hours: hours,
    sources: sources,
    source: typeof stateAttributes.source == 'string' ? stateAttributes.source : '',
    features: supportedFeatures,
    contentType: readText(stateAttributes.media_content_type),
    // PlayStation 的 standby 在玩家眼里就是「关机」，Switch 没有这个态。
    label: hasMainEntity
      ? isAvailableMode
        ? mode === 'offline' && deviceKind === 'playstation'
          ? '休眠 / 关闭'
          : MODE_LABELS[mode]
        : '状态不可用'
      : '尚未选择主实体',
    color: MODE_COLORS[mode],
  }
}

/** 舞台图标用的指示灯视图。 */
export function gameConsoleIndicator(gameConfig: any, stateSource: any) {
  const consoleState = gameConsoleState(gameConfig, stateSource)
  return {
    ...consoleState,
    visible: !!gameConfig.mainEntityId && consoleState.available,
    status: consoleState.mode,
    steady: true,
  }
}

/**
 * 生成一条主机控制指令（`turn_on` / `turn_off` / `select_source`）。
 *
 * `enabled` 同时校验：类型是 PlayStation（只有它有 `supported_features`）、实体可用、
 * 对应位图位已打开、本次调用没有多余参数、以及「开关」方向与当前状态相反。
 */
export function gameConsoleCommand(
  gameConfig: any,
  stateSource: any,
  service: any,
  serviceData: Record<string, any> = {},
) {
  const consoleState = gameConsoleState(gameConfig, stateSource),
    featureBit = ({ turn_on: 0x80, turn_off: 0x100, select_source: 0x800 } as Record<string, number>)[service],
    hasValidData =
      service === 'select_source'
        ? serviceData && Object.keys(serviceData).length === 1 && consoleState.sources.includes(serviceData.source)
        : serviceData && Object.keys(serviceData).length === 0
  return {
    enabled:
      consoleState.kind === 'playstation' &&
      consoleState.available &&
      !!(featureBit && consoleState.features & featureBit) &&
      hasValidData &&
      (service === 'turn_on' ? !consoleState.on : consoleState.on),
    command: {
      entityId: gameConfig.mainEntityId,
      domain: 'media_player',
      service: service,
      data: serviceData,
      deviceKind: 'game-console',
    },
  }
}

/** 主实体类型校验：PS 必须是 `media_player.*`，Switch 必须是 `sensor.*`。 */
export function gameMainEntityAllowed(deviceKind: any, entityEntry: any): boolean {
  const entityId = entityEntry?.entityId || entityEntry?.entity_id || ''
  return deviceKind === 'playstation'
    ? entityId.startsWith('media_player.')
    : deviceKind === 'switch-console' && entityId.startsWith('sensor.')
}

/**
 * 从实体目录里挑默认主实体：唯一候选才自动选中，多个候选时留空让用户自己选。
 */
export function preferredGameMainEntity(deviceKind: any, entityEntries: any[] = []): string {
  const candidates = entityEntries.filter((entityEntry: any) => gameMainEntityAllowed(deviceKind, entityEntry)),
    preferred =
      deviceKind === 'playstation'
        ? candidates.filter((entityEntry: any) => entityEntry.platform === 'ps4')
        : candidates.filter(
            (entityEntry: any) =>
              Object.hasOwn(entityEntry.attributes || {}, 'Status') ||
              /^switch_profile_/.test(entityEntry.uniqueId || entityEntry.unique_id || ''),
          )
  return preferred.length === 1
    ? preferred[0].entityId
    : deviceKind === 'playstation' && candidates.length === 1
      ? candidates[0].entityId
      : ''
}
