"""商店路由契约基线的回归：实际路由必须与快照一致，扫描口径可复算。"""

from __future__ import annotations

import json
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ARCH_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ARCH_DIR))

import store_route_inventory


class StoreRouteInventoryTest(unittest.TestCase):
    def test_registered_routes_match_baseline(self) -> None:
        baseline = json.loads((ARCH_DIR / "store-routes-baseline.json").read_text(encoding="utf-8"))
        routes = store_route_inventory.collect_routes()
        self.assertEqual([route.key() for route in routes], baseline["routes"])
        self.assertEqual(len(routes), 121)

    def test_prefix_and_auth_classification(self) -> None:
        source = textwrap.dedent(
            """
            router = APIRouter(prefix="/store-admin/v1")

            @router.get("/overview")
            async def overview(db: DbSession, admin: AdminAccount):
                return None

            @router.post("/open")
            async def open_endpoint(db: DbSession):
                return None
            """
        )
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "api.py").write_text(source, encoding="utf-8")
            routes = store_route_inventory.collect_routes(Path(tmp))
        self.assertEqual(
            [route.key() for route in routes],
            [
                "GET /store-admin/v1/overview [admin]",
                "POST /store-admin/v1/open [public]",
            ],
        )


if __name__ == "__main__":
    unittest.main()
