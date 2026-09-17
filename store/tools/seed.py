"""初始化商店数据：管理员账号、商品目录、版本记录。

用法::

    STORE_ADMIN_EMAIL=you@example.com STORE_ADMIN_PASSWORD='…' python -m store.tools.seed

管理员凭据**必须**由 ``STORE_ADMIN_EMAIL`` / ``STORE_ADMIN_PASSWORD`` 提供：
缺失时直接退出，不会用代码里写死的默认口令建号。这是刻意的 —— 硬编码的默认管理员
等于给每个照文档部署的实例装一个公开后门（早期版本确实如此，口令出现在公开的
README 里）。若库里已存在管理员，则可以不带凭据重复执行（只补商品与配置）。

幂等：重复执行只会补齐缺失的数据，不会覆盖已有商品与账号。
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from store.app import create_app
from store.bootstrap import ensure_default_products, ensure_default_settings
from store.config import load_settings
from store.release_info import ensure_current_release
from store.models import Account, Product, StoreSetting
from store.security import hash_password, utcnow

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
logger = logging.getLogger("store.seed")

#: 缺失管理员凭据时的退出提示。刻意把「以前有默认口令」这件事写进文案：
#: 从旧版本升级过来的部署需要知道为什么现在跑不起来了。
MISSING_ADMIN_CREDENTIALS = (
    "缺少管理员凭据：请设置 STORE_ADMIN_EMAIL 与 STORE_ADMIN_PASSWORD 后再执行 seed。\n"
    "  例：STORE_ADMIN_EMAIL=you@example.com STORE_ADMIN_PASSWORD='一个足够强的口令' \\\n"
    "        python -m store.tools.seed\n"
    "说明：早期版本在缺省时会用代码里写死的口令建管理员（且该口令公开在 README 里），\n"
    "      那等于给每个照文档部署的实例装一个公开后门，现已移除。\n"
    "      若库里已经有管理员账号，可以不带凭据重复执行本命令（只补商品与站点配置）。"
)

def seed_admin(session: Session, email: str, password: str) -> Account:
    account = session.scalars(
        select(Account).where(func.lower(Account.email) == email.lower())
    ).first()
    if account is not None:
        if not account.is_admin:
            account.is_admin = True
        if account.email_verified_at is None:
            account.email_verified_at = utcnow()
        session.flush()
        logger.info("管理员已存在：%s", email)
        return account
    account = Account(
        email=email.lower(),
        password_hash=hash_password(password),
        is_admin=True,
        is_active=True,
        email_verified_at=utcnow(),
    )
    session.add(account)
    session.flush()
    logger.info("已创建管理员：%s", email)
    return account


def existing_admin(session: Session) -> Account | None:
    """返回库里已有的管理员（任一），没有则 None。"""
    return session.scalars(
        select(Account).where(Account.is_admin.is_(True)).limit(1)
    ).first()


# --------------------------------------------------------------------------- #
# 供脚本调用的「补齐 + 取回」包装
# --------------------------------------------------------------------------- #
# 真正的写入逻辑只有 ``store.bootstrap`` 一份（连同 ``app.py`` 启动流程一起用），
# 这里不再重复定义，只负责在同一次事务里把结果取回来。smoke 需要商品 id 才能下单，
# 而 ``ensure_default_products`` 按幂等契约不返回任何东西，所以包一层。
# 历史上这三份逻辑在 seed.py 与 bootstrap.py 各写了一遍，改一处漏一处（38c6658），
# 才收敛成现在这样：写入永远只有 bootstrap 一个来源。


def seed_settings(session: Session) -> StoreSetting | None:
    """幂等补齐站点配置并返回该行（不存在则为 None）。"""
    ensure_default_settings(session)
    return session.get(StoreSetting, 1)


def seed_products(session: Session) -> dict[str, Product]:
    """幂等补齐默认商品并返回 ``{product_type: Product}``。"""
    ensure_default_products(session)
    return {product.product_type: product for product in session.scalars(select(Product))}


def seed_release(session: Session) -> None:
    """幂等补齐 docker 渠道的当前版本记录。"""
    ensure_current_release(session)


def main() -> None:
    settings = load_settings()
    admin_email = (settings.bootstrap_admin_email or "").strip().lower()
    admin_password = settings.bootstrap_admin_password or ""
    has_credentials = bool(admin_email and admin_password)

    if not has_credentials and not settings.database_path.exists():
        # 全新安装又没有凭据：直接退出，连库和密钥都不要建 —— 免得留下一个
        # 「半初始化、且没有管理员」的目录让后续启动进入更迷惑的状态。
        raise SystemExit(MISSING_ADMIN_CREDENTIALS)

    app = create_app(settings)
    with app.state.database.session() as session:
        admin = existing_admin(session)
        if not has_credentials and admin is None:
            raise SystemExit(MISSING_ADMIN_CREDENTIALS)

        ensure_default_settings(session)
        ensure_default_products(session)
        ensure_current_release(session)
        if has_credentials:
            admin = seed_admin(session, admin_email, admin_password)
        else:
            logger.info(
                "未提供 STORE_ADMIN_EMAIL / STORE_ADMIN_PASSWORD，但库里已有管理员 %s："
                "跳过管理员初始化（只补商品与站点配置）。",
                admin.email,
            )

    print()
    print("初始化完成。")
    print(f"  数据目录: {settings.data_dir}")
    print(f"  数据库:   {settings.database_path}")
    print(f"  密钥目录: {settings.license_keys_dir}")
    print(f"  管理后台: {settings.public_base_url}/admin")
    print(f"  管理员:   {admin.email if admin is not None else '（未变更）'}")
    print()


if __name__ == "__main__":
    main()
