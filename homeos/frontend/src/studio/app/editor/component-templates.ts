import { interaction3dTemplate as interaction3dTemplate2 } from '../bridge/definition'
import { EVENT_LOG_WALL_DOMAINS } from '../renderer/controls/event-log-runtime'
import { buttonTemplates } from './component-templates/button'
import { controlTemplates } from './component-templates/control'
import { displayTemplates } from './component-templates/display'
import { layoutTemplates } from './component-templates/layout'
import { mediaTemplates } from './component-templates/media'

export {
  dateComponentDimensions,
  timeComponentDimensions,
  weatherComponentDimensions,
} from './component-template-metrics'

const templatesById = new Map()
registerComponentTemplate(interaction3dTemplate2)
for (const componentTemplate of [
  ...displayTemplates,
  ...buttonTemplates,
  ...controlTemplates,
  ...mediaTemplates,
  ...layoutTemplates,
]) {
  registerComponentTemplate(componentTemplate)
}
const templateScopeOrder = {
    shared: [
      'time',
      'date',
      'weather',
      'line-chart',
      'percentage-bar',
      'panel-frame',
      'flow-line',
      'navigation-button',
      'scene-mode',
    ],
    page: [
      // 页面背景排最前：它是整页底层，用户找它时通常在翻「页面级」控件。
      'page-background',
      'image',
      'floorplan-auto-diagram',
      'title-button',
      'light-statistics',
      'icon-button',
      'icon-button-effect',
      'device-button',
      'presence-sensor',
      'event-log-wall',
      'air-conditioner',
      'vacuum-map',
      'camera',
      'line-chart',
      'percentage-bar',
      'panel-frame',
      'flow-line',
      'scene-mode',
    ],
  },
  componentDefaultsByType = {
    'event-log-wall': {
      properties: {
        domains: [...EVENT_LOG_WALL_DOMAINS],
      },
    },
    image: {},
    'floorplan-auto-diagram': {
      properties: {
        label: '户型图自动导图',
      },
    },
    'vacuum-map': {
      style: {
        scale: 1.049,
      },
      dimensions: {
        width: 1555.68,
        height: 1605.684,
      },
    },
    'icon-button-effect': {
      properties: {
        iconOffColor: '#4f4f4f',
        iconSize: 79,
        buttonOffColor: '#bababa',
        buttonOnColor: '#feae01',
        buttonOpacity: 0.8,
        frameWidth: 0,
        frameOpacity: 0,
        glowColor: '#ffa200',
        glowOnStrength: 3,
        effectFadeDuration: 0.3,
        effectBlendMode: 'normal',
        effectLayoutMode: 'fill',
      },
      style: {
        scale: 0.19458752228421689,
      },
      dimensions: {
        width: 208.35,
        height: 208.35,
      },
    },
    'title-button': {
      properties: {
        mainText: '房间',
        secondaryText: 'ROOM\nLIGHTING',
        iconVisible: false,
        frameSize: 119,
        opacity: 1,
      },
      style: {
        scale: 0.9213987523473026,
      },
      dimensions: {
        width: 500.04,
        height: 121.94,
      },
    },
    'icon-button': {
      properties: {
        mainText: '灯光',
        secondaryText: 'LIGHTING',
        icon: 'mdi:light-recessed',
        backgroundOffColor: '#24262c',
        backgroundOffOpacity: 0.82,
        backgroundOnColor: '#dfb64f',
        backgroundOnOpacity: 1,
        iconLeft: 46.7,
        iconTop: 31.3,
        iconOffColor: '#ffffff',
        iconOffOpacity: 0.5,
        iconOnColor: '#ffffff',
        iconOnOpacity: 0.9,
        iconSize: 72,
        mainOffColor: '#ffffff',
        mainOffOpacity: 0.5,
        mainOnColor: '#ffffff',
        mainOnOpacity: 0.9,
        mainSize: 20,
        mainSpacing: 0.1,
        mainTextLeft: 6,
        mainTextTop: 74.6,
        mainWeight: 0.68,
        secondaryOffColor: '#ffffff',
        secondaryOffOpacity: 0.5,
        secondaryOnColor: '#ffffff',
        secondaryOnOpacity: 0.9,
        secondarySize: 8,
        secondarySpacing: 1.5,
        secondaryTextLeft: 6,
        secondaryTextTop: 90.8,
        secondaryWeight: 0.67,
        onFillColor: '#e4ad2c',
        onFillFadeDuration: 0.1,
        frameColor: '#81838a',
        frameWidth: 1.3,
        frameAngle: 71,
        frameOffOpacity: 0.6,
        frameOpacity: 0.8,
        cutCorner: 25,
        softLightStrength: 2,
        softLightSize: 2,
        glowAngle: 249,
        opacity: 1,
      },
      style: {
        scale: 0.779857559628849,
      },
      dimensions: {
        width: 277.8,
        height: 300.16,
      },
    },
    'device-button': {
      properties: {
        mainText: '设备',
        iconOnColor: '#2372bf',
        iconOffOpacity: 0.72,
        iconOnOpacity: 1,
        iconLeft: 12.8,
        iconSize: 55,
        symbolSize: 35,
        badgeSize: 51,
        badgeOpacity: 0.36,
        mainColor: '#b0b0b0',
        mainOffOpacity: 0.82,
        mainOnOpacity: 1,
        secondaryColor: '#706f6f',
        secondaryOffOpacity: 0.64,
        secondaryOnOpacity: 0.82,
        secondarySize: 15,
        secondaryTextTop: 66.2,
        onFillVisible: false,
        onFillColor: '#248eb2',
        onFillStrength: 0.16,
        frameVisible: true,
        frameWidth: 1,
        frameAngle: 45,
        frameOffOpacity: 0.35,
        frameOnOpacity: 0.8,
        cutCorner: 12,
        softLightVisible: true,
        softLightColor: '#ffffff',
        softLightStrength: 0.45,
        softLightSize: 1,
        softLightAngle: 45,
        glowVisible: false,
        glowColor: '#248eb2',
        glowStrength: 0.5,
        glowSize: 1,
        glowAngle: 220,
      },
      style: {
        scale: 0.7774703949015426,
      },
      dimensions: {
        width: 277.8,
        height: 206.36,
      },
    },
    'presence-sensor': {
      dimensions: {
        width: 360,
        height: 240,
      },
    },
    camera: {
      properties: {
        opacity: 1,
        radius: 11,
      },
      style: {
        scale: 0.8252317102372743,
      },
      dimensions: {
        width: 611.16,
        height: 343.7775,
      },
    },
    'air-conditioner': {
      properties: {
        mainText: '空调',
        iconOffColor: '#c2c2c2',
        iconOnColor: '#4581d2',
        badgeColor: '#c3c3c7',
        badgeOpacity: 0.3,
        symbolSize: 30,
        badgeSize: 39,
        iconLeft: 21.5,
        secondaryColor: '#969696',
        mainWeight: 0.6,
        mainSpacing: 6,
        secondaryTextTop: 63.7,
        airflowColor: '#ffffff',
        airflowCoolColor: '#5baeed',
        airflowHeatColor: '#f67713',
        airflowAngle: 0,
        airflowCurve: 0,
        airflowStrength: 219,
        airflowHeight: 300,
        airflowScale: 0.4817745640382381,
      },
      style: {
        scale: 1.0190713138587422,
      },
      dimensions: {
        width: 305.58,
        height: 150.08,
      },
    },
    time: {
      properties: {
        showSeconds: true,
        fontSize: 89,
        fontWeight: 1,
        letterSpacing: 4.7,
      },
      style: {
        scale: 0.576,
      },
      dimensions: {
        width: 496.6612,
        height: 105.02,
      },
    },
    date: {
      properties: {
        showLunar: true,
        primaryWeight: 0.5,
        lunarWeight: 0.5,
        lunarSpacing: 0.2,
        lineGap: 11,
      },
      style: {
        scale: 0.642,
      },
      dimensions: {
        width: 353.92,
        height: 81.08,
      },
    },
    weather: {
      properties: {
        iconSize: 109,
        iconGap: 0,
        temperatureWeight: 0.5,
        temperatureSpacing: 2.8,
        secondaryWeight: 0.5,
      },
      style: {
        scale: 0.8056171554518585,
      },
      dimensions: {
        width: 263.8,
        height: 109,
      },
    },
    'line-chart': {
      properties: {
        valueScale: 66,
        valueColor: '#94a5b3',
        valueOffsetX: -0.4,
        valueOffsetY: 1,
        hours: 12,
        cornerRadius: 14,
      },
      dimensions: {
        width: 525.042,
        height: 300.16,
      },
    },
    'panel-frame': {
      dimensions: {
        width: 527.82,
        height: 300.16,
      },
    },
    'navigation-button': {
      properties: {
        secondaryWeight: 0,
        lineGap: 20,
        textAlign: 'left',
        textLeft: 29.9,
        textTop: 81.8,
        textGlowVisible: false,
        textGlowIdleStrength: 1.5,
        textGlowActiveStrength: 1.5,
        textGlowIdleSize: 3,
        idleOpacity: 0.3,
        activeOpacity: 0.96,
      },
      style: {
        scale: 0.8533204506895217,
      },
      dimensions: {
        width: 555.6,
        height: 153.832,
      },
    },
  }
function registerComponentTemplate(template: any) {
  if (!template?.id || typeof template.create != 'function') throw new Error('控件模板必须包含 id 和 create。')
  templatesById.set(
    template.id,
    Object.freeze({
      ...template,
    }),
  )
}
export function listComponentTemplates(scope: any) {
  const list = (templateScopeOrder as any)[scope] || []
  return [...templatesById.values()]
    .filter((listedTemplate) => listedTemplate.scopes?.includes(scope))
    .sort((leftTemplate, rightTemplate) => {
      const indexOf = list.indexOf(leftTemplate.id),
        indexOf2 = list.indexOf(rightTemplate.id)
      return (indexOf < 0 ? Number.MAX_SAFE_INTEGER : indexOf) - (indexOf2 < 0 ? Number.MAX_SAFE_INTEGER : indexOf2)
    })
}
export function createComponentFromTemplate(templateId: any, templateOptions: any) {
  const templateDefinition = templatesById.get(templateId)
  if (!templateDefinition) throw new Error('控件模板不存在。')
  const options = {
      ...templateDefinition.create(templateOptions),
      templateRef: {
        templateId: templateId,
        version: 1,
      },
    },
    componentDefaults = (componentDefaultsByType as any)[options.type]
  if (!componentDefaults) return options
  const structuredClone2 = structuredClone(componentDefaults.properties || {}),
    structuredClone3 = structuredClone(componentDefaults.style || {}),
    dimensions = componentDefaults.dimensions,
    position = {
      ...options.position,
    }
  if (dimensions) {
    const canvasWidth = Number(templateOptions?.canvas?.width || 2778),
      canvasHeight = Number(templateOptions?.canvas?.height || 1940)
    ;(position.width = dimensions.width),
      (position.height = dimensions.height),
      (position.x = (canvasWidth - dimensions.width) / 2),
      (position.y = (canvasHeight - dimensions.height) / 2)
  }
  return {
    ...options,
    position: position,
    properties: {
      ...options.properties,
      ...structuredClone2,
      instanceName: options.properties.instanceName,
    },
    style: {
      ...options.style,
      ...structuredClone3,
    },
  }
}
