window.MixAllNotifications = (() => {
  function session() { try { return JSON.parse(localStorage.getItem('netrify_session') || 'null'); } catch { return null; } }
  async function api(body) { const s=session(); if (!s?.token) throw new Error('ログインが必要です'); const res=await fetch('/.netlify/functions/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,token:s.token})}); const data=await res.json(); if(!res.ok) throw new Error(data.error || '通知処理に失敗しました'); return data; }
  async function init(scope, rootId) {
    const root=document.getElementById(rootId); if(!root) return;
    try { const data=await api({action:'getSettings',scope}); const s=data.settings||{}; root.innerHTML=`<strong>通知設定</strong><label class="row"><input type="checkbox" data-notify="reply" style="width:auto" ${s.reply?'checked':''}>自分への返信を受け取る</label><label class="row"><input type="checkbox" data-notify="all" style="width:auto" ${s.all?'checked':''}>すべてのメッセージを受け取る</label><label class="row"><input type="checkbox" data-notify="mention" style="width:auto" ${s.mention?'checked':''}>メンションを受け取る</label><button type="button" class="secondary" data-notify-permission>ブラウザ通知をON</button><span class="muted" data-notify-status></span>`;
      const save=async()=>{const settings={};root.querySelectorAll('[data-notify]').forEach(e=>settings[e.dataset.notify]=e.checked);await api({action:'saveSettings',scope,settings});};
      root.querySelectorAll('[data-notify]').forEach(e=>e.addEventListener('change',()=>save().catch(err=>alert(err.message))));
      root.querySelector('[data-notify-permission]').onclick=async()=>{if(!('Notification' in window)){alert('このブラウザは通知に対応していません');return;} const p=await Notification.requestPermission();root.querySelector('[data-notify-status]').textContent=p==='granted'?' 通知を許可しました':' 通知は許可されませんでした';};
    } catch(error) { root.textContent=error.message; }
  }
  async function poll(scope) { try { const data=await api({action:'getSettings',scope}); const list=(data.notifications||[]).filter((item)=>item.scope===scope); const lastKey=`mixall-notify-${scope}`; const last=Number(localStorage.getItem(lastKey)||0); const fresh=list.filter(n=>new Date(n.createdAt).getTime()>last); if(fresh.length&&'Notification' in window&&Notification.permission==='granted'){fresh.slice(0,3).reverse().forEach(n=>new Notification(n.title||'MixAll +通知',{body:n.body||'新しいメッセージがあります'}));} if(list.length)localStorage.setItem(lastKey,String(Math.max(last,...list.map(n=>new Date(n.createdAt).getTime())))); } catch(_) {} }
  return { init, poll };
})();
