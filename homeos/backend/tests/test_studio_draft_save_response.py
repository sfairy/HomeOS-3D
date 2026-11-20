"""户型草图保存的响应契约：``previousRevision`` / ``persistenceState``。

0.8.7 的 ``PUT /studio3d`` 除了新修订号，还回「上一修订」和「持久化状态」，全局日志据此
渲染「原修订 / 持久化状态」两列（前端 ``logging/global-log.ts`` 已有这两个标签）。

本项目的草稿是 ``studio_drafts`` 单行表：提交即生效，**没有**上游那种
「DB 已提交、镜像文件待补写」的中间态，所以状态只有一档。这里锁住：
1. 首次保存时上一修订是 0；
2. 第二次保存时上一修订是上一次的新修订；
3. 状态文案与日志上下文同源（不要在路由里另写一份字面量）。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.studio3d import service
from src.domains.studio3d.schemas import Studio3DDraftUpdate
from src.platform.core.db.models import Base


class StudioDraftSaveResponseTest(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        self.addCleanup(engine.dispose)
        self.factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _save(self, revision: int, scene_version: int) -> dict:
        payload = Studio3DDraftUpdate(revision=revision, scene={"schemaVersion": scene_version})
        with self.factory() as session:
            # `settings` 只在清理逻辑里透传，本用例不触发身份变化，传 None 即可。
            return service.save_draft(session, None, None, payload)

    def test_reports_previous_revision_and_state(self) -> None:
        first = self._save(0, 8)
        self.assertEqual(first["revision"], 1)
        self.assertEqual(first["previousRevision"], 0)
        self.assertEqual(first["persistenceState"], service.DRAFT_PERSISTED_STATE)

        second = self._save(1, 8)
        self.assertEqual(second["revision"], 2)
        self.assertEqual(second["previousRevision"], 1)
        self.assertEqual(second["persistenceState"], service.DRAFT_PERSISTED_STATE)

    def test_state_wording_has_no_pending_variant(self) -> None:
        # 本项目不存在「文件待交付」这一档：如果谁把上游的字面量搬过来，
        # 用户会在日志里看到一句永远不可能发生的状态。
        self.assertNotIn("文件", service.DRAFT_PERSISTED_STATE)

    def test_stale_revision_still_conflicts(self) -> None:
        self._save(0, 8)
        with self.assertRaises(Exception) as raised:
            self._save(0, 8)
        self.assertEqual(getattr(raised.exception, "status_code", None), 409)


if __name__ == "__main__":
    unittest.main()
