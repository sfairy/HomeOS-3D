/**
 * 可控实体域判定模块
 *
 * 职责：
 *  - 维护"可在控制弹窗 / 服务调用中操作"的 HA domain 白名单。
 *  - 提供 domain 级与 entity_id 级的可控判定。
 *
 * 关键依赖：
 *  - 与前端 entity-popup-registry 对齐：弹窗组件按此清单决定是否渲染控制 UI。
 *
 * 约定：
 *  - 白名单内的 domain 才允许出现在控制面板、语音指令、自动化动作等场景；
 *  - 传感器类（sensor / binary_sensor）默认不可控，仅作展示。
 */

/** 支持控制弹窗 / 服务调用的实体域（与前端 entity-popup-registry 对齐） */
const CONTROLLABLE_DOMAINS = new Set([
  'light',                // 灯具：亮度 / 色温 / 开关
  'switch',               // 开关：通断
  'input_boolean',        // 输入布尔：虚拟开关
  'climate',              // 恒温器：目标温度 / 模式
  'fan',                  // 风扇：风速 / 摆风
  'media_player',         // 媒体播放器：播放 / 音量 / 源
  'water_heater',         // 热水器：目标温度
  'cover',                // 窗帘 / 卷帘：位置 / 倾角
  'lock',                 // 门锁：上锁 / 解锁
  'vacuum',               // 扫地机：清扫 / 回充
  'camera',               // 摄像头：云台 / 截图
  'humidifier',           // 加湿器：目标湿度
  'alarm_control_panel',  // 安防面板：布防 / 撤防
  'siren',                // 警报器：鸣响 / 静音
  'valve',                // 阀门：开 / 关（水/气阀）
  'remote',               // 遥控器：发送按键
  'select',               // 下拉选择：选项切换
  'input_select',         // 输入下拉：虚拟选项
  'number',               // 数值滑块：设定数值
  'input_number',         // 输入数值：虚拟数值
  'button',               // 按钮：触发一次性动作
  'input_button',         // 输入按钮：虚拟按钮
  'timer',                // 计时器：开始 / 暂停 / 取消
  'counter',              // 计数器：增减 / 重置
  'input_text',           // 输入文本：虚拟文本框
]);

/**
 * 判断指定 domain 是否属于可控域。
 *
 * @param domain HA domain（如 "light"）
 * @returns true 表示该 domain 在可控白名单中
 *
 * 调用场景：自动化编辑器过滤可选动作实体、语音控制候选筛选。
 */
export function isControllableEntityDomain(domain: string): boolean {
  return CONTROLLABLE_DOMAINS.has(String(domain || '').toLowerCase());
}

/**
 * 判断指定 entity_id 是否属于可控实体。
 *
 * @param entityId HA entity_id（如 "light.living"）
 * @returns true 表示该实体的 domain 在可控白名单中
 *
 * 实现说明：直接以 "." 分割取首段作为 domain，避免引入 getEntityDomain 依赖。
 */
export function isControllableEntityId(entityId: string): boolean {
  const domain = entityId.split('.')[0] || '';
  return isControllableEntityDomain(domain);
}