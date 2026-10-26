"""Studio 拆分预算门禁的行为测试（不依赖真实仓库内容）。"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT = REPO_ROOT / "ops" / "checks" / "studio" / "check_split_budget.mjs"
NODE = shutil.which("node")
NODE_BIN: str = NODE or "node"

FAMILIES = [
    ("misc", "buildMisc"),
    ("living", "buildLiving"),
    ("storage-lower", "buildStorageLower"),
    ("storage-upper", "buildStorageUpper"),
    ("kitchen", "buildKitchen"),
    ("water-tea", "buildWaterTea"),
    ("laundry", "buildLaundry"),
    ("climate-security", "buildClimateSecurity"),
    ("media-bath", "buildMediaBath"),
    ("workspace", "buildWorkspace"),
    ("bath", "buildBath"),
    ("lighting-glass", "buildLightingGlass"),
    ("shower-basin", "buildShowerBasin"),
    ("decor", "buildDecor"),
]


def make_fixture(root: Path, *, entry_lines: int = 10, family_lines: int = 20,
                 module_let: bool = False, reorder: bool = False,
                 bad_import: bool = False) -> Path:
    app = root / "homeos" / "frontend" / "src" / "studio" / "app"
    entry = app / "3d-studio" / "authoring" / "items" / "studio-item-model.ts"
    family_dir = app / "3d-studio" / "authoring" / "items" / "item-model"
    entry.parent.mkdir(parents=True, exist_ok=True)
    family_dir.mkdir(parents=True, exist_ok=True)
    entry.write_text("\n".join(["// entry"] + ["export const x = 1;"] * (entry_lines - 1)) + "\n")
    (family_dir / "types.ts").write_text("export type ItemModelFamily = (scope: unknown) => boolean;\n")
    for name, _ in FAMILIES:
        lines = [f"// {name}"]
        if module_let and name == "misc":
            lines.append("let shared = 1;")
        if bad_import and name == "decor":
            lines.append('import "../studio-item-model";')
        lines.append("export function build__FN__(scope: unknown): boolean { return false; }".replace("__FN__", {"misc": "Misc"}.get(name, "")))
        # 其余文件使用与 index 一致的函数名
        fn = dict(FAMILIES)[name]
        lines[-1] = f"export function {fn}(scope: unknown): boolean {{ return false; }}"
        lines.extend(["// filler"] * max(0, family_lines - len(lines)))
        (family_dir / f"{name}.ts").write_text("\n".join(lines) + "\n")
    order = list(FAMILIES)
    if reorder:
        order[0], order[1] = order[1], order[0]
    imports = "\n".join(f'import {{ {fn} }} from "./{name}";' for name, fn in order)
    array = ",\n  ".join(fn for _, fn in order)
    (family_dir / "index.ts").write_text(
        'import type { ItemModelFamily } from "./types";\n'
        + imports
        + "\n\nexport const ITEM_MODEL_FAMILIES: ReadonlyArray<ItemModelFamily> = [\n  "
        + array
        + ",\n];\n"
    )
    return root


class SplitBudgetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if NODE is None:
            raise unittest.SkipTest("node not available")

    def run_gate(self, root: Path, phase: int = 1) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [NODE_BIN, str(SCRIPT), "--root", str(root), "--phase", str(phase)],
            capture_output=True, text=True, check=False,
        )

    def test_compliant_fixture_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = make_fixture(Path(tmp))
            result = self.run_gate(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("PASS", result.stdout)

    def test_reordered_oversized_and_module_state_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = make_fixture(Path(tmp), entry_lines=700, family_lines=1100,
                                module_let=True, reorder=True, bad_import=True)
            result = self.run_gate(root)
            self.assertEqual(result.returncode, 1)
            out = result.stdout
            self.assertIn("超过预算 600", out)
            self.assertIn("超过预算 1000", out)
            self.assertIn("模块级 let/var", out)
            self.assertIn("族顺序第 1 项", out)
            self.assertIn("不得 import 入口", out)


    def test_phase3_forwarder_ratchet_blocks_handwritten_wrappers(self) -> None:
        """`editor/home.ts` 手写转发包装的计数棘轮：0 是基线，加回来即红。"""
        with tempfile.TemporaryDirectory() as tmp:
            root = make_fixture(Path(tmp))
            home = root / "homeos/frontend/src/studio/app/editor/home.ts"
            home.parent.mkdir(parents=True, exist_ok=True)
            home.write_text(
                "function requestJson(...args: any[]): ReturnType<typeof requestJsonImpl> "
                "{ return (requestJsonImpl as any)(shellControlsDeps(), ...args); }\n",
                encoding="utf-8",
            )
            result = self.run_gate(root, phase=3)
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("editor-home-forwarders", result.stdout)


if __name__ == "__main__":
    unittest.main()
