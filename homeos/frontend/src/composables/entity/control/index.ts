/**
 * 设备控制核心入口：light / climate / cover 无 UI 逻辑。
 * 弹窗壳层（栈 A Vue / 栈 C dialog / 栈 D panel）只消费此处 API。
 */
export * from './light-control-core'
export * from './climate-control-core'
export * from './cover-control-core'
