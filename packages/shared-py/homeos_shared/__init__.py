"""两个后端共享的源码包（真源见 ``packages/shared-py/README.md``）。

导入方式一律用绝对包名 ``homeos_shared.<模块>``：这个包名刻意与 ``src`` / ``app`` 都无关 ——
两个后端在源码态与镜像态用的**顶层包名不同**（源码是 ``src``，镜像是 ``app``，见
``ops/docker/compile_python.py`` 的 ``_precheck`` 禁止绝对 ``src.`` 导入），共享包取一个
稳定名才不会随改名而失效。

本包**不 import 任何后端模块**：依赖方向只能是「后端 → homeos_shared」。
"""
from __future__ import annotations

__all__: list[str] = []
