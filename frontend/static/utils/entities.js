/**
 * 实体检索文本与实体域：两个「从实体身上取出一个字符串」的契约，各只有一份实现。
 *
 * 位置：`utils/` 下的纯工具，被编辑器（`home.js` / `related-entities.js`）与运行时渲染器
 *   （`renderer/device-profiles.js` / `renderer/presence-runtime.js`）共用。
 *
 * 为什么要有这个文件：两处知识原先各有 2~3 份副本，而副本之间**口径不同**：

 *   * **检索文本**：`renderer/device-profiles.js` 那份是变参 + 逐段 `trim` + 过滤空段 +
 *     小写；而 `renderer/presence-runtime.js` 与 `home.js` 里那两份是「固定四个字段拼起来、
 *     保留原大小写、只在整串两端 `trim`」。调用方的正则有的带 `i` 有的不带 —— 恰好与
 *     各自拿到的那份口径配套，所以谁都没坏。但「哪份能用」取决于调用方正则写没写 `i`，
 *     照着名字换一份去调用不会报错，只会静默漏匹配。
 *   * **实体域**：`home.js` 那份直接返回 `domain` 原值（带点号的 domain 就带点号返回、
 *     非字符串就原样返回），`related-entities.js` 那份则 `String(...)` 之后切第一个点号。
 *     两者的消费方都是「拿域去查标签表 / 拿去和 `"light"` 这类裸域名比较」，所以点号
 *     与非字符串这两种输入下两者的结果不一样 —— 又是「不报错、只是某一页上认错域」。
 *
 * 契约（探针 `entity-helpers` 按这张表逐格断言）：
 *
 *   | 助手 | 输入 | 输出 |
 *   | --- | --- | --- |
 *   | `entitySearchText`   | 任意层级的字符串 / 数组片段 | 小写、单空格分隔、无空段 |
 *   | `entitySearchTextOf` | 实体对象 + 额外的片段 | 同上（四个命名字段 + 额外片段） |
 *   | `entityDomainOf`     | 实体对象 | 裸域名字符串；取不到时 `""` |
 *   | `entityDomainFromId` | 实体 ID 字符串 | 同上（`entityDomainOf` 的回退路径，也是运行时那几处「按 ID 切域」的唯一实现） |
 *
 * **P12 补记（B 类末尾那一项收口）**：`entityDomain` 这个名字在 P10 被删掉之后，运行时里还剩
 * 六处 `const entityDomain = String(id).split(".")[0]` 的**具名**局部写法（`renderer/` 五处 +
 * 3D 运行时树一处）。收口时分两步：具名的五处改调 `entityDomainFromId`，`entityDomainOf` 的
 * 实体对象路径也改调它 —— 「按 ID 切域」于是只有一份实现；与此同时把 `/static/` 树里
 * **输入已经写成 `String(x || "")` 的十九处内联切分**（它与我这个助手的函数体逐字相同）也一并
 * 换成 `entityDomainFromId` / `entityDomainOf`：这一步语义一字未变（输入自带守卫，不存在
 * 「传 falsy 会怎样」的新分支），但**没守卫的那些刻意留着**，原因见下。
 *
 * 没收进这一批的两类，都写在明处（免得下次有人以为「已经全收敛了」）：
 *
 *   * **输入没有 `|| ""` 守卫的十一处内联切分**（`renderer/renderer.js` 七处、`home.js`、
 *     `action-rules.js`、`renderer/climate.js:560`、`editor-document-management.js:121`）。
 *     它们写的是 `x.split(...)` 或 `String(x)`：换成助手后，falsy 输入会从「抛 `TypeError`」
 *     或字符串 `"undefined"` / `"null"` 变成 `""` —— 方向上都更像对的，但那是**行为改动**，
 *     而这些渲染路径没有探针覆盖，所以另立一项、不夹带在形态统一里。
 *   * **3D 运行时树里那三处**（`modules/interaction3d/` 的 `light-state.js` / `runtime.js` /
 *     `television-state.js`）：由后端按 `/api/v1/modules/interaction3d/` 提供，与 `/static/`
 *     是两个加载边界，跨树 import 是架构决定（见审计文档 4.3 B 类末尾那两条）。所以那几处只
 *     改了局部变量名，形态仍与这里逐字相同 —— 谁要动它，先读那条账。
 *
 * 两处**有意的行为变化**（都是往「更归一」的方向，且消费方本来就只想要归一后的值）：
 *   检索文本现在一律小写、段间压成单空格 —— 调用方正则全部带 `i`（不带 `i` 的那些
 *   本来收的就是小写文本），压空格只可能把 `no  motion`（某字段为空导致的空段）变成
 *   `no motion`，也就是**只可能多命中、不会漏命中**；实体域一律 `String` 后切第一个点号，
 *   所以带点号的 domain 与非字符串 domain 现在会被归一，这正是查表与比较要的形态。
 */

/**
 * 把若干字段拼成一段用于关键词匹配的小写文本。
 *
 * 参数接受任意层级的数组（调用方常直接传实体字段数组），`flat()` 后统一成单空格分隔的字符串：
 * 下面所有角色判定都靠正则匹配这段文本，因此字段越全，识别越准。
 *
 * @param {...*} searchParts 参与匹配的字段片段，可以是字符串或数组。
 * @returns {string} 小写、单空格分隔的检索文本。
 */
export function entitySearchText(...searchParts) {
  return searchParts
    .flat()
    .map(part => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 取一个实体身上参与关键词匹配的四个标准字段（外加调用方补充的片段）。
 *
 * 四个字段是 `entityId` / `name` / `originalName` / `translationKey` —— 实体对象的形状
 * 由上游目录决定，把这四个名字收在这里，是为了让「哪些字段参与识别」只有一处定义：
 * 调用方各写一遍的话，加字段时必有一处漏改，而漏改的表现是「某个设备认不出来」。
 *
 * @param {object} [entity] 实体对象或元数据条目。
 * @param {...*} extraParts 调用方另外要纳入匹配的片段（如状态里的 device_class）。
 * @returns {string} 小写、单空格分隔的检索文本。
 */
export function entitySearchTextOf(entity = {}, ...extraParts) {
  return entitySearchText(
    entity?.entityId,
    entity?.name,
    entity?.originalName,
    entity?.translationKey,
    ...extraParts
  );
}

/**
 * 从实体 ID 字符串取域（`entityDomainOf` 的姊妹入口：那个拿实体对象，这个拿 ID）。
 *
 * 为什么要有它：「按第一个点号切域」这条知识原先在运行时里散着六处**具名**写法（`const
 * entityDomain = String(id).split(".")[0]`）与十九处同形的**内联**写法，而 `entityDomainOf`
 * 在 `domain` 缺失时走的也是同一条路 —— 同一份知识好几个入口、二十几处实现。收敛后
 * `entityDomainOf` 也调它，于是「ID 怎么切」只有一处定义（P12 收口审计文档 4.3 B 类末尾那一项；
 * 哪些刻意没收、为什么，见模块头那段清单）。
 *
 * 刻意**不** `trim()`、不 `toLowerCase()`：消费方（渲染器）要的是上游原样的域，
 * 而需要小写归一的那个消费方（灯光统计）自己在外面 `toLowerCase()` ——
 * 把归一塞进这里会让其余调用点跟着改变行为。
 *
 * @param {string} [entityId] 实体 ID，形如 `light.kitchen`。
 * @returns {string} 裸域名字符串；`null` / `undefined` / `""` 以及不含点号的输入都归一成
 *   可用的字符串（前者为 `""`，后者原样返回），不抛异常。
 */
export function entityDomainFromId(entityId) {
  return String(entityId || "").split(".", 1)[0];
}

/**
 * 取实体的域（`light` / `switch` / `sensor` …）。
 *
 * 优先用 `domain` 字段；缺失（或为空）时从 `entityId` 的第一个点号前缀推导。
 * 两条路径都做 `String(...)` 归一：消费方拿它去查 `ENTITY_DOMAIN_LABELS` 这类表、
 * 或与裸域名字符串比较，收到非字符串会静默查不到（查不到就是回落到「实体」这种兜底文案，
 * 页面不报错）。返回 `""` 表示既没有 domain 也没有可切的 entityId。
 *
 * @param {object} [entity] 实体对象或元数据条目。
 * @returns {string} 裸域名字符串，取不到时为 `""`。
 */
export function entityDomainOf(entity) {
  return entityDomainFromId(entity?.domain || entity?.entityId);
}
