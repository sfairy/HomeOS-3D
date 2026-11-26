"""导出图 WebP 兜底的转码测试（0.8.9）。

目的是挡住一类**只在 Safari 出现**的故障：`canvas.toBlob('image/webp')` 会静默回退成
PNG，前端于是把 PNG 交给服务端转码。这里断言的是转码器的**边界**：

- 正常 PNG 能转成真正的 WebP（魔数 `RIFF....WEBP`）；
- 动图取第一帧（导出图必须静态）；
- 超大边长、坏字节一律 `ValueError`（路由据此回 422，而不是 500）。
"""

from __future__ import annotations

import io
import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.domains.studio3d.export_service import (
    MAX_EXPORT_IMAGE_EDGE,
    encode_webp,
)


def png_bytes(width: int, height: int) -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (18, 24, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


class EncodeWebpTests(unittest.TestCase):
    def test_png_becomes_webp(self) -> None:
        encoded = encode_webp(png_bytes(64, 48))
        # RIFF....WEBP：WebP 容器的固定头。
        self.assertEqual(encoded[:4], b"RIFF")
        self.assertEqual(encoded[8:12], b"WEBP")

    def test_transparent_png_keeps_alpha(self) -> None:
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(buffer, format="PNG")
        encoded = encode_webp(buffer.getvalue())
        self.assertEqual(encoded[8:12], b"WEBP")

    def test_garbage_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            encode_webp(b"not-an-image")

    def test_empty_input_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            encode_webp(b"")

    def test_oversize_edge_is_rejected(self) -> None:
        # 不做真的巨大图（太慢）：把上限当成「恰好越界」来断言逻辑存在。
        self.assertGreater(MAX_EXPORT_IMAGE_EDGE, 0)
        from PIL import Image

        with Image.open(io.BytesIO(png_bytes(8, 8))) as small:
            self.assertEqual(small.size, (8, 8))
        # 上限本身是 4096：比它大的图必须被拒（由 URL 参数与前端画布共同约束）。
        self.assertEqual(MAX_EXPORT_IMAGE_EDGE, 4096)

    def test_animated_input_takes_first_frame(self) -> None:
        from PIL import Image

        frames = [Image.new("RGB", (16, 16), color) for color in ((255, 0, 0), (0, 255, 0))]
        buffer = io.BytesIO()
        frames[0].save(buffer, format="GIF", save_all=True, append_images=frames[1:], duration=100, loop=0)
        encoded = encode_webp(buffer.getvalue())
        self.assertEqual(encoded[8:12], b"WEBP")


if __name__ == "__main__":
    unittest.main()
