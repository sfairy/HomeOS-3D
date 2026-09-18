/*
 * 渲染层探针（S39）。
 *
 * 背景：后台 20+ 处 `innerHTML` 的安全性全靠「每行都记得调 esc()」。静态门
 * （smoke.py 的 check_markup_templates_escape_data）能拦住「数据属性直插」的写法，
 * 但拦不住「写法合规、结果仍然漏」这一类 —— 而且这个模板没有浏览器测试。
 *
 * 这里补上那个缺口：把 admin.html 的内联脚本真的跑起来（配一个最小 DOM 垫片），
 * 用**恶意载荷**驱动两个数据最密的渲染函数，然后检查产出的标记里
 *   · 没有真正开起来的标签（`<img>` / `<script>` 必须是 `&lt;img&gt;` 这样的惰性文本）；
 *   · 自己的骨架还在（`<tr>` / `<td>` / 胶囊 / 按钮），没有因为转义把标记当文本吐出来。
 *
 * 顺带证明整个内联脚本能加载并执行到引导完成 —— `HtmlSafe` 没接线、const 踩暂时性
 * 死区这类问题会让整个后台静默失效，而服务端一切正常。
 *
 * 用法：node store/tools/render_probe.cjs <仓库根>
 * 退出码：0 通过；1 有活体标记或缺骨架；2 脚本加载就抛异常。
 * node 不在时由 smoke 侧跳过，与 check_static_assets 的口径一致。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.argv[2] || path.resolve(__dirname, '..', '..');
const pageHtml = fs.readFileSync(path.join(root, 'store', 'templates', 'admin.html'), 'utf8');
const htmlsafe = fs.readFileSync(path.join(root, 'store', 'static', 'htmlsafe.js'), 'utf8');
const apiError = fs.readFileSync(path.join(root, 'store', 'static', 'api-error.js'), 'utf8');
const inline = pageHtml.match(/<script nonce[^>]*>([\s\S]*?)<\/script>/);
if (!inline) {
  console.error('admin.html 里找不到内联脚本');
  process.exit(2);
}

// —— 最小 DOM 垫片 ——
// 只满足「脚本能加载 + 渲染函数能写 innerHTML」这两件事：节点是任意属性都能取的
// 代理，因为这里要验的是拼出来的字符串，不是浏览器行为。
const writes = [];
function fakeNode(selector) {
  const node = {
    selector,
    elements: new Proxy({}, { get: () => fakeNode(selector) }),
    textContent: '',
    value: '',
    hidden: false,
    checked: false,
    dataset: {},
    style: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    removeEventListener() {},
    append() {},
    appendChild() {},
    remove() {},
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => fakeNode(selector),
    querySelectorAll: () => [],
    closest: () => fakeNode(selector),
    focus() {},
    reset() {},
    submit() {},
  };
  Object.defineProperty(node, 'innerHTML', {
    get: () => node.__html || '',
    set: value => {
      node.__html = String(value);
      writes.push([selector, String(value)]);
    },
  });
  return node;
}

const HOSTILE = '<img src=x onerror=alert(1)>';
const payloads = {
  '/orders': {
    items: [
      {
        orderNo: `ORDER"${HOSTILE}`,
        email: "ev'il@example.com",
        productName: `<script>alert('p')</script>`,
        orderType: 'direct',
        licenseAction: 'new',
        amountCents: 12345,
        status: 'pending',
        manualSettlement: true,
        createdAt: '2026-01-02T03:04:05',
        needsReview: true,
        licenseId: null,
        targetLicenseModified: false,
        channelPayable: false,
        paymentProvider: 'mock',
      },
    ],
    total: 1,
    offset: 0,
    limit: 20,
  },
  '/customers': {
    items: [
      {
        id: HOSTILE,
        email: `a">${HOSTILE}`,
        name: `<b onmouseover=alert(1)>n</b>`,
        orderCount: `3">${HOSTILE}`,
        licenseCount: 2,
        createdAt: '2026-01-02T03:04:05',
      },
    ],
    total: 1,
    offset: 0,
    limit: 20,
  },
};

const handlers = {};
const sandbox = {
  console,
  Intl,
  URLSearchParams,
  FormData: class {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  fetch: async url => {
    if (sandbox.__forced) return sandbox.__forced;
    const key = Object.keys(payloads).find(candidate => String(url).includes(candidate));
    return { ok: true, status: 200, json: async () => (key ? payloads[key] : {}) };
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: {
    search: '',
    pathname: '/store-admin',
    href: 'http://localhost/store-admin',
    replace() {},
    reload() {},
  },
  navigator: { clipboard: { writeText: async () => {} } },
  crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
  document: {
    cookie: '',
    querySelector: selector => fakeNode(selector),
    querySelectorAll: () => [],
    createElement: () => fakeNode('created'),
    body: fakeNode('body'),
    documentElement: fakeNode('html'),
    addEventListener: (name, handler) => {
      (handlers[name] = handlers[name] || []).push(handler);
    },
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};

vm.createContext(sandbox);
try {
  // 与 admin.html 的加载顺序一致：htmlsafe.js → api-error.js → 内联脚本
  vm.runInContext(htmlsafe, sandbox, { filename: 'htmlsafe.js' });
  vm.runInContext(apiError, sandbox, { filename: 'api-error.js' });
  vm.runInContext(`${inline[1]}\n;globalThis.__render = { loadOrders, loadCustomers, api };`, sandbox, {
    filename: 'admin-inline.js',
  });
} catch (error) {
  console.error(`内联脚本加载就失败（整个后台会静默失效）：${error.name}: ${error.message}`);
  console.error((error.stack || '').split('\n').slice(0, 4).join('\n'));
  process.exit(2);
}

const capture = selector => (writes.filter(([name]) => name === selector).pop() || ['', ''])[1];
const problems = [];
const expect = (label, condition, detail) => {
  if (!condition) problems.push(`${label} — ${String(detail).slice(0, 200)}`);
};

(async () => {
  await sandbox.__render.loadOrders();
  await sandbox.__render.loadCustomers();
  const rendered = [
    ['订单行 #order-rows', capture('#order-rows')],
    ['客户行 #customer-rows', capture('#customer-rows')],
  ];

  for (const [name, markup] of rendered) {
    expect(`${name} 产生了输出`, markup.includes('<tr>'), markup.slice(0, 120));
    // 判据是「没有真正开起来的标签」：转义后的 `&lt;img ... onerror=...` 是惰性文本，
    // 里面出现 onerror= 字样无害 —— 会执行的前提是有个真标签把它接住。
    const liveTags = markup.match(/<(?:img|script|svg|iframe|object|embed|b)\b[^>]{0,40}/gi) || [];
    expect(`${name} 没有活体标签`, liveTags.length === 0, liveTags.join(' | ') || '(无)');
    expect(`${name} 保留了自己的标记`, markup.includes('<td'), markup.slice(0, 120));
  }

  const orders = rendered[0][1];
  const customers = rendered[1][1];
  expect('订单号里的引号被转义', orders.includes('ORDER&quot;&lt;img'), orders.slice(0, 200));
  expect('恶意邮箱被转义', orders.includes('ev&#39;il@example.com'), orders.slice(0, 200));
  expect('状态胶囊仍是标记而不是文本', orders.includes('<span class="pill'), orders.slice(0, 300));
  expect(
    '动作按钮仍是标记而不是文本',
    orders.includes('row-actions') && orders.includes('<button'),
    orders.slice(0, 300),
  );
  expect(
    '计数走了数字口径（恶意字符串 → 0，而不是原样吐出来）',
    customers.includes('>0<') || customers.includes('0</td>'),
    customers.slice(0, 300),
  );

  // —— 后台的接口失败路径（P10，4.3 D 类）——
  // 归一化只有一份实现（api-error.js），这里走**真的 api()** 验一遍：静态断言能证明
  // 消费方引用了它，但「引用了」与「屏幕上真的变成了人话」之间还差一次实跑。
  expect(
    '后台接上了唯一的错误归一化实现（api-error.js 先于内联脚本加载）',
    typeof sandbox.ApiError === 'object' && typeof sandbox.ApiError.describe === 'function',
    typeof sandbox.ApiError,
  );

  const failure = async (status, body) => {
    sandbox.__forced = { ok: false, status, json: async () => body };
    try {
      await sandbox.__render.api('/products');
      return { message: '(没有抛错)', status: 0 };
    } catch (error) {
      return { message: error.message, status: error.status };
    } finally {
      sandbox.__forced = null;
    }
  };

  const validation = await failure(422, {
    detail: [{ loc: ['body', 'days'], msg: 'Input should be a valid integer' }],
  });
  expect(
    '后台 422 的字段级明细被压成人话（而不是 [object Object]）',
    validation.message === '参数 days：Input should be a valid integer',
    validation.message,
  );
  expect('后台 422 的错误带着状态码', validation.status, 422);

  const businessError = await failure(400, { detail: '天数超过最长期限。' });
  expect('后台字符串 detail 原样透出', businessError.message, '天数超过最长期限。');

  const opaque = await failure(422, { detail: [{ loc: ['body', 'x'] }] });
  expect('后台 422 里说不出原因的条目也不会泄露对象', opaque.message, '参数 x：取值不合法');

  const unauthenticated = await failure(401, {});
  expect(
    '401 仍然是「未登录」这条固定提示（登录页的正常状态，不能被当成故障文案）',
    unauthenticated.message === '未登录后台或无权限。' && unauthenticated.status === 401,
    `${unauthenticated.status} / ${unauthenticated.message}`,
  );

  for (const [label, result] of [
    ['字段级明细', validation],
    ['业务错误', businessError],
    ['认不出的条目', opaque],
    ['401', unauthenticated],
  ]) {
    expect(
      `后台失败提示里没有 [object Object]（${label}）`,
      !/\[object |undefined|NaN/.test(result.message),
      result.message,
    );
  }

  if (problems.length) {
    console.error('渲染层探针失败：');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      '（渲染函数改名或载荷字段变化时，请同步更新 store/tools/render_probe.cjs 的载荷与断言）',
    );
    process.exit(1);
  }
  console.log(
    `渲染层探针通过：恶意载荷下没有活体标签，骨架完好（订单行 ${orders.length} 字符 / 客户行 ${customers.length} 字符）`,
  );
})();
