"""共享 Pydantic 基类。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    """等价 Nest ``ValidationPipe({ whitelist, forbidNonWhitelisted })``：拒绝未知字段。

    只用于**请求体**：客户端多发一个字段应当 422，而不是被静默忽略。
    """

    model_config = ConfigDict(extra="forbid")


class ResponseModel(BaseModel):
    """**响应**模型基类：多余键一律忽略，不让字段漂移变成 500。

    为什么不能复用 ``StrictModel``：``extra="forbid"`` 在响应侧是反向的 —— 服务层多返回
    一个键（例如新加了一个指标），序列化就会在 ``response_model`` 校验时抛
    ``ValidationError``，把一次正常请求升级成 500。响应侧的漂移应当「少字段报错、多字段忽略」：

    - 多字段：忽略（前端读不到新字段，但旧字段仍可用）—— 由契约测试比对键集发现；
    - 少字段：``ValidationError`` → 500（这是真缺陷，必须炸）。

    ``populate_by_name`` 不在这里开：响应字段全部由服务层以别名（camelCase）产出，
    开它只会让「拼错别名」也能通过校验。
    """

    model_config = ConfigDict(extra="ignore")
