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
from store.config import load_settings
from store.release_info import ensure_current_release
from store.models import Account, Product, ProductImage, Release, StoreSetting
from store.security import hash_password, utcnow
from store.serializers import list_json

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

#: 与参考站 pay.habridge.cn 实测完全一致的功能码清单
BASE_PRODUCT_FEATURES = [
    "api",
    "assets",
    "display",
    "editor",
    "ha.configure",
    "ha.control",
    "ha.sync",
    "projects.write",
    "runtime.websocket",
]
MODULE_3D_FEATURES = ["module.3d_interaction"]


def seed_admin(session: Session, email: str, password: str) -> Account:
    account = session.scalars(
        select(Account).where(func.lower(Account.email) == email.lower())
    ).first()
    if account is not None:
        if not account.is_admin:
            account.is_admin = True
        # 管理员是运营在服务端直接建出来的，邮箱归属早已确定：留空会让这个账号
        # 被 ``_require_verified`` 挡在「看订单 / 下单」之外，而它自己又没有任何
        # 触发验证码的入口（注册走不到、后台建号也不发码）。
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
        # 同上：服务端建号即视为已验证，否则新装出来的管理员一步都走不动
        email_verified_at=utcnow(),
    )
    session.add(account)
    session.flush()
    logger.info("已创建管理员：%s", email)
    return account


def seed_products(session: Session) -> dict[str, Product]:
    """写入三条与参考站对齐的商品。返回 {'base','module','package': Product}。"""
    existing = {product.product_type: product for product in session.scalars(select(Product))}
    if {"base", "module", "package"}.issubset(existing.keys()):
        logger.info("商品目录已存在，跳过。")
        return existing

    base = existing.get("base")
    if base is None:
        base = Product(
            name="编辑器+绘制工具",
            product_code="homeos",
            price_cents=4990,
            validity_days=None,
            product_type="base",
            feature_codes_json=list_json(BASE_PRODUCT_FEATURES),
            included_product_ids_json=list_json([]),
            active=True,
            display_description="如需3D交互可后续再账号中心升级",
            sort_order=100,
            fulfillment_mode="automatic",
        )
        session.add(base)
        session.flush()

    module = existing.get("module")
    if module is None:
        module = Product(
            name="3D交互包",
            product_code="homeos",
            price_cents=3990,
            validity_days=None,
            product_type="module",
            feature_codes_json=list_json(MODULE_3D_FEATURES),
            included_product_ids_json=list_json([]),
            active=True,
            sort_order=100,
            fulfillment_mode="automatic",
            requires_license=True,
        )
        session.add(module)
        session.flush()

    package = existing.get("package")
    if package is None:
        package = Product(
            name="编辑器+绘制工具+3D交互",
            product_code="homeos",
            price_cents=7990,
            validity_days=None,
            product_type="package",
            feature_codes_json=list_json(BASE_PRODUCT_FEATURES + MODULE_3D_FEATURES),
            included_product_ids_json=list_json([module.id]),
            active=True,
            sort_order=100,
            fulfillment_mode="automatic",
        )
        session.add(package)
        session.flush()

    logger.info(
        "已写入商品：%s / %s / %s", base.name, module.name, package.name
    )
    return {"base": base, "module": module, "package": package}


def seed_release(session: Session) -> None:
    """写入当前版本的发布记录。

    记录内容（版本号、日期、升级说明）统一由 ``store.release_info`` 维护，
    这里只负责在初始化脚本里触发一次，避免同一个版本号写两处、seed 与启动
    时的兜底补写各说各话。
    """
    ensure_current_release(session)


def seed_settings(session: Session) -> StoreSetting:
    setting = session.get(StoreSetting, 1)
    if setting is None:
        setting = StoreSetting(id=1)
        session.add(setting)
        session.flush()
        logger.info("已写入站点默认配置。")
    return setting


def existing_admin(session: Session) -> Account | None:
    """返回库里已有的管理员（任一），没有则 None。"""
    return session.scalars(
        select(Account).where(Account.is_admin.is_(True)).limit(1)
    ).first()


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
            # 库在、但没有任何管理员：仍然拒绝建号。这里不能有「新建库就放宽」的
            # 分支，否则一次误删账号文件就能把实例变回「无主」状态。
            raise SystemExit(MISSING_ADMIN_CREDENTIALS)

        seed_settings(session)
        if has_credentials:
            admin = seed_admin(session, admin_email, admin_password)
        else:
            logger.info(
                "未提供 STORE_ADMIN_EMAIL / STORE_ADMIN_PASSWORD，但库里已有管理员 %s："
                "跳过管理员初始化（只补商品与站点配置）。",
                admin.email,
            )
        seed_products(session)
        seed_release(session)

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
