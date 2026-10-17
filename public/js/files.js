// public/js/files.js
// 「チャンク連結」ファイルストレージのクライアント側ヘルパー。
// ファイルを小さな断片(既定1.5MB)に分割し、1回のリクエストが大きくなりすぎないよう
// 順番に送信する。これによりNetlify Functionsの1リクエストあたりの上限を回避でき、
// 理論上どんなサイズのファイルでもアップロードできる(ストレージ容量が許す限り)。

const NetrifyFiles = (() => {
  const RAW_CHUNK_BYTES = 1.5 * 1024 * 1024; // 生データでのチャンクサイズ(Base64化すると約2MB)

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]); // "data:...;base64," を除去
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function postJson(body, retries = 4) {
    let lastError = null;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const res = await fetch('/.netlify/functions/files', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) return data;
        lastError = new Error(data.error || `アップロードに失敗しました (${res.status})`);
        if (![408, 425, 429].includes(res.status) && res.status < 500) throw lastError;
      } catch (error) { lastError = error; }
      if (attempt < retries - 1) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    throw lastError || new Error('アップロードに失敗しました');
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // file: File/Blobオブジェクト。onProgress(sent, total)は任意。
  async function uploadFile(file, token, onProgress) {
    const fileId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(36).slice(2);
    const totalChunks = Math.max(1, Math.ceil(file.size / RAW_CHUNK_BYTES));

    for (let i = 0; i < totalChunks; i++) {
      const start = i * RAW_CHUNK_BYTES;
      const slice = file.slice(start, start + RAW_CHUNK_BYTES);
      const base64 = await blobToBase64(slice);
      try {
        await postJson({ action:'uploadChunk', token, fileId, chunkIndex:i, totalChunks, data:base64, fileName:file.name, mimeType:file.type || 'application/octet-stream' });
      } catch (error) {
        throw new Error(`${error.message} (チャンク ${i + 1}/${totalChunks})`);
      }
      if (onProgress) onProgress(i + 1, totalChunks);
    }

    let finalizeRes;
    let finalizeError = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      finalizeRes = await fetch('/.netlify/functions/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize', token, fileId, totalBytes: file.size, totalChunks, fileName: file.name, mimeType: file.type || 'application/octet-stream' })
      });
      if (finalizeRes.ok) break;
      const err = await finalizeRes.json().catch(() => ({}));
      finalizeError = err.error || 'アップロードの完了処理に失敗しました';
      if (finalizeRes.status !== 404 || attempt === 7) throw new Error(finalizeError);
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    const data = await finalizeRes.json();
    return data.manifest; // { fileId, fileName, mimeType, totalBytes, totalChunks, ... }
  }

  // 戻り値: { blob, url(ObjectURL), manifest }
  async function downloadFile(fileId, token, onProgress) {
    const manifestRes = await fetch(`/.netlify/functions/files?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`);
    if (!manifestRes.ok) throw new Error('ファイル情報の取得に失敗しました');
    const { manifest } = await manifestRes.json();

    const parts = [];
    for (let i = 0; i < manifest.totalChunks; i++) {
      const res = await fetch(`/.netlify/functions/files?fileId=${encodeURIComponent(fileId)}&chunkIndex=${i}&token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`ファイルの取得に失敗しました(パート ${i + 1}/${manifest.totalChunks})`);
      const data = await res.json();
      parts.push(base64ToBytes(data.data));
      if (onProgress) onProgress(i + 1, manifest.totalChunks);
    }

    const blob = new Blob(parts, { type:manifest.mimeType || 'application/octet-stream' });
    return { blob, url: URL.createObjectURL(blob), manifest };
  }

  return { uploadFile, downloadFile };
})();
