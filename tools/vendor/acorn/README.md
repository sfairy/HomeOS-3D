# acorn（工具链侧的 vendored 依赖）

`tools/lib/free-variables.mjs` 要判「一个名字在本文件里被取用、却没有任何绑定」——
就是 `ReferenceError: xxx is not defined` 那一类。这条判据**必须有真正的语法树**：
按行/按字符的窄口径分不清对象字面量的键、成员名、解构键与真正的取用，全仓跑出 7996 条，
绝大多数是模板字符串里的 GLSL 与平台内置（这段取舍的来历见 `tools/check_invariants.mjs`
文件头第 9 条）。所以这里落一份 acorn。

## 为什么是 vendored、而不是 `package.json` + `npm ci`

`.github/workflows/guards.yml` 跑的是 `node tools/check_invariants.mjs`，
跑在 `ubuntu-latest` 上、**没有任何 npm 安装步骤**（工作流注释写明了「ubuntu-latest 自带 node，
不需要额外 setup」）。本仓没有 `package.json`、没有 `node_modules`、没有锁文件，
工具链一直是「clone 下来 `node tools/xxx.mjs` 就能跑」。
vendored 一份自包含的 parser 是唯一能保持这一点的做法，与 `frontend/static/vendor/`
下 three / hls.js 是同一套办法。

## 来源与校验

| 项 | 值 |
| --- | --- |
| 包 | `acorn` |
| 版本 | `8.18.0` |
| 入口 | `dist/acorn.mjs`（ESM，自包含，全文只有末尾一条 `export`，无 `import`） |
| 许可证 | MIT（见同目录 `LICENSE`） |
| 传递依赖 | 无（acorn 的 `dependencies` 为空） |
| tarball sha256 | `0ad4c0f28f9bc5bb6f3eb879b4fd38265def6d7e1e5d61f96f78ee6a8a7be94a` |
| `acorn.mjs` sha256 | `953573b8fdab71599749ea5f2b33d3e760c2116178f9423ee7458dbe39d59453` |

复现取用：`npm pack acorn@8.18.0` 后从 tarball 里取 `package/dist/acorn.mjs` 与 `package/LICENSE`。

## 纪律

- **`acorn.mjs` 不许改**：升级就是整份替换，并把上表的两个 sha256 与版本号一起改掉。
- 这里只放「本仓自己不写、也不许改」的第三方产物。想改行为就改调用方
  （`tools/lib/free-variables.mjs`），不要就地打补丁。
- `tools/vendor/` 这个目录名在 `check_invariants.mjs` 的 `SKIP_DIRS` 里 ——
  其它按 `frontend/**` 扫的判据不会把这份 parser 当成仓内模块。
