/**
 * @file channels-mock-guide.ts
 * @module ChannelsModule
 *
 * 当智能管家处于 Mock（演示）模式时，向 IM 通道用户回发的固定引导文案。
 * 用于提示用户未配置有效的模型 API Key，需前往设置页面完成配置后才能正常对话。
 */

/** 通道在 Agent Mock 时的固定引导文案 */
export const MOCK_AGENT_CONFIG_GUIDE =
  '智能管家当前为演示模式（未配置有效 API Key），无法执行远程控家。请在 HomeOS「设置 → 智能管家 → 模型配置」填写 API Key 并保存后再试。';