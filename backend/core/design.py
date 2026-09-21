"""仪表盘画布的标称设计尺寸（默认文档与请求校验共用）。

``panel/documents.py`` 用它作为新建文档的默认画布，``core/schemas.py`` 用它做请求体字段
默认值。放在 ``core`` 而不是 ``panel``：``core`` 是更底层的一侧，请求体校验不该为了两个
常量反向依赖 ``panel``（那是一条包级环，平时只是导入顺序问题，踩到就报在启动期）。
"""
from __future__ import annotations

#: 设计标称画布尺寸，对应常见 16:9 大屏在 2 倍 DPI 下的像素数。
DESIGN_WIDTH = 2778
DESIGN_HEIGHT = 1940
