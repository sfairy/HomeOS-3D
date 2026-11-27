// P4-g：全屋关闭拆「类型」与「配置实现」两文件（不合并，避免类型声明在拼装中丢失）。
export default {
  moves: [
    { from: 'homeos/frontend/src/kernel/types/whole-home-off.ts', to: 'homeos/frontend/src/kernel/whole-home-off.ts' },
    {
      from: 'homeos/frontend/src/kernel/constants/whole-home-off.ts',
      to: 'homeos/frontend/src/kernel/whole-home-off-config.ts',
    },
  ],
}
