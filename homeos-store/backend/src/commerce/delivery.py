"""支付成功后的发码邮件：领取标记、投递、结果落库。

发送必须在入账事务**提交之后**进行（由调用方负责），本模块自己开短会话。
这一点是刻意的：邮件失败绝不能让已经签发的授权回滚，也不能让买家在个人中心看不到码。
"""

from __future__ import annotations

import logging
from datetime import UTC, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError

from ..core.database import Database
from ..core.models import License, Order, StoreSetting, utcnow
from ..ops import incidents, mail_settings, mailer
from ..ops import site_settings as site_config

logger = logging.getLogger("src.commerce.delivery")

#: 自动投递的最大尝试次数（含首次）。用尽后停止自动重试，等人工处理或用户自己
#: 在个人中心点「重发激活码邮件」—— 那个入口不受这个上限约束，但另有按账号限流。
MAX_AUTO_DELIVERY_ATTEMPTS = 3

_CHINA_TZ = timezone(timedelta(hours=8))


def _expires_text(license_row: License) -> str:
    """把授权到期时刻渲染成买家看得懂的一句话（北京时间，与支付宝账单同一口径）。"""
    moment = license_row.access_expires_at
    if moment is None:
        return "永久有效"
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(_CHINA_TZ).strftime("%Y-%m-%d %H:%M") + "（北京时间）"


def notify_license_issued(
    database: Database, *, order_id: str, force: bool = False
) -> dict:
    """把某张订单的激活码发到买家邮箱，返回一个可读的结果字典。

    ``force=True`` 供个人中心的「重发激活码邮件」使用：跳过「已经发过」与「自动重试
    次数用尽」两道闸门，但仍然走同一个领取标记，所以并发重发也只会发出去一封。

    本函数**不抛异常**：它的调用点都在「订单已经履约、授权已经签发」之后，
    任何投递问题都只应该留下 license_email_error 与一条 incident。
    """
    try:
        with database.session() as session:
            setting = site_config.get_setting(session)
            # NULL 当作「开」：这一项默认必须是开，一个空值不该静默关掉发码邮件。
            delivery_enabled = getattr(setting, "delivery_email_enabled", None)
            if delivery_enabled is not None and not bool(delivery_enabled):
                return {"sent": False, "reason": "disabled"}

            order = session.get(Order, order_id)
            if order is None:
                return {"sent": False, "reason": "order_not_found"}
            if order.status != "fulfilled" or not order.license_id:
                return {"sent": False, "reason": "not_fulfilled"}
            license_row = session.get(License, order.license_id)
            if license_row is None:
                return {"sent": False, "reason": "license_not_found"}
            recipient = (order.email or "").strip()
            if not recipient:
                return {"sent": False, "reason": "no_recipient"}

            already_sent = order.license_email_sent_at is not None
            attempts_used = int(order.license_email_attempts or 0)

            # 领取标记：用**条件自增**代替「先读再写」。异步通知、前端轮询、后台巡检
            # 可能同时走到这里，只有一个调用方能把 attempts 推上去，其余 rowcount=0
            # 直接退出 —— 所以买家不会收到重复的激活码邮件。
            conditions = [Order.id == order.id]
            if not force:
                conditions.append(Order.license_email_sent_at.is_(None))
                conditions.append(
                    Order.license_email_attempts < MAX_AUTO_DELIVERY_ATTEMPTS
                )
            claimed = session.execute(
                update(Order)
                .where(*conditions)
                .values(license_email_attempts=Order.license_email_attempts + 1)
                .execution_options(synchronize_session=False)
            )
            if claimed.rowcount == 0:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 动态属性
                return {
                    "sent": False,
                    "reason": "already_sent" if already_sent else "attempts_exhausted",
                }
            # 先把领取标记提交掉：发信是几秒到十几秒的网络等待，绝不能持着 SQLite
            # 写锁做（busy_timeout 只有 5 秒，并发的下单/心跳会直接失败）。
            session.commit()

            result = mailer.send_license_email(
                database.settings,
                setting,
                email=recipient,
                activation_code=license_row.activation_code,
                product_name=license_row.product_name or order.product_name or "HomeOS 授权",
                order_no=order.order_no,
                expires_text=_expires_text(license_row),
                action=order.license_action or "issue",
            )

            try:
                order.license_email_error = (
                    "" if result.delivered else (result.error or "未投递")
                )[:255]
                if result.delivered:
                    order.license_email_sent_at = utcnow()
                session.commit()
            except SQLAlchemyError as error:
                session.rollback()
                incidents.note("delivery.record", order_no=order.order_no, error=error)
                logger.exception("发货邮件结果落库失败 order=%s", order.order_no)

            if result.delivered:
                logger.info(
                    "激活码已邮件送达 order=%s 收件人=%s 第 %d 次尝试",
                    order.order_no,
                    recipient,
                    attempts_used + 1,
                )
            else:
                incidents.note(
                    "delivery", order_no=order.order_no, error=result.error or "未投递"
                )
            return {
                "sent": result.delivered,
                "attempts": attempts_used + 1,
                "mode": result.mode,
                "error": result.error,
            }
    except Exception as error:
        incidents.note("delivery", order_no=order_id, error=error)
        logger.exception("发货邮件流程异常 order=%s", order_id)
        return {"sent": False, "reason": "exception", "error": str(error)[:200]}


def sweep_undelivered(database: Database, *, limit: int = 10) -> int:
    """巡检兜底：把「已履约但激活码邮件还没发出去」的订单补发一遍。

    即时发送可能因为进程重启、后台任务丢失、或当时 SMTP 抖了一下而没发生。
    没有这道网，「钱收了、码发了、信没到」就只能等买家来投诉。
    返回本轮真正发出去的封数。
    """
    with database.session() as session:
        order_ids = list(
            session.scalars(
                select(Order.id)
                .where(Order.status == "fulfilled")
                .where(Order.license_id.isnot(None))
                .where(Order.license_email_sent_at.is_(None))
                .where(Order.license_email_attempts < MAX_AUTO_DELIVERY_ATTEMPTS)
                .order_by(Order.fulfilled_at.desc())
                .limit(max(1, int(limit)))
            )
        )
    sent = 0
    for order_id in order_ids:
        if notify_license_issued(database, order_id=order_id).get("sent"):
            sent += 1
    return sent


def merge_delivery_settings(database: Database, setting: StoreSetting):
    """给调用方一个「当前生效的发信配置」入口（后台改完免重启）。"""
    return mail_settings.merge_mail_settings(database.settings, setting)
