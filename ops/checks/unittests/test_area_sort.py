"""HA 房间排序持久化的回归测试（stdlib unittest）。

## 为什么需要这条

``persist_area_sort`` 是本轮从 ``api/ha/routes.py`` 搬到域层的，同时把「每个 area_id 一条
``SELECT``」改成「一次 ``IN`` 查询」。这类改动有两个容易静默出错的地方：

1. **语义**：``sort_order`` 必须严格等于数组下标（不是「按查询回来的顺序」）；
2. **越界 id**：数组里出现本地不存在的 area_id（HA 已删、本地未同步）时，不能抛错、
   也不能把其余行的顺序错位。

两条都不会在启动或类型检查时暴露，只会在下次打开房间列表时表现为「顺序乱了」。
"""

from __future__ import annotations

import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from homeos.backend.src.db_models import create_all_schemas
from homeos.backend.src.domains.ha.integration.area_admin import persist_area_sort
from homeos.backend.src.platform.core.db.models import HAArea, HAConnection


def _session_and_connection():
    engine = create_engine("sqlite://")
    create_all_schemas(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    connection = HAConnection(
        name="测试",
        base_url="http://127.0.0.1:8123",
        encrypted_access_token="x",  # noqa: S106 - 内存库占位凭据
        is_active=True,
    )
    session = factory()
    session.add(connection)
    # 先 flush 拿到 connection.id：模型的 id 是 ``default=new_uuid``，只在 flush 时求值。
    session.flush()
    for area_id in ("kitchen", "living", "bedroom"):
        session.add(HAArea(connection_id=connection.id, area_id=area_id, name=area_id, sort_order=0))
    session.commit()
    return session, connection


class PersistAreaSortTest(unittest.TestCase):
    def test_assigns_index_in_given_order(self) -> None:
        session, connection = _session_and_connection()
        try:
            updated = persist_area_sort(session, connection.id, ["bedroom", "kitchen", "living"])
            self.assertEqual(updated, 3)
            rows = {
                row.area_id: row.sort_order
                for row in session.scalars(select(HAArea).where(HAArea.connection_id == connection.id)).all()
            }
            self.assertEqual(rows, {"bedroom": 0, "kitchen": 1, "living": 2})
        finally:
            session.close()

    def test_unknown_area_id_does_not_shift_others(self) -> None:
        session, connection = _session_and_connection()
        try:
            # 「ghost」不在本地目录：它占下标 1，其余行仍按自己的下标写。
            updated = persist_area_sort(session, connection.id, ["living", "ghost", "kitchen"])
            self.assertEqual(updated, 2)
            rows = {
                row.area_id: row.sort_order
                for row in session.scalars(select(HAArea).where(HAArea.connection_id == connection.id)).all()
            }
            self.assertEqual(rows["living"], 0)
            self.assertEqual(rows["kitchen"], 2)
            self.assertEqual(rows["bedroom"], 0)  # 未出现在数组里 → 保持原值
        finally:
            session.close()

    def test_empty_list_is_noop(self) -> None:
        session, connection = _session_and_connection()
        try:
            self.assertEqual(persist_area_sort(session, connection.id, []), 0)
        finally:
            session.close()

    def test_other_connection_untouched(self) -> None:
        """同名 area_id 挂在另一条连接上时不能被改（``connection_id`` 必须参与过滤）。"""
        session, connection = _session_and_connection()
        try:
            other = HAConnection(
                name="另一台",
                base_url="http://10.0.0.2:8123",
                encrypted_access_token="y",  # noqa: S106 - 同上
                is_active=False,
            )
            session.add(other)
            session.flush()
            session.add(HAArea(connection_id=other.id, area_id="living", name="living", sort_order=99))
            session.commit()
            persist_area_sort(session, connection.id, ["living"])
            other_row = session.scalars(select(HAArea).where(HAArea.connection_id == other.id)).one()
            self.assertEqual(other_row.sort_order, 99)
        finally:
            session.close()


if __name__ == "__main__":
    unittest.main()
