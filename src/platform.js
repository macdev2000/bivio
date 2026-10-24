// Accesso ai file: nell'app desktop usa Tauri, nel browser usa download e <input type=file>.

export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let tauri = null;
async function T() {
  if (!tauri) {
    const [dialog, fs, win] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/api/window'),
    ]);
    tauri = { dialog, fs, win };
  }
  return tauri;
}

const BOOK_FILTER = { name: 'Librogame Bivio', extensions: ['bivio', 'json'] };

/** Apre un libro. Restituisce {name, path, text} oppure null se annullato. */
export async function openBookFile() {
  if (isDesktop) {
    const { dialog, fs } = await T();
    const path = await dialog.open({ multiple: false, filters: [BOOK_FILTER] });
    if (!path) return null;
    const text = await fs.readTextFile(path);
    return { path, name: basename(path), text };
  }
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bivio,.json,application/json';
    input.onchange = async () => {
      const f = input.files[0];
      resolve(f ? { path: null, name: f.name, text: await f.text() } : null);
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Sceglie un'immagine JPG o PNG: {bytes, type} oppure null. */
export async function openImageFileBytes() {
  const typeOf = name => /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
  if (isDesktop) {
    const { dialog, fs } = await T();
    const path = await dialog.open({ multiple: false, filters: [{ name: 'Immagine', extensions: ['jpg', 'jpeg', 'png'] }] });
    if (!path) return null;
    return { bytes: await fs.readFile(path), type: typeOf(path) };
  }
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png';
    input.onchange = async () => {
      const f = input.files[0];
      resolve(f ? { bytes: new Uint8Array(await f.arrayBuffer()), type: typeOf(f.name) } : null);
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Sceglie un file di testo e ne restituisce i byte: {name, bytes} oppure null. */
export async function openTextFileBytes() {
  if (isDesktop) {
    const { dialog, fs } = await T();
    const path = await dialog.open({ multiple: false, filters: [{ name: 'Testo', extensions: ['txt', 'text', 'md'] }] });
    if (!path) return null;
    return { name: basename(path), bytes: await fs.readFile(path) };
  }
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.text,.md,text/plain';
    input.onchange = async () => {
      const f = input.files[0];
      resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Salva il libro. Con `path` sovrascrive, altrimenti chiede dove. Restituisce il percorso o null. */
export async function saveBookFile(text, { path = null, suggestedName = 'librogame.bivio' } = {}) {
  if (isDesktop) {
    const { dialog, fs } = await T();
    let target = path;
    if (!target) {
      target = await dialog.save({ defaultPath: suggestedName, filters: [BOOK_FILTER] });
      if (!target) return null;
    }
    await rotateBackups(fs, target);
    await fs.writeTextFile(target, text);
    return target;
  }
  download(new Blob([text], { type: 'application/json' }), suggestedName);
  return suggestedName;
}

/** Salva un file esportato (testo o byte). Restituisce il nome/percorso, o null se annullato. */
export async function saveExport(data, { name, ext, label, mime }) {
  if (isDesktop) {
    const { dialog, fs } = await T();
    const target = await dialog.save({ defaultPath: name, filters: [{ name: label, extensions: [ext] }] });
    if (!target) return null;
    if (typeof data === 'string') await fs.writeTextFile(target, data);
    else await fs.writeFile(target, data instanceof Uint8Array ? data : new Uint8Array(await toArrayBuffer(data)));
    return target;
  }
  download(typeof data === 'string' ? new Blob([data], { type: mime }) : data instanceof Blob ? data : new Blob([data], { type: mime }), name);
  return name;
}

export async function confirmDialog(message, title = 'Bivio') {
  if (isDesktop) {
    const { dialog } = await T();
    return dialog.ask(message, { title, kind: 'warning', okLabel: 'Sì', cancelLabel: 'No' });
  }
  return pageDialog(message, true);
}

export async function alertDialog(message, title = 'Bivio') {
  if (isDesktop) {
    const { dialog } = await T();
    return dialog.message(message, { title });
  }
  await pageDialog(message, false);
}

/** Avvisa prima di chiudere con modifiche non salvate. */
export async function onCloseGuard(isDirty) {
  if (isDesktop) {
    const { win } = await T();
    const w = win.getCurrentWindow();
    await w.onCloseRequested(async (e) => {
      if (isDirty() && !(await confirmDialog('Ci sono modifiche non salvate. Vuoi chiudere comunque?'))) e.preventDefault();
    });
  } else {
    window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  }
}

export async function setWindowTitle(title) {
  document.title = title;
  if (isDesktop) {
    try { const { win } = await T(); await win.getCurrentWindow().setTitle(title); } catch { /* facoltativo */ }
  }
}

export function basename(path) {
  return String(path).split(/[\\/]/).pop();
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function toArrayBuffer(data) {
  if (data instanceof Blob) return data.arrayBuffer();
  if (data instanceof ArrayBuffer) return data;
  return data.buffer;
}

/** Finestra di conferma dentro la pagina (nel browser confirm() può essere bloccato). */
function pageDialog(message, ask) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p></p><div class="modal-btns">
      ${ask ? '<button data-v="0">No</button>' : ''}<button class="primary" data-v="1">${ask ? 'Sì' : 'OK'}</button></div></div>`;
    wrap.querySelector('p').textContent = message;
    const done = v => { wrap.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
    };
    wrap.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(wrap);
    wrap.querySelector('.primary').focus();
  });
}

/**
 * Prima di sovrascrivere un libro tiene le ultime cinque versioni:
 * libro.bivio.bak1 (la più recente) … libro.bivio.bak5 (la più vecchia).
 */
async function rotateBackups(fs, target) {
  try {
    if (!(await fs.exists(target))) return;
    for (let i = 4; i >= 1; i--) {
      if (await fs.exists(`${target}.bak${i}`)) await fs.copyFile(`${target}.bak${i}`, `${target}.bak${i + 1}`);
    }
    await fs.copyFile(target, `${target}.bak1`);
  } catch (e) {
    console.warn('Copie di sicurezza non riuscite', e); // non deve impedire il salvataggio
  }
}

/** Copia automatica accanto al file aperto: “~libro.bivio”. Solo nell'app desktop. */
export async function writeAutosave(path, text) {
  if (!isDesktop || !path) return false;
  const { fs } = await T();
  const sep = path.includes('\\') && !path.includes('/') ? '\\' : '/';
  const i = path.lastIndexOf(sep);
  const auto = `${path.slice(0, i + 1)}~${path.slice(i + 1)}`;
  await fs.writeTextFile(auto, text);
  return true;
}
