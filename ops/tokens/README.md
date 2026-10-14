# UI 令牌门禁与映射契约

对 `homeos` + `homeos-store` 两个前台的 `var(--x)` 引用与令牌映射做**CI 级静态校验**。
这里只放门禁与其引擎；一次性的配色 / 重复定义 / 断点 / surface 审计工具已退役
（历史数据不再保留，需要时按下面的判定口径重写）。

```bash
bun run verify:tokens                # 令牌契约门禁：var() 引用必须可解析（CI 友好，失败退出码 1）
bun run verify:tokenmap              # 令牌映射棘轮门禁：漂移/分歧/越界只减不增
node ops/tokens/collect-token-map.mjs  # 重新生成映射契约（verify:tokenmap 的入参）
node ops/tokens/check-token-contract.mjs --update   # 收紧「有回退」容忍档基线（只在真降下来之后跑）
node ops/tokens/_token_contract_selftest.mjs        # 令牌契约门禁自检（判据注入 + 真实基线形状）
```

| 脚本 | 产出 | 说明 |
| --- | --- | --- |
| `check-token-contract.mjs` | `ops/tokens/reports/token-contract.json` | **门禁**：`var(--x)` 是否都能解析到定义（未解析且无回退 → 退出码 1）；选择器位置的 `var()`；毛玻璃禁用组两份清单一致；「有回退」容忍档**逐项棘轮**（基线见下） |
| `_token_contract_selftest.mjs` | — | **自检**：把四类缺陷注入合成样式断言判据会红，并断言真实 `main.css` / 真实基线形状正确（判据写法一变就静默变瞎，正是这里要拦的失效方式） |
| `baseline-ratchet.mjs` | — | 容忍档棘轮的纯函数与读写（`compareRatchet` / `readBaseline` / `writeBaseline`），门禁与自检共用一份 |
| `token-contract-baseline.json` | — | 容忍档基线：`{ "toleratedWithFallback": ["<file>|<name>", …] }`，**只减不增**（新增必红、失效必删） |
| `selector-var.mjs` | — | 选择器位置 `var()` 的解析引擎 + 毛玻璃禁用组两份清单的对账锚点（自检直接调这里的纯函数） |
| `collect-token-map.mjs` | `ops/contracts/ui-token-map.json` | 令牌映射契约：别名链、同名分歧、值同构镜像、命名空间遮蔽、区域身份色越界、命名漂移 |
| `check-token-map.mjs` | — | **门禁**：映射棘轮（漂移/分歧/越界只减不增），基线在 `ops/contracts/ui-token-map.baseline.json` |
| `targets.mjs` | — | 审计目标根（`REPO_ROOT` / `TARGETS` / `scanDirs` / `OUT_DIR`）与输出目录，各脚本共用一份避免漂移 |

引擎库（放在 `ops/lib/`，与 UI 无关，被依赖门禁一起复用）：

| 库 | 说明 |
| --- | --- |
| `../lib/scan.mjs` | 共享扫描库：遍历（带**进程内**遍历缓存）、注释抹白、import spec 提取、纯 re-export 判定、颜色解析。4 个依赖门禁 + 2 个令牌门禁共用一份，扩展名与副作用 import 口径不会再各写一份 |
| `../lib/run-chain.mjs` | **并发链执行器**：按清单（如 `homeos/frontend/scripts/deps-gates.mjs`）有界并发跑一串只读门禁，输出按清单顺序整段打印、任一步非 0 则整链失败。串行 `&&` 链的关键路径是各步之和，这里压成最大值 |

`collect-token-map.mjs` 的命名漂移名单取自 `check-token-contract.mjs` 的实测引用
（流水线中先跑契约门禁、再跑映射门禁），不手工维护：带 `--hos-` 前缀却无全局定义的名字才算漂移。

> 产物目录 `ops/tokens/reports/` 已进 `.gitignore`：门禁只读源码、写出 JSON 作为诊断，
> 不再产生「每次跑门禁都改一个被跟踪文件」的纯时间戳 diff。

## 判定与安全边界

审计器把每个 `--name` 出现点分为两类，而不是用 `var()` 正则：

- **定义**：处于声明起始处（上一个非空白字符是 `{` / `;` / 文件开头）且紧接 `:`；
- **使用**：出现在 `var(...)` / `env(...)` 括号内或 `@property` 之后。

这样 `.card--high::before` 这类 BEM 修饰符不会被误判成令牌定义；`var(--a, var(--b))`
的第二参数也能正确识别。JS/模板/后端里的字面出现（`:style`、`setProperty`、字符串常量）
单独统计，`check-token-contract.mjs` 据此把「脚本注入」也算作有定义，避免误报。

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
