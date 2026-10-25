// チャットのハイブリッド通信: ルームを開いている相手がいれば、メッセージ・既読をWebRTC(DataChannel)で直接送って即時表示する。
// 履歴はこれまでどおりSupabaseに保存。WebRTCで受け取ったメッセージは、Supabaseに同じものが届くまで端末に残し(保留)、再読み込みしても消えない。
// ※Cookieは4KBまでで長文・複数件が入らないため、同じ役割をlocalStorageで行う。
(function () {
  if (window.ChatRT) return;
  const PEND_TTL = 30 * 60e3, MAX_PEERS = 8, MAX_P2P_FILE = 150 * 1024 * 1024, P2P_CHUNK = 16 * 1024;
  let cfg = null, deviceId = '', peers = new Map(), reads = new Map(), timer = null, iceCache = null, readyForSync = false, lastPeersSig = '';
  const rand = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 24);
  const pkey = () => 'mx-rt-pending:' + cfg.roomId;
  const loadPending = () => { try { const a = JSON.parse(localStorage.getItem(pkey()) || '[]'); return Array.isArray(a) ? a.filter((x) => x && x.m && Date.now() - x.at < PEND_TTL) : []; } catch (_) { return []; } };
  const savePending = (a) => { try { localStorage.setItem(pkey(), JSON.stringify(a.slice(-60))); } catch (_) {} };
  const api = (body) => Netrify.api('/api/rt', { token: cfg.session.token, roomId: cfg.roomId, deviceId, ...body });
  const getIce = async () => { if (iceCache) return iceCache; try { const r = await Netrify.api('/api/calls', { action: 'ice', token: cfg.session.token }); iceCache = r.iceServers; } catch (_) { iceCache = [{ urls: 'stun:stun.l.google.com:19302' }]; } return iceCache; };
  const sigSend = (toDevice, data) => api({ action: 'signal', toDevice, data }).catch(() => {});

  function addPending(m) { const a = loadPending().filter((x) => x.m.id !== m.id); a.push({ m, at: Date.now() }); savePending(a); }
  function applyReads(list) { return list.map((m) => { const r = reads.get(m.id); if (!r || !r.size) return m; const set = new Set([...(m.readBy || []), ...r]); return set.size === (m.readBy || []).length ? m : { ...m, readBy: [...set] }; }); }

  function wire(peer, dc) {
    peer.dc = dc; dc.binaryType = 'arraybuffer'; peer.announced = peer.announced || new Map();
    dc.onopen = () => { peer.open = true; schedule(300); cfg.onStatus && cfg.onStatus(); };
    dc.onclose = () => { peer.open = false; cfg.onStatus && cfg.onStatus(); };
    dc.onmessage = (e) => {
      if (typeof e.data !== 'string') {                                                  // ファイルの中身(バイナリ)
        const rx = peer.rx; if (!rx) return; rx.parts.push(e.data); rx.got += e.data.byteLength;
        if (rx.got > rx.size + 1024) peer.rx = null;
        return;
      }
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (d.t === 'msg' && d.m && typeof d.m === 'object') {
        const m = d.m; if (m.authorEmail !== peer.email || !m.id) return;                      // 送信者本人のメッセージだけ受け付ける(なりすまし防止)
        if (String(m.text || '').length > 6000) return;
        if (cfg.hasMessage && cfg.hasMessage(m.id)) return;
        const att = m.attachment;                                                          // 画像・動画・音声が添付されているときは、続けてファイル本体がP2Pで届く
        if (att && att.fileId && /^(image|video|audio)\//.test(String(att.type || '')) && Number(att.sizeBytes) > 0 && Number(att.sizeBytes) <= MAX_P2P_FILE && !att.isStamp) { peer.announced.set(String(att.fileId), String(att.type)); cfg.onAnnounce && cfg.onAnnounce(att); }
        addPending(m); cfg.onMessage && cfg.onMessage(m);
      } else if (d.t === 'fmeta' && d.id) {
        const id = String(d.id), type = peer.announced.get(id), size = Number(d.size);
        if (!type || !(size > 0) || size > MAX_P2P_FILE || (cfg.hasFile && cfg.hasFile(id))) { peer.rx = null; return; }  // 本人が送ったメッセージで予告された添付だけ受け取る(なりすまし防止)
        peer.rx = { id, size, type, parts: [], got: 0 };
      } else if (d.t === 'fend' && peer.rx && peer.rx.id === String(d.id)) {
        const rx = peer.rx; peer.rx = null; peer.announced.delete(rx.id);
        if (rx.got === rx.size) cfg.onFile && cfg.onFile(rx.id, new Blob(rx.parts, { type: rx.type }));
      } else if (d.t === 'read' && Array.isArray(d.ids)) {
        for (const id of d.ids.slice(0, 200)) { const k = String(id); if (!reads.has(k)) reads.set(k, new Set()); reads.get(k).add(peer.email); }
        cfg.onRead && cfg.onRead();
      } else if (d.t === 'typing') { cfg.onTyping && cfg.onTyping(peer.email, !!d.on); }
    };
  }
  async function connect(remote) {
    if (peers.has(remote.deviceId) || peers.size >= MAX_PEERS) return;
    const pc = new RTCPeerConnection({ iceServers: await getIce() });
    const peer = { pc, email: remote.email, deviceId: remote.deviceId, open: false, queue: [], initiator: deviceId < remote.deviceId, at: Date.now() };
    peers.set(remote.deviceId, peer);
    pc.onicecandidate = (e) => { if (e.candidate) sigSend(remote.deviceId, { type: 'cand', c: e.candidate }); };
    pc.ondatachannel = (e) => wire(peer, e.channel);
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) drop(remote.deviceId); };
    if (peer.initiator) { wire(peer, pc.createDataChannel('chat', { ordered: true })); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); sigSend(remote.deviceId, { type: 'offer', sdp: pc.localDescription }); }
  }
  function drop(id) { const p = peers.get(id); if (!p) return; try { p.dc && p.dc.close(); p.pc.close(); } catch (_) {} peers.delete(id); cfg.onStatus && cfg.onStatus(); }
  async function handleSignal(sig) {
    const from = sig.from || {}, d = sig.data || {}; if (!from.deviceId) return;
    let peer = peers.get(from.deviceId);
    if (d.type === 'offer') {
      if (peer && peer.initiator) return;                                   // 双方が発信した場合は deviceId の小さい側が発信側
      if (!peer) { await connect({ email: from.email, deviceId: from.deviceId }); peer = peers.get(from.deviceId); }
      if (!peer) return; peer.email = from.email;
      await peer.pc.setRemoteDescription(d.sdp); await flush(peer);
      const ans = await peer.pc.createAnswer(); await peer.pc.setLocalDescription(ans); sigSend(from.deviceId, { type: 'answer', sdp: peer.pc.localDescription });
    } else if (d.type === 'answer' && peer && peer.pc.signalingState === 'have-local-offer') { await peer.pc.setRemoteDescription(d.sdp); await flush(peer); }
    else if (d.type === 'cand' && peer) { if (peer.pc.remoteDescription) { try { await peer.pc.addIceCandidate(d.c); } catch (_) {} } else peer.queue.push(d.c); }
  }
  async function pushFile(p, id, file) {
    const dc = p.dc; dc.bufferedAmountLowThreshold = 512 * 1024;
    dc.send(JSON.stringify({ t: 'fmeta', id, size: file.size }));
    for (let off = 0; off < file.size; off += 256 * 1024) {
      const blk = new Uint8Array(await file.slice(off, off + 256 * 1024).arrayBuffer());
      for (let j = 0; j < blk.length; j += P2P_CHUNK) {
        if (dc.readyState !== 'open') return;
        if (dc.bufferedAmount > 1024 * 1024) await new Promise((res) => { const h = () => { dc.removeEventListener('bufferedamountlow', h); res(); }; dc.addEventListener('bufferedamountlow', h); setTimeout(h, 2000); });
        dc.send(blk.subarray(j, j + P2P_CHUNK));
      }
    }
    if (dc.readyState === 'open') dc.send(JSON.stringify({ t: 'fend', id }));
  }
  async function flush(peer) { while (peer.queue.length && peer.pc.remoteDescription) { try { await peer.pc.addIceCandidate(peer.queue.shift()); } catch (_) {} } }

  async function tick() {
    timer = null; if (!cfg) return;
    try {
      const r = await api({ action: 'sync' });
      const online = new Map((r.peers || []).map((p) => [p.deviceId, p]));
      for (const [id, p] of peers) if (!online.has(id) && Date.now() - p.at > 8000) drop(id);   // 在室から消えた端末の接続を片付ける
      for (const sig of r.signals || []) await handleSignal(sig).catch(() => {});
      for (const p of online.values()) if (deviceId < p.deviceId) await connect(p).catch(() => {});  // 発信は deviceId の小さい側だけ
      const sig = [...online.keys()].sort().join(',') + '|' + [...peers.values()].filter((p) => p.open).length; if (sig !== lastPeersSig) { lastPeersSig = sig; cfg.onStatus && cfg.onStatus(); }
    } catch (_) {}
    schedule();
  }
  function schedule(ms) { if (timer) clearTimeout(timer); if (!cfg) return; const pending = [...peers.values()].some((p) => !p.open); timer = setTimeout(tick, ms || (pending ? 1500 : (peers.size ? 9000 : 6000))); }

  window.ChatRT = {
    init(c) {
      if (!window.RTCPeerConnection || !c.session) return; cfg = c; deviceId = rand();
      schedule(200);
      const bye = () => { try { navigator.sendBeacon('/api/rt', new Blob([JSON.stringify({ token: cfg.session.token, roomId: cfg.roomId, deviceId, action: 'bye' })], { type: 'application/json' })); } catch (_) {} peers.forEach((_, id) => drop(id)); };
      window.addEventListener('pagehide', bye);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(200); });
    },
    newId: rand,
    dropPending(id) { savePending(loadPending().filter((x) => x.m.id !== id)); },
    applyReads(list) { return cfg ? applyReads(list) : list; },
    // 接続中の全員に送る。返り値=送れた相手の数
    broadcast(obj) { let n = 0; const s = JSON.stringify(obj); peers.forEach((p) => { if (p.open && p.dc && p.dc.readyState === 'open') { try { p.dc.send(s); n++; } catch (_) {} } }); return n; },
    sendMessage(m) { addPending(m); return this.broadcast({ t: 'msg', m }); },
    // 画像・動画・音声ファイルを、接続中の相手へ直接送る(Supabaseへの保存とは別に。先に sendMessage で予告しておくこと)
    sendFile(id, file) {
      if (!file || file.size > MAX_P2P_FILE || !/^(image|video|audio)\//.test(file.type || '')) return 0; let n = 0;
      peers.forEach((p) => {
        if (!(p.open && p.dc && p.dc.readyState === 'open')) return; n++;
        p.sendQ = (p.sendQ || Promise.resolve()).then(() => pushFile(p, id, file)).catch(() => {});
      });
      return n;
    },
    sendRead(ids) { if (ids && ids.length) this.broadcast({ t: 'read', ids: ids.slice(0, 200) }); },
    sendTyping(on) { this.broadcast({ t: 'typing', on: !!on }); },
    connectedCount() { let n = 0; peers.forEach((p) => { if (p.open) n++; }); return n; },
    connectedEmails() { const s = new Set(); peers.forEach((p) => { if (p.open) s.add(p.email); }); return s; },
    // サーバーの一覧 + まだサーバーに無い保留メッセージ(WebRTCで受信/自分で送信)を合成し、WebRTCで届いた既読を反映して返す
    decorate(serverMessages) {
      if (!cfg) return serverMessages;
      const real = serverMessages.filter((m) => !m._pending);                       // _pending付きは端末内の保留分なので、サーバーにある扱いにしない
      const have = new Set(real.map((m) => m.id)); const pend = loadPending(); const keep = pend.filter((x) => !have.has(x.m.id));
      if (keep.length !== pend.length) savePending(keep);
      const merged = real.concat(keep.map((x) => ({ ...x.m, _pending: true })));
      merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return applyReads(merged);
    },
    // 4秒ごとの全件取得は、オンラインの相手全員とWebRTCで繋がっているときだけ間引く
    pollDelay(room) {
      if (!cfg || !room || !room.profiles) return 4000; const conn = this.connectedEmails(); let allOnline = true, any = false;
      for (const [email, prof] of Object.entries(room.profiles)) { if (email === cfg.session.email || !prof || !prof.online) continue; any = true; if (!conn.has(email)) allOnline = false; }
      return any && allOnline ? 15000 : 4000;
    },
  };
})();
