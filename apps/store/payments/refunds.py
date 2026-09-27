"""退款流水的落库辅助。
"""

from __future__ import annotations

import logging

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from apps.store.core.models import OrderRefund

logger = logging.getLogger("apps.store.payments.refunds")


def record_refund_in_new_session(session: Session, refund: OrderRefund) -> bool:
    """在独立事务里写入一条退款流水，返回是否写入成功。
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
