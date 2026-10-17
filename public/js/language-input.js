(function () {
  const TOKEN_RE = /\[\[glyph:([a-z0-9_]+)\]\]/gi;
  let glyphs = new Map();
  let opened = null;

  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
  function css() {
    if (document.getElementById('languageInputStyles')) return;
    const style = document.createElement('style'); style.id = 'languageInputStyles';
    style.textContent = `.language-input-wrap{position:relative;display:flex;align-items:flex-start;gap:6px;margin:4px 0}.language-input-wrap>textarea,.language-input-wrap>input{flex:1}.language-input-btn{white-space:nowrap;padding:7px 9px;border:1px solid var(--border);border-radius:8px;background:var(--panel-2);color:inherit;cursor:pointer}.language-input-btn:hover{border-color:var(--accent)}.language-picker{position:absolute;z-index:3000;right:0;top:100%;display:none;max-width:min(440px,calc(100vw - 24px));max-height:260px;overflow:auto;padding:8px;border:1px solid var(--border);border-radius:10px;background:var(--card);box-shadow:0 8px 24px rgba(0,0,0,.25)}.language-picker.open{display:block}.language-picker-group{font-size:.78rem;color:var(--muted);padding:4px}.language-picker-glyph{display:inline-flex;align-items:center;gap:5px;margin:3px;padding:4px;border:1px solid var(--border);border-radius:7px;background:var(--panel-2);cursor:pointer;color:inherit}.language-picker-glyph img{width:32px;height:32px;object-fit:contain}.language-editor{flex:1;min-height:44px;max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--panel-2);padding:8px;font:inherit;line-height:1.7;white-space:pre-wrap;word-break:break-word}.language-editor:empty:before{content:attr(data-placeholder);color:var(--muted)}.language-editor img,.language-rendered-glyph{width:1em;height:1em;object-fit:contain;vertical-align:-.12em;margin:0 .08em}.post img.language-rendered-glyph,.text img.language-rendered-glyph,.ghost-text-content img.language-rendered-glyph,#messageList img.language-rendered-glyph,#threadMessageList img.language-rendered-glyph{display:inline-block!important;width:1em!important;height:1em!important;max-width:none!important;max-height:none!important;border-radius:0!important;margin:0 .08em!important;background:transparent!important}`;
    document.head.appendChild(style);
  }
  function serialize(editor) {
    let result = '';
    editor.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) result += node.nodeValue;
      else if (node.nodeType === Node.ELEMENT_NODE && node.matches('img[data-glyph-token]')) result += node.dataset.glyphToken;
      else result += node.textContent || '';
    });
    return result;
  }
  function sync(control, editor) { control.value = serialize(editor); control.dispatchEvent(new Event('input', { bubbles:true })); }
  function insertImage(control, token, glyph) {
    if (control._languageEditor) {
      const editor = control._languageEditor;
      editor.focus();
      const image = document.createElement('img'); image.src = glyph.imageDataUrl; image.alt = glyph.label; image.title = glyph.meaning || glyph.label; image.dataset.glyphToken = token;
      const selection = window.getSelection();
      if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) { const range = selection.getRangeAt(0); range.deleteContents(); range.insertNode(image); range.setStartAfter(image); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
      else editor.appendChild(image);
      sync(control, editor); return;
    }
    const start = control.selectionStart ?? control.value.length, end = control.selectionEnd ?? start;
    control.value = control.value.slice(0, start) + token + control.value.slice(end);
    control.selectionStart = control.selectionEnd = start + token.length; control.dispatchEvent(new Event('input', { bubbles:true })); control.focus();
  }
  function setupVisualEditor(control) {
    if (control.tagName !== 'TEXTAREA') return;
    const editor = document.createElement('div'); editor.className='language-editor'; editor.contentEditable='true'; editor.setAttribute('role','textbox'); editor.dataset.placeholder=control.placeholder || '入力してください';
    editor.innerHTML = '';
    control.style.display='none'; control.parentNode.insertBefore(editor, control); control._languageEditor=editor;
    editor.addEventListener('input', () => sync(control, editor));
    const valueDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value');
    if (valueDescriptor && valueDescriptor.get && valueDescriptor.set) Object.defineProperty(control, 'value', { configurable: true, get() { return valueDescriptor.get.call(control); }, set(value) { valueDescriptor.set.call(control, value); if (!String(value || '')) editor.replaceChildren(); } });
    editor.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && control.dataset.languageSubmit === 'true') { event.preventDefault(); control.form?.requestSubmit(); } });
  }
  function close() { if (opened) opened.classList.remove('open'); opened = null; }
  function addControl(control) {
    if (control.dataset.languageInputReady === '1' || control.disabled || control.readOnly) return;
    if (control.tagName === 'INPUT' && !['text','search','url'].includes(control.type)) return;
    if (control.closest('.language-input-wrap')) return;
    control.dataset.languageInputReady='1';
    const wrap=document.createElement('span'); wrap.className='language-input-wrap'; control.parentNode.insertBefore(wrap,control); wrap.appendChild(control);
    setupVisualEditor(control);
    const editor = control._languageEditor || control;
    const button=document.createElement('button');button.type='button';button.className='language-input-btn';button.textContent='特殊言語';button.title='文字画像を入力（Alt+Lで開く）';button.setAttribute('aria-label','特殊言語入力（Alt+Lで開く）');wrap.appendChild(button);
    const picker=document.createElement('div');picker.className='language-picker';wrap.appendChild(picker);
    button.onclick=(event)=>{event.stopPropagation();if(opened&&opened!==picker)close();picker.classList.toggle('open');opened=picker.classList.contains('open')?picker:null;};
    editor.addEventListener('keydown', event => { if (event.altKey && event.key.toLowerCase()==='l') { event.preventDefault(); button.click(); picker.querySelector('[data-language-glyph]')?.focus(); } if (opened===picker && ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)) { const items=[...picker.querySelectorAll('[data-language-glyph]')]; const i=items.indexOf(document.activeElement); if(i>=0){event.preventDefault(); items[(i+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();} } if (opened===picker && event.key==='Escape') { event.preventDefault(); close(); editor.focus(); } });
    picker.addEventListener('keydown', event => { if(event.key==='Enter'){event.preventDefault();event.target.closest('[data-language-glyph]')?.click();close();editor.focus();} });
    picker.addEventListener('click',event=>{const button=event.target.closest('[data-language-glyph]');if(!button)return;const glyph=glyphs.get(button.dataset.languageGlyph.toLowerCase());if(glyph)insertImage(control,`[[glyph:${glyph.id}]]`,glyph);});
  }
  function renderPickers(){document.querySelectorAll('.language-picker').forEach(picker=>{picker.innerHTML=glyphs.size?[...new Map([...glyphs.values()].map(g=>[g.languageId,g.languageName])).entries()].map(([id,name])=>`<div class="language-picker-group">${esc(name)}</div>${[...glyphs.values()].filter(g=>g.languageId===id).map(g=>`<button type="button" class="language-picker-glyph" data-language-glyph="${esc(g.id)}"><img src="${esc(g.imageDataUrl)}" alt="${esc(g.label)}"><span>${esc(g.label)}</span></button>`).join('')}`).join(''):'<span class="muted">登録された文字がありません。</span>';});}
  function renderText(text){return esc(text).replace(TOKEN_RE,(_,id)=>{const glyph=glyphs.get(id.toLowerCase());return glyph?`<img class="language-rendered-glyph" src="${esc(glyph.imageDataUrl)}" alt="${esc(glyph.label)}" title="${esc(glyph.meaning||glyph.label)}">`:`<span class="language-glyph-token">〔${esc(id)}〕</span>`;});}
  window.NetrifyLanguage={renderText,tokenPattern:TOKEN_RE,refresh:()=>document.querySelectorAll('textarea,input[type="text"],input[type="search"],input[type="url"],[contenteditable="true"]').forEach(addControl)};
  document.addEventListener('DOMContentLoaded',async()=>{css();document.addEventListener('click',event=>{if(opened&&!event.target.closest('.language-input-wrap'))close();});document.querySelectorAll('textarea,input[type="text"],input[type="search"],input[type="url"],[contenteditable="true"]').forEach(addControl);const session=window.Netrify&&window.Netrify.getSession?window.Netrify.getSession():null;if(!session)return;try{const response=await fetch('/.netlify/functions/languages?token='+encodeURIComponent(session.token));if(!response.ok)return;const data=await response.json();(data.languages||[]).forEach(language=>(language.entries||[]).forEach(entry=>glyphs.set(String(entry.id).toLowerCase(),{...entry,languageId:language.id,languageName:language.name})));renderPickers();document.dispatchEvent(new CustomEvent('netrify-language-ready'));setTimeout(()=>{if(typeof window.loadThread==='function')window.loadThread();if(typeof window.loadRoom==='function')window.loadRoom();},0);}catch(_){}});
})();
