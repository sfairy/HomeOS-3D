<script setup lang="ts">
import { computed, ref } from "vue";
import { useHomeView } from "@store/features/storefront/composables/useHomeView";
import { useStoreToast } from "@store/shared/stores/toast";
import { copyText } from "@store/shared/utils/clipboard";

const { setup, deployCommand, deployLabel, hasDeploy, supportEmail, authenticated, paymentBadges } =
  useHomeView();
const toast = useStoreToast();
const justCopied = ref(false);

/** 第一步的支付方式跟着后台可用渠道走；没有配置时退回中性说法，不编具体渠道。 */
const setupSteps = computed(() =>
  setup.map((step, index) => {
    if (index !== 0 || !paymentBadges.value.length) return step;
    return { ...step, points: [paymentBadges.value.join(" / "), ...step.points.slice(1)] };
  }),
);

const mailto = computed(() => {
  const subject = encodeURIComponent("索取 HomeOS 部署文件");
  return supportEmail.value
    ? `mailto:${supportEmail.value}?subject=${subject}`
    : null;
});

async function copyDeploy() {
  if (!deployCommand.value) return;
  if (!(await copyText(deployCommand.value))) {
    toast.show("复制失败，请手动选中命令行内容。", "err");
    return;
  }
  justCopied.value = true;
  toast.show("部署命令已复制。", "success");
  window.setTimeout(() => (justCopied.value = false), 2200);
}
</script>

<template>
  <section id="home-journey" class="hm-section" aria-labelledby="home-journey-title">
    <div class="hb-container">
      <header class="hm-head" data-tone="eco">
        <span class="hm-head__label">部署</span>
        <div class="hm-head__main">
          <h2 id="home-journey-title">三步交付，授权上墙</h2>
          <p>
            商店负责授权，客户端负责部署与接家；两边可以同时准备，不用等人工审核。全流程一次走完大约十分钟。
          </p>
        </div>
        <span class="hm-head__aside">Docker Compose · 数据落本机</span>
      </header>

      <div class="hm-journey">
        <ol class="hm-setup">
          <li v-for="step in setupSteps" :key="step.index" class="hm-setup__step" :data-tone="step.tone">
            <span class="hm-setup__index hb-mono">{{ step.index }}</span>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
            <ul class="hm-setup__points">
              <li v-for="point in step.points" :key="point">{{ point }}</li>
            </ul>
          </li>
        </ol>

        <div v-if="hasDeploy" class="hm-term" data-tone="cool">
          <div class="hm-term__bar">
            <span class="hm-term__dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <strong>{{ deployLabel }}</strong>
            <small>在目标机器上执行</small>
            <button type="button" class="hb-button hb-button--ghost hb-button--sm" @click="copyDeploy">
              <i
                class="fa-duotone fa-regular"
                :class="justCopied ? 'fa-check' : 'fa-copy'"
                aria-hidden="true"
              ></i>
              {{ justCopied ? "已复制" : "复制命令" }}
            </button>
          </div>
          <pre class="hm-term__cmd"><code>{{ deployCommand }}</code></pre>
        </div>
      </div>

      <div class="hm-setup__foot">
        <RouterLink
          class="hb-button hb-button--primary hb-button--sm"
          :to="authenticated ? '/products' : '/user/authentication/register'"
        >
          {{ authenticated ? "选购授权" : "先注册账号" }}
        </RouterLink>
        <a v-if="mailto" class="hm-setup__link" :href="mailto">拿不到部署文件？向客服索取</a>
        <span v-else-if="!hasDeploy" class="hm-setup__link">
          部署包由客户端提供，购买后可在账号中心获取。
        </span>
      </div>
    </div>
  </section>
</template>
