<!--
  组件文件：OrchestratorActionEditor.vue
  所属模块：frontend/src/components/dashboard
  组件职责：联动编排器画布的动作节点编辑器。顶部「+ 添加动作」按钮与空态引导用户追加动作；
    每个动作卡片以 wr-block 形式展示序号、HosSelect 类型下拉（19 种动作：callService/deviceAction/
    delay/notify/scene/script/home_mode/choose/repeat/variables/parallel 等）、失败后继续开关，
    按类型动态加载子面板：变量运算 GeekVarMathPanel、文本拼接 GeekVarConcatPanel、变量函数面板、
    以及调用服务卡（域/服务/实体/参数四步递进式编辑），每种动作都有中文友好预览文案。
  主要 props / emits：
    - props.variant：脚本/自动化变体，自动化额外显示 loop_start/stop；
    - props.allDomains：服务卡的域列表，props.servicesForDomain(domain) 取对应服务，
    - props.homeModes：家庭模式选项，props.sceneOptions/scriptOptions，
    - props.canvasFoldBranches：画布分支折叠态（简化文案与 UI），props.isActionUnsupported：判定不支持类型。
    - emit add：新建动作；emit apply-service-data / sync-service-data / reset-service-data：服务参数回写/同步/清空。
  依赖关系：vue 的 computed/ref/watch + @lucide/vue 图标；HosSelect/GeekVarMathPanel/GeekVarConcatPanel 子组件；
    @homeos/shared 或内部常量 GEEK_ACTION_LABELS 动作标签、friendlyActionDetail 预览函数。
-->
<template>
  <button
    type="button"
    :class="['wr-btn-add', canvasFoldBranches ? 'wr-btn-add--subtle' : 'wr-btn-add--amb']"
    :title="canvasFoldBranches ? '在画布上追加一个动作节点' : '添加动作'"
    @click="$emit('add')"
  >
    {{ canvasFoldBranches ? '+ 添加下一个动作' : '+ 添加动作' }}
  </button>
  <div v-if="!actions.length" class="wr-empty wr-empty--flat" @click="$emit('add')">
    <span>{{ canvasFoldBranches ? '+ 添加动作节点' : '+ 添加动作' }}</span>
  </div>
  <div v-else class="wr-blocks wr-blocks--mt">
    <div
      v-for="(a, i) in actions"
      :key="i"
      :class="[
        'wr-block',
        'wr-block--amb',
        isActionUnsupported?.(a.type) && 'wr-block--unsupported',
      ]"
    >
      <div class="wr-block-head">
        <span>{{ canvasFoldBranches ? '当前动作' : `动作 ${i + 1}` }}</span>
        <div class="wr-block-head-right">
          <HosSelect
            variant="orchestrator"
            size="sm"
            fit
            :unsupported="isActionUnsupported?.(a.type)"
            v-model="a.type"
          >
            <option value="callService">{{ '调用服务' }}</option>
            <option value="deviceAction">{{ 'HA 设备动作' }}</option>
            <option value="delay">{{ '延迟' }}</option>
            <option value="notify">{{ 'HA 通知' }}</option>
            <option value="notify_homeos">{{ 'HomeOS 通知' }}</option>
            <option value="scene">{{ '场景' }}</option>
            <option value="script">{{ '脚本' }}</option>
            <option value="home_mode">{{ '家庭模式' }}</option>
            <option value="trigger_automation">{{ '触发自动化' }}</option>
            <option value="fire_event">{{ '自定义事件' }}</option>
            <option value="wait_for_trigger">{{ '等待触发' }}</option>
            <option value="wait_template">{{ '等待模板' }}</option>
            <option value="choose">{{ '条件分支' }}</option>
            <option value="repeat">{{ '重复' }}</option>
            <option value="variables">{{ '运行时变量' }}</option>
            <option value="variable_set">{{ '持久变量' }}</option>
            <option value="var_math">{{ '变量运算' }}</option>
            <option value="var_concat">{{ '文本拼接' }}</option>
            <option value="var_fn">{{ '变量函数' }}</option>
            <option value="parallel">{{ '并行动作' }}</option>
            <option value="debug">{{ '调试点' }}</option>
            <option value="stop">{{ '停止' }}</option>
            <option v-if="variant === 'automation'" value="loop_start">{{ '启动循环' }}</option>
            <option v-if="variant === 'automation'" value="loop_stop">{{ '停止循环' }}</option>
          </HosSelect>
          <button
            v-if="!canvasFoldBranches"
            type="button"
            class="wr-btn-x"
            :aria-label="'删除动作'"
            @click="actions.splice(i, 1)"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="wr-action-body orch-fields">
        <label class="geek-field">
          <span>{{ '失败后继续' }}</span>
          <HosSelect
            :model-value="a.continueOnError ? '1' : '0'"
            variant="orchestrator"
            size="sm"
            block
            :searchable="false"
            @update:model-value="a.continueOnError = $event === '1'"
          >
            <option value="0">{{ '否' }}</option>
            <option value="1">{{ '是' }}</option>
          </HosSelect>
        </label>

        <template v-if="a.type === 'var_math'">
          <GeekVarMathPanel v-model="actions[i]" />
        </template>
        <template v-else-if="a.type === 'var_concat'">
          <GeekVarConcatPanel v-model="actions[i]" />
        </template>
        <template v-else-if="a.type === 'var_fn'">
          <div class="geek-var-math">
            <div class="geek-var-math__target">
              <label class="geek-var-math__field geek-var-math__field--grow">
                <span>{{ '写入变量' }}</span>
                <input v-model="a.varKey" class="geek-var-math__input" :placeholder="'结果 key'" />
              </label>
              <label class="geek-var-math__field geek-var-math__field--scope">
                <span>{{ '作用域' }}</span>
                <HosSelect variant="orchestrator" size="sm" block v-model="a.varScope">
                  <option value="global">{{ '全局' }}</option>
                  <option value="rule">{{ '本规则' }}</option>
                </HosSelect>
              </label>
            </div>
            <div class="geek-var-math__expr">
              <label class="geek-var-math__field">
                <span>{{ '函数' }}</span>
                <HosSelect variant="orchestrator" size="sm" block v-model="a.fnName">
                  <option value="round">round</option>
                  <option value="floor">floor</option>
                  <option value="ceil">ceil</option>
                  <option value="abs">abs</option>
                  <option value="int">int</option>
                  <option value="float">float</option>
                  <option value="len">len</option>
                  <option value="upper">upper</option>
                  <option value="lower">lower</option>
                </HosSelect>
              </label>
              <div class="geek-var-math__head">
                <span>{{ '参数来源' }}</span>
                <div class="geek-var-math__chips">
                  <button
                    type="button"
                    :class="['geek-var-math__chip', fnArgKind(a) === 'literal' && 'is-on']"
                    @click="setFnArgKind(a, 'literal')"
                  >
                    {{ '数值' }}
                  </button>
                  <button
                    type="button"
                    :class="['geek-var-math__chip', fnArgKind(a) === 'var' && 'is-on']"
                    @click="setFnArgKind(a, 'var')"
                  >
                    {{ '变量' }}
                  </button>
                  <button
                    type="button"
                    :class="['geek-var-math__chip', fnArgKind(a) === 'device' && 'is-on']"
                    @click="setFnArgKind(a, 'device')"
                  >
                    {{ '实体' }}
                  </button>
                </div>
              </div>
              <input
                v-if="fnArgKind(a) === 'literal'"
                v-model="a.fnArg"
                class="geek-var-math__input"
                :placeholder="'参数值'"
              />
              <input
                v-else-if="fnArgKind(a) === 'var'"
                v-model="a.fnArgVar"
                class="geek-var-math__input"
                :placeholder="'变量 key'"
              />
              <template v-else>
                <EntityInput v-model="a.varSourceEntityId" :placeholder="'源实体'" />
                <input
                  v-model="a.varSourceAttribute"
                  class="geek-var-math__input"
                  :placeholder="'属性（空=状态）'"
                />
              </template>
              <p class="geek-var-math__preview">{{ fnPreview(a) }}</p>
            </div>
          </div>
        </template>

        <GeekCfgCard
          v-else
          :title="orchCardTitle(a)"
          accent
          :preview="orchCardPreview(a)"
        >
          <template v-if="a.type === 'callService'">
            <label class="geek-field">
              <span>{{ '域' }}</span>
              <HosSelect
                variant="orchestrator"
                size="sm"
                block
                v-model="a.domain"
                @change="
                  () => {
                    a.service = ''
                    a.entityId = ''
                    a.data = ''
                    $emit('reset-service-data')
                  }
                "
              >
                <option value="">{{ '选择域' }}</option>
                <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
              </HosSelect>
            </label>
            <label class="geek-field">
              <span>{{ '服务' }}</span>
              <HosSelect
                variant="orchestrator"
                size="sm"
                block
                v-model="a.service"
                @change="() => { a.data = '' }"
              >
                <option value="">{{ '选择服务' }}</option>
                <option v-for="s in servicesForDomain(a.domain)" :key="s" :value="s">{{ s }}</option>
              </HosSelect>
            </label>
            <label class="geek-field geek-field--stack">
              <span>{{ '目标实体' }}</span>
              <EntityInput v-model="a.entityId" :placeholder="'目标实体'" :domain-filter="a.domain" />
            </label>
            <OrchestratorServiceDataPanel
              v-if="servicePanel"
              v-model:panel="servicePanel"
              :action="a"
              :show-params-key="showParamsKey"
              :code-placeholder="'可选'"
              @apply="$emit('apply-service-data', a)"
              @sync="$emit('sync-service-data', a)"
            />
          </template>

          <template v-else-if="a.type === 'delay'">
            <label class="geek-field">
              <span>{{ '等待秒数' }}</span>
              <input v-model.number="a.seconds" class="wr-num" type="number" min="0" step="0.1" />
            </label>
          </template>

          <template v-else-if="a.type === 'deviceAction'">
            <p class="orch-card-hint">
              {{ 'HA device_id 动作，本地引擎不执行，请勾选「由 HA 执行」。' }}
            </p>
            <label class="geek-field">
              <span>{{ 'device_id' }}</span>
              <input
                class="wr-num"
                :placeholder="'设备 ID'"
                :value="deviceActionDeviceId(a)"
                @change="(ev) => onDeviceActionDeviceId(a, ev)"
              />
            </label>
            <label class="geek-field">
              <span>{{ 'domain' }}</span>
              <input
                v-model="a.domain"
                class="wr-num"
                :placeholder="'如 light'"
                @change="() => syncDeviceActionData(a)"
              />
            </label>
            <label class="geek-field">
              <span>{{ 'type（动作）' }}</span>
              <input
                v-model="a.service"
                class="wr-num"
                :placeholder="'如 turn_on'"
                @change="() => syncDeviceActionData(a)"
              />
            </label>
            <label class="geek-field geek-field--stack">
              <span>{{ '关联实体（可选）' }}</span>
              <EntityInput
                v-model="a.entityId"
                :placeholder="'可自动填 device_id'"
                @update:model-value="() => onDeviceActionEntity(a)"
              />
            </label>
          </template>

          <template v-else-if="a.type === 'trigger_automation'">
            <label class="geek-field geek-field--stack">
              <span>{{ '自动化' }}</span>
              <EntityInput
                v-model="a.entityId"
                :domain-filter="'automation'"
                :placeholder="'automation.xxx 或 HomeOS UUID'"
              />
            </label>
            <p class="geek-hint">{{ '调用 automation.trigger' }}</p>
          </template>

          <template v-else-if="a.type === 'notify'">
            <label class="geek-field geek-field--stack">
              <span>{{ '通知服务' }}</span>
              <EntityInput
                v-if="variant === 'automation'"
                v-model="a.message"
                :placeholder="'notify.xxx'"
                :domain-filter="'notify'"
              />
              <EntityInput
                v-else
                v-model="a.notifySvc"
                :placeholder="'notify.xxx'"
                :domain-filter="'notify'"
              />
            </label>
            <label class="geek-field">
              <span>{{ '通知文字' }}</span>
              <input v-model="a.notifyMsg" class="wr-num" :placeholder="'要发送的内容'" />
            </label>
          </template>

          <template v-else-if="a.type === 'scene'">
            <label v-if="sceneOptions.length" class="geek-field">
              <span>{{ '本地场景' }}</span>
              <HosSelect variant="orchestrator" size="sm" block v-model="a.sceneId">
                <option value="">{{ '选择…' }}</option>
                <option v-for="s in sceneOptions" :key="s.id" :value="s.id">
                  {{ s.name || s.id }}
                </option>
              </HosSelect>
            </label>
            <label class="geek-field geek-field--stack">
              <span>{{ sceneOptions.length ? '或 HA 场景' : '场景' }}</span>
              <EntityInput
                v-model="a.entityId"
                :domain-filter="'scene'"
                :placeholder="sceneOptions.length ? 'scene.xxx' : '选择场景'"
                @update:model-value="onSceneEntityPicked(a)"
              />
            </label>
            <p v-if="sceneOptions.length" class="geek-hint">
              {{ 'HomeOS 场景 UUID 本地执行；HA 实体 scene.xxx 需已同步' }}
            </p>
          </template>

          <template v-else-if="a.type === 'script'">
            <label v-if="scriptOptions.length" class="geek-field">
              <span>{{ '本地脚本' }}</span>
              <HosSelect variant="orchestrator" size="sm" block v-model="a.scriptId">
                <option value="">{{ '选择…' }}</option>
                <option v-for="s in scriptOptions" :key="s.id" :value="s.id">
                  {{ s.name || s.id }}
                </option>
              </HosSelect>
            </label>
            <label class="geek-field geek-field--stack">
              <span>{{ scriptOptions.length ? '或 HA 脚本' : '脚本' }}</span>
              <EntityInput
                v-model="a.entityId"
                :domain-filter="'script'"
                :placeholder="scriptOptions.length ? 'script.xxx' : '选择脚本'"
                @update:model-value="onScriptEntityPicked(a)"
              />
            </label>
            <p v-if="scriptOptions.length" class="geek-hint">
              {{ 'HomeOS 脚本 UUID 本地执行；HA 实体 script.xxx 需已同步' }}
            </p>
          </template>

          <template v-else-if="a.type === 'home_mode'">
            <label class="geek-field">
              <span>{{ '家庭模式' }}</span>
              <HosSelect variant="orchestrator" size="sm" block v-model="a.modeId">
                <option value="">{{ '选择家庭模式' }}</option>
                <option v-for="m in homeModes" :key="m.id" :value="m.id">{{ m.name }}</option>
              </HosSelect>
            </label>
          </template>

          <template v-else-if="a.type === 'notify_homeos'">
            <label class="geek-field">
              <span>{{ '通知文案' }}</span>
              <input v-model="a.notifyMsg" class="wr-num" :placeholder="'发送到 HomeOS 的文字'" />
            </label>
          </template>

          <template v-else-if="a.type === 'debug'">
            <label class="geek-field">
              <span>{{ '调试消息' }}</span>
              <input v-model="a.notifyMsg" class="wr-num" :placeholder="'调试消息'" />
            </label>
            <p class="geek-hint">{{ '编译为 homeos.geek_debug 事件' }}</p>
          </template>

          <template v-else-if="a.type === 'stop'">
            <label class="geek-field">
              <span>{{ '停止原因（可选）' }}</span>
              <input v-model="a.notifyMsg" class="wr-num" :placeholder="'原因说明'" />
            </label>
            <label class="geek-field">
              <span>{{ '作为错误停止' }}</span>
              <HosSelect
                :model-value="String(a.data || '').includes('error') ? '1' : '0'"
                variant="orchestrator"
                size="sm"
                block
                :searchable="false"
                @update:model-value="a.data = $event === '1' ? 'error: true' : ''"
              >
                <option value="0">{{ '否' }}</option>
                <option value="1">{{ '是' }}</option>
              </HosSelect>
            </label>
          </template>

          <template v-else-if="a.type === 'wait_template'">
            <label class="geek-field">
              <span>{{ '等待模板' }}</span>
              <textarea
                v-model="a.waitTemplate"
                class="geek-textarea"
                rows="3"
                :placeholder="'{{ is_state(...) }}'"
              />
            </label>
            <label class="geek-field">
              <span>{{ '超时（秒）' }}</span>
              <input
                v-model="a.waitTimeout"
                class="wr-num"
                type="number"
                min="0"
                :placeholder="'留空=不限'"
              />
            </label>
            <label class="geek-builder__ha">
              <input v-model="a.continueOnTimeout" type="checkbox" />
              <span>{{ '超时后继续执行（continue_on_timeout）' }}</span>
            </label>
            <p class="geek-hint">{{ '本地引擎已支持 wait_template；复杂 Jinja 仍建议由 HA 执行' }}</p>
          </template>

          <template v-else-if="a.type === 'loop_start' || a.type === 'loop_stop'">
            <p class="orch-card-hint">
              {{ a.type === 'loop_start' ? '启动本规则循环扫描' : '停止本规则循环扫描' }}
            </p>
            <label class="geek-field">
              <span>{{ '自动化 ID（可选）' }}</span>
              <input v-model="a.entityId" class="wr-num" :placeholder="'默认当前规则'" />
            </label>
          </template>

          <template v-else-if="a.type === 'fire_event'">
            <label class="geek-field">
              <span>{{ '事件类型' }}</span>
              <input v-model="a.eventType" class="wr-num" :placeholder="'如 custom_event'" />
            </label>
            <label class="geek-field">
              <span>{{ 'JSON 数据（可选）' }}</span>
              <textarea
                v-model="a.eventData"
                class="geek-textarea"
                rows="3"
                placeholder='{"key":"value"}'
              />
            </label>
          </template>

          <template v-else-if="a.type === 'wait_for_trigger'">
            <div class="geek-var-math__expr orch-fields">
              <template
                v-if="
                  !a.waitTriggerType ||
                  ['state', 'numeric', 'event'].includes(String(a.waitTriggerType))
                "
              >
                <label class="geek-field">
                  <span>{{ '等待类型' }}</span>
                  <HosSelect variant="orchestrator" size="sm" block v-model="a.waitTriggerType">
                    <option value="state">{{ '状态' }}</option>
                    <option value="numeric">{{ '数值' }}</option>
                    <option value="event">{{ '事件' }}</option>
                  </HosSelect>
                </label>
                <label
                  v-if="a.waitTriggerType !== 'event'"
                  class="geek-field geek-field--stack"
                >
                  <span>{{ '实体' }}</span>
                  <EntityInput v-model="a.entityId" :placeholder="'选择实体'" />
                </label>
                <label
                  v-if="a.waitTriggerType !== 'event'"
                  class="geek-field"
                >
                  <span>{{ '属性（可选）' }}</span>
                  <input
                    v-model="a.waitAttribute"
                    class="wr-num"
                    :placeholder="'空=实体状态'"
                  />
                </label>
                <template v-if="a.waitTriggerType === 'event'">
                  <label class="geek-field">
                    <span>{{ '事件类型' }}</span>
                    <input v-model="a.waitEventType" class="wr-num" :placeholder="'事件类型'" />
                  </label>
                  <label class="geek-field">
                    <span>{{ '数据 key（可选）' }}</span>
                    <input v-model="a.waitEventDataKey" class="wr-num" :placeholder="'可选'" />
                  </label>
                  <label class="geek-field">
                    <span>{{ '数据值（可选）' }}</span>
                    <input v-model="a.waitEventDataVal" class="wr-num" :placeholder="'可选'" />
                  </label>
                </template>
                <label v-if="a.waitTriggerType === 'state'" class="geek-field">
                  <span>{{ '目标状态' }}</span>
                  <HosSelect variant="orchestrator" size="sm" block v-model="a.waitStateTo">
                    <option value="on">on</option>
                    <option value="off">off</option>
                    <option value="any">{{ '任意' }}</option>
                  </HosSelect>
                </label>
                <template v-if="a.waitTriggerType === 'numeric'">
                  <label class="geek-field">
                    <span>{{ '比较' }}</span>
                    <HosSelect variant="orchestrator" size="sm" block v-model="a.waitNumOp">
                      <option value="above">{{ '高于' }}</option>
                      <option value="below">{{ '低于' }}</option>
                    </HosSelect>
                  </label>
                  <label class="geek-field">
                    <span>{{ '阈值' }}</span>
                    <input v-model="a.waitNumValue" class="wr-num" type="number" :placeholder="'数值'" />
                  </label>
                </template>
              </template>
              <template v-else>
                <p class="geek-hint geek-hint--warn">
                  {{
                    `当前为「${a.waitTriggerType}」平台，请用 YAML 编辑或改为状态/数值/事件。`
                  }}
                </p>
                <label class="geek-field">
                  <span>{{ '平台（只读）' }}</span>
                  <input class="wr-num" :value="a.waitTriggerType" disabled />
                </label>
                <label v-if="a.entityId" class="geek-field">
                  <span>{{ '实体' }}</span>
                  <input class="wr-num" :value="a.entityId" disabled />
                </label>
                <button
                  type="button"
                  class="list-page__link-btn"
                  @click="a.waitTriggerType = 'state'"
                >
                  {{ '改为状态等待' }}
                </button>
              </template>
              <label class="geek-field">
                <span>{{ '超时（秒）' }}</span>
                <input
                  v-model.number="a.waitTimeout"
                  class="wr-num"
                  type="number"
                  min="0"
                  :placeholder="'留空=不限'"
                />
              </label>
              <label class="geek-builder__ha">
                <input v-model="a.continueOnTimeout" type="checkbox" />
                <span>{{ '超时后继续执行（continue_on_timeout）' }}</span>
              </label>
            </div>
          </template>

          <template v-else-if="a.type === 'choose'">
            <div class="wr-branches">
              <div v-for="(br, bi) in a.branches || []" :key="bi" class="wr-branch">
                <div class="wr-branch-head">
                  <span>{{
                    br.isDefault ? '否则（不满足）' : bi === 0 ? '满足时' : `满足时 ${bi + 1}`
                  }}</span>
                  <button
                    type="button"
                    class="wr-btn-x"
                    :aria-label="'删除分支'"
                    @click="a.branches.splice(bi, 1)"
                  >
                    ✕
                  </button>
                </div>
                <div v-if="!br.isDefault" class="orch-fields">
                  <label class="geek-field geek-field--stack">
                    <span>{{ '条件实体' }}</span>
                    <EntityInput v-model="br.condEntityId" :placeholder="'实体'" />
                  </label>
                  <label class="geek-field">
                    <span>{{ '判断' }}</span>
                    <HosSelect variant="orchestrator" size="sm" block v-model="br.condOp">
                      <option value="eq">{{ '等于' }}</option>
                      <option value="neq">{{ '不等于' }}</option>
                      <option value="gt">&gt;</option>
                      <option value="gte">≥</option>
                      <option value="lt">&lt;</option>
                      <option value="lte">≤</option>
                      <option value="between">{{ '介于' }}</option>
                      <option value="contains">{{ '包含' }}</option>
                      <option value="time_after">{{ '晚于' }}</option>
                      <option value="time_before">{{ '早于' }}</option>
                      <option value="sun_after">{{ '太阳后' }}</option>
                      <option value="sun_before">{{ '太阳前' }}</option>
                      <option value="weekday">{{ '星期' }}</option>
                      <option value="var_eq">{{ '变量=' }}</option>
                      <option value="var_lt">{{ '变量&lt;' }}</option>
                      <option value="var_gt">{{ '变量&gt;' }}</option>
                    </HosSelect>
                  </label>
                  <label v-if="String(br.condOp || '').startsWith('var_')" class="geek-field">
                    <span>{{ '变量名' }}</span>
                    <input v-model="br.condVarKey" class="wr-num" :placeholder="'变量 key'" />
                  </label>
                  <label class="geek-field">
                    <span>{{ '比较值' }}</span>
                    <input v-model="br.condState" class="wr-num" :placeholder="'如 on / 数值'" />
                  </label>
                </div>
                <div v-if="!canvasFoldBranches" class="wr-branch-acts">
                  <button type="button" class="wr-btn-add wr-btn-add--xs" @click="addBranchAction(br)">
                    {{ '+ 动作' }}
                  </button>
                  <OrchestratorNestedActionRow
                    v-for="(ba, bai) in br.actions || []"
                    :key="bai"
                    v-model="br.actions[bai]"
                    @remove="br.actions.splice(bai, 1)"
                  />
                </div>
              </div>
              <button type="button" class="wr-btn-link" @click="addChooseBranch(a)">
                {{ '+ 满足分支' }}
              </button>
              <button type="button" class="wr-btn-link" @click="ensureDefaultBranch(a)">
                {{ '+ 否则分支' }}
              </button>
              <p v-if="canvasFoldBranches" class="orch-card-hint">
                {{
                  '分支内动作请在画布用「满足 / 否则 / 完成后」端口连线；此处只改条件，保存时按连线折叠。'
                }}
              </p>
            </div>
          </template>

          <template v-else-if="a.type === 'variables'">
            <label class="geek-field">
              <span>{{ '运行时变量' }}</span>
              <textarea
                v-model="a.variablesMap"
                class="geek-textarea"
                rows="3"
                :placeholder="'key=value,foo=1'"
              />
            </label>
            <p class="geek-hint">{{ '运行时模板上下文' }}</p>
          </template>

          <template v-else-if="a.type === 'variable_set'">
            <div class="geek-var-math">
              <div class="geek-var-math__target">
                <label class="geek-var-math__field geek-var-math__field--grow">
                  <span>{{ '变量 key' }}</span>
                  <input v-model="a.varKey" class="geek-var-math__input" :placeholder="'变量名'" />
                </label>
                <label class="geek-var-math__field geek-var-math__field--scope">
                  <span>{{ '作用域' }}</span>
                  <HosSelect variant="orchestrator" size="sm" block v-model="a.varScope">
                    <option value="global">{{ '全局' }}</option>
                    <option value="rule">{{ '本规则' }}</option>
                  </HosSelect>
                </label>
              </div>
              <div class="geek-var-math__expr orch-fields">
                <label class="geek-field">
                  <span>{{ '操作' }}</span>
                  <HosSelect variant="orchestrator" size="sm" block v-model="a.varOp">
                    <option value="set">{{ '赋值' }}</option>
                    <option value="add">{{ '加' }}</option>
                    <option value="concat">{{ '拼接' }}</option>
                  </HosSelect>
                </label>
                <label class="geek-field">
                  <span>{{ '类型' }}</span>
                  <HosSelect variant="orchestrator" size="sm" block v-model="a.varType">
                    <option value="string">{{ '文本' }}</option>
                    <option value="number">{{ '数值' }}</option>
                  </HosSelect>
                </label>
                <label class="geek-field">
                  <span>{{ '值' }}</span>
                  <input v-model="a.varValue" class="geek-var-math__input" :placeholder="'字面量'" />
                </label>
                <label class="geek-field geek-field--stack">
                  <span>{{ '或从实体状态写入' }}</span>
                  <EntityInput v-model="a.varSourceEntityId" :placeholder="'选择实体'" />
                </label>
              </div>
            </div>
          </template>

          <template v-else-if="a.type === 'parallel'">
            <p class="orch-card-hint">
              {{
                canvasFoldBranches
                  ? '并行子动作请在画布从本节点引出多条连线；此处无需再填列表。'
                  : '并行执行下列动作'
              }}
            </p>
            <template v-if="!canvasFoldBranches">
              <button
                type="button"
                class="wr-btn-add wr-btn-add--xs"
                @click="
                  () => {
                    if (!a.parallelActions) a.parallelActions = []
                    a.parallelActions.push({ type: 'delay', seconds: 1 })
                    syncParallelBranchesFromActions(a)
                  }
                "
              >
                {{ '+ 并行项' }}
              </button>
              <OrchestratorNestedActionRow
                v-for="(pa, pi) in a.parallelActions || []"
                :key="pi"
                v-model="a.parallelActions[pi]"
                @remove="
                  () => {
                    a.parallelActions.splice(pi, 1)
                    syncParallelBranchesFromActions(a)
                  }
                "
              />
            </template>
          </template>

        <template v-else-if="a.type === 'note'">
          <label class="geek-field">
            <span>{{ '注释内容' }}</span>
            <textarea v-model="a.noteText" class="geek-textarea" rows="4" />
          </label>
        </template>

        <template v-else-if="a.type === 'repeat'">
          <label class="geek-field">
            <span>{{ '方式' }}</span>
            <HosSelect variant="orchestrator" size="sm" block v-model="a.repeatType">
              <option value="count">{{ '固定次数' }}</option>
              <option value="while">{{ '条件为真' }}</option>
              <option value="until">{{ '直到为真' }}</option>
              <option value="for_each">{{ '遍历' }}</option>
            </HosSelect>
          </label>
            <label
              v-if="a.repeatType === 'count' || !a.repeatType"
              class="geek-field"
            >
              <span>{{ '次数' }}</span>
              <input v-model.number="a.repeatCount" class="wr-num" type="number" min="1" />
            </label>
            <label v-else-if="a.repeatType === 'for_each'" class="geek-field geek-field--stack">
              <span>{{ '遍历列表（YAML / 模板）' }}</span>
              <textarea v-model="a.repeatForEach" class="geek-textarea" rows="3" placeholder="- light.a" />
            </label>
            <template v-if="a.repeatType === 'while' || a.repeatType === 'until'">
              <label class="geek-field geek-field--stack">
                <span>{{ '条件实体' }}</span>
                <EntityInput v-model="a.repeatEntityId" :placeholder="'条件实体'" />
              </label>
              <label class="geek-field">
                <span>{{ '状态' }}</span>
                <HosSelect variant="orchestrator" size="sm" block v-model="a.repeatCondState">
                  <option value="on">on</option>
                  <option value="off">off</option>
                </HosSelect>
              </label>
            </template>
            <p v-if="canvasFoldBranches" class="orch-card-hint">
              {{ '重复体内的动作请从本节点「循环体」端口连出；保存时按连线折叠。' }}
            </p>
            <template v-else>
              <button
                type="button"
                class="wr-btn-add wr-btn-add--xs"
                @click="
                  () => {
                    if (!a.repeatActions) a.repeatActions = []
                    a.repeatActions.push({ type: 'delay', seconds: 1 })
                  }
                "
              >
                {{ '+ 循环体动作' }}
              </button>
              <OrchestratorNestedActionRow
                v-for="(ra, ri) in a.repeatActions || []"
                :key="ri"
                v-model="a.repeatActions[ri]"
                @remove="a.repeatActions.splice(ri, 1)"
              />
            </template>
          </template>
        </GeekCfgCard>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * OrchestratorActionEditor.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：联动编排器动作编辑器主体。按动作类型（callService/deviceAction/delay/notify/
 *      scene/script/home_mode/trigger_automation/fire_event/wait_for_trigger/wait_template/
 *      choose/repeat/variables/variable_set/var_math/var_concat/var_fn/parallel/debug/stop/
 *      loop_start/loop_stop）渲染对应表单，支持条件分支（choose）与并行（parallel）等结构。
 *      服务调用支持参数面板（OrchestratorServiceDataPanel），变量运算/拼接/函数
 *      交由 GeekVarMathPanel/GeekVarConcatPanel/内置 var_fn 表单处理。
 * 依赖：vue、HosSelect、EntityInput、OrchestratorServiceDataPanel、OrchestratorNestedActionRow、
 *      GeekCfgCard/GeekVarMathPanel/GeekVarConcatPanel、useEntitiesStore、capabilities.util、
 *      GEEK_ACTION_LABELS、action-yaml-builder.util、useOrchestratorActionHelpers。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import OrchestratorServiceDataPanel from '@/components/dashboard/OrchestratorServiceDataPanel.vue'
import OrchestratorNestedActionRow from '@/components/dashboard/OrchestratorNestedActionRow.vue'
import GeekCfgCard from '@/components/geek-automation/GeekCfgCard.vue'
import GeekVarMathPanel from '@/components/geek-automation/GeekVarMathPanel.vue'
import GeekVarConcatPanel from '@/components/geek-automation/GeekVarConcatPanel.vue'
import {
  addOrchestratorChooseBranch,
  addOrchestratorBranchAction,
} from '@/composables/orchestrator/useOrchestratorActionHelpers'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  domainFromEntityId,
  friendlyActionDetail,
} from '@/utils/geek-automation/capabilities.util'
import { GEEK_ACTION_LABELS } from '@/utils/geek-automation/graph-types'
import { syncParallelBranchesFromActions } from '@/utils/orchestrator/action-yaml-builder.util'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import '@/components/geek-automation/styles/geek-var-panel.css'

const entitiesStore = useEntitiesStore()
const actions = defineModel('actions', { type: Array, required: true })
const servicePanel = defineModel('servicePanel', { type: Object, default: null })

/**
 * 组件 Props
 * @property {string}   variant            - 编辑器变体：'automation' 暴露 loop_start/loop_stop 选项
 * @property {string[]} allDomains          - HA 域列表（callService 域下拉）
 * @property {Function} servicesForDomain   - 按域返回服务列表的函数
 * @property {string}   showParamsKey      - 控制服务参数面板展开的属性 key
 * @property {Array}    homeModes           - 家庭模式可选项（home_mode 动作）
 * @property {Function} isActionUnsupported - 判定动作类型是否本地不支持（标记 unsupported 样式）
 * @property {Array}    sceneOptions        - 场景可选项（scene 动作）
 * @property {Array}    scriptOptions       - 脚本可选项（script 动作）
 * @property {boolean}  canvasFoldBranches   - 画布折叠分支模式：切换标题/按钮文案与样式
 */
defineProps({
  variant: { type: String, default: 'script' },
  allDomains: { type: Array, default: () => [] },
  servicesForDomain: { type: Function, required: true },
  showParamsKey: { type: String, default: '_showParams' },
  homeModes: { type: Array, default: () => [] },
  isActionUnsupported: { type: Function, default: null },
  sceneOptions: { type: Array, default: () => [] },
  scriptOptions: { type: Array, default: () => [] },
  canvasFoldBranches: { type: Boolean, default: false },
})

/**
 * 组件事件
 * - add：点击添加动作按钮
 * - apply-service-data：服务参数面板确认时回写
 * - sync-service-data：服务参数面板挂载时从 action 同步到 panel
 * - reset-service-data：域切换时清空服务/实体/数据
 */
defineEmits(['add', 'apply-service-data', 'sync-service-data', 'reset-service-data'])

/**
 * 动作卡片标题
 * 优先取 GEEK_ACTION_LABELS 中文标签，否则回退动作类型，最终兜底「动作配置」
 * @param {object} a - 动作对象
 * @returns {string}
 */
function orchCardTitle(a) {
  if (!a?.type) return '动作配置'
  return GEEK_ACTION_LABELS[a.type] || a.type || '动作配置'
}

/**
 * 动作卡片预览文案
 * delay →「延迟 N 秒」；callService →「域.服务 · 实体」；其他走 friendlyActionDetail
 * @param {object} a - 动作对象
 * @returns {string}
 */
function orchCardPreview(a) {
  if (!a) return ''
  if (a.type === 'delay') {
    const sec = a.seconds != null && a.seconds !== '' ? a.seconds : 0
    return `延迟 ${sec} 秒`
  }
  if (a.type === 'callService') {
    const svc = [a.domain, a.service].filter(Boolean).join('.')
    const ent = String(a.entityId || '').trim()
    if (svc && ent) return `${svc} · ${ent}`
    return svc || ent
  }
  return String(friendlyActionDetail(a) || '').trim()
}

/**
 * 推断 var_fn 动作的参数来源类型
 * 优先取显式 fnArgKind，其次根据已填字段反推：varSourceEntityId→device、fnArgVar→var、默认 literal
 * @param {object} a - 动作对象
 * @returns {'literal'|'var'|'device'}
 */
function fnArgKind(a) {
  const kind = String(a?.fnArgKind || '')
  if (kind === 'var' || kind === 'device' || kind === 'literal') return kind
  if (a?.varSourceEntityId) return 'device'
  if (String(a?.fnArgVar || '').trim()) return 'var'
  return 'literal'
}

/**
 * 切换 var_fn 动作的参数来源类型，并清理非选中来源的字段
 * @param {object} a   - 动作对象
 * @param {'literal'|'var'|'device'} kind - 目标来源类型
 */
function setFnArgKind(a, kind) {
  if (!a) return
  a.fnArgKind = kind
  if (kind === 'literal') {
    a.fnArgVar = ''
    a.varSourceEntityId = ''
    a.varSourceAttribute = ''
  } else if (kind === 'var') {
    a.fnArg = ''
    a.varSourceEntityId = ''
    a.varSourceAttribute = ''
  } else {
    a.fnArg = ''
    a.fnArgVar = ''
  }
}

/**
 * var_fn 动作预览文案：`${key} = ${fn}(${arg})`
 * @param {object} a - 动作对象
 * @returns {string}
 */
function fnPreview(a) {
  const key = String(a?.varKey || '').trim() || '结果'
  const fn = a?.fnName || 'round'
  const kind = fnArgKind(a)
  const arg =
    kind === 'var'
      ? String(a?.fnArgVar || '').trim() || '变量'
      : kind === 'device'
        ? String(a?.varSourceEntityId || '').trim() || '实体'
        : String(a?.fnArg ?? '')
  return `${key} = ${fn}(${arg})`
}

/** 在 choose 动作下追加一个条件分支（委托 addOrchestratorChooseBranch） */
function addChooseBranch(action) {
  addOrchestratorChooseBranch(action)
}

/** 在指定分支下追加一个内嵌动作（委托 addOrchestratorBranchAction） */
function addBranchAction(branch) {
  addOrchestratorBranchAction(branch)
}

/**
 * 确保 choose 动作至少有一个默认分支
 * 已存在 isDefault 分支时跳过；否则追加一个空条件的默认分支
 */
function ensureDefaultBranch(action) {
  if (!action.branches) action.branches = []
  if (action.branches.some((b) => b.isDefault)) return
  action.branches.push({
    isDefault: true,
    condEntityId: '',
    condOp: 'eq',
    condState: 'on',
    actions: [],
  })
}

/** 场景动作选中实体后，自动同步 entityId 到 sceneId（若 sceneId 为空） */
function onSceneEntityPicked(a) {
  if (a?.entityId && !a.sceneId) a.sceneId = a.entityId
}

/** 脚本动作选中实体后，自动同步 entityId 到 scriptId（若 scriptId 为空） */
function onScriptEntityPicked(a) {
  if (a?.entityId && !a.scriptId) a.scriptId = a.entityId
}

/**
 * 从 deviceAction 动作的 data（JSON 字符串）解析出 device_id
 * 解析失败或不存在时返回空字符串
 * @param {object} a - 动作对象
 * @returns {string}
 */
function deviceActionDeviceId(a) {
  try {
    const raw = a?.data ? JSON.parse(String(a.data)) : null
    if (raw && typeof raw === 'object' && raw.device_id != null) return String(raw.device_id)
  } catch {
    /* 忽略 */
  }
  return ''
}

/**
 * 将当前 deviceAction 的 device_id/domain/service 重新序列化为 data JSON 字符串
 * domain 与 service 任一非空时一并写入
 */
function syncDeviceActionData(a) {
  if (!a || a.type !== 'deviceAction') return
  a.data = JSON.stringify({
    device_id: deviceActionDeviceId(a),
    ...(a.domain ? { domain: a.domain } : {}),
    ...(a.service ? { type: a.service } : {}),
  })
}

/** deviceAction 设备 ID 输入变更：重写 a.data 中的 device_id 字段 */
function onDeviceActionDeviceId(a, ev) {
  if (!a || a.type !== 'deviceAction') return
  const deviceId = String(ev?.target?.value || '').trim()
  a.data = JSON.stringify({
    device_id: deviceId,
    ...(a.domain ? { domain: a.domain } : {}),
    ...(a.service ? { type: a.service } : {}),
  })
}

/**
 * deviceAction 关联实体变更：从实体 attributes.device_id 自动填充 device_id；
 * 若 a.domain 为空且能从 entityId 解析出 domain，则同步回填
 */
function onDeviceActionEntity(a) {
  if (!a || a.type !== 'deviceAction') return
  const entityId = String(a.entityId || '').trim()
  if (entityId) {
    const ent = entitiesStore.getEntity?.(entityId) || entitiesStore.entities?.[entityId]
    const attrs = ent?.attributes || {}
    if (attrs.device_id != null && String(attrs.device_id)) {
      a.data = JSON.stringify({
        device_id: String(attrs.device_id),
        ...(a.domain ? { domain: a.domain } : {}),
        ...(a.service ? { type: a.service } : {}),
      })
    }
    const domain = domainFromEntityId(entityId)
    if (domain && !a.domain) a.domain = domain
  }
  syncDeviceActionData(a)
}
</script>
