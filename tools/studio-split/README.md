# studio-split 拆分工具链

把 `homeos-3d/frontend/src/app/3d-studio/studio/studio-app.ts` 这类巨石文件，
按 **AST 依赖闭包** 安全拆成模块/工厂的脚本集合。全部基于 TypeScript 编译器 API，
用 `bun` 运行（脚本依赖 `import.meta.dir`）。

设计前提：**不做人工逐处改写**。所有搬迁与引用重写都由闭包计算驱动，
搬完立刻跑 `typecheck` + `build` 做门禁，避免"看起来对"的重构。

## 脚本一览

| 脚本 | 作用 |
| --- | --- |
| `report-blocks.mjs` | 列出文件内最大的顶层语句块（函数/变量），用来挑下一刀切哪。 |
| `cluster-surface.mjs <簇名>` | 显示某个簇的规模、源码范围、对外接口、模块级依赖闭包、闭包缺口。**动手前先跑它**。 |
| `closure-paths.mjs <名字>` | 追踪某个名字的模块级依赖"路径"，找出是谁把大块代码拽进了闭包。 |
| `hub-cluster-v2.mjs` | 按语句粒度分析宿主函数内的局部簇（闭包 / 入站 / 出站引用）。 |
| `extract-module-v3.mjs` | **模块级**外提：按种子名字把若干模块级单元搬到新模块（低层叶子优先）。 |
| `extract-cluster.mjs` | **宿主函数内的局部簇**工厂化外提（见下）。 |
| `check-imports.mjs` / `collapse-blanks.mjs` | 外提后的卫生检查与空行压缩。 |

## `extract-cluster.mjs`：宿主局部簇 → 工厂

把宿主函数（如 `createStageController`）里一个内聚的局部声明簇搬进新模块，
包成 `createXxxController(deps)`。这是拆"巨石工厂函数"的主力。

```bash
bun tools/studio-split/extract-cluster.mjs \
  --host createStageController \
  --out studio-stage-runtime.ts \
  --factory createStageRuntimeController \
  --instance stageRuntimeController \
  --desc "舞台运行时：相机/投影混合、轨道控制切面与楼层切换装配" \
  --exclude lightTransitionController,isCameraMotionRunning,isControlInteractionActive \
  --after lightTransitionController \
  --seeds applyBlendedProjection,installOrbitControlsOverrides,syncPreviewProjection
```

约定（这三条是它区别于"手工搬代码"的关键）：

- **簇内局部可变状态**：经 getter/setter 暴露（`get x()` / `set x(v)`），
  簇内代码零改写，宿主通过 `instance.x` 读写。
- **簇内引用的「簇外局部」**：转为入参依赖
  - 只读 → `deps.x: () => any`，簇内改写为 `deps.x()`
  - 读写 → `deps.x: { get, set }`，簇内改写为 `deps.x.get()` / `deps.x.set(v)`
  - 抽取器会自动检测赋值点决定用哪种。
- **簇内引用的模块级单元**：计算依赖闭包一起搬走（所以它会打印"模块级依赖闭包"行，
  这个数字**必须是 0 或很小**，否则说明这一刀切在了耦合最重的地方）。
- **解构语句原子化**：`const { a, b } = x` 整体移动，避免重复声明或漏绑定。
- **`--after <局部名>`**：把 `const inst = createXxx(...)` 的插入点钉在某个**保留语句之后**。
  当簇内存在"构造函数里同步回调、而该回调依赖稍后才初始化的局部"时，必须用它压住
  实例化时序，否则会出现 TDZ 运行时错误。

## 推荐工作流

1. `report-blocks.mjs` 找最大块；`cluster-surface.mjs <簇名>` 看闭包是否干净。
2. 闭包不干净就先 `closure-paths.mjs` 找源头，把更底层的叶子簇先摘出去（自底向上剥离）。
3. `extract-cluster.mjs --dry` 先看规模与接口数，再实跑。
4. `bun run --cwd homeos-3d typecheck && bun run --cwd homeos-3d build` 双绿。
5. 单刀一次提交，提交信息写清"搬了多少行、闭包多大、装到哪"。
