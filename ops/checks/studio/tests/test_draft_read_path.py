"""草稿读路径「一条查询 + 不写库 + 不深拷贝整篇文档」的契约测试（路线图 `draft-latency`）。

`GET /projects/{id}/draft` 是编辑器与展示端的首屏数据源，也是后端并发 p95 最高的读接口。
它原来的成本里有两块是纯浪费，而且都不会**报错**、只会慢：

1. 两次 `database.get`：草稿行一次、全局弹窗状态行一次。后者走
   `global_popup_state()`，行不存在时会 **INSERT + flush** —— 一个 GET 顺手写库。
2. `hydrate_document_popups` 对 30~40KB 的 document 做 `deepcopy`，而这份 document
   本来就是本次请求 `json.loads` 出来的临时对象。

这里把三件事钉死：join 查询就是一条 SELECT、缺弹窗行时不产生任何写、原地挂载不会
改到输入（共享引用仍须走 `hydrate_document_popups` 的深拷贝版本）。
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = REPO_ROOT / "homeos" / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.api.projects import select_draft_with_popups
from src.domains.ui_config.global_popups import (
    GLOBAL_POPUP_STATE_ID,
    apply_popups_to_document,
    hydrate_document_popups,
    parse_popups_json,
)
from src.platform.core.db.database import Base
from src.platform.core.db.models import GlobalCustomPopupState, ProjectDraft

PROJECT_ID = "project-1"
DOCUMENT = {"pages": [{"id": "page-1", "components": [{"id": "c1"}]}], "customPopups": []}


class StatementCounterFactory:
    """记录引擎上执行过的语句，按首关键字归类（用来断言「一条 SELECT、零写」）。"""

    def __init__(self, engine):
        self.engine = engine
        self.statements: list[str] = []

    def start(self):
        self.statements.clear()
        event.listen(self.engine, "before_cursor_execute", self._record)
        return self

    def _record(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(statement.strip().split(None, 1)[0].upper())

    def counts(self):
        tally: dict[str, int] = {}
        for keyword in self.statements:
            tally[keyword] = tally.get(keyword, 0) + 1
        event.remove(self.engine, "before_cursor_execute", self._record)
        return tally


def make_database():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    return engine


class DraftReadQueryTest(unittest.TestCase):
    def setUp(self):
        self.engine = make_database()
        self.counter = StatementCounterFactory(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def _insert_draft(self, session: Session):
        session.add(
            ProjectDraft(
                project_id=PROJECT_ID,
                schema_version=8,
                revision=3,
                document_json=json.dumps(DOCUMENT, ensure_ascii=False),
                updated_by="user-1",
            )
        )
        session.commit()

    def test_join_reads_draft_and_popups_in_a_single_select(self):
        with Session(self.engine) as session:
            self._insert_draft(session)
            session.add(
                GlobalCustomPopupState(
                    id=GLOBAL_POPUP_STATE_ID, revision=7, popups_json=json.dumps([{"id": "popup-1"}])
                )
            )
            session.commit()
            session.expunge_all()

            self.counter.start()
            row = session.execute(select_draft_with_popups(PROJECT_ID)).first()
            counts = self.counter.counts()

        self.assertIsNotNone(row)
        self.assertEqual(counts, {"SELECT": 1})
        self.assertEqual(row.revision, 3)
        self.assertEqual(row.schema_version, 8)
        self.assertEqual(row.popup_revision, 7)
        self.assertEqual(parse_popups_json(row.popups_json), [{"id": "popup-1"}])

    def test_missing_popup_row_is_read_only(self):
        """弹窗行不存在时，读路径不能像 `global_popup_state()` 那样顺手插一行。"""
        with Session(self.engine) as session:
            self._insert_draft(session)
            session.expunge_all()

            self.counter.start()
            row = session.execute(select_draft_with_popups(PROJECT_ID)).first()
            counts = self.counter.counts()

        self.assertIsNotNone(row)
        self.assertEqual(counts, {"SELECT": 1})
        self.assertIsNone(row.popup_revision)
        self.assertIsNone(row.popups_json)
        # 调用方按 `global_popup_state()` 会创建出来的默认值处理
        self.assertEqual(int(row.popup_revision or 1), 1)
        self.assertEqual(parse_popups_json(row.popups_json), [])

    def test_missing_draft_returns_no_row(self):
        with Session(self.engine) as session:
            self.counter.start()
            row = session.execute(select_draft_with_popups("nope")).first()

        self.assertIsNone(row)
        self.assertEqual(self.counter.counts(), {"SELECT": 1})


class PopupAttachmentTest(unittest.TestCase):
    def test_apply_mutates_in_place_and_returns_the_same_object(self):
        document = json.loads(json.dumps(DOCUMENT))
        popups = [{"id": "popup-1", "name": "提示"}]

        result = apply_popups_to_document(document, popups)

        self.assertIs(result, document)
        self.assertEqual(result["customPopups"], popups)

    def test_apply_copies_popups_but_not_the_document(self):
        """弹窗列表来自共享存储，必须复制；文档本身是临时对象，不必复制。"""
        document = json.loads(json.dumps(DOCUMENT))
        popups = [{"id": "popup-1"}]

        result = apply_popups_to_document(document, popups)
        result["customPopups"][0]["id"] = "mutated"

        self.assertEqual(popups, [{"id": "popup-1"}], "改到了共享的弹窗列表")
        self.assertEqual(result["pages"], document["pages"])

    def test_apply_filters_by_reference(self):
        document = {
            "pages": [{"components": [{"type": "more-info", "data": {"popupSource": "custom", "popupId": "popup-2"}}]}]
        }
        popups = [{"id": "popup-1"}, {"id": "popup-2"}]

        result = apply_popups_to_document(document, popups, referenced_only=True)

        self.assertEqual([popup["id"] for popup in result["customPopups"]], ["popup-2"])

    def test_hydrate_still_deep_copies_for_shared_inputs(self):
        """其它调用方（PUT / duplicate）传入的是共享对象，必须保持深拷贝语义。"""
        engine = make_database()
        original = json.loads(json.dumps(DOCUMENT))
        with Session(engine) as session:
            session.add(GlobalCustomPopupState(id=GLOBAL_POPUP_STATE_ID, revision=1, popups_json="[]"))
            session.commit()
            hydrated = hydrate_document_popups(session, original)

        hydrated["pages"][0]["components"][0]["id"] = "mutated"
        self.assertEqual(original["pages"][0]["components"][0]["id"], "c1")
        engine.dispose()


class ParsePopupsTest(unittest.TestCase):
    def test_non_array_and_broken_json_fall_back_to_empty(self):
        self.assertEqual(parse_popups_json(None), [])
        self.assertEqual(parse_popups_json(""), [])
        self.assertEqual(parse_popups_json("not json"), [])
        self.assertEqual(parse_popups_json('{"id": 1}'), [])
        self.assertEqual(parse_popups_json('[{"id": "a"}]'), [{"id": "a"}])


if __name__ == "__main__":
    unittest.main()
