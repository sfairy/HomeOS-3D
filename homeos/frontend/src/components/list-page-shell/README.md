# list-page-shell

共享**列表页**外壳（hero / 指标 / 查询工具条）。

与 `components/common/settings-page-shell/`（设置页壳：`SettingsPageShell` / `SettingsCard` 一族）
是两件事，故目录名各自显式 —— 两者此前都叫 `page-shell`，同名不同义。

事件与通知两页仍各自有域内的 `ViewHero` / `ViewToolbar`，位于 `views/*` 下；
新增列表页应优先使用这些 `ListPage*` 组件。
