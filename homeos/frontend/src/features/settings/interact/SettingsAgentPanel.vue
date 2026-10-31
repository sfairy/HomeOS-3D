<!--
  智能管家面板入口。通过子导航切换 model（大模型接口配置+凭据+检测）、
  scene-voice（HA 场景 / 脚本语音控制允许清单，默认全禁）、device-scope（设备白名单）、
  proactive（周期巡检 + 无人空转看门狗）、policies（家规）、schedules（计划任务）、
  channels（消息通道，委托给 SettingsAgentChannelsSection）、chat（管家对话调试）区段。
  页头提供保存/取消；演示模式（未配置密钥）禁用对话并提示。
  家规与计划任务走独立即时 CRUD，不进布局保存，因此不参与 pending 计算。
  子导航 10 个分区单行横滑，激活项自动居中，← / → / Home / End 可切换；
  当前分区写入 ?tab=agent&section=xxx，刷新或分享链接可直达，切区段时内容区回到顶部。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="agent"
    icon-key="sparkles"
    accent="var(--hos-color-accent)"
    page-class="agent-hub"
    body-class="agent-hub__body"
    layout="single"
  >
    <template #actions>
      <SettingsPendingSaveAction
        :pending="pending"
        :saving="saving"
        pending-label="智能管家配置未保存"
        save-text="保存配置"
        saving-text="保存中…"
        @save="saveConfig"
        @cancel="resetDraft"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav
        v-model="section"
        :sections="subnavSections"
        nav-class="agent-hub-subnav"
        aria-label="智能管家设置分区"
        scrollable
      />
    </template>

    <p
      v-if="saveTip"
      :class="['agent-save-tip', saveTipOk ? 'agent-save-tip--ok' : 'agent-save-tip--err']"
    >
      {{ saveTip }}
    </p>

    <div
      v-if="isMockProvider"
      class="agent-mock-banner"
      role="status"
    >
      <AlertTriangle class="agent-mock-banner__icon" />
      <div class="agent-mock-banner__body">
        <p class="agent-mock-banner__title">{{ '未配置接口密钥，当前为演示模式' }}</p>
        <p class="agent-mock-banner__text">{{
          '演示模式已禁用对话，避免误以为模拟回复即真实控家。请在「模型配置」填写有效接口密钥并保存，再点「检测状态」确认就绪。'
        }}</p>
        <button type="button" class="settings-btn-accent mt-3" @click="goConfigureApiKey">
          {{ '去配置接口密钥' }}
        </button>
      </div>
    </div>

    <section v-show="section === 'model'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-workspace">
        <div class="agent-model-head">
          <SettingsCardIntro
            :icon="Sparkles"
            icon-class="agent-icon--model"
            orb-class="agent-orb--model"
            eyebrow="连接"
            title="大模型接口"
            :description="'配置 OpenAI 兼容接口（DeepSeek / 豆包 / 通义等）。未填接口密钥时使用演示模式，仅验证快路径与工具流程。'"
          />
        </div>

        <div class="agent-model-body">
          <div class="agent-workbench">
            <div class="agent-workbench__main">
              <SettingsSectionHead
                title="接口参数"
                eyebrow="端点"
                description="选择提供商预设并填写 OpenAI 兼容端点"
                bordered
              />

          <div class="settings-form-grid settings-form-grid--2 agent-form-block">
            <div>
              <label class="settings-form-label mb-1.5">提供商预设</label>
              <HosSelect
                v-model="agentDraft.provider"
                variant="settings"
                block
                :searchable="false"
                @change="applyPreset"
              >
                <option v-for="p in providerPresets" :key="p.id" :value="p.id">{{ p.label }}</option>
              </HosSelect>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">语言</label>
              <HosSelect v-model="agentDraft.language" variant="settings" block :searchable="false">
                <option value="zh">中文</option>
                <option value="en">English</option>
              </HosSelect>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">接口地址</label>
              <input
                v-model="agentDraft.apiBase"
                class="settings-field"
                type="url"
                placeholder="https://api.deepseek.com"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">模型</label>
              <input
                v-model="agentDraft.model"
                class="settings-field"
                type="text"
                placeholder="deepseek-v4-flash"
              />
            </div>
          </div>

          <SettingsSectionHead
            title="凭据与提示"
            eyebrow="高级"
            description="接口密钥留空时回退到环境变量或演示模式"
            bordered
            class="agent-section-gap"
          />

          <div class="agent-cred-grid">
            <div id="agent-api-key" class="agent-cred-panel">
              <header class="agent-cred-panel__head">
                <div class="agent-cred-panel__icon">
                  <KeyRound class="w-4 h-4" />
                </div>
                <div class="min-w-0">
                  <h4 class="agent-cred-panel__title">接口密钥</h4>
                  <p class="agent-cred-panel__desc">访问令牌，保存后立即生效；刷新后不回显明文</p>
                </div>
              </header>
              <div v-if="apiKeyLocked" class="agent-secret-secure">
                <div class="agent-secret-secure__shield">
                  <ShieldCheck class="w-4 h-4" />
                </div>
                <div class="agent-secret-secure__body">
                  <div class="agent-secret-secure__row">
                    <span class="agent-secret-secure__label">密钥已加密存储</span>
                    <span class="agent-secret-secure__badge">已就绪</span>
                  </div>
                  <p class="agent-secret-secure__hint">
                    接口不会回传明文；保存与调用时自动使用，无需再次粘贴
                  </p>
                </div>
                <button type="button" class="agent-secret-secure__edit" @click="beginEditApiKey">
                  <Pencil class="w-3.5 h-3.5" />
                  <span>更换</span>
                </button>
              </div>
              <div v-else class="agent-secret-field">
                <input
                  v-model="agentDraft.apiKey"
                  class="settings-field agent-cred-input"
                  :type="showApiKey ? 'text' : 'password'"
                  autocomplete="off"
                  placeholder="留空则沿用已保存的密钥（更换请粘贴新密钥）"
                />
                <button
                  type="button"
                  class="agent-secret-field__toggle"
                  :aria-label="showApiKey ? '隐藏接口密钥' : '显示接口密钥'"
                  :aria-pressed="showApiKey"
                  @click="showApiKey = !showApiKey"
                >
                  <Eye v-if="!showApiKey" class="w-4 h-4" />
                  <EyeOff v-else class="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="agent-cred-panel agent-cred-panel--prompt">
              <header class="agent-cred-panel__head">
                <div class="agent-cred-panel__icon">
                  <FileText class="w-4 h-4" />
                </div>
                <div class="min-w-0">
                  <h4 class="agent-cred-panel__title">自定义系统提示</h4>
                  <p class="agent-cred-panel__desc">追加到内置管家规则之后</p>
                </div>
              </header>
              <textarea
                v-model="agentDraft.systemPrompt"
                class="settings-field agent-textarea agent-cred-textarea"
                rows="3"
                placeholder="回复时带上当前家庭模式提醒（可选）"
              />
            </div>
          </div>

          <label
            class="agent-scene-toggle agent-section-gap"
            :class="{ 'agent-scene-toggle--on': webSearchEnabled }"
          >
            <input v-model="webSearchEnabled" type="checkbox" class="settings-checkbox" />
            <div>
              <span class="agent-scene-toggle__title">{{ '允许联网搜索' }}</span>
              <span class="agent-scene-toggle__desc">{{
                '实时天气、新闻、常识问答可检索公开网页；关闭后搜索工具直接拒绝，仍可回答本地知识。仅访问 Https 白名单域名，内网地址一律拒绝。'
              }}</span>
            </div>
          </label>
            </div>

            <aside class="agent-workbench__rail">
              <div class="agent-rail-card">
                <header class="agent-rail-card__head">
                  <span class="agent-rail-card__icon">
                    <Gauge />
                  </span>
                  <span class="agent-rail-card__eyebrow">连接状态</span>
                  <span
                    class="agent-rail-chip"
                    :class="`agent-rail-chip--${toneFromAgentClass(modelStatReadyClass)}`"
                  >
                    {{ modelStatReadyLabel }}
                  </span>
                </header>
                <p class="agent-rail-card__title">{{ modelStatProvider }}</p>

                <dl class="agent-rail-kv">
                  <div class="agent-rail-kv__row">
                    <dt>模型</dt>
                    <dd>{{ agentDraft.model || '—' }}</dd>
                  </div>
                  <div class="agent-rail-kv__row">
                    <dt>接口</dt>
                    <dd class="agent-rail-kv__ellipsis" :title="agentDraft.apiBase">
                      {{ agentDraft.apiBase || '—' }}
                    </dd>
                  </div>
                  <div class="agent-rail-kv__row">
                    <dt>今日</dt>
                    <dd>{{ usageTodayLabel || '暂无调用' }}</dd>
                  </div>
                </dl>

                <div v-if="modelUsagePercent !== null" class="agent-rail-meter">
                  <div class="agent-rail-meter__track">
                    <span class="agent-rail-meter__fill" :style="{ width: `${modelUsagePercent}%` }" />
                  </div>
                  <span class="agent-rail-meter__label">额度 {{ modelUsagePercent }}%</span>
                </div>

                <p v-if="pending > 0" class="agent-rail-note agent-rail-note--warn">
                  有未保存修改，「当前生效」仍是上次已保存配置。
                </p>
                <p v-else-if="modelStatDetail" class="agent-rail-note">{{ modelStatDetail }}</p>

                <button type="button" class="agent-rail-cta" :disabled="pinging" @click="refreshPing">
                  <RefreshCw class="w-3.5 h-3.5" :class="{ 'agent-rail-cta__spin': pinging }" />
                  <span>{{ pinging ? '检测中…' : '检测状态' }}</span>
                </button>
              </div>

              <div class="agent-rail-card">
                <p class="agent-rail-card__eyebrow">流程概览</p>
                <ol class="agent-rail-steps">
                  <li v-for="(step, index) in modelFlowSteps" :key="step.label">
                    <span class="agent-rail-steps__dot">{{ index + 1 }}</span>
                    <span class="agent-rail-steps__body">
                      <span class="agent-rail-steps__label">{{ step.label }}</span>
                      <span class="agent-rail-steps__meta">{{ step.meta }}</span>
                    </span>
                  </li>
                </ol>
              </div>

              <div class="agent-rail-card">
                <p class="agent-rail-card__eyebrow">联动</p>
                <p class="agent-rail-text">
                  房间温湿度快查询会回退到「环境与健康」传感器映射。请先绑定实体，并确保 HA 区域已关联。
                </p>
                <RouterLink class="agent-rail-link" :to="envHealthHref">
                  打开环境与健康
                  <ArrowUpRight class="w-3.5 h-3.5" />
                </RouterLink>
              </div>
            </aside>
          </div>
        </div>
      </SettingsCard>
    </section>

    <section v-show="section === 'scene-voice'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-scene-voice-workspace">
        <SettingsCardIntro
          :icon="ShieldAlert"
          icon-class="agent-icon--model"
          orb-class="agent-orb--model"
          eyebrow="安全"
          title="场景语音控制"
          :description="'Home Assistant 的场景 / 脚本内部动作无法静态审计，默认一律拒绝语音触发；仅在此显式放行。'"
        />

        <div class="agent-model-body">
          <div class="agent-workbench">
            <div class="agent-workbench__main">
              <SettingsSectionHead
                title="语音可执行清单"
                eyebrow="放行范围"
                description="未勾选的场景 / 脚本仍会被拦截，语音触发时直接拒绝并提示"
                bordered
              />

              <label
                class="agent-scene-toggle"
                :class="{ 'agent-scene-toggle--on': sceneVoiceEnabled }"
              >
                <input v-model="sceneVoiceEnabled" type="checkbox" class="settings-checkbox" />
                <div>
                  <span class="agent-scene-toggle__title">{{ '启用场景语音控制' }}</span>
                  <span class="agent-scene-toggle__desc">{{
                    '关闭时所有场景 / 脚本均不可通过语音或管家触发'
                  }}</span>
                </div>
              </label>

              <div class="agent-field-block agent-form-block">
                <label class="settings-form-label">允许语音触发的场景 / 脚本</label>
                <EntityMultiSelect
                  v-model="sceneVoiceAllow"
                  :allowed-domains="['scene', 'script']"
                  :placeholder="sceneVoiceEnabled ? '搜索并勾选场景或脚本…' : '请先启用左侧开关'"
                  :max-selection="50"
                />
                <p class="agent-band-hint">清单内走快路径直接执行（约 300ms），二次指令走缓存更快。</p>
              </div>
            </div>

            <aside class="agent-workbench__rail">
              <div class="agent-rail-card">
                <header class="agent-rail-card__head">
                  <span class="agent-rail-card__icon agent-rail-card__icon--warn">
                    <ShieldAlert />
                  </span>
                  <span class="agent-rail-card__eyebrow">为什么默认全禁</span>
                </header>
                <p class="agent-rail-text">
                  scene.* / script.* 内部可能包含撤防、开阀、开门等危险联动，无法静态审计，因此只有清单内的才会放行。
                </p>
              </div>

              <div class="agent-rail-card">
                <p class="agent-rail-card__eyebrow">当前清单</p>
                <p class="agent-rail-metric">
                  {{ sceneVoiceAllowCount }}<span>个场景 / 脚本</span>
                </p>
                <p class="agent-rail-text">
                  {{
                    sceneVoiceEnabled
                      ? '已启用；清单外的触发会被直接拒绝并提示。'
                      : '总开关关闭中；即使清单里有条目也不会执行。'
                  }}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </SettingsCard>
    </section>

    <section v-show="section === 'device-scope'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-scene-voice-workspace">
        <SettingsCardIntro
          :icon="ShieldCheck"
          icon-class="agent-icon--model"
          orb-class="agent-orb--model"
          eyebrow="最小权限"
          title="Agent 设备白名单"
          :description="'限制智能管家能读取与控制的设备；留空表示不额外限制（仍受登录用户自身 ACL 约束）。'"
        />

        <div class="agent-model-body">
          <div class="agent-workbench">
            <div class="agent-workbench__main">
              <SettingsSectionHead
                title="允许管家访问的设备"
                eyebrow="白名单"
                description="与登录用户 ACL 取交集：只会缩小权限，绝不会放大"
                bordered
              />

              <div class="agent-field-block agent-form-block">
                <EntityMultiSelect
                  v-model="deviceAllowlist"
                  :allowed-domains="[]"
                  placeholder="搜索并勾选设备；留空 = 不额外限制"
                  :max-selection="200"
                />
                <p class="agent-band-hint">
                  {{
                    deviceAllowlistCount
                      ? '清单外的实体在工具读取与控制时都会被拒绝。'
                      : '当前不额外限制，管家可访问登录用户全部可见设备。'
                  }}
                </p>
              </div>
            </div>

            <aside class="agent-workbench__rail">
              <div class="agent-rail-card">
                <header class="agent-rail-card__head">
                  <span class="agent-rail-card__icon">
                    <ShieldCheck />
                  </span>
                  <span class="agent-rail-card__eyebrow">当前范围</span>
                </header>
                <p class="agent-rail-metric">
                  {{ deviceAllowlistCount }}<span>台设备</span>
                </p>
                <p class="agent-rail-text">
                  {{
                    deviceAllowlistCount
                      ? '清单外的设备不会被写入系统提示，也无法被工具控制。'
                      : '未设限：管家与登录用户可见范围一致。'
                  }}
                </p>
              </div>

              <div class="agent-rail-card">
                <p class="agent-rail-card__eyebrow">规则</p>
                <ul class="agent-rail-list">
                  <li>与 ACL 取交集，只会更小，不会更大</li>
                  <li>清单同时约束「读取」与「控制」</li>
                  <li>改动需保存配置后生效</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </SettingsCard>
    </section>

    <section v-show="section === 'companion'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-scene-voice-workspace">
        <SettingsCardIntro
          :icon="Bot"
          icon-class="agent-icon--model"
          orb-class="agent-orb--model"
          eyebrow="仪表盘入口"
          title="悬浮伴侣"
          :description="'机甲小管家入口：单击换灵感指令、长按直接说话、双击开对话视窗，按住可拖到画面任意位置。关闭只是收起入口，不影响巡检与家规。'"
        />

        <div class="agent-model-body">
          <div class="agent-workbench">
            <div class="agent-workbench__main">
              <SettingsSectionHead
                title="显示与位置"
                eyebrow="停靠"
                description="改动需保存配置；在仪表盘上拖动会自动保存"
                bordered
              />

              <label
                class="agent-scene-toggle"
                :class="{ 'agent-scene-toggle--on': agentDraft.companion?.enabled !== false }"
              >
                <input v-model="companionEnabled" type="checkbox" class="settings-checkbox" />
                <div>
                  <span class="agent-scene-toggle__title">{{ '启用悬浮伴侣' }}</span>
                  <span class="agent-scene-toggle__desc">{{
                    '只在仪表盘显示；对话面板打开时自动收起'
                  }}</span>
                </div>
              </label>

              <div class="settings-form-grid settings-form-grid--2 agent-form-block">
                <div>
                  <label class="settings-form-label">
                    水平位置（{{ companionXPercent }}%）
                  </label>
                  <input
                    v-model.number="companionXPercent"
                    class="agent-range"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :disabled="agentDraft.companion?.enabled === false"
                  />
                  <p class="agent-band-hint">0% 贴左、100% 贴右</p>
                </div>
                <div>
                  <label class="settings-form-label">
                    垂直位置（{{ companionYPercent }}%）
                  </label>
                  <input
                    v-model.number="companionYPercent"
                    class="agent-range"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :disabled="agentDraft.companion?.enabled === false"
                  />
                  <p class="agent-band-hint">0% 贴顶、100% 贴底</p>
                </div>
              </div>

              <div class="agent-companion-position-actions">
                <p class="agent-band-hint">
                  {{
                    companionPositionCustomized
                      ? '当前为自定义摆放位置；在仪表盘上按住图标拖动可继续调整。'
                      : '也可以直接在仪表盘上按住图标拖到任意位置，松手自动保存。'
                  }}
                </p>
                <button
                  type="button"
                  class="settings-btn-ghost shrink-0"
                  :disabled="
                    agentDraft.companion?.enabled === false || !companionPositionCustomized
                  "
                  @click="resetCompanionPosition"
                >
                  恢复默认停靠
                </button>
              </div>
            </div>

            <aside class="agent-workbench__rail">
              <div
                class="agent-rail-card agent-dock-preview"
                :class="{ 'agent-dock-preview--off': agentDraft.companion?.enabled === false }"
                aria-hidden="true"
              >
                <header class="agent-dock-preview__head">
                  <span class="agent-rail-card__eyebrow">位置预览</span>
                  <span class="agent-dock-preview__meta">
                    {{ companionXPercent }}% · {{ companionYPercent }}%
                  </span>
                </header>
                <div class="agent-dock-preview__screen">
                  <span class="agent-dock-preview__stage">仪表盘</span>
                  <span
                    class="agent-dock-preview__avatar"
                    :style="{
                      '--dock-x': companionXPercent,
                      '--dock-y': companionYPercent,
                    }"
                  >
                    <AgentMechaAvatar mode="sleep" :is-active="false" />
                  </span>
                </div>
                <p class="agent-dock-preview__hint">
                  {{
                    agentDraft.companion?.enabled === false
                      ? '已收起：仪表盘不会出现入口'
                      : companionPositionCustomized
                        ? '松手即保存；窗口缩放后按百分比保持相对位置'
                        : '默认停靠；也可以拖到画面任意位置'
                  }}
                </p>
              </div>

              <div class="agent-rail-card">
                <p class="agent-rail-card__eyebrow">手势</p>
                <ul class="agent-rail-list">
                  <li>短按：打开管家对话面板</li>
                  <li>按住拖动：摆放位置，松手即保存</li>
                  <li>按住不动约 0.35 秒：进入语音输入</li>
                  <li>语音走「设置 → 语音」的识别引擎</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </SettingsCard>
    </section>

    <section v-show="section === 'proactive'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-scene-voice-workspace">
        <SettingsCardIntro
          :icon="BellRing"
          icon-class="agent-icon--model"
          orb-class="agent-orb--model"
          eyebrow="主动管家"
          :description="'按周期巡检设备离线、能耗异常、离家未关门窗 / 未上锁与即将降雨，通过通知中心（含 WebPush / 企微）发送简报。默认关闭；只读取状态，不执行任何控制动作。'"
        />

        <div class="agent-model-body">
          <div class="agent-split">
            <div class="agent-split__main">
          <SettingsSectionHead
            title="巡检与频控"
            eyebrow="通知"
            description="免打扰时段内不发送；同一设备 / 同一异常不会反复提醒"
            bordered
          />

          <label
            class="agent-scene-toggle"
            :class="{ 'agent-scene-toggle--on': proactive.enabled }"
          >
            <input v-model="proactive.enabled" type="checkbox" class="settings-checkbox" />
            <div>
              <span class="agent-scene-toggle__title">{{ '启用主动管家提醒' }}</span>
              <span class="agent-scene-toggle__desc">{{
                '关闭时后台仍登记任务，但不会读取数据或推送通知'
              }}</span>
            </div>
          </label>

          <div class="settings-form-grid settings-form-grid--2 agent-form-block">
            <div>
              <label class="settings-form-label mb-1.5">巡检周期（分钟）</label>
              <input
                :value="Math.round(proactive.intervalSeconds / 60)"
                class="settings-field"
                type="number"
                min="1"
                max="1440"
                :disabled="!proactive.enabled"
                @input="setProactiveMinutes('intervalSeconds', $event)"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">最小提醒间隔（分钟）</label>
              <input
                :value="Math.round(proactive.cooldownSeconds / 60)"
                class="settings-field"
                type="number"
                min="1"
                max="1440"
                :disabled="!proactive.enabled"
                @input="setProactiveMinutes('cooldownSeconds', $event)"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">免打扰开始（点）</label>
              <input
                v-model.number="proactive.quietStart"
                class="settings-field"
                type="number"
                min="0"
                max="23"
                :disabled="!proactive.enabled"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">免打扰结束（点）</label>
              <input
                v-model.number="proactive.quietEnd"
                class="settings-field"
                type="number"
                min="0"
                max="23"
                :disabled="!proactive.enabled"
              />
            </div>
            <div>
              <label class="settings-form-label mb-1.5">用电异常倍数</label>
              <input
                v-model.number="proactive.energyMultiplier"
                class="settings-field"
                type="number"
                min="1"
                step="0.1"
                :disabled="!proactive.enabled"
              />
              <p class="agent-band-hint mt-2">今日用电超过前几日均值的该倍数时提醒</p>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">降雨提醒阈值（%）</label>
              <input
                :value="Math.round(proactive.forecastPopThreshold * 100)"
                class="settings-field"
                type="number"
                min="0"
                max="100"
                :disabled="!proactive.enabled"
                @input="setProactivePercent($event)"
              />
              <p class="agent-band-hint mt-2">预报时段降水概率超过该值时提醒带伞</p>
            </div>
          </div>

          </div>

            <div class="agent-split__side">
          <SettingsSectionHead
            title="无人空转看门狗"
            eyebrow="节能"
            description="房间持续无人、设备却一直开着时提醒；默认只提醒不动设备"
            bordered
            class="agent-section-gap"
          />

          <label
            class="agent-scene-toggle"
            :class="{ 'agent-scene-toggle--on': proactive.watchdogEnabled }"
          >
            <input v-model="proactive.watchdogEnabled" type="checkbox" class="settings-checkbox" />
            <div>
              <span class="agent-scene-toggle__title">{{ '启用无人空转巡检' }}</span>
              <span class="agent-scene-toggle__desc">{{
                '优先用毫米波人体存在判断房间是否有人；没有人体存在传感器时回退到运动传感器'
              }}</span>
            </div>
          </label>

          <div class="settings-form-grid settings-form-grid--2 agent-form-block">
            <div>
              <label class="settings-form-label mb-1.5">无人多少分钟后算离开</label>
              <input
                v-model.number="proactive.motionIdleMinutes"
                class="settings-field"
                type="number"
                min="1"
                max="1440"
                :disabled="!proactive.watchdogEnabled"
              />
              <p class="agent-band-hint mt-2">太短会误判（人坐着不动也会没触发）</p>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">设备空转阈值（分钟）</label>
              <input
                v-model.number="proactive.idleDeviceMinutes"
                class="settings-field"
                type="number"
                min="1"
                max="1440"
                :disabled="!proactive.watchdogEnabled"
              />
              <p class="agent-band-hint mt-2">灯 / 风扇 / 空调开启超过该时长视为浪费</p>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">开关类常开阈值（分钟）</label>
              <input
                v-model.number="proactive.idleSwitchMinutes"
                class="settings-field"
                type="number"
                min="1"
                max="1440"
                :disabled="!proactive.watchdogEnabled"
              />
              <p class="agent-band-hint mt-2">开关类不像灯那样显眼，阈值建议更长</p>
            </div>
            <div>
              <label class="settings-form-label mb-1.5">单次最多自动关停</label>
              <input
                v-model.number="proactive.maxAutoCloseDevices"
                class="settings-field"
                type="number"
                min="1"
                max="20"
                :disabled="!proactive.watchdogEnabled || !proactive.autoCloseEnabled"
              />
              <p class="agent-band-hint mt-2">只关低危设备域，门锁 / 安防 / 燃气 / 窗帘永不自动操作</p>
            </div>
          </div>

          <label
            class="agent-scene-toggle"
            :class="{ 'agent-scene-toggle--on': proactive.autoCloseEnabled }"
          >
            <input
              v-model="proactive.autoCloseEnabled"
              type="checkbox"
              class="settings-checkbox"
              :disabled="!proactive.watchdogEnabled"
            />
            <div>
              <span class="agent-scene-toggle__title">{{ '命中家规时自动关停' }}</span>
              <span class="agent-scene-toggle__desc">{{
                '还需在「家规」里勾选该规则自动关停；默认关闭，只发送提醒'
              }}</span>
            </div>
          </label>
            </div>
          </div>
        </div>
      </SettingsCard>
    </section>

    <SettingsAgentPoliciesSection
      v-if="activatedSections.has('policies')"
      v-show="section === 'policies'"
    />

    <SettingsAgentSchedulesSection
      v-if="activatedSections.has('schedules')"
      v-show="section === 'schedules'"
    />

    <SettingsAgentDiagnosticsSection
      v-if="activatedSections.has('diagnostics')"
      v-show="section === 'diagnostics'"
    />

    <SettingsAgentChannelsSection
      v-show="section === 'channels'"
      v-model:channel-draft="channelDraft"
      v-model:agent-draft="agentDraft"
      :channel-status="channelStatus"
      :status-loading="statusLoading"
      :pending="pending"
      @refresh-status="refreshChannelStatus"
    />

    <section v-show="section === 'chat'" class="settings-hub-section">
      <SettingsCard static extra-class="agent-chat-workspace">
        <div class="agent-chat-head">
          <SettingsCardIntro
            :icon="MessageCircle"
            icon-class="agent-icon--chat"
            orb-class="agent-orb--chat"
            eyebrow="对话"
            :description="'完整链路：命令缓存 → 温湿度快查询 → 快路径 → LLM → 工具执行。仪表板与智能管家悬浮层也可直接对话。'"
          >
            <template #actions>
              <button
                v-if="chatLog.length"
                type="button"
                class="settings-btn-ghost shrink-0"
                @click="chatLog = []"
              >
                清空记录
              </button>
            </template>
          </SettingsCardIntro>
        </div>

        <SettingsFlowBand
          :steps="chatFlowSteps"
          class="agent-chat-band"
          collapsible
          default-collapsed
          toggle-label="流程概览"
          :collapsed-summary="chatFlowSummary"
        >
          <template #stats>
            <SettingsFlowStat
              label="模型状态"
              :value="chatStatReadyLabel"
              :tone="toneFromAgentClass(chatStatReadyClass)"
              :val-tone="toneFromAgentClass(chatStatReadyValClass)"
            />
            <SettingsFlowStat
              label="对话轮次"
              :value="chatStatRoundLabel"
              tone="violet"
              val-tone="violet"
            />
          </template>
        </SettingsFlowBand>

        <div class="agent-chat-body">
          <SettingsSectionHead
            title="管家对话"
            eyebrow="调试"
            description="支持连续追问，验证多轮上下文与工具调用。仪表板与智能管家悬浮层也可直接对话。"
            bordered
          />

          <div ref="chatLogEl" class="agent-chat-log agent-form-block" aria-live="polite">
            <article
              v-for="(m, i) in chatLog"
              :key="i"
              :class="['agent-chat-bubble', `agent-chat-bubble--${m.role}`]"
            >
              <div
                class="agent-chat-bubble__avatar"
                :class="m.role === 'user' ? 'agent-chat-bubble__avatar--user' : 'agent-chat-bubble__avatar--bot'"
              >
                <User v-if="m.role === 'user'" class="w-3.5 h-3.5" />
                <Sparkles v-else class="w-3.5 h-3.5" />
              </div>
              <div class="agent-chat-bubble__main">
                <header class="agent-chat-bubble__head">
                  <span class="agent-chat-bubble__name">{{ m.role === 'user' ? '你' : '管家' }}</span>
                  <span
                    v-if="m.outcome"
                    class="agent-chat-bubble__pill"
                    :data-tone="chatOutcomeTone(m.outcome)"
                  >
                    {{ chatOutcomeLabel(m.outcome) }}
                  </span>
                </header>
                <div
                  class="agent-chat-bubble__body"
                  :class="{ 'agent-chat-bubble__body--streaming': m.streaming }"
                >{{ m.text }}</div>
                <footer v-if="m.meta" class="agent-chat-bubble__meta">{{ m.meta }}</footer>
              </div>
            </article>

            <article v-if="showChatTyping" class="agent-chat-bubble agent-chat-bubble--assistant agent-chat-bubble--typing">
              <div class="agent-chat-bubble__avatar agent-chat-bubble__avatar--bot">
                <Sparkles class="w-3.5 h-3.5" />
              </div>
              <div class="agent-chat-bubble__main">
                <header class="agent-chat-bubble__head">
                  <span class="agent-chat-bubble__name">管家</span>
                </header>
                <div class="agent-chat-typing" aria-label="思考中">
                  <span /><span /><span />
                </div>
              </div>
            </article>

            <div v-if="!chatLog.length && !chatting" class="agent-chat-empty">
              <div class="agent-chat-empty__icon">
                <MessageCircle class="w-6 h-6" />
              </div>
              <template v-if="isMockProvider">
                <p class="agent-chat-empty__title">演示模式不可对话</p>
                <p class="agent-chat-empty__desc">
                  请先配置并保存有效接口密钥，确认「连接状态」就绪后再试对话。
                </p>
                <button type="button" class="settings-btn-accent mt-3" @click="goConfigureApiKey">
                  {{ '去配置接口密钥' }}
                </button>
              </template>
              <template v-else>
                <p class="agent-chat-empty__title">开始对话</p>
                <p class="agent-chat-empty__desc">
                  先说「打开客厅灯」，再追问「那把它关掉」，验证多轮理解
                </p>
                <div class="agent-chat-quick">
                  <button
                    v-for="prompt in chatQuickPrompts"
                    :key="prompt"
                    type="button"
                    class="agent-chat-quick__chip"
                    @click="sendQuickPrompt(prompt)"
                  >
                    {{ prompt }}
                  </button>
                </div>
              </template>
            </div>
          </div>

          <div
            v-if="chatLog.length && !isMockProvider"
            class="agent-chat-quick agent-chat-quick--inline agent-form-block"
          >
            <span class="agent-chat-quick__label">快捷指令</span>
            <button
              v-for="prompt in chatQuickPrompts"
              :key="`inline-${prompt}`"
              type="button"
              class="agent-chat-quick__chip"
              :disabled="chatting"
              @click="sendQuickPrompt(prompt)"
            >
              {{ prompt }}
            </button>
          </div>

          <div class="agent-chat-composer">
            <div class="agent-chat-composer__field">
              <MessageSquare class="agent-chat-composer__icon" />
              <input
                v-model="chatInput"
                class="settings-field agent-chat-composer__input"
                type="text"
                :maxlength="AGENT_CHAT_MAX_LENGTH"
                :placeholder="chatPlaceholder"
                :disabled="chatting || isMockProvider"
                @keydown.enter.prevent="sendChat"
              />
            </div>
            <button
              type="button"
              class="agent-chat-composer__mic"
              :class="{ 'agent-chat-composer__mic--on': voiceListening || voiceTranscribing }"
              :disabled="chatting || isMockProvider"
              :aria-label="voiceListening || voiceTranscribing ? '停止语音输入' : '语音输入'"
              :title="voiceListening || voiceTranscribing ? '停止语音输入' : '点按说话，再说完点一次结束'"
              @click="toggleVoiceListen"
            >
              <Mic class="w-4 h-4" :class="{ 'agent-chat-composer__mic-pulse': voiceListening }" />
            </button>
            <button
              type="button"
              class="agent-chat-composer__send"
              :class="{ 'agent-chat-composer__send--stop': chatting }"
              :disabled="!chatting && (isMockProvider || !chatInput.trim())"
              @click="chatting ? stopChat() : sendChat()"
            >
              <Square v-if="chatting" class="w-4 h-4" />
              <Send v-else class="w-4 h-4" />
              <span>{{ chatting ? '停止' : '发送' }}</span>
            </button>
          </div>
          <p v-if="voiceError" class="agent-chat-voice-err">{{ voiceError }}</p>
        </div>
      </SettingsCard>
    </section>
  </SettingsPageShell>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Bot,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  KeyRound,
  MessageCircle,
  MessageSquare,
  Mic,
  Pencil,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  User,
} from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import SettingsHubSubnav from '@/features/settings/shared/layout/SettingsHubSubnav.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import { useSettingsAgentPanel } from '@/features/settings/interact/composables/agent-panel.internals'
import SettingsAgentChannelsSection from './SettingsAgentChannelsSection.vue'
import SettingsAgentPoliciesSection from './SettingsAgentPoliciesSection.vue'
import SettingsAgentSchedulesSection from './SettingsAgentSchedulesSection.vue'
import SettingsAgentDiagnosticsSection from './SettingsAgentDiagnosticsSection.vue'
import AgentMechaAvatar from '@/components/shell/agent-companion/AgentMechaAvatar.vue'
import { useRegisterSettingsTabPending } from '@/composables/settings-kernel/pending.internals'

const props = defineProps({ activeTab: { type: String, default: 'agent' } })

const {
  showApiKey,
  apiKeyLocked,
  beginEditApiKey,
  section,
  subnavSections,
  providerPresets,
  chatQuickPrompts,
  agentDraft,
  channelDraft,
  channelStatus,
  statusLoading,
  refreshChannelStatus,
  pending,
  saving,
  saveTip,
  saveTipOk,
  pinging,
  chatInput,
  chatting,
  AGENT_CHAT_MAX_LENGTH,
  chatLog,
  chatLogEl,
  envHealthHref,
  isMockProvider,
  sceneVoiceEnabled,
  companionEnabled,
  companionXPercent,
  companionYPercent,
  companionPositionCustomized,
  resetCompanionPosition,
  sceneVoiceAllow,
  sceneVoiceAllowCount,
  deviceAllowlist,
  deviceAllowlistCount,
  webSearchEnabled,
  proactive,
  setProactiveMinutes,
  setProactivePercent,
  toneFromAgentClass,
  modelFlowSteps,
  chatFlowSteps,
  modelStatProvider,
  modelStatReadyLabel,
  modelStatReadyClass,
  modelStatDetail,
  usageTodayLabel,
  modelUsagePercent,
  chatStatReadyLabel,
  chatStatReadyClass,
  chatStatReadyValClass,
  chatStatRoundLabel,
  chatOutcomeLabel,
  chatOutcomeTone,
  sendQuickPrompt,
  applyPreset,
  resetDraft,
  saveConfig,
  refreshPing,
  sendChat,
  stopChat,
  voiceListening,
  voiceTranscribing,
  voiceError,
  toggleVoiceListen,
  chatPlaceholder,
} = useSettingsAgentPanel(props)

// 第三个参数 = 静默丢弃草稿：设置页确认「离开」后调用，别让提示变成空话
useRegisterSettingsTabPending('agent', () => pending.value > 0, resetDraft)
/**
 * 已打开过的区段：家规 / 计划任务挂载即请求接口，未访问过就不挂载，
 * 避免每次进入智能管家都白打两个请求；打开后保持挂载以留住表单草稿。
 */
const activatedSections = ref<Set<string>>(new Set(['model']))

const route = useRoute()
const router = useRouter()
const sectionIds = new Set(subnavSections.map((item) => item.id))
/** 深链 / 刷新恢复：?tab=agent&section=companion 直接落在对应子页 */
const querySection = typeof route.query.section === 'string' ? route.query.section : ''
if (sectionIds.has(querySection)) {
  section.value = querySection
  // 惰性挂载的区段（家规 / 计划任务 / 诊断）也要跟着深链一起挂载
  activatedSections.value = new Set([...activatedSections.value, querySection])
}

/** 子导航固定在滚动区外：切区段时把内容拉回顶部，避免停在上一段的滚动位置 */
function resetSectionScroll() {
  const scroller = document.querySelector('.agent-hub .settings-page-inset--scroll')
  if (scroller instanceof HTMLElement) {
    scroller.scrollTo({ top: 0, behavior: 'auto' })
  }
}

watch(section, (value) => {
  if (!activatedSections.value.has(value)) {
    activatedSections.value = new Set(activatedSections.value).add(value)
  }
  void nextTick(resetSectionScroll)
  if (route.query.section !== value) {
    void router.replace({ query: { ...route.query, section: value } })
  }
})

const chatFlowSummary = computed(
  () => `${chatStatReadyLabel.value} · ${chatStatRoundLabel.value}`,
)

/** 等首 token 的阶段才显示「思考中」气泡；已开始逐字输出后由流式气泡本身承载 */
const showChatTyping = computed(
  () => chatting.value && !chatLog.value.some((m) => m.streaming && m.text.trim()),
)

function goConfigureApiKey() {
  section.value = 'model'
  requestAnimationFrame(() => {
    const el = document.getElementById('agent-api-key')
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}
</script>
<style src="./styles/SettingsAgentPanel.css"></style>
