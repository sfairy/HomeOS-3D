/**
 * 控件模板定义 · media 组（3 个）。
 *
 * 从 `component-templates.ts` 拆出的纯数据分片：数组元素就是模板对象（`id / name /
 * scopes / create`），不含注册逻辑。注册点只有一处（`component-templates.ts` 遍历
 * 全部组），因此新增模板只需在这里加一项。
 */
export const mediaTemplates = [
  {
    id: 'image',
    name: '图片',
    type: 'image',
    description: '显示图片素材，可关联实体并设置点按动作。',
    scopes: ['page'],
    create({ id: imageComponentId, instanceName: imageInstanceName = '图片', canvas: imageCanvas }: any) {
      const imageCanvasWidth = Number(imageCanvas?.width || 2778),
        imageCanvasHeight = Number(imageCanvas?.height || 1940),
        imageWidth = 320,
        imageHeight = 240
      return {
        id: imageComponentId,
        type: 'image',
        componentVersion: 1,
        position: {
          x: (imageCanvasWidth - imageWidth) / 2,
          y: (imageCanvasHeight - imageHeight) / 2,
          width: imageWidth,
          height: imageHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: {
          instanceName: imageInstanceName,
          opacity: 1,
          layoutMode: 'free',
          fit: 'contain',
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
    id: 'camera',
    name: '摄像头实时预览',
    type: 'camera',
    description: '实时预览摄像头，点击可放大查看。',
    scopes: ['page'],
    create({ id: cameraComponentId, instanceName: cameraInstanceName = '摄像头实时预览', canvas: cameraCanvas }: any) {
      const cameraCanvasWidth = Number(cameraCanvas?.width || 2778),
        cameraCanvasHeight = Number(cameraCanvas?.height || 1940),
        cameraWidth = cameraCanvasWidth * 0.22,
        cameraHeight = (cameraWidth * 9) / 16
      return {
        id: cameraComponentId,
        type: 'camera',
        componentVersion: 1,
        position: {
          x: (cameraCanvasWidth - cameraWidth) / 2,
          y: (cameraCanvasHeight - cameraHeight) / 2,
          width: cameraWidth,
          height: cameraHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: {
          instanceName: cameraInstanceName,
          fit: 'fill',
          displayMode: 'live',
          refreshInterval: 10,
          mediaVisible: true,
          // 视频来源：默认沿用 HA 实体，可切成局域网 go2rtc（走同源 WebSocket 中继）。
          cameraSource: 'entity',
          go2rtcUrl: '',
          frameVisible: true,
          frameColor: '#d4d4d4',
          frameWidth: 1,
          frameAngle: 45,
          frameOpacity: 0.9,
          radius: 0.04,
        },
        style: {
          scale: 1,
          visible: true,
        },
        actions: {
          tap: {
            type: 'more-info',
            data: {
              popupSource: 'current',
            },
          },
        },
        children: [] as any[],
      }
    },
  },
  {
    id: 'vacuum-map',
    name: '扫地机器人实时地图',
    type: 'vacuum-map',
    description: '将扫地机器人实时地图作为透明图层叠加到底图上。',
    scopes: ['page'],
    create({
      id: vacuumMapComponentId,
      instanceName: vacuumMapInstanceName = '扫地机器人实时地图',
      canvas: vacuumMapCanvas,
      vacuumMapEntityId: vacuumMapEntityId = '',
    }: any) {
      const vacuumMapCanvasWidth = Number(vacuumMapCanvas?.width || 2778),
        vacuumMapCanvasHeight = Number(vacuumMapCanvas?.height || 1940),
        vacuumMapWidth = vacuumMapCanvasWidth * 0.56,
        vacuumMapHeight = (vacuumMapWidth * 1156) / 1120
      return {
        id: vacuumMapComponentId,
        type: 'vacuum-map',
        componentVersion: 1,
        position: {
          x: (vacuumMapCanvasWidth - vacuumMapWidth) / 2,
          y: (vacuumMapCanvasHeight - vacuumMapHeight) / 2,
          width: vacuumMapWidth,
          height: vacuumMapHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: vacuumMapEntityId
          ? {
              entity: {
                entityId: vacuumMapEntityId,
              },
            }
          : {},
        properties: {
          instanceName: vacuumMapInstanceName,
          opacity: 0.5,
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
