"""页面路由、静态资源挂载、商品图与模拟收银台。
"""

from __future__ import annotations

import html
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy import func, select, update

from apps.store.commerce import cashier, fulfill
from apps.store.ops import site_settings as site_config
from apps.store.core.deps import CurrentAccount, DbSession, order_or_404
from apps.store.core.models import Account, Order, Product, ProductImage
from apps.store.commerce.order_status import order_status_label
from apps.store.payments.base import PaymentError
from apps.store.api.page_shell import APPEARANCE_PLACEHOLDER, SCENE_PLACEHOLDER, inject_scene
from apps.store.api import page_shell
from apps.store.security.request_security import render_template
from apps.store.security.security import token_matches, utcnow
from apps.store.core.serializers import order_payload
from apps.store.core.static_revision import file_revision

logger = logging.getLogger("apps.store.pages")

router = APIRouter(tags=["pages"])


def _render_page(
    request: Request, template_text: str, session: DbSession, *, page: str
) -> HTMLResponse:
    """模板 → 响应：填 CSP nonce，再把场景片段与状态甲板填进各自的占位符。
    """
    setattr(request.state, page_shell.PAGE_STATE_ATTR, page)
    text = render_template(template_text, request)
    return HTMLResponse(
        page_shell.inject_scene(text, request, session = session),
        headers={"Cache-Control": "no-store"},
    )


def _render_store_page(request: Request, session: DbSession) -> HTMLResponse:
    templates: Path = request.app.state.settings.templates_dir
    template_path = templates / "store.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="商店页面模板缺失。",
        )
    template = template_path.read_text(encoding="utf-8")
    return _render_page(request, template, session, page = "store.html")


def _home(request: Request, session: DbSession) -> Response:
    # 首次部署无管理员时，首页跳 /admin，再由 /admin 跳 /setup。
    admin_count = session.scalar(
        select(func.count()).select_from(Account).where(Account.is_admin == True)  # noqa: E712
    )
    if (admin_count or 0) == 0:
        return RedirectResponse(url="/admin", status_code=302)
    return _render_store_page(request, session)


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
    return _render_page(
        request, template_path.read_text(encoding="utf-8"), session, page = "admin.html"
    )


@router.get("/setup", include_in_schema=False)
def setup_page(request: Request, session: DbSession) -> HTMLResponse:
    template_path: Path = request.app.state.settings.templates_dir / "setup.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="初始化页面模板缺失。"
        )
    return _render_page(
        request, template_path.read_text(encoding="utf-8"), session, page = "setup.html"
    )


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
    if target == root or root not in target.parents or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品图不存在。")
    return FileResponse(target, headers={"Cache-Control": "public, max-age=86400"})


# 模拟收银台
_JSON_SCRIPT_ESCAPES = {
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
}


def _json_for_script(payload: dict) -> str:
    r"""把字典序列化成可以安全放进 ``<script>`` 的 JSON 字面量。
    """
    text = json.dumps(payload, ensure_ascii=False)
    for raw, escaped in _JSON_SCRIPT_ESCAPES.items():
        text = text.replace(raw, escaped)
    return text


def _cashier_html(order: Order, *, request: Request) -> str:
    """把订单渲染成模拟收银台页面。
    """
    payload = order_payload(order)
    amount = payload["amountCents"] / 100
    safe = _json_for_script(payload)
    nonce = html.escape(str(getattr(request.state, "csp_nonce", "") or ""), quote=True)
    # 文本上下文单独转义：``<title>`` 与 ``.hos-meta-pill`` 里出现 ``<`` 会被当成标签，
    order_no = html.escape(str(payload["orderNo"]))
    product_name = html.escape(str(payload["productName"]))
    email = html.escape(str(payload["email"]))
    status_text = html.escape(str(payload["status"]))
    # 样式与图标的版本号取自文件 mtime（见 core/static_revision.py）：页面由后端渲染，
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
<meta name="theme-color" content="#050912">
<title>模拟收银台 · {order_no}</title>
<link rel="stylesheet" href="/store-static/scene/fonts.css?v={fonts_stamp}">
<link rel="stylesheet" href="/store-static/scene/page.css?v={scene_stamp}">
<link rel="stylesheet" href="/store-static/scene/scene.css?v={scene_only_stamp}">
<link rel="stylesheet" href="/store-static/scene/panel.css?v={panel_stamp}">
<link rel="icon" href="/store-static/favicon-rounded.png?v={favicon_stamp}">
<!-- 站点配色覆盖：后端把它换成指向 `/store-appearance.css` 的 <link>，版本号取
     配色文件的 mtime（见 apps/store/ops/appearance.py）。
     必须排在所有样式表之后 —— 同为 :root 的令牌，后加载的赢。
     下一行的插入点是把 page_shell 的常量插值进来、**不手打**：本模板是 f-string，
     手写的双层花括号会被折叠成单层，占位符再也匹配不上，而 inject_scene
     找不到插入点就抛 —— 页面直接 500。这个坑已经踩过一次了。
     另外别在这段注释里写出插入点的名字：f-string 会连注释一起插值，
     inject_scene 又是全量替换，注释里就会多出一条永不生效的 <link>。 -->
{APPEARANCE_PLACEHOLDER}
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
    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"订单状态为{order_status_label(order.status)}，不能在此入账，请重新下单。",
        )

    # 条件 UPDATE 抢单：模拟收银台按钮可以双击、也可能与轮询并存，两个请求
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
    """
    if (order.payment_provider or "") != "mock":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该订单不是模拟支付订单，不能在模拟收银台操作。",
        )
