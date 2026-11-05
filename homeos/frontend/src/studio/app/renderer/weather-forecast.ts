/**
 * 天气预报弹窗（0.8.4）。
 *
 * 上游把「实体当前状态」与「预报数据」分成两条来源：弹窗骨架立刻用实体属性渲染，
 * 预报数据按 `daily` / `hourly` / `twice_daily` 三种类型按需拉取并缓存。
 * 后端 `/api/v1/ha/weather/forecast` 会按类型做上限裁剪，这里只负责缓存与竞态取消。
 */
import { meteoconUrl, weatherVisual } from './controls/weather-chart-runtime'
import { withRequestTimeout } from '@app/shared/util/request-timeout'

export const FORECAST_TYPE_LABELS: Record<string, string> = {
  daily: '日预报',
  hourly: '逐小时',
  twice_daily: '昼夜预报',
}

const isFiniteNumber = (candidate: any): candidate is number =>
  typeof candidate === 'number' && Number.isFinite(candidate)

const formatTemperature = (temperatureValue: any) =>
  isFiniteNumber(temperatureValue)
    ? temperatureValue.toLocaleString('zh-CN', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })
    : '—'

/** 给开了 `forecastEnabled` 的天气控件补一个点击弹窗动作；已有 tap 动作则不覆盖。 */
export function weatherActionComponent(weatherComponent: any) {
  return weatherComponent?.type !== 'weather' ||
    weatherComponent.properties?.forecastEnabled !== true ||
    !/^weather\.[a-z0-9_]+$/.test(weatherComponent.bindings?.entity?.entityId || '') ||
    Object.hasOwn(weatherComponent.actions || {}, 'tap')
    ? weatherComponent
    : {
        ...weatherComponent,
        actions: {
          ...(weatherComponent.actions || {}),
          tap: { type: 'more-info', data: { popupSource: 'current' } },
        },
      }
}

/** 弹窗主题跟随页面里最大的 interaction3d 控件；找不到就回到默认主题。 */
export function weatherSceneStyle(sceneDocument: any, page: any) {
  const sharedById = new Map((sceneDocument?.sharedComponents || []).map((shared: any) => [shared.id, shared])),
    flattenVisible = (componentList: any[] | undefined): any[] =>
      (componentList || []).flatMap((componentEntry: any) =>
        componentEntry.style?.visible === false ? [] : [componentEntry, ...flattenVisible(componentEntry.children)],
      ),
    biggestScene = (componentList: any[] | undefined) =>
      flattenVisible(componentList)
        .filter((componentEntry: any) => componentEntry.type === 'interaction3d')
        .sort(
          (leftEntry: any, rightEntry: any) =>
            +(rightEntry.properties?.layoutMode === 'fill') - +(leftEntry.properties?.layoutMode === 'fill') ||
            Number(rightEntry.position?.width || 0) * Number(rightEntry.position?.height || 0) -
              Number(leftEntry.position?.width || 0) * Number(leftEntry.position?.height || 0),
        )[0],
    pageComponents = [
      ...(page?.components || []),
      ...(page?.sharedComponentIds || []).map((sharedId: any) => sharedById.get(sharedId)).filter(Boolean),
    ]
  return (
    biggestScene(pageComponents) ||
    biggestScene([
      ...(sceneDocument?.sharedComponents || []),
      ...(sceneDocument?.pages || []).flatMap((scenePage: any) => scenePage.components || []),
    ])
  )?.properties?.sceneStyle === 'warm-wood'
    ? 'warm-wood'
    : 'default'
}

export interface WeatherForecastResponse {
  entityId: string
  type?: 'daily' | 'hourly' | 'twice_daily' | string
  status?: 'ok' | 'unsupported' | 'unavailable' | string
  supportedTypes?: string[]
  forecast?: any[]
  today?: string
  temperatureUnit?: string
  windSpeedUnit?: string
  precipitationUnit?: string
  city?: string
  condition?: string
  temperature?: number
  hint?: string
  summary?: string
  attribution?: string
  updatedAt?: string
  [key: string]: any
}

export async function requestWeatherForecast(
  entityId: string,
  forecastType: string,
  signal?: AbortSignal,
): Promise<WeatherForecastResponse> {
  return withRequestTimeout(
    12000,
    async (timeoutSignal: AbortSignal) => {
      const response = await fetch(
        '/api/v1/ha/weather/forecast?' + new URLSearchParams({ entityId, type: forecastType }),
        { signal: timeoutSignal, cache: 'no-store' },
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(typeof payload?.detail === 'string' ? payload.detail : '天气预报读取失败。')
      return payload as WeatherForecastResponse
    },
    signal,
  )
}

export type WeatherForecastFetch = typeof requestWeatherForecast

export class WeatherForecastSession {
  entityId: string
  publish: (state: any) => void
  fetchForecast: WeatherForecastFetch
  cache = new Map<string, WeatherForecastResponse>()
  generation = 0
  disposed = false
  request: AbortController | null = null

  constructor(entityId: string, publish: (state: any) => void, fetchForecast = requestWeatherForecast) {
    ;(this.entityId = entityId), (this.publish = publish), (this.fetchForecast = fetchForecast)
  }

  cancel() {
    this.generation++, this.request?.abort(), (this.request = null)
  }

  async load(forecastType = 'auto', force = false) {
    if (this.disposed) return
    this.cancel()
    const requestGeneration = this.generation
    if (!force && this.cache.has(forecastType)) {
      this.publish({ status: 'loaded', data: this.cache.get(forecastType) })
      return
    }
    const requestController = new AbortController()
    ;(this.request = requestController), this.publish({ status: 'loading', type: forecastType })
    try {
      const forecastData = await this.fetchForecast(this.entityId, forecastType, requestController.signal)
      if (this.disposed || requestGeneration !== this.generation) return
      if (
        forecastData.entityId !== this.entityId ||
        !Array.isArray(forecastData.forecast) ||
        !Array.isArray(forecastData.supportedTypes)
      )
        throw new Error('天气预报数据格式无效。')
      forecastData.status === 'ok' &&
        (this.cache.set(forecastType, forecastData),
        forecastData.type && this.cache.set(forecastData.type, forecastData)),
        this.publish({ status: 'loaded', data: forecastData })
    } catch (requestError: any) {
      if (!this.disposed && requestGeneration === this.generation && !requestController.signal.aborted)
        this.publish({
          status: 'error',
          message:
            requestError?.name === 'TimeoutError'
              ? '预报读取超时，请重试。'
              : requestError.message || '预报读取失败，请重试。',
        })
    } finally {
      requestGeneration === this.generation && (this.request = null)
    }
  }

  dispose() {
    ;(this.disposed = true), this.cancel(), this.cache.clear()
  }
}

/** 拆 `2026-11-03T08:00:00+08:00` 这类时间串；不依赖时区解析，只取字面量。 */
function splitForecastDateTime(datetimeValue: any) {
  const matchResult = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(datetimeValue || '')
  return matchResult ? { date: matchResult[1], time: matchResult[2] } : { date: '', time: '' }
}

export function forecastDayLabel(datetimeValue: any, todayValue: any) {
  const forecastDate = splitForecastDateTime(datetimeValue).date,
    todayDate = splitForecastDateTime(todayValue).date,
    dayOffset = (Date.parse(forecastDate + 'T12:00:00Z') - Date.parse(todayDate + 'T12:00:00Z')) / 86400000
  return dayOffset === 0
    ? '今天'
    : dayOffset === 1
      ? '明天'
      : Number.isFinite(Date.parse(forecastDate + 'T12:00:00Z'))
        ? new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(
            new Date(forecastDate + 'T12:00:00Z'),
          )
        : '—'
}

export function createWeatherForecast({
  component: weatherComponent,
  state: weatherState,
  sceneStyle = 'default',
  fetchForecast,
  document: forecastDocument = document,
}: any) {
  const forecastEntityId = weatherComponent.bindings.entity.entityId,
    createForecastElement = (tagName: string, className = '', textContent = '') => {
      const element = forecastDocument.createElement(tagName)
      return ((element.className = className), (element.textContent = textContent), element)
    },
    createWeatherIcon = (conditionValue: any, skyconValue = '', isDaytime?: any) => {
      const isNightMode = typeof isDaytime === 'boolean' ? !isDaytime : /NIGHT/.test(skyconValue),
        [iconSlug, iconLabel] = weatherVisual(conditionValue, isNightMode ? 'below_horizon' : ''),
        iconElement = createForecastElement('img', 'hb-weather-forecast-icon')
      return (
        (iconElement.src = meteoconUrl(iconSlug)),
        (iconElement.alt = iconLabel),
        (iconElement.draggable = false),
        iconElement
      )
    },
    forecastDialog = createForecastElement('dialog', 'hb-entity-details-dialog weather-details')
  ;(forecastDialog.dataset.weatherTheme = sceneStyle), forecastDialog.setAttribute('aria-label', '天气预报')
  const forecastCard = createForecastElement('div', 'hb-weather-forecast-card')
  forecastCard.addEventListener('click', (clickEvent: any) => clickEvent.stopPropagation())
  const forecastHeading = createForecastElement('header', 'hb-weather-forecast-heading'),
    forecastHeadingBox = createForecastElement('div'),
    forecastHeadingTitle = createForecastElement('strong', '', '天气预报'),
    forecastHeadingSubtitle = createForecastElement('span')
  forecastHeadingBox.append(forecastHeadingTitle, forecastHeadingSubtitle)
  const forecastCurrent = createForecastElement('div', 'hb-weather-forecast-current'),
    forecastCurrentTemperature = createForecastElement('strong')
  forecastHeading.append(forecastHeadingBox, forecastCurrent)
  const forecastHint = createForecastElement('p', 'hb-weather-forecast-hint'),
    forecastToolbar = createForecastElement('div', 'hb-weather-forecast-toolbar'),
    forecastTabs = createForecastElement('div', 'hb-weather-forecast-tabs'),
    forecastNote = createForecastElement('span')
  forecastTabs.setAttribute('role', 'tablist'),
    forecastTabs.setAttribute('aria-label', '预报类型'),
    forecastToolbar.append(forecastTabs, forecastNote)
  const forecastBody = createForecastElement('section', 'hb-weather-forecast-body')
  forecastBody.setAttribute('aria-live', 'polite')
  const forecastFeedback = createForecastElement('div', 'hb-weather-forecast-feedback'),
    forecastFeedbackText = createForecastElement('p'),
    forecastRetryButton = createForecastElement('button', '', '重试')
  ;(forecastRetryButton.type = 'button'), forecastFeedback.append(forecastFeedbackText, forecastRetryButton)
  const forecastFooter = createForecastElement('footer', 'hb-weather-forecast-footer'),
    forecastFooterNote = createForecastElement('span'),
    forecastPager = createForecastElement('div'),
    forecastPreviousButton = createForecastElement('button', '', '‹'),
    forecastPageLabel = createForecastElement('span'),
    forecastNextButton = createForecastElement('button', '', '›')
  ;(forecastPreviousButton.type = forecastNextButton.type = 'button'),
    forecastPreviousButton.setAttribute('aria-label', '上一组预报'),
    forecastNextButton.setAttribute('aria-label', '下一组预报'),
    forecastPager.append(forecastPreviousButton, forecastPageLabel, forecastNextButton),
    forecastFooter.append(forecastFooterNote, forecastPager),
    forecastCard.append(forecastHeading, forecastHint, forecastToolbar, forecastBody, forecastFeedback, forecastFooter),
    forecastDialog.append(forecastCard)
  let forecastData: WeatherForecastResponse | null = null,
    activeForecastType = 'auto',
    forecastPageOffset = 0,
    activeHourIndex = 0,
    isDisposed = false,
    currentState: any = null,
    lastSupportedFeatures: any = null,
    lastEntityAvailable = true
  const forecastSession = new WeatherForecastSession(
    forecastEntityId,
    (sessionState: any) => {
      if (sessionState.status === 'loading') {
        ;(activeForecastType = sessionState.type),
          (forecastBody.hidden = true),
          (forecastFeedback.hidden = false),
          (forecastFeedbackText.textContent = '正在读取天气预报…'),
          (forecastRetryButton.hidden = true),
          (forecastNote.textContent = ''),
          (forecastPager.hidden = true)
      } else if (sessionState.status === 'error') {
        ;(forecastBody.hidden = true),
          (forecastFeedback.hidden = false),
          (forecastFeedbackText.textContent = sessionState.message),
          (forecastRetryButton.hidden = false),
          (forecastPager.hidden = true)
      } else {
        ;(forecastData = sessionState.data as WeatherForecastResponse),
          (activeForecastType = forecastData.type || 'auto'),
          (forecastPageOffset = activeHourIndex = 0),
          renderForecastCurrent(forecastData),
          renderForecastTabs(),
          renderForecastBody()
      }
    },
    fetchForecast,
  )

  function renderForecastCurrent(fallbackData: WeatherForecastResponse | null = null) {
    const stateValue = currentState?.newState || currentState || {},
      stateAttributes = stateValue.attributes || {},
      conditionLabel = weatherVisual(stateValue.state || fallbackData?.condition)[1]
    forecastHeadingSubtitle.textContent =
      (stateAttributes.friendly_name || fallbackData?.city || forecastEntityId) +
      ' · ' +
      weatherVisual(stateValue.state || fallbackData?.condition)[1]
    forecastCurrentTemperature.textContent =
      '' +
      formatTemperature(stateAttributes.temperature ?? fallbackData?.temperature) +
      (stateAttributes.temperature_unit || fallbackData?.temperatureUnit || '°C')
    forecastCurrent.replaceChildren(
      createWeatherIcon(stateValue.state || fallbackData?.condition, stateAttributes.skycon || ''),
      forecastCurrentTemperature,
    )
    ;(forecastHint.textContent =
      stateAttributes.forecast_keypoint ||
      stateAttributes.forecast_minutely ||
      fallbackData?.hint ||
      fallbackData?.summary ||
      ''),
      (forecastHint.hidden = !forecastHint.textContent)
    const updatedAtValue = fallbackData?.updatedAt || stateValue.updatedAt,
      updatedTimeText =
        updatedAtValue && Number.isFinite(Date.parse(updatedAtValue))
          ? new Date(updatedAtValue).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
      attributionText = fallbackData?.attribution || stateAttributes.attribution || ''
    forecastFooterNote.textContent =
      '' +
      (/colorfulclouds/i.test(attributionText) ? '彩云天气' : 'Home Assistant') +
      (updatedTimeText ? ' · ' + updatedTimeText + ' 更新' : '') +
      (conditionLabel ? '' : '')
  }

  function renderForecastTabs() {
    const supportedTypes = (forecastData?.supportedTypes || []).filter(
      (typeName: any) => FORECAST_TYPE_LABELS[typeName],
    )
    forecastToolbar.hidden = supportedTypes.length === 0
    if (forecastTabs.dataset.types === supportedTypes.join(',')) {
      for (const tabElement of forecastTabs.children)
        tabElement.setAttribute(
          'aria-selected',
          String((tabElement as HTMLElement).dataset.type === activeForecastType),
        )
      return
    }
    ;(forecastTabs.dataset.types = supportedTypes.join(',')), forecastTabs.replaceChildren()
    for (const typeName of supportedTypes) {
      if (!FORECAST_TYPE_LABELS[typeName]) continue
      const tabElement = createForecastElement(
        'button',
        '',
        typeName === 'daily'
          ? (forecastData!.type === 'daily' && forecastData!.forecast!.length
              ? String(forecastData!.forecast!.length)
              : '') + '日预报'
          : FORECAST_TYPE_LABELS[typeName],
      )
      ;(tabElement.type = 'button'),
        tabElement.setAttribute('role', 'tab'),
        tabElement.setAttribute('aria-selected', String(typeName === activeForecastType)),
        (tabElement.dataset.type = typeName),
        tabElement.addEventListener('click', () => {
          typeName !== activeForecastType && forecastSession.load(typeName)
        }),
        forecastTabs.append(tabElement)
    }
    forecastToolbar.hidden = forecastTabs.childElementCount === 0
  }

  function detailText(detailEntry: any) {
    const detailParts: string[] = []
    return (
      isFiniteNumber(detailEntry.precipitation) &&
        detailParts.push('降水 ' + detailEntry.precipitation + forecastData!.precipitationUnit),
      isFiniteNumber(detailEntry.precipitation_probability) &&
        detailParts.push('降水概率 ' + detailEntry.precipitation_probability + '%'),
      isFiniteNumber(detailEntry.wind_speed) &&
        detailParts.push('风速 ' + detailEntry.wind_speed + forecastData!.windSpeedUnit),
      detailParts.join(' · ')
    )
  }

  function renderForecastBody() {
    if (isDisposed) return
    if (
      (forecastBody.replaceChildren(),
      (forecastBody.hidden = forecastData?.status !== 'ok'),
      (forecastFeedback.hidden = forecastData?.status === 'ok'),
      (forecastRetryButton.hidden = forecastData?.status === 'unsupported'),
      forecastData?.status !== 'ok')
    ) {
      ;(forecastFeedbackText.textContent =
        forecastData?.status === 'unsupported'
          ? '该天气实体暂未提供此类预报。'
          : forecastData?.status === 'unavailable'
            ? '天气实体当前不可用，请稍后重试。'
            : '暂时没有预报数据。'),
        (forecastPager.hidden = true)
      return
    }
    forecastFeedback.hidden = true
    const isHourly = activeForecastType === 'hourly',
      pageSize = isHourly ? 6 : 5,
      forecastEntries = forecastData.forecast!,
      pageEntries = forecastEntries.slice(forecastPageOffset, forecastPageOffset + pageSize)
    ;(forecastNote.textContent = isHourly ? '小时气温趋势' : '最低 / 最高气温 ' + forecastData.temperatureUnit),
      (forecastPreviousButton.disabled = forecastPageOffset === 0),
      (forecastNextButton.disabled = forecastPageOffset + pageSize >= forecastEntries.length),
      (forecastPager.hidden = forecastEntries.length <= pageSize),
      (forecastPageLabel.textContent = isHourly
        ? splitForecastDateTime(pageEntries[0]?.datetime).time +
          ' — ' +
          splitForecastDateTime(pageEntries.at(-1)?.datetime).time
        : forecastPageOffset + 1 + ' — ' + Math.min(forecastPageOffset + pageSize, forecastEntries.length))
    if (isHourly) {
      renderForecastHours(pageEntries)
      return
    }
    const forecastDays = createForecastElement('div', 'hb-weather-forecast-days'),
      allTemperatures = forecastEntries
        .flatMap((forecastEntry: any) => [forecastEntry.temperature, forecastEntry.templow])
        .filter(isFiniteNumber),
      temperatureFloor = Math.min(...allTemperatures) - 1,
      temperatureCeiling = Math.max(...allTemperatures) + 1
    for (const dayEntry of pageEntries) {
      const dayCard = createForecastElement('article', 'hb-weather-forecast-day'),
        dayDate = createForecastElement('div', 'hb-weather-forecast-date'),
        dayLabel = forecastDayLabel(dayEntry.datetime, forecastData.today || forecastEntries[0]?.datetime)
      dayDate.append(
        createForecastElement(
          'strong',
          '',
          '' +
            dayLabel +
            (activeForecastType === 'twice_daily' ? (dayEntry.is_daytime === false ? '夜间' : '白天') : ''),
        ),
        createForecastElement('small', '', splitForecastDateTime(dayEntry.datetime).date.slice(5).replace('-', '/')),
      )
      const conditionBox = createForecastElement('div', 'hb-weather-forecast-condition')
      conditionBox.append(
        createWeatherIcon(dayEntry.condition, dayEntry.skycon, dayEntry.is_daytime),
        createForecastElement('span', '', weatherVisual(dayEntry.condition)[1]),
      )
      const temperatureBox = createForecastElement('div', 'hb-weather-forecast-temperatures'),
        temperatureRange = createForecastElement('span', 'hb-weather-forecast-range'),
        temperatureRangeFill = createForecastElement('i')
      isFiniteNumber(dayEntry.templow) &&
        isFiniteNumber(dayEntry.temperature) &&
        temperatureCeiling > temperatureFloor &&
        ((temperatureRangeFill.style.left =
          Math.max(0, ((dayEntry.templow - temperatureFloor) / (temperatureCeiling - temperatureFloor)) * 100) + '%'),
        (temperatureRangeFill.style.width =
          Math.max(0, ((dayEntry.temperature - dayEntry.templow) / (temperatureCeiling - temperatureFloor)) * 100) +
          '%')),
        temperatureRange.append(temperatureRangeFill),
        (temperatureRange.hidden = !isFiniteNumber(dayEntry.templow) || !isFiniteNumber(dayEntry.temperature)),
        temperatureBox.append(
          createForecastElement(
            'span',
            'hb-weather-forecast-low',
            isFiniteNumber(dayEntry.templow) ? formatTemperature(dayEntry.templow) + '°' : '—',
          ),
          temperatureRange,
          createForecastElement(
            'span',
            '',
            isFiniteNumber(dayEntry.temperature) ? formatTemperature(dayEntry.temperature) + '°' : '—',
          ),
        ),
        dayCard.append(
          dayDate,
          conditionBox,
          temperatureBox,
          createForecastElement(
            'span',
            'hb-weather-forecast-rain',
            isFiniteNumber(dayEntry.precipitation)
              ? dayEntry.precipitation + ' ' + (forecastData as any).precipitationUnit
              : '—',
          ),
        ),
        dayCard.setAttribute(
          'aria-label',
          dayLabel +
            '，' +
            conditionBox.textContent +
            '，' +
            (isFiniteNumber(dayEntry.templow) ? '最低' + formatTemperature(dayEntry.templow) + '度，' : '') +
            (isFiniteNumber(dayEntry.temperature) ? '最高' + formatTemperature(dayEntry.temperature) + '度，' : '') +
            detailText(dayEntry),
        ),
        forecastDays.append(dayCard)
    }
    forecastBody.append(forecastDays)
    renderForecastTabs()
  }

  function renderForecastHours(hourEntries: any[]) {
    const hoursSection = createForecastElement('div', 'hb-weather-forecast-hours'),
      plotBox = createForecastElement('div', 'hb-weather-forecast-plot'),
      chartSvg = forecastDocument.createElementNS('http://www.w3.org/2000/svg', 'svg')
    chartSvg.setAttribute('viewBox', '0 0 660 180'),
      chartSvg.setAttribute('role', 'img'),
      chartSvg.setAttribute('aria-label', '逐小时温度趋势')
    const chartTemperatures = hourEntries.map((hourEntry: any) => hourEntry.temperature).filter(isFiniteNumber),
      chartFloor = Math.min(...chartTemperatures) - 1,
      chartCeiling = Math.max(...chartTemperatures) + 1,
      createSvgElement = (tagName: string, attributes: Record<string, any>) => {
        const element = forecastDocument.createElementNS('http://www.w3.org/2000/svg', tagName)
        for (const [attributeName, attributeValue] of Object.entries(attributes))
          element.setAttribute(attributeName, attributeValue)
        return element
      },
      chartPoints = hourEntries.map((hourEntry: any, hourIndex: number) => ({
        x: 28 + (hourIndex * 604) / Math.max(1, hourEntries.length - 1),
        y: isFiniteNumber(hourEntry.temperature)
          ? 30 + ((chartCeiling - hourEntry.temperature) / (chartCeiling - chartFloor)) * 120
          : null,
      }))
    let chartPath = '',
      isPathOpen = false
    for (const chartPoint of chartPoints) {
      if (chartPoint.y === null) {
        isPathOpen = false
        continue
      }
      chartPath += '' + (isPathOpen ? 'L' : 'M') + chartPoint.x + ' ' + chartPoint.y + ' '
      isPathOpen = true
    }
    chartSvg.append(
      createSvgElement('path', {
        d: chartPath,
        fill: 'none',
        stroke: 'var(--wf-chart)',
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }),
    )
    const hourLabels = createForecastElement('div', 'hb-weather-forecast-hour-labels')
    hourEntries.forEach((hourEntry: any, hourIndex: number) => {
      const hourPoint = chartPoints[hourIndex]
      if (hourPoint.y !== null) {
        chartSvg.append(
          createSvgElement('circle', {
            cx: hourPoint.x,
            cy: hourPoint.y,
            r: activeHourIndex === hourIndex ? 5 : 3,
            fill: 'var(--wf-chart)',
          }),
        )
        const temperatureLabel = createSvgElement('text', {
          x: hourPoint.x,
          y: hourPoint.y - 15,
          'text-anchor': 'middle',
        })
        ;(temperatureLabel.textContent = formatTemperature(hourEntry.temperature) + '°'),
          chartSvg.append(temperatureLabel)
      }
      const hourButton = createForecastElement('button')
      ;(hourButton.type = 'button'),
        hourButton.setAttribute('aria-pressed', String(activeHourIndex === hourIndex)),
        hourButton.append(
          createWeatherIcon(hourEntry.condition, hourEntry.skycon, hourEntry.is_daytime),
          createForecastElement('span', '', splitForecastDateTime(hourEntry.datetime).time),
        ),
        hourButton.addEventListener('click', () => {
          ;(activeHourIndex = hourIndex),
            renderForecastBody(),
            forecastBody
              .querySelectorAll('.hb-weather-forecast-hour-labels button')
              [hourIndex]?.focus({ preventScroll: true })
        }),
        hourLabels.append(hourButton)
    })
    const activeHourEntry = hourEntries[activeHourIndex] || hourEntries[0]
    plotBox.append(chartSvg),
      hoursSection.append(
        createForecastElement(
          'p',
          'hb-weather-forecast-hour-heading',
          forecastDayLabel(activeHourEntry.datetime, forecastData!.today || forecastData!.forecast![0]?.datetime) +
            ' ' +
            splitForecastDateTime(activeHourEntry.datetime).time,
        ),
        plotBox,
        hourLabels,
        createForecastElement('p', 'hb-weather-forecast-hour-detail', detailText(activeHourEntry)),
      ),
      forecastBody.append(hoursSection)
  }

  function syncForecastState(nextState: any) {
    if (((currentState = nextState?.newState || nextState), !currentState)) return
    const isEntityAvailable =
        currentState.available !== false && !['unknown', 'unavailable', ''].includes(currentState.state),
      supportedFeatures = currentState.attributes?.supported_features
    !isEntityAvailable || (lastSupportedFeatures !== null && supportedFeatures !== lastSupportedFeatures)
      ? (forecastSession.cancel(),
        forecastSession.cache.clear(),
        (forecastData = null),
        (forecastBody.hidden = true),
        (forecastFeedback.hidden = false),
        (forecastToolbar.hidden = false),
        (forecastPager.hidden = true),
        (forecastFeedbackText.textContent = isEntityAvailable
          ? '天气预报能力已改变，请重新读取。'
          : '天气实体当前不可用，请稍后重试。'),
        (forecastRetryButton.hidden = false))
      : !lastEntityAvailable &&
        ((forecastFeedbackText.textContent = '天气已恢复，点击重试读取预报。'), (forecastRetryButton.hidden = false))
    ;(lastSupportedFeatures = supportedFeatures ?? null), (lastEntityAvailable = isEntityAvailable)
    renderForecastCurrent(forecastData)
  }

  return (
    forecastRetryButton.addEventListener('click', () => void forecastSession.load('auto', true)),
    forecastPreviousButton.addEventListener('click', () => {
      ;(forecastPageOffset = Math.max(0, forecastPageOffset - (activeForecastType === 'hourly' ? 6 : 5))),
        (activeHourIndex = 0),
        renderForecastBody()
    }),
    forecastNextButton.addEventListener('click', () => {
      ;(forecastPageOffset += activeForecastType === 'hourly' ? 6 : 5), (activeHourIndex = 0), renderForecastBody()
    }),
    syncForecastState(weatherState),
    (forecastToolbar.hidden = true),
    (forecastPager.hidden = true),
    {
      dialog: forecastDialog,
      card: forecastCard,
      load: () => forecastSession.load(),
      syncState: syncForecastState,
      dispose() {
        ;(isDisposed = true), forecastSession.dispose()
      },
    }
  )
}
