/**
 * 控件模板定义 · control 组（6 个）。
 *
 * 从 `component-templates.ts` 拆出的纯数据分片：数组元素就是模板对象（`id / name /
 * scopes / create`），不含注册逻辑。注册点只有一处（`component-templates.ts` 遍历
 * 全部组），因此新增模板只需在这里加一项。
 */
import { percentageBarDefaults, percentageBarDimensions } from '../../shared/percentage-bar-model'
import { FLOW_LINE_DEFAULTS } from '../../shared/flow-line-model'
import { sceneModeDefaults } from './shared-defaults'

export const controlTemplates = [
  {
    id: 'air-conditioner',
    name: '空调 / 浴霸',
    type: 'air-conditioner',
    description: '显示空调或浴霸状态并按实体能力提供控制，内置可调整的动态出风效果。',
    scopes: ['page'],
    create({
      id: airConditionerComponentId,
      instanceName: airConditionerInstanceName = '空调',
      canvas: airConditionerCanvas,
    }: any) {
      const airConditionerCanvasWidth = Number(airConditionerCanvas?.width || 2778),
        airConditionerCanvasHeight = Number(airConditionerCanvas?.height || 1940),
        airConditionerWidth = airConditionerCanvasWidth * 0.11,
        airConditionerHeight = airConditionerCanvasHeight * 0.08
      return {
        id: airConditionerComponentId,
        type: 'air-conditioner',
        componentVersion: 1,
        position: {
          x: (airConditionerCanvasWidth - airConditionerWidth) / 2,
          y: (airConditionerCanvasHeight - airConditionerHeight) / 2,
          width: airConditionerWidth,
          height: airConditionerHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: {
          deviceType: 'auto',
          instanceName: airConditionerInstanceName,
          mainText: '',
          secondaryText: '',
          icon: 'mdi:air-conditioner',
          iconOffColor: '#9aa5ad',
          iconOnColor: '#73c8ff',
          badgeColor: '#5b5e66',
          badgeOpacity: 0.58,
          symbolSize: 14,
          badgeSize: 28,
          iconLeft: 20,
          iconTop: 50,
          mainColor: '#c7c8cb',
          secondaryColor: '#75777d',
          mainSize: 21,
          secondarySize: 12,
          mainWeight: 0.24,
          secondaryWeight: 0.12,
          mainSpacing: 0.5,
          secondarySpacing: 0.3,
          mainTextLeft: 39,
          mainTextTop: 40,
          secondaryTextLeft: 39,
          secondaryTextTop: 67,
          airflowVisible: true,
          airflowMotion: 'dynamic',
          airflowCoolColor: '#73c8ff',
          airflowHeatColor: '#ff8a65',
          airflowOtherColor: '#dce2e6',
          airflowAngle: 7,
          airflowCurve: 20,
          airflowLength: 200,
          airflowFadePosition: 50,
          airflowSpread: 100,
          airflowDensity: 60,
          airflowIrregularity: 50,
          airflowThickness: 40,
          airflowStrength: 200,
          airflowBlur: 6,
          airflowSpeed: 1,
          airflowOffsetX: -75,
          airflowOffsetY: 34,
          airflowWidth: 64,
          airflowHeight: 125,
          airflowScale: 1,
          airflowRotation: -3,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {
          tap: {
            type: 'more-info',
          },
          doubleTap: {
            type: 'toggle',
          },
        },
        children: [] as any[],
      }
    },
  },
  {
    id: 'presence-sensor',
    name: '传感器',
    type: 'presence-sensor',
    description: '添加后在属性中选择传感器类型，当前支持人在、门窗和水浸状态的动态显示。',
    scopes: ['page'],
    create({
      id: presenceSensorComponentId,
      instanceName: presenceSensorInstanceName = '传感器',
      canvas: presenceSensorCanvas,
      entityId: presenceSensorEntityId = '',
    }: any) {
      const presenceSensorCanvasWidth = Number(presenceSensorCanvas?.width || 2778),
        presenceSensorCanvasHeight = Number(presenceSensorCanvas?.height || 1940),
        presenceSensorWidth = 360,
        presenceSensorHeight = 240
      return {
        id: presenceSensorComponentId,
        type: 'presence-sensor',
        componentVersion: 1,
        position: {
          x: (presenceSensorCanvasWidth - presenceSensorWidth) / 2,
          y: (presenceSensorCanvasHeight - presenceSensorHeight) / 2,
          width: presenceSensorWidth,
          height: presenceSensorHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: presenceSensorEntityId
          ? {
              entity: {
                entityId: presenceSensorEntityId,
              },
            }
          : {},
        properties: {
          instanceName: presenceSensorInstanceName,
          sensorKind: 'presence',
          mainText: '人在',
          secondaryText: '',
          occupiedColor: '#ffffff',
          waterLeakColor: '#42c8ff',
          smokeColor: '#ffffff',
          naturalGasColor: '#ffb347',
          clearColor: '#758189',
          animationStrength: 0.72,
          haloScale: 1,
          haloVisible: true,
          haloScaleX: 1,
          haloScaleY: 1,
          haloRotation: 0,
          haloOpacity: 1,
          personScale: 1,
          personVisible: true,
          personRotation: 0,
          personOpacity: 1,
          orbitDuration: 8,
          showDuration: true,
          historyHours: 24,
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
  {
    id: 'scene-mode',
    name: '情景模式',
    type: 'scene-mode',
    description: '开关切换 · 情景执行',
    scopes: ['shared', 'page'],
    create({
      id: sceneModeComponentId,
      instanceName: sceneModeInstanceName = '情景模式',
      canvas: sceneModeCanvas,
    }: any) {
      return {
        id: sceneModeComponentId,
        type: 'scene-mode',
        componentVersion: 1,
        position: {
          x: (Number(sceneModeCanvas?.width || 2778) - 555.6) / 2,
          y: (Number(sceneModeCanvas?.height || 1940) - 153.832) / 2,
          width: 555.6,
          height: 153.832,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        actions: {} as Record<string, any>,
        children: [] as any[],
        properties: {
          ...sceneModeDefaults,
          instanceName: sceneModeInstanceName,
        },
        style: {
          scale: 0.3934332813319446,
          visible: true,
        },
      }
    },
  },
  {
    id: 'panel-frame',
    name: '底图框',
    type: 'panel-frame',
    description: '双行标题、渐变外框和内向柔光容器。',
    scopes: ['shared', 'page'],
    create({
      id: panelFrameComponentId,
      instanceName: panelFrameInstanceName = '底图框',
      canvas: panelFrameCanvas,
    }: any) {
      const panelFrameCanvasWidth = Number(panelFrameCanvas?.width || 2778),
        panelFrameCanvasHeight = Number(panelFrameCanvas?.height || 1940),
        panelFrameWidth = panelFrameCanvasWidth * 0.19,
        panelFrameHeight = panelFrameCanvasHeight * 0.16
      return {
        id: panelFrameComponentId,
        type: 'panel-frame',
        componentVersion: 1,
        position: {
          x: (panelFrameCanvasWidth - panelFrameWidth) / 2,
          y: (panelFrameCanvasHeight - panelFrameHeight) / 2,
          width: panelFrameWidth,
          height: panelFrameHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: {
          instanceName: panelFrameInstanceName,
          mainTextVisible: true,
          mainText: '温度',
          mainColor: '#ffffff',
          mainSize: 30,
          mainWeight: 0,
          mainOpacity: 0.72,
          mainSpacing: 2,
          secondaryTextVisible: true,
          secondaryText: 'TEMPERATURE',
          secondaryColor: '#ffffff',
          secondarySize: 15,
          secondaryWeight: 0,
          secondaryOpacity: 0.36,
          secondarySpacing: 2.1,
          mainTextLeft: 5.2,
          mainTextTop: 20,
          secondaryTextLeft: 5.2,
          secondaryTextTop: 28,
          edgeVisible: true,
          edgeColor: '#d4d4d4',
          edgeWidth: 0.9,
          edgeOpacity: 1,
          radius: 0.195,
          edgeAngle: 45,
          glowVisible: true,
          glowColor: '#ffffff',
          glowStrength: 0.5,
          glowSize: 1.5,
          glowAngle: 242,
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
  {
    id: 'flow-line',
    name: '流水线条',
    type: 'flow-line',
    description: '自由绘制水流与能量路径，支持颜色、光尾、流速与发光 DIY。',
    scopes: ['shared', 'page'],
    create({ id: flowLineComponentId, instanceName: flowLineInstanceName = '流水线条', canvas: flowLineCanvas }: any) {
      const flowLineCanvasWidth = Number(flowLineCanvas?.width) || 2778,
        flowLineCanvasHeight = Number(flowLineCanvas?.height) || 1940,
        flowLineWidth = flowLineCanvasWidth * 0.3,
        flowLineHeight = flowLineCanvasHeight * 0.15
      return {
        id: flowLineComponentId,
        type: 'flow-line',
        componentVersion: 1,
        position: {
          x: (flowLineCanvasWidth - flowLineWidth) / 2,
          y: (flowLineCanvasHeight - flowLineHeight) / 2,
          width: flowLineWidth,
          height: flowLineHeight,
          rotation: 0,
          zIndex: 1,
        },
        properties: {
          ...structuredClone(FLOW_LINE_DEFAULTS),
          instanceName: flowLineInstanceName,
        },
        style: {
          scale: 1,
          visible: true,
        },
        bindings: {} as Record<string, any>,
        actions: {} as Record<string, any>,
        children: [] as any[],
      }
    },
  },
  {
    id: 'percentage-bar',
    name: '百分比柱状图',
    type: 'percentage-bar',
    description: '单个或多个百分比实体，支持渐变、内嵌游标与玻璃液柱，仅显示。',
    scopes: ['shared', 'page'],
    create({
      id: percentageBarComponentId,
      instanceName: percentageBarInstanceName = '百分比柱状图',
      canvas: percentageBarCanvas,
    }: any) {
      const percentageBarProperties = {
          ...percentageBarDefaults,
          instanceName: percentageBarInstanceName,
          series: [
            {
              entityId: '',
              attribute: '',
              label: '',
              color: '#f2a20d',
            },
          ],
        },
        { width: percentageBarWidth, height: percentageBarHeight } = percentageBarDimensions(percentageBarProperties)
      return {
        id: percentageBarComponentId,
        type: 'percentage-bar',
        componentVersion: 1,
        position: {
          x: (Number(percentageBarCanvas?.width || 2778) - percentageBarWidth) / 2,
          y: (Number(percentageBarCanvas?.height || 1940) - percentageBarHeight) / 2,
          width: percentageBarWidth,
          height: percentageBarHeight,
          rotation: 0,
          zIndex: 1,
        },
        properties: percentageBarProperties,
        bindings: {} as Record<string, any>,
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
