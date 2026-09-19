(() => {
  const $ = s => document.querySelector(s);
  const esc = HtmlSafe.esc;
  const storageKey = 'hb_invite_v1';
  try {
    const code = new URL(location.href).searchParams.get('invite');
    if (code && /^[0-9]{6}$/.test(code)) localStorage.setItem(storageKey, JSON.stringify({code, expires:Date.now()+30*86400000}));
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.expires > Date.now() && /^[0-9]{6}$/.test(saved.code) && $('#store-register-form [name="referralCode"]')) $('#store-register-form [name="referralCode"]').value = saved.code;
    else if (saved) localStorage.removeItem(storageKey);
  } catch {}
  const labels = {reward:'邀请奖励',freeze:'提现冻结',withdrawal:'提现完成',release:'退回积分',reversal:'邀请失败',pending:'待审核',paid:'已提现',rejected:'已驳回 / 撤销'};
  const date = v => v ? new Date(v).toLocaleString('zh-CN', {hour12:false}) : '—';
  const table = (heads, rows) => rows.length ? `<div class="referral-table-wrap"><table class="referral-table"><thead><tr>${heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="referral-empty">暂无记录。分享邀请链接，开始积累积分。</p>';
  window.HBReferrals = {
    clearInvite(){try{localStorage.removeItem(storageKey);}catch{}},
    async init(api, toast){
      let data, kind='ledger', page=1, requestKey=crypto.randomUUID(), busy=false, sequence=0;
      const error = e => {$('#referral-error').textContent=e.message;$('#referral-error').hidden=false;toast(e.message);};
      const preview = () => {
        const raw = $('#referral-withdraw-form').elements.points.value;
        const cents = Math.round(Number(raw || 100)*100);
        const bps = Math.round(Number(data.settings.withdrawalFeePercent)*100);
        const fee = Math.floor(cents*bps/10000);
        $('#referral-fee-preview').textContent=`手续费 ${data.settings.withdrawalFeePercent}%：${(fee/100).toFixed(2)} 积分；预计到账 ${(Math.max(0,cents-fee)/100).toFixed(2)} 元。`;
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
        // 这里曾经直接展示 balance，于是「可用」把已申请提现的钱也算进去了，
        // 用户看着 100 积分却提不出来。
        const available = Math.max(0, Number(w?.balance || 0) - Number(w?.frozen || 0));
        $('#referral-stats').innerHTML=[['可用积分',available],['提现中积分',w?.frozen],['累计净奖励',w?.earned],['已提现积分',w?.withdrawn]].map(([label,v])=>`<article><small>${label}</small><strong>${esc(typeof v === 'number' ? v.toFixed(2) : (v||'0.00'))}</strong><small>积分</small></article>`).join('');
        $('#referral-withdraw-form button').disabled=!w || available<100 || Number(w.frozen)>0;
        $('#referral-guide-reward').textContent=`好友注册后，实际支付成功的订单，按实付金额的 ${s.ratePercent}% 奖励积分。注册本身不发积分，支付成功后自动入账。`;
        $('#referral-guide-fee').textContent=`1 积分等于 1 元，满 100 积分可以申请提现。当前手续费 ${s.withdrawalFeePercent}%，申请 100 积分，扣除 ${s.withdrawalFeePercent} 积分手续费，实际到账 ${(100-Number(s.withdrawalFeePercent)).toFixed(2)} 元。手续费不足 0.01 部分舍去。`;
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
        }catch(err){error(err);await refresh().catch(()=>{});}finally{busy=false;const avail=Math.max(0,Number(data?.wallet?.balance||0)-Number(data?.wallet?.frozen||0));form.querySelector('button').disabled=!data?.wallet||avail<100||Number(data?.wallet?.frozen)>0;}
      };
      document.querySelectorAll('[data-referral-history]').forEach(b=>b.onclick=()=>{kind=b.dataset.referralHistory;page=1;document.querySelectorAll('[data-referral-history]').forEach(x=>{x.classList.toggle('hb-button--primary',x===b);x.classList.toggle('hb-button--secondary',x!==b);});history().catch(error);});
      $('#referral-prev').onclick=()=>{page--;history().catch(error);};$('#referral-next').onclick=()=>{page++;history().catch(error);};
      await refresh();await history();
    }
  };
})();
