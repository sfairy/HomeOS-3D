/**
 * @file template-yaml.internals.ts
 * @module shared/ha
 *
 * HA Template YAML 内部工具 barrel：实现已拆分到同目录 sibling util，本文件仅再导出以保持
 * `export * from './template-yaml.internals'` 与既有 named import 兼容。
 *
 *  - template-yaml-blocks.util：YAML 块解析与匹配
 *  - template-yaml-text.util：纯文本行级定位 / 截取 / 增删
 *  - template-yaml-fs.util：本地文件系统扫描与读写
 *  - template-yaml-stub.util：占位 stub + trigger entity 推断
 */
export * from './template-yaml-blocks.util';
export * from './template-yaml-text.util';
export * from './template-yaml-fs.util';
export * from './template-yaml-stub.util';
