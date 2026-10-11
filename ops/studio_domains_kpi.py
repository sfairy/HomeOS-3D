#!/usr/bin/env python3
"""Studio 域清单 KPI：量「单体里的代码搬进域文件夹了没有」，并拦住「又在平铺」。

为什么需要它
------------
[`studio_monolith_kpi.py`](studio_monolith_kpi.py) 只盯「单体还有多少行」，但行数下降有两类做法：

- （好）把代码搬进 README 已声明的域文件夹（`scene/`、`items/`、`lights/`、`ui/`…）；
- （坏）随手挪进另一个平铺文件、或直接删掉 —— 行数照样掉，结构一点没变好。

所以本脚本量**域覆盖**与**平铺面**，并把 P4 的域清单固化成可执行清单（清单即代码，改结构必须同步改这里）：

度量口径
--------
- **域覆盖**：清单里 ``status=existing`` 的域目录内 ``.ts``/``.vue`` 行数合计（ratchet，只增不减）。
- **平铺面**：宿主目录下的**直接** ``.ts`` 文件个数（`studio-app.ts` 那层）。只减不增 ——
  README 的「new code must import from domain folders」由此变成机械约束，新增平铺文件必须显式
  ``--update`` 记账（评审可见）。
- **单体余量**：直接复用 [`studio_monolith_kpi.TARGETS`](studio_monolith_kpi.py)，避免两处各记一份路径。
- ``status=planned`` 的条目**一旦建出来就报错**，提醒改状态 —— 否则清单会和树悄悄脱节。

用法（仓库根执行）::

    python3 ops/studio_domains_kpi.py
    python3 ops/studio_domains_kpi.py --update   # 收敛后重记基线（域覆盖 + 平铺面）
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# 复用单体清单（`studio_monolith_kpi.TARGETS`）：单一真源，避免两处各记一份「哪些文件是单体」。
# 放在 sys.path 注入之后：直接以脚本方式运行时，仓库根不在 sys.path 上。
from ops.studio_monolith_kpi import TARGETS

STUDIO = ROOT / "homeos" / "frontend" / "src" / "studio"
SOURCE_SUFFIXES = (".ts", ".vue")


class Entry:
    """清单条目：域目录（``kind="domain"``）或声明过的 seam 文件（``kind="seam"``）。"""

    def __init__(self, kind: str, rel: str, status: str, layer: str, note: str) -> None:
        self.kind = kind
        self.rel = rel
        self.status = status
        self.layer = layer
        self.note = note

    @property
    def path(self) -> Path:
        return STUDIO / self.rel


def _domain(rel: str, status: str, layer: str, note: str) -> Entry:
    return Entry("domain", rel, status, layer, note)


def _seam(rel: str, status: str, layer: str, note: str) -> Entry:
    return Entry("seam", rel, status, layer, note)


#: 域清单 —— 与 studio/README.md 的域表一一对应；改目录结构必须同步改这里。
#: note 写「这个域该收什么」，P4 分批抽离时按它认领。
ENTRIES: list[Entry] = [
    # —— Creator（app/3d-studio/）——
    _domain("app/3d-studio/studio/scene", "existing", "creator", "相机 / 阴影 / 总览 / 运动呈现 / 地面过渡"),
    _domain("app/3d-studio/studio/items", "existing", "creator", "家具与设备 item 助手 / 摆放 / 姿态"),
    _domain("app/3d-studio/studio/lights", "existing", "creator", "灯光预设数据"),
    _domain("app/3d-studio/studio/ui", "existing", "creator", "控件 / 历史 / 纯助手"),
    _domain(
        "app/3d-studio/studio/boot",
        "existing",
        "creator",
        "引导序列（渲染器 / 草稿 / 舞台挂载 / 导出面板）",
    ),
    _domain("app/3d-studio/studio/types", "existing", "creator", "studio-app 共享类型"),
    _domain("app/3d-studio/plan", "existing", "creator", "平面图真实体（studio 侧 `plan-tools/` barrel 待建）"),
    _domain("app/3d-studio/materials", "existing", "creator", "材质真实体（studio 侧 `materials/` barrel 待建）"),
    _domain("app/3d-studio/export", "existing", "creator", "导出真实体（studio 侧 `export/` barrel 待建）"),
    _domain("app/3d-studio/loaders", "existing", "creator", "模型加载"),
    _domain("app/3d-studio/studio/plan-tools", "planned", "creator", "README 已声明、**当前未建**：平面图工具的 studio 侧入口"),
    _domain("app/3d-studio/studio/materials", "planned", "creator", "README 已声明、**当前未建**：材质的 studio 侧入口"),
    _domain("app/3d-studio/studio/export", "planned", "creator", "README 已声明、**当前未建**：导出的 studio 侧入口"),
    # —— Panel（app/editor/、app/renderer/）——
    _domain("app/editor/inspectors", "existing", "panel", "flow-line / percentage-bar 等检查器"),
    _domain("app/editor/controls", "existing", "panel", "检查器表单控件（数字输入 ± 步进器增强）"),
    _domain(
        "app/editor/navigation-style-apply",
        "existing",
        "panel",
        "导航「套用到其它控件」弹窗（目标选项行 / 按页面分组渲染）",
    ),
    _domain("app/editor/metadata", "existing", "panel", "属性元数据表（导航 / 样式 / 入口状态）与透视常量"),
    _domain("app/editor/picker", "existing", "panel", "取数弹层"),
    _domain("app/editor/copy-backup", "existing", "panel", "备份/复制对话框装配与执行（声明级切片）"),
    _domain(
        "app/editor/menus",
        "existing",
        "panel",
        "标题按钮图标菜单（定位 / 悬停滚动 / 图标选项装载，声明级切片）",
    ),
    _domain("app/editor/selection", "existing", "panel", "选中组件方向键微调（nudge，声明级切片）"),
    _domain(
        "app/editor/bindings",
        "existing",
        "panel",
        "宿主 DOM 事件注册（语句级切片：依赖按 getter 惰性注入，见 ops/studio_slice_wrap.mjs）",
    ),
    _domain(
        "app/editor/net",
        "existing",
        "panel",
        "编辑器请求面（`requestJson` 超时 / 中止 / CSRF / 401-403 跳转 + 认证跳转闩）",
    ),
    _domain("app/renderer/controls", "existing", "panel", "控件渲染"),
    _domain("app/renderer/flow-line", "existing", "panel", "流线绘制"),
    _domain("app/renderer/geometry", "existing", "panel", "几何计算"),
    _domain("app/renderer/core/registry", "existing", "panel", "组件注册表"),
    _domain(
        "app/renderer/core/renderer",
        "existing",
        "panel",
        "面板渲染器方法按 seam 拆分：mixin 袋（原 `panel-renderer-bulk-methods.ts` 10.9k 行 → 12 刀，宿主已删）+ "
        "`methods/`（`panel-renderer.ts` 的 70 个类方法 → 8 刀，宿主 7154 → 1888 行）",
    ),
    _domain(
        "runtime/config-ui/config-editor/rendering",
        "existing",
        "panel",
        "配置编辑器面板渲染（总装 renderPanel + 分区渲染 + 条目集合规整）",
    ),
    # —— Stage（runtime/）——
    _domain("runtime/core/stage", "existing", "stage", "挂载循环之外的同步 / 相机 / 标记 / 处理器"),
    # —— seam 文件（骨架已声明，按文件记账而不是目录）——
    _seam("runtime/core/stage/sync.ts", "existing", "stage", "舞台状态同步"),
    _seam("runtime/core/stage/camera.ts", "existing", "stage", "舞台相机"),
    _seam("runtime/core/stage/markers.ts", "existing", "stage", "标记渲染"),
    _seam("runtime/core/stage/stage-handlers.ts", "existing", "stage", "舞台事件处理"),
    _seam("app/renderer/core/renderer/paint.ts", "planned", "panel", "计划中：`panel-renderer.ts` 自己的绘制 seam（分片清单里的 paint，仍待建）"),
    _seam("app/renderer/core/renderer/runtime-connect.ts", "existing", "panel", "面板运行期连接（`connectRuntime`：订阅 / 重连 / 实体上限）"),
    _seam("app/renderer/core/renderer/render-component.ts", "existing", "panel", "组件绘制总装（`renderComponent`）"),
    _seam("app/renderer/core/renderer/capability-controls.ts", "existing", "panel", "能力详情控件（`createCapabilityDetailsControls`）"),
    _seam("app/renderer/core/renderer/light-controls.ts", "existing", "panel", "灯光详情控件（`createLightDetailsControls`）"),
    _seam("app/renderer/core/renderer/cover-controls.ts", "existing", "panel", "窗帘详情控件（`createCoverDetailsControls`）"),
    _seam("app/renderer/core/renderer/climate-controls.ts", "existing", "panel", "空调详情控件（`createClimateDetailsControls`）"),
    _seam("app/renderer/core/renderer/water-heater-controls.ts", "existing", "panel", "热水器扩展控件（`createWaterHeaterExtensionControls`）"),
    _seam("app/renderer/core/renderer/air-purifier-details.ts", "existing", "panel", "净化器详情（`showAirPurifierDetails`）"),
    _seam("app/renderer/core/renderer/vacuum-details.ts", "existing", "panel", "吸尘器详情（`showVacuumDetails`）"),
    _seam("app/renderer/core/renderer/presence-details.ts", "existing", "panel", "人感详情（`showPresenceDetails`）"),
    _seam("app/renderer/core/renderer/entity-details.ts", "existing", "panel", "实体详情（`showEntityDetails`）"),
    _seam("app/renderer/core/renderer/custom-popup.ts", "existing", "panel", "自定义弹窗（`showCustomPopup`）"),
    # —— 7c：`panel-renderer.ts` 的**类方法**按 seam 搬进 methods/（模块侧同名函数 + 类侧转发薄成员）——
    _seam("app/renderer/core/renderer/methods/transform-interaction.ts", "existing", "panel", "拖拽/缩放/旋转交互（含气流与门窗透视）"),
    _seam("app/renderer/core/renderer/methods/selection-overlay.ts", "existing", "panel", "选择框 / 控制柄 / 测量宿主 / 门窗透视手柄"),
    _seam("app/renderer/core/renderer/methods/selection-bounds.ts", "existing", "panel", "各类控件选择边界更新"),
    _seam("app/renderer/core/renderer/methods/runtime-refresh.ts", "existing", "panel", "运行期组件刷新 / 历史曲线 / 预热 / 重试 / 索引"),
    _seam("app/renderer/core/renderer/methods/details-popups.ts", "existing", "panel", "详情弹窗族（能力 / 媒体 / 浴霸 / 电动床 / 吸尘器 / 动作）"),
    _seam("app/renderer/core/renderer/methods/media-camera.ts", "existing", "panel", "相机预览 / 媒体浏览器 / 3D 相机入口"),
    _seam("app/renderer/core/renderer/methods/runtime-dialogs.ts", "existing", "panel", "运行期对话框缩放 / 关闭 / outside 关灯"),
    _seam("app/renderer/core/renderer/methods/runtime-actions.ts", "existing", "panel", "动作分发（bindRuntimeActions / dispatchAction / callEntityService）"),
    _seam("app/renderer/core/renderer/methods/optimistic-state.ts", "existing", "panel", "乐观态视觉与确认判定"),
]

#: 宿主目录 → 平铺 `.ts` 文件数基线（2026-10-11 实测）。只减不增。
HOST_FLAT_BASELINE = {
    "app/3d-studio/studio": 30,
    "app/editor": 30,
    "app/renderer/core": 14,
    "runtime/core": 12,
}

#: 域覆盖行数基线（2026-10-11 实测）。只增不减。
COVERAGE_BASELINE = 87831


def _lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8", errors="ignore").splitlines())


def _sources(path: Path) -> list[Path]:
    return [p for p in path.rglob("*") if p.is_file() and p.suffix in SOURCE_SUFFIXES]


def _flat_files(rel: str) -> list[Path]:
    return sorted(p for p in (STUDIO / rel).glob("*.ts") if p.is_file())


def _domain_size(entry: Entry) -> tuple[int, int]:
    files = _sources(entry.path)
    return len(files), sum(_lines(p) for p in files)


def _update(coverage: int, flat: dict[str, int]) -> None:
    """把当前实测写回本脚本（只动两个基线字面量）。"""
    text = Path(__file__).read_text(encoding="utf-8")
    text = re.sub(r"COVERAGE_BASELINE = \d+", f"COVERAGE_BASELINE = {coverage}", text, count=1)
    block = "HOST_FLAT_BASELINE = {\n" + "".join(f'    "{rel}": {count},\n' for rel, count in flat.items()) + "}\n"
    text = re.sub(r"HOST_FLAT_BASELINE = \{[^}]*\}\n", block, text, count=1)
    Path(__file__).write_text(text, encoding="utf-8")
    print(f"基线已更新：域覆盖 {coverage} 行，平铺面 {flat}")


def _manifest_problems() -> list[str]:
    """清单自身的自洽：状态/种类合法、rel 不重复、note 非空。

    「清单即代码」的前提是清单不会悄悄写错 —— 状态拼错或条目重复，会让门禁量错东西还不报错。
    """
    problems: list[str] = []
    seen: dict[str, str] = {}
    for entry in ENTRIES:
        if entry.status not in ("existing", "planned"):
            problems.append(f"{entry.rel}：status 只能是 existing / planned，实际 {entry.status!r}")
        if entry.kind not in ("domain", "seam"):
            problems.append(f"{entry.rel}：kind 只能是 domain / seam，实际 {entry.kind!r}")
        if not entry.note.strip():
            problems.append(f"{entry.rel}：note 不能为空（清单要能回答「这个域收什么」）")
        if entry.rel in seen:
            problems.append(f"{entry.rel}：清单里重复登记（前一条是 {seen[entry.rel]}）")
        seen[entry.rel] = entry.status
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--update", action="store_true", help="收敛后重记基线（域覆盖 + 平铺面）")
    args = parser.parse_args()

    problems: list[str] = _manifest_problems()
    coverage = 0
    rows: list[tuple[Entry, int, int]] = []

    for entry in ENTRIES:
        exists = entry.path.is_file() if entry.kind == "seam" else entry.path.is_dir()
        if entry.status == "existing":
            if not exists:
                problems.append(f"{entry.rel}：清单记为 existing，但磁盘上不存在（改目录后没同步清单？）")
                continue
            if entry.kind == "domain":
                files, total = _domain_size(entry)
                coverage += total
                if files == 0:
                    problems.append(f"{entry.rel}：域目录是空壳（0 个源文件），不算已开工")
                rows.append((entry, files, total))
        elif exists:
            problems.append(
                f"{entry.rel}：清单记为 planned，但磁盘上已经存在 —— 请把状态改成 existing 并记基线"
            )

    flat: dict[str, int] = {}
    for rel in HOST_FLAT_BASELINE:
        host = STUDIO / rel
        # 防瞎：宿主目录改名/消失时 `glob` 会返回空 → 平铺面静默变成「0 个 ≤ 基线」而通过。
        # 这类"匹配不到就跳过"是解析型门禁最常见的死法，所以这里把「目录不在」当成硬失败。
        if not host.is_dir():
            problems.append(
                f"平铺面清单里的宿主目录 {rel} 不存在 —— 目录改名后本项会静默通过（0 个 ≤ 基线），请改清单"
            )
            continue
        flat[rel] = len(_flat_files(rel))
    if not flat:
        problems.append("平铺面一个宿主目录都没量到（清单全失效？）—— 门禁自身异常，拒绝放行")
    for rel, count in flat.items():
        if count > HOST_FLAT_BASELINE[rel]:
            problems.append(
                f"{rel}：平铺 .ts 从 {HOST_FLAT_BASELINE[rel]} 个涨到 {count} 个"
                "（新代码请进域文件夹，禁新增平铺；确有必要就 --update 记账，让评审看见）"
            )
    if coverage < COVERAGE_BASELINE:
        problems.append(
            f"域覆盖从 {COVERAGE_BASELINE} 行掉到 {coverage} 行（域只能长大：搬进来的代码不该再搬出去）"
        )

    if args.update:
        if problems:
            print("存在待修项，先修好再记基线：", file=sys.stderr)
            for item in problems:
                print(f"  - {item}", file=sys.stderr)
            return 1
        _update(coverage, flat)
        return 0

    print(f"{'层':<9}{'状态':<10}{'域':<34}{'文件':>5}{'行':>8}   说明")
    print("-" * 104)
    for entry, files, total in rows:
        print(f"{entry.layer:<9}{entry.status:<10}{entry.rel:<34}{files:>5}{total:>8}   {entry.note}")
    print()
    print(f"域覆盖 {coverage} 行（基线 {COVERAGE_BASELINE}，{len(rows)} 个 existing 域）")
    for rel, count in flat.items():
        print(f"  平铺面 {rel}：{count} 个 .ts（基线 {HOST_FLAT_BASELINE[rel]}）")
    print(f"单体余量 {sum(target.lines() for target in TARGETS)} 行（明细见 studio_monolith_kpi.py）")

    if problems:
        print(f"\nStudio 域清单 KPI 失败：{len(problems)} 项", file=sys.stderr)
        for item in problems:
            print(f"  - {item}", file=sys.stderr)
        return 1

    print("\nStudio 域清单 KPI 通过：域只增不减、无空壳、无新平铺、planned 条目未偷跑。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
