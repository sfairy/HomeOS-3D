"""开通链路的五道门，以及「这一台机器走到哪了」的读数。
"""
from __future__ import annotations

STEP_LABELS = ('初始化', '登录', '激活', '配对', '进中控')

#: 与 ``design/scene/panel.css``「开通路径」段里的类一一对应。写成完整字面量而不是
DONE = 'is-done'
CURRENT = 'is-current'
BLOCKED = 'is-blocked'
SKIPPED = 'is-skipped'

PENDING = ''

#: 有开通轨的页面。与 ``SCENE_VALUES_BY_PAGE`` 的键同一批，但不共用一份常量 ——
RAIL_PAGES = frozenset(
    {
        'setup.html',
        'login.html',
        'license.html',
        'pair.html',
        'license-recovery.html',
    }
)


def has_rail(page: str) -> bool:
    """这一页要不要灌开通轨。非入口页（编辑器、展示页）不算。"""
    return page in RAIL_PAGES


def _signin_state(admin_session: bool) -> str:
    """「登录」这一格：管理员带着会话来就是已过，墙面板不走这道门。
    """
    return DONE if admin_session else SKIPPED


def rail_states(page: str, *, admin_session: bool, device: bool) -> tuple[str, ...]:
    """这一页、这个访问者，该怎么点亮五行轨。
    """
    if page == 'setup.html':
        # 这一页只在**未初始化**时渲染（见 setup_page）：五格全是待办，除了自己。
        return (CURRENT, PENDING, PENDING, PENDING, PENDING)

    if page == 'login.html':
        # 只在已初始化且未登录时渲染：初始化已过，正站在登录这道门上。
        return (DONE, CURRENT, PENDING, PENDING, PENDING)

    if page == 'license.html':
        # 只在已登录时渲染（license_page 要求 signed_in）：前两道门都已过。
        return (DONE, DONE, CURRENT, PENDING, PENDING)

    if page == 'pair.html':
        # 走到这一页就说明授权已放行（/pair 只在 allows('display') 为真时才渲染配对表单），
        return (DONE, _signin_state(admin_session), DONE, CURRENT, PENDING)

    if page == 'license-recovery.html':
        # 恢复页卡在**激活**这道门上，不是「进中控」：页面自己写着「当前服务尚未激活」，
        paired = DONE if device else PENDING
        return (DONE, _signin_state(admin_session), BLOCKED, paired, PENDING)

    known = '、'.join(sorted(RAIL_PAGES))
    raise RuntimeError(
        f'{page} 没有登记开通轨读数；请在 backend/src/http/commissioning.rail_states 里补一个分支'
        f'（已登记：{known}）'
    )


def rail_markup(states: tuple[str, ...], *, indent: str) -> str:
    """把状态元组渲染成 ``<ol class="hos-steps">``。
    """
    if len(states) != len(STEP_LABELS):
        # zip(strict=True) 也挡这一条，但它抛的是 ValueError；这里要的是一条能直接指向
        raise RuntimeError(
            f'开通轨读数有 {len(states)} 格，门链有 {len(STEP_LABELS)} 道；两者必须一一对应'
        )
    items = []
    # 按下标取标签，而不是 `zip(STEP_LABELS, states)` 解包两个名字：后者写反了
    for index, state in enumerate(states):
        label = STEP_LABELS[index]
        classes = f'hos-steps__item {state}' if state else 'hos-steps__item'
        current = ' aria-current="step"' if state == CURRENT else ''
        items.append(
            f'{indent}  <li class="{classes}"{current}>'
            f'<i class="hos-steps__dot" aria-hidden="true"></i>{label}</li>'
        )
    lines = [f'{indent}<ol class="hos-steps" aria-label="开通路径">', *items, f'{indent}</ol>']
    return '\n'.join(lines)
