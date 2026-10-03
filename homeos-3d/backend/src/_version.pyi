"""构建期由仓库根 Dockerfile 生成 ``backend/src/_version.py``，源码运行时并不存在。

这里只放一个类型桩，让静态分析不把 ``from ._version import __version__``
当成缺失模块（``reportMissingImports``）；运行期的存在性由调用方的
``try/except ImportError`` 兜底。
"""

__version__: str
