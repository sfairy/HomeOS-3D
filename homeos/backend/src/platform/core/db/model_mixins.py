"""表的增强列（从 ``models.py`` 拆出的声明式 mixin）。

``models.py`` 已经很大。这些列都属于「策略参数」而不是表结构
主干，放在 mixin 里既能被 declarative 正常识别，也不占用主干行数。

两个 mixin 的共同点：**全部缺省 = 旧行为**，因此存量数据升级后语义不变。

``AlertRuleTimingMixin``（告警规则）

- ``forSeconds``：条件需连续成立这么久才告警（持续判定，压掉瞬时尖峰）；
- ``clearDelaySeconds``：条件不成立需持续这么久才解除锁存（回落去抖，压掉边界抖动）；
- ``escalationMinutes``：报出后多久仍未确认就再推一次（升级，补救「用户没看到」）。

``HomeModeExtraMixin``（家庭模式）

- ``conditions``：JSON 数组，全部满足才执行（触发成立 ≠ 应该执行）；
- ``executionMode``：``queued``（默认，等价旧行为）/ ``single`` / ``restart``。
"""

from __future__ import annotations

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class AlertRuleTimingMixin:
    """给 ``AlertRule`` 提供三列时间抑制参数。"""

    for_seconds: Mapped[int] = mapped_column("forSeconds", Integer, nullable=False, default=0)
    clear_delay_seconds: Mapped[int] = mapped_column("clearDelaySeconds", Integer, nullable=False, default=0)
    escalation_minutes: Mapped[int] = mapped_column("escalationMinutes", Integer, nullable=False, default=0)


class AlertRuleStructuredMixin:
    """结构化规则字段（对齐参考 ``notification`` 规则模型）。

    ``condition`` 仍是唯一求值来源；这四列只保存「用户是怎么填出来的」：

    - ``target_state`` / ``operator``：结构化条件（实体 + 运算符 + 目标值），
      写入前编译进 ``condition``，读取时回填给前端做结构化编辑；
    - ``sound``：仅 ``level=critical`` 生效的提示音标识；
    - ``camera_entity_id``：有值时通知带 ``type='doorbell'`` 与快照入口。

    全部可空，缺省 = 旧行为（存量规则不受影响）。
    """

    target_state: Mapped[str | None] = mapped_column("targetState", String(255), nullable=True)
    operator: Mapped[str | None] = mapped_column("operator", String(16), nullable=True)
    sound: Mapped[str | None] = mapped_column("sound", String(64), nullable=True)
    camera_entity_id: Mapped[str | None] = mapped_column("cameraEntityId", String(255), nullable=True)


class HomeModeExtraMixin:
    """给 ``HomeMode`` 提供条件与执行模式两列。"""

    conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_mode: Mapped[str] = mapped_column(
        "executionMode", String(16), nullable=False, default="queued", server_default="queued"
    )


__all__ = ["AlertRuleStructuredMixin", "AlertRuleTimingMixin", "HomeModeExtraMixin"]
