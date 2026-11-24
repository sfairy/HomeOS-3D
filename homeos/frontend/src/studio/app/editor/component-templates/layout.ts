/**
 * 控件模板定义 · layout 组（1 个）。
 *
 * 从 `component-templates.ts` 拆出的纯数据分片：数组元素就是模板对象（`id / name /
 * scopes / create`），不含注册逻辑。注册点只有一处（`component-templates.ts` 遍历
 * 全部组），因此新增模板只需在这里加一项。
 */
export const layoutTemplates = [
  {
    id: 'floorplan-auto-diagram',
    name: '户型图自动导图',
    type: 'floorplan-auto-diagram',
    description: '把 3D 户型底图和灯组效果层合并为一个可交互的导图控件。',
    scopes: ['page'],
    create({
      id: floorplanComponentId,
      instanceName: floorplanInstanceName = '户型图自动导图',
      canvas: floorplanCanvas,
    }: any) {
      const floorplanCanvasWidth = Number(floorplanCanvas?.width || 2778),
        floorplanCanvasHeight = Number(floorplanCanvas?.height || 1940),
        floorplanWidth = floorplanCanvasWidth * 0.56,
        floorplanHeight = floorplanCanvasHeight * 0.56
      return {
        id: floorplanComponentId,
        type: 'floorplan-auto-diagram',
        componentVersion: 1,
        position: {
          x: (floorplanCanvasWidth - floorplanWidth) / 2,
          y: (floorplanCanvasHeight - floorplanHeight) / 2,
          width: floorplanWidth,
          height: floorplanHeight,
          rotation: 0,
          zIndex: 1,
        },
        bindings: {} as Record<string, any>,
        properties: {
          instanceName: floorplanInstanceName,
          label: floorplanInstanceName,
          exportFolder: '',
          layoutMode: 'free',
          baseAssetId: '',
          floorPlanAssetId: '',
          previewReady: false,
          previewing: false,
          interactionMode: 'position',
          cameraView: 'free',
          cameraMode: 'orthographic',
          floorSelection: '',
          cameraTopRotation: 0,
          cameraFocalLength: 50,
          generated: false,
          lightLayers: [] as any[],
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
