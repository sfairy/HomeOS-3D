/**
 * 「自由标识符」检测：找出在一个模块里被**取用**、却在文件内找不到任何绑定的名字。
 *
 * 为什么单开一个模块而不是塞进 check_invariants.mjs：这件事需要真正的语法树 + 一条作用域链。
 * 上一版按行级正则判，在全仓 298 个模块上跑出 7996 条，绝大多数是模板字符串里的 GLSL
 * （`vec2` / `mix` / `smoothstep`）与平台内置（`Number` / `Map` / `Set`）—— 分不清「对象字面量的键」
 * 与「真正的取用」就必然如此。这里把「哪些 Identifier 才算取用」写成一张显式的节点类型表，
 * 而不是靠正则的运气。
 *
 * 判据边界（与本仓「判不出真假就不判」的底线一致）：
 *   - 只报**本文件内解析不出绑定**的名字。绑定来源含 import、三种声明、函数/类名、
 *     形参、解构、catch 形参、class 静态块的 var、以及 `arguments`（函数作用域内）。
 *   - `typeof x` 里那个**裸名字**不报：`typeof` 对未声明的名字不抛错，是特征探测的常规写法
 *     （`typeof ResizeObserver !== "undefined"`），报了必然是误报。`typeof a.b` 里的 `a` 照报
 *     —— 那个会真的求值并抛错。
 *   - `with` 语句体内一律不报：作用域在那一段是运行期决定的，静态判不出真假。
 *   - 不判跨文件：某个名字是不是浏览器宿主全局，由调用方给白名单，本模块不认识任何全局。
 *
 * 产出按位置排序，带 1 起的行号，可直接跳转。
 */

import { parse } from "../vendor/acorn/acorn.mjs";

/** `var` 与函数声明提升到的那几种作用域；其余都是块级作用域。 */
const VAR_SCOPE_KINDS = new Set(["module", "function", "static-block"]);

class Scope {
  constructor(kind, parent) {
    this.kind = kind;
    this.parent = parent;
    this.bindings = new Set();
  }

  declare(name) {
    if (name) this.bindings.add(name);
  }

  /** `var` / 函数声明落到的最近一层「变量作用域」。 */
  varScope() {
    let scope = this;
    while (scope.parent && !VAR_SCOPE_KINDS.has(scope.kind)) scope = scope.parent;
    return scope;
  }

  resolves(name) {
    for (let scope = this; scope; scope = scope.parent) {
      if (scope.bindings.has(name)) return true;
    }
    return false;
  }
}

class Analyzer {
  constructor() {
    this.references = [];
    /** 本分析器没有显式处理的节点类型 —— 出现即说明 acorn 升级带来了新语法，要补进 dispatch。 */
    this.unhandledTypes = new Set();
  }

  record(node, scope, ctx) {
    if (ctx.inWith) return;
    this.references.push({ name: node.name, scope, line: node.loc.start.line, column: node.loc.start.column });
  }

  // ---- 函数 / 类作用域 ----

  visitFunction(node, scope, ctx) {
    const fnScope = new Scope("function", scope);
    // 具名函数表达式与函数声明，名字都在自己体内可见（递归）。
    if (node.id) fnScope.declare(node.id.name);
    // 箭头函数没有自己的 `arguments`，从外层继承；普通函数有。
    if (node.type !== "ArrowFunctionExpression") fnScope.declare("arguments");
    for (const param of node.params) this.visitTarget(param, fnScope, { ...ctx, kind: "param" }, "binding");
    this.visit(node.body, fnScope, ctx);
  }

  visitClass(node, scope, ctx) {
    const classScope = new Scope("class", scope);
    if (node.type === "ClassDeclaration") {
      if (node.id) scope.declare(node.id.name);
    } else if (node.id) {
      classScope.declare(node.id.name);
    }
    // `extends` 里的名字在外层作用域求值（类名此刻还没绑定）。
    if (node.superClass) this.visit(node.superClass, scope, ctx);
    for (const element of node.body.body) {
      switch (element.type) {
        case "MethodDefinition":
        case "PropertyDefinition":
        case "AccessorProperty":
          if (element.computed) this.visit(element.key, classScope, ctx);
          if (element.value) this.visit(element.value, classScope, ctx);
          break;
        case "StaticBlock": {
          // 静态块是独立的变量作用域，且是 `var` 的落点。
          const block = new Scope("static-block", classScope);
          this.visitStatements(element.body, block, ctx);
          break;
        }
        default:
          this.unhandledTypes.add(`ClassBody>${element.type}`);
          this.visit(element, classScope, ctx);
      }
    }
  }

  // ---- 解构 / 赋值目标 ----

  /**
   * `mode` 为 `"binding"` 时遇 Identifier 记绑定，为 `"assign"` 时记取用 ——
   * 两种写法共用同一套 pattern 结构，差别只在叶子怎么算：
   * `const { a } = x` 是绑定，`({ a } = x)` 是「取用一个已有的 a」。
   */
  visitTarget(node, scope, ctx, mode) {
    if (!node) return;
    switch (node.type) {
      case "Identifier":
        if (mode === "binding") scope.declare(node.name);
        else this.record(node, scope, ctx);
        return;
      case "ObjectPattern":
        for (const property of node.properties) {
          if (property.type === "RestElement") {
            this.visitTarget(property.argument, scope, ctx, mode);
            continue;
          }
          // 计算键 `{ [k]: v }` 里的 k 永远是取用。
          if (property.computed) this.visit(property.key, scope, ctx);
          this.visitTarget(property.value, scope, ctx, mode);
        }
        return;
      case "ArrayPattern":
        for (const element of node.elements) this.visitTarget(element, scope, ctx, mode);
        return;
      case "AssignmentPattern":
        // `[a = fallback]`：左边是目标，右边是表达式。
        this.visitTarget(node.left, scope, ctx, mode);
        this.visit(node.right, scope, ctx);
        return;
      case "RestElement":
        this.visitTarget(node.argument, scope, ctx, mode);
        return;
      case "Property":
        if (property_.computed !== undefined) return;
        return;
      default:
        // `obj.a = x` 里的 MemberExpression、以及 SequenceExpression 之类的罕见目标：
        // 按普通表达式走（`obj` 是取用，`.a` 不是）。
        this.visit(node, scope, ctx);
    }
  }

  // ---- 语句 ----

  visitStatements(statements, scope, ctx) {
    for (const statement of statements) this.visit(statement, scope, ctx);
  }

  visitSwitch(node, scope, ctx) {
    // switch 的各个 case 共用一层块级作用域（`let` 不会按 case 隔离）。
    const switchScope = new Scope("block", scope);
    this.visit(node.discriminant, scope, ctx);
    for (const switchCase of node.cases) {
      if (switchCase.test) this.visit(switchCase.test, switchScope, ctx);
      this.visitStatements(switchCase.consequent, switchScope, ctx);
    }
  }

  /** for 头部用 `let`/`const` 时，整条 for 语句是一层作用域（`for (let i…)` 的 i 不外泄）。 */
  forHeadScope(node, scope) {
    const declaration = node.type === "ForStatement" ? node.init : node.left;
    const blockScoped = declaration?.type === "VariableDeclaration" && declaration.kind !== "var";
    return blockScoped ? { headScope: new Scope("block", scope), needsClose: true } : { headScope: scope, needsClose: false };
  }

  visitFor(node, scope, ctx) {
    const { headScope, needsClose } = this.forHeadScope(node, scope);
    if (needsClose) this.visit(node.init, headScope, ctx);
    else this.visit(node.init, headScope, ctx);
    this.visit(node.test, headScope, ctx);
    this.visit(node.update, headScope, ctx);
    this.visit(node.body, headScope, ctx);
  }

  // ---- 主 dispatch ----

  visit(node, scope, ctx) {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      // --- 叶子 ---
      case "Identifier":
        this.record(node, scope, ctx);
        return;
      case "PrivateIdentifier":
      case "Literal":
      case "TemplateElement":
      case "MetaProperty": // new.target / import.meta
      case "Super":
      case "ThisExpression":
        return;

      // --- 绑定与作用域 ---
      case "VariableDeclaration": {
        // `var` 提升到最近的变量作用域，`let`/`const` 留在当前块。
        const target = node.kind === "var" ? scope.varScope() : scope;
        for (const declarator of node.declarations) {
          this.visitTarget(declarator.id, target, ctx, "binding");
          if (declarator.init) this.visit(declarator.init, scope, ctx);
        }
        return;
      }
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.type === "FunctionDeclaration" && node.id) scope.declare(node.id.name);
        this.visitFunction(node, scope, ctx);
        return;
      case "ClassDeclaration":
      case "ClassExpression":
        this.visitClass(node, scope, ctx);
        return;
      case "BlockStatement": {
        const block = new Scope("block", scope);
        this.visitStatements(node.body, block, ctx);
        return;
      }
      case "StaticBlock": {
        const block = new Scope("static-block", scope);
        this.visitStatements(node.body, block, ctx);
        return;
      }
      case "CatchClause": {
        const catchScope = new Scope("block", scope);
        if (node.param) this.visitTarget(node.param, catchScope, ctx, "binding");
        this.visit(node.body, catchScope, ctx);
        return;
      }
      case "ForStatement":
        this.visitFor(node, scope, ctx);
        return;
      case "ForInStatement":
      case "ForOfStatement": {
        const { headScope } = this.forHeadScope(node, scope);
        if (node.left.type === "VariableDeclaration") this.visit(node.left, headScope, ctx);
        else this.visitTarget(node.left, headScope, ctx, "assign");
        this.visit(node.right, headScope, ctx);
        this.visit(node.body, headScope, ctx);
        return;
      }
      case "SwitchStatement":
        this.visitSwitch(node, scope, ctx);
        return;

      // --- 模块结构 ---
      case "Program":
        this.visitStatements(node.body, scope, ctx);
        return;
      case "ImportDeclaration":
        for (const specifier of node.specifiers) scope.declare(specifier.local?.name);
        return;
      case "ExportNamedDeclaration": {
        if (node.declaration) this.visit(node.declaration, scope, ctx);
        // `export { a }` 的 a 指本模块的绑定；`export { a } from "x"` 有 source，指别的模块，不判。
        if (!node.source) {
          for (const specifier of node.specifiers) {
            if (specifier.local?.type === "Identifier") this.record(specifier.local, scope, ctx);
          }
        }
        return;
      }
      case "ExportDefaultDeclaration":
        this.visit(node.declaration, scope, ctx);
        return;
      case "ExportAllDeclaration":
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
      case "ExportSpecifier":
        return;

      // --- 表达式 ---
      case "MemberExpression":
      case "OptionalMemberExpression":
        this.visit(node.object, scope, ctx);
        if (node.computed) this.visit(node.property, scope, ctx);
        return;
      case "Property": {
        // 只可能是 ObjectExpression 里的属性：ObjectPattern 走 visitTarget。
        if (node.computed) this.visit(node.key, scope, ctx);
        // 简写 `{ a }` 里 key 与 value 指同一个名字，只记一次。
        this.visit(node.value, scope, ctx);
        return;
      }
      case "ObjectExpression":
        for (const property of node.properties) this.visit(property, scope, ctx);
        return;
      case "ArrayExpression":
        for (const element of node.elements) this.visit(element, scope, ctx);
        return;
      case "SpreadElement":
        this.visit(node.argument, scope, ctx);
        return;
      case "UnaryExpression":
        // `typeof 裸名字` 不报：对未声明名字不抛错，是特征探测的常规写法。
        if (node.operator === "typeof" && node.argument?.type === "Identifier") return;
        this.visit(node.argument, scope, ctx);
        return;
      case "UpdateExpression":
        // 严格模式下 `++未声明名` 会抛 ReferenceError，照报。
        this.visitTarget(node.argument, scope, ctx, "assign");
        return;
      case "AssignmentExpression":
        this.visitTarget(node.left, scope, ctx, "assign");
        this.visit(node.right, scope, ctx);
        return;
      case "BinaryExpression":
      case "LogicalExpression":
        this.visit(node.left, scope, ctx);
        this.visit(node.right, scope, ctx);
        return;
      case "ConditionalExpression":
        this.visit(node.test, scope, ctx);
        this.visit(node.consequent, scope, ctx);
        this.visit(node.alternate, scope, ctx);
        return;
      case "SequenceExpression":
        for (const expression of node.expressions) this.visit(expression, scope, ctx);
        return;
      case "CallExpression":
      case "OptionalCallExpression":
      case "NewExpression":
        this.visit(node.callee, scope, ctx);
        for (const argument of node.arguments) this.visit(argument, scope, ctx);
        return;
      case "ImportExpression":
        this.visit(node.source, scope, ctx);
        return;
      case "ChainExpression":
        this.visit(node.expression, scope, ctx);
        return;
      case "AwaitExpression":
      case "YieldExpression":
        this.visit(node.argument, scope, ctx);
        return;
      case "TemplateLiteral":
        for (const expression of node.expressions) this.visit(expression, scope, ctx);
        return;
      case "TaggedTemplateExpression":
        this.visit(node.tag, scope, ctx);
        this.visit(node.quasi, scope, ctx);
        return;
      case "AssignmentPattern":
      case "ObjectPattern":
      case "ArrayPattern":
      case "RestElement":
        // 只有出现在赋值目标位置才合法，走的是 visitTarget；这里兜底成赋值语义。
        this.visitTarget(node, scope, ctx, "assign");
        return;

      // --- 普通语句 ---
      case "ExpressionStatement":
        this.visit(node.expression, scope, ctx);
        return;
      case "ReturnStatement":
      case "ThrowStatement":
        this.visit(node.argument, scope, ctx);
        return;
      case "IfStatement":
        this.visit(node.test, scope, ctx);
        this.visit(node.consequent, scope, ctx);
        this.visit(node.alternate, scope, ctx);
        return;
      case "WhileStatement":
      case "DoWhileStatement":
        this.visit(node.test, scope, ctx);
        this.visit(node.body, scope, ctx);
        return;
      case "TryStatement":
        this.visit(node.block, scope, ctx);
        if (node.handler) this.visit(node.handler, scope, ctx);
        if (node.finalizer) this.visit(node.finalizer, scope, ctx);
        return;
      case "LabeledStatement":
        // 标签名不是取用。
        this.visit(node.body, scope, ctx);
        return;
      case "BreakStatement":
      case "ContinueStatement":
      case "EmptyStatement":
      case "DebuggerStatement":
        return;
      case "WithStatement":
        // 作用域在那一段由运行期决定，静态判不出真假 —— 一律不报。
        this.visit(node.object, scope, ctx);
        this.visit(node.body, scope, { ...ctx, inWith: true });
        return;

      default:
        this.unhandledTypes.add(node.type);
        this.visitUnknown(node, scope, ctx);
    }
  }

  /** 未显式覆盖的节点类型：递归所有子节点，Identifier 按取用算（宁可多报也不静默漏掉整棵子树）。 */
  visitUnknown(node, scope, ctx) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" || key === "loc" || key === "start" || key === "end") continue;
      if (Array.isArray(value)) {
        for (const item of value) if (item?.type) this.visit(item, scope, ctx);
        continue;
      }
      if (value?.type) this.visit(value, scope, ctx);
    }
  }
}

/**
 * 解析一段模块源码，返回其中**解析不出绑定**的标识符取用。
 *
 * 返回 `{ references, unhandledTypes }`：
 *   - `references`：`[{ name, line, column }]`，按出现位置排序（同名会各出现一次）。
 *   - `unhandledTypes`：本分析器没显式覆盖、走了兜底递归的节点类型。空集合才是预期状态；
 *     非空说明 acorn 版本带来了新语法，应把它补进 dispatch 再决定怎么算。
 *
 * 解析失败时抛错，由调用方决定放过还是上报 —— 本模块不替调用方吞掉语法错误。
 */
export function collectFreeIdentifiers(source, { filename = "<anonymous>" } = {}) {
  const analyzer = new Analyzer();
  const program = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    // 模块里不会出现这些，但显式声明让报错更具体（例如误把脚本当模块解析）。
    allowHashBang: true,
    allowAwaitOutsideFunction: false,
    allowReturnOutsideFunction: false,
    sourceFile: filename
  });

  const moduleScope = new Scope("module", null);
  analyzer.visit(program, moduleScope, { inWith: false });

  const free = [];
  for (const reference of analyzer.references) {
    if (!reference.scope.resolves(reference.name)) {
      free.push({ name: reference.name, line: reference.line, column: reference.column });
    }
  }
  free.sort((a, b) => a.line - b.line || a.column - b.column);

  return { references: free, unhandledTypes: analyzer.unhandledTypes };
}
