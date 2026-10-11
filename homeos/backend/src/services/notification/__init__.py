"""通知域（notification）：事件推送、规则与渠道派发。

注意：本包 ``__init__`` 不再重导出 ``NotificationService`` —— 服务层需显式从
``.service`` 导入，避免包初始化时连带拉入 ``.event_handlers`` 而形成
notification ↔ earthquake 的循环导入。
"""
