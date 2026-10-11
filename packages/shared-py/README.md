"""两个后端共享的源码（**唯一真源**），与 ``packages/shared``（TS）并列。

为什么要它
----------
主应用与授权商店各自独立部署、各自把后端编译成内嵌 ``.so``，**运行期互不 import**（由
``ops/check_deploy_independence.py`` 钉死）。但有些模块两边确实需要**同一份实现** ——
此前靠「两处各存一份 + ``backendTwinModules`` 门禁比对 AST」维持，代价是：
改一处必须记得改另一处，门禁只能事后发现漂移。

这里换成**构建期源码共享**：真源唯一，在两个镜像的**各自构建阶段**被分别内联编译，
产物里各有一份**自己编译的副本** —— 不引入运行期跨项目依赖，也不产生副本漂移。

目录形状与「为什么是这个形状」
------------------------------
```
packages/shared-py/
├── README.md            ← 本文件（**不进镜像**，故意放在包目录之外）
└── homeos_shared/       ← 可导入的包，名字稳定，不随 src→app 改名而变
    ├── __init__.py
    ├── logging_noise.py
    └── file_lock.py
```

这个两层形状是被三处硬约束**同时**定出来的，不是随意选的：

1. **Dockerfile 的 ``COPY`` 语义**：``COPY <目录> <目标>`` 复制的是目录**内容**，不是目录本身。
   故 ``COPY packages/shared-py/homeos_shared ./homeos_shared`` 得到 ``/app/homeos_shared/*.py``；
   若写成 ``COPY packages/shared-py ./homeos_shared``，就会多出一层
   ``/app/homeos_shared/homeos_shared/``。
2. **本文件必须在被 COPY 的目录之外**：两个构建阶段末尾都有一条「``/app/homeos_shared`` 下
   只允许 ``.so``」的产物断言（`stray` 扫描）。``.md`` 落在里面会被一起 COPY 进去、让构建失败；
   别处的做法是再加一条 ``rm -f``（如商店阶段的 ``rm -f /app/app/README.md``），但把说明文档
   放在包目录之外，这条约束就不必存在。
3. **源码态 ``import homeos_shared.*``**：需要把 ``packages/shared-py``（即 ``homeos_shared/``
   的**父目录**）挂进 ``sys.path``。这一步由两个后端的 ``src/__init__.py`` 完成
   （见 ``_register_shared_python_root``，里面有「为什么放在包入口而不是各启动脚本」的说明）。

三处消费方式
------------
| 场景 | 机制 |
|------|------|
| 镜像 | 两个构建阶段各 ``COPY packages/shared-py/homeos_shared ./homeos_shared``，由 ``compile_python.compile_tree`` 一并编译成 ``.so``；``PYTHONPATH=/app`` 即可 ``import homeos_shared`` |
| 源码态（dev / 冒烟 / 门禁脚本） | 后端 ``src/__init__.py`` 把 ``packages/shared-py`` 挂进 ``sys.path`` |
| 门禁 | ``ops/check_deploy_independence.py`` 第 5 项断言两个构建阶段都内联了它；``ops/check_shared_contracts.py`` 第 9 项断言没有后端再存同名副本 |

往里放东西的准则
----------------
只放「两个后端确实需要同一实现、且无业务耦合」的叶子模块（纯标准库最好）。有业务语义的
东西不放 —— 否则它会退化成新的上帝包，且改动会同时影响两个独立部署的服务。依赖方向只能是
「后端 → ``homeos_shared``」，本包不得反向 import 任一后端。

新增一个模块时，**除了这个目录本身，别处都不用改**（也不该改）：
``COPY`` / ``find`` 断言是整目录的，门槛是「后端不得有同名文件」这种通用判据，
``ruff.toml`` 的 ``known-first-party`` 与 ``pyrightconfig.json`` 的 ``extraPaths`` 挂的都是
这个包目录而不是某个模块。
"""
