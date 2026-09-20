"""退款流水的落库辅助。

后台退款接口在渠道拒绝时**必须**返回 409，而 409 会让整个请求事务回滚。
如果退款流水和请求共用事务，那么「试过退款、但渠道拒绝了」这件事在库里就查不到，
只能翻日志。后果是运营侧的盲区：

* 某个渠道在持续拒绝退款（密钥过期、商户余额不足）时，后台看起来「什么都没发生」，
  没人会去追；
* 同一笔单被反复点退款、每次都被拒绝，历史记录里只有最后一次成功的那条，
  对不上「这笔单为什么退了好几次」的账。

所以失败尝试要在一个**独立事务**里落库，语义上和 ``api.store`` 里记录限流失败的
``record_attempt_in_new_session`` 完全一致：即使本次请求失败也要留下痕迹。
"""

from __future__ import annotations

import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from store.core.models import OrderRefund

logger = logging.getLogger("store.payments.refunds")


def record_refund_in_new_session(session: Session, refund: OrderRefund) -> bool:
    """在独立事务里写入一条退款流水，返回是否写入成功。

    调用方传入的 ``refund`` 必须是**游离对象**（还没 ``session.add`` 到请求事务
    里）—— 否则它已经绑定在请求会话上，再挂到新会话会触发 SQLAlchemy 的
    「object already attached to session」错误。

    写入失败一律吞掉并告警：这是审计流水，不能因为它写不进去就把用户的
    「退款被拒绝」升级成 500 —— 那会让运营以为是系统故障而不是渠道拒单。
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
