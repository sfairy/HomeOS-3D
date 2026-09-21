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

from store.commerce import cashier, fulfill
from store.ops import site_settings as site_config
from store.core.deps import CurrentAccount, DbSession, order_or_404
from store.core.models import Account, Order, Product, ProductImage
from store.commerce.order_status import order_status_label
from store.payments.base import PaymentError
from store.api.page_shell import SCENE_PLACEHOLDER, inject_scene
from store.security.request_security import render_template
from store.security.security import token_matches, utcnow
from store.core.serializers import order_payload
from store.core.static_revision import file_revision

logger = logging.getLogger("store.pages")

router = APIRouter(tags=["pages"])


def _render_page(request: Request, template_text: str) -> HTMLResponse:
    """模板 → 响应：填 CSP nonce，再把场景片段填进 ``<!--{{SCENE}}-->``。

    两步都是纯字符串替换，顺序无关；放在一处是为了让「新加一个入口页」只需要把模板
    读出来交给它，而不是各自拼 ``HTMLResponse`` 时忘掉其中一步（忘掉 nonce = 内联脚本
    被 CSP 拒；忘掉场景 = 页面看起来正常但少了整块插画）。
    """
    text = render_template(template_text, request)
    return HTMLResponse(
        inject_scene(text, request), headers={"Cache-Control": "no-store"}
    )


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
    return _render_page(request, template)


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
    return _render_page(request, template_path.read_text(encoding="utf-8"))


@router.get("/setup", include_in_schema=False)
def setup_page(request: Request) -> HTMLResponse:
    template_path: Path = request.app.state.settings.templates_dir / "setup.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="初始化页面模板缺失。"
        )
    return _render_page(request, template_path.read_text(encoding="utf-8"))


# 商品图
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
    # 目录边界必须按**路径段**判断，不能用字符串前缀：``/data/images`` 与 ``/data/images-backup``
    # 前缀相同，字符串比较会放行后者，库里一条脏 ``path`` 就能读到商品图目录之外的任意文件。
    # 另外必须要求是**文件**：目录也能通过 exists()，交给 FileResponse 会炸。
    if target == root or root not in target.parents or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品图不存在。")
    return FileResponse(target, headers={"Cache-Control": "public, max-age=86400"})


# 模拟收银台
#: 嵌进 ``<script>`` 的 JSON 必须把 ``<`` 等转义成 ``\uXXXX``：``json.dumps`` 只保证 JSON 合法、
#: 不保证 HTML 安全，``</script>`` 会原样出现并**提前结束脚本块**（``>``/``&``、U+2028/2029 同理）。
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


def _cashier_html(order: Order, *, request: Request) -> str:
    """把订单渲染成模拟收银台页面。

    不再接收 ``Product``：页面上的商品名取自 ``order_payload`` 的 ``productName``（订单自己
    记着下单时的名字），调用方若为此多查一次商品表，查到的还是「现在」的名字。
    """
    payload = order_payload(order)
    amount = payload["amountCents"] / 100
    safe = _json_for_script(payload)
    # 内联脚本必须带本次响应的 nonce，否则会被自身的 CSP（``script-src`` 无
    # ``'unsafe-inline'``）挡下 —— 见 ``store/request_security.csp_header``。
    nonce = html.escape(str(getattr(request.state, "csp_nonce", "") or ""), quote=True)
    # 文本上下文单独转义：``<title>`` 与 ``.hos-meta-pill`` 里出现 ``<`` 会被当成标签，
    # 而这里的数据有用户可控的部分（邮箱），不转义就是存储型 XSS。
    order_no = html.escape(str(payload["orderNo"]))
    product_name = html.escape(str(payload["productName"]))
    email = html.escape(str(payload["email"]))
    status_text = html.escape(str(payload["status"]))
    # 样式与图标的版本号取自文件 mtime（见 core/static_revision.py）：页面由后端渲染，
    # 不必再让人记得把这里的 ?v= 字面量与模板里那份同步。五条链接指向同几个文件，
    # 各自取各自的 mtime，因此不存在「同值」要求。
    static_dir = request.app.state.settings.static_dir
    scene_stamp = file_revision(static_dir / "scene" / "page.css")
    fonts_stamp = file_revision(static_dir / "scene" / "fonts.css")
    scene_only_stamp = file_revision(static_dir / "scene" / "scene.css")
    panel_stamp = file_revision(static_dir / "scene" / "panel.css")
    favicon_stamp = file_revision(static_dir / "favicon-rounded.png")
    markup = f"""<!doctype html>
<html lang="zh-CN" class="hos-shell">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#050910">
<title>模拟收银台 · {order_no}</title>
<link rel="stylesheet" href="/store-static/scene/fonts.css?v={fonts_stamp}">
<link rel="stylesheet" href="/store-static/scene/page.css?v={scene_stamp}">
<link rel="stylesheet" href="/store-static/scene/scene.css?v={scene_only_stamp}">
<link rel="stylesheet" href="/store-static/scene/panel.css?v={panel_stamp}">
<link rel="icon" href="/store-static/favicon-rounded.png?v={favicon_stamp}">
<!-- 站点配色覆盖：后端把它换成指向 `/store-appearance.css` 的 <link>，版本号取
     配色文件的 mtime（见 store/ops/appearance.py）。
     必须排在所有样式表之后 —— 同为 :root 的令牌，后加载的赢。 -->
<!--{{APPEARANCE}}-->
</head>
<body>
<div class="hos-page">
{SCENE_PLACEHOLDER}
<main class="hos-dock">
<section class="hos-panel hos-rise">
  <span class="hos-panel__edge" aria-hidden="true"></span>
  <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
  <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
  <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
  <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>
  <div class="hos-eyebrow-row">
    <p class="hos-eyebrow">Mock Checkout</p>
    <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>仅本地联调</span>
  </div>
  <h1>模拟收银台</h1>
  <p class="hos-amount">¥{amount:.2f}</p>
  <p class="hos-panel__desc">{product_name}</p>
  <div class="hos-result-meta">
    <span class="hos-meta-pill"><strong>订单号</strong>{order_no}</span>
    <span class="hos-meta-pill"><strong>下单邮箱</strong>{email}</span>
    <span class="hos-meta-pill"><strong>状态</strong>{status_text}</span>
  </div>
  <p id="cashier-message" class="hos-msg">确认支付后将立即发码，请勿关闭本页。</p>
  <div class="hos-actions">
    <button id="cashier-confirm" class="hos-btn-primary" type="button">确认支付</button>
    <button id="cashier-cancel" class="hos-btn-ghost" type="button">取消订单</button>
  </div>
  <div class="hos-panel__copy">
    <p class="hos-panel__meta">
      <span>模拟支付渠道</span>
      <span class="hos-panel__meta-sep" aria-hidden="true"></span>
      <span>不会真实扣款</span>
    </p>
    <p><a href="/user/dashboard/index">返回账号中心</a></p>
  </div>
</section>
</main>
</div>
<script nonce="{nonce}">
const ORDER = {safe};
const message = document.getElementById('cashier-message');
// 把地址栏里的 ?t= 票据抹掉。放在最前面：后面 act() 会发请求，这一句执行过后，
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
    message.className = 'hos-msg is-ok';
    message.textContent = action === 'pay' ? '支付成功，正在前往账号中心…' : '订单已取消。';
    setTimeout(() => {{ location.href = '/user/dashboard/index'; }}, 700);
  }} catch (error) {{
    message.className = 'hos-msg is-err';
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
    # 场景片段仍走统一的注入函数：收银台是独立响应（不经 render_template），
    # 但场景内容与商店其它入口页必须逐字一致，所以不能在这里另抄一份标记。
    return inject_scene(markup, request)


@router.get("/store/mock/pay/{order_no}", include_in_schema=False)
def mock_cashier(
    order_no: str,
    request: Request,
    session: DbSession,
    account: CurrentAccount,
    t: str | None = None,
) -> HTMLResponse:
    """模拟收银台页面。
    **必须能证明对这笔订单的访问权**：短时票据（``?t=``）或该订单所属账号已登录。页面会把
    ``lookupToken`` 写进 HTML 供按钮调用 ``mock/pay``，而订单号本身**从来不是一道授权** —— 它会出现在
    邮件、客服工单、截图与 Referer 里。URL 里不放长期有效的 ``lookup_token``（能查订单详情的 bearer
    凭据），改放 30 分钟的短时票据；登录态兜底给账号中心「继续支付」这类同浏览器路径用。
    """
    order = order_or_404(session, order_no)

    signed_in = account is not None and order.account_id == account.id
    if not signed_in and cashier.find_ticket(session, order, t) is None:
        # 与「订单不存在」同一个状态码：不给出「这个单号存在」的旁路信息
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在。")

    return HTMLResponse(
        _cashier_html(order, request=request),
        headers={"Cache-Control": "no-store"},
    )


def _authorize_mock(order: Order, order_token: str | None) -> None:
    """校验订单凭证。用常量时间比较：这是可以换取「免费发码」的 bearer 凭证，
    普通 ``!=`` 会在第一个不同的字符上短路，泄漏出可被逐字节爆破的时间差。"""
    if not token_matches(order_token, order.lookup_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="订单凭证不正确。")


@router.post("/store/v1/orders/{order_no}/mock/pay", include_in_schema=False)
def mock_pay(order_no: str, request: Request, session: DbSession, payload: dict | None = None) -> dict:
    _ensure_mock_provider(request, session)
    order = order_or_404(session, order_no)
    token = (payload or {}).get("orderToken") or request.headers.get("x-order-token")
    _authorize_mock(order, token)
    _ensure_mock_order(order)
    setting = site_config.get_setting(session)

    if order.status == "fulfilled":
        return order_payload(order)
    # 状态白名单：只有待付款订单可被模拟收银台入账。expired / cancelled 的预留与名额已归还，
    # 再入账履约等于扣掉其它待支付订单的预留（放开超卖），payment_failed / refunded 同理不可复活。
    # 刻意**不**沿用 settlement 的「钱到账就发码」策略——那是真实支付宝通知的补救路径。
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
    order = order_or_404(session, order_no)
    token = (payload or {}).get("orderToken") or request.headers.get("x-order-token")
    _authorize_mock(order, token)
    _ensure_mock_order(order)
    if order.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="只有待支付订单可以取消。")
    product = session.get(Product, order.product_id) if order.product_id else None
    # 条件 UPDATE 抢单：与「模拟支付」按钮可以同时点，两个请求各自读到 pending
    # 就会一个取消、一个入账，库存则被释放两次。谁抢到这一行谁负责释放副作用
    # （库存预留 + 优惠码名额），都在 close_pending_order 里一并做掉。
    if not fulfill.close_pending_order(session, order=order, product=product):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="订单状态已变更，请刷新后重试。"
        )
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
    只校验「当前渠道是 mock」并不够：下单时渠道是**冻结在订单行上**的（``Order.payment_provider``），
    而当前渠道是站点配置，两者可以不一致 —— 一笔支付宝订单还挂着时运维把站点渠道切回 mock，持有自己
    ``lookupToken`` 的下单方就能把真实渠道的单标记为已支付并触发发码，而钱一分没到；取消同理。
    """
    if (order.payment_provider or "") != "mock":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单不是模拟支付订单，不能在模拟收银台操作。",
        )
