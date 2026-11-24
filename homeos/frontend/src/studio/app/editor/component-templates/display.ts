/**
 * 控件模板定义 · display 组（6 个）。
 *
 * 从 `component-templates.ts` 拆出的纯数据分片：数组元素就是模板对象（`id / name /
 * scopes / create`），不含注册逻辑。注册点只有一处（`component-templates.ts` 遍历
 * 全部组），因此新增模板只需在这里加一项。
 */
import { EVENT_LOG_WALL_DOMAINS } from '../../renderer/controls/event-log-runtime'
import { timeComponentDimensions } from '../component-template-metrics'
import { dateComponentDimensions } from '../component-template-metrics'
import { weatherComponentDimensions } from '../component-template-metrics'

export const displayTemplates = [
  {
    id: 'time',
    name: '时间',
    type: 'time',
    description: '显示设备本地时间，不依赖 Home Assistant 实体。',
    scopes: ['shared'],
    create({ id: timeComponentId, instanceName: timeInstanceName = '时间', canvas: timeCanvas }: any) {
      const timeCanvasWidth = Number(timeCanvas?.width || 2778),
        timeCanvasHeight = Number(timeCanvas?.height || 1940),
        timeProperties = {
          instanceName: timeInstanceName,
          hour12: false,
          showSeconds: false,
          color: '#248eb2',
          fontSize: 96,
          fontWeight: 0.4,
          letterSpacing: 2.2,
          opacity: 1,
        },
        { width: timeComponentDimensions2, height: timeComponentDimensions3 } = timeComponentDimensions(timeProperties)
      return {
        id: timeComponentId,
        type: 'time',
        componentVersion: 1,
        position: {
          x: (timeCanvasWidth - timeComponentDimensions2) / 2,
          y: (timeCanvasHeight - timeComponentDimensions3) / 2,
          width: timeComponentDimensions2,
          height: timeComponentDimensions3,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: timeProperties,
        style: {
          scale: 1.8,
          visible: true,
        },
        actions: {} as Record<string, any>,
        children: [] as any[],
      }
    },
  },
  {
    id: 'date',
    name: '日期',
    type: 'date',
    description: '显示设备本地年月日、星期与农历。',
    scopes: ['shared'],
    create({ id: dateComponentId, instanceName: dateInstanceName = '日期', canvas: dateCanvas }: any) {
      const dateCanvasWidth = Number(dateCanvas?.width || 2778),
        dateCanvasHeight = Number(dateCanvas?.height || 1940),
        dateProperties = {
          instanceName: dateInstanceName,
          showWeekday: true,
          showLunar: false,
          primaryColor: '#8d9296',
          primarySize: 36,
          primaryWeight: 0.4,
          primarySpacing: 1,
          lunarColor: '#7f878c',
          lunarSize: 24,
          lunarWeight: 0.4,
          lunarSpacing: 1,
          lineGap: 8,
          opacity: 1,
        },
        { width: dateComponentDimensions2, height: dateComponentDimensions3 } = dateComponentDimensions(dateProperties)
      return {
        id: dateComponentId,
        type: 'date',
        componentVersion: 1,
        position: {
          x: (dateCanvasWidth - dateComponentDimensions2) / 2,
          y: (dateCanvasHeight - dateComponentDimensions3) / 2,
          width: dateComponentDimensions2,
          height: dateComponentDimensions3,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: dateProperties,
        style: {
          scale: 2,
          visible: true,
        },
        actions: {} as Record<string, any>,
        children: [] as any[],
      }
    },
  },
  {
    id: 'weather',
    name: '天气',
    type: 'weather',
    description: '显示彩云天气当前状态、温度和湿度。',
    scopes: ['shared'],
    create({
      id: weatherComponentId,
      instanceName: weatherInstanceName = '天气',
      canvas: weatherCanvas,
      weatherEntityId: weatherEntityId = '',
      sunEntityId: sunEntityId = '',
    }: any) {
      const weatherCanvasWidth = Number(weatherCanvas?.width || 2778),
        weatherCanvasHeight = Number(weatherCanvas?.height || 1940),
        weatherProperties = {
          instanceName: weatherInstanceName,
          forecastEnabled: false,
          iconVisible: true,
          temperatureVisible: true,
          conditionVisible: true,
          humidityVisible: true,
          iconSize: 64,
          iconGap: 22,
          temperatureColor: '#aeb3b7',
          temperatureSize: 32,
          temperatureWeight: 0.4,
          temperatureSpacing: 1,
          secondaryColor: '#8d9296',
          secondarySize: 18,
          secondaryWeight: 0.4,
          secondarySpacing: 1,
          lineGap: 7,
          opacity: 1,
        },
        { width: weatherComponentDimensions2, height: weatherComponentDimensions3 } =
          weatherComponentDimensions(weatherProperties),
        weatherBindings: Record<string, unknown> = {}
      return (
        weatherEntityId &&
          (weatherBindings.entity = {
            entityId: weatherEntityId,
          }),
        sunEntityId &&
          (weatherBindings.sun = {
            entityId: sunEntityId,
          }),
        {
          id: weatherComponentId,
          type: 'weather',
          componentVersion: 1,
          position: {
            x: (weatherCanvasWidth - weatherComponentDimensions2) / 2,
            y: (weatherCanvasHeight - weatherComponentDimensions3) / 2,
            width: weatherComponentDimensions2,
            height: weatherComponentDimensions3,
            rotation: 0,
            zIndex: 1,
          },
          bindings: weatherBindings,
          properties: weatherProperties,
          style: {
            scale: 1.8,
            visible: true,
          },
          actions: {} as Record<string, any>,
          children: [] as any[],
        }
      )
    },
  },
  {
    id: 'line-chart',
    name: '折线图',
    type: 'line-chart',
    description: '显示温度或湿度实体的 24 小时趋势、当前值与极值。',
    scopes: ['shared', 'page'],
    create({
      id: lineChartComponentId,
      instanceName: lineChartInstanceName = '折线图',
      canvas: lineChartCanvas,
      sensorEntityId: lineChartSensorEntityId = '',
    }: any) {
      const lineChartCanvasWidth = Number(lineChartCanvas?.width || 2778),
        lineChartCanvasHeight = Number(lineChartCanvas?.height || 1940),
        lineChartWidth = lineChartCanvasWidth * 0.19,
        lineChartHeight = lineChartCanvasHeight * 0.16
      return {
        id: lineChartComponentId,
        type: 'line-chart',
        componentVersion: 1,
        position: {
          x: (lineChartCanvasWidth - lineChartWidth) / 2,
          y: (lineChartCanvasHeight - lineChartHeight) / 2,
          width: lineChartWidth,
          height: lineChartHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: lineChartSensorEntityId
          ? {
              entity: {
                entityId: lineChartSensorEntityId,
              },
            }
          : {},
        properties: {
          instanceName: lineChartInstanceName,
          // 与 metadata 的 navigationVisibilityComponentState 相比这里刻意**不含**
          // statePrecision（折线图不给该键，值由渲染侧按 auto 兜底），故保持显式列出。
          valueVisible: true,
          valueScale: 100,
          valueColor: '#dce1e5',
          valueOffsetX: 0,
          valueOffsetY: 0,
          updateInterval: 600,
          hours: 24,
          cornerRadius: 10,
          thresholdMode: 'auto',
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {
          tap: {
            type: 'more-info',
          },
        },
        children: [] as any[],
      }
    },
  },
  {
    id: 'light-statistics',
    name: '数量统计',
    type: 'light-statistics',
    description: '统计灯光、开关、空调等设备当前开启或运行的数量。',
    thumbnailId: 'light-statistics',
    scopes: ['page'],
    create({
      id: lightStatisticsComponentId,
      instanceName: lightStatisticsInstanceName = '数量统计',
      canvas: lightStatisticsCanvas,
    }: any) {
      const lightStatisticsCanvasWidth = Number(lightStatisticsCanvas?.width || 2778),
        lightStatisticsCanvasHeight = Number(lightStatisticsCanvas?.height || 1940),
        lightStatisticsWidth = lightStatisticsCanvasWidth * 0.18,
        lightStatisticsHeight = lightStatisticsCanvasHeight * 0.065
      return {
        id: lightStatisticsComponentId,
        type: 'light-statistics',
        componentVersion: 1,
        position: {
          x: (lightStatisticsCanvasWidth - lightStatisticsWidth) / 2,
          y: (lightStatisticsCanvasHeight - lightStatisticsHeight) / 2,
          width: lightStatisticsWidth,
          height: lightStatisticsHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: {
          instanceName: lightStatisticsInstanceName,
          entityIds: [] as any[],
          entityLabels: {} as Record<string, any>,
          title: '数量',
          iconVisible: true,
          icon: 'mdi:lightbulb-group-outline',
          iconColor: '#8b9298',
          iconActiveColor: '#f2a20d',
          iconGap: 4.5,
          titleVisible: true,
          titleColor: '#b9bbc0',
          titleSize: 32,
          titleWeight: 0.3,
          titleSpacing: 1.2,
          countVisible: true,
          countColor: '#b9bbc0',
          countActiveColor: '#f2a20d',
          countSize: 34,
          countWeight: 0.35,
          countSpacing: 0,
          countGap: 4.5,
          iconSize: 42,
        },
        style: {
          scale: 1.2932807744280563,
          visible: true,
        },
        actions: {} as Record<string, any>,
        children: [] as any[],
      }
    },
  },
  {
    id: 'event-log-wall',
    name: '即时消息墙',
    type: 'event-log-wall',
    description: '实时展示设备状态变更流，消息出现后自动淡出，可配置监听范围与配色。',
    thumbnailId: 'event-log-wall',
    scopes: ['page'],
    create({
      id: eventLogWallComponentId,
      instanceName: eventLogWallInstanceName = '即时消息墙',
      canvas: eventLogWallCanvas,
    }: any) {
      const eventLogWallCanvasWidth = Number(eventLogWallCanvas?.width || 2778),
        eventLogWallCanvasHeight = Number(eventLogWallCanvas?.height || 1940),
        eventLogWallWidth = 480,
        eventLogWallHeight = 300
      return {
        id: eventLogWallComponentId,
        type: 'event-log-wall',
        componentVersion: 1,
        position: {
          x: (eventLogWallCanvasWidth - eventLogWallWidth) / 2,
          y: (eventLogWallCanvasHeight - eventLogWallHeight) / 2,
          width: eventLogWallWidth,
          height: eventLogWallHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: {
          instanceName: eventLogWallInstanceName,
          enabled: true,
          title: '即时消息墙',
          titleVisible: false,
          titleSize: 72,
          titleColor: '#b8c2c8',
          titleAlign: 'left',
          maxEntries: 20,
          displayDuration: 4,
          watchScope: 'auto',
          entityIds: [] as any[],
          domains: [...EVENT_LOG_WALL_DOMAINS],
          fontSize: 21,
          panelBgOpacity: 0.3,
          panelBlur: 8,
          cornerRadius: 12,
          entryClickMode: 'details',
          showFooter: false,
          footerText: '查看全部事件历史',
          stateOnColor: '#fb923c',
          stateOffColor: '#93c5fd',
          stateAttrColor: '#7dd3fc',
          stateClimateColor: '#67e8f9',
          stateAlertColor: '#f87171',
          stateMutedColor: '#9ca3af',
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {} as Record<string, any>,
        children: [] as any[],
      }
    },
  },
]
