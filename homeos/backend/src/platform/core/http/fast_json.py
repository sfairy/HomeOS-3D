"""响应序列化的快速通道：跳过快路径下纯 Python 的 ``jsonable_encoder`` 递归复制。

## 问题

FastAPI 对**没有** ``response_model`` 的路由，会把返回值整个交给
``fastapi.routing.serialize_response`` → ``jsonable_encoder``：一次纯 Python 的递归
遍历 + 逐层复制（为 datetime / UUID / Pydantic 等类型准备可 JSON 化的副本）。
而我们绝大多数业务接口返回的本来就是「纯 dict / list / str / int / bool / None」
（服务层直接从 DB 行拼出来），这一步等于把 90KB 的布局文档复制一遍，再交给
``json.dumps`` 编码。实测（``ops/bench/bench_json.py``）：

| 路径 | 90KB 布局文档 | 78KB 场景 |
| --- | --- | --- |
| ``jsonable_encoder`` + stdlib ``json``（现状） | 3.9 ms | 3.0 ms |
| ``orjson`` 直接编码 | 0.06 ms | 0.05 ms |

## 做法

装一个**只在能证明安全时才生效**的快速通道：

1. 先试 ``orjson.dumps(content)``。成功 = 这份内容已经能被直接序列化，那
   ``jsonable_encoder`` 唯一的作用就是复制它 —— 返回原对象，跳过复制；
2. 失败（datetime / UUID / Pydantic 模型 / 自定义对象 / 非 str 键），回退原实现，
   行为与之前逐字节一致。

代价是一次「试探性编码」。orjson 是 C 实现，90KB 只要 0.06 ms，比省掉的递归复制便宜
两个数量级；真正发给客户端时再由响应类编码一次。

## 边界

- 只替换 ``fastapi.routing`` 命名空间里的引用（``serialize_response`` 用的就是它），
  不动 ``fastapi.encoders.jsonable_encoder`` —— OpenAPI 文档生成走的是后者，参数也带
  ``by_alias`` / ``exclude_none`` 等关键字，这里一律直接放行；
- 带任何关键字参数时一律走原实现（那是「需要转换」的调用，不走快路径）；
- 幂等：重复调用无副作用；未安装 ``orjson`` 时什么都不做。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import Response

logger = logging.getLogger("homeos.http.fast_json")

try:  # orjson 是运行期依赖；缺失时本模块退化为空操作
    import orjson
except ImportError:  # pragma: no cover - 依赖缺失的降级路径
    orjson = None  # type: ignore[assignment]
    logger.debug("orjson 未安装，响应编码快速通道不启用")

_INSTALLED = False

#: orjson 的编码选项：与 FastAPI 自带的 ``ORJSONResponse`` 一致（非 str 的 dict 键也编码）。
#: 那个类在新版 FastAPI 里已被标记弃用（推荐「设置返回类型让 Pydantic 直接出字节」），
#: 而我们的路由大多没有 response_model —— 自己定义这个响应类最省事，也没有弃用告警。
_ORJSON_OPTIONS = 0
if orjson is not None:
    _ORJSON_OPTIONS = orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY


class OrjsonResponse(Response):
    """``application/json`` 响应，正文用 orjson 编码（缺失 orjson 时回退标准库）。"""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        if orjson is None:
            return json.dumps(content, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
        return orjson.dumps(content, option=_ORJSON_OPTIONS)


def _can_encode_directly(content: Any) -> bool:
    """内容是否能被 orjson 直接编码（= 不需要 ``jsonable_encoder`` 转换）。"""
    if orjson is None:
        return False
    try:
        orjson.dumps(content)
    except orjson.JSONEncodeError:
        # orjson 的编码错误是 TypeError 的子类：用单异常捕获，避免 `except A, B` 写法
        # （ruff format 会去掉括号，而 Cython 3.3 会把它误编译成 `except A as B:`，
        # 见 ops/checks/python/check_guards.py 的 pep758 守卫）。
        logger.debug("内容无法被 orjson 直接编码，回退 jsonable_encoder")
        return False
    return True


def install_fast_json_encoder() -> None:
    """幂等安装响应编码快速通道（未安装 orjson 时不做任何事）。"""
    global _INSTALLED
    if _INSTALLED or orjson is None:
        return
    from fastapi import routing

    # ``jsonable_encoder`` 是 ``fastapi.routing`` 从 ``fastapi.encoders`` 导入的模块级名字
    # （``serialize_response`` 用的就是它），没有出现在 ``__all__`` 里，静态分析据此报
    # 「未导出」—— 这里直接改写模块属性，与 ``realtime/msgpack_compat`` 改写 engineio
    # 的做法同一性质。
    original = routing.jsonable_encoder  # pyright: ignore[reportAttributeAccessIssue]

    def jsonable_encoder(content: Any, **kwargs: Any) -> Any:
        # 带关键字 = 调用方要求做别名 / 排除 / 截断等转换，没有快路径。
        if not kwargs and _can_encode_directly(content):
            return content
        return original(content, **kwargs)

    routing.jsonable_encoder = jsonable_encoder  # pyright: ignore[reportAttributeAccessIssue]
    #: 标记：自检与重复调用据此判断「已经装过」，避免层层包装。
    routing._homeos_fast_json_encoder = True  # pyright: ignore[reportAttributeAccessIssue]
    _INSTALLED = True
    logger.debug("已启用 orjson 响应编码快速通道")


def json_response(
    content: Any,
    *,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> Response:
    """直接构造 JSON 响应（orjson 编码，完全绕开 ``jsonable_encoder``）。

    用在「返回体大、结构已知」的接口上：布局文档、场景命令、设备列表、事件历史。
    返回 ``Response`` 后 FastAPI 会在 ``get_request_handler`` 里直接短路，不再走
    ``serialize_response``；``orjson`` 缺失时响应类内部回退标准库，调用方无需分支。
    """
    return OrjsonResponse(content, status_code=status_code, headers=headers)
