# UI / CSS 审计与清理工具

对 `homeos` + `homeos-store` 两个前台做配色、令牌、重复定义、无用定义、断点与 surface 的量化审计，
并附带两个**默认 dry-run** 的清理器（删重复规则、删无引用令牌）。

```bash
node ops/ui-audit/run-all.mjs        # 跑全部审计 + 两个清理器的 dry-run，汇总到 reports/summary.json
bun run verify:tokens                # 令牌契约门禁：var() 引用必须可解析（CI 友好，失败退出码 1）
bun run verify:tokenmap              # 令牌映射棘轮门禁：漂移/分歧/越界只减不增
node ops/ui-audit/dedupe-css.mjs --write   # 删除文件内完全重复的规则块 / 空规则块
node ops/ui-audit/prune-tokens.mjs --write # 删除全仓无引用的自定义属性声明
```

| 脚本 | 产出 | 说明 |
| --- | --- | --- |
| `collect-tokens.mjs` | `tokens.json` | 令牌定义/引用清单与跨项目同名统计 |
| `scan-hardcoded-colors.mjs` | `hardcoded-colors.json` | 硬编码 hex / rgb() / hsl() 出现点 |
| `contrast-audit.mjs` | `contrast.json` | 令牌配对的 WCAG AA / 3:1 对比度 |
| `breakpoint-audit.mjs` | `breakpoints.json` | `@media` 宽度分布与规范外断点 |
| `surface-inventory.mjs` | `surfaces.json` | 路由 / 设置页 / 弹层等 UI surface 清单 |
| `css-duplicates.mjs` | `css-duplicates.json` | 重复规则、重复体、重复动画名、重复令牌名 |
| `css-unused.mjs` | `css-unused.json` | 死样式表、无用类/ID 选择器（分「严格 / 约定 / 动态拼接」三档） |
| `token-orphans.mjs` | `token-orphans.json` | 令牌分档：样式内引用 / 仅脚本注入 / 无任何引用 |
| `check-token-contract.mjs` | `token-contract.json` | **门禁**：`var(--x)` 是否都能解析到定义（未解析且无回退 → 退出码 1） |
| `dedupe-css.mjs` | `css-cleanup.json` | **清理器**：文件内完全重复规则块、空规则块 |
| `prune-tokens.mjs` | `token-prune.json` | **清理器**：无引用令牌声明（含跳过原因） |
| `collect-token-map.mjs` | `ops/contracts/ui-token-map.json` | 令牌映射契约：别名链、同名分歧、值同构镜像、命名空间遮蔽、区域身份色越界、命名漂移 |
| `check-token-map.mjs` | — | **门禁**：映射棘轮（漂移/分歧/越界只减不增），基线在 `ops/contracts/ui-token-map.baseline.json` |

`collect-token-map.mjs` 的命名漂移名单取自 `check-token-contract.mjs` 的实测引用（该脚本在 `run-all.mjs` 中先跑），不手工维护：带 `--hos-` 前缀却无全局定义的名字才算漂移。

## 判定与安全边界

审计器把每个 `--name` 出现点分为两类，而不是用 `var()` 正则：

- **定义**：处于声明起始处（上一个非空白字符是 `{` / `;` / 文件开头）且紧接 `:`；
- **使用**：出现在 `var(...)` / `env(...)` 括号内或 `@property` 之后。

这样 `.card--high::before` 这类 BEM 修饰符不会被误判成令牌定义；`var(--a, var(--b))`
的第二参数也能正确识别。JS/模板/后端里的字面出现（`:style`、`setProperty`、字符串常量）单独统计。

令牌引用分四档：`referenced`（样式内使用）、`js-injected`（仅脚本/模板出现）、
`reserved`（定义全部落在策展字典 `main.css` / `hos-design-system.css`，属刻意预留）、
`dead`（无任何使用，删除候选）。把 `reserved` 单列，`dead` 才是一个可执行的数字。

跨文件「同选择器 + 同声明体」按**加载语义**分类，而不是只看文本：

| 分类 | 含义 | 可去重 |
| --- | --- | --- |
| `redundant` | 同项目 + 非 URL 投放 + 全为全局 | 是（唯一可动作项） |
| `scoped-distinct` | 参与者含 `<style scoped src>`，编译后带 `[data-v-*]` 属性 | 否，是组件封装 |
| `cross-bundle` | 经 `public/static/**` 或脚本里的 `.css` URL 独立投放 | 否，需各自自足 |
| `cross-project` | 跨 homeos / store / shared | 否，各自需要 |
| `mirror` | 同源镜像（`design/scene` → 两个 `public/static` 副本） | 否，`verify_scene_sync.py` 校验 |

自动清理只在一组严格条件下动手，其余一律只报告：

- 只删**同一文件、同一 `@media` 上下文、同选择器、同声明体**的完全重复块（后出现者等价）；
- 无引用令牌要求「样式内无 `var()`、脚本/模板里也从不出现」，且必须是**整行单条声明**；
- 跳过：同源镜像、`vendor/`、`*.min.css`、`--tw-*`、策展字典（`main.css` / `hos-design-system.css`）；
- 邻近注释出现「保留 / 预留 / 无消费者 / 待决策」等措辞时不删（`token-prune.json` 里记为 `retention-hint`）；
- 多声明同行、跨行值、选择器内同行声明都记为 `unsafe-decl` / `multiline-or-unmatched`，交人工。

两个清理器都是幂等的：改完再跑一次应当输出 0 处改动，`run-all.mjs` 的 `css-cleanup` / `token-prune` 保持 0 即视为收敛。
改写单行时保留原有行尾（仓库里存在历史遗留的 CRLF 混合文件）。

## 当前基线（可作为门禁参考）

| 指标 | 数值 |
| --- | --- |
| 对比度（3 个作用域 92 组配对） | 正文不达 AA **0**，图形不达 3:1 **0** |
| 跨文件完全重复规则 | 真冗余 **0**（刻意重复 61：cross-bundle 29 / scoped-distinct 28 / cross-project 4） |
| 同源镜像重复规则 | 449（由 `verify_scene_sync.py` 保证） |
| 令牌引用 | 有使用 1123 / 仅脚本 657 / 字典预留 59 / 无使用 **12** |
| 无使用令牌剩余 12 个 | `--hb-shadow-sm`（`homeos-store/frontend/public/static/theme.css`）、`--tw-ring-color`（`CameraTile.vue`，Tailwind 运行时内部），以及 `features/settings/automate/linkage/styles/linkage.css` 里 10 个未接线的 `--link-*`（`--link-presence-rgb` / `--link-security` / `--link-auto(-rgb)` / `--link-warn(-rgb)` / `--link-danger(-rgb)` / `--link-ink-soft` / `--link-fill-hover`） |
| 令牌契约 | 624 个样式源 / 15556 次引用，未解析且无回退 **0**，未解析但有回退 41 |
| 硬编码色 | hex 7217（去重 1821）、rgb/hsl 8612（去重 1903） |
| 规范外断点 | 34 |

> 本表是快照，由 `reports/*.json` 派生；改过样式后重跑 `run-all.mjs`（或对应单个脚本）再回头核一遍数字。

> 早先由 `gen-docs.mjs` 生成的 `docs/ui-audit/` 分册已废弃删除（`docs/` 已进 `.gitignore`，`run-all.mjs` 不再生产它）——数据一律看本目录 `reports/*.json`。

## 令牌契约门禁检出的问题（已修）

`check-token-contract.mjs` 首次运行检出 30 处 `var()` 引用无定义且无回退 —— 这些声明会
invalid at computed-value time 被整条丢弃，属性静默失效。

- **浮动组件设置面板（`features/settings/display/floating/styles/floating.css`）**：13 个
  `--afh-*`（radius / border / text / ease / mint / rose / accent-* 派生色）在任何文件里都没有定义，
  约 60 处引用全部失效。已在文件顶部补 `:root` 契约块，取值对齐语义原语（`--hos-*`）与
  浮动组件本体；`--afh-accent-*` 派生色与 `floating-hub/index.css` 的 `color-mix` 配方一致。
  修复前后用 CDP 读 `.afh-card` 计算样式确认：`border-radius 0px → 14px`、
  `border none → 0.5px solid`、`transition-duration 0s → 0.28s`。
- **设置 Hub workspace（`shared/styles/settings-hub-workspace.css`）**：`--hub-band-bg` /
  `--hub-surface` / `--hub-surface-border` 同样无定义。排查发现承载它们的规则要么是
  **死类**（`.hub-glance-band` / `.link-glance-band` / `.link-workspace` 在任何模板与脚本里都不出现），
  要么被 `settings-flow-band.css` 完整覆盖，因此按「删死代码」处理：移除死规则与依赖未定义令牌的
  两行声明，`.hub-stat` 的计算样式逐项与改动前一致（已用 CDP 比对）。

`check-token-contract.mjs` 的 `.vue` 处理需要同时覆盖**样式区与脚本区**：早期版本把 `.vue`
整体当样式文件，脚本区的 `setProperty('--x')`、`:style` 对象键全被漏掉，导致 13 个 JS 注入令牌
被误报为未解析。

