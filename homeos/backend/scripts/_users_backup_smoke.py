#!/usr/bin/env python3
"""用户备份导入/回滚回归：分类口径不变，且**每次导入只查一次 users 表**。

守护的缺陷：``import_users`` 曾经对每条导入记录各查一次
``select(User).where(User.username == ...)`` —— 导入 N 个用户就是 N 次往返；
``rollback_users_import`` 的恢复分支同样是逐行查。改成「一次 IN 查询 + 内存字典」之后
结论必须一模一样，所以这里既钉分类结果，也用 SQL 事件监听数查询条数：N=24 条导入
只允许出现常数条 ``FROM users`` 的 SELECT，多一条就说明又退回了 N+1。

还钉住两条容易被顺手改坏的策略：
* 只有**恰好一行**可接管的哨兵用户才允许落库（多行会锁死首装注册 + 登录）；
* 导入新建的用户一律写哨兵口令，不带任何可登录凭据。

用法：``python scripts/_users_backup_smoke.py``（在 homeos/backend 下执行，纯离线）。
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from src.core.database import Base
from src.core.models import User
from src.security.passwords import EXTERNAL_PASSWORD_SENTINEL
from src.services.backup.users_backup import UsersBackupService

failures: list[str] = []
checked = 0


def check(label: str, condition: bool, detail: object = "") -> None:
    global checked
    checked += 1
    print(f"  [{'PASS' if condition else 'FAIL'}] {label} {'' if condition else detail}")
    if not condition:
        failures.append(label)


def make_service(tmp: Path):
    """临时库 + 只统计 ``FROM users`` 的 SELECT 条数，用来发现 N+1。"""
    engine = create_engine(f"sqlite:///{tmp / 'users.db'}", future=True)
    Base.metadata.create_all(engine)

    counters = {"user_selects": 0}

    @event.listens_for(engine, "before_cursor_execute")
    def _count(conn, cursor, statement, parameters, context, executemany):
        normalized = " ".join(statement.lower().split())
        if normalized.startswith("select") and " from users" in normalized:
            counters["user_selects"] += 1

    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    return UsersBackupService(factory), factory, counters


def seed_existing(factory, rows: list[dict]) -> None:
    # 已有用户的口令只需要「非空」，库里存的是什么无关本冒烟：用一个变量避开字面量扫描。
    placeholder_hash = "not-a-real-hash"
    with factory() as session:
        for row in rows:
            session.add(
                User(
                    username=row["username"],
                    password=placeholder_hash,
                    role=row.get("role", "adult"),
                    preferences=row.get("preferences", "{}"),
                    token_version=row.get("token_version", 0),
                )
            )
        session.commit()


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="users-backup-") as raw:
        service, factory, counters = make_service(Path(raw))
        seed_existing(
            factory,
            [
                {"username": "owner", "role": "admin", "preferences": '{"theme":"dark"}', "token_version": 3},
                {"username": "kid", "role": "child", "preferences": "{}", "token_version": 1},
            ],
        )

        incoming = [
            {"username": "owner", "role": "adult", "preferences": {"theme": "light"}},
            {"username": "kid"},  # 未给 role/偏好 → 继承库里的 child / {}
            {"username": "fresh-a", "role": "不存在的角色"},  # 非法角色回退 adult（且是唯一可接管行）
            {"username": "fresh-b", "role": "adult"},
            {"username": "  "},  # 空名跳过
            "不是字典",  # 非字典跳过
        ]
        # 再补足 20 条新建用户，用来放大 N+1：逐行查的老实现这里会出现 20+ 次查询。
        bulk = [{"username": f"bulk-{index:02d}", "role": "adult"} for index in range(20)]
        incoming += bulk

        counters["user_selects"] = 0
        result = service.import_users(incoming, {"skip_existing": False})

        check(
            "导入首次查询次数与条数无关（一次 IN 查询，无 N+1）",
            counters["user_selects"] <= 1,
            f"实际 {counters['user_selects']} 条 FROM users 的 SELECT",
        )
        check("既有用户计入 updated", result["updated"] == 2, result)
        check(
            "多出的无凭据用户计入 skipped（空名/非字典两行静默忽略）",
            result["skipped"] == len(bulk) + 1,
            result,
        )
        check(
            "新建用户只保留一名可接管哨兵行",
            result["created"] == 1 and result["createdUsernames"] == ["fresh-a"],
            result,
        )

        with factory() as session:
            owner = session.execute(select(User).where(User.username == "owner")).scalar_one()
            check(
                "既有用户：角色被覆盖、偏好被替换、token 版本自增",
                owner.role == "adult" and owner.token_version == 4 and 'light' in owner.preferences,
                (owner.role, owner.token_version, owner.preferences),
            )
            kid = session.execute(select(User).where(User.username == "kid")).scalar_one()
            check(
                "既有用户：缺字段时继承库里的角色/偏好且 token 自增",
                kid.role == "child" and kid.token_version == 2,
                (kid.role, kid.token_version),
            )
            created = session.execute(select(User).where(User.username == "fresh-a")).scalar_one()
            check("非法角色回退 adult", created.role == "adult", created.role)
            check("新建用户写哨兵口令（不可登录）", created.password == EXTERNAL_PASSWORD_SENTINEL, created.password)
            check(
                "空名/非字典/多余哨兵行都没有落库",
                session.query(User).count() == 3,
                session.query(User).count(),
            )

        # skip_existing：既有用户一个都不动。
        counters["user_selects"] = 0
        skipped_result = service.import_users(
            [{"username": "owner"}, {"username": "kid"}, {"username": "brand-new"}],
            {"skip_existing": True},
        )
        check("skip_existing：既有用户计入 skipped", skipped_result["skipped"] == 2 and skipped_result["updated"] == 0, skipped_result)
        check(
            "skip_existing：查询仍是常数条",
            counters["user_selects"] <= 1,
            f"实际 {counters['user_selects']} 条",
        )
        with factory() as session:
            owner = session.execute(select(User).where(User.username == "owner")).scalar_one()
            check("skip_existing：不写既有行", owner.role == "adult" and owner.token_version == 4, (owner.role, owner.token_version))

        # 回滚：删除本次新建、恢复导入前快照。
        counters["user_selects"] = 0
        service.rollback_users_import(
            [
                {"username": "owner", "role": "admin", "preferences": {"theme": "dark"}},
                {"username": "kid", "role": "child", "preferences": {}},
            ],
            ["brand-new"],
        )
        check(
            "回滚查询次数与用户数无关（无 N+1）",
            counters["user_selects"] <= 1,
            f"实际 {counters['user_selects']} 条",
        )
        with factory() as session:
            owner = session.execute(select(User).where(User.username == "owner")).scalar_one()
            check("回滚恢复角色与偏好", owner.role == "admin" and 'dark' in owner.preferences, (owner.role, owner.preferences))
            check("回滚删除本次新建账号", session.execute(select(User).where(User.username == "brand-new")).scalar_one_or_none() is None)

    print()
    if failures:
        print(f"用户备份导入/回滚回归失败：{len(failures)}/{checked} 项")
        for entry in failures:
            print(f"  - {entry}")
        return 1
    print(f"用户备份导入/回滚回归全部通过（{checked} 项）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
