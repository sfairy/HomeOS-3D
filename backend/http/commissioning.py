"""开通链路的五道门，以及「这一台机器走到哪了」的读数。

``/setup`` → ``/login`` → ``/license`` → ``/pair`` → 进中控 是同一台机器从裸机到能用的
五道门（门禁顺序见 ``main.py`` 各入口页路由），五个入口页右栏顶部那条轨画的就是它。

**为什么这条轨由后端填，而不是写死在五个 ``.html`` 里**：「走到哪了」有一半不在页面
里，而在请求里。同一条 ``/pair`` 服务两种人 —— 管理员带着 ``?scan=1`` 来配第二块屏
（他过了「登录」那道门），和一台还没配对的墙面板（它根本不走「登录」这道门，墙上
也没有键盘）。写死的轨必然对其中一种人撒谎，而撒谎的那一格恰好是整个页面最显眼
的位置：一块从没登录过的屏上写着「登录 ✓」。

同一页两套读数不是缺陷，是这两页的真实处境：``/pair`` 与恢复页本来就同时是管理员的
配对入口和墙面板的开机落点。所以读数按**访问者**给，而不是按页面给。

放在这里而不是各页 HTML 的第二个好处：五页的轨从此不可能走散。``rail_states`` 是
穷举式的（每个页面名一个分支，未登记的页面直接抛），加第六个入口页时第一次访问
就会 500，而不是安静地显示一条谁都没注意到的轨。

**这里不做任何门禁判定**：每一页能渲染出来，就已经由路由保证了「你正站在这一道门
上」（例如 ``pair.html`` 只在 ``allows('display')`` 为真时渲染）。本模块只把「从请求
里能便宜拿到的那一格」读出来 —— 有没有管理员会话、有没有已配对设备 —— 其余照路由
保证的位置填。多判一次的能力查询（``status()`` 要走网络）只会让入口页变慢，而它的
结论已经写在路由里了。
"""
from __future__ import annotations

#: 五道门的名字，顺序即门禁顺序。改这里等于同时改五页的轨 —— 这是有意的：
#: 门链本来就是一条，不是五条各写一遍。
STEP_LABELS = ('初始化', '登录', '激活', '配对', '进中控')

#: 与 ``design/scene/panel.css``「开通路径」段里的类一一对应。写成完整字面量而不是
#: 拼前缀：写成完整类名字面量，``panel.css`` 里那些规则才有一条能靠 grep 追溯的线索。
DONE = 'is-done'
CURRENT = 'is-current'
BLOCKED = 'is-blocked'
SKIPPED = 'is-skipped'

#: 「还没走到」。没有类名是刻意的：CSS 里未加状态类就是待办外观，
#: 多一个 ``is-pending`` 只会多一条永远不会被人写对的规则。
PENDING = ''

#: 有开通轨的页面。与 ``SCENE_VALUES_BY_PAGE`` 的键同一批，但不共用一份常量 ——
#: 那条轨是「链路进度」，左栏文案是「这一页做什么」，将来可能只有一边多一个页面。
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

    单独一个函数而不是在 ``rail_states`` 顶上算一次局部变量：这一格是唯一因访问者
    而异的门，而**只有两道门之后的两页**用得上它（见 ``rail_states`` 的分支）。
    写成局部变量时，它被赋值的位置在分支之外，读代码的人要在两个分支之间来回找；
    写成函数则每个用得上的分支都明写一次，护栏也才有一条能静态检查的线索
    （只有该用的那两页会调用它）。
    """
    return DONE if admin_session else SKIPPED


def rail_states(page: str, *, admin_session: bool, device: bool) -> tuple[str, ...]:
    """这一页、这个访问者，该怎么点亮五行轨。

    参数:
        page: 页面模板文件名（与 ``page_shell`` 收到的同源）。
        admin_session: 请求里有没有有效的管理员会话。**只有「登录」这一格读它** ——
            它是唯一一道「墙面板不走」的门，见 ``_signin_state``。
        device: 请求里有没有已配对且未过期的中控设备 Cookie。恢复页用它决定「配对」
            那一格：一块已经配好的屏不该被标成「还没配对」。

    返回: 与 ``STEP_LABELS`` 等长的状态元组（见 ``DONE``/``CURRENT``/…）。

    ``PENDING`` 占位不用 None：下游要把它拼进 class 属性，None 会被 f-string 写成
    ``"None"``，而那是一个**能生效的 class**（等价于什么都没加，于是看起来一切正常）。
    """
    if page == 'setup.html':
        # 这一页只在**未初始化**时渲染（见 setup_page）：五格全是待办，除了自己。
        # 「登录」也跟着待办而不是「不适用」—— 站在这一页的人是管理员本人，
        # 那两道门他在后面还要走。
        return (CURRENT, PENDING, PENDING, PENDING, PENDING)

    if page == 'login.html':
        # 只在已初始化且未登录时渲染：初始化已过，正站在登录这道门上。
        return (DONE, CURRENT, PENDING, PENDING, PENDING)

    if page == 'license.html':
        # 只在已登录时渲染（license_page 要求 signed_in）：前两道门都已过。
        return (DONE, DONE, CURRENT, PENDING, PENDING)

    if page == 'pair.html':
        # 走到这一页就说明授权已放行（/pair 只在 allows('display') 为真时才渲染配对表单），
        # 所以「激活」是已过而不是待办 —— 这一格由路由保证，不必再查一次能力。
        return (DONE, _signin_state(admin_session), DONE, CURRENT, PENDING)

    if page == 'license-recovery.html':
        # 恢复页卡在**激活**这道门上，不是「进中控」：页面自己写着「当前服务尚未激活」，
        # 旁边那个按钮就是「管理员重新激活」。标错一格会让进度轨和同一屏上的文案互相
        # 打脸，而用户在门口最想知道的就是「我卡在哪」。
        #
        # 「配对」看设备 Cookie：已配好的屏是「已过」，管理员在 /pair?scan=1 上手动
        # 配一台新设备则是「还没配对」。
        paired = DONE if device else PENDING
        return (DONE, _signin_state(admin_session), BLOCKED, paired, PENDING)

    known = '、'.join(sorted(RAIL_PAGES))
    raise RuntimeError(
        f'{page} 没有登记开通轨读数；请在 backend/http/commissioning.rail_states 里补一个分支'
        f'（已登记：{known}）'
    )


def rail_markup(states: tuple[str, ...], *, indent: str) -> str:
    """把状态元组渲染成 ``<ol class="hos-steps">``。

    ``indent`` 是插入点所在行的缩进，逐行补上：注入的标记要落在页面原来的缩进上，
    否则读 ``view-source`` 的人会看到一段贴着左边的块，而它分明嵌在表单坞里面。

    ``aria-current="step"`` 挂在 ``CURRENT`` 上，``BLOCKED`` 刻意不挂：那块屏上
    「当前」与「卡住」是两种处境，读屏用户听到的也该是两种。喘息的动画同理，见 CSS。
    """
    if len(states) != len(STEP_LABELS):
        # zip(strict=True) 也挡这一条，但它抛的是 ValueError；这里要的是一条能直接指向
        # 「读物和门链对不上了」的错误，而不是一句「长度为 4 与 5 不匹配」。
        raise RuntimeError(
            f'开通轨读数有 {len(states)} 格，门链有 {len(STEP_LABELS)} 道；两者必须一一对应'
        )
    items = []
    # 按下标取标签，而不是 `zip(STEP_LABELS, states)` 解包两个名字：后者写反了
    # 就是把状态当标签印出来（`class="hos-steps__item 初始化"` 配文本 `is-current`），
    # 而它看起来仍是一条像样的轨 —— 少解包一个名字，这种错就写不出来。
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
