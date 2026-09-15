# 源码中文注释规范

约束 `backend/` 与 `frontend/` 的注释写法。目标是让读代码的人不必先通读实现，就能从注释知道「这个文件负责什么、这个函数为什么这样写、这段分支在防什么」。

## 不可违反

| 项目 | 说明 |
| --- | --- |
| 只加注释 | 不重命名、不重排、不内联、不提取、不改字符串与模板；注释以外一个字符都不动 |
| 语言 | 一律中文。文件里已有的英文注释翻译成中文，不保留双语 |
| 第三方 | `frontend/static/vendor/` 跳过，不注释也不格式化 |
| 界面文案 | 中文界面文案保持原词，注释里引用时原样照抄 |
| 行宽 | JS / CSS `100`，HTML `120`，Python 不强制但注释不要写成长段落 |
| 缩进对齐 | 注释与它解释的代码同级缩进 |

## 分层深度

三层，缺一层就算没写完：

1. **文件头**：这个模块在整体里处于什么位置、对外提供什么、有什么全局约定或副作用。
2. **类 / 函数**：做什么、为什么存在、参数与返回值、副作用、异常。
3. **关键逻辑**：只注释「为什么」，不复述代码。重点覆盖下面这几类。

    分支里的边界值、魔法数与阈值。
    竞态、重试、超时、缓存失效。
    协议字段、签名、加密、编码 / 解码。
    权限与授权门禁的判断顺序。
    与前端 / 外部系统约定死的字段名或文案。
    有意为之的「看起来多余」的写法（防抖、兜底、兼容）。

## Python

模块 docstring 放在文件首行（`from __future__` 之前）；类与函数用三引号 docstring。

```python
"""仪表盘文档的校验入口。

对外只暴露 validate_panel_document：把外部传入的原始字典校验并归一成
一份干净的文档，字段别名与前端 JSON 对齐（camelCase 出、camelCase 进）。
"""

class Canvas(ExtensibleModel):
    """画布尺寸与缩放策略。

    extra="allow" 是刻意的：前端会先于后端上线新字段，
    这里放行未知键，避免旧后端把新前端保存的文档判为非法。
    """

    width: int = Field(default=2778, ge=320, le=7680)
    """设计标称宽度；2778 是 2 倍 DPI 下的 1389，对应常见 16:9 大屏。"""


def walk(items: list[PanelComponent]):
    """深度优先遍历组件树，产出每个组件（含所有层级的子组件）。

    参数:
        items: 待遍历的组件列表，可为空。

    返回:
        生成器，逐个产出 PanelComponent，顺序为父组件先于其子组件。
    """
```

不写 `# -*- coding: utf-8 -*-` 之类的无效头，也不给每个 `import` 加注释。

## JavaScript

文件头用块注释写模块职责；函数用 JSDoc，`@param` / `@returns` 描述用中文。

```javascript
/**
 * 3D 交互舞台与编辑器之间的桥接层。
 *
 * 职责：向舞台页请求授权凭据、按组件 ID 缓存编辑器视图、等待视图就绪。
 * 约定：视图就绪最多等 25 秒，超时抛中文错误文案，由调用方决定提示方式。
 */

/**
 * 等待指定组件的编辑器视图就绪。
 *
 * @param {string} pendingComponentId 组件 ID。
 * @returns {Promise<object>} 就绪的编辑器视图（含 ready 与 metadata）。
 * @throws {Error} 视图准备超时，或视图初始化时报错。
 */
export function waitInteraction3dEditorView(pendingComponentId) {
  // 多页面共用同一组件 ID，等待者用 Set 收集，避免后到的请求覆盖先到的回调。
  ...
}
```

行内注释统一用 `//` 置于被注释行上方；只有需要多行说明时才用 `/* ... */`。

## CSS

文件头一节，其余按区块分节；分节线两侧各留一个空格，区块名用中文。

```css
/* ===== 仪表盘运行时布局 ===== */

/* 组件层：绝对定位，父层已建立包含块，这里不再重复 position: relative。 */
.component-layer {
  position: absolute;
}
```

不要逐条属性写注释（`/* 宽度 */ width: 100px;` 属于噪音），只注释成组出现、或数值有来历的规则。

## HTML

页面顶部用注释说明页面用途、需要的授权能力、依赖的入口脚本；结构区块用 `<!-- 区块 -->` 分隔。

```html
<!--
  编辑器主页面（/）。
  需要登录且授权允许 editor；缺任一条由后端 303 跳到 /login 或 /license。
  入口脚本：/static/home.js（控件注册表依赖 /static/renderer/registry.js 的同一版本戳）。
-->
```

## 校验

每批注释改完必须过校验，再统一 bump 缓存戳。

```bash
# Python：等价于 CI 的编译检查
python3 -m compileall -q backend/app

# JavaScript：等价于 CI 的语法检查
node --check frontend/static/home.js

# 改了 JS / CSS / HTML 之后统一缓存戳
node tools/bump_static_cache_versions.mjs
```

`home.js` 与 `renderer.js` 必须使用同一条 `registry.js?v=`，否则会出现两份控件注册表。
