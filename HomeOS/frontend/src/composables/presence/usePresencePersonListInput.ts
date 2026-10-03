/**
 * @file usePresencePersonListInput.ts
 * @module composables/presence
 * @description 人员列表输入 composable，管理在家人员清单的增删改查与排序。
 *   - 维护当前激活的人员索引（activeIdx）并随列表长度变化自动校正
 *   - 通过 emit('update:modelValue') 与父组件双向同步人员数据
 *   - 提供人员姓名首字母、状态样式类、实体计数等派生信息
 *   - 支持人员的新增、移除、字段更新与重排序（含拖拽与位移两种方式）
 * @dependencies vue, @/utils/presence/person.util
 */
import { computed, ref, watch } from 'vue'
import {
  createEmptyPresencePerson,
  reorderPresencePersons,
} from '@/utils/presence/person.util'

/**
 * 单个人员行数据
 */
interface PresencePersonRow {
  /** 人员唯一标识（已保存时存在） */
  id?: string
  /** 人员显示名称 */
  name?: string
  /** 关联的实体 ID 列表（如 device_tracker 实体） */
  entityIds?: string[]
  /** 关联的用户 ID（用于权限映射） */
  userId?: string
}

/**
 * 人员列表输入组件的 Props 定义
 */
interface PresencePersonListInputProps {
  /** 双向绑定的人员列表 */
  modelValue: PresencePersonRow[]
  /** 人员状态映射：key 为人员 id，value 为是否在家 */
  statusMap: Record<string, boolean>
  /** 新增按钮文案，默认"添加人员" */
  addLabel?: string
  /** 移除按钮文案，默认"移除" */
  removeLabel?: string
}

/** emit 事件类型：更新 modelValue */
type PresenceEmit = (event: 'update:modelValue', value: PresencePersonRow[]) => void

/**
 * 人员列表输入 composable
 * @param props 组件 Props
 * @param emit 事件发射器，用于同步 modelValue
 * @returns 响应式状态与操作方法
 */
export function usePresencePersonListInput(
  props: PresencePersonListInputProps,
  emit: PresenceEmit,
) {
  // 新增按钮文案，缺省回退为"添加人员"
  const addLabel = computed(() => props.addLabel || '添加人员')
  // 移除按钮文案，缺省回退为"移除"
  const removeLabel = computed(() => props.removeLabel || '移除')

  // 当前激活的人员索引，用于 Tab 切换高亮
  const activeIdx = ref(0)

  // 人员列表的只读视图，防御性处理非数组情况
  const rows = computed(() => {
    const arr = Array.isArray(props.modelValue) ? props.modelValue : []
    return arr
  })

  // 当前激活的人员对象；激活索引越界时回退到首项或 null
  const activePerson = computed(() => rows.value[activeIdx.value] ?? rows.value[0] ?? null)

  // 监听列表长度变化，自动校正激活索引，避免越界
  watch(
    () => rows.value.length,
    (len, prevLen) => {
      // 列表收缩时回退到最后一项
      if (activeIdx.value >= len) activeIdx.value = Math.max(0, len - 1)
      // 列表新增时自动选中新增项（位于末尾）
      if (typeof prevLen === 'number' && len > prevLen) activeIdx.value = len - 1
    },
  )

  /**
   * 获取人员姓名首字母（大写），无姓名时返回 "?"
   * @param name 人员姓名
   * @returns 首字母大写或 "?"
   */
  function personInitial(name?: string) {
    const s = String(name || '').trim()
    return s ? s.charAt(0).toUpperCase() : '?'
  }

  /**
   * 生成 Tab 标签文案
   * @param person 人员对象
   * @param idx 人员索引
   * @returns 姓名或"人员 {idx+1}"回退文案
   */
  function tabLabel(person: PresencePersonRow | null, idx: number) {
    const name = String(person?.name || '').trim()
    return name || `人员 ${idx + 1}`
  }

  /**
   * 获取人员在家状态
   * @param person 人员对象
   * @returns 在家 true / 离家 false / 未知 null
   */
  function personStatus(person: PresencePersonRow | null) {
    if (!person?.id || !(person.id in props.statusMap)) return null
    return !!props.statusMap[person.id]
  }

  /**
   * 根据人员状态返回状态点样式类名
   * @param person 人员对象
   * @returns 在家 ppli-status--home / 离家 ppli-status--away / 空字符串
   */
  function personStatusClass(person: PresencePersonRow | null) {
    const st = personStatus(person)
    if (st === true) return 'ppli-status--home'
    if (st === false) return 'ppli-status--away'
    return ''
  }

  /**
   * 根据人员状态返回 Tab 样式类名
   * @param person 人员对象
   * @returns 在家 ppli-tab--home / 离家 ppli-tab--away / 空字符串
   */
  function tabStatusClass(person: PresencePersonRow | null) {
    const st = personStatus(person)
    if (st === true) return 'ppli-tab--home'
    if (st === false) return 'ppli-tab--away'
    return ''
  }

  /**
   * 生成实体数量标签文案
   * @param person 人员对象
   * @returns "{n} 个实体" 或 "未选择"
   */
  function entityCountLabel(person: PresencePersonRow | null) {
    const n = (Array.isArray(person?.entityIds) ? person.entityIds : []).filter(Boolean).length
    return n ? `${n} 个实体` : '未选择'
  }

  /**
   * 通过 emit 同步新的人员列表
   * @param next 新的人员列表
   */
  function emitRows(next: PresencePersonRow[]) {
    emit('update:modelValue', next)
  }

  /**
   * 更新指定人员的单个字段
   * @param idx 人员索引
   * @param field 字段名
   * @param value 新值
   */
  function updatePersonField(idx: number, field: keyof PresencePersonRow, value: unknown) {
    const next = rows.value.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    emitRows(next)
  }

  /**
   * 新增一个空人员到列表末尾
   */
  function addPerson() {
    emitRows([...rows.value, createEmptyPresencePerson()])
  }

  /**
   * 移除指定索引的人员，并校正激活索引
   * @param idx 待移除人员的索引
   */
  function removePerson(idx: number) {
    const next = rows.value.filter((_, i) => i !== idx)
    emitRows(next)
    // 移除后激活索引可能越界，回退到最后一项
    if (activeIdx.value >= next.length) activeIdx.value = Math.max(0, next.length - 1)
  }

  /**
   * 重排序人员：从 fromIndex 移动到 toIndex，并保持当前选中项跟随
   * @param fromIndex 源索引
   * @param toIndex 目标索引
   */
  function reorderPerson(fromIndex: number, toIndex: number) {
    // 同位置无需操作
    if (fromIndex === toIndex) return
    // 记录当前选中 id，重排后定位到新位置
    const selectedId = rows.value[activeIdx.value]?.id
    const next = reorderPresencePersons(rows.value, fromIndex, toIndex)
    emitRows(next)
    if (selectedId) {
      const newIdx = next.findIndex((p) => p.id === selectedId)
      if (newIdx >= 0) activeIdx.value = newIdx
    }
  }

  /**
   * 按位移量移动人员
   * @param index 当前索引
   * @param delta 位移量（正向下、负向上）
   */
  function movePersonByDelta(index: number, delta: number) {
    reorderPerson(index, index + delta)
  }

  return {
    addLabel,
    removeLabel,
    activeIdx,
    rows,
    activePerson,
    personInitial,
    tabLabel,
    personStatus,
    personStatusClass,
    tabStatusClass,
    entityCountLabel,
    updatePersonField,
    addPerson,
    removePerson,
    movePersonByDelta,
  }
}