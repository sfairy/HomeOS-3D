"""告警规则 watch 索引的刷新与「删规则」联动（从 ``entity_references`` 拆出）。

这里只关心一件事：**规则被删掉之后，求值侧必须真的知道**。

历史 bug：通知服务自己 new 了一份 ``AlertRuleWatchIndex``，而实体解绑删除规则时刷新的
是另一个实例 —— 结果规则「删了还在报警」，直到进程重启。因此这里的刷新顺序是：

1. 优先调用注入的 ``refresh_alert_rules``（通知服务的同步刷新，同时更新 ``rules_cache``
   与它的索引）；
2. 没有注入时才退回刷新本地 watch_index（早期启动 / 单测）。

拆出来的动机：``entity_references.py`` 已有 1600+ 行、被文件规模棘轮锁住，而这两段逻辑
与该服务的主体（引用反查）无关。
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import TYPE_CHECKING, Any, NotRequired, TypedDict

from ...platform.core.db.models import AlertRule

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..ha.config.ha_filters import AlertRuleWatchIndex

logger = logging.getLogger("homeos.state_store.alert_watch_index")

#: 打开一次数据库会话的工厂（``Database.session_factory`` 的形状）。
#: 用具体类型而不是 ``Any``：解绑/扫描全部走同步 Session，跨层传 ``Any`` 时
#: 「把 async 工厂传进来」这种错误在运行期才炸，类型收窄后由 pyright 直接拦下。
#: 定义放在本模块而非 ``entity_references``，是因为 ``AlertWatchIndexDeps`` 要用它，
#: 而 ``entity_references`` 是反向依赖本模块的（放那边会成环）。
SessionFactory = Callable[[], AbstractContextManager["Session"]]


class AlertWatchIndexDeps(TypedDict):
    """删规则 / 刷新索引所需的依赖子集（``EntityReferencesDeps`` 继承本类型再补字段）。

    之前这里写的是 ``dict[str, Any]``：TypedDict **不是** ``dict[str, Any]`` 的子类型
    （``dict`` 键值不变，TypedDict 允许缺键），调用方传 ``EntityReferencesDeps`` 会被
    直接判错，所以按实际用到的键声明成结构类型。
    """

    session_factory: SessionFactory
    alert_rule_watch_index: NotRequired[AlertRuleWatchIndex | None]
    delete_alert_rule: NotRequired[Callable[[str], dict[str, Any] | None] | None]
    #: 删规则后同步刷新求值侧缓存（``NotificationService.refresh_alert_rules_sync``）。
    refresh_alert_rules: NotRequired[Callable[[], None] | None]


def refresh_alert_rule_watch_index(deps: AlertWatchIndexDeps) -> None:
    """按 DB 现状刷新本地 watch_index（没有求值侧回调时的兜底）。"""
    watch_index = deps.get("alert_rule_watch_index")
    if watch_index is None:
        return
    # 实体关注索引是全量的：加 limit 会让超出的规则被静默漏掉，告警触发因此丢事件。
    with deps["session_factory"]() as session:
        remaining_rules = session.query(AlertRule).filter(AlertRule.enabled.is_(True)).all()
    watch_index.update_from_rules([{"entityId": rule.entity_id, "enabled": rule.enabled} for rule in remaining_rules])


def refresh_alert_rules_after_delete(deps: AlertWatchIndexDeps) -> None:
    """删除规则后刷新**求值侧**（``rules_cache`` + 真正被读的 watch 索引）。"""
    refresh = deps.get("refresh_alert_rules")
    if callable(refresh):
        try:
            refresh()
            return
        except Exception:  # 刷新失败继续走本地索引，但必须留痕
            logger.warning("删除告警规则后刷新求值缓存失败", exc_info=True)
    refresh_alert_rule_watch_index(deps)


def unlink_alert_rule(deps: AlertWatchIndexDeps, rule_id: str) -> tuple[bool, str]:
    """删除一条告警规则并刷新索引；返回 ``(成功, 说明文案)``。"""
    delete_alert_rule = deps.get("delete_alert_rule")
    if delete_alert_rule is not None:
        delete_result = delete_alert_rule(rule_id)
        if not (isinstance(delete_result, dict) and delete_result.get("success")):
            return False, "删除告警规则失败"
        refresh_alert_rules_after_delete(deps)
        return True, "已删除告警规则"

    try:
        with deps["session_factory"]() as session:
            stored_rule = session.get(AlertRule, rule_id)
            if stored_rule is None:
                return False, "告警规则不存在或删除失败"
            session.delete(stored_rule)
            session.commit()
    except Exception:
        logger.warning("删除告警规则失败: %s", rule_id, exc_info=True)
        return False, "告警规则不存在或删除失败"

    refresh_alert_rules_after_delete(deps)
    return True, "已删除告警规则"


__all__ = [
    "refresh_alert_rule_watch_index",
    "refresh_alert_rules_after_delete",
    "unlink_alert_rule",
]
