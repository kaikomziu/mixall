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
    panel.innerHTML = `<div id="callNotice" class="call-notice" hidden></div><div id="missedCalls" class="call-missed" hidden></div><div id="callWindow" class="call-window" hidden><div class="call-window-head"><strong id="callTitle">通話</strong><div class="call-window-actions"><button type="button" class="ghost" id="callFullscreen">全画面</button><button type="button" class="ghost" id="callClose">閉じる</button></div></div><div class="call-videos"><video id="remoteVideo" autoplay playsinline></video><video id="localVideo" autoplay playsinline muted></video><audio id="remoteAudio" autoplay playsinline></audio></div><div class="call-health"><span id="micHealth">マイク: 準備中</span><span id="sendHealth">音声送信: 待機中</span><span id="remoteHealth">相手の音声: 待機中</span><span id="speakerHealth">スピーカー: 確認中</span></div><div class="call-meter"><span>送信</span><meter id="micMeter" min="0" max="1" value="0"></meter><span>受信</span><meter id="remoteMeter" min="0" max="1" value="0"></meter></div><div class="call-controls"><button type="button" class="ghost" id="enableAudio">音声を有効化</button><button type="button" class="ghost" id="testSpeaker">スピーカーテスト</button><button type="button" class="ghost" id="toggleMute">マイクOFF</button><button type="button" class="ghost" id="toggleCamera">カメラOFF</button><button type="button" class="ghost" id="shareScreen">画面共有</button><button type="button" class="ghost" id="restartCall">再接続</button><button type="button" class="danger" id="endCall">通話終了</button></div><p id="callStatus" class="muted"></p><p id="callTimer" class="muted"></p></div>`;
    document.body.appendChild(panel);
    const notice = panel.querySelector('#callNotice'); const missed = panel.querySelector('#missedCalls'); const win = panel.querySelector('#callWindow');
    const remoteVideo = panel.querySelector('#remoteVideo'); const localVideo = panel.querySelector('#localVideo'); const remoteAudio = panel.querySelector('#remoteAudio'); const status = panel.querySelector('#callStatus'); const timer = panel.querySelector('#callTimer'); const micHealth = panel.querySelector('#micHealth'); const sendHealth = panel.querySelector('#sendHealth'); const remoteHealth = panel.querySelector('#remoteHealth'); const speakerHealth = panel.querySelector('#speakerHealth'); const micMeter = panel.querySelector('#micMeter'); const remoteMeter = panel.querySelector('#remoteMeter');
    const levelTimers = new Map();
    const watchLevel = (key, stream, meter, label, idleLabel) => { if (!stream || !window.AudioContext) return; try { const context = new (window.AudioContext || window.webkitAudioContext)(); const source=context.createMediaStreamSource(stream); const analyser=context.createAnalyser(); analyser.fftSize=256; source.connect(analyser); const values=new Uint8Array(analyser.frequencyBinCount); const timerId=setInterval(()=>{ analyser.getByteFrequencyData(values); const level=Math.min(1,Math.max(...values)/255); meter.value=level; label.textContent=level>.035 ? `${idleLabel}: 音声あり` : `${idleLabel}: 無音`; },180); levelTimers.set(key,{context,timerId}); } catch {} };
    const clearLevels = () => { levelTimers.forEach(({context,timerId})=>{clearInterval(timerId);context.close().catch(()=>{});}); levelTimers.clear(); micMeter.value=0; remoteMeter.value=0; };
    const watchTransport = (peer) => { let previousSent=0; let previousReceived=0; const timerId=setInterval(async()=>{ try { const report=await peer.pc.getStats(); let sent=0,received=0; report.forEach((item)=>{ if(item.type==='outbound-rtp' && item.kind==='audio') sent+=Number(item.bytesSent||0); if(item.type==='inbound-rtp' && item.kind==='audio') received+=Number(item.bytesReceived||0); }); if(sent>previousSent) sendHealth.textContent=`音声送信: 送信中 (${Math.round(sent/1024)}KB)`; else if(peer.stream?.getAudioTracks?.()[0]?.enabled) sendHealth.textContent='音声送信: 接続待機中'; if(received>previousReceived) remoteHealth.textContent=`相手の音声: 受信中 (${Math.round(received/1024)}KB)`; previousSent=sent; previousReceived=received; } catch {} },1000); peer.statsTimer=timerId; };
    const api = (body) => Netrify.api('/.netlify/functions/calls', { token:session.token, ...body });
    const stopRingtone = () => { if (ringtoneTimer) { clearInterval(ringtoneTimer); ringtoneTimer = null; } };
    const enableSound = async () => { try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') await audioContext.resume(); } catch {} };
    const beep = async () => { try { await enableSound(); if (!audioContext || audioContext.state !== 'running') return; const osc = audioContext.createOscillator(); const gain = audioContext.createGain(); osc.frequency.value = 740; gain.gain.value = .045; osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .18); } catch {} };
    const ring = () => { stopRingtone(); beep(); ringtoneTimer = setInterval(beep, 1400); };
    const showWindow = (call, label) => { activeCall = call; if (!callStartedAt) callStartedAt = Date.now(); win.hidden = false; panel.querySelector('#callTitle').textContent = label || '通話'; status.textContent = call.status === 'accepted' ? '接続中...' : '発信中...'; };
    const setConnected = () => { if (activeCall) status.textContent = '接続済み'; };
    const closePeer = (callId) => { const peer = peers.get(callId); if (peer) { if(peer.statsTimer)clearInterval(peer.statsTimer); peer.pc.ontrack = null; peer.pc.close(); peer.stream?.getTracks().forEach((track) => track.stop()); peers.delete(callId); } clearLevels(); micHealth.textContent='マイク: 停止'; sendHealth.textContent='音声送信: 停止'; remoteHealth.textContent='相手の音声: 停止'; };
    const signal = async (callId, data) => { try { await api({ action:'signal', callId, signal:data }); } catch (e) { status.textContent = e.message; } };
    const drainIce = async (peer) => { while (peer.iceQueue.length && peer.pc.remoteDescription) { const candidate = peer.iceQueue.shift(); try { await peer.pc.addIceCandidate(candidate); } catch {} } };
    const setupPeer = async (call, initiator) => {
      if (peers.has(call.id)) return peers.get(call.id);
      const pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun1.l.google.com:19302' }, { urls:'stun:stun.cloudflare.com:3478' }] });
      const mode = call.mode || 'audio';
      let stream;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('このページではマイクを利用できません。HTTPSまたはブラウザの権限設定を確認してください。');
      try { stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:mode !== 'audio' }); }
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
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      localVideo.srcObject = stream; localVideo.style.display = mode === 'audio' ? 'none' : 'block';
      const remoteStream = new MediaStream();
      pc.ontrack = (event) => { if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track); remoteAudio.srcObject = remoteStream; remoteVideo.srcObject = remoteStream; remoteVideo.style.display = mode === 'audio' ? 'none' : 'block'; remoteAudio.muted = false; remoteAudio.volume = 1; remoteHealth.textContent='相手の音声: 受信しました'; watchLevel('remote',remoteStream,remoteMeter,remoteHealth,'相手の音声'); Promise.all([remoteAudio.play().catch(() => { speakerHealth.textContent='スピーカー: 「音声を有効化」を押してください'; }), remoteVideo.play().catch(() => {})]).finally(() => setConnected()); };
      pc.onicecandidate = (event) => { if (event.candidate) signal(call.id, { type:'candidate', candidate:event.candidate }); };
      pc.onicecandidateerror = (event) => { status.textContent = `通信経路を確認できません (${event.errorCode || 'ICE'})。再接続を試してください。`; };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') setConnected(); if (pc.connectionState === 'failed') status.textContent = '接続に失敗しました。「再接続」を試してください。'; if (pc.connectionState === 'disconnected') status.textContent = '接続が不安定です。'; };
      pc.oniceconnectionstatechange = () => { if (['checking','connected','completed'].includes(pc.iceConnectionState) && status.textContent !== '接続済み') status.textContent = '音声・映像の接続を確認中...'; };
      const peer = { pc, stream, initiator, iceQueue:[], ready:false };
      micHealth.textContent = stream.getAudioTracks().some((track) => track.enabled) ? 'マイク: 送信中' : 'マイク: OFF';
      watchLevel('mic',stream,micMeter,micHealth,'マイク');
      peers.set(call.id, peer); watchTransport(peer); showWindow(call, call.calleeEmail === session.email ? call.callerEmail : call.calleeEmail);
      if (initiator) { const offer = await pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:mode !== 'audio' }); await pc.setLocalDescription(offer); await signal(call.id, { type:'offer', sdp:offer }); }
      return peer;
    };
    const processSignals = async (call) => {
      const data = await api({ action:'get', callId:call.id }); const peer = peers.get(call.id); if (!peer) return;
      const known = seenSignals.get(call.id) || new Set();
      for (const item of data.signals || []) {
        if (known.has(item.id)) continue; known.add(item.id); const msg = item.data || {};
        if (msg.type === 'offer' && !peer.initiator && !peer.pc.remoteDescription) { await peer.pc.setRemoteDescription(msg.sdp); await drainIce(peer); const answer = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(answer); await signal(call.id, { type:'answer', sdp:answer }); }
        else if (msg.type === 'answer' && peer.initiator && !peer.pc.remoteDescription) { await peer.pc.setRemoteDescription(msg.sdp); await drainIce(peer); }
        else if (msg.type === 'candidate' && msg.candidate) { if (peer.pc.remoteDescription) { try { await peer.pc.addIceCandidate(msg.candidate); } catch {} } else peer.iceQueue.push(msg.candidate); }
      }
      seenSignals.set(call.id, known); activeCall = data.call;
      if (data.call.status === 'accepted') setConnected();
      if (['ended','declined','missed'].includes(data.call.status)) { closePeer(call.id); win.hidden = true; activeCall = null; callStartedAt = null; stopRingtone(); }
    };
    const accept = async (call) => { await enableSound(); stopRingtone(); try { notice.hidden = true; await setupPeer(call, false); await api({ action:'status', callId:call.id, status:'accepted' }); await processSignals(call); } catch (error) { notice.hidden = false; notice.innerHTML = `<strong>マイクの許可が必要です</strong><p class="muted">ブラウザのアドレスバーの鍵アイコンからマイクを許可して、もう一度応答してください。</p><button type="button" id="retryAccept">もう一度応答</button>`; notice.querySelector('#retryAccept').onclick = () => accept(call); status.textContent = error.message || '通話を開始できませんでした'; } };
    const decline = async (call) => { stopRingtone(); await api({ action:'status', callId:call.id, status:'declined' }); notice.hidden = true; };
    const poll = async () => {
      try {
        const data = await api({ action:'poll' }); const incoming = data.incoming?.[0];
        if (incoming && (!activeCall || activeCall.id !== incoming.id)) { ring(); notice.hidden = false; notice.innerHTML = `<strong>${esc(incoming.callerEmail)}から着信</strong><div class="call-actions"><button type="button" id="acceptCall">応答</button><button type="button" class="ghost" id="declineCall">拒否</button></div>`; notice.querySelector('#acceptCall').onclick = () => accept(incoming).catch((e) => { status.textContent = e.message; }); notice.querySelector('#declineCall').onclick = () => decline(incoming); }
        const missedCalls = data.missed || [];
        if (missedCalls.length) { missed.hidden = false; missed.innerHTML = `未通話 ${missedCalls.length}件: ` + missedCalls.map((call) => `<button type="button" class="ghost" data-missed="${esc(call.id)}">${esc(call.callerEmail)} (${new Date(call.createdAt).toLocaleString('ja-JP')})</button>`).join(''); missed.querySelectorAll('[data-missed]').forEach((button) => button.onclick = async () => { await api({ action:'markMissedRead', callId:button.dataset.missed }); poll(); }); }
        if (activeCall && peers.has(activeCall.id)) await processSignals(activeCall);
      } catch (error) { if (activeCall) status.textContent = '通話サーバーとの接続を再試行しています。'; }
    };
    window.Netrify.startCall = async (calleeEmail, mode = 'audio') => { const result = await api({ action:'start', calleeEmail, mode }); if (!result.recipientOnline) { alert('相手はオフラインです。未通話履歴に保存しました。'); return result; } const call = result.call; callStartedAt = Date.now(); await setupPeer(call, true); return result; };
    panel.querySelector('#enableAudio').onclick = async () => { await enableSound(); const result=await remoteAudio.play().then(()=>true).catch(()=>false); remoteVideo.play().catch(() => {}); speakerHealth.textContent = result ? 'スピーカー: 有効' : 'スピーカー: 再生できません'; status.textContent = result ? '音声出力を有効化しました' : 'スピーカーを確認してください'; };
    panel.querySelector('#testSpeaker').onclick = async () => { await enableSound(); try { const oscillator=audioContext.createOscillator(); const gain=audioContext.createGain(); gain.gain.value=.04; oscillator.frequency.value=660; oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime+.25); speakerHealth.textContent='スピーカー: テスト音を再生しました'; } catch { speakerHealth.textContent='スピーカー: テスト失敗'; } };
    panel.querySelector('#endCall').onclick = async () => { if (!activeCall) return; await api({ action:'status', callId:activeCall.id, status:'ended' }); closePeer(activeCall.id); activeCall = null; callStartedAt = null; win.hidden = true; notice.hidden = true; stopRingtone(); };
    panel.querySelector('#callClose').onclick = () => { win.hidden = true; };
    panel.querySelector('#callFullscreen').onclick = () => { const full = !win.classList.contains('call-fullscreen'); win.classList.toggle('call-fullscreen', full); panel.querySelector('#callFullscreen').textContent = full ? '小さく表示' : '全画面'; };
    panel.querySelector('#toggleMute').onclick = () => { const peer = activeCall && peers.get(activeCall.id); const track = peer?.stream?.getAudioTracks?.()[0]; if (track) { track.enabled = !track.enabled; panel.querySelector('#toggleMute').textContent = track.enabled ? 'マイクOFF' : 'マイクON'; micHealth.textContent = track.enabled ? 'マイク: 送信中' : 'マイク: OFF'; } };
    panel.querySelector('#toggleCamera').onclick = () => { const peer = activeCall && peers.get(activeCall.id); const track = peer?.stream?.getVideoTracks?.()[0]; if (track) { track.enabled = !track.enabled; panel.querySelector('#toggleCamera').textContent = track.enabled ? 'カメラOFF' : 'カメラON'; } };
    panel.querySelector('#restartCall').onclick = async () => { if (!activeCall) return; const call = activeCall; const initiator = call.callerEmail === session.email; closePeer(call.id); await setupPeer(call, initiator); };
    panel.querySelector('#shareScreen').onclick = async () => { const peer = activeCall && peers.get(activeCall.id); if (!peer || !navigator.mediaDevices.getDisplayMedia) return; try { const screen = await navigator.mediaDevices.getDisplayMedia({ video:true }); let sender = peer.pc.getSenders().find((item) => item.track?.kind === 'video'); if (!sender) { const transceiver = peer.pc.addTransceiver('video', { direction:'sendrecv' }); sender = transceiver.sender; } await sender.replaceTrack(screen.getVideoTracks()[0]); localVideo.srcObject = screen; screen.getVideoTracks()[0].onended = () => { const camera = peer.stream.getVideoTracks()[0]; if (camera) { sender.replaceTrack(camera); localVideo.srcObject = peer.stream; } }; } catch (e) { status.textContent = e.message; } };
    setInterval(() => { if (callStartedAt && !win.hidden) timer.textContent = `通話時間 ${Math.floor((Date.now() - callStartedAt) / 60000)}:${String(Math.floor((Date.now() - callStartedAt) / 1000) % 60).padStart(2, '0')}`; }, 1000);
    document.addEventListener('click', enableSound, { capture:true, once:true });
    // 通話中・呼び出し中だけ1.5秒ごと。待ち受け中は5秒（タブが裏にあるときは20秒）にしてAPI呼び出し回数を抑える。
    const nextPollDelay = () => ((!win.hidden || callStartedAt) ? 1500 : (document.hidden ? 45000 : 10000));
    const pollLoop = async () => { try { await poll(); } catch (_) { /* 次の周期で再試行 */ } setTimeout(pollLoop, nextPollDelay()); };
    pollLoop();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
