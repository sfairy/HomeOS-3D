# 命名门禁（naming）

本目录是 2026-10-21 标识符治理引入的独立工具链，与 ops/checks/studio/check_naming.mjs 互不替代：studio 门禁只管 studio/ 目录，本门禁覆盖 homeos/frontend/src、homeos-store/frontend/src、packages/shared/src。

## 命令

    bun run naming:report      # 报告：规则计数、高频短名、高密度文件
    bun run check:naming       # 门禁：超过 baseline.json 退出 1
    bun run naming:apply -- renames.json            # dry-run，打印将改的位置
    bun run naming:apply -- renames.json --write    # 落盘
    bun run test:naming        # node --test 工具自身测试

只跑单个文件：

    node ops/checks/naming/check_naming.mjs --report
    node ops/checks/naming/check_naming.mjs --list N1
    node ops/checks/naming/check_naming.mjs --json

## 规则

- N1：非导出声明使用 1–2 字符名，且不在 allow.json 的 global 允许清单内。
- N2：名字形如 num1、value2、v3 的数字后缀命名。
- N3：非导出声明使用非全大写常量式的 snake_case。
- N4：非导出的 function / class 使用下划线前缀（_foo）。

导出的短名不进门禁，单独列为 frozenExports（公开 API 冻结）。allow.json 的 global 条目按领域缩写放行（w/h/cx/cy/ms/ts/tz/dt 等），files 条目用于单文件、一次性豁免，必须写 reason。

## baseline.json

baseline.json 记录当前各规则计数。门禁比较的是“不超过 baseline”，所以新增违规会被发现，存量可以逐波下降。每完成一波改名就重跑：

    node ops/checks/naming/check_naming.mjs --update-baseline

目标是把 N1/N2/N3/N4 全部降到 0；下调过程必须与 docs/code-quality/2026-10-21/ 的 ledger 一致。

## rename.mjs 输入

参数是 JSON 数组，每项：

    {
      "file": "homeos/frontend/src/...ts",
      "line": 12,
      "offset": 345,
      "name": "e",
      "newName": "event",
      "kind": "param",
      "scriptSetupTopLevel": false,
      "templateVisible": false,
      "allowTemplate": false
    }

- file 相对仓库根；offset 是绝对文件偏移，scan/check 的 JSON 输出里有。
- 默认 dry-run，只有 --write 才落盘；默认拒绝导出符号；script setup 顶层且模板可见默认拒绝。
- .vue 会抽 script/scriptSetup 为虚拟文件，改完按 block 偏移写回；模板改名必须显式 allowTemplate，且会拒绝属性名、标签名、对象键、属性访问命中。
- 简写属性用 TypeScript 的 prefixText/suffixText 保留原键：const { e } = source 改名为 entry 后是 const { e: entry } = source。
- 新名若在同一个文件里已有声明，直接拒绝，避免作用域遮蔽。
- 每个 .vue 每批只允许一个模板绑定改名，便于人工核对。

## 验证边界

仓库目前没有应用级单元测试、E2E 或视觉回归；本工具链的测试只覆盖改名器本身。源码波次改名的验证依赖：bun run typecheck、eslint/ruff、check:naming、公共面导出快照 diff、人工抽查 diff。报告里必须写明这一限制。
