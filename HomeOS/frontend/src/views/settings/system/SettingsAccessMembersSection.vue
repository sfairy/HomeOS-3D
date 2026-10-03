<!--
组件：SettingsAccessMembersSection.vue
所属模块：frontend / src / views / settings / system
职责：成员管理区段。展示成员列表（头像/用户名/角色），支持角色筛选、新建/编辑/删除成员。
Props：
  - loading / loadError：加载态/错误
  - isAdmin / currentUser：是否管理员与当前用户
  - memberRoleFilter / memberRoleTabs：角色筛选
  - filteredUsers：过滤后成员列表
  - roleMeta / userInitialsOf：角色元数据与头像首字母
Emits：
  - update:memberRoleFilter / create / edit / remove
关键依赖：
  - ApiQueryState：加载态/错误
  - SettingsCard / SettingsCardIntro：卡片容器
数据来源：父级透传的成员列表与操作方法
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard static extra-class="!py-4 !px-5">
      <SettingsCardIntro
        :icon="Users"
        icon-class="am-icon-accent"
        orb-class="am-orb-accent"
        eyebrow="家庭成员"
        :description="'管理 admin / adult / child 账户，并为非管理员配置实体访问前缀。'"
      />
      <div class="access-members-summary mt-4">
        <div class="access-members-summary__item">
          <span class="access-members-summary__val am-text-accent">{{
            memberRoleTabs[0]?.count ?? 0
          }}</span>
          <span class="access-members-summary__lbl">{{ '全部成员' }}</span>
        </div>
        <div class="access-members-summary__item">
          <span class="access-members-summary__val am-text-accent">{{
            memberRoleTabs[1]?.count ?? 0
          }}</span>
          <span class="access-members-summary__lbl">{{ '管理员' }}</span>
        </div>
        <div class="access-members-summary__item">
          <span class="access-members-summary__val am-text-info">{{
            memberRoleTabs[2]?.count ?? 0
          }}</span>
          <span class="access-members-summary__lbl">{{ '成人' }}</span>
        </div>
        <div class="access-members-summary__item">
          <span class="access-members-summary__val am-text-success">{{
            memberRoleTabs[3]?.count ?? 0
          }}</span>
          <span class="access-members-summary__lbl">{{ '儿童' }}</span>
        </div>
      </div>

      <div class="access-role-tabs mt-4 pt-4 border-t border-white/10">
        <button
          v-for="tab in memberRoleTabs"
          :key="tab.id"
          type="button"
          :class="['access-role-tab', memberRoleFilter === tab.id && 'access-role-tab--active']"
          @click="$emit('update:memberRoleFilter', tab.id)"
        >
          {{ tab.label }}
          <span v-if="tab.count != null" class="access-role-tab__count">{{ tab.count }}</span>
        </button>
      </div>
    </SettingsCard>

    <ApiQueryState :loading="loading" :error="loadError" error-title="成员列表加载失败" tone="indigo">
      <div
        v-if="filteredUsers.length === 0"
        class="settings-premium-empty settings-premium-empty--indigo"
      >
        <Users class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">
          {{ memberRoleFilter === 'all' ? '暂无家庭成员' : '该角色下暂无成员' }}
        </p>
        <p class="settings-premium-empty__desc">
          {{ '添加 admin / adult / child 账户，并为非管理员配置实体访问前缀' }}
        </p>
        <div v-if="isAdmin" class="settings-premium-empty__actions">
          <button
            type="button"
            class="settings-premium-empty__btn settings-premium-empty__btn--accent"
            @click="$emit('create')"
          >
            {{ '添加成员' }}
          </button>
        </div>
      </div>

      <div v-else class="access-member-grid">
        <div
          v-for="u in filteredUsers"
          :key="u.id"
          class="access-member-card"
          :class="[
            `access-member-card--${u.role}`,
            u.username === currentUser && 'access-member-card--self',
          ]"
        >
          <div class="access-member-card__avatar" :class="`access-member-card__avatar--${u.role}`">
            {{ userInitialsOf(u.username) }}
          </div>
          <div class="access-member-card__body">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="access-member-card__name">{{ u.username }}</span>
              <span v-if="u.username === currentUser" class="access-member-card__self-tag">{{
                '当前'
              }}</span>
              <span :class="['access-role-badge', `access-role-badge--${u.role}`]">{{
                roleMeta(u.role).label
              }}</span>
            </div>
            <p class="access-member-card__desc">{{ roleMeta(u.role).desc }}</p>
            <div v-if="u.entityRestrictions?.length" class="access-member-card__acl-tags">
              <span
                v-for="(acl, idx) in u.entityRestrictions.slice(0, 3)"
                :key="idx"
                class="access-acl-tag"
                >{{ acl }}</span
              >
              <span
                v-if="u.entityRestrictions.length > 3"
                class="access-acl-tag access-acl-tag--more"
                >+{{ u.entityRestrictions.length - 3 }}</span
              >
            </div>
            <p
              v-else-if="u.role !== 'admin'"
              class="access-member-card__acl access-member-card__acl--open"
            >
              {{ '无实体前缀限制' }}
            </p>
          </div>
          <div v-if="isAdmin" class="access-member-card__actions">
            <button type="button" class="settings-list-btn" @click="$emit('edit', u)">
              {{ '编辑' }}
            </button>
            <button
              v-if="u.username !== currentUser"
              type="button"
              class="settings-list-btn settings-list-btn--danger"
              @click="$emit('remove', u.id)"
            >
              {{ '删除' }}
            </button>
          </div>
        </div>
      </div>
    </ApiQueryState>
  </div>
</template>

<script setup>
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { Users } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
defineProps({
  loading: Boolean,
  loadError: { type: String, default: '' },
  isAdmin: Boolean,
  currentUser: String,
  memberRoleFilter: { type: String, default: 'all' },
  memberRoleTabs: { type: Array, default: () => [] },
  filteredUsers: { type: Array, default: () => [] },
  roleMeta: { type: Function, required: true },
  userInitialsOf: { type: Function, required: true },
})

defineEmits(['update:memberRoleFilter', 'create', 'edit', 'remove'])
</script>

<style src="./styles/settings-access-members-section.css"></style>
