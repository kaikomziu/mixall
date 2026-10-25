(() => {
  const boot = () => {
    const session = window.Netrify?.getSession?.();
    if (!session || !window.RTCPeerConnection) return;
    const peers = new Map();
    const seenSignals = new Map();
    let activeCall = null;
    let ringtoneTimer = null;
    let audioContext = null;
    let callStartedAt = null;
    const esc = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const panel = document.createElement('section');
    panel.id = 'callPanel';
    panel.innerHTML = `<div id="callNotice" class="call-notice" hidden></div><div id="missedCalls" class="call-missed" hidden></div>
<div id="callWindow" class="call-window cw s-ring" hidden>
  <div class="cw-bg"></div>
  <video id="remoteVideo" autoplay playsinline muted></video><audio id="remoteAudio" autoplay playsinline></audio>
  <video id="localVideo" class="cw-pip" autoplay playsinline muted></video>
  <div class="cw-id"><div class="cw-av" id="cwAv">?</div><div class="cw-name" id="callTitle">通話</div><div class="cw-sub"><span id="callTimer"></span><span class="cw-dots" id="cwDots"><i></i><i></i><i></i></span></div><div id="callStatus" class="cw-status"></div></div>
  <div class="cw-wave" id="cwWave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="cw-top"><button type="button" id="cwMoreBtn" aria-label="メニュー">⋮</button></div>
  <div class="cw-party" id="cwParty" hidden><div class="cw-party-bar"><input id="cwPartyUrl" type="text" inputmode="url" placeholder="YouTubeやサイトのURL" autocapitalize="off" spellcheck="false"><button type="button" id="cwPartyGo">開く</button><button type="button" id="cwPartyClose">✕</button></div><iframe id="cwPartyFrame" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="no-referrer"></iframe><div class="cw-party-note">相手の画面にも同じページが開きます(通話はそのまま続きます)</div></div>
  <div class="cw-bar">
    <button type="button" class="cw-b b-mic" id="toggleMute"><span class="ic"></span><span class="lb"></span></button>
    <button type="button" class="cw-b b-cam" id="toggleCamera"><span class="ic"></span><span class="lb"></span></button>
    <div class="cw-endrow"><button type="button" class="cw-end" id="endCall" aria-label="通話を終了">✕</button></div>
    <button type="button" class="cw-b b-spk" id="toggleSpeaker"><span class="ic"></span><span class="lb"></span></button>
    <button type="button" class="cw-b b-party" id="cwPartyBtn"><span class="ic"></span><span class="lb">パーティー<br>機能</span></button>
  </div>
  <div class="cw-more" id="cwMore" hidden>
    <div class="call-health"><span id="micHealth">マイク: 準備中</span><span id="sendHealth">音声送信: 待機中</span><span id="remoteHealth">相手の音声: 待機中</span><span id="speakerHealth">スピーカー: 確認中</span><span id="netDiag">経路: -</span></div>
    <div class="call-meter"><span>送信</span><meter id="micMeter" min="0" max="1" value="0"></meter><span>受信</span><meter id="remoteMeter" min="0" max="1" value="0"></meter></div>
    <div class="call-devices"><label>マイク <select id="devMic"></select></label><label>カメラ <select id="devCam"></select></label><label>スピーカー <select id="devOut"></select></label></div>
    <div class="call-controls"><button type="button" class="ghost" id="enableAudio">音声を有効化</button><button type="button" class="ghost" id="testSpeaker">スピーカーテスト</button><button type="button" class="ghost" id="shareScreen">画面共有</button><button type="button" class="ghost" id="restartCall">再接続</button></div>
  </div>
</div>`;
    document.body.appendChild(panel);
    const notice = panel.querySelector('#callNotice'); const missed = panel.querySelector('#missedCalls'); const win = panel.querySelector('#callWindow');
    const remoteVideo = panel.querySelector('#remoteVideo'); const localVideo = panel.querySelector('#localVideo'); const remoteAudio = panel.querySelector('#remoteAudio'); const status = panel.querySelector('#callStatus'); const timer = panel.querySelector('#callTimer'); const micHealth = panel.querySelector('#micHealth'); const sendHealth = panel.querySelector('#sendHealth'); const remoteHealth = panel.querySelector('#remoteHealth'); const speakerHealth = panel.querySelector('#speakerHealth'); const netDiag = panel.querySelector('#netDiag'); const micMeter = panel.querySelector('#micMeter'); const remoteMeter = panel.querySelector('#remoteMeter');
    // ---- LINE風の通話UI ----
    (() => { const st = document.createElement('style'); st.textContent = `
#callWindow.cw{position:fixed;inset:0;z-index:2147483200;width:auto;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;overflow:hidden;background:#0d2a31;color:#fff;box-shadow:none;display:flex;flex-direction:column;align-items:center;font-family:inherit}
#callWindow.cw[hidden]{display:none}
.cw .cw-bg{position:absolute;inset:0;background:radial-gradient(circle at 25% 18%,#3a9aa6 0,#18454f 45%,#0a1a1f 100%)}
.cw #remoteVideo{position:absolute;inset:0;width:100%;height:100%;max-height:none;object-fit:cover;background:#000;border-radius:0;display:none}
.cw.s-video #remoteVideo{display:block}
.cw .cw-id{position:relative;z-index:2;margin-top:max(11vh,64px);text-align:center;padding:0 16px}
.cw.s-video .cw-id,.cw.s-video .cw-wave{display:none}
.cw .cw-av{width:min(48vw,210px);aspect-ratio:1;border-radius:50%;margin:0 auto 22px;display:flex;align-items:center;justify-content:center;font-size:4.2rem;font-weight:800;box-shadow:0 10px 36px rgba(0,0,0,.4);overflow:hidden}
.cw .cw-name{font-size:1.7rem;font-weight:800;overflow-wrap:anywhere}
.cw .cw-sub{margin-top:10px;min-height:1.5em;font-size:1.1rem}
.cw .cw-dots i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3ddc84;margin:0 5px;animation:cwd 1.2s infinite}
.cw .cw-dots i:nth-child(2){animation-delay:.2s}.cw .cw-dots i:nth-child(3){animation-delay:.4s}
@keyframes cwd{0%,100%{opacity:.2}50%{opacity:1}}
.cw .cw-status{margin-top:8px;font-size:.85rem;opacity:.8;min-height:1.2em}
.cw .cw-wave{position:relative;z-index:2;margin-top:34px;height:26px;display:none;gap:10px;justify-content:center;align-items:center}
.cw.s-audio .cw-wave{display:flex}
.cw .cw-wave i{width:7px;height:7px;border-radius:50%;background:linear-gradient(#6aa8ff,#3ddc84);transition:transform .14s}
.cw .cw-pip{position:absolute;top:calc(16px + env(safe-area-inset-top));left:16px;width:100px;height:136px;max-height:none;border-radius:12px;object-fit:cover;background:#222;z-index:5;display:none;transform:scaleX(-1);box-shadow:0 4px 14px rgba(0,0,0,.4)}
.cw.s-video .cw-pip.on{display:block}
.cw .cw-top{position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;z-index:8}
.cw .cw-top button{background:rgba(0,0,0,.28);border:0;color:#fff;width:40px;height:40px;border-radius:50%;font-size:1.4rem;line-height:1;padding:0;touch-action:manipulation}
.cw .cw-bar{position:absolute;left:0;right:0;bottom:calc(30px + env(safe-area-inset-bottom));z-index:9;display:flex;flex-wrap:wrap;justify-content:space-around;align-items:flex-end;gap:18px 0;padding:0 8px}
.cw .cw-b{background:none;border:0;color:#fff;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:.78rem;line-height:1.25;text-align:center;min-width:78px;padding:6px;touch-action:manipulation;cursor:pointer}
.cw .cw-b svg{width:34px;height:34px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cw .cw-endrow{display:flex;justify-content:center}
.cw .cw-end{width:80px;height:80px;border-radius:50%;background:#ff2d55;border:0;color:#fff;font-size:2.4rem;line-height:1;padding:0;cursor:pointer;touch-action:manipulation;box-shadow:0 4px 16px rgba(0,0,0,.4)}
.cw.s-ring .b-cam,.cw.s-ring .b-party{display:none}
.cw.s-ring .b-mic{order:1}.cw.s-ring .cw-endrow{order:2}.cw.s-ring .b-spk{order:3}
.cw.s-audio .b-mic{order:1}.cw.s-audio .b-cam{order:2}.cw.s-audio .b-spk{order:3}.cw.s-audio .b-party{order:4}.cw.s-audio .cw-endrow{order:9;flex-basis:100%}
.cw.s-video .b-spk{display:none}.cw.s-video .b-mic{order:1}.cw.s-video .b-cam{order:2}.cw.s-video .cw-endrow{order:3}.cw.s-video .b-party{order:4}
.cw .cw-more{position:absolute;z-index:10;top:calc(58px + env(safe-area-inset-top));right:12px;width:min(92vw,360px);max-height:70vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#111);border-radius:12px;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.cw .cw-more[hidden],.cw .cw-party[hidden]{display:none}
.cw .cw-party{position:absolute;z-index:6;left:0;right:0;top:0;bottom:calc(215px + env(safe-area-inset-bottom));background:#0b0f1a;display:flex;flex-direction:column}
.cw.s-video .cw-party{bottom:calc(140px + env(safe-area-inset-bottom))}
.cw .cw-party-bar{display:flex;gap:6px;padding:calc(8px + env(safe-area-inset-top)) 58px 8px 10px;background:#161b2b}
.cw .cw-party-bar input{flex:1;min-width:0;margin:0;color:#111;background:#fff}
.cw .cw-party-bar button{width:auto;min-height:0;padding:6px 12px}
.cw .cw-party iframe{flex:1;width:100%;border:0;background:#000;min-height:0}
.cw .cw-party-note{font-size:.72rem;text-align:center;padding:3px;background:#161b2b;color:#9aa3b2}
.cw.partyOpen .cw-id,.cw.partyOpen .cw-wave,.cw.partyOpen .cw-pip{display:none !important}
.cw.partyOpen.s-video .cw-pip.on{display:block !important;top:auto;left:auto;right:12px;bottom:calc(150px + env(safe-area-inset-bottom));width:72px;height:98px}
`; document.head.appendChild(st); })();
    const ICONS = { mic:'<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>', micOff:'<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16"/></svg>', cam:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3"/></svg>', camOff:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3M3 3l18 18"/></svg>', spk:'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>', spkOff:'<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>', party:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="14" height="14" rx="2"/><path d="m9 9 5 3-5 3z"/><path d="M21 8v11a2 2 0 0 1-2 2H8"/></svg>' };
    const btnSet = (id, icon, label) => { const b = panel.querySelector(id); const ic = b.querySelector('.ic'), lb = b.querySelector('.lb'); if (ic.dataset.k !== icon) { ic.innerHTML = ICONS[icon]; ic.dataset.k = icon; } if (label !== null && lb.dataset.k !== label) { lb.innerHTML = label; lb.dataset.k = label; } };
    const COLORS = ['#5b8cff', '#e8710a', '#1e8e3c', '#a142f4', '#d93025', '#129eaf'];
    const waveDots = [...panel.querySelectorAll('#cwWave i')];
    const moreBox = panel.querySelector('#cwMore'), partyBox = panel.querySelector('#cwParty'), partyUrl = panel.querySelector('#cwPartyUrl'), partyFrame = panel.querySelector('#cwPartyFrame');
    const fmtTime = (ms) => { const t = Math.floor(ms / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
    const renderUi = () => {
      if (win.hidden || !activeCall) return;
      const call = activeCall, peer = peers.get(call.id), accepted = call.status === 'accepted';
      const localOn = !!(peer && peer.stream.getVideoTracks().some((t) => t.readyState === 'live'));
      const remoteOn = !!(peer && peer.vs && peer.vs.on);
      const stt = !accepted ? 's-ring' : ((localOn || remoteOn) ? 's-video' : 's-audio');
      ['s-ring', 's-audio', 's-video'].forEach((c) => win.classList.toggle(c, c === stt));
      win.classList.toggle('partyOpen', !partyBox.hidden);
      if (accepted && !callStartedAt) callStartedAt = Date.now();
      const other = call.calleeEmail === session.email ? call.callerEmail : call.calleeEmail; const nm = String(other || '').split('@')[0] || '通話';
      const t = panel.querySelector('#callTitle'); if (t.textContent !== nm) t.textContent = nm;
      const av = panel.querySelector('#cwAv'); if (av.dataset.n !== nm) { av.dataset.n = nm; av.textContent = nm.slice(0, 1).toUpperCase(); av.style.background = COLORS[(nm.charCodeAt(0) || 0) % COLORS.length]; }
      timer.textContent = accepted && callStartedAt ? fmtTime(Date.now() - callStartedAt) : ''; panel.querySelector('#cwDots').style.display = accepted ? 'none' : '';
      const audioTrack = peer && peer.stream.getAudioTracks()[0]; const micOn = !audioTrack || audioTrack.enabled;
      btnSet('#toggleMute', micOn ? 'mic' : 'micOff', micOn ? 'マイクを<br>オフ' : 'マイクを<br>オン');
      btnSet('#toggleCamera', localOn ? 'cam' : 'camOff', localOn ? 'カメラを<br>オフ' : (stt === 's-video' ? 'カメラを<br>オン' : 'ビデオ通話を<br>開始'));
      btnSet('#toggleSpeaker', remoteAudio.muted ? 'spkOff' : 'spk', remoteAudio.muted ? 'スピーカーを<br>オン' : 'スピーカーを<br>オフ');
      btnSet('#cwPartyBtn', 'party', null);
      localVideo.classList.toggle('on', localOn);
    };
    const toEmbed = (u) => {
      u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; let url; try { url = new URL(u); } catch (_) { return ''; }
      const h = url.hostname.replace(/^(www|m)\./, ''); let id = '';
      if (h === 'youtu.be') id = url.pathname.slice(1); else if (h === 'youtube.com' || h === 'music.youtube.com') { if (url.pathname === '/watch') id = url.searchParams.get('v') || ''; else { const m = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,20})/); if (m) id = m[1]; } if (!id && url.pathname === '/playlist' && url.searchParams.get('list')) return 'https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent(url.searchParams.get('list')); }
      id = id.replace(/[^\w-]/g, ''); if (id) return 'https://www.youtube.com/embed/' + id + '?autoplay=1&playsinline=1&rel=0';
      return '/api/px?b=' + btoa(unescape(encodeURIComponent(url.href))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const openParty = (u, share) => { const src = toEmbed(u); if (!src) { status.textContent = 'URLを入力してください'; return; } partyBox.hidden = false; partyFrame.src = src; partyUrl.value = u; if (share && activeCall) signal(activeCall.id, { type:'party', url:String(u).slice(0, 500) }); renderUi(); };
    const closeParty = (share) => { const was = !partyBox.hidden; partyBox.hidden = true; partyFrame.removeAttribute('src'); if (was && share && activeCall) signal(activeCall.id, { type:'party', close:true }); renderUi(); };
    const levelTimers = new Map();
    const watchLevel = (key, stream, meter, label, idleLabel) => { if (!stream || !window.AudioContext) return; { const old = levelTimers.get(key); if (old) { clearInterval(old.timerId); old.context.close().catch(() => {}); levelTimers.delete(key); } } try { const context = new (window.AudioContext || window.webkitAudioContext)(); const source=context.createMediaStreamSource(stream); const analyser=context.createAnalyser(); analyser.fftSize=256; source.connect(analyser); const values=new Uint8Array(analyser.frequencyBinCount); const timerId=setInterval(()=>{ if (key === 'mic') { const tr = stream.getAudioTracks()[0]; if (tr && !tr.enabled) { meter.value = 0; label.textContent = 'マイク: OFF(ミュート中)'; return; } } analyser.getByteFrequencyData(values); const level=Math.min(1,Math.max(...values)/255); meter.value=level; label.textContent=level>.035 ? `${idleLabel}: 音声あり` : `${idleLabel}: 無音`; },180); levelTimers.set(key,{context,timerId}); } catch {} };
    const clearLevels = () => { levelTimers.forEach(({context,timerId})=>{clearInterval(timerId);context.close().catch(()=>{});}); levelTimers.clear(); micMeter.value=0; remoteMeter.value=0; };
    const watchTransport = (peer) => { let previousSent=0; let previousReceived=0; const timerId=setInterval(async()=>{ try { const report=await peer.pc.getStats(); let sent=0,received=0; report.forEach((item)=>{ if(item.type==='outbound-rtp' && item.kind==='audio') sent+=Number(item.bytesSent||0); if(item.type==='inbound-rtp' && item.kind==='audio') received+=Number(item.bytesReceived||0); }); try { let pairId = null; report.forEach((i) => { if (i.type === 'transport' && i.selectedCandidatePairId) pairId = i.selectedCandidatePairId; }); const pair = pairId && report.get(pairId); if (pair) { const lc = report.get(pair.localCandidateId), rc = report.get(pair.remoteCandidateId); const kind = (lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay') ? 'TURN中継' : '直接(P2P)'; netDiag.textContent = '経路: ' + kind + (iceSource ? ' / ICE:' + iceSource : ''); } else if (!peer.relay && !peer.diag.done) netDiag.textContent = '経路: 探索中...'; if (peer.relay) netDiag.textContent = '経路: サーバー中継(音声のみ)'; } catch (_) {}
        if(sent>previousSent) sendHealth.textContent=`音声送信: 送信中 (${Math.round(sent/1024)}KB)`; else if(peer.stream?.getAudioTracks?.()[0]?.enabled) sendHealth.textContent='音声送信: 接続待機中'; if(received>previousReceived) remoteHealth.textContent=`相手の音声: 受信中 (${Math.round(received/1024)}KB)`; previousSent=sent; previousReceived=received; } catch {} },1000); peer.statsTimer=timerId; };
    const api = (body) => Netrify.api('/api/calls', { token:session.token, ...body });
    let iceCache = null;
    let iceSource = '';
    const FALLBACK_ICE = [{ urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478'] }, { urls:['turn:openrelay.metered.ca:80','turn:openrelay.metered.ca:443','turns:openrelay.metered.ca:443?transport=tcp'], username:'openrelayproject', credential:'openrelayproject' }];
    // 取得に失敗したときの代替は覚えない(次回また取りに行く)。以前は一度失敗するとSTUNだけの設定を使い続け、TURNなしになっていた
    const getIce = async () => { if (iceCache) return iceCache; try { const r = await api({ action:'ice' }); if (!Array.isArray(r.iceServers) || !r.iceServers.length) throw new Error('empty'); iceCache = r.iceServers; iceSource = r.source || ''; } catch (_) { iceSource = 'fallback'; return FALLBACK_ICE; } return iceCache; };
    // ---- マイク・カメラ・スピーカー選択(選んだ機器は端末に保存) ----
    const DEV_KEY = 'mx-call-devices';
    const savedDev = () => { try { return JSON.parse(localStorage.getItem(DEV_KEY) || '{}') || {}; } catch (_) { return {}; } };
    const saveDev = (patch) => { try { localStorage.setItem(DEV_KEY, JSON.stringify({ ...savedDev(), ...patch })); } catch (_) {} };
    const mediaConstraints = (mode) => { const d = savedDev(); return { audio: d.mic ? { deviceId:{ ideal:d.mic }, echoCancellation:true, noiseSuppression:true } : { echoCancellation:true, noiseSuppression:true }, video: mode === 'audio' ? false : (d.cam ? { deviceId:{ ideal:d.cam } } : true) }; };
    // ---- サーバー経由の音声中継(WebRTCが繋がらないときの代替。音声のみ・少し遅れる) ----
    const MU = 255;
    const muEnc = (x) => { x = Math.max(-1, Math.min(1, x)); const sg = x < 0 ? 128 : 0; const y = Math.log(1 + MU * Math.abs(x)) / Math.log(1 + MU); return Math.round(y * 127) | sg; };
    const muDec = (b) => { const sg = b & 128 ? -1 : 1; const y = (b & 127) / 127; return sg * (Math.pow(1 + MU, y) - 1) / MU; };
    const stopRelay = (peer) => { const r = peer && peer.relay; if (!r) return; r.on = false; try { r.proc && r.proc.disconnect(); r.src && r.src.disconnect(); } catch (_) {} clearInterval(r.timer); peer.relay = null; };
    const startRelay = async (call, peer, fromRemote) => {
      if (!peer || peer.relay || !window.AudioContext && !window.webkitAudioContext) return;
      await enableSound(); const ctx = audioContext; if (!ctx) return;
      const r = peer.relay = { on:true, seq:0, after:-1, play:0, q:[], busy:false };
      { const lt = levelTimers.get('remote'); if (lt) { clearInterval(lt.timerId); lt.context.close().catch(() => {}); levelTimers.delete('remote'); } }   // 届いていないWebRTCの音量監視が「無音」と上書きするのを止める
      status.textContent = 'サーバー経由で接続中（音声のみ・少し遅れます）'; remoteHealth.textContent = '相手の音声: サーバー中継';
      if (!fromRemote) signal(call.id, { type:'relay' });
      const track = peer.stream.getAudioTracks()[0]; if (!track) return;
      r.src = ctx.createMediaStreamSource(new MediaStream([track])); r.proc = ctx.createScriptProcessor(4096, 1, 1);
      const ratio = ctx.sampleRate / 16000; let acc = [];
      r.proc.onaudioprocess = (e) => { if (!r.on) return; const inp = e.inputBuffer.getChannelData(0); for (let i = 0; i < inp.length; i += ratio) { let sum = 0, n = 0; for (let k = Math.floor(i); k < Math.min(inp.length, Math.floor(i + ratio)); k++) { sum += inp[k]; n++; } acc.push(n ? sum / n : 0); } if (acc.length >= 8000) { const bytes = new Uint8Array(acc.length); for (let k = 0; k < acc.length; k++) bytes[k] = muEnc(acc[k]); acc = []; let bin = ''; for (let k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]); r.q.push(btoa(bin)); if (r.q.length > 6) r.q.shift(); pump(); } };
      const mute = ctx.createGain(); mute.gain.value = 0; r.src.connect(r.proc); r.proc.connect(mute); mute.connect(ctx.destination);
      const pump = async () => { if (r.busy || !r.on) return; r.busy = true; try { while (r.q.length && r.on) { const d = r.q.shift(); await api({ action:'relayPut', callId:call.id, seq:r.seq++, data:d }).catch(() => {}); } } finally { r.busy = false; } };
      let polling = false;
      r.timer = setInterval(async () => { if (!r.on || polling) return; polling = true; try { const res = await api({ action:'relayGet', callId:call.id, after:r.after }); for (const c of res.chunks || []) { r.after = Math.max(r.after, c.seq); const bin = atob(c.d); const f = new Float32Array(bin.length); for (let k = 0; k < bin.length; k++) f[k] = muDec(bin.charCodeAt(k)); const buf = ctx.createBuffer(1, f.length, 16000); buf.copyToChannel(f, 0); const sn = ctx.createBufferSource(); sn.buffer = buf; sn.connect(ctx.destination); r.play = Math.max(r.play, ctx.currentTime + 0.4); sn.start(r.play); r.play += buf.duration; remoteMeter.value = 0.5; remoteHealth.textContent = '相手の音声: サーバー中継で受信中'; } if (['ended','declined','missed'].includes(res.status)) stopRelay(peer); } catch (_) {} finally { polling = false; } }, 450);
    };
    const stopRingtone = () => { if (ringtoneTimer) { clearInterval(ringtoneTimer); ringtoneTimer = null; } };
    const enableSound = async () => { try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') await audioContext.resume(); } catch {} };
    const beep = async () => { try { await enableSound(); if (!audioContext || audioContext.state !== 'running') return; const osc = audioContext.createOscillator(); const gain = audioContext.createGain(); osc.frequency.value = 740; gain.gain.value = .045; osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .18); } catch {} };
    const ring = () => { stopRingtone(); beep(); ringtoneTimer = setInterval(beep, 1400); };
    let showWindow = (call, label) => { activeCall = call; win.hidden = false; panel.querySelector('#callTitle').textContent = label || '通話'; status.textContent = ''; renderUi(); };
    const setConnected = () => { if (activeCall) status.textContent = peers.get(activeCall.id)?.relay ? 'サーバー経由で接続中（音声のみ・少し遅れます）' : ''; renderUi(); };
    const closePeer = (callId) => { const peer = peers.get(callId); if (peer) { clearTimeout(peer.fallbackTimer); stopRelay(peer); if(peer.statsTimer)clearInterval(peer.statsTimer); try { peer.pc.ontrack = null; peer.pc.onicecandidate = null; peer.pc.onconnectionstatechange = null; peer.pc.getSenders().forEach((sd) => { try { sd.track && sd.track.stop(); } catch (_) {} }); peer.pc.close(); } catch (_) {} peer.stream?.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} }); peers.delete(callId); } clearLevels(); micHealth.textContent='マイク: 停止'; sendHealth.textContent='音声送信: 停止'; remoteHealth.textContent='相手の音声: 停止'; };
    // 通話を完全に片づける: マイク・カメラ・画面共有・音声コンテキストをすべて解放し、画面を閉じる(サーバーへの通知を待たない)
    let screenStream = null, pendingStreams = [];
    const teardown = () => { const ids = [...peers.keys()]; ids.forEach((id) => closePeer(id)); pendingStreams.forEach((st) => st.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} })); pendingStreams = []; if (screenStream) { screenStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); screenStream = null; } localVideo.srcObject = null; remoteVideo.srcObject = null; remoteAudio.srcObject = null; remoteAudio.muted = false; closeParty(false); win.hidden = true; moreBox.hidden = true; activeCall = null; callStartedAt = null; stopRingtone(); notice.hidden = true; clearLevels(); try { audioContext && audioContext.close(); } catch (_) {} audioContext = null; };
    const signal = async (callId, data) => { try { await api({ action:'signal', callId, signal:data }); } catch (e) { status.textContent = e.message; } };
    const drainIce = async (peer) => { while (peer.iceQueue.length && peer.pc.remoteDescription) { const candidate = peer.iceQueue.shift(); try { await peer.pc.addIceCandidate(candidate); } catch {} } };
    const setupPeer = async (call, initiator) => { try { const pr = await setupPeer0(call, initiator); pendingStreams = []; return pr; } catch (e) { pendingStreams.forEach((st) => st.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} })); pendingStreams = []; throw e; } };
    const setupPeer0 = async (call, initiator) => {
      if (peers.has(call.id)) return peers.get(call.id);
      const pc = new RTCPeerConnection({ iceServers: await getIce() });
      const mode = call.mode || 'audio';
      let stream;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('このページではマイクを利用できません。HTTPSまたはブラウザの権限設定を確認してください。');
      try { stream = preStream || await navigator.mediaDevices.getUserMedia(mediaConstraints(mode)); preStream = null; }
      catch (e) {
        const denied = e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError' || /permission|denied/i.test(e?.message || '');
        // カメラだけ拒否された場合も、通話自体は音声で継続できるようにする。
        if (mode !== 'audio' && denied) {
          try { stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false }); status.textContent='カメラは許可されていないため、音声通話で接続します。'; }
          catch (audioError) { status.textContent='マイクの許可が必要です。ブラウザのアドレスバーの鍵アイコンからマイクを許可して、もう一度「応答」を押してください。'; throw new Error('マイクのPermission denied'); }
        } else {
          status.textContent = denied ? 'マイクの許可が必要です。ブラウザのアドレスバーの鍵アイコンからマイクを許可して、もう一度「応答」を押してください。' : `マイク・カメラを取得できません: ${e.message || e.name || '不明なエラー'}`;
          throw new Error(denied ? 'マイクのPermission denied' : (e.message || e.name || 'メディア取得エラー'));
        }
      }
      pendingStreams.push(stream); stream.getTracks().forEach((track) => pc.addTrack(track, stream)); if (!stream.getVideoTracks().length) { try { pc.addTransceiver('video', { direction:'sendrecv' }); } catch (_) {} }
      localVideo.srcObject = stream;

      const vs = { on:false }; const remoteStream = new MediaStream();
      pc.ontrack = (event) => { if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track); if (event.track.kind === 'video') { vs.on = !event.track.muted; event.track.onunmute = () => { vs.on = true; renderUi(); }; event.track.onmute = () => { vs.on = false; renderUi(); }; } remoteAudio.srcObject = remoteStream; remoteVideo.srcObject = remoteStream; remoteVideo.muted = true; remoteAudio.volume = 1; remoteHealth.textContent='相手の音声: 受信しました'; watchLevel('remote',remoteStream,remoteMeter,remoteHealth,'相手の音声'); Promise.all([remoteAudio.play().catch(() => { speakerHealth.textContent='スピーカー: 「音声を有効化」を押してください'; }), remoteVideo.play().catch(() => {})]).finally(() => setConnected()); };
      const diag = { host:0, srflx:0, relay:0, done:false }; let candBuf = [], candTimer = null;
      const flushCand = () => { candTimer = null; if (!candBuf.length) return; const list = candBuf; candBuf = []; signal(call.id, { type:'candidates', list }); };
      pc.onicecandidate = (event) => {
        if (event.candidate) { const t = event.candidate.type || (/ typ (\w+)/.exec(event.candidate.candidate || '') || [])[1]; if (diag[t] !== undefined) diag[t]++; candBuf.push(event.candidate); if (!candTimer) candTimer = setTimeout(flushCand, 250); }
        else { diag.done = true; flushCand(); if (!diag.relay && pc.connectionState !== 'connected') netDiag.textContent = '経路: TURN(中継)の候補を取得できていません。TURN設定/通信制限を確認してください'; }
      };
      // 切断を相手へ即座に伝える専用の通路(サーバーの状態確認を待たない)
      const ctl = pc.createDataChannel('ctl', { negotiated:true, id:1 }); ctl.onmessage = (e) => { if (e.data === 'bye') { teardown(); } };
      pc.onicecandidateerror = (event) => { status.textContent = `通信経路を確認できません (${event.errorCode || 'ICE'})。再接続を試してください。`; };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') { setConnected(); } if (pc.connectionState === 'failed') { const pr = peers.get(call.id); if (pr && !pr.relay) startRelay(call, pr, false); } if (pc.connectionState === 'failed') status.textContent = '接続に失敗しました。「再接続」を試してください。'; if (pc.connectionState === 'disconnected') status.textContent = '接続が不安定です。'; };
      pc.oniceconnectionstatechange = () => { if (['checking','connected','completed'].includes(pc.iceConnectionState) && status.textContent !== '接続済み') status.textContent = '音声・映像の接続を確認中...'; };
      const peer = { pc, stream, initiator, iceQueue:[], ready:false, vs, diag, ctl };
      // P2Pの専用通路が開いた = 両端でP2Pが通った。このときだけサーバー中継を止める(片方だけ先に止めると、もう片方の音が届かなくなる)
      const p2pUp = () => { if (peers.get(call.id) === peer && peer.relay) { stopRelay(peer); status.textContent = ''; } setConnected(); };
      ctl.onopen = p2pUp; if (ctl.readyState === 'open') p2pUp();
      micHealth.textContent = stream.getAudioTracks().some((track) => track.enabled) ? 'マイク: 送信中' : 'マイク: OFF';
      watchLevel('mic',stream,micMeter,micHealth,'マイク');
      const armFallback = (ms) => { peer.fallbackTimer = setTimeout(() => { if (peers.get(call.id) !== peer || peer.relay || pc.connectionState === 'connected') return; if (!(activeCall && activeCall.status === 'accepted')) return armFallback(3000); startRelay(call, peer, false); }, ms); };
      armFallback(15000);   // 相手が応答してから15秒たっても繋がらないときだけ、サーバー経由に切り替える(呼び出し中は切り替えない)
      peers.set(call.id, peer); watchTransport(peer); showWindow(call, call.calleeEmail === session.email ? call.callerEmail : call.calleeEmail);
      if (initiator) { const offer = await pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:true }); await pc.setLocalDescription(offer); await signal(call.id, { type:'offer', sdp:offer }); }
      return peer;
    };
    const processSignals = async (call) => {
      const peer0 = peers.get(call.id); const data = await api({ action:'get', callId:call.id, after: peer0 && peer0.sigAfter ? (Math.max(0, parseInt(peer0.sigAfter.slice(0, 9), 36) - 3000)).toString(36).padStart(9, '0') : '' }); const peer = peers.get(call.id); if (!peer) return;
      const known = seenSignals.get(call.id) || new Set();
      for (const item of data.signals || []) {
        if (known.has(item.id)) continue; known.add(item.id); if (!peer.sigAfter || item.id > peer.sigAfter) peer.sigAfter = item.id; const msg = item.data || {};
        if (msg.type === 'relay') { startRelay(call, peer, true); continue; }
        if (msg.type === 'cam') { peer.vs.on = !!msg.on; renderUi(); continue; }
        if (msg.type === 'party') { if (msg.close) closeParty(false); else if (msg.url) openParty(String(msg.url).slice(0, 500), false); continue; }
        if (msg.type === 'offer' && !peer.initiator && !peer.pc.remoteDescription) { await peer.pc.setRemoteDescription(msg.sdp); await drainIce(peer); try { peer.pc.getTransceivers().forEach((tr) => { if (tr.receiver && tr.receiver.track && tr.receiver.track.kind === 'video' && tr.direction === 'recvonly') tr.direction = 'sendrecv'; }); } catch (_) {} const answer = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(answer); await signal(call.id, { type:'answer', sdp:answer }); }
        else if (msg.type === 'answer' && peer.initiator && !peer.pc.remoteDescription) { await peer.pc.setRemoteDescription(msg.sdp); await drainIce(peer); }
        else if ((msg.type === 'candidate' && msg.candidate) || (msg.type === 'candidates' && Array.isArray(msg.list))) { for (const cd of (msg.type === 'candidates' ? msg.list : [msg.candidate])) { if (peer.pc.remoteDescription) { try { await peer.pc.addIceCandidate(cd); } catch {} } else peer.iceQueue.push(cd); } }
        else if (msg.type === 'bye') { teardown(); return; }
      }
      seenSignals.set(call.id, known); activeCall = data.call;
      if (data.call.status === 'accepted') setConnected();
      if (['ended','declined','missed'].includes(data.call.status)) { teardown(); return; }
      renderUi();
    };
    const accept = async (call) => { await enableSound(); stopRingtone(); try { notice.hidden = true; await setupPeer(call, false); await api({ action:'status', callId:call.id, status:'accepted' }); await processSignals(call); } catch (error) { notice.hidden = false; notice.innerHTML = `<strong>マイクの許可が必要です</strong><p class="muted">ブラウザのアドレスバーの鍵アイコンからマイクを許可して、もう一度応答してください。</p><button type="button" id="retryAccept">もう一度応答</button>`; notice.querySelector('#retryAccept').onclick = () => accept(call); status.textContent = error.message || '通話を開始できませんでした'; } };
    const decline = async (call) => { stopRingtone(); await api({ action:'status', callId:call.id, status:'declined' }); notice.hidden = true; };
    const pollOnce = async () => {
      try {
        if (activeCall && peers.has(activeCall.id)) { await processSignals(activeCall); return; }   // 通話中は着信確認を省き、通話の状態だけ見る
        const data = await api({ action:'poll' }); const incoming = data.incoming?.[0];
        if (incoming && (!activeCall || activeCall.id !== incoming.id)) { if (notice.dataset.callId !== incoming.id) { notice.dataset.callId = incoming.id; ring(); notice.hidden = false; notice.innerHTML = `<strong>${esc(incoming.callerEmail)}から着信</strong><div class="call-actions"><button type="button" id="acceptCall">応答</button><button type="button" class="ghost" id="declineCall">拒否</button></div>`; notice.querySelector('#acceptCall').onclick = () => accept(incoming).catch((e) => { status.textContent = e.message; }); notice.querySelector('#declineCall').onclick = () => decline(incoming); } }
        else if (notice.dataset.callId && !activeCall) { delete notice.dataset.callId; notice.hidden = true; stopRingtone(); }   // 相手が切った/取り消したら着信表示と着信音を止める
        const missedCalls = data.missed || [];
        const missedSig = missedCalls.map((c) => c.id).join(',');
        if (!missedCalls.length) missed.hidden = true;
        else if (missed.dataset.sig !== missedSig) { missed.dataset.sig = missedSig; missed.hidden = false; missed.innerHTML = `未通話 ${missedCalls.length}件: ` + missedCalls.map((call) => `<button type="button" class="ghost" data-missed="${esc(call.id)}">${esc(call.callerEmail)} (${new Date(call.createdAt).toLocaleString('ja-JP')})</button>`).join(''); missed.querySelectorAll('[data-missed]').forEach((button) => button.onclick = async () => { await api({ action:'markMissedRead', callId:button.dataset.missed }); pollOnce(); }); }
        if (activeCall && peers.has(activeCall.id)) await processSignals(activeCall);
      } catch (error) { if (activeCall && /見つかりません/.test(error.message || '')) { teardown(); return; } if (activeCall) status.textContent = '通話サーバーとの接続を再試行しています。'; }
    };
    // 1回ずつ順番に実行する(以前は1.5秒ごとに重ねて送っていたため、サーバーが遅いと要求が溜まって「切る」の通知まで詰まった)
    let polling = false;
    const pollLoop = async () => { if (!polling) { polling = true; try { await pollOnce(); } finally { polling = false; } } setTimeout(pollLoop, activeCall ? 1000 : (document.hidden ? 8000 : 3500)); };
    let starting = false, preStream = null; const toast = document.createElement('div'); toast.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483300;background:#0d2a31;color:#fff;padding:10px 18px;border-radius:20px;font-size:.9rem;box-shadow:0 4px 16px rgba(0,0,0,.3)'; toast.hidden = true; document.body.appendChild(toast);
    window.Netrify.startCall = async (calleeEmail, mode = 'audio') => {
      if (starting || activeCall) return;                       // 連打しても発信は1回だけ
      starting = true; toast.textContent = '発信中...'; toast.hidden = false;   // 押した直後に反応を見せる
      // 順番: ①マイク(カメラ)の許可を先に取る → ②通話を作って相手を呼び出す → ③発信。許可を拒否したのに相手だけ鳴り続ける、を防ぐ
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('このページではマイクを利用できません。HTTPSまたはブラウザの権限設定を確認してください。');
        try { preStream = await navigator.mediaDevices.getUserMedia(mediaConstraints(mode)); }
        catch (e) { if (mode !== 'audio') { try { preStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false }); } catch (_) {} } if (!preStream) throw new Error('マイクの許可が必要です。ブラウザのアドレスバーの鍵アイコンからマイクを許可して、もう一度押してください。'); }
        const result = await api({ action:'start', calleeEmail, mode }); if (!result.recipientOnline) { alert('相手はオフラインです。未通話履歴に保存しました。'); return result; } const call = result.call; callStartedAt = null; await setupPeer(call, true); return result; }
      finally { starting = false; toast.hidden = true; if (preStream) { preStream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); preStream = null; } }
    };
    panel.querySelector('#enableAudio').onclick = async () => { await enableSound(); const result=await remoteAudio.play().then(()=>true).catch(()=>false); remoteVideo.play().catch(() => {}); speakerHealth.textContent = result ? 'スピーカー: 有効' : 'スピーカー: 再生できません'; status.textContent = result ? '音声出力を有効化しました' : 'スピーカーを確認してください'; };
    panel.querySelector('#testSpeaker').onclick = async () => { await enableSound(); try { const oscillator=audioContext.createOscillator(); const gain=audioContext.createGain(); gain.gain.value=.04; oscillator.frequency.value=660; oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime+.25); speakerHealth.textContent='スピーカー: テスト音を再生しました'; } catch { speakerHealth.textContent='スピーカー: テスト失敗'; } };
    const sendEnded = (call) => { try { fetch('/api/calls', { method:'POST', keepalive:true, headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ action:'status', token:session.token, callId:call.id, status:'ended' }) }).catch(() => {}); } catch (_) { api({ action:'status', callId:call.id, status:'ended' }).catch(() => {}); } };
    panel.querySelector('#endCall').onclick = () => { const call = activeCall; const pr = call && peers.get(call.id); try { if (pr && pr.ctl && pr.ctl.readyState === 'open') pr.ctl.send('bye'); } catch (_) {} if (call) sendEnded(call); teardown(); };
    panel.querySelector('#cwMoreBtn').onclick = () => { moreBox.hidden = !moreBox.hidden; };
    panel.querySelector('#cwPartyBtn').onclick = () => { if (partyBox.hidden) { partyBox.hidden = false; renderUi(); partyUrl.focus(); } else closeParty(true); };
    panel.querySelector('#cwPartyGo').onclick = () => openParty(partyUrl.value, true);
    partyUrl.onkeydown = (e) => { if (e.key === 'Enter') openParty(partyUrl.value, true); };
    panel.querySelector('#cwPartyClose').onclick = () => closeParty(true);
    panel.querySelector('#toggleMute').onclick = () => { const peer = activeCall && peers.get(activeCall.id); const track = peer?.stream?.getAudioTracks?.()[0]; if (track) { track.enabled = !track.enabled; micHealth.textContent = track.enabled ? 'マイク: 送信中' : 'マイク: OFF'; renderUi(); } };
    panel.querySelector('#toggleSpeaker').onclick = () => { remoteAudio.muted = !remoteAudio.muted; renderUi(); };
    panel.querySelector('#toggleCamera').onclick = async () => {
      const peer = activeCall && peers.get(activeCall.id); if (!peer) return;
      const vt = peer.stream.getVideoTracks().find((t) => t.readyState === 'live');
      const tr = peer.pc.getTransceivers().find((t) => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
      try {
        if (vt) { vt.stop(); peer.stream.removeTrack(vt); if (tr) await tr.sender.replaceTrack(null); signal(activeCall.id, { type:'cam', on:false }); }
        else {
          const d = savedDev(); const ns = await navigator.mediaDevices.getUserMedia({ video: d.cam ? { deviceId:{ ideal:d.cam } } : true }); const nt = ns.getVideoTracks()[0];
          peer.stream.addTrack(nt); if (tr) { if (tr.direction !== 'sendrecv') tr.direction = 'sendrecv'; await tr.sender.replaceTrack(nt); } else peer.pc.addTrack(nt, peer.stream);
          localVideo.srcObject = peer.stream; signal(activeCall.id, { type:'cam', on:true });
        }
      } catch (e) { status.textContent = 'カメラを使えません: ' + (e.message || e.name); }
      renderUi();
    };
    panel.querySelector('#restartCall').onclick = async () => { if (!activeCall) return; const call = activeCall; const initiator = call.callerEmail === session.email; closePeer(call.id); try { await setupPeer(call, initiator); } catch (e) { status.textContent = e.message; } };
    panel.querySelector('#shareScreen').onclick = async () => { const peer = activeCall && peers.get(activeCall.id); if (!peer || !navigator.mediaDevices.getDisplayMedia) return; try { const screen = await navigator.mediaDevices.getDisplayMedia({ video:true }); screenStream = screen; let sender = peer.pc.getSenders().find((item) => item.track?.kind === 'video'); if (!sender) { const transceiver = peer.pc.addTransceiver('video', { direction:'sendrecv' }); sender = transceiver.sender; } await sender.replaceTrack(screen.getVideoTracks()[0]); localVideo.srcObject = screen; screen.getVideoTracks()[0].onended = () => { const camera = peer.stream.getVideoTracks()[0]; if (camera) { sender.replaceTrack(camera); localVideo.srcObject = peer.stream; } }; } catch (e) { status.textContent = e.message; } };
    setInterval(() => { if (!win.hidden) renderUi(); }, 1000);
    setInterval(() => { if (win.hidden) return; const lv = Math.max(Number(micMeter.value) || 0, Number(remoteMeter.value) || 0); waveDots.forEach((d, i) => { d.style.transform = 'scale(' + (1 + lv * (1.2 + (i % 3) * .6) * Math.random() * 2.2).toFixed(2) + ')'; }); }, 140);
    window.addEventListener('pagehide', () => { try { if (activeCall) navigator.sendBeacon('/api/calls', new Blob([JSON.stringify({ action:'status', token:session.token, callId:activeCall.id, status:'ended' })], { type:'application/json' })); teardown(); } catch (_) {} });
    document.addEventListener('click', enableSound, { capture:true, once:true });
    // ---- 機器の選択 ----
    (() => { const st = document.createElement('style'); st.textContent = '.call-devices{display:flex;flex-wrap:wrap;gap:6px 10px;margin:8px 0;font-size:.8rem}.call-devices label{display:flex;flex-direction:column;gap:2px;flex:1 1 140px;min-width:0}.call-devices select{width:100%;min-width:0;padding:6px;border-radius:8px;font-size:.85rem}'; document.head.appendChild(st); })();
    const selMic = panel.querySelector('#devMic'), selCam = panel.querySelector('#devCam'), selOut = panel.querySelector('#devOut');
    const fillSel = (sel, list, cur, none) => { sel.innerHTML = (none ? '<option value="">' + none + '</option>' : '') + list.map((d, i) => '<option value="' + esc(d.deviceId) + '">' + esc(d.label || (sel.id + ' ' + (i + 1))) + '</option>').join(''); if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur; };
    const refreshDevices = async () => { try { const all = await navigator.mediaDevices.enumerateDevices(); const d = savedDev(); fillSel(selMic, all.filter((x) => x.kind === 'audioinput'), d.mic, 'マイク(既定)'); fillSel(selCam, all.filter((x) => x.kind === 'videoinput'), d.cam, 'カメラ(既定)'); const outs = all.filter((x) => x.kind === 'audiooutput'); fillSel(selOut, outs, d.out, 'スピーカー(既定)'); selOut.parentNode.style.display = outs.length && remoteAudio.setSinkId ? '' : 'none'; const peer = activeCall && peers.get(activeCall.id); selCam.disabled = !(peer && peer.stream.getVideoTracks().length); } catch (_) {} };
    const swapTrack = async (kind, deviceId) => { const peer = activeCall && peers.get(activeCall.id); if (!peer) return; try { const ns = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio:{ deviceId:{ exact:deviceId } } } : { video:{ deviceId:{ exact:deviceId } } }); const nt = ns.getTracks()[0]; const old = peer.stream.getTracks().find((t) => t.kind === kind); const sender = peer.pc.getSenders().find((x) => x.track && x.track.kind === kind); if (old) { nt.enabled = old.enabled; peer.stream.removeTrack(old); old.stop(); } peer.stream.addTrack(nt); if (sender) await sender.replaceTrack(nt); if (kind === 'video') localVideo.srcObject = peer.stream; else { watchLevel('mic', peer.stream, micMeter, micHealth, 'マイク'); } status.textContent = '機器を切り替えました'; } catch (e) { status.textContent = '機器を切り替えられません: ' + (e.message || e.name); } };
    selMic.onchange = () => { saveDev({ mic:selMic.value }); if (selMic.value) swapTrack('audio', selMic.value); };
    selCam.onchange = () => { saveDev({ cam:selCam.value }); if (selCam.value) swapTrack('video', selCam.value); };
    selOut.onchange = async () => { saveDev({ out:selOut.value }); try { await remoteAudio.setSinkId(selOut.value || ''); remoteVideo.setSinkId && remoteVideo.setSinkId(selOut.value || ''); } catch (_) {} };
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    const _showWindow = showWindow; showWindow = (call, label) => { _showWindow(call, label); refreshDevices(); const d = savedDev(); if (d.out && remoteAudio.setSinkId) remoteAudio.setSinkId(d.out).catch(() => {}); };
    pollLoop();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
