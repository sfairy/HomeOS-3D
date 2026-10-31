"""T3 回归：家庭模式「当前激活模式」指针排序必须与 get_active_modes 一致。

多互斥组允许同时存在多条 isActive 记录。前端主模式按 priority 降序、sortOrder
升序展示；重启恢复的内存指针（_load_active_mode_row）和无参停用的兜底目标
（_find_first_active）以前分别「无排序」「只按 sortOrder」，会与展示的主模式
错位：用户点停用，停掉的是另一组模式。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"

# 后端是 python -m src.run 的 src 包；只把 backend 根目录放进 path。
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.domains.home_mode.service import HomeModeService
from src.platform.core.db.models import HomeMode


def build_service() -> tuple[HomeModeService, Any]:
    engine = create_engine("sqlite:///:memory:")
    HomeMode.__table__.create(engine)
    factory = sessionmaker(bind=engine)
    service = object.__new__(HomeModeService)
    service._session_factory = factory
    with factory() as session:
        # 低优先级但 sortOrder 在前：只按 sortOrder 排序会选中它（错误）。
        session.add(
            HomeMode(
                id="mode-low",
                name="低优先级",
                config="[]",
                is_active=True,
                sort_order=1,
                exclusive_group="group-low",
                priority=10,
                triggers="[]",
            )
        )
        # 高优先级但 sortOrder 在后：前端主模式是它。
        session.add(
            HomeMode(
                id="mode-high",
                name="高优先级",
                config="[]",
                is_active=True,
                sort_order=5,
                exclusive_group="group-high",
                priority=50,
                triggers="[]",
            )
        )
        session.commit()
    return service, engine


class ActiveModeOrderingTest(unittest.TestCase):
    def test_load_active_mode_row_uses_display_priority(self) -> None:
        service, _engine = build_service()
        active = service._load_active_mode_row()
        assert active is not None
        self.assertEqual(active["id"], "mode-high")

    def test_find_first_active_matches_display_priority(self) -> None:
        service, _engine = build_service()
        first = service._find_first_active()
        assert first is not None
        self.assertEqual(first["id"], "mode-high")


if __name__ == "__main__":
    unittest.main()
