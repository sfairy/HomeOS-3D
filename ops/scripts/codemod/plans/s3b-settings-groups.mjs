/**
 * S3b · settings 按侧栏 IA 重排为 6 个功能组。
 *
 * 依据：README §2.3 的侧栏分组是设置页的**唯一信息架构**，目录结构应与之一一对应，
 * 而不是按「composables / styles / 子页面」再切一层。
 *
 * 组名与侧栏标签对应：
 *   onboarding  入门与连接（首装向导 / HA 连接 / 集成绑定 / 绑定清理）
 *   household   家居配置（房间 / 设备画像 / 生活账户 / 充放电 / 常用设备库）
 *   appearance  界面与体验（基础设置 / 仪表板编辑 / 面板部件 / 浮动组件 / 内嵌网页）
 *   automation  自动化与安防（家庭模式 / 安防场景 / 自动化草案）
 *   perception  感知交互（语音中心 / 智能管家 / 告警规则 / 媒体入库）
 *   system      系统与账户（家庭状态 / 访问控制 / 方案备份 / 授权 / 保留 / 诊断 / 网络 / 高级参数）
 */
const SRC = 'homeos/frontend/src/features/settings'

export default {
  dirMoves: [
    { from: `${SRC}/connect`, to: `${SRC}/groups/onboarding` },
    { from: `${SRC}/home`, to: `${SRC}/groups/household` },
    { from: `${SRC}/display`, to: `${SRC}/groups/appearance` },
    { from: `${SRC}/automate`, to: `${SRC}/groups/automation` },
    { from: `${SRC}/interact`, to: `${SRC}/groups/perception` },
    { from: `${SRC}/system`, to: `${SRC}/groups/system` },
  ],
}
