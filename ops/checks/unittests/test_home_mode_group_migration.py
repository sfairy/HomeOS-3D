"""家庭模式分组归一的迁移回归测试（v10）。

## 为什么要测

这条迁移会**改动用户数据**：把旧 ``comfort`` 组拆成「家庭状态」/「叠加活动」，
并在同组出现多条激活时只保留一条。写错一个 WHERE 就会：

- 撞上 ``home_modes_exclusive_active_uidx`` 让升级直接失败（启动不了）；
- 或者悄悄停用用户正在用的模式，且把设备快照一起丢掉（再也恢复不了）。

所以这里用一个带真实部分唯一索引的临时库跑迁移，断言「归一正确、冲突被收敛、
快照被保留」。
"""

from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from homeos.backend.src.platform.core.db.migrations import _home_mode_activity_groups, _home_mode_settle_column

_CREATE_SQL = """
CREATE TABLE home_modes (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    icon VARCHAR(64) NOT NULL DEFAULT 'home',
    config TEXT NOT NULL,
    triggers TEXT,
    isActive BOOLEAN NOT NULL DEFAULT 0,
    deviceSnapshot TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    exclusiveGroup VARCHAR(64),
    priority INTEGER NOT NULL DEFAULT 50
)
"""
_UNIQUE_INDEX_SQL = (
    "CREATE UNIQUE INDEX home_modes_exclusive_active_uidx ON home_modes (exclusiveGroup) WHERE isActive = 1"
)


def _seed(connection: sqlite3.Connection, rows: list[tuple[object, ...]]) -> None:
    connection.executemany(
        "INSERT INTO home_modes (id, name, config, triggers, isActive, deviceSnapshot, sortOrder, exclusiveGroup, priority)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )


class HomeModeGroupMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name) / "homeos.db"
        self.connection = sqlite3.connect(self.path)
        self.connection.execute(_CREATE_SQL)
        self.connection.execute(_UNIQUE_INDEX_SQL)

    def tearDown(self) -> None:
        self.connection.close()
        self._tmp.cleanup()

    def _apply(self) -> None:
        _home_mode_settle_column(self.connection, None)  # type: ignore[arg-type]
        self.connection.commit()

    def _rows(self) -> dict[str, dict[str, object]]:
        cursor = self.connection.execute(
            "SELECT id, name, exclusiveGroup, isActive, deviceSnapshot, settleMinutes FROM home_modes"
        )
        return {
            str(row[0]): {
                "name": row[1],
                "group": row[2],
                "active": bool(row[3]),
                "snapshot": row[4],
                "settle": row[5],
            }
            for row in cursor
        }

    def test_split_comfort_group_by_semantics(self) -> None:
        _seed(
            self.connection,
            [
                (
                    "home",
                    "回家模式",
                    "[]",
                    '[{"type": "lock_unlock", "entityId": "lock.da_men"}]',
                    0,
                    None,
                    0,
                    "default",
                    50,
                ),
                (
                    "sleep",
                    "睡眠模式",
                    "[]",
                    '[{"type": "time", "at": "22:30"}]',
                    1,
                    '{"light.a": {}}',
                    2,
                    "comfort",
                    80,
                ),
                ("cinema", "影音模式", "[]", None, 0, None, 3, "comfort", 50),
                ("dining", "用餐模式", "[]", None, 0, None, 4, "comfort", 50),
            ],
        )
        self.connection.commit()
        self._apply()
        rows = self._rows()
        self.assertEqual(rows["sleep"]["group"], "default", "睡眠是家庭状态，不是叠加活动")
        self.assertEqual(rows["cinema"]["group"], "overlay", "影音应归为叠加活动")
        self.assertEqual(rows["dining"]["group"], "overlay", "用餐应归为叠加活动")
        self.assertEqual(rows["home"]["group"], "default")

    def test_arrival_mode_gets_settle_window(self) -> None:
        _seed(
            self.connection,
            [
                (
                    "home",
                    "回家模式",
                    "[]",
                    '[{"type": "lock_unlock", "entityId": "lock.a"}]',
                    0,
                    None,
                    0,
                    "default",
                    50,
                ),
                (
                    "away",
                    "离家模式",
                    '[{"kind": "security", "entity_id": "armed_away"}]',
                    None,
                    0,
                    None,
                    1,
                    "default",
                    50,
                ),
                ("custom", "书房模式", "[]", None, 0, None, 2, "default", 50),
            ],
        )
        self.connection.commit()
        self._apply()
        rows = self._rows()
        self.assertEqual(rows["home"]["settle"], 20, "到家类模式默认 20 分钟回落")
        self.assertEqual(rows["away"]["settle"], 0, "离家模式不回落（没人在家要一直保持）")
        self.assertEqual(rows["custom"]["settle"], 0, "普通模式不自动回落")

    def test_existing_settle_is_not_overwritten(self) -> None:
        _seed(
            self.connection,
            [("home", "回家模式", "[]", '[{"type": "arrive_home"}]', 0, None, 0, "default", 50)],
        )
        self.connection.commit()
        self.connection.execute("ALTER TABLE home_modes ADD COLUMN settleMinutes INTEGER NOT NULL DEFAULT 45")
        self._apply()
        self.assertEqual(self._rows()["home"]["settle"], 45, "已配置的回落时间不能被迁移覆盖")

    def test_conflict_keeps_highest_priority_and_snapshot(self) -> None:
        """归一后同组出现两条激活时：留高优先级，另一条停用但保留快照。

        真实的冲突来源：睡眠在 ``comfort``、回家在 ``default``，两条都激活；
        睡眠归一到 ``default`` 后就与回家同组，而部分唯一索引只允许一条。
        """
        _seed(
            self.connection,
            [
                ("sleep", "睡眠模式", "[]", None, 1, '{"light.a": {}}', 2, "comfort", 80),
                ("home", "回家模式", "[]", None, 1, '{"light.c": {}}', 0, "default", 50),
                ("cinema", "影音模式", "[]", None, 0, None, 3, "comfort", 50),
            ],
        )
        self.connection.commit()
        self._apply()
        rows = self._rows()
        active_default = [key for key, row in rows.items() if row["active"] and row["group"] == "default"]
        self.assertEqual(active_default, ["sleep"], f"应只保留优先级最高的睡眠：{rows}")
        self.assertEqual(rows["home"]["snapshot"], '{"light.c": {}}', "被停用的模式必须保留快照")
        self.assertFalse(rows["home"]["active"], "优先级低的那条要停用")
        self.assertEqual(rows["cinema"]["group"], "overlay", "非激活的活动模式照常归一")

    def test_manual_activity_moves_from_default_to_overlay(self) -> None:
        """吃饭不该顶掉「回家」：手动型活动从 default 挪到 overlay。"""
        _seed(
            self.connection,
            [
                (
                    "dining",
                    "用餐模式",
                    '[{"entity_id": "light.can_ting", "service": "turn_on"}]',
                    None,
                    0,
                    None,
                    4,
                    "default",
                    50,
                ),
                (
                    "home",
                    "回家模式",
                    "[]",
                    '[{"type": "lock_unlock", "entityId": "lock.a"}]',
                    1,
                    None,
                    0,
                    "default",
                    50,
                ),
                ("sleep", "睡眠模式", "[]", '[{"type": "time", "at": "22:30"}]', 0, None, 2, "default", 80),
                ("custom", "书房模式", "[]", None, 0, None, 5, "default", 50),
            ],
        )
        self.connection.commit()
        _home_mode_settle_column(self.connection, None)  # type: ignore[arg-type]
        _home_mode_activity_groups(self.connection, None)  # type: ignore[arg-type]
        self.connection.commit()
        rows = self._rows()
        self.assertEqual(rows["dining"]["group"], "overlay", "手动活动应归入叠加活动")
        self.assertEqual(rows["home"]["group"], "default", "有开锁触发的是家庭状态")
        self.assertEqual(rows["sleep"]["group"], "default", "有定时触发的是家庭状态")
        self.assertEqual(rows["custom"]["group"], "default", "名称不命中活动关键词的不动")

    def test_security_activity_stays_base_state(self) -> None:
        """布防决定家庭状态：带安防动作的「派对模式」不能被挪进叠加活动。"""
        _seed(
            self.connection,
            [
                (
                    "party",
                    "派对模式",
                    '[{"kind": "security", "entity_id": "armed_home"}]',
                    None,
                    0,
                    None,
                    5,
                    "default",
                    50,
                ),
            ],
        )
        self.connection.commit()
        _home_mode_settle_column(self.connection, None)  # type: ignore[arg-type]
        _home_mode_activity_groups(self.connection, None)  # type: ignore[arg-type]
        self.connection.commit()
        self.assertEqual(self._rows()["party"]["group"], "default")

    def test_idempotent(self) -> None:
        _seed(
            self.connection,
            [("cinema", "影音模式", "[]", None, 0, None, 3, "comfort", 50)],
        )
        self.connection.commit()
        self._apply()
        _home_mode_activity_groups(self.connection, None)  # type: ignore[arg-type]
        self.connection.commit()
        first = self._rows()
        self._apply()
        _home_mode_activity_groups(self.connection, None)  # type: ignore[arg-type]
        self.connection.commit()
        self.assertEqual(first, self._rows(), "迁移重复执行必须不改变结果")


if __name__ == "__main__":
    unittest.main()
