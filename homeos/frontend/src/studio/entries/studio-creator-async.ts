export const WORKFLOW_STEPS = [
  { id: 'background', label: '导入底图' },
  { id: 'scale', label: '标定比例' },
  { id: 'walls', label: '绘制空间' },
  { id: 'items', label: '摆放物件' },
  { id: 'lights', label: '放置灯光' },
  { id: 'export', label: '应用户型' },
] as const
