"""页面路由、静态资源挂载、商品图与模拟收银台。

参考站是「同一个 HTML 外壳 + ``data-store-page`` 分页切换」的多页应用，
这里沿用同一套结构：所有页面路由返回同一份 ``store.html``，
由前端根据 ``location.pathname`` 显示对应分页。
"""

from __future__ import annotations

import html
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy import func, select, update

from store import cashier, coupons, fulfill, site_settings as site_config
from store.deps import CurrentAccount, DbSession
from store.models import Account, Order, Product, ProductImage
from store.order_status import order_status_label
from store.payments.base import PaymentError
from store.request_security import render_template
from store.security import token_matches, utcnow
from store.serializers import order_payload

logger = logging.getLogger("store.pages")

router = APIRouter(tags=["pages"])


def _render_store_page(request: Request) -> HTMLResponse:
    templates: Path = request.app.state.settings.templates_dir
    template_path = templates / "store.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="商店页面模板缺失。",
        )
    # 变量名刻意不叫 ``html``：本模块顶部有一处 ``import html``（转义用），
    # 同名局部变量会把它在这个函数里遮掉 —— 现在没问题，但下一个人在这里
    # 加一句 ``html.escape(...)`` 就会撞上 AttributeError。
    template = template_path.read_text(encoding="utf-8")
    return HTMLResponse(render_template(template, request), headers={"Cache-Control": "no-store"})


def _home(request: Request, session: DbSession) -> Response:
    # 首次部署无管理员时，首页跳 /admin，再由 /admin 跳 /setup。
    admin_count = session.scalar(
        select(func.count()).select_from(Account).where(Account.is_admin == True)  # noqa: E712
    )
    if (admin_count or 0) == 0:
        return RedirectResponse(url="/admin", status_code=302)
    return _render_store_page(request)


router.add_api_route("/", _home, methods=["GET"], include_in_schema=False)
router.add_api_route("/products", _home, methods=["GET"], include_in_schema=False)
router.add_api_route("/item/{product_id}", _home, methods=["GET"], include_in_schema=False)
router.add_api_route(
    "/user/authentication/login", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route(
    "/user/authentication/register", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route(
    "/user/authentication/forget", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route(
    "/user/dashboard/index", _home, methods=["GET"], include_in_schema=False
)
router.add_api_route("/user/index/query", _home, methods=["GET"], include_in_schema=False)
router.add_api_route("/user/referrals", _home, methods=["GET"], include_in_schema=False)


@router.get("/admin", include_in_schema=False)
def admin_page(request: Request, session: DbSession) -> HTMLResponse:
    # 无管理员时跳初始化页：部署者直接访问 /admin 不会看到一个用不了的登录表单。
    admin_count = session.scalar(
        select(func.count()).select_from(Account).where(Account.is_admin == True)  # noqa: E712
    )
    if (admin_count or 0) == 0:
        return RedirectResponse(url="/setup", status_code=302)
    template_path: Path = request.app.state.settings.templates_dir / "admin.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="管理后台模板缺失。"
        )
    return HTMLResponse(
        render_template(template_path.read_text(encoding="utf-8"), request),
        headers={"Cache-Control": "no-store"},
    )


@router.get("/setup", include_in_schema=False)
def setup_page(request: Request) -> HTMLResponse:
    template_path: Path = request.app.state.settings.templates_dir / "setup.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="初始化页面模板缺失。"
        )
    return HTMLResponse(
        render_template(template_path.read_text(encoding="utf-8"), request),
        headers={"Cache-Control": "no-store"},
    )


# --------------------------------------------------------------------------- #
# 商品图
# --------------------------------------------------------------------------- #
@router.get("/store/v1/product-images/{product_id}", include_in_schema=False)
def product_image(product_id: str, request: Request, session: DbSession) -> FileResponse:
    image = session.scalars(
        select(ProductImage).where(ProductImage.product_id == product_id)
    ).first()
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品图不存在。")
    folder: Path = request.app.state.settings.product_images_dir
    root = folder.resolve()
    target = (root / image.path).resolve()
    # 目录边界必须按**路径段**判断，不能用字符串前缀：``/data/images`` 与
    # ``/data/images-backup`` 前缀相同，字符串比较会把后者一并放行，于是库里一条
    # 脏 ``path``（历史数据、被改过的行）就能读到商品图目录之外的任意文件。
    # 另外必须要求是**文件**：目录也能通过 exists()，交给 FileResponse 会炸。
    if target == root or root not in target.parents or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品图不存在。")
    return FileResponse(target, headers={"Cache-Control": "public, max-age=86400"})


# --------------------------------------------------------------------------- #
# 模拟收银台
# --------------------------------------------------------------------------- #
#: 嵌进 ``<script>`` 的 JSON 里必须转义成 ``\uXXXX`` 的字符。
#:
#: ``json.dumps`` **只保证 JSON 合法，不保证 HTML 安全**：``<`` 是普通字符，
#: 于是 ``</script>`` 会原样出现在 HTML 里并**提前结束脚本块**，后面的内容被当成
#: 标记解析 —— 这就是最经典的「JSON 进 script」注入。``>`/``&`` 同理（``<!--``、
#: 实体解码），U+2028/2029 则是历史上 JS 字符串字面量的换行符。
#:
#: 转义成 ``\u003c`` 之后，JSON 解析仍会还原出同一个字符串，而 HTML 解析器
#: 永远看不到字面的 ``</script``。
_JSON_SCRIPT_ESCAPES = {
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
}


def _json_for_script(payload: dict) -> str:
    r"""把字典序列化成可以安全放进 ``<script>`` 的 JSON 字面量。

    不用 ``html.escape``：那会产出 ``&lt;`` 这类 HTML 实体，而 ``<script>`` 里的
    内容是**原始文本**（不解实体），结果是页面上真的显示出 ``&lt;``。
    ``\uXXXX`` 才是这个上下文里唯一正确的转义。
    """
    text = json.dumps(payload, ensure_ascii=False)
    for raw, escaped in _JSON_SCRIPT_ESCAPES.items():
        text = text.replace(raw, escaped)
    return text


def _cashier_html(order: Order, product: Product | None, *, request: Request) -> str:
    payload = order_payload(order)
    amount = payload["amountCents"] / 100
    safe = _json_for_script(payload)
    # 内联脚本必须带本次响应的 nonce，否则会被自身的 CSP（``script-src`` 无
    # ``'unsafe-inline'``）挡下 —— 见 ``store/request_security.csp_header``。
    nonce = html.escape(str(getattr(request.state, "csp_nonce", "") or ""), quote=True)
    # 文本上下文单独转义：``<title>`` 与 ``<dd>`` 里出现 ``<`` 会被当成标签，
    # 而这里的数据有用户可控的部分（邮箱），不转义就是存储型 XSS。
    order_no = html.escape(str(payload["orderNo"]))
    product_name = html.escape(str(payload["productName"]))
    email = html.escape(str(payload["email"]))
    status_text = html.escape(str(payload["status"]))
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#151a1f">
<title>模拟收银台 · {order_no}</title>
<link rel="stylesheet" href="/store-static/theme.css?v=20260918174425">
<link rel="stylesheet" href="/store-static/store.css?v=20260918174425">
<link rel="icon" href="/store-static/favicon-rounded.png?v=20260918174425">
</head>
<body>
<div class="hb-cashier">
  <div class="hb-cashier__card">
    <div class="hb-cashier__head">
      <h1>模拟收银台</h1>
      <span class="hb-tag hb-tag--accent">仅本地联调</span>
    </div>
    <div>
      <div class="hb-cashier__amount">¥{amount:.2f}</div>
      <div class="hb-cashier__product">{product_name}</div>
    </div>
    <dl class="hb-cashier__meta">
      <div><dt>订单号</dt><dd>{order_no}</dd></div>
      <div><dt>下单邮箱</dt><dd>{email}</dd></div>
      <div><dt>状态</dt><dd>{status_text}</dd></div>
    </dl>
    <p id="cashier-message" class="hb-cashier__message">确认支付后将立即发码，请勿关闭本页。</p>
    <div class="hb-cashier__actions">
      <button id="cashier-confirm" class="hb-button hb-button--primary hb-button--lg">确认支付</button>
      <button id="cashier-cancel" class="hb-button hb-button--secondary hb-button--lg">取消订单</button>
    </div>
    <a class="hb-cashier__back" href="/user/dashboard/index">返回账号中心</a>
  </div>
</div>
<script nonce="{nonce}">
const ORDER = {safe};
const message = document.getElementById('cashier-message');
// S53：把地址栏里的 ?t= 票据抹掉。放在最前面：后面 act() 会发请求，这一句执行过后，
// 那些请求的 Referer 与「浏览器历史里的这条记录」都不再带凭据。
// 用 replaceState（而不是 pushState）才能改写当前这条历史记录，而不是再压一条。
if (location.search) {{
  history.replaceState(null, '', location.pathname + location.hash);
}}
const confirmButton = document.getElementById('cashier-confirm');
const cancelButton = document.getElementById('cashier-cancel');
async function act(action) {{
  confirmButton.disabled = true; cancelButton.disabled = true;
  try {{
    const response = await fetch(`/store/v1/orders/${{ORDER.orderNo}}/mock/${{action}}`, {{
      method: 'POST', headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ orderToken: ORDER.lookupToken }}),
    }});
    const body = await response.json().catch(() => ({{}}));
    if (!response.ok) throw new Error(body.detail || '操作失败。');
    message.className = 'hb-cashier__message is-success';
    message.textContent = action === 'pay' ? '支付成功，正在前往账号中心…' : '订单已取消。';
    setTimeout(() => {{ location.href = '/user/dashboard/index'; }}, 700);
  }} catch (error) {{
    message.className = 'hb-cashier__message is-error';
    message.textContent = error.message;
    confirmButton.disabled = false; cancelButton.disabled = false;
  }}
}}
confirmButton.addEventListener('click', () => act('pay'));
cancelButton.addEventListener('click', () => act('cancel'));
</script>
</body>
</html>
"""


@router.get("/store/mock/pay/{order_no}", include_in_schema=False)
def mock_cashier(
    order_no: str,
    request: Request,
    session: DbSession,
    account: CurrentAccount,
    t: str | None = None,
) -> HTMLResponse:
    """模拟收银台页面。

    **必须能证明对这笔订单的访问权**：短时票据（``?t=``）或者该订单所属账号已登录。
    这个页面会把 ``lookupToken`` 写进 HTML 供按钮调用 ``mock/pay``，而订单号本身
    **从来不是一道授权** —— 它会出现在邮件、客服工单、截图与 Referer 里。过去页面
    无鉴权，任何人拿到一个订单号（从别处漏出来的）都能得到那张「免付款发码」的凭证。

    **S53：URL 里不再放 ``lookup_token``**。那是长期有效、还能查订单详情的
    bearer 凭据，跟随 URL 会进访问日志、``Referer`` 与浏览器历史 —— 漏出一次就
    不只是丢掉这张页面。现在跟 URL 走的是一张短时票据（30 分钟、与订单绑定、
    只能打开这笔订单的收银台，见 ``store/cashier.py``）；页面加载后立刻用
    ``history.replaceState`` 把查询串从地址栏与历史记录里抹掉，所以后续跳转的
    ``Referer`` 不带它，历史里也不会留下一条「带凭据的地址」。

    登录态兜底是给账号中心「继续支付」这类同浏览器路径用的：它不需要票据，
    地址栏里自然什么都没有。旧订单里存的 ``?token=`` 链接从此不再被接受 ——
    这正是这条修复的目的（那种 URL 就是长期凭据的第二份副本）。
    """
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")

    signed_in = account is not None and order.account_id == account.id
    if not signed_in and cashier.find_ticket(session, order, t) is None:
        # 与「订单不存在」同一个状态码：不给出「这个单号存在」的旁路信息
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")

    product = session.get(Product, order.product_id) if order.product_id else None
    return HTMLResponse(
        _cashier_html(order, product, request=request),
        headers={"Cache-Control": "no-store"},
    )


def _order_or_404(session, order_no: str) -> Order:
    order = session.scalars(select(Order).where(Order.order_no == order_no)).first()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")
    return order


def _authorize_mock(order: Order, order_token: str | None) -> None:
    """校验订单凭证。用常量时间比较：这是可以换取「免费发码」的 bearer 凭证，
    普通 ``!=`` 会在第一个不同的字符上短路，泄漏出可被逐字节爆破的时间差。"""
    if not token_matches(order_token, order.lookup_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="订单凭证不正确。")


@router.post("/store/v1/orders/{order_no}/mock/pay", include_in_schema=False)
def mock_pay(order_no: str, request: Request, session: DbSession, payload: dict | None = None) -> dict:
    _ensure_mock_provider(request, session)
    order = _order_or_404(session, order_no)
    token = (payload or {}).get("orderToken") or request.headers.get("x-order-token")
    _authorize_mock(order, token)
    _ensure_mock_order(order)
    setting = site_config.get_setting(session)

    if order.status == "fulfilled":
        return order_payload(order)
    # 状态白名单：只有待付款的订单可以被模拟收银台入账。
    #   · expired / cancelled：库存预留与优惠码名额都已归还，再入账并履约等于
    #     扣掉其它待支付订单的预留 —— 直接放开超卖。
    #   · payment_failed：同上，且它表示渠道已经明确拒单。
    #   · refunded：已经退过款的订单不能复活。
    # 这里刻意**不**沿用 settlement 的「钱确实到账就照常发码」策略：那是真实
    # 支付宝通知的补救路径，而模拟收银台只会在用户眼前点两下，没有「钱已付出去
    # 收不回来」的约束，放行只会制造超卖。
    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"订单状态为{order_status_label(order.status)}，不能在此入账，请重新下单。",
        )

    # 条件 UPDATE 抢单：模拟收银台按钮可以双击、也可能与轮询并存，两个请求
    # 各自读到 pending 就会重复发码。谁抢到这一行谁入账，另一个拿到 rowcount=0。
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status == "pending")
        .values(
            status="paid",
            paid_at=order.paid_at or utcnow(),
            payment_trade_no=order.payment_trade_no or f"MOCK{order.order_no[-10:]}",
        )
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        session.refresh(order)
        logger.info("模拟支付重复提交，已忽略 order=%s status=%s", order.order_no, order.status)
        return order_payload(order)
    session.refresh(order)

    # 手动发卡商品只标记已支付，等待管理员发码
    if order.fulfillment_mode != "manual":
        fulfill.fulfill_order(session, order=order, setting=setting)
    session.refresh(order)
    logger.info("模拟支付成功 order=%s status=%s", order.order_no, order.status)
    return order_payload(order)


@router.post("/store/v1/orders/{order_no}/mock/cancel", include_in_schema=False)
def mock_cancel(order_no: str, request: Request, session: DbSession, payload: dict | None = None) -> dict:
    _ensure_mock_provider(request, session)
    order = _order_or_404(session, order_no)
    token = (payload or {}).get("orderToken") or request.headers.get("x-order-token")
    _authorize_mock(order, token)
    _ensure_mock_order(order)
    if order.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。")
    product = session.get(Product, order.product_id) if order.product_id else None
    # 条件 UPDATE 抢单：与「模拟支付」按钮可以同时点，两个请求各自读到 pending
    # 就会一个取消、一个入账，库存则被释放两次。谁抢到这一行谁负责释放副作用。
    claimed = session.execute(
        update(Order)
        .where(Order.id == order.id)
        .where(Order.status == "pending")
        .values(status="cancelled", cancelled_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
    fulfill.release_order_reservation(session, order=order, product=product)
    # 收银台取消同样要归还优惠码名额，否则 redeemed_count 只增不减，
    # 名额被永久占用（该列参与 max_redemptions 校验）。
    coupons.release_coupon(session, order)
    session.flush()
    session.refresh(order)
    return order_payload(order)


def _ensure_mock_provider(request: Request, session) -> None:
    try:
        provider = request.app.state.resolve_payment_provider(site_config.get_setting(session))
    except PaymentError:
        # 渠道名非法时模拟收银台一律不可用（fail-closed）。
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="当前支付渠道配置无效，模拟收银台不可用。",
        ) from None
    if getattr(provider, "name", "") != "mock":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="当前支付渠道不是模拟支付，该端点不可用。",
        )


def _ensure_mock_order(order: Order) -> None:
    """订单自身必须也是模拟渠道。

    只校验「当前渠道是 mock」并不够 —— 下单时渠道是**冻结在订单行上**的
    （``Order.payment_provider``），而当前渠道是站点配置，两者可以不一致：

    · 一笔支付宝订单还挂着（pending），运维因为任何原因把站点渠道切回 mock
      （联调、排障、误操作），持有自己 ``lookupToken`` 的下单方就能把这笔**真实
      渠道**的订单标记为已支付并触发发码，而钱一分没到；
    · 取消同理：真渠道的单被模拟收银台取消并归还库存/优惠名额后，支付宝侧仍可能
      支付成功，账实不符。

    所以模拟收银台的入口必须同时满足「当前渠道是 mock」与「订单渠道是 mock」。
    """
    if (order.payment_provider or "") != "mock":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单不是模拟支付订单，不能在模拟收银台操作。",
        )
