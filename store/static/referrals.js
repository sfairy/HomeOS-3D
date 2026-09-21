(() => {
  const $ = s => document.querySelector(s);
  const esc = HtmlSafe.esc;
  const storageKey = 'hb_invite_v1';
  try {
    // 存储不可用 / 值被改坏时只是不预填邀请码，注册流程本身不依赖它。
    const code = new URL(location.href).searchParams.get('invite');
    if (code && /^[0-9]{6}$/.test(code)) localStorage.setItem(storageKey, JSON.stringify({code, expires:Date.now()+30*86400000}));
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.expires > Date.now() && /^[0-9]{6}$/.test(saved.code) && $('#store-register-form [name="referralCode"]')) $('#store-register-form [name="referralCode"]').value = saved.code;
    else if (saved) localStorage.removeItem(storageKey);
  } catch {}
  // 积分流水的类型标签。键必须覆盖后端全部写入方（store/commerce/referrals.py 的
  // LEDGER_KIND_LABELS 与 api/admin.py 的人工调账）：曾漏掉 manual_adjust，于是后台人工
  // 调账出现在用户自己的流水里时会原样显示成 snake_case。
  // 措辞有意与后台的账务口径不同（reward 这里叫「邀请奖励」），那是对用户更直白说法。
  const labels = {reward:'邀请奖励',reversal:'邀请失败',freeze:'提现冻结',withdrawal:'提现完成',release:'退回积分',manual_adjust:'人工调账',pending:'待审核',paid:'已提现',rejected:'已驳回 / 撤销'};
  const date = v => v ? new Date(v).toLocaleString('zh-CN', {hour12:false}) : '—';
  const table = (heads, rows) => rows.length ? `<div class="referral-table-wrap"><table class="referral-table"><thead><tr>${heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="referral-empty">暂无记录。分享邀请链接，开始积累积分。</p>';
  window.HBReferrals = {
    clearInvite(){try{localStorage.removeItem(storageKey);}catch{}},
    async init(api, toast){
      let data, kind='ledger', page=1, requestKey=crypto.randomUUID(), busy=false, sequence=0;
      const error = e => {$('#referral-error').textContent=e.message;$('#referral-error').hidden=false;toast(e.message);};
      // 提现下限只有一个主人：服务端下发的 settings.withdrawalMinPoints（后台可配）。
      // 前端曾把它写死成 100，于是调低到 50 时有 50~99 积分的用户永远提不出来（按钮一直灰着），
      // 调高到 200 时 100 积分的用户能点但会被服务端驳回。data 还没到（init 的第一帧）时给 0，
      // 让按钮先可用；refresh() 一回来就会用真实值纠正。
      const minPoints = () => Math.max(0, Number(data?.settings?.withdrawalMinPoints ?? 0));
      const preview = () => {
        const raw = $('#referral-withdraw-form').elements.points.value;
        const cents = Math.round(Number(raw || minPoints() || 0)*100);
        const bps = Math.round(Number(data.settings.withdrawalFeePercent)*100);
        const fee = Math.floor(cents*bps/10000);
        $('#referral-fee-preview').textContent=`手续费 ${data.settings.withdrawalFeePercent}%：${HBMoney.formatPoints(fee)} 积分；预计到账 ${HBMoney.formatCentsPlain(Math.max(0,cents-fee))} 元。`;
      };
      async function refresh(){
        data=await api('/referrals');const {wallet:w,settings:s}=data;
        $('#referral-invited').textContent=data.invitedCount;
        $('#referral-rate').textContent=s.enabled ? `好友每笔实付订单，奖励 ${s.ratePercent}% 积分。` : '邀请活动暂时关闭，已有积分仍可查看和申请提现。';
        $('#referral-code-text').textContent=w?.code || '生成邀请码，开始邀请好友。';
        $('#referral-generate').hidden=Boolean(w);$('#referral-generate').disabled=!s.enabled;
        $('#referral-copy-code').hidden=!w;$('#referral-copy-link').hidden=!w;
        $('#referral-link').hidden=!w;
        if(w) $('#referral-link').value=`${location.origin}/user/authentication/register?invite=${encodeURIComponent(w.code)}`;
        // 「可用积分」必须和服务端 referrals.available_points 同一口径：余额 - 提现冻结。
        // 不能直接展示 balance：那样「可用」会把已申请提现的钱也算进去，
        // 用户看着 100 积分却提不出来。
        const available = Math.max(0, Number(w?.balance || 0) - Number(w?.frozen || 0));
        // 四张积分卡各挂一个语义色（与账号概览、后台徽标同一套 data-tone 词汇）：
        // 可用=薄荷（正常）、提现中=暖光（待办）、累计=青（主控）、已提现=极光紫（归档）。
        $('#referral-stats').innerHTML=[['可用积分',available,'eco'],['提现中积分',w?.frozen,'lumen'],['累计净奖励',w?.earned,'accent'],['已提现积分',w?.withdrawn,'aura']].map(([label,v,tone])=>`<article data-tone="${tone}"><small>${label}</small><strong>${esc(typeof v === 'number' ? v.toFixed(2) : (v||'0.00'))}</strong><small>积分</small></article>`).join('');
        $('#referral-withdraw-form button').disabled=!w || available<minPoints() || Number(w.frozen)>0;
        $('#referral-guide-reward').textContent=`好友注册后，实际支付成功的订单，按实付金额的 ${s.ratePercent}% 奖励积分。注册本身不发积分，支付成功后自动入账。`;
        $('#referral-guide-fee').textContent=`1 积分等于 1 元，满 ${minPoints()} 积分可以申请提现。当前手续费 ${s.withdrawalFeePercent}%，申请 ${minPoints()} 积分，扣除 ${s.withdrawalFeePercent} 积分手续费，实际到账 ${(minPoints()-Number(s.withdrawalFeePercent)).toFixed(2)} 元。手续费不足 0.01 部分舍去。`;
        // 输入框的下限同样跟服务端走：模板里的 min/placeholder 是给「还没拿到设置」时兜底的静态值。
        const pointsInput = $('#referral-withdraw-form').elements.points;
        pointsInput.min = String(minPoints());
        pointsInput.placeholder = `最低 ${minPoints()}`;
        // 区块抬头那句「满 N 积分可申请提现」同样跟着服务端走，否则调低门槛后正文与输入框自相矛盾。
        $('#referral-withdraw-lead').textContent = `1 积分等于 1 元，满 ${minPoints()} 积分可申请提现。提交申请后凭申请编号联系客服人工办理。`;
        preview();
      }
      async function history(){
        document.querySelectorAll('[data-referral-history]').forEach(b=>{b.classList.toggle('hb-button--primary',b.dataset.referralHistory===kind);b.classList.toggle('hb-button--secondary',b.dataset.referralHistory!==kind);});
        const current=++sequence;const result=await api(`/referrals/history?kind=${kind}&page=${page}`);if(current!==sequence)return;
        $('#referral-history').innerHTML=kind==='ledger' ? table(['时间','类型','可用积分变化','冻结积分变化','余额','说明'],result.items.map(i=>[esc(date(i.createdAt)),esc(labels[i.kind]||i.kind),esc(i.delta),esc(i.frozenDelta),esc(i.balanceAfter),`${esc(i.note)}${i.reference ? `<code>${esc(i.reference)}</code>` : ''}`])) : table(['申请时间 / 编号','申请积分','手续费积分','实际到账（积分等值）','状态','处理说明'],result.items.map(i=>[`${esc(date(i.createdAt))}<code>${esc(i.id)}</code>`,esc(i.points),`${esc(i.feePoints)} (${esc(i.feePercent)}%)`,esc(i.netPoints),esc(labels[i.status]),`${esc(i.note||'待处理')}<small>${esc(date(i.resolvedAt))}</small>`]));
        $('#referral-page').textContent=`第 ${page} 页 · 共 ${result.total} 条`;$('#referral-prev').disabled=page===1;$('#referral-next').disabled=page*20>=result.total;
      }
      const copy = async text => {try{await navigator.clipboard.writeText(text);toast('已复制');}catch{const input=$('#referral-link');input.hidden=false;input.value=text;input.focus();input.select();toast('请长按或使用 Ctrl/Cmd+C 复制选中内容');}};
      $('#referral-copy-code').onclick=()=>copy(data.wallet.code);$('#referral-copy-link').onclick=()=>copy(`${location.origin}/user/authentication/register?invite=${data.wallet.code}`);
      $('#referral-generate').onclick=async()=>{if(busy)return;busy=true;try{await api('/referrals/code',{method:'POST'});await refresh();}catch(e){error(e);}finally{busy=false;}};
      $('#referral-withdraw-form').elements.points.oninput=preview;
      $('#referral-withdraw-form').onsubmit=async e=>{
        e.preventDefault();if(busy)return;busy=true;const form=e.currentTarget;form.querySelector('button').disabled=true;
        try{
          const item=await api('/referrals/withdrawals',{method:'POST',body:JSON.stringify({points:form.elements.points.value,requestKey,expectedFeePercent:data.settings.withdrawalFeePercent})});
          requestKey=crypto.randomUUID();$('#referral-application').textContent=`申请已提交，编号：${item.id}。请联系客服办理提现。`;
          kind='withdrawals';page=1;await refresh();await history();
        }catch(err){error(err);await refresh().catch(()=>{});}finally{busy=false;const avail=Math.max(0,Number(data?.wallet?.balance||0)-Number(data?.wallet?.frozen||0));form.querySelector('button').disabled=!data?.wallet||avail<minPoints()||Number(data?.wallet?.frozen)>0;}
      };
      document.querySelectorAll('[data-referral-history]').forEach(b=>b.onclick=()=>{kind=b.dataset.referralHistory;page=1;document.querySelectorAll('[data-referral-history]').forEach(x=>{x.classList.toggle('hb-button--primary',x===b);x.classList.toggle('hb-button--secondary',x!==b);});history().catch(error);});
      $('#referral-prev').onclick=()=>{page--;history().catch(error);};$('#referral-next').onclick=()=>{page++;history().catch(error);};
      await refresh();await history();
    }
  };
})();
