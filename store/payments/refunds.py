"""退款流水的落库辅助。

后台退款接口在渠道拒绝时**必须**返回 409，而 409 会让整个请求事务回滚 —— 如果退款流水
和请求共用事务，「试过退款、但渠道拒绝了」这件事在库里就查不到，只能翻日志。后果是
运营侧盲区：渠道持续拒绝退款时后台看起来「什么都没发生」，同一笔单反复被拒也只留下
最后一条记录。失败尝试要在**独立事务**里落库，即使本次请求失败也要留下痕迹。
"""

from __future__ import annotations

import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from store.core.models import OrderRefund

logger = logging.getLogger("store.payments.refunds")


def record_refund_in_new_session(session: Session, refund: OrderRefund) -> bool:
    """在独立事务里写入一条退款流水，返回是否写入成功。

    传入的 ``refund`` 必须是**游离对象**（还没 add 到请求事务里），否则挂到新会话会触发
    「object already attached to session」。写入失败一律吞掉并告警：审计流水不能因为它
    写不进去就把「退款被拒绝」升级成 500。
    """
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    try:
        with factory() as probe:
            probe.add(refund)
            probe.commit()
    except SQLAlchemyError:
        logger.warning(
            "退款流水写入失败 order=%s out_request_no=%s",
            refund.order_no,
            refund.out_request_no,
            exc_info=True,
        )
        return False
    return True
