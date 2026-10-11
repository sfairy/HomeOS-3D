#!/usr/bin/env python3
"""共享契约门禁的自检：给 ``check_shared_contracts.py`` 注入各类漂移，确认它真的会拦。

为什么需要它
------------
``check_container_boot`` 是在源码态**推导**容器事实（Dockerfile 的 ``COPY`` 包名、启动器声明的
入口串、源码里的符号定义）再做对账。这类「解析型门禁」有个共同的失效模式：**它自己悄悄变瞎** ——
启动器换了写法、正则匹配不到时，只要选择「匹配不到就跳过」，门禁就会永远打印「通过」，
而真正的漂移照样能溜过去，且从输出上完全看不出区别。

所以本自检不复述门禁的判定逻辑（那只会得到第三份会漂移的副本），而是**真的把一份副本改坏**，
逐条确认每个分支都会报错、且报的是对的那一条：

    1. 镜像层次被改深（``./app`` → ``./backend/app``）—— 即主应用 ``to_app`` 之前的老布局；
    2. ``COPY`` 行被删 → 「未映射进镜像」（与上一条刻意区分：修法不同）；
    3. 源码 ``COPY`` 被写死成单个项目（P5 之后唯一的合法形态是 ``${PROJECT}/backend/src``，
       写死 = 另一个项目没人 COPY 它的源码）→ 「未映射进镜像」；
    4. 启动器文件缺失；
    5. 启动器声明的工厂名与源码不符；
    6. 入口模块在源码里不存在；
    7. 启动器包名与镜像映射不一致；
    8. 两个后端的镜像包名不一致（P5 之后只剩「某个项目又单独 COPY 一份」这一种成因）；
    9. 启动器换成门禁识别不了的写法 → 必须**报解析失败**，而不是静默放行。

TS↔Python 常量块（``tsPythonTwins``）同理再走一遍：

    10. TS 块里的项被改名（Python 侧没跟）→ 报「在 Python 侧找不到」；
    11. Python 侧的项被改名（TS 侧没跟，``equal`` 型）→ 报「Python 侧多出」；
    12. ``const <块名>`` 被改名 → 必须报解析失败；
    13. ``ignore`` 豁免的项在 TS 侧已不存在 → 报「过期豁免」（豁免条目由自检**自带**，
        不依赖黄金文件里真登记着豁免 —— 真实豁免已随死常量 ``child_mode`` 一并删除）；
    14. ``minItems`` 下限被抬高 / ``ignore`` 缺 ``why`` → 报抽取失效 / 豁免无理由。

商店配色令牌（TS 生成 ↔ 后端校验器）再补两条：

    14. TS 多一个色名（后端校验器不认）→ 报「后端校验器不认」；
    15. 后端校验器少认一个后缀（TS 仍会生成）→ 报「后端校验器不认」。

后端孪生模块（``backendTwinModules``）与共享 Python 真源唯一，各再补一组。前者清单已清空
（两个模块收进 ``packages/shared-py`` 成为唯一真源），不再有真实数据流过这条分支，最容易
悄悄失效，所以改用**合成**的一对文件继续压：

    16. 合成孪生对一致 → 放行；改动一份 → 报「代码不一致」；删掉一份 → 报「文件缺失」。

后者正是「真源收拢之后防倒退」的那一条，同样用合成的共享包压：

    17. 后端存了共享模块的完整副本 → 报「完整副本」；副本被改过 → 报「最容易开始漂移」；
    18. 共享包被搬空 → 必须报解析失败，而不是「目录在、没模块就当没事」。

副本只含门禁真正会读的文件，清单从黄金文件 ``containerBoot`` / ``tsPythonTwins`` 推导（不手工
维护，否则加一个后端 / 孪生就要记得改这里）；全程在 ``tempfile`` 里操作，不碰真实工作区。

用法
----
从仓库根执行（只用标准库，无需 venv）：

    python3 ops/check_shared_contracts_selftest.py
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops import check_shared_contracts as gate

GOLDEN = ROOT / "ops" / "contracts" / "shared-twins.json"

failures: list[str] = []
checked = 0


def check(name: str, fn) -> None:
    """跑一项检查并打印一行 OK / FAIL；任何异常都算失败，不让脚本半路炸掉。"""
    global checked
    checked += 1
    try:
        fn()
    except AssertionError as error:
        failures.append(f"{name} —— {error}")
        print(f"  FAIL {name} —— {error}")
    except Exception as error:
        # 未预期异常同样算失败，但要看清类型：它通常意味着环境问题而非判定口径。
        failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name} —— {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


def _load_spec() -> dict:
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    spec = golden.get("containerBoot")
    if not spec:
        raise AssertionError("黄金文件里没有 containerBoot：门禁会直接跳过容器检查")
    return spec


def _entry(spec: dict, source: str) -> dict:
    for entry in spec["entries"]:
        if entry["source"] == source:
            return entry
    raise AssertionError(f"黄金文件 containerBoot 里没有 {source}")


def _module_file(entry: dict, module: str) -> Path:
    """镜像包名 ``pkg`` 对应源码目录 ``src/``，故 ``pkg.mod`` ↔ ``src/mod.py``。"""
    parts = module.split(".")[1:]
    rel = Path(*parts).with_suffix(".py") if parts else Path("__init__.py")
    return Path(entry["source"]) / rel


def build_replica(dest: Path, spec: dict) -> None:
    """把门禁会读到的文件按原相对路径复制进 ``dest``（清单从 spec 推导）。"""
    items = [Path(spec["dockerfile"])]
    for entry in spec["entries"]:
        launcher = Path(entry["launcher"])
        module, _ = gate.boot_binding(ROOT / launcher, entry["bind"])
        items += [launcher, _module_file(entry, module)]
    for rel in items:
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((ROOT / rel).read_text(encoding="utf-8"), encoding="utf-8")


def substitute(path: Path, old: str, new: str) -> None:
    """在副本里做一次替换；找不到待改内容即失败 —— 说明启动器/Dockerfile 写法变了。"""
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise AssertionError(f"副本里找不到待改内容 {old!r}（门禁或启动器写法变了？）")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def substitute_literal(path: Path, item: str, replacement: str) -> None:
    """把副本里 ``'item'`` / ``"item"`` 两种写法全量换成 ``replacement``（保留原引号）。

    全量替换：同一个项可能在块内出现多次，漏改一处就注入不了漂移。两种写法都不在即失败 ——
    说明项在源码里的写法变了，自检已经改不动它。
    """
    text = path.read_text(encoding="utf-8")
    for quote in ("'", '"'):
        form = f"{quote}{item}{quote}"
        if form in text:
            path.write_text(text.replace(form, f"{quote}{replacement}{quote}"), encoding="utf-8")
            return
    raise AssertionError(f"副本里找不到字面量 {item!r}（引号/写法变了？）")


def build_twin_replica(dest: Path) -> None:
    """把 ``tsPythonTwins`` 与商店配色那对文件按原相对路径复制进 ``dest``（清单从黄金文件推导）。"""
    paths = [twin["ts"] for twin in load_twins()]
    paths += [rel for twin in load_twins() for rel in twin["py"]]
    paths += [str(gate.APPEARANCE_TS), str(gate.APPEARANCE_PY)]
    for rel in paths:
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((ROOT / rel).read_text(encoding="utf-8"), encoding="utf-8")


def load_twins() -> list[dict]:
    twins = json.loads(GOLDEN.read_text(encoding="utf-8")).get("tsPythonTwins") or []
    if not twins:
        raise AssertionError("黄金文件里没有 tsPythonTwins：门禁会直接跳过常量块对账")
    return twins


def twin_ts_items(twin: dict) -> set[str]:
    text = (ROOT / twin["ts"]).read_text(encoding="utf-8")
    return gate.ts_block_items(text, twin["tsBlock"], twin.get("tsMode", "values"))


def expect_problem(problems: list[str], fragment: str) -> None:
    """要求门禁报错且命中指定片段。"""
    if not problems:
        raise AssertionError(f"注入漂移后门禁仍然放行（期望命中「{fragment}」）")
    joined = "；".join(problems)
    if fragment not in joined:
        raise AssertionError(f"报错未命中「{fragment}」，实际：{joined}")


def main() -> int:
    spec = _load_spec()
    app = _entry(spec, "homeos/backend/src")
    store = _entry(spec, "homeos-store/backend/src")

    # 待改内容全部从真实文件推导，避免把「包名 / 工厂名」再抄一遍。
    app_module, app_symbol = gate.boot_binding(ROOT / app["launcher"], app["bind"])
    store_module, _ = gate.boot_binding(ROOT / store["launcher"], store["bind"])
    app_pkg = app_module.split(".")[0]
    app_target = f'"{app_module}:{app_symbol}"'
    store_import = f"import {store_module} as"
    # P5 之后两个项目共用一个构建阶段，Dockerfile 里只剩**一行参数化**源码 COPY
    # （`COPY ${PROJECT}/backend/src ./app`）：包名与那行原文都从真实文件抠，不手抄 ——
    # 手抄的后果是写法一变，`substitute` 会报「找不到待改内容」，而不是悄悄测了个旧的形状。
    project_copy_match = gate._DOCKER_COPY_PROJECT_TARGET.search(
        (ROOT / spec["dockerfile"]).read_text(encoding="utf-8")
    )
    if not project_copy_match:
        raise AssertionError(
            f"{spec['dockerfile']} 里找不到参数化的源码 COPY（`COPY ${{PROJECT}}/backend/src …`）—— "
            "容器布局写法变了，请同步本自检"
        )
    project_copy = project_copy_match.group(0).strip()

    def case(mutate) -> None:
        """建一份干净副本 → 注入漂移 → 跑门禁（ROOT 临时指向副本）。"""
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            build_replica(dest, spec)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                mutate(dest)
                problems = gate.check_container_boot(spec)
                expect_problem(problems, mutate.fragment)
            finally:
                gate.ROOT = original_root

    def baseline() -> None:
        """真实仓库配置本应自洽：这一步同时验证副本推导没漏文件。"""
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            build_replica(dest, spec)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                problems = gate.check_container_boot(spec)
            finally:
                gate.ROOT = original_root
            if problems:
                raise AssertionError(f"真实配置本应自洽，却报：{'；'.join(problems)}")

    def deep_nesting(dest: Path) -> None:
        # 记忆点：这正是主应用 to_app 之前的布局，漏改启动器时源码态测试全绿。
        # 目标串直接从真实那行派生（在 `./` 后面插一层），不手抄包名。
        substitute(
            dest / spec["dockerfile"],
            project_copy,
            project_copy.replace("./", "./backend/", 1),
        )

    deep_nesting.fragment = "不是单层包名"

    def copy_missing(dest: Path) -> None:
        path = dest / spec["dockerfile"]
        text = path.read_text(encoding="utf-8")
        path.write_text(
            "\n".join(line for line in text.splitlines() if line.strip() != project_copy) + "\n",
            encoding="utf-8",
        )

    copy_missing.fragment = "未映射进镜像"

    def hardcoded_project(dest: Path) -> None:
        # P5 的核心约束：源码只能由 `--build-arg PROJECT` 选。把那行写死成主应用的目录，
        # 商店就成了「没人 COPY 过它的源码」—— 只编得出主应用，必须在这里就被拦住。
        substitute(
            dest / spec["dockerfile"],
            project_copy,
            f"COPY {app['source']} ./{app_pkg}",
        )

    hardcoded_project.fragment = "未映射进镜像"

    def launcher_missing(dest: Path) -> None:
        (dest / store["launcher"]).unlink()

    launcher_missing.fragment = "启动器缺失"

    def wrong_symbol(dest: Path) -> None:
        substitute(dest / app["launcher"], app_target, f'"{app_module}:{app_symbol}_typo"')

    wrong_symbol.fragment = "里没有定义"

    def missing_module(dest: Path) -> None:
        substitute(dest / app["launcher"], app_target, f'"app.ghost_module:{app_symbol}"')

    missing_module.fragment = "在源码里找不到"

    def launcher_mismatch(dest: Path) -> None:
        substitute(dest / store["launcher"], store_import, "import ghost_pkg.run as")

    launcher_mismatch.fragment = "两边不同名"

    def packages_diverge(dest: Path) -> None:
        # 统一阶段之后，「某个项目又单独 COPY 一份」是包名分流的唯一入口：字面量优先于
        # 参数化那行（见 `load_docker_packages`），于是两边的镜像包名不再统一。
        substitute(
            dest / spec["dockerfile"],
            project_copy,
            f"{project_copy}\nCOPY {store['source']} ./renamed",
        )
        substitute(dest / store["launcher"], store_import, "import renamed.run as")

    packages_diverge.fragment = "包名不一致"

    def unparsable(dest: Path) -> None:
        # 改成门禁正则认不出的写法：必须报解析失败，绝不能「匹配不到就跳过」。
        substitute(dest / app["launcher"], app_target, f'"{app_module}"')

    unparsable.fragment = "解析失败"

    # —— TS↔Python 常量块：同样「真的改坏一份副本」，逐条确认分支会报错 ——
    twins = load_twins()

    def pick(predicate) -> dict:
        for twin in twins:
            if predicate(twin):
                return twin
        raise AssertionError("黄金文件里没有符合条件的孪生（判定口径变了？）")

    equal_twin = pick(lambda twin: twin.get("dir", "equal") == "equal")
    subset_twin = pick(lambda twin: twin.get("dir") == "ts-subset")
    # 待改项从真实抽取结果里取（字典序最小项，确定性强），避免把常量名再抄一遍。
    shared_item = min(twin_ts_items(equal_twin))
    # 豁免用例**自带**豁免条目，不依赖黄金文件里真的登记着一条豁免 —— 那份真实豁免
    # （`child_mode`）已随死常量删除，若继续从 `twin["ignore"][0]` 取，pick 会直接失败，
    # 变成「清单里没有豁免 → 自检崩」而不是「豁免分支被压住」。
    exempt_item = min(twin_ts_items(subset_twin))

    def twins_with_ignore(*, with_why: bool = True) -> list[dict]:
        entry = {"name": exempt_item}
        if with_why:
            entry["why"] = "自检用：构造豁免分支"
        return [{**twin, "ignore": [entry]} if twin is subset_twin else twin for twin in twins]

    def replica_case(mutate, run) -> None:
        """建一份干净副本 → 注入漂移 → 跑给定检查（ROOT 临时指向副本）。"""
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            build_twin_replica(dest)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                mutate(dest)
                problems = run()
            finally:
                gate.ROOT = original_root
            expect_problem(problems, mutate.fragment)

    def twin_case(mutate) -> None:
        replica_case(mutate, lambda: gate.check_ts_python_twins(twins))

    def twin_case_with_ignore(mutate) -> None:
        """同上，但用**自带豁免**的清单跑：豁免分支不能依赖黄金文件里真有豁免。"""
        replica_case(mutate, lambda: gate.check_ts_python_twins(twins_with_ignore()))

    def appearance_case(mutate) -> None:
        replica_case(mutate, gate.check_store_appearance_tokens)

    def twin_baseline() -> None:
        """真实仓库配置本应自洽：这一步同时验证副本推导没漏文件。"""
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            build_twin_replica(dest)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                problems = gate.check_ts_python_twins(twins) + gate.check_store_appearance_tokens()
            finally:
                gate.ROOT = original_root
            if problems:
                raise AssertionError(f"真实孪生本应自洽，却报：{'；'.join(problems)}")

    def ts_item_renamed(dest: Path) -> None:
        substitute_literal(dest / equal_twin["ts"], shared_item, f"{shared_item}_ghost")

    ts_item_renamed.fragment = "在 Python 侧找不到"

    def py_item_renamed(dest: Path) -> None:
        substitute_literal(dest / equal_twin["py"][0], shared_item, f"{shared_item}_ghost")

    py_item_renamed.fragment = "Python 侧多出"

    def block_renamed(dest: Path) -> None:
        substitute(dest / equal_twin["ts"], f"const {equal_twin['tsBlock']}", "const GhostBLOCK")

    block_renamed.fragment = "解析失败"

    def stale_ignore(dest: Path) -> None:
        substitute_literal(dest / subset_twin["ts"], exempt_item, f"{exempt_item}_ghost")

    stale_ignore.fragment = "过期豁免"

    def lazy_ignore() -> None:
        """豁免条目缺 why：门禁自己也要被门禁管住，不能匿名豁免。"""
        problems = gate.check_ts_python_twins(twins_with_ignore(with_why=False))
        expect_problem(problems, "都要写 name + why")

    def raised_floor() -> None:
        """下限抬到不可能达到：必须报抽取失效，而不是「项少就跳过」。"""
        strict = [
            {**twin, "minItems": {"ts": 10_000, "py": 1}} for twin in twins if twin is equal_twin
        ]
        problems = gate.check_ts_python_twins(strict)
        expect_problem(problems, "疑似抽取失效")

    def extra_color(dest: Path) -> None:
        """TS 侧多一个色名：后端校验器不认，必须报出来（管理员会 422）。"""
        path = dest / gate.APPEARANCE_TS
        text = path.read_text(encoding="utf-8")
        body = gate.ts_block_body(text, "CONFIGURABLE")
        path.write_text(text.replace(body, f'{body[:-1]}, "neon"]', 1), encoding="utf-8")

    extra_color.fragment = "后端校验器不认"

    def suffix_dropped(dest: Path) -> None:
        """后端少认一个后缀：TS 照样生成，必须报出来。"""
        path = dest / gate.APPEARANCE_PY
        text = path.read_text(encoding="utf-8")
        pattern, _ = gate.store_appearance_validator(text)
        trimmed = pattern.pattern.replace("|-text", "")
        if trimmed == pattern.pattern:
            raise AssertionError("校验器正则里找不到 `|-text`（写法变了，自检改不动）")
        path.write_text(text.replace(pattern.pattern, trimmed, 1), encoding="utf-8")

    suffix_dropped.fragment = "后端校验器不认"

    # —— 后端孪生模块对账（check_twins）：`backendTwinModules` 已清空 ——原先靠「两处各存一份 +
    #    门禁比对」维持的 logging_noise / core/file_lock 已收进 packages/shared-py 成为唯一真源。
    #    清单为空意味着这条分支再没有真实数据流过，最容易悄悄失效，故用**合成**的一对文件压它：
    #    一致必须放行，改动一份必须报「代码不一致」，删掉一份必须报「文件缺失」。 ——
    TWIN_SOURCE = "import json\n\n\ndef load(path):\n    return json.loads(path)\n"

    def synth_twin(dest: Path) -> dict[str, str]:
        pair = {
            "label": "synth",
            "homeos": "homeos/backend/src/_synth_twin.py",
            "store": "homeos-store/backend/src/_synth_twin.py",
        }
        for key in ("homeos", "store"):
            target = dest / pair[key]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(TWIN_SOURCE, encoding="utf-8")
        return pair

    def synth_twin_case(mutate, fragment: str | None) -> None:
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            pair = synth_twin(dest)
            mutate(dest, pair)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                problems = gate.check_twins([pair])
            finally:
                gate.ROOT = original_root
            if fragment is None:
                if problems:
                    raise AssertionError(f"合成的孪生本应一致，却报：{'；'.join(problems)}")
                return
            expect_problem(problems, fragment)

    def twin_untouched(_dest: Path, _pair: dict[str, str]) -> None:
        pass

    def twin_drifted(dest: Path, pair: dict[str, str]) -> None:
        path = dest / pair["store"]
        path.write_text(f"{TWIN_SOURCE}\n\ndef extra():\n    return 1\n", encoding="utf-8")

    def twin_deleted(dest: Path, pair: dict[str, str]) -> None:
        (dest / pair["store"]).unlink()

    # —— 共享 Python 真源唯一：真源收拢之后，要防的是相反方向「又抄一份回后端」。同样用合成的
    #    共享包 + 合成副本压分支，并确认「共享包被搬空」会报解析失败而不是静默放行。 ——
    SHARED_SOURCE = "import os\n\n\ndef home():\n    return os.path.expanduser('~')\n"

    def shared_case(mutate, fragment: str | None) -> None:
        """合成一棵「共享包 + 两个后端」的迷你副本（目录形状与真实仓库一致）→ 注入副本 → 跑门禁。"""
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            package = dest / gate.SHARED_PY_PACKAGE
            package.mkdir(parents=True)
            (package / "_synth_shared.py").write_text(SHARED_SOURCE, encoding="utf-8")
            mutate(dest, package)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                problems = gate.check_shared_python_singleton()
            finally:
                gate.ROOT = original_root
            if fragment is None:
                if problems:
                    raise AssertionError(f"没有副本时本应放行，却报：{'；'.join(problems)}")
                return
            expect_problem(problems, fragment)

    def _write_copy(dest: Path, text: str) -> None:
        target = dest / "homeos" / "backend" / "src" / "core" / "_synth_shared.py"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def shared_no_copy(_dest: Path, _package: Path) -> None:
        pass

    def shared_exact_copy(dest: Path, _package: Path) -> None:
        _write_copy(dest, SHARED_SOURCE)

    def shared_drifted_copy(dest: Path, _package: Path) -> None:
        _write_copy(dest, SHARED_SOURCE.replace("expanduser('~')", "expanduser('/')"))

    def shared_package_emptied(_dest: Path, package: Path) -> None:
        (package / "_synth_shared.py").unlink()


    print("容器启动契约门禁自检：")
    check("真实配置自洽（副本推导无遗漏）", baseline)
    check("镜像层次被改深：报层次漂移", lambda: case(deep_nesting))
    check("COPY 行缺失：报未映射进镜像", lambda: case(copy_missing))
    check("源码 COPY 被写死成单个项目：报未映射进镜像", lambda: case(hardcoded_project))
    check("启动器缺失：报启动器缺失", lambda: case(launcher_missing))
    check("工厂名与源码不符：报符号未定义", lambda: case(wrong_symbol))
    check("入口模块不存在：报源码里找不到", lambda: case(missing_module))
    check("启动器包名与镜像不符：报两边不同名", lambda: case(launcher_mismatch))
    check("两后端镜像包名不一致：报包名不一致", lambda: case(packages_diverge))
    check("启动器换写法：报解析失败而非放行", lambda: case(unparsable))
    print()
    print("TS↔Python 常量块对账自检：")
    check("真实孪生自洽（副本推导无遗漏）", twin_baseline)
    check(f"TS 项被改名（{equal_twin['label']}）：报 Python 侧找不到", lambda: twin_case(ts_item_renamed))
    check(f"Python 项被改名（{equal_twin['label']}）：报 Python 侧多出", lambda: twin_case(py_item_renamed))
    check(f"常量块被改名（{equal_twin['tsBlock']}）：报解析失败", lambda: twin_case(block_renamed))
    check(f"豁免项已不在 TS（{subset_twin['label']}）：报过期豁免", lambda: twin_case_with_ignore(stale_ignore))
    check("豁免缺 why：报豁免必须留理由", lazy_ignore)
    check("下限抬到不可达：报疑似抽取失效", raised_floor)
    print()
    print("商店配色令牌对账自检：")
    check("TS 多一个色名：报后端校验器不认", lambda: appearance_case(extra_color))
    check("后端少认一个后缀：报后端校验器不认", lambda: appearance_case(suffix_dropped))
    print()
    print("后端孪生模块对账自检（清单已空，用合成孪生对压住分支）：")
    check("合成的孪生对一致：放行", lambda: synth_twin_case(twin_untouched, None))
    check("合成的孪生对漂移：报代码不一致", lambda: synth_twin_case(twin_drifted, "代码不一致"))
    check("合成的孪生对缺一份：报文件缺失", lambda: synth_twin_case(twin_deleted, "文件缺失"))
    print()
    print("共享 Python 真源唯一自检：")
    check("后端没有同名副本：放行", lambda: shared_case(shared_no_copy, None))
    check("后端存了完整副本：报副本", lambda: shared_case(shared_exact_copy, "完整副本"))
    check("后端副本已改过：报最容易漂移", lambda: shared_case(shared_drifted_copy, "最容易开始漂移"))
    check("共享包被搬空：报解析失败而非放行", lambda: shared_case(shared_package_emptied, "解析失败"))

    print()
    if failures:
        print(f"共享契约门禁自检失败：{len(failures)}/{checked} 项")
        for entry in failures:
            print(f"  - {entry}")
        return 1
    print(f"共享契约门禁自检全部通过（{checked} 项）：注入的漂移均被拦下。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
