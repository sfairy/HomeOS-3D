<script setup lang="ts">
import type { SettingsForm } from "./types.js";

defineProps<{ form: SettingsForm }>();
</script>

<template>
  <div class="admin-tab-pane" role="tabpanel" data-tone="accent">
    <label class="hb-field"><span>站点名</span><input v-model="form.siteName" class="hb-input" /></label>
    <label class="hb-field"><span>站点标题</span><input v-model="form.siteTitle" class="hb-input" /></label>
    <label class="hb-field"><span>客服邮箱</span><input v-model="form.supportEmail" class="hb-input" /></label>
    <label class="hb-field">
      <span>品牌标识 URL（留空回落系统默认标识）</span>
      <input v-model="form.logoUrl" class="hb-input is-mono" />
    </label>
    <label class="hb-field admin-grid__wide">
      <span>一键部署脚本地址（账号中心授权卡展示；留空则不显示，无结尾斜杠）</span>
      <input v-model="form.deployBaseUrl" class="hb-input is-mono" placeholder="https://example.com/deploy" />
    </label>
    <label class="hb-field admin-grid__full">
      <span>站点描述</span><input v-model="form.description" class="hb-input" />
    </label>
    <label class="hb-field admin-grid__full">
      <span>公告（前台 toast 展示）</span><input v-model="form.announcement" class="hb-input" />
    </label>
  </div>
</template>
