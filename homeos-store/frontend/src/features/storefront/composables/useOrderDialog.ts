/**
 * 订单弹窗（支付 / 待支付提醒）的公共行为。
 *
 * 抽出来的原因：`PaymentDialog.vue` 与 `PendingOrderDialog.vue` 里这三件事逐字相同 ——
 * `<dialog>` 的 showModal/close 开关、打开期间每秒刷新 `now` 以驱动倒计时、卸载时清定时器，
 * 以及「取消订单」的二次确认（连 kicker / title / message / detail / 按钮文案 / tone 都一样）。
 * 两份拷贝的后果是：改一次取消确认的措辞或冷确逻辑，很容易只落到其中一个弹窗上，
 * 而两个弹窗在后面两个入口里都会出现。
 *
 * 行为与原实现严格一致：
 * - 打开时若已 open 则不再 showModal（重复调用会抛 InvalidStateError）；
 * - 每次打开先清旧定时器再起新的，避免快速开关叠出多个 interval；
 * - 关闭时只在 `node.open` 为真时 close；
 * - 卸载时清定时器。
 */

import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { useOrderStore } from "@store/features/storefront/stores/order";
import { useConfirmStore } from "@store/shared/stores/confirm";
import type { StoreOrder } from "@store/shared/types/store";

export interface OrderDialog {
  /** 绑到 `<dialog ref="dialog">` */
  dialog: Ref<HTMLDialogElement | null>;
  /** 每秒更新的「现在」，倒计时 computed 依赖它触发重算 */
  now: Ref<number>;
}

/**
 * `<dialog>` 开关 + 倒计时节拍。
 *
 * `dialog` 由调用方声明后传入，而不是在这里新建：模板里的 `ref="dialog"` 绑的是 SFC 作用域内
 * 的那个名字，若 ref 只在 composable 内部创建、SFC 只解构 `now`，vue-tsc 的 `noUnusedLocals`
 * 会把解构出来的 `dialog` 判成未使用（模板引用不算脚本引用）。
 *
 * @param isOpen 弹窗可见性来源（传 getter 而不是 ref：调用方持有的是 store 里的 ref）
 * @param dialog 调用方的 `<dialog>` 模板 ref
 */
export function useOrderDialog(
  isOpen: () => boolean,
  dialog: Ref<HTMLDialogElement | null> = ref<HTMLDialogElement | null>(null),
): OrderDialog {
  const now = ref(Date.now());
  let timer: number | undefined;

  watch(isOpen, (open) => {
    const node = dialog.value;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        now.value = Date.now();
      }, 1000);
    } else if (node.open) {
      node.close();
      window.clearInterval(timer);
    }
  });

  // 卸载时清掉：否则弹窗关掉后 interval 仍每秒改一次 now，把已销毁组件的 computed 拖住。
  onBeforeUnmount(() => window.clearInterval(timer));

  return { dialog, now };
}

/**
 * 「取消支付」的二次确认 → 取消订单。
 *
 * 两个弹窗的确认文案完全一致，所以文案归这里；`target` 由调用方给
 * （支付弹窗传 `currentOrder`，待支付提醒传 `pendingOrder`）。
 */
export function useCancelOrder() {
  const order = useOrderStore();
  const confirm = useConfirmStore();

  return async function cancelOrderWithConfirm(target: StoreOrder | null | undefined): Promise<void> {
    const ok = await confirm.confirm({
      kicker: "Cancel Order",
      title: "取消这笔待支付订单？",
      message: "取消后订单立即关闭，占用的库存和优惠码会释放。",
      detail: "如果还需要这份授权，需要重新下单；付款码也会同时作废。",
      confirmLabel: "取消订单",
      cancelLabel: "继续支付",
      tone: "danger",
    });
    if (!ok) return;
    await order.cancelOrder(target);
  };
}
