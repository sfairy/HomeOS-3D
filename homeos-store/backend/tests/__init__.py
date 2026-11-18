"""商店后端回归测试（标准库 unittest，不引入新依赖）。

运行（仓库根）：
    node ops/lib/py.mjs -m unittest discover -s homeos-store/backend/tests -t homeos-store/backend -v

注意：两个后端都把包名固定为 ``src``，因此**不能**在同一进程里同时导入两侧模块。
"""
