"""仪表盘字体域（对齐 0.8.6 的 ``fonts.py``）。

- 内置字体随包放在 ``assets-default/fonts``（``catalog.json`` 描述），只读；
- 用户上传的字体落到 ``<data_dir>/fonts/<32hex>/``，随整包备份走，与图片素材共用
  ``AssetCatalog.mutation_lock``：校验引用与删除之间不能插进一次保存。
"""

from .constants import BUILTIN_FONT_IDS, FONT_ID, FONT_TYPES, MAX_FONT_BYTES, MAX_FONTS
from .store import FontStore
from .validation import valid_font_selection, validate_font_file

__all__ = [
    "BUILTIN_FONT_IDS",
    "FONT_ID",
    "FONT_TYPES",
    "MAX_FONTS",
    "MAX_FONT_BYTES",
    "FontStore",
    "valid_font_selection",
    "validate_font_file",
]
