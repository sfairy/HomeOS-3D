<script setup lang="ts">
import { computed } from "vue";
import { useCatalogStore } from "../../stores/catalog.js";
import { useSessionStore } from "../../stores/session.js";

const catalog = useCatalogStore();
const session = useSessionStore();

const hasPrimary = computed(() => catalog.primaryProducts.length > 0);
const authenticated = computed(() => Boolean(session.account));
</script>

<template>
  <main class="hb-store-main hb-store-main--flush" data-store-page="home">
    <section class="hb-hero">
      <div class="hb-hero__fx" aria-hidden="true">
        <span class="hb-hero__sky"></span>
        <span class="hb-hero__aurora hb-hero__aurora--a"></span>
        <span class="hb-hero__aurora hb-hero__aurora--b"></span>
        <span class="hb-hero__stars hb-hero__stars--far"></span>
        <span class="hb-hero__stars hb-hero__stars--near"></span>
        <span class="hb-hero__grid"></span>
        <span class="hb-hero__glow"></span>
        <span class="hb-hero__horizon"></span>
        <span class="hb-hero__sweep"></span>
      </div>
      <div class="hb-container hb-hero__inner">
        <span class="hb-kicker">HomeOS · 全屋智能中控</span>
        <h1>把整个家，收进一块<strong>3D 中控</strong></h1>
        <p class="hb-lead">
          HomeOS 是跑在自己服务器上的全屋智能管家：3D 户型里开关灯与窗帘，统一纳管家电与环境，
          场景、安防与全屏中控都在同一个界面里完成 —— 数据留在本机，不经过任何第三方云。
        </p>
        <div class="hb-hero__actions">
          <RouterLink v-if="hasPrimary && !authenticated" class="hb-button hb-button--primary hb-button--lg" to="/products">
            选择授权版本 <i class="fa-duotone fa-regular fa-arrow-right"></i>
          </RouterLink>
          <RouterLink v-if="!authenticated" class="hb-button hb-button--primary hb-button--lg" to="/user/authentication/login">
            登录账号 <i class="fa-duotone fa-regular fa-arrow-right"></i>
          </RouterLink>
          <RouterLink v-if="!authenticated" class="hb-button hb-button--secondary hb-button--lg" to="/user/authentication/register">
            注册账号
          </RouterLink>
          <RouterLink v-if="authenticated" class="hb-button hb-button--secondary hb-button--lg" to="/user/dashboard/index">
            进入账号中心
          </RouterLink>
        </div>
        <p v-if="!hasPrimary" class="hb-hero__empty">当前暂无主授权或全授权上架，请稍后再来。</p>
        <ul class="hb-hero__facts">
          <li><strong>本机部署</strong><small>FastAPI + SQLite，数据自持</small></li>
          <li><strong>3D 户型中控</strong><small>2D / 3D 双视图，点选即控</small></li>
          <li><strong>对接 Home Assistant</strong><small>HTTP / WebSocket 双向同步</small></li>
          <li><strong>买断授权</strong><small>支付确认后自动发码</small></li>
        </ul>
        <ol class="hb-flow">
          <li><span>01</span><div><strong>注册并登录</strong><small>邮箱验证码创建账号</small></div></li>
          <li><span>02</span><div><strong>扫码完成支付</strong><small>支付结果由服务端确认</small></div></li>
          <li><span>03</span><div><strong>账号管理授权</strong><small>激活码与设备都在账号中心</small></div></li>
        </ol>
      </div>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-capability-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">Capabilities</span>
        <h2 id="home-capability-title">一个界面，接管全屋</h2>
        <p>从户型图到每一盏灯、每一度温度、每一路摄像头，都在同一套界面里编排与操作。</p>
      </div>
      <div class="hb-cap-grid">
        <article class="hb-cap" data-tone="accent">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-cube"></i></span>
          <h3>3D 户型中控</h3>
          <p>自建或导入户型模型，按楼层自动导图并回写到仪表盘，墙体与灯光属性可批量套用。</p>
          <ul class="hb-cap__tags"><li>2D / 3D 双视图</li><li>按房间归类</li><li>批量改属性</li></ul>
        </article>
        <article class="hb-cap" data-tone="aura">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-sliders"></i></span>
          <h3>3D 交互舞台</h3>
          <p>把控件嵌进户型舞台：在三维视图里直接开关灯、开关、窗帘、空调与电视，状态实时回流。</p>
          <ul class="hb-cap__tags"><li>点选即控</li><li>草稿快照场景</li><li>展示页共用</li></ul>
        </article>
        <article class="hb-cap" data-tone="sensor">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-table-columns"></i></span>
          <h3>可视化编辑器</h3>
          <p>页面、控件、实体绑定、弹窗与主题全部可拖拽配置，改完即生效，不需要碰代码。</p>
          <ul class="hb-cap__tags"><li>控件自由摆放</li><li>弹窗编排</li><li>内置暗色主题</li></ul>
        </article>
        <article class="hb-cap" data-tone="cool">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-tv"></i></span>
          <h3>全屏中控与配对</h3>
          <p>专门给墙面平板和常亮屏准备的全屏展示页，用 6 位配对码把设备接进来，装完即用。</p>
          <ul class="hb-cap__tags"><li>常亮展示页</li><li>6 位配对码</li><li>独立浏览器可用</li></ul>
        </article>
        <article class="hb-cap" data-tone="heat">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-temperature-half"></i></span>
          <h3>环境与气候</h3>
          <p>空调、地暖、新风统一成气候面板，温度、模式与风速在一个控件里调完。</p>
          <ul class="hb-cap__tags"><li>制冷 / 制热</li><li>风速与摆风</li><li>多房间</li></ul>
        </article>
        <article class="hb-cap" data-tone="eco">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-shield-halved"></i></span>
          <h3>安防与传感器</h3>
          <p>门窗、人体、水浸等传感器按区域看板汇总，异常状态一眼可见，触发条件可挂联动。</p>
          <ul class="hb-cap__tags"><li>分区布防</li><li>异常高亮</li><li>联动触发</li></ul>
        </article>
        <article class="hb-cap" data-tone="lumen">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-robot"></i></span>
          <h3>扫地机器人地图</h3>
          <p>把扫地机的清扫地图和分区搬进中控，指定房间清扫、查看进度都在同一块屏上。</p>
          <ul class="hb-cap__tags"><li>分区清扫</li><li>进度可视</li><li>地图编辑</li></ul>
        </article>
        <article class="hb-cap" data-tone="accent">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-house-signal"></i></span>
          <h3>Home Assistant 直连</h3>
          <p>用 HTTP 与 WebSocket 同步实体和状态，摄像头与媒体走代理转发，已有 HA 环境直接接管。</p>
          <ul class="hb-cap__tags"><li>实体同步</li><li>状态推送</li><li>媒体代理</li></ul>
        </article>
      </div>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-console-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">Central Control</span>
        <h2 id="home-console-title">一块屏幕，看住全屋</h2>
        <p>户型、设备卡、场景与状态同屏并列，不用在几个 App 之间来回切。</p>
      </div>
      <figure class="hb-figure">
        <div class="hb-console" role="img" aria-label="HomeOS 全屋中控界面示意">
          <div class="hb-console__bar">
            <span class="hb-console__brand"><i class="fa-duotone fa-regular fa-house-chimney"></i> HomeOS</span>
            <span class="hb-console__chip hb-console__chip--on"><i class="fa-duotone fa-regular fa-circle-check"></i> 8 台在线</span>
            <span class="hb-console__chip">回家模式</span>
            <span class="hb-console__clock">20:41</span>
          </div>
          <div class="hb-console__body">
            <div class="hb-console__plan">
              <span class="hb-console__room hb-console__room--living" data-tone="lumen">客厅</span>
              <span class="hb-console__room hb-console__room--kitchen" data-tone="eco">厨房</span>
              <span class="hb-console__room hb-console__room--bedroom" data-tone="aura">主卧</span>
              <span class="hb-console__room hb-console__room--balcony" data-tone="accent">阳台</span>
              <span class="hb-console__node hb-console__node--on hb-console__node--a" data-tone="lumen"></span>
              <span class="hb-console__node hb-console__node--on hb-console__node--b" data-tone="cool"></span>
              <span class="hb-console__node hb-console__node--on hb-console__node--c" data-tone="aura"></span>
              <span class="hb-console__node hb-console__node--off hb-console__node--d"></span>
              <span class="hb-console__node hb-console__node--on hb-console__node--e" data-tone="eco"></span>
              <span class="hb-console__node hb-console__node--off hb-console__node--f"></span>
              <span class="hb-console__legend"><i class="hb-console__dot hb-console__dot--on"></i>开启<i class="hb-console__dot"></i>关闭</span>
            </div>
            <div class="hb-console__side">
              <div class="hb-console__card" data-tone="lumen">
                <div class="hb-console__card-head"><span>客厅主灯</span><span class="hb-console__badge hb-console__badge--on">已开启</span></div>
                <div class="hb-console__slider"><i></i></div>
                <div class="hb-console__card-foot"><small>亮度</small><strong>72%</strong></div>
              </div>
              <div class="hb-console__card" data-tone="cool">
                <div class="hb-console__card-head"><span>中央空调</span><span class="hb-console__badge hb-console__badge--on">制冷</span></div>
                <div class="hb-console__reading"><strong>22.4</strong><small>°C</small></div>
                <div class="hb-console__card-foot"><small>目标 24.0°C</small><strong>中风</strong></div>
              </div>
              <div class="hb-console__card" data-tone="eco">
                <div class="hb-console__card-head"><span>全屋安防</span><span class="hb-console__badge hb-console__badge--on">已布防</span></div>
                <ul class="hb-console__zones">
                  <li><span>门窗</span><b>6 / 6 正常</b></li>
                  <li><span>人体</span><b>3 路在线</b></li>
                  <li><span>水浸</span><b>2 路正常</b></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <figcaption class="hb-figure__note">界面示意，实际布局可在编辑器里自由调整。</figcaption>
      </figure>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-deploy-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">Getting Started</span>
        <h2 id="home-deploy-title">四步接手现有的家</h2>
        <p>已有 Home Assistant 环境可以直接接管，没有也可以从零开始配置。</p>
      </div>
      <ol class="hb-steps">
        <li class="hb-steps__item" data-tone="accent"><span class="hb-steps__index">01</span><div class="hb-steps__body"><strong>部署服务</strong><small>本机或 NAS 上跑起 HomeOS，默认数据落在本机 SQLite。</small></div></li>
        <li class="hb-steps__item" data-tone="aura"><span class="hb-steps__index">02</span><div class="hb-steps__body"><strong>连接 Home Assistant</strong><small>填入地址与令牌，实体与状态自动同步过来。</small></div></li>
        <li class="hb-steps__item" data-tone="lumen"><span class="hb-steps__index">03</span><div class="hb-steps__body"><strong>激活授权</strong><small>在账号中心拿到激活码，客户端联网确认后即可使用。</small></div></li>
        <li class="hb-steps__item" data-tone="eco"><span class="hb-steps__index">04</span><div class="hb-steps__body"><strong>导入户型并绑定设备</strong><small>户型导图、控件摆放、弹窗与场景按房间逐个配好。</small></div></li>
      </ol>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-tiers-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">License</span>
        <h2 id="home-tiers-title">按需要选授权</h2>
        <p>主授权决定基础能力，增量包按需叠加到已有的永久激活码上，不必重复购买。</p>
      </div>
      <div class="hb-tiers">
        <article class="hb-tier" data-tone="eco">
          <header class="hb-tier__head"><span class="hb-tier__name">基础版</span><span class="hb-tier__hint">先把全屋接起来</span></header>
          <ul class="hb-tier__list"><li>仪表盘编辑与全屏展示</li><li>Home Assistant 实体同步</li><li>中控配对与全局日志</li></ul>
          <RouterLink class="hb-button hb-button--secondary hb-tier__action" to="/products">查看价格</RouterLink>
        </article>
        <article class="hb-tier hb-tier--featured" data-tone="accent">
          <header class="hb-tier__head"><span class="hb-tier__name">3D 交互版</span><span class="hb-tier__hint">户型里直接操作</span></header>
          <ul class="hb-tier__list"><li>包含基础版的全部能力</li><li>3D 户型工作室与自动导图</li><li>3D 交互舞台：灯、窗帘、空调、电视、扫地机</li></ul>
          <RouterLink class="hb-button hb-button--primary hb-tier__action" to="/products">查看价格</RouterLink>
        </article>
        <article class="hb-tier" data-tone="aura">
          <header class="hb-tier__head"><span class="hb-tier__name">增量包</span><span class="hb-tier__hint">老用户按需升级</span></header>
          <ul class="hb-tier__list"><li>挂到已有的永久激活码上</li><li>单个能力单独购买</li><li>不影响原授权有效期</li></ul>
          <RouterLink class="hb-button hb-button--secondary hb-tier__action" to="/products">查看增量包</RouterLink>
        </article>
      </div>
      <p class="hb-tiers__note">具体在售商品与价格以商品列表为准；买错或换机都可以在账号中心自助处理。</p>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-trust-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">Assurance</span>
        <h2 id="home-trust-title">买得清楚，用得踏实</h2>
      </div>
      <ul class="hb-trust">
        <li class="hb-trust__item" data-tone="accent"><i class="fa-duotone fa-regular fa-database"></i><strong>数据留在本机</strong><small>授权校验走自建服务器，家庭数据不上传第三方云。</small></li>
        <li class="hb-trust__item" data-tone="eco"><i class="fa-duotone fa-regular fa-bolt"></i><strong>支付确认即发码</strong><small>订单由服务端确认，到账后自动签发激活码，无需等人工。</small></li>
        <li class="hb-trust__item" data-tone="aura"><i class="fa-duotone fa-regular fa-arrows-rotate"></i><strong>设备可自助解绑</strong><small>换机或升级后硬件指纹变化时，可在账号中心自助解绑，每份授权独立计算冷却。</small></li>
        <li class="hb-trust__item" data-tone="lumen"><i class="fa-duotone fa-regular fa-receipt"></i><strong>订单与授权可查</strong><small>历史订单、激活码、绑定设备与积分流水在账号中心随时可查。</small></li>
      </ul>
    </section>

    <section class="hb-section hb-container hb-section--last" aria-labelledby="home-faq-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">FAQ</span>
        <h2 id="home-faq-title">常见问题</h2>
      </div>
      <div class="hb-faq">
        <details class="hb-faq__item" open>
          <summary>需要一台公网服务器吗？</summary>
          <div class="hb-faq__body"><p>不需要。HomeOS 默认跑在自己的电脑或 NAS 上，数据落在本机 SQLite；授权校验是唯一需要联网的环节，客户端会定期心跳续租。</p></div>
        </details>
        <details class="hb-faq__item">
          <summary>已经装了 Home Assistant，还要重新配一遍吗？</summary>
          <div class="hb-faq__body"><p>不用。填入 HA 地址与长期令牌后，HomeOS 会通过 HTTP 与 WebSocket 把实体和状态同步过来，已有的自动化与设备保持原样。</p></div>
        </details>
        <details class="hb-faq__item">
          <summary>一台授权能绑几台设备？换设备怎么办？</summary>
          <div class="hb-faq__body"><p>每份授权对应一个激活码，按本机硬件指纹一对一绑定，设备会列在账号中心。换设备时可在线自助解绑；解绑后原设备下次心跳即转吊销，冷却期内不能重新绑定。系统大版本升级后若提示「硬件绑定不匹配」，同样先在账号中心解绑，再回 HomeOS 用原激活码重新激活。</p></div>
        </details>
        <details class="hb-faq__item">
          <summary>买了基础版，之后想升级可以吗？</summary>
          <div class="hb-faq__body"><p>可以。增量包会直接挂到已有的永久主授权上，不需要重新购买基础版，也不影响原授权的有效期。</p></div>
        </details>
        <details class="hb-faq__item">
          <summary>支付成功后没看到激活码？</summary>
          <div class="hb-faq__body"><p>先在账号中心的订单里确认状态：已完成的订单会直接展示激活码。若状态仍为待付款，可能是支付结果还没回调，稍等片刻刷新即可；超过一段时间仍未到账，请带上订单号联系客服邮箱。</p></div>
        </details>
        <details class="hb-faq__item">
          <summary>优惠码怎么用？</summary>
          <div class="hb-faq__body"><p>在结算页填写优惠码后点校验，折扣会立即体现在应付金额上；每个优惠码的适用范围和限用次数由运营配置，校验通过才会计入订单。</p></div>
        </details>
      </div>
    </section>
  </main>
</template>
