<script setup lang="ts">
import { computed } from "vue";
import { useCatalogStore, storePageHref } from "../../stores/catalog.js";
import { useSessionStore } from "../../stores/session.js";
import { useSiteStore } from "../../stores/site.js";
import { formatCents as money } from "../../money.js";
import type { StoreProduct } from "../../store-types.js";

const catalog = useCatalogStore();
const session = useSessionStore();
const site = useSiteStore();

const authenticated = computed(() => Boolean(session.account));
const hasPrimary = computed(() => catalog.primaryProducts.length > 0);
/** 目录尚未拉完时不显示「暂无上架」，避免首屏闪空态。 */
const showCatalogEmpty = computed(() => catalog.loaded && !hasPrimary.value);

const supportEmail = computed(() => {
  const raw = site.store?.supportEmail;
  return typeof raw === "string" ? raw.trim() : "";
});

function byType(...types: string[]) {
  return catalog.products.find((item) => types.includes(item.productType || "")) || null;
}

const productBase = computed(() => byType("base"));
const productPackage = computed(() => byType("package"));
const productFull = computed(() => byType("edition_full", "bundle"));
const productModule3d = computed(
  () =>
    catalog.products.find(
      (item) =>
        item.productType === "module" &&
        (item.featureCodes || []).includes("module.3d_interaction"),
    ) || byType("module"),
);

function productHref(product: StoreProduct | null | undefined) {
  if (!product) return storePageHref("/products");
  return storePageHref(`/item/${encodeURIComponent(product.id)}`);
}

function titleOf(product: StoreProduct | null | undefined, fallback: string) {
  const edition = typeof product?.edition === "string" ? product.edition.trim() : "";
  // 早期种子商品可能没写 edition，首页优先用营销档位名，避免露出运营内部名。
  return edition || fallback || product?.name || "授权版本";
}

function priceOf(product: StoreProduct | null | undefined) {
  return product ? money(product.priceCents) : null;
}

interface ModuleCard {
  code: string;
  label: string;
  tone: string;
  icon: string;
  blurb: string;
  tags: string[];
}

/** 与 ops/feature_codes.json 增量模块对齐（不含已下架营销的影视媒体）。 */
const MODULE_CARDS: ModuleCard[] = [
  {
    code: "module.3d_interaction",
    label: "3D 交互",
    tone: "accent",
    icon: "fa-cube",
    blurb: "在户型舞台里直接控灯、窗帘、空调、电视与扫地机，状态实时回流。",
    tags: ["点选即控", "运行时面板"],
  },
  {
    code: "module.security",
    label: "安防监控",
    tone: "eco",
    icon: "fa-shield-halved",
    blurb: "摄像头实时画面、门铃与报警事件同屏汇总，分区布防一眼可读。",
    tags: ["摄像头", "布防撤防"],
  },
  {
    code: "module.notifications",
    label: "通知中心",
    tone: "aura",
    icon: "fa-bell",
    blurb: "站内通知、推送渠道与规则集中管理，重要事件不再漏看。",
    tags: ["推送规则", "站内通知"],
  },
  {
    code: "module.earthquake",
    label: "地震预警",
    tone: "heat",
    icon: "fa-house-crack",
    blurb: "接入预警数据源，到家即推送，历史事件可回溯。",
    tags: ["实时预警", "历史"],
  },
  {
    code: "module.energy",
    label: "能耗管理",
    tone: "lumen",
    icon: "fa-bolt",
    blurb: "电表与能源统计、生活账户与智能充放电，看清全屋用电。",
    tags: ["电表统计", "生活账户"],
  },
  {
    code: "module.home_mode",
    label: "场景模式",
    tone: "cool",
    icon: "fa-house-signal",
    blurb: "回家 / 离家等场景编排与一键切换，动作序列可自定义。",
    tags: ["一键切换", "动作序列"],
  },
  {
    code: "module.voice",
    label: "语音助手",
    tone: "sensor",
    icon: "fa-microphone",
    blurb: "语音唤醒、识别与命令映射，用说的完成常用控制。",
    tags: ["唤醒", "命令映射"],
  },
  {
    code: "module.agent",
    label: "AI 助手",
    tone: "accent",
    icon: "fa-robot",
    blurb: "自然语言控家与多轮对话，把复杂操作收成一句指令。",
    tags: ["智能体", "多轮对话"],
  },
];

const moduleByCode = computed(() => {
  const map = new Map<string, StoreProduct>();
  for (const item of catalog.products) {
    if (!["module", "template"].includes(item.productType || "")) continue;
    for (const code of item.featureCodes || []) {
      if (!map.has(code)) map.set(code, item);
    }
  }
  return map;
});

const moduleShelf = computed(() =>
  MODULE_CARDS.map((mod) => ({
    ...mod,
    product: moduleByCode.value.get(mod.code) || null,
    featured: mod.code === "module.3d_interaction",
  })),
);
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
          面向已有 Home Assistant 的家庭：在本机跑起 3D 户型中控，灯、窗帘、空调与安防同一界面完成；
          家庭数据留在本机，买断授权支付确认后自动发码。
        </p>
        <div class="hb-hero__actions">
          <RouterLink
            v-if="!authenticated && (hasPrimary || !catalog.loaded)"
            class="hb-button hb-button--primary hb-button--lg"
            to="/products"
          >
            选择授权版本 <i class="fa-duotone fa-regular fa-arrow-right"></i>
          </RouterLink>
          <a
            v-if="!authenticated && (hasPrimary || !catalog.loaded)"
            class="hb-button hb-button--secondary hb-button--lg"
            href="#home-tiers-title"
          >
            对比版本
          </a>
          <RouterLink
            v-if="!authenticated"
            class="hb-button hb-button--ghost hb-button--lg"
            to="/user/authentication/login"
          >
            登录
          </RouterLink>
          <RouterLink
            v-if="!authenticated"
            class="hb-button hb-button--ghost hb-button--lg"
            to="/user/authentication/register"
          >
            注册
          </RouterLink>
          <RouterLink
            v-if="authenticated"
            class="hb-button hb-button--primary hb-button--lg"
            to="/products"
          >
            购买或升级授权 <i class="fa-duotone fa-regular fa-arrow-right"></i>
          </RouterLink>
          <RouterLink
            v-if="authenticated"
            class="hb-button hb-button--secondary hb-button--lg"
            to="/user/dashboard/index"
          >
            进入账号中心
          </RouterLink>
        </div>
        <p v-if="showCatalogEmpty" class="hb-hero__empty">当前暂无主授权或全授权上架，请稍后再来。</p>
        <ul class="hb-hero__facts">
          <li><strong>本机自托管</strong><small>数据落在自己的电脑或 NAS</small></li>
          <li><strong>3D 户型中控</strong><small>2D / 3D 双视图，点选即控</small></li>
          <li><strong>直连 Home Assistant</strong><small>HTTP / WebSocket 双向同步</small></li>
          <li><strong>买断授权</strong><small>支付确认后自动发码</small></li>
        </ul>
        <ol class="hb-flow">
          <li><span>01</span><div><strong>注册并登录</strong><small>账号 + 邮箱验证码</small></div></li>
          <li><span>02</span><div><strong>扫码完成支付</strong><small>支付结果由服务端确认</small></div></li>
          <li><span>03</span><div><strong>账号中心拿码</strong><small>激活码与设备都在这里</small></div></li>
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
          <div class="hb-cap__head">
            <h3>3D 户型工作室</h3>
            <span class="hb-cap__badge">基础版起</span>
          </div>
          <p>自建或导入户型模型，按楼层自动导图并回写到仪表盘，墙体与灯光属性可批量套用。</p>
          <ul class="hb-cap__tags"><li>2D / 3D 双视图</li><li>按房间归类</li><li>批量改属性</li></ul>
        </article>
        <article class="hb-cap" data-tone="aura">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-sliders"></i></span>
          <div class="hb-cap__head">
            <h3>3D 交互舞台</h3>
            <span class="hb-cap__badge">需 3D 包</span>
          </div>
          <p>把控件嵌进户型舞台：在三维视图里直接开关灯、开关、窗帘、空调与电视，状态实时回流。</p>
          <ul class="hb-cap__tags"><li>点选即控</li><li>草稿快照</li><li>展示页共用</li></ul>
        </article>
        <article class="hb-cap" data-tone="sensor">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-table-columns"></i></span>
          <div class="hb-cap__head">
            <h3>可视化编辑器</h3>
            <span class="hb-cap__badge">基础版</span>
          </div>
          <p>页面、控件、实体绑定、弹窗与主题全部可拖拽配置，改完即生效，不需要碰代码。</p>
          <ul class="hb-cap__tags"><li>控件摆放</li><li>弹窗编排</li><li>暗色主题</li></ul>
        </article>
        <article class="hb-cap" data-tone="cool">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-tv"></i></span>
          <div class="hb-cap__head">
            <h3>全屏中控展示</h3>
            <span class="hb-cap__badge">基础版</span>
          </div>
          <p>专为墙面平板与常亮屏准备的展示页，与编辑器共用登录会话，登录即可使用。</p>
          <ul class="hb-cap__tags"><li>常亮展示</li><li>同会话登录</li><li>浏览器可用</li></ul>
        </article>
        <article class="hb-cap" data-tone="heat">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-temperature-half"></i></span>
          <div class="hb-cap__head">
            <h3>环境与气候</h3>
            <span class="hb-cap__badge">基础版</span>
          </div>
          <p>空调、地暖、新风统一成气候面板，温度、模式与风速在一个控件里调完。</p>
          <ul class="hb-cap__tags"><li>制冷 / 制热</li><li>风速摆风</li><li>多房间</li></ul>
        </article>
        <article class="hb-cap" data-tone="eco">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-shield-halved"></i></span>
          <div class="hb-cap__head">
            <h3>安防与传感器</h3>
            <span class="hb-cap__badge">安防模块</span>
          </div>
          <p>门窗、人体、水浸与摄像头按区域看板汇总，异常状态一眼可见，可挂联动。</p>
          <ul class="hb-cap__tags"><li>分区布防</li><li>异常高亮</li><li>门铃报警</li></ul>
        </article>
        <article class="hb-cap" data-tone="lumen">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-bolt"></i></span>
          <div class="hb-cap__head">
            <h3>能耗与场景</h3>
            <span class="hb-cap__badge">增量模块</span>
          </div>
          <p>电表统计、生活账户与回家 / 离家场景编排，把「省电」和「一键回家」放进中控。</p>
          <ul class="hb-cap__tags"><li>能耗视图</li><li>场景切换</li><li>动作序列</li></ul>
        </article>
        <article class="hb-cap" data-tone="accent">
          <span class="hb-cap__icon"><i class="fa-duotone fa-regular fa-house-signal"></i></span>
          <div class="hb-cap__head">
            <h3>Home Assistant 直连</h3>
            <span class="hb-cap__badge">基础版</span>
          </div>
          <p>HTTP 与 WebSocket 同步实体和状态，摄像头画面走本机代理，已有 HA 环境直接接管。</p>
          <ul class="hb-cap__tags"><li>实体同步</li><li>状态推送</li><li>摄像代理</li></ul>
        </article>
      </div>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-tiers-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">License</span>
        <h2 id="home-tiers-title">按需要选授权</h2>
        <p>主授权决定基础能力；增量包可叠加到已有永久激活码上，不必重复购买整包。</p>
      </div>
      <div class="hb-tiers">
        <article class="hb-tier" data-tone="eco">
          <header class="hb-tier__head">
            <span class="hb-tier__name">{{ titleOf(productBase, "家庭基础版") }}</span>
            <span class="hb-tier__hint">先把全屋接起来</span>
          </header>
          <p v-if="priceOf(productBase)" class="hb-tier__price">
            {{ priceOf(productBase) }}
            <small>买断 · 永久</small>
          </p>
          <ul class="hb-tier__list">
            <li>仪表盘编辑器与全屏中控展示</li>
            <li>Home Assistant 同步 / 配置 / 控制</li>
            <li>素材库、项目写入与实时通道</li>
          </ul>
          <RouterLink
            class="hb-button hb-button--secondary hb-tier__action"
            :to="productHref(productBase)"
          >
            {{ productBase ? "查看详情" : "查看价格" }}
          </RouterLink>
        </article>
        <article class="hb-tier hb-tier--featured" data-tone="accent">
          <span class="hb-tier__ribbon">推荐</span>
          <header class="hb-tier__head">
            <span class="hb-tier__name">{{ titleOf(productPackage, "家庭进阶版") }}</span>
            <span class="hb-tier__hint">户型里直接操作</span>
          </header>
          <p v-if="priceOf(productPackage)" class="hb-tier__price">
            {{ priceOf(productPackage) }}
            <small>买断 · 含 3D 交互</small>
          </p>
          <ul class="hb-tier__list">
            <li>包含基础版的全部能力</li>
            <li>3D 户型工作室与自动导图</li>
            <li>3D 交互：灯、窗帘、空调、电视、扫地机</li>
          </ul>
          <RouterLink
            class="hb-button hb-button--primary hb-tier__action"
            :to="productHref(productPackage)"
          >
            {{ productPackage ? "查看详情" : "查看价格" }}
          </RouterLink>
        </article>
        <article class="hb-tier" data-tone="lumen">
          <header class="hb-tier__head">
            <span class="hb-tier__name">{{ titleOf(productFull, "全功能版") }}</span>
            <span class="hb-tier__hint">全部增量一次拿齐</span>
          </header>
          <p v-if="priceOf(productFull)" class="hb-tier__price">
            {{ priceOf(productFull) }}
            <small>买断 · 全模块</small>
          </p>
          <ul class="hb-tier__list">
            <li>基础能力 + 3D 交互</li>
            <li>安防、通知、地震、能耗、场景</li>
            <li>语音助手与 AI 助手</li>
          </ul>
          <RouterLink
            class="hb-button hb-button--secondary hb-tier__action"
            :to="productHref(productFull)"
          >
            {{ productFull ? "查看详情" : "查看价格" }}
          </RouterLink>
        </article>
        <article class="hb-tier" data-tone="aura">
          <header class="hb-tier__head">
            <span class="hb-tier__name">增量包</span>
            <span class="hb-tier__hint">老用户按需升级</span>
          </header>
          <p v-if="priceOf(productModule3d)" class="hb-tier__price">
            起 {{ priceOf(productModule3d) }}
            <small>挂到已有主授权</small>
          </p>
          <ul class="hb-tier__list">
            <li>挂到已有的永久激活码上</li>
            <li>单个能力单独购买（如 3D 交互包）</li>
            <li>不影响原授权有效期</li>
          </ul>
          <RouterLink class="hb-button hb-button--secondary hb-tier__action" to="/products">
            查看增量包
          </RouterLink>
        </article>
      </div>
      <p class="hb-tiers__note">价格与在售商品以商品列表为准；换机可在账号中心自助解绑。</p>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-modules-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">Modules</span>
        <h2 id="home-modules-title">按需叠加的增量能力</h2>
        <p>下列模块可单独加购，也可一次拿齐「全功能版」。加购前需已有永久主授权。</p>
      </div>
      <div class="hb-module-grid">
        <article
          v-for="mod in moduleShelf"
          :key="mod.code"
          class="hb-module"
          :class="{ 'hb-module--featured': mod.featured }"
          :data-tone="mod.tone"
        >
          <div class="hb-module__top">
            <span class="hb-module__icon"><i class="fa-duotone fa-regular" :class="mod.icon"></i></span>
            <span v-if="mod.featured && mod.product" class="hb-module__badge">可单独买</span>
            <span v-else-if="!mod.product" class="hb-module__badge hb-module__badge--soft">全功能版</span>
          </div>
          <div class="hb-module__body">
            <h3>{{ mod.label }}</h3>
            <p>{{ mod.blurb }}</p>
            <ul class="hb-module__tags">
              <li v-for="tag in mod.tags" :key="tag">{{ tag }}</li>
            </ul>
          </div>
          <div class="hb-module__foot">
            <template v-if="mod.product">
              <strong>{{ money(mod.product.priceCents) }}</strong>
              <RouterLink class="hb-button hb-button--secondary hb-button--sm" :to="productHref(mod.product)">
                查看
              </RouterLink>
            </template>
            <template v-else>
              <small>含于全功能版</small>
              <RouterLink class="hb-button hb-button--secondary hb-button--sm" :to="productHref(productFull)">
                了解
              </RouterLink>
            </template>
          </div>
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

    <section class="hb-section hb-container" aria-labelledby="home-paths-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">Getting Started</span>
        <h2 id="home-paths-title">两条路，各走一步</h2>
        <p>商店负责买授权；HomeOS 客户端负责部署与接家。两边可以并行准备。</p>
      </div>
      <div class="hb-paths">
        <article class="hb-path" data-tone="accent">
          <header class="hb-path__head">
            <span class="hb-path__kicker">商店</span>
            <h3>买授权</h3>
          </header>
          <ol class="hb-path__steps">
            <li><span>01</span><div><strong>注册并登录</strong><small>邮箱验证码完成账号</small></div></li>
            <li><span>02</span><div><strong>选版本并支付</strong><small>扫码付款，服务端确认到账</small></div></li>
            <li><span>03</span><div><strong>账号中心拿码</strong><small>激活码、设备与订单都在这里</small></div></li>
          </ol>
          <RouterLink class="hb-button hb-button--secondary hb-button--sm hb-path__action" to="/products">
            去选版本
          </RouterLink>
        </article>
        <article class="hb-path" data-tone="eco">
          <header class="hb-path__head">
            <span class="hb-path__kicker">客户端</span>
            <h3>接手现有的家</h3>
          </header>
          <ol class="hb-path__steps">
            <li><span>01</span><div><strong>部署 HomeOS</strong><small>本机或 NAS，数据落本机 SQLite</small></div></li>
            <li><span>02</span><div><strong>连接 Home Assistant</strong><small>地址 + 长期令牌，实体自动同步</small></div></li>
            <li><span>03</span><div><strong>激活并编排户型</strong><small>填入激活码，再导入户型与设备</small></div></li>
          </ol>
          <RouterLink
            class="hb-button hb-button--secondary hb-button--sm hb-path__action"
            :to="authenticated ? '/user/dashboard/index' : '/user/authentication/register'"
          >
            {{ authenticated ? "打开账号中心" : "先注册账号" }}
          </RouterLink>
        </article>
      </div>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-trust-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">Assurance</span>
        <h2 id="home-trust-title">买得清楚，用得踏实</h2>
      </div>
      <ul class="hb-trust">
        <li class="hb-trust__item" data-tone="accent">
          <i class="fa-duotone fa-regular fa-database"></i>
          <strong>数据留在本机</strong>
          <small>授权校验走自建商店服务，家庭数据不上传第三方云。</small>
        </li>
        <li class="hb-trust__item" data-tone="eco">
          <i class="fa-duotone fa-regular fa-bolt"></i>
          <strong>支付确认即发码</strong>
          <small>订单由服务端确认，到账后自动签发激活码，无需等人工。</small>
        </li>
        <li class="hb-trust__item" data-tone="aura">
          <i class="fa-duotone fa-regular fa-arrows-rotate"></i>
          <strong>设备可自助解绑</strong>
          <small>换机或系统大版本升级后，可在账号中心自助解绑，每份授权独立冷却。</small>
        </li>
        <li class="hb-trust__item" data-tone="lumen">
          <i class="fa-duotone fa-regular fa-receipt"></i>
          <strong>订单与授权可查</strong>
          <small>历史订单、激活码、绑定设备与积分流水在账号中心随时可查。</small>
        </li>
      </ul>
    </section>

    <section class="hb-section hb-container" aria-labelledby="home-cta-title">
      <div class="hb-cta" data-tone="accent">
        <div class="hb-cta__copy">
          <span class="hb-kicker hb-kicker--plain">Ready</span>
          <h2 id="home-cta-title">准备好接管全屋了吗？</h2>
          <p>选一个授权版本，支付确认后即可在账号中心拿到激活码。</p>
        </div>
        <div class="hb-cta__actions">
          <RouterLink class="hb-button hb-button--primary hb-button--lg" to="/products">
            查看授权版本 <i class="fa-duotone fa-regular fa-arrow-right"></i>
          </RouterLink>
          <RouterLink
            v-if="!authenticated"
            class="hb-button hb-button--secondary hb-button--lg"
            to="/user/authentication/register"
          >
            注册账号
          </RouterLink>
          <RouterLink
            v-else
            class="hb-button hb-button--secondary hb-button--lg"
            to="/user/dashboard/index"
          >
            账号中心
          </RouterLink>
          <a v-if="supportEmail" class="hb-cta__mail" :href="`mailto:${supportEmail}`">
            客服 {{ supportEmail }}
          </a>
        </div>
      </div>
    </section>

    <section class="hb-section hb-container hb-section--last" aria-labelledby="home-faq-title">
      <div class="hb-section-head">
        <span class="hb-kicker hb-kicker--plain">FAQ</span>
        <h2 id="home-faq-title">常见问题</h2>
      </div>
      <div class="hb-faq">
        <details class="hb-faq__item" open>
          <summary>需要一台公网服务器吗？</summary>
          <div class="hb-faq__body">
            <p>
              不需要。HomeOS 默认跑在自己的电脑或 NAS 上，数据落在本机；授权校验是唯一需要联网的环节，客户端会定期心跳续租。
            </p>
          </div>
        </details>
        <details class="hb-faq__item">
          <summary>已经装了 Home Assistant，还要重新配一遍吗？</summary>
          <div class="hb-faq__body">
            <p>
              不用。填入 HA 地址与长期令牌后，HomeOS 会通过 HTTP 与 WebSocket 把实体和状态同步过来，已有的自动化与设备保持原样。
            </p>
          </div>
        </details>
        <details class="hb-faq__item">
          <summary>墙屏 / 平板还要单独配对吗？</summary>
          <div class="hb-faq__body">
            <p>
              不需要。中控展示页与编辑器共用同一登录会话，在展示设备上登录同一账号即可使用，已不再使用 6 位配对码。
            </p>
          </div>
        </details>
        <details class="hb-faq__item">
          <summary>全功能版包含哪些模块？</summary>
          <div class="hb-faq__body">
            <p>
              全功能版 = 基础能力 + 全部增量模块：3D 交互、安防监控、通知中心、地震预警、能耗管理、场景模式、语音助手、AI 助手。若你只需其中几项，也可以先买基础版，再单独加购对应增量包。
            </p>
          </div>
        </details>
        <details class="hb-faq__item">
          <summary>一台授权能绑几台设备？换设备怎么办？</summary>
          <div class="hb-faq__body">
            <p>
              每份授权对应一个激活码，按本机硬件指纹一对一绑定，设备会列在账号中心。换设备时可在线自助解绑；解绑后原设备下次心跳即转吊销，冷却期内不能重新绑定。系统大版本升级后若提示「硬件绑定不匹配」，同样先在账号中心解绑，再回 HomeOS 用原激活码重新激活。
            </p>
          </div>
        </details>
        <details class="hb-faq__item">
          <summary>买了基础版，之后想升级可以吗？</summary>
          <div class="hb-faq__body">
            <p>
              可以。增量包会直接挂到已有的永久主授权上，不需要重新购买基础版，也不影响原授权的有效期。
            </p>
          </div>
        </details>
        <details class="hb-faq__item">
          <summary>支付成功后没看到激活码？</summary>
          <div class="hb-faq__body">
            <p>
              先在账号中心的订单里确认状态：已完成的订单会直接展示激活码。若状态仍为待付款，可能是支付结果还没回调，稍等片刻刷新即可；超过一段时间仍未到账，请带上订单号联系客服
              <template v-if="supportEmail">（{{ supportEmail }}）</template>。
            </p>
          </div>
        </details>
        <details class="hb-faq__item">
          <summary>优惠码怎么用？</summary>
          <div class="hb-faq__body">
            <p>
              在结算页填写优惠码后点校验，折扣会立即体现在应付金额上；每个优惠码的适用范围和限用次数由运营配置，校验通过才会计入订单。
            </p>
          </div>
        </details>
      </div>
    </section>
  </main>
</template>
