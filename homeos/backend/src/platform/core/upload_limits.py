"""端点声明的「请求体上限」单一来源（字节）。

为什么单独放一层：同一个数字被两侧同时需要，而它们分属不同层——

- 请求体门禁（``platform.security.body_limit`` 的按路径覆盖表）决定**请求能不能进得来**；
- 端点处理器（如 ``api.studio3d`` 写草稿 / 收导出包）决定**内容是否合规**。

两处各写一遍必然会漂移。曾经的故障就是这样：处理器声明导出包上限 512MB、草稿上限
64MB，而门禁对所有已鉴权请求一律只放 50MB —— 处理器里那些上限永远走不到，用户拿到
的是一个与「文件太大」毫无关系的 413，而代码看上去「有限制、很安全」。

放在 ``platform.core`` 是因为它是叶子层：``api`` 与 ``bootstrap`` 都能安全引用，
不会引入循环依赖。
"""

from __future__ import annotations

#: 3D 户型草稿（PUT ``/studio3d``）单次保存的正文上限：64MB。
#: 户型 JSON 含门窗、家具、贴图引用，实测远小于此；留足余量的同时挡住异常体量。
MAX_STUDIO3D_DRAFT_BYTES = 67108864

#: 3D 场景导出包（POST ``/studio3d/exports``）归档本体上限：512MB。
#: 这是**压缩后**的体积；解压后的累计与单条目另有上限，见 ``api.studio3d``。
MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES = 536870912

#: 加密业务备份包（POST ``/backups/inspect``）归档本体上限：512MB。
#: 与 ``domains.backup.business_backup.MAX_ARCHIVE`` 是同一个数字 —— 前端弹窗也据此
#: 提示「备份文件上限 512 MB」。真实库 + 素材很容易超过 50MB，门禁若按全局 50MB 拦，
#: 这个上限与它那条「超过 512 MB」的报错就都成了永远走不到的死代码。
MAX_BACKUP_ARCHIVE_BYTES = 536870912

#: 按路径放行更大请求体的端点（前缀 → 上限）。门禁按前缀从长到短匹配，
#: 因此更具体的路径可以覆盖更宽的前缀。
#:
#: 注意：这里只应列出**处理器自己也声明了对应上限**的端点。门禁放行多大，
#: 处理器就必须能挡住多大，否则等于把内存 / 磁盘交给请求方。
PATH_BODY_LIMIT_OVERRIDES: tuple[tuple[str, int], ...] = (
    ("/api/v1/studio3d/exports", MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES),
    ("/api/v1/backups/inspect", MAX_BACKUP_ARCHIVE_BYTES),
    ("/api/v1/studio3d", MAX_STUDIO3D_DRAFT_BYTES),
)

__all__ = [
    "MAX_BACKUP_ARCHIVE_BYTES",
    "MAX_STUDIO3D_DRAFT_BYTES",
    "MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES",
    "PATH_BODY_LIMIT_OVERRIDES",
]
