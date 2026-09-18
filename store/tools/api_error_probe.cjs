/*
 * 接口错误归一化的行为探针（P10，4.3 D 类）。
 *
 * 背景：`store/static/setup.js` 原先这样显示失败 ——
 *
 *     var detail = (result.body && result.body.detail) || '初始化失败，请重试。';
 *     showError(detail);          // → errorBox.textContent = detail
 *
 * FastAPI 的参数校验失败（422）里 `detail` 是**数组**，`textContent = 数组` 渲染出来
 * 就是 `[object Object]`。初始化页最常见的那几类失败（邮箱格式、密码长度、引导密钥
 * 不对）恰好全走这条路径，而同一个错误在后台是可读的 —— 这类「少认一种形态」的缺陷
 * 静态门看不出来（写法完全合规），只有真跑一遍页面脚本才看得见。
 *
 * 所以这里做两件事：
 *   1. 按契约矩阵测 `store/static/api-error.js`（唯一那份实现），并钉一条红线 ——
 *      **任何形态的 detail 都不许产出 `[object Object]`**；
 *   2. 用最小 DOM 垫片把 `setup.js` 整份跑起来（含提交时刻的取值与 promise 链），
 *      分别喂 422 / 字符串 / 空 detail，断言屏上那一行字；顺带断言 201 跳转与
 *      409 已初始化这两条既有分支没被接线改动碰坏。
 *
 * 用法：node store/tools/api_error_probe.cjs <仓库根> [真实载荷.json]
 *   · 第二个参数可选：由 ``store/tools/smoke.py`` 从**真请求**里取来的 422 响应体。
 *     手写载荷不会随生产者漂移，所以那一条断言的意义在于「前端认的形态与服务端
 *     真正发出来的一致」—— 载荷与生产者脱钩之后，断言测的就不是它该测的东西。
 * 退出码：0 通过；1 有断言失败；2 页面脚本加载就抛异常。
 * node 不在时由 smoke.py 侧跳过，与 check_static_assets / render_probe.cjs 同一口径。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.argv[2] || path.resolve(__dirname, '..', '..');
const apiErrorPath = path.resolve(root, 'store', 'static', 'api-error.js');

const problems = [];
const expect = (label, actual, wanted) => {
  if (actual !== wanted) {
    problems.push(`${label} — 期望 ${JSON.stringify(wanted)}，实际 ${JSON.stringify(actual)}`);
  }
};
// 布尔断言带诊断：`expect` 是「相等」口径，条件式断言用它会把诊断信息挤到「期望」里。
const expectTrue = (label, condition, detail = '') => {
  if (!condition) problems.push(`${label} — ${String(detail).slice(0, 220)}`);
};

// —— 1. 唯一实现（api-error.js）的契约矩阵 ——
const ApiError = require(apiErrorPath);

expect('字符串 detail 原样透出（后端写好的中文提示）', ApiError.describe('邮箱已被占用。'), '邮箱已被占用。');
expect(
  'FastAPI 422 数组 → 「参数 x：原因」',
  ApiError.describe([{ loc: ['body', 'days'], msg: 'Input should be a valid integer' }]),
  '参数 days：Input should be a valid integer',
);
expect(
  '多个 422 条目用「；」连成一行',
  ApiError.describe([
    { loc: ['body', 'email'], msg: 'value is not a valid email address' },
    { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
  ]),
  '参数 email：value is not a valid email address；参数 password：String should have at least 8 characters',
);
expect(
  'loc 里的 body / query 前缀去掉，层级用 . 拼',
  ApiError.describe([{ loc: ['body', 'items', '0', 'days'], msg: '必须是整数' }]),
  '参数 items.0.days：必须是整数',
);
expect('数组里的字符串条目原样', ApiError.describe(['余额不足。']), '余额不足。');
expect(
  '条目里说不出原因时给「取值不合法」而不是把对象吐出去',
  ApiError.describe([{ loc: ['body', 'days'] }]),
  '参数 days：取值不合法',
);
expect('{msg} 对象取它的文案', ApiError.describe({ msg: '余额不足。' }), '余额不足。');
expect('{message} 对象取它的文案', ApiError.describe({ message: '余额不足。' }), '余额不足。');
expect('空 detail 走调用方给的兜底文案', ApiError.describe(null, '初始化失败，请重试。'), '初始化失败，请重试。');
expect('空字符串 detail 也走兜底', ApiError.describe('', '初始化失败，请重试。'), '初始化失败，请重试。');
expect('认不出来的对象走兜底', ApiError.describe({ weird: 1 }, '兜底文案。'), '兜底文案。');
expect('空数组（说不出任何原因）走兜底', ApiError.describe([], '兜底文案。'), '兜底文案。');

// 红线：这段知识存在的唯一理由是「别把对象直接丢给用户」，所以穷举形态里
// 一个 `[object Object]` 都不能出现（含 String() 隐式转换出来的那种）。
const shapes = [
  null, undefined, '', 'x', 0, 1, true, false, [], [{}], [null], [[]], [{ loc: null }],
  [{ loc: ['body'], msg: null }], {}, { msg: '' }, { detail: { a: 1 } }, { loc: ['body'] },
];
const leaks = shapes
  .map(shape => ApiError.describe(shape))
  .filter(text => /\[object |undefined|NaN|null/.test(String(text)));
expect('任何形态的 detail 都不会渲染成 [object Object] / undefined / NaN', leaks.join(' | '), '');

const response = { status: 422 };
const error = ApiError.fromResponse(response, { detail: [{ loc: ['body', 'days'], msg: '必须是整数' }] });
expect('fromResponse 带出状态码（调用方据此分辨 401 与真故障）', error.status, 422);
expect(
  'fromResponse 的消息同样归一化',
  error.message,
  '参数 days：必须是整数',
);
expect('fromResponse 保留原始 payload（限流/明细要看它）', error.payload.detail.length, 1);

// 真实载荷（可选，smoke.py 从真请求里取来）：证明前端认的形态与服务端发出来的一致。
const realPayloadPath = process.argv[3];
let realChecked = 0;
if (realPayloadPath) {
  const real = JSON.parse(fs.readFileSync(realPayloadPath, 'utf8'));
  const detail = real && real.detail;
  expectTrue(
    '真实 422 的 detail 是数组，且每条都带 loc 与 msg',
    Array.isArray(detail) && detail.length > 0
      && detail.every(entry => entry && typeof entry.msg === 'string' && Array.isArray(entry.loc)),
    JSON.stringify(detail).slice(0, 160),
  );
  const text = ApiError.describe(detail);
  const missing = (Array.isArray(detail) ? detail : [])
    .flatMap(entry => [
      entry && entry.msg,
      Array.isArray(entry && entry.loc)
        ? entry.loc.filter(part => part !== 'body' && part !== 'query').join('.')
        : '',
    ])
    .filter(token => token && !text.includes(token));
  expectTrue(
    '真实 422 载荷被压成含字段名与原因的文案',
    missing.length === 0 && !/\[object |undefined|NaN/.test(text),
    `${text}｜缺：${missing.join(' / ')}`,
  );
  realChecked = Array.isArray(detail) ? detail.length : 0;
}

// —— 2. setup.js 整份跑起来，断言屏上那一行字 ——
const source = fs.readFileSync(path.resolve(root, 'store', 'static', 'setup.js'), 'utf8');
// 按 setup.html 的加载顺序：api-error.js 在前、setup.js 在后（少了前者的形态是
// 未捕获的 ReferenceError —— 页面什么都不会显示，所以模板里的顺序由 smoke.py
// 的静态断言单独钉住，这里只保证「接上之后行为对」）。
const apiErrorSource = fs.readFileSync(apiErrorPath, 'utf8');

function node(id) {
  const record = {
    id,
    value: '',
    hidden: false,
    disabled: false,
    type: 'text',
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(name, handler) {
      (record.listeners[name] = record.listeners[name] || []).push(handler);
    },
    setAttribute() {},
    removeAttribute() {},
    focus() {},
  };
  record.parentElement = { querySelector: () => node(`${id}-child`) };
  Object.defineProperty(record, 'textContent', {
    get: () => record.__text || '',
    set: (value) => {
      record.__text = String(value);
      writes[id] = record.__text;
    },
  });
  return record;
}

const writes = {};
const nodes = {};
const getNode = (id) => (nodes[id] = nodes[id] || node(id));

const flush = async () => {
  for (let index = 0; index < 12; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

// 跑一整遍「打开页面 → 填表 → 提交」，返回同一批节点上的观测量。
async function runSetup(postResponse) {
  for (const key of Object.keys(writes)) delete writes[key];
  for (const key of Object.keys(nodes)) delete nodes[key];
  const sandbox = {
    console,
    setTimeout: () => 0, // 409 分支的跳转延时；探针不跑真实定时器
    clearTimeout: () => {},
    location: { hash: '', href: '' },
    document: {
      getElementById: getNode,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    fetch: async (url) => {
      if (String(url).includes('/setup/status')) {
        return { status: 200, json: async () => ({ initialized: false }) };
      }
      return { status: postResponse.status, json: async () => postResponse.body };
    },
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(apiErrorSource, sandbox, { filename: 'api-error.js' });
    vm.runInContext(source, sandbox, { filename: 'setup.js' });
  } catch (loadError) {
    console.error(`setup.js 加载就失败（整个初始化页会静默失效）：${loadError.name}: ${loadError.message}`);
    console.error((loadError.stack || '').split('\n').slice(0, 4).join('\n'));
    process.exit(2);
  }
  getNode('email').value = 'ops@example.com';
  getNode('password').value = 'a-long-enough-passphrase';
  getNode('confirm-password').value = 'a-long-enough-passphrase';
  getNode('setup-token').value = '';
  const handler = (getNode('setup-form').listeners.submit || [])[0];
  if (!handler) {
    console.error('setup.js 没有把 submit 处理器接上 #setup-form（接线断了）');
    process.exit(2);
  }
  handler({ preventDefault() {} });
  await flush();
  return { errorText: writes['setup-error'] || '', sandbox, nodes };
}

(async () => {
  const fieldLevel = await runSetup({
    status: 422,
    body: {
      detail: [
        { loc: ['body', 'email'], msg: 'value is not a valid email address' },
        { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
      ],
    },
  });
  expect(
    '初始化页遇到 422 显示的是字段级原因（原先显示 [object Object]）',
    fieldLevel.errorText,
    '参数 email：value is not a valid email address；参数 password：String should have at least 8 characters',
  );
  expect(
    '初始化页的错误行里没有 [object Object]',
    /\[object |undefined|NaN/.test(fieldLevel.errorText),
    false,
  );
  expect('初始化页把错误框显示出来了', fieldLevel.nodes['setup-error'].hidden, false);

  const stringDetail = await runSetup({ status: 403, body: { detail: '引导密钥不正确。' } });
  expect('字符串 detail 原样显示（后端的中文提示不该被吞）', stringDetail.errorText, '引导密钥不正确。');

  const noDetail = await runSetup({ status: 500, body: {} });
  expect('接口没给 detail 时用页面自己的兜底文案', noDetail.errorText, '初始化失败，请重试。');

  const created = await runSetup({ status: 201, body: { ok: true } });
  expect('201 仍然跳去 /admin（接线改动没碰坏成功分支）', created.sandbox.location.href, '/admin');

  const alreadyInitialized = await runSetup({ status: 409, body: { detail: '管理员已存在。' } });
  expect(
    '409 仍然走「已初始化」跳转而不是报错',
    alreadyInitialized.nodes['setup-redirect'].hidden,
    false,
  );

  if (problems.length) {
    console.error('接口错误归一化探针失败：');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      '（改动 api-error.js 的契约或 setup.js 的提交分支时，请同步更新 store/tools/api_error_probe.cjs）',
    );
    process.exit(1);
  }
  console.log(
    `接口错误归一化探针通过：422 显示为字段级原因、任何形态都不产出 [object Object]`
    + `（覆盖 ${shapes.length} 种 detail 形态 / 5 条页面分支`
    + `${realPayloadPath ? ` / 真实载荷 ${realChecked} 条明细` : ''}）`,
  );
})();
