# RECIPE: 把 0.6.5 播种源码对齐到 0.6.6 的 .das 差量

适用对象：0.6.6 与 0.6.5 **共有**但已发生语义变化的模块（C2b）。
不属于本流程的：0.6.6 全新模块（C2a，从零重建，见 RECIPE-rebuild-module.md）。

工作根目录（所有命令都在这里执行）：

    cd /Users/sfairy/项目/HA-Bridge/源代码/0.6.6

解释器：

    PY=/Users/sfairy/项目/HomeOS/HomeOS-3D/.venv-store/bin/python3   # CPython 3.14.7，已装 fastapi/SQLAlchemy/alembic/httpx/pydantic/cryptography/argon2

## 0. 你手上的文件

每个受保护模块有 4 个同名文件：

    <relpath>.py            ← 待修正的源码。当前内容 = 0.6.5 已验收源码的播种副本（外加 C1 机械还原的残留）
    <relpath>.1shot.das     ← pycdas 精确反汇编，**唯一真相来源**
    <relpath>.1shot.cdc.py  ← pycdc 有损反编译；只在确认表达式写法时参考，绝不作为结构依据
    <relpath>.1shot.seq     ← PyArmor 加密字节码，无可用信息

**不要**用 C1 机械还原的产物覆盖现文件（tools/restore_backend.py 的输出质量远差于播种文件）。
你的工作是**外科手术式修改**：只改那些 .das 证明与 0.6.5 不同的地方。

如果不慎把文件改坏，可以用参照源码重来：

    cp /Users/sfairy/项目/HA-Bridge/源代码/0.6.5/<relpath> <relpath>

（0.6.5 的对应 .das 归档在 /Users/sfairy/项目/HA-Bridge/源代码/0.6.5/.restore/reference/1shot-0.6.5.tar.gz，
 已解包在 /tmp/ref065/；tools/das_delta.py 默认就读那里，不必手动解包。）

## 1. 拿差量：das_delta --semantic

    $PY tools/das_delta.py --semantic --diff <relpath>.1shot.das

它把两份 .das 归一化后做行级 diff：

* 已抹掉的构建噪声：`__pyarmor_assert_NNNN__` 之类的**计数后缀**、`b'<COAddr>\xNN...'` 代码对象 cookie、
  **字节偏移**（每条指令前的数字）、**跳转目标** `(to 532)`、**操作数表下标**（`LOAD_CONST 4: 'x'` → `LOAD_CONST 'x'`）、
  异常表行 `28 to 450 -> 558 [0]` → `EXC-TABLE-ENTRY depth=[0]`。
* 保留下来的是：opcode、被引用的名字/常量、handler 嵌套深度。

输出里 `-` 只在 0.6.5 出现，`+` 只在 0.6.6 出现。**每一条 `+` 都必须能用一处源码改动解释**；
`-` 意味着被删除或换了位置。若某段看起来是整体平移（形如 `LOAD_FAST 20` 之类带裸下标的行成对 `+/-`），
先用下面的 das_view 核对真伪——下标被抹掉后，多行常量（如元组）仍会保留裸下标，会产生假差量。

清单模式（不带 --diff）给出所有模块的比值，可用来判断某个模块是否真的变了：

    $PY tools/das_delta.py --semantic --top 0.05

## 2. 读真相：das_view

    $PY tools/das_view.py <relpath>.1shot.das                  # 只看 <module> 代码对象
    $PY tools/das_view.py <relpath>.1shot.das <ObjectName>     # 看某个函数/类的代码对象
    grep -n 'Object Name:' <relpath>.1shot.das                 # 列出该文件全部代码对象

**反汇编每行首列是字节偏移（不是源码行号）**；定位靠代码对象边界、[Names]/[Constants] 里的名字与常量、以及跳转结构。
（pycdas 不输出行号映射，所以「哪条指令属于源码哪一行」只能靠代码对象与结构推断，不要假装有行号。）
代码对象块的读法与「字节码 → Python 惯用法对照表」见 `tools/RECIPE-rebuild-module.md`，务必先读。

要点复述（细节以 RECIPE-rebuild-module.md 为准）：

    x or y            ← COPY 1 + POP_JUMP_IF_TRUE
    x and y           ← COPY 1 + POP_JUMP_IF_FALSE
    A if C else B     ← 条件跳转 + 两次 JUMP
    a is None         ← IS_OP 0 / IS_OP 1
    a in b / a not in b ← CONTAINS_OP 0 / 1
    if not X: A       ← A 的指令被 POP_JUMP_IF_TRUE 越过
    for ...           ← GET_ITER / FOR_ITER / END_FOR
    with ...          ← BEFORE_WITH + 异常表 lasti 表项
    try/except        ← PUSH_EXC_INFO / CHECK_EXC_MATCH / POP_EXCEPT
    f-string          ← FORMAT_VALUE / BUILD_STRING
    默认参数          ← MAKE_FUNCTION 前的常量元组
    注解              ← MAKE_FUNCTION flag 0x04
    相对导入          ← LOAD_CONST <level> + LOAD_CONST <fromlist> + IMPORT_NAME <module>

模块级 `from __future__ import annotations` 的判据：模块代码对象的 `[Names]` 里**同时**有 `'__future__'` 与 `'annotations'`。

## 3. 验收四连（每个模块都要全绿）

    $PY tools/verify_imports.py <relpath>       # 期望：checked 1 file(s): clean=1 with-differences=0
    $PY tools/verify_restore.py <relpath>       # 期望：verified 1 file(s): clean=1 with-differences=0 errors=0
    $PY tools/verify_with_blocks.py <relpath>   # 期望：clean=1 with-differences=0
    $PY tools/verify_try_blocks.py <relpath>    # 期望：clean=1 with-differences=0 files-with-todo=0
    $PY -c "import ast,sys; ast.parse(open('<relpath>').read())"

四个校验器的分工：

* verify_imports —— 源码里的 import 语句（模块与层级）与 .das 一致。
* verify_restore —— 模块/函数/类的**全局名集合**与**字符串常量集合**与 .das 一致；也检查 `# TODO(restore)` 残留。
* verify_with_blocks —— with 语句条数与 .das 一致。
* verify_try_blocks —— 带类型的 except 子句条数与 .das 一致。

**最重要的警告**：verify_restore **只比对名字和字符串常量，完全不检查控制流**。
也就是说一个把 `if` 写反、把循环删掉、把 return 提前的版本照样能通过 verify_restore。
所以每一个分支/循环/try/with/早退，你都必须自己读出 .das 的指令序列来证明，并在报告里给出「指令 → Python」的对应。

## 4. 其它硬性约束

* 只许修改分配给你的文件。不要改 tools/、不要改任何校验器、不要改 __init__.py、不要跑全局脚本。
* 不要修改或删除 *.1shot.* 文件。
* 风格与 0.6.5 保持一致：单引号、模块文档字符串用三单引号、函数文档字符串用三双引号、空字典写 `{ }`。
* 不写没有 .das 证据的注解。
* write/edit 工具要求先 read 过该文件才能改它（filesystem 观察策略）。用 edit 做定点替换。
