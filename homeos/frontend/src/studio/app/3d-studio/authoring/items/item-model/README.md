# item-model 分派族

`buildItemModel` 的 59 个物品类型分支按**原链顺序**拆到这里；入口只保留早返回、局部量计算、分派循环与后处理。

- 分派顺序 = `index.ts` 的 `ITEM_MODEL_FAMILIES` 数组顺序，**不可重排**。
- 每个族函数签名 `(scope: ItemModelScope) => boolean`；命中首个分支后返回 `true`，入口 `break` 后继续后处理。
- 分支正文从 `studio-item-model.ts` 逐字切出，只追加 `return true/false`；条件表达式与顺序保持原样。
- 新增物品类型时，先放到对应族；若跨族，追加到顺序正确的族，不要改已有族顺序。

回滚：删除本目录、恢复入口文件即可；不要改 `studio-app.ts` 的调用点。
