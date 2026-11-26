/**
 * 控件模板定义 · layout 组（1 个）。
 *
 * 从 `component-templates.ts` 拆出的纯数据分片：数组元素就是模板对象（`id / name /
 * scopes / create`），不含注册逻辑。注册点只有一处（`component-templates.ts` 遍历
 * 全部组），因此新增模板只需在这里加一项。
 */
import { PAGE_BACKGROUND_TYPE, PAGE_BACKGROUND_FILL_POSITION, createPageBackground } from '@app/shared/page-background'

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
        bindings: {} as Record<string, unknown>,
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
        actions: {} as Record<string, unknown>,
        children: [] as unknown[],
      }
    },
  },
  // 页面背景（0.8.9）：整页背景层。`position` 是**铺满整块画布**（组件本身占满页面），
  // 图片的实际位置/尺寸在 `properties.position`（百分比盒），由检查器编辑。
  // 缩略图是 6 张预设拼的 3×2 网格，见 `component-editing.ts` 的 `appendTemplatePreview`。
  {
    id: PAGE_BACKGROUND_TYPE,
    name: '页面背景',
    type: PAGE_BACKGROUND_TYPE,
    description: '为整页铺上内置背景或自己的图片，可调透明度与位置。',
    scopes: ['page'],
    create({
      id: pageBackgroundId,
      instanceName: pageBackgroundInstanceName = '页面背景',
      canvas,
    }: {
      id: string
      instanceName?: string
      canvas?: { width?: number; height?: number }
    }) {
      return {
        id: pageBackgroundId,
        type: PAGE_BACKGROUND_TYPE,
        componentVersion: 1,
        position: {
          x: 0,
          y: 0,
          width: Number(canvas?.width || 2778),
          height: Number(canvas?.height || 1940),
          rotation: 0,
          zIndex: 0,
        },
        bindings: {} as Record<string, any>,
        properties: {
          ...createPageBackground(),
          label: pageBackgroundInstanceName,
          position: { ...PAGE_BACKGROUND_FILL_POSITION },
        },
        style: { scale: 1, visible: true },
        actions: {} as Record<string, any>,
        children: [] as any[],
      }
    },
  },
]
