/* 学校モード 画面ロジック: 生徒(学校コード・画面共有・課題) / 教員(学校コード・生徒画面・クイズ) / 運営 */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('app');
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }, { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }] };
  (async () => { try { const ss = Netrify.getSession(); const r = await Netrify.api('/api/calls', { token: ss.token, action: 'ice' }); if (r && r.iceServers) ICE.iceServers = r.iceServers; } catch (_) {} })();
  let S = null; try { S = Netrify.getSession(); } catch (_) {}
  let me = null, timers = [];

  async function api(action, body) {
    const res = await fetch('/api/school', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token: S && S.token, ...(body || {}) }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || '通信に失敗しました（' + res.status + '）');
    return d;
  }
  const toast = (m) => alert(m);
  const card = (inner, id) => '<div class="card"' + (id ? ' id="' + id + '"' : '') + '>' + inner + '</div>';
  const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
  const every = (fn, ms) => { timers.push(setInterval(() => { if (!document.hidden) fn().catch(() => {}); }, ms)); };
  function waitIce(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => { pc.removeEventListener('icegatheringstatechange', chk); resolve(); };
      const chk = () => { if (pc.iceGatheringState === 'complete') done(); };
      pc.addEventListener('icegatheringstatechange', chk); setTimeout(done, 3000);
    });
  }
  const modal = (html) => { closeModal(); const m = document.createElement('div'); m.className = 'sc-modal'; m.id = 'scModal'; m.innerHTML = '<div class="sc-box">' + html + '</div>'; document.body.appendChild(m); return m; };
  const closeModal = () => { const m = $('scModal'); if (m) m.remove(); };

  // ================= 表示の入口 =================
  async function init() {
    if (!S) { app.innerHTML = card('<h2>🏫 学校モード</h2><p class="muted">学校のメールアドレスで、生徒・教員として登録できます。先生は問題を出し、生徒は課題に答え、画面を先生に共有できます。</p><div class="row"><a class="button" href="/school/register/">学校モードで新規登録</a><a class="button secondary" href="/login/?next=/school/">ログイン</a></div>'); return; }
    try { me = await api('me'); } catch (e) { app.innerHTML = card('<p class="error">' + esc(e.message) + '</p>'); return; }
    render();
  }
  function render() {
    clearTimers();
    if (!me.profile) {
      app.innerHTML = card('<h2>🏫 学校モード</h2><p class="muted">このアカウントは、まだ学校モードに登録されていません。学校から配られたメールアドレスで確認します。</p><a class="button" href="/school/register/">学校モードに登録する</a>') + teacherCodeCard() + adminHtml();
      bindAdmin(); bindTeacherCode(); return;
    }
    if (me.profile.role === 'teacher') renderTeacher(); else renderStudent();
    bindAdmin();
  }

  // ================= 生徒 =================
  let share = null;
  function renderStudent() {
    const p = me.profile;
    let html = card('<h2>🏫 学校モード <span class="sc-badge info">生徒</span></h2><p class="muted" style="margin:0">学校: ' + esc(p.domain) + (me.class ? ' ／ 先生: ' + esc(me.class.teacher) : '') + '</p>');
    if (!p.classCode) {
      html += card('<h3>先生の「学校コード」を入力</h3><p class="muted">先生の画面に表示されている6文字のコードを入力します。</p><div class="row"><input id="scCode" maxlength="6" placeholder="ABC123" autocapitalize="characters" style="flex:1;text-transform:uppercase;letter-spacing:.3em;font-size:1.3rem;text-align:center"><button id="scJoin">参加する</button></div><div class="error" id="scErr"></div>');
      html += teacherCodeCard();
      app.innerHTML = html + adminHtml(); bindTeacherCode();
      $('scJoin').onclick = async () => { $('scErr').textContent = ''; try { await api('join', { code: $('scCode').value }); me = await api('me'); render(); } catch (e) { $('scErr').textContent = e.message; } };
      return;
    }
    html += card('<h3>🖥️ 画面を先生に共有</h3><p class="muted" style="margin-top:0">「画面全体」を共有します。共有中は、画面の上に赤いバーが表示されます。いつでも自分で止められます。共有した映像は、先生の端末へ直接送られ、保存されません。</p><div class="row"><button id="scShareStart">共有を始める</button><span id="scShareState" class="muted"></span></div>', 'scShareCard');
    html += card('<h3>📝 課題</h3><div id="scAssign"><p class="muted">読み込み中...</p></div>');
    html += card('<button class="ghost" id="scLeave">この学校コードから抜ける</button>');
    app.innerHTML = html + adminHtml();
    $('scShareStart').onclick = startShare;
    $('scLeave').onclick = async () => { if (!confirm('学校コードから抜けますか？')) return; stopShare(); await api('leave'); me = await api('me'); render(); };
    updateShareUi(); loadAssignments(); every(loadAssignments, 20000);
  }
  function updateShareUi() {
    const on = !!share, b = $('scShareStart'), st = $('scShareState');
    $('scShareBar').style.display = on ? 'flex' : 'none';
    if (b) { b.textContent = on ? '共有を止める' : '共有を始める'; b.onclick = on ? stopShare : startShare; }
    if (st) st.textContent = on ? '共有中' : '共有していません';
  }
  $('scShareStop').onclick = () => stopShare();
  async function startShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { toast('この端末のブラウザは画面共有に対応していません。パソコンのChrome・Edge・Safariなどで開いてください。'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor', frameRate: { ideal: 10, max: 15 }, width: { max: 1920 }, height: { max: 1080 } }, audio: false }); }
    catch (e) { if (e.name !== 'NotAllowedError') toast('画面共有を始められませんでした: ' + e.message); return; }
    const track = stream.getVideoTracks()[0], surface = track.getSettings && track.getSettings().displaySurface;
    if (surface && surface !== 'monitor') { stream.getTracks().forEach((t) => t.stop()); toast('「画面全体」を選んで共有してください。（ウィンドウやタブだけでは共有できません）'); return; }
    share = { stream, pc: null, sessionId: '', retry: 0 };
    track.addEventListener('ended', () => stopShare());
    updateShareUi();
    try { await negotiate(); } catch (e) { toast('先生へ接続できませんでした: ' + e.message); stopShare(); return; }
    const beat = async () => { if (share) await api('beat', { sharing: true, sessionId: share.sessionId }); };
    timers.push(setInterval(() => beat().catch(() => {}), 5000));
    timers.push(setInterval(() => pollAnswer().catch(() => {}), 1500));
  }
  async function negotiate() {
    if (!share) return;
    if (share.pc) { try { share.pc.close(); } catch (_) {} }
    share.sessionId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const pc = new RTCPeerConnection(ICE); share.pc = pc;
    share.stream.getTracks().forEach((t) => pc.addTrack(t, share.stream));
    pc.onconnectionstatechange = () => { if (share && share.pc === pc && pc.connectionState === 'failed' && share.retry < 5) { share.retry++; setTimeout(() => negotiate().catch(() => {}), 1500); } };
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    await api('signalPut', { sessionId: share.sessionId, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    await api('beat', { sharing: true, sessionId: share.sessionId });
    try { for (const s of pc.getSenders()) { if (s.track && s.track.kind === 'video') { const prm = s.getParameters(); prm.encodings = prm.encodings && prm.encodings.length ? prm.encodings : [{}]; prm.encodings[0].maxBitrate = 700000; await s.setParameters(prm); } } } catch (_) {}
  }
  async function pollAnswer() {
    if (!share || !share.pc || share.pc.signalingState !== 'have-local-offer') return;
    const r = await api('signalGet'); const g = r.signal;
    if (g && g.sessionId === share.sessionId && g.sdp && g.sdp.type === 'answer') await share.pc.setRemoteDescription(g.sdp);
  }
  function stopShare() {
    if (!share) return;
    const s = share; share = null;
    try { s.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    try { s.pc && s.pc.close(); } catch (_) {}
    api('beat', { sharing: false, sessionId: '' }).catch(() => {});
    updateShareUi();
  }
  window.addEventListener('beforeunload', () => { if (share) { try { navigator.sendBeacon('/api/school', new Blob([JSON.stringify({ action: 'beat', token: S.token, sharing: false })], { type: 'application/json' })); } catch (_) {} } });

  // ----- 生徒: 課題一覧 -----
  async function loadAssignments() {
    const box = $('scAssign'); if (!box) return;
    const d = await api('quizList');
    if (!d.quizzes.length) { box.innerHTML = '<p class="muted">いま出されている課題はありません。</p>'; return; }
    box.innerHTML = d.quizzes.map((q) => '<div class="row" style="justify-content:space-between;border-top:1px solid var(--border);padding:8px 0"><div><strong>' + esc(q.title) + '</strong><div class="muted" style="font-size:.85rem">' + q.count + '問' + (q.dueAt ? ' ／ 〆切 ' + esc(q.dueAt) : '') + '</div></div><div>' + (q.finished ? '<span class="sc-badge ok">完了 ' + q.total + '点</span>' : '') + '<button data-play="' + esc(q.id) + '" class="' + (q.finished ? 'secondary' : '') + '">' + (q.finished ? '結果を見る' : q.started ? '続きから' : 'はじめる') + '</button></div></div>').join('');
    box.querySelectorAll('[data-play]').forEach((b) => { b.onclick = () => play(b.dataset.play); });
  }

  // ================= Kahoot風プレイ =================
  const SHAPES = ['▲', '◆', '●', '■'];
  async function play(id) {
    const root = $('scPlay'); root.style.display = 'flex';
    let tick = null;
    const close = () => { clearInterval(tick); root.style.display = 'none'; root.innerHTML = ''; loadAssignments(); };
    const top = (cur, tot, score) => '<div class="p-top"><span>' + (tot ? cur + ' / ' + tot : '') + '</span><span>' + score + ' 点</span><button class="p-btn" style="padding:4px 12px;font-size:.85rem" id="pClose">やめる</button></div>';
    const bindClose = () => { const c = $('pClose'); if (c) c.onclick = () => { if (confirm('途中でやめますか？（あとで続きから再開できます）')) close(); }; };
    const showDone = (d) => {
      clearInterval(tick);
      const rows = (d.rows || []).map((r, i) => '<div class="' + (r.email === d.you ? 'me' : '') + '"><span>' + (i + 1) + '. ' + esc(r.name) + '</span><span>' + r.total + '</span></div>').join('');
      root.innerHTML = '<div class="p-top"><span>結果</span><span>' + d.total + ' 点</span><button class="p-btn" style="padding:4px 12px;font-size:.85rem" id="pEnd">閉じる</button></div><div class="p-main"><div class="p-feedback"><h2>🎉 おつかれさま！</h2><div style="font-size:1.4rem">あなたの得点: <strong>' + d.total + '</strong> 点</div><h3 style="margin:8px 0 0">クラスのトップ5</h3><div class="p-board">' + (rows || '<div><span>まだ記録がありません</span></div>') + '</div></div></div>';
      $('pEnd').onclick = close;
    };
    const showQuestion = (q, score, secondsLeft) => {
      clearInterval(tick);
      root.innerHTML = top(q.index + 1, q.total, score) + '<div class="p-main"><div class="p-q">' + esc(q.text) + '</div><div class="p-timer"><i id="pBar"></i></div><div class="p-choices">' + q.choices.map((c, i) => c ? '<button class="c' + i + '" data-c="' + i + '"><span class="shape">' + SHAPES[i] + '</span><span>' + esc(c) + '</span></button>' : '<span></span>').join('') + '</div></div>';
      bindClose();
      let left = secondsLeft || q.timeSec, answered = false;
      const bar = $('pBar'); const total = q.timeSec;
      const setBar = () => { bar.style.transform = 'scaleX(' + Math.max(0, left / total) + ')'; };
      setBar();
      const send = async (choice) => {
        if (answered) return; answered = true; clearInterval(tick);
        root.querySelectorAll('.p-choices button').forEach((b) => { b.disabled = true; });
        try { const r = await api('quizAnswer', { id, choice }); showResult(q, r.result, r.total, choice); } catch (e) { toast(e.message); close(); }
      };
      root.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => send(Number(b.dataset.c)); });
      tick = setInterval(() => { left -= 1; setBar(); if (left <= 0) send(-1); }, 1000);
    };
    const showResult = (q, r, score, choice) => {
      const ok = r.correct;
      root.innerHTML = top(q.index + 1, q.total, score) + '<div class="p-feedback ' + (ok ? 'ok' : 'ng') + '"><h2>' + (ok ? '✓ 正解！' : choice === -1 ? '⏰ 時間切れ' : '✗ 不正解') + '</h2>' + (ok ? '<div style="font-size:1.6rem;font-weight:800">+' + r.points + ' 点</div>' : '<div>正解: ' + SHAPES[r.correctIndex] + ' ' + esc(q.choices[r.correctIndex]) + '</div>') + '<button class="p-btn" id="pNext">' + (q.index + 1 >= q.total ? '結果を見る' : '次の問題へ') + '</button></div>';
      bindClose();
      $('pNext').onclick = async () => { try { const n = await api('quizNext', { id }); if (n.done) showDone(n); else showQuestion(n.question, n.total, n.secondsLeft); } catch (e) { toast(e.message); close(); } };
    };
    try {
      const s = await api('quizStart', { id });
      if (s.done) showDone(s);
      else if (s.awaiting) showResult(s.question, s.result, s.total, s.result.choice);
      else showQuestion(s.question, s.total, s.secondsLeft);
    } catch (e) { toast(e.message); close(); }
  }

  // ================= 教員 =================
  const conns = new Map();
  let lastStudents = [];
  function renderTeacher() {
    const c = me.class || { code: me.profile.classCode, students: 0 };
    app.innerHTML =
      card('<h2>🏫 学校モード <span class="sc-badge info">教員</span></h2><p class="muted" style="margin:0">学校: ' + esc(me.profile.domain) + '</p>') +
      card('<h3>学校コード</h3><p class="muted" style="margin:0">生徒に、このコードを入力してもらいます。</p><div class="sc-code" id="scCodeShow">' + esc(c.code) + '</div><div class="row"><button id="scCopy" class="secondary">コピー</button><button id="scRotate" class="ghost">コードを作り直す</button></div><p class="muted" style="font-size:.85rem">作り直すと古いコードは使えなくなります。すでに参加した生徒はそのままです。</p>') +
      card('<h3>👩‍🎓 生徒の画面 <span class="muted" id="scCount" style="font-size:.85rem"></span></h3><p class="muted" style="margin-top:0">生徒が共有を始めると、ここに画面が表示されます。画面をタップすると全画面になります。</p><div class="sc-tiles" id="scTiles"></div>') +
      card('<div class="row" style="justify-content:space-between"><h3 style="margin:0">📝 クイズ課題</h3><button id="scNewQuiz">＋ 新しいクイズ</button></div><div id="scQuizList"><p class="muted">読み込み中...</p></div>') + adminHtml();
    $('scCopy').onclick = async () => { try { await navigator.clipboard.writeText(c.code); toast('コピーしました'); } catch (_) { toast('コード: ' + c.code); } };
    $('scRotate').onclick = async () => { if (!confirm('学校コードを作り直しますか？')) return; try { const r = await api('rotateCode'); me = await api('me'); render(); } catch (e) { toast(e.message); } };
    $('scNewQuiz').onclick = () => editQuiz(null);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.sc-tile.big').forEach((t) => t.classList.remove('big')); });
    pollClass().catch(() => {}); every(pollClass, 2000); loadQuizzes();
  }
  async function pollClass() {
    const d = await api('classState'); lastStudents = d.students;
    const box = $('scTiles'); if (!box) return;
    $('scCount').textContent = '(' + d.students.filter((s) => s.online).length + ' / ' + d.students.length + ' 人オンライン)';
    const want = new Set(d.students.map((s) => s.email));
    box.querySelectorAll('.sc-tile').forEach((t) => { if (!want.has(t.dataset.e)) { closeConn(t.dataset.e); t.remove(); } });
    for (const s of d.students) {
      let t = box.querySelector('.sc-tile[data-e="' + CSS.escape(s.email) + '"]');
      if (!t) {
        t = document.createElement('div'); t.className = 'sc-tile'; t.dataset.e = s.email;
        t.innerHTML = '<video autoplay playsinline muted></video><div class="sc-empty"></div><div class="sc-name"><span class="sc-dot"></span><span class="n"></span><small class="st"></small><button class="sc-x" type="button">外す</button></div>';
        t.querySelector('.n').textContent = s.name;
        t.querySelector('video').onclick = () => t.classList.toggle('big');
        t.querySelector('.sc-x').onclick = async () => { if (!confirm(s.name + ' さんをクラスから外しますか？')) return; try { await api('removeStudent', { student: s.email }); closeConn(s.email); t.remove(); } catch (e) { toast(e.message); } };
        box.appendChild(t);
      }
      t.classList.toggle('online', s.online);
      t.querySelector('.st').textContent = s.sharing ? '共有中' : s.online ? 'オンライン' : 'オフライン';
      t.querySelector('.sc-empty').textContent = s.online ? '画面は共有されていません' : 'オフライン';
      if (!s.sharing) { closeConn(s.email); t.classList.remove('live'); }
      else ensureConn(s, t);
    }
  }
  function closeConn(email) { const c = conns.get(email); if (c) { try { c.pc && c.pc.close(); } catch (_) {} conns.delete(email); } const t = document.querySelector('.sc-tile[data-e="' + CSS.escape(email) + '"]'); if (t) { t.classList.remove('live'); const v = t.querySelector('video'); if (v) v.srcObject = null; } }
  async function ensureConn(st, tile) {
    const c = conns.get(st.email);
    if (c && c.sessionId === st.sessionId && c.pc && !['failed', 'closed'].includes(c.pc.connectionState)) return;
    if (c) closeConn(st.email);
    const rec = { sessionId: st.sessionId, pc: null }; conns.set(st.email, rec);
    try {
      const r = await api('signalGet', { student: st.email }); const g = r.signal;
      if (!g || g.sessionId !== st.sessionId || !g.sdp || g.sdp.type !== 'offer') { conns.delete(st.email); return; }
      const pc = new RTCPeerConnection(ICE); rec.pc = pc;
      pc.ontrack = (e) => { const v = tile.querySelector('video'); if (v.srcObject !== e.streams[0]) { v.srcObject = e.streams[0]; v.play && v.play().catch(() => {}); } tile.classList.add('live'); };
      await pc.setRemoteDescription(g.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      await api('signalPut', { student: st.email, sessionId: st.sessionId, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } catch (_) { conns.delete(st.email); }
  }

  // ----- 教員: クイズ -----
  async function loadQuizzes() {
    const box = $('scQuizList'); if (!box) return;
    const d = await api('quizList');
    if (!d.quizzes.length) { box.innerHTML = '<p class="muted">まだクイズがありません。「＋ 新しいクイズ」から作成してください。</p>'; return; }
    box.innerHTML = d.quizzes.map((q) => '<div style="border-top:1px solid var(--border);padding:10px 0"><div class="row" style="justify-content:space-between"><div><strong>' + esc(q.title) + '</strong> <span class="sc-badge ' + (q.status === 'published' ? 'ok' : 'off') + '">' + (q.status === 'published' ? '公開中' : '下書き') + '</span><div class="muted" style="font-size:.85rem">' + q.questions.length + '問' + (q.status === 'published' ? ' ／ 回答 ' + q.attempts + ' / ' + q.students + '人' : '') + (q.dueAt ? ' ／ 〆切 ' + esc(q.dueAt) : '') + '</div></div></div><div class="row" style="margin-top:6px"><button class="secondary" data-edit="' + esc(q.id) + '">編集</button>' + (q.status === 'published' ? '<button class="secondary" data-res="' + esc(q.id) + '">結果</button><button class="ghost" data-unpub="' + esc(q.id) + '">非公開にする</button>' : '<button data-pub="' + esc(q.id) + '">公開する</button>') + '<button class="ghost" data-del="' + esc(q.id) + '">削除</button></div></div>').join('');
    const byId = Object.fromEntries(d.quizzes.map((q) => [q.id, q]));
    box.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => editQuiz(byId[b.dataset.edit]); });
    box.querySelectorAll('[data-pub]').forEach((b) => { b.onclick = () => publishQuiz(b.dataset.pub); });
    box.querySelectorAll('[data-unpub]').forEach((b) => { b.onclick = async () => { await api('quizPublish', { id: b.dataset.unpub, publish: false }); loadQuizzes(); }; });
    box.querySelectorAll('[data-res]').forEach((b) => { b.onclick = () => showResults(b.dataset.res); });
    box.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('このクイズと、生徒の回答をすべて削除しますか？')) return; try { await api('quizDelete', { id: b.dataset.del }); loadQuizzes(); } catch (e) { toast(e.message); } }; });
  }
  function publishQuiz(id) {
    const m = modal('<h3>課題として公開</h3><p class="muted">公開すると、クラスの生徒の「課題」に表示されます。</p><label>〆切(任意)</label><input type="date" id="scDue"><div class="row"><button id="scDoPub">公開する</button><button class="ghost" id="scCancel">キャンセル</button></div>');
    $('scCancel').onclick = closeModal;
    $('scDoPub').onclick = async () => { try { await api('quizPublish', { id, publish: true, dueAt: $('scDue').value }); closeModal(); loadQuizzes(); } catch (e) { toast(e.message); } };
  }
  function editQuiz(q) {
    const data = q ? JSON.parse(JSON.stringify({ id: q.id, title: q.title, questions: q.questions })) : { title: '', questions: [] };
    if (!data.questions.length) data.questions.push({ text: '', choices: ['', '', '', ''], correct: 0, timeSec: 20 });
    data.questions.forEach((x) => { while (x.choices.length < 4) x.choices.push(''); });
    const draw = () => {
      const m = modal('<h3>' + (q ? 'クイズを編集' : '新しいクイズ') + '</h3><input id="qzTitle" placeholder="クイズのタイトル" maxlength="80" value="' + esc(data.title) + '"><div id="qzList">' + data.questions.map((x, i) =>
        '<div class="sc-q" data-i="' + i + '"><div class="row" style="justify-content:space-between"><strong>' + (i + 1) + '問目</strong><button class="ghost" data-rm="' + i + '" type="button">この問題を削除</button></div><input data-f="text" placeholder="問題文" maxlength="200" value="' + esc(x.text) + '">' +
        x.choices.map((c, k) => '<div class="sc-ch"><span class="c' + k + '" style="display:inline-flex;width:30px;height:30px;border-radius:6px;color:#fff;align-items:center;justify-content:center">' + SHAPES[k] + '</span><input type="text" data-f="c' + k + '" placeholder="選択肢' + (k + 1) + (k >= 2 ? '(なくてもOK)' : '') + '" maxlength="80" value="' + esc(c) + '"><label class="row muted" style="margin:0;gap:4px"><input type="radio" name="ok' + i + '" data-f="ok" value="' + k + '"' + (x.correct === k ? ' checked' : '') + '>正解</label></div>').join('') +
        '<div class="row"><label class="muted" style="margin:0">制限時間</label><select data-f="time">' + [10, 20, 30, 60].map((s) => '<option value="' + s + '"' + (x.timeSec === s ? ' selected' : '') + '>' + s + '秒</option>').join('') + '</select></div></div>').join('') +
        '</div><button class="secondary" id="qzAdd" type="button">＋ 問題を追加</button><div class="error" id="qzErr"></div><div class="row" style="margin-top:10px"><button id="qzSave">保存する</button><button class="ghost" id="qzCancel">閉じる</button></div>');
      const collect = () => {
        data.title = $('qzTitle').value;
        m.querySelectorAll('.sc-q').forEach((el) => { const x = data.questions[Number(el.dataset.i)]; x.text = el.querySelector('[data-f=text]').value; for (let k = 0; k < 4; k++) x.choices[k] = el.querySelector('[data-f=c' + k + ']').value; const r = el.querySelector('[data-f=ok]:checked'); x.correct = r ? Number(r.value) : 0; x.timeSec = Number(el.querySelector('[data-f=time]').value); });
      };
      $('qzAdd').onclick = () => { collect(); data.questions.push({ text: '', choices: ['', '', '', ''], correct: 0, timeSec: 20 }); draw(); };
      m.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { collect(); if (data.questions.length > 1) data.questions.splice(Number(b.dataset.rm), 1); draw(); }; });
      $('qzCancel').onclick = closeModal;
      $('qzSave').onclick = async () => {
        collect(); $('qzErr').textContent = '';
        const payload = { id: data.id, title: data.title, questions: data.questions.map((x) => { const choices = x.choices.map((c) => c.trim()); while (choices.length && !choices[choices.length - 1]) choices.pop(); return { text: x.text, choices, correct: x.correct, timeSec: x.timeSec }; }) };
        try { const r = await api('quizSave', { quiz: payload }); data.id = r.quiz.id; closeModal(); loadQuizzes(); } catch (e) { $('qzErr').textContent = e.message; }
      };
    };
    draw();
  }
  async function showResults(id) {
    try {
      const d = await api('quizResults', { id });
      modal('<h3>結果: ' + esc(d.title) + '</h3><h4>得点ランキング</h4>' + (d.rows.length ? '<table class="sc-table"><tr><th>#</th><th>名前</th><th>得点</th><th>正解</th><th></th></tr>' + d.rows.map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + r.total + '</td><td>' + r.correct + ' / ' + r.answered + '</td><td>' + (r.finished ? '完了' : '途中') + '</td></tr>').join('') + '</table>' : '<p class="muted">まだ回答がありません。</p>') +
        '<h4>問題ごとの正答率</h4>' + d.questions.map((q, i) => { const pct = q.answered ? Math.round(q.correct * 100 / q.answered) : 0; return '<div style="margin:8px 0"><div style="font-size:.9rem">' + (i + 1) + '. ' + esc(q.text) + ' <span class="muted">(' + q.correct + '/' + q.answered + ')</span></div><div class="sc-bar"><i style="width:' + pct + '%"></i></div></div>'; }).join('') +
        (d.notYet.length ? '<h4>まだ回答していない生徒</h4><p class="muted">' + d.notYet.map((x) => esc(x.name)).join('、') + '</p>' : '') + '<button id="scResClose" class="ghost">閉じる</button>');
      $('scResClose').onclick = closeModal;
    } catch (e) { toast(e.message); }
  }

  // ================= 運営 =================
  function teacherCodeCard() { return card('<h3>教員の方へ</h3><p class="muted">運営が発行した「教員ログインコード」を入力すると、教員になれます。</p><div class="row"><input id="scTCode" placeholder="XXXXX-XXXXX" autocapitalize="characters" style="flex:1;text-transform:uppercase;letter-spacing:.15em"><button id="scTCodeGo">教員になる</button></div><div class="error" id="scTErr"></div>'); }
  function bindTeacherCode() { const g = $('scTCodeGo'); if (!g) return; g.onclick = async () => { $('scTErr').textContent = ''; try { await api('redeemTeacherCode', { teacherCode: $('scTCode').value }); me = await api('me'); render(); } catch (e) { $('scTErr').textContent = e.message; } }; }
  function adminHtml() { return me && me.isAdmin ? card('<h3>🛠 運営: 学校モードの管理</h3><div id="scAdmin"><button class="secondary" id="scAdminLoad">教員の申請・ドメイン設定を開く</button></div>') : ''; }
  function bindAdmin() {
    const b = $('scAdminLoad'); if (!b) return;
    b.onclick = async () => {
      try {
        const d = await api('adminList');
        $('scAdmin').innerHTML = '<h4>教員ログインコード</h4><p class="muted" style="margin-top:0">発行したコードを教員に渡してください（1コードにつき1人、1回だけ使えます）。</p><div class="row"><input id="scTNote" placeholder="メモ（例: 山田先生）" style="flex:1"><button id="scTIssue">コードを発行</button></div><div id="scTNew" style="font-size:1.3rem;letter-spacing:.15em;font-weight:700;margin:8px 0"></div>' + (d.codes && d.codes.length ? '<ul>' + d.codes.map((c) => '<li><code>' + esc(c.code) + '</code> ' + esc(c.note) + ' — ' + (c.usedBy ? '使用済み(' + esc(c.usedBy) + ')' : '未使用 <button class="ghost" data-rv="' + esc(c.code) + '">取消</button>') + '</li>').join('') + '</ul>' : '') + '<h4>教員の申請</h4>' + (d.requests.length ? d.requests.map((r) => '<div class="row" style="justify-content:space-between;border-top:1px solid var(--border);padding:6px 0"><div>' + esc(r.name) + ' <span class="muted">(' + esc(r.schoolEmail) + ')</span></div><div><button data-ok="' + esc(r.email) + '">承認</button> <button class="ghost" data-ng="' + esc(r.email) + '">却下</button></div></div>').join('') : '<p class="muted">申請はありません。</p>') +
          '<h4>ドメインの設定</h4><p class="muted" style="margin-top:0">学校として自動判定されないドメインを承認したり、使えないようにしたりできます。</p><div class="row"><input id="scDom" placeholder="例: abc-school.example.com" style="flex:1"><button data-dom="approved">承認</button><button class="ghost" data-dom="denied">拒否</button><button class="ghost" data-dom="clear">解除</button></div>' +
          (d.domains.length ? '<ul>' + d.domains.map((x) => '<li>' + esc(x.domain) + ' — ' + (x.status === 'denied' ? '拒否' : '承認') + '</li>').join('') + '</ul>' : '');
        $('scAdmin').querySelectorAll('[data-ok],[data-ng]').forEach((x) => { x.onclick = async () => { await api('adminResolveRequest', { email: x.dataset.ok || x.dataset.ng, approve: !!x.dataset.ok }); b.onclick(); }; });
        $('scTIssue').onclick = async () => { try { const r = await api('adminIssueTeacherCode', { note: $('scTNote').value }); $('scTNew').textContent = r.code; toast('発行しました。コピーして教員に渡してください'); } catch (e) { toast(e.message); } };
        $('scAdmin').querySelectorAll('[data-rv]').forEach((x) => { x.onclick = async () => { try { await api('adminRevokeTeacherCode', { code: x.dataset.rv }); b.onclick(); } catch (e) { toast(e.message); } }; });
        $('scAdmin').querySelectorAll('[data-dom]').forEach((x) => { x.onclick = async () => { try { await api('adminSetDomain', { domain: $('scDom').value, status: x.dataset.dom }); toast('設定しました'); b.onclick(); } catch (e) { toast(e.message); } }; });
      } catch (e) { toast(e.message); }
    };
  }

  init();
})();
