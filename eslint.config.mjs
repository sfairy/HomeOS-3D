/**
 * P12 CI 加固：前端（JavaScript）侧的静态检查配置。
 *
 * 跑法（CI 与自检里就是这一条，见 .github/workflows/ci.yml）：
 *     npx eslint .          # 不用再传目录：扫谁由下面的 files / ignores 决定
 * `backend/tools/smoke.py` 里有一条同名自检会把同一份配置再跑一遍（`node_modules` 里
 * 没有 eslint 时按 ruff / node 探针的先例显式 skip）。
 *
 * 为什么需要它：这个仓库已有的闸几乎都是**自己写的**扫描 —— 语法检查（node --check）、
 * 模块顶层求值（W30 探针）、死导出（check_frontend_dead_exports）、定义点唯一……
 * 它们各自只认一件事，于是留下一整片空白：**函数体里的名字**。W30 的覆盖边界写得很清楚
 * （只求值顶层），语法检查看不见名字，探针按名字切函数驱动。这次把 eslint 接上，第一遍
 * 就抓到三处 `ReferenceError`：
 *
 *   - `renderer/cover-runtime.js` 的 `coverToggleServiceForComponent` 调用了一个
 *     **再导出**（`export { x } from "..."` 不建本地绑定）的名字，弹层里点窗帘开关必抛；
 *   - `renderer/renderer.js` 两处写着 `COVER_CLOSED_POSITION_EPSILON`，而这个常量
 *     全仓库从来没被定义过 —— 点一次弹层里的开关，按钮就卡在 aria-busy 上再也不响应。
 *
 * 两处都在函数体内，此前所有闸门都是绿的。
 *
 * 为什么只选下面这些规则，而不是 `--select all` 那种开满：判据与 ruff.toml 一致 ——
 * 「能不能挡住**这个仓库真发生过**的回归」。开满的代价是具体的：量测时把候选规则全开，
 * 光是风格族（`curly` / `eqeqeq` / `yoda` / `no-else-return` / `no-nested-ternary` …）
 * 就报出两千多条，真问题会淹在里面。逐条去留的理由写在下面每一族的注释里，
 * 完整量测结果与「故意不进名单的规则」写在 docs/AUDIT-2026-09-17.md 的 P12 项里；
 * 改名单时两边要一起改，否则两边会开始讲不一样的话。
 *
 * 环境要求：node（`node --check` 那条已经在用）+ 仓库根的 `npm ci` 装出来的
 * `node_modules`。**不把 eslint 打进任何镜像**：它是开发期 linter，与 ruff 同一口径。
 */
import globals from "globals";

/** 不进任何一块配置的目录：第三方打包件、依赖树、构建产物与本地解包目录。 */
const IGNORES = [
  "**/vendor/**",
  // 压缩过的第三方件（store 页面的 jquery 两件是直接放在 store/static 下的）。
  // 它们不是我们维护的代码：量测时 jquery.min.js 一个文件就贡献了两千多条命中。
  "**/*.min.js",
  "**/node_modules/**",
  "**/.venv/**",
  "**/.venv-store/**",
  "**/.extracted/**",
  "**/deploy/**",
  "**/data/**",
];

/**
 * 判据类规则：这一族是「接 eslint 的理由」，每条都能指到这个仓库真发生过的回归。
 */
const CORRECTNESS_RULES = {
  // 未定义名：本批抓到 3 处（上面模块头里那两例）。已有闸门的覆盖边界见模块头。
  "no-undef": "error",
  // 未使用的声明：P12 前半段补上了「导出必须有人 import」，这条补的是**另一半** ——
  // 模块内部（不导出）的函数、常量、以及函数体内的局部变量。本批清掉 60 余处，
  // 其中两处是「常量定义了、注释指着它，代码里却写死字面量」（geometry.js 的 EPSILON、
  // popup-layout.js 的那组布局常量）—— 那种形态比纯死代码更危险：改常量不生效。
  //   - args: "none"：**不查未使用的形参**。与 Python 侧同一个口径 —— ruff 选的 F 族里
  //     只有 F841（函数内赋值未使用），没有 ARG 那一族，因为「形参留着没人用」在这个仓库
  //     是一种**写明在 docstring 里的契约**：`selectableEntities(entityQueryType)`、
  //     `popupModuleRowSpan(rowModuleSpec)`、`iconButtonEffectInspectorLayer(component, …)`
  //     都是「参数留给后续扩展，当前实现不读」的显式占位（JS 也没有 Python 那种 `_` 约定）。
  //     查形参只会逼出一堆行内豁免，而豁免一多这条闸就没人看了。
  //   - ignoreRestSiblings: true：`const { height: ignoredHeight, ...rest } = x` 是
  //     **故意取掉某个键**的写法，被取掉的那个名字必然未用，不该报；
  //   - caughtErrors: "none"：`catch (_) {}` 是这套代码里明确接受的容错形态
  //     （多数还带注释说明为什么吞掉），不查 catch 绑定。
  "no-unused-vars": [
    "error",
    { args: "none", ignoreRestSiblings: true, caughtErrors: "none" },
  ],
  // 同名不同物 / 复制粘贴事故：P10 那几批整批在收敛「同名不同义」，
  // `no-dupe-keys` 在本批抓到自检脚本自己的一处重复套件注册（`pair-scan` 登记了两遍）。
  "no-redeclare": "error",
  "no-dupe-args": "error",
  "no-dupe-keys": "error",
  "no-dupe-class-members": "error",
  // 同一个模块被 import 两次：本仓的导入路径带 `?v=` 缓存戳，两条 import 会让同一模块
  // 以两个不同的 specifier 存在（缓存戳纪律是 P6/P11 反复踩过的坑）。
  "no-duplicate-imports": "error",
  // 走不到的分支 / 落空的 switch：与 P12「死代码」同一主题。
  "no-unreachable": "error",
  "no-fallthrough": "error",
  "no-constant-condition": "error",
  "no-constant-binary-expression": "error",
  // 笔误形态：`x = x`、`x === x`、`if (x = y)`。
  "no-self-assign": "error",
  "no-self-compare": "error",
  "no-cond-assign": "error",
  "no-unused-private-class-members": "error",
  // 空块：只查「空的分支 / 循环体」（那是漏写），`catch {}` 是本仓刻意的容错写法，
  // 31 处全部带注释说明，因此 allowEmptyCatch 打开。
  "no-empty": ["error", { allowEmptyCatch: true }],
  // 遮蔽外层同名变量：P10 的主题「同名不同义」的判据版。本批 2 处（一个巨大的
  // `planContext` 形参遮住了两千行外的同名变量、一个 `catch (e)` 遮住了外层 `e`）。
  "no-shadow": "error",
};

/**
 * 静默错值类：这些写法不抛错、也不报语法问题，只是**算出来的东西不对**。
 * 本批量测时全部 0 命中 —— 进名单纯粹是防倒退，代价为零。
 */
const SILENT_WRONG_VALUE_RULES = {
  // `!a in b`、`!(a in b)` 之类把否定写错位置。
  "no-unsafe-negation": "error",
  // `a?.b.c` —— 短路后继续取属性，崩在「看起来不可能」的地方。
  "no-unsafe-optional-chaining": "error",
  // `Math()`、`JSON()`、`Reflect()` 这类不能当函数调用的全局对象。
  "no-obj-calls": "error",
  // `new Symbol()` / `new BigInt()`：原生函数不能 new。
  "no-new-native-nonconstructor": "error",
  // 数字字面量超出双精度能表示的整数范围（静默变值）。
  "no-loss-of-precision": "error",
  // `typeof x === "strng"`：拼错的字面量永远是 false。
  "valid-typeof": "error",
  "use-isnan": "error",
  "no-compare-neg-zero": "error",
  // `[a, , b]` 里那个空槽。
  "no-sparse-arrays": "error",
  // 普通字符串里写了 `${x}`。
  "no-template-curly-in-string": "error",
  // `[👍]` 这类需要 u 标志的字符组（一个字符被当成两个）。
  "no-misleading-character-class": "error",
  "no-useless-backreference": "error",
};

/**
 * 异常与异步语义类：这一族对应 P5 / P9（异步批次与「错误不能被吞掉」）踩过的坑。
 */
const EXCEPTION_RULES = {
  // `catch (e) { e = ... }`：把原始异常顶掉（与 ruff 那条 B904 同一动机）。
  "no-ex-assign": "error",
  "no-func-assign": "error",
  // 给 import 绑定赋值（运行时必抛，写的时候就该报）。
  "no-import-assign": "error",
  "no-setter-return": "error",
  // throw / return 写在 finally 里：会把 try 里真正的原因吞掉或改写。
  "no-unsafe-finally": "error",
  // `new Promise(async resolve => ...)`：executor 是 async 时异常不再被 Promise 捕获。
  "no-async-promise-executor": "error",
};

/**
 * 安全类：本仓前端拿的是会话令牌与设备控制权，这几条是经典入口。
 * 量测时全部 0 命中（jquery.min.js 里的那几条随它一起被排除）。
 */
const SECURITY_RULES = {
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-wrappers": "error",
  "no-script-url": "error",
  "no-prototype-builtins": "error",
  "no-with": "error",
  // parseInt 不带基数：以 0 开头的字符串会被当成八进制。
  radix: "error",
  // throw 一个字符串 / 字面量：丢掉栈。
  "no-throw-literal": "error",
};

/**
 * 卫生类：功能上无害，所以只能靠闸看（与 ruff 名单里的 `W` 同族：
 * 行尾空白、文件末尾缺换行那类 —— 人工 review 看不见）。
 */
const HYGIENE_RULES = {
  // 代码里混进了 NBSP / 零宽空格 / 全角空格（中文注释里手滑最容易带进来）。
  "no-irregular-whitespace": "error",
  "no-mixed-spaces-and-tabs": "error",
  "no-octal-escape": "error",
};

const RULES = {
  ...CORRECTNESS_RULES,
  ...SILENT_WRONG_VALUE_RULES,
  ...EXCEPTION_RULES,
  ...SECURITY_RULES,
  ...HYGIENE_RULES,
};

/**
 * store 页面那侧是**经典脚本**（`<script src>` + 跨文件裸全局），与 frontend 的模块语义不同，
 * 因此单独一块配置。两处差别都要紧：
 *
 *   - `sourceType: "script"`：这些文件里写 `import` / `export` 是解析错误（它们不是模块），
 *     由 eslint 直接把这一条钉住；
 *   - `no-unused-vars` 与 frontend 那块用同一份参数（`vars` 取默认的 `"all"`，即**顶层也查**）：
 *     接入当天这里刻意收窄成 `vars: "local"`，理由是「经典脚本的顶层声明就是跨文件全局
 *     （`HtmlSafe` 定义在 htmlsafe.js、`ApiError` 定义在 api-error.js），静态判据看不见
 *     别的文件里的消费方，报红的唯一后果是逼人写豁免」。P12 收口量过之后这条顾虑不成立：
 *     把参数放宽到 `"all"` 跑一遍，**6 个文件 0 条发现** —— 上面那两个跨文件全局在自己的
 *     文件里也都有消费方（`global.HtmlSafe = …` 与文件尾的 CommonJS 兼容尾巴），
 *     其余顶层声明都在本文件内被读。于是顶层死符号这一类（4.2 最后剩下的一块空白）
 *     由这条闸接管；将来真出现「只被别的文件或模板 `onclick=` 消费」的顶层名字，
 *     经典脚本的官方豁免是**在声明上方写一条 `exported` 注释**（开注释标记 + `exported`
 *     加名字 + 闭注释标记，就是 eslint 文档里那条写法；这里不给字面量是因为本段自身是
 *     块注释，写进去会提前闭合）。已量过：写了不报、不写就报。而不是把这一块的 `vars`
 *     再收窄回去 —— 那等于把整类盲区换回来。
 *
 * `globals` 里要显式写出这两个跨文件全局：`no-undef` 的价值正在于「它不认识的名字要报红」，
 * 白名单因此必须一条条列出来（与 W30 那张 TOPLEVEL_BROWSER_GLOBALS 同一逻辑）。
 */
const STORE_SCRIPT_GLOBALS = {
  // 定义在 store/static/htmlsafe.js。
  HtmlSafe: "readonly",
  // 定义在 store/static/api-error.js。
  ApiError: "readonly",
  // jquery（store/static/jquery.min.js）与它的二维码插件：压缩件本身不参与 lint，
  // 但这两个全局名是 store.js / referrals.js 的取用入口。
  $: "readonly",
  jQuery: "readonly",
  // 经典脚本尾部的 CommonJS 兼容尾巴（`if (typeof module !== 'undefined') module.exports = …`）：
  // 浏览器里走不到，但 store/tools 的自检会 require 这两个文件，两处都要留。
  module: "readonly",
};

export default [
  { ignores: IGNORES },
  {
    // 产品代码：展示页 / 编辑器 / 3D 运行时树，全是 ES 模块。
    files: ["frontend/**/*.js", "frontend/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      // 只给浏览器全局：给多了（例如顺手带上 node）就会把「浏览器代码里写了 process」
      // 这类真缺陷一起放过。
      globals: { ...globals.browser },
    },
    rules: RULES,
  },
  {
    files: ["store/static/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser, ...STORE_SCRIPT_GLOBALS },
    },
    rules: {
      ...RULES,
      // 参数与 frontend 那块逐字相同，**只差这里写出来的理由**（顶层也查，见上面的长注释）：
      // 不写 `vars` 就是默认的 `"all"`，所以这一条现在同时覆盖顶层与函数内的未使用声明。
      "no-unused-vars": [
        "error",
        { args: "none", ignoreRestSiblings: true, caughtErrors: "none" },
      ],
    },
  },
  {
    // 自检与构建工具：node 侧（探针、静态检查脚本、容器里的混淆构建）。
    files: ["backend/tools/**/*.mjs", "tools/**/*.mjs", "docker/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: RULES,
  },
];
