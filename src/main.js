import * as M from './model.js';
import { parse, toHtml, escapeHtml, extractLinks } from './markup.js';
import * as P from './platform.js';
import { fileBase } from './export/common.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// ------------------------------------------------------------------ stato
const S = {
  book: null,
  path: null,          // percorso del file (desktop) o nome (browser)
  dirty: false,
  currentId: null,
  history: [], histPos: -1,
  view: 'write',
  filter: { q: '', tags: new Set(), problems: false },
  undo: [],            // istantanee prima delle operazioni strutturali
  play: { path: [], pos: -1 },
  map: { cy: null, stale: true },
  issues: [],
};

const BACKUP_KEY = 'bivio:sessione';

const current = () => S.book.paragraphs.find(p => p.id === S.currentId) || null;
const byId = id => S.book.paragraphs.find(p => p.id === id);

// ------------------------------------------------------------------ avvio
function init() {
  if (import.meta.env.VITE_DEMO) {
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.textContent = 'Versione di prova nel browser: puoi scrivere, usare mappa, gioco e controlli. Salvataggio ed esportazione funzionano solo nell’app installata.';
    $('#app').insertBefore(b, $('.body'));
  }
  fillStatic();
  bindEvents();
  let restored = false;
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (raw) {
      const b = JSON.parse(raw);
      setBook(M.loadBook(b.book), b.path || null, { dirty: !!b.dirty, keepUndo: false });
      restored = true;
    }
  } catch { /* backup illeggibile: si riparte da zero */ }
  if (!restored) setBook(M.newBook(), null);
  P.onCloseGuard(() => S.dirty);
}

function fillStatic() {
  $('#pType').innerHTML = Object.entries(M.TYPES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}

function setBook(book, path, { dirty = false, keepUndo = false } = {}) {
  S.book = book;
  S.path = path;
  S.dirty = dirty;
  if (!keepUndo) S.undo = [];
  S.history = []; S.histPos = -1;
  S.filter = { q: '', tags: new Set(), problems: false };
  $('#search').value = '';
  S.play = { path: [], pos: -1 };
  S.map.stale = true;
  const first = byId(book.settings.start) || M.sorted(book)[0];
  S.currentId = null;
  if (first) openParagraph(first.id, { focus: false });
  refreshAll();
}

// ------------------------------------------------------------------ modifiche
let backupTimer = null, sideTimer = null;

function touch({ structure = false } = {}) {
  S.dirty = true;
  S.map.stale = true;
  updateTitle();
  clearTimeout(backupTimer);
  backupTimer = setTimeout(saveBackup, 800);
  if (structure) { M.ensureTagColors(S.book); refreshAll(); }
  else { clearTimeout(sideTimer); sideTimer = setTimeout(() => { renderSidebar(); renderLinks(); renderIssuesBadge(); }, 250); }
}

function saveBackup() {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ book: S.book, path: S.path, dirty: S.dirty })); } catch { /* spazio esaurito */ }
}

function snapshot(label) {
  S.undo.push({ label, json: M.serialize(S.book), currentId: S.currentId });
  if (S.undo.length > 40) S.undo.shift();
  $('#btnUndo').disabled = false;
}

function undo() {
  const snap = S.undo.pop();
  if (!snap) return;
  S.book = M.loadBook(snap.json);
  S.currentId = byId(snap.currentId) ? snap.currentId : M.sorted(S.book)[0]?.id;
  touch({ structure: true });
  renderEditor();
  toast(`Annullato: ${snap.label}`);
}

function refreshAll() {
  updateTitle();
  renderSidebar();
  renderEditor();
  renderIssuesBadge();
  $('#btnUndo').disabled = S.undo.length === 0;
  if (S.view !== 'write') renderView();
}

function updateTitle() {
  if (document.activeElement !== $('#bookTitle')) $('#bookTitle').value = S.book.title;
  const fname = S.path ? P.basename(S.path) : 'non salvato';
  const fn = $('#fileName');
  fn.textContent = fname;
  fn.title = S.path || '';
  fn.classList.toggle('dirty', S.dirty);
  P.setWindowTitle(`${S.dirty ? '• ' : ''}${S.book.title} — Bivio`);
}

// ------------------------------------------------------------------ elenco laterale
function issuesByParagraph() {
  const m = new Map();
  for (const i of S.issues) if (i.p) {
    const lvl = m.get(i.p.id);
    if (!lvl || i.level === 'error') m.set(i.p.id, i.level);
  }
  return m;
}

function matchesFilter(p) {
  const f = S.filter;
  if (f.tags.size && !p.tags.some(t => f.tags.has(t))) return false;
  if (f.problems && !issuesByParagraph().has(p.id)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (/^\d+$/.test(q)) return String(p.number).startsWith(q) || p.key.includes(q) || p.text.toLowerCase().includes(q);
    return p.key.toLowerCase().includes(q) || p.text.toLowerCase().includes(q) || p.tags.some(t => t.includes(q.replace(/^#/, '')));
  }
  return true;
}

function renderSidebar() {
  S.issues = M.validate(S.book);
  const issueMap = issuesByParagraph();
  const list = M.sorted(S.book).filter(matchesFilter);
  const start = S.book.settings.start;
  $('#parList').innerHTML = list.map(p => {
    const flags = [];
    if (p.id === start) flags.push('<span class="flag start" title="Paragrafo iniziale">▶</span>');
    if (p.fixed) flags.push('<span class="flag" title="Numero fisso">⚓</span>');
    if (p.type === 'vittoria') flags.push('<span class="flag win" title="Finale: vittoria">★</span>');
    if (p.type === 'morte') flags.push('<span class="flag lose" title="Finale: sconfitta">✝</span>');
    const lvl = issueMap.get(p.id);
    if (lvl === 'error') flags.push('<span class="flag err" title="Link a un paragrafo inesistente">!</span>');
    else if (lvl === 'warn') flags.push('<span class="flag" title="Vedi Controlli">•</span>');
    if (p.notes.trim()) flags.push('<span class="flag todo" title="Ha un promemoria">✎</span>');
    const dots = p.tags.slice(0, 4).map(t => `<span style="background:${M.tagColor(S.book, t)}" title="#${escapeHtml(t)}"></span>`).join('');
    const cls = [p.id === S.currentId ? 'current' : '', p.text.trim() ? '' : 'empty', p.notes.trim() ? 'has-todo' : ''].filter(Boolean).join(' ');
    return `<li data-id="${p.id}" class="${cls}" role="option" title="${p.text.trim() ? '' : 'Paragrafo vuoto'}">
      <span class="n">${p.number}</span><span class="k">${escapeHtml(p.key)}</span>
      <span class="dots">${dots}</span>${flags.join('')}</li>`;
  }).join('') || '<li class="muted" style="cursor:default">Nessun risultato</li>';

  const tags = M.allTags(S.book);
  for (const t of [...S.filter.tags]) if (!tags.includes(t)) S.filter.tags.delete(t);
  $('#tagFilter').innerHTML =
    tags.map(t => `<span class="tag-chip ${S.filter.tags.has(t) ? 'on' : ''}" data-tag="${escapeHtml(t)}"><span class="dot" style="background:${M.tagColor(S.book, t)}"></span>#${escapeHtml(t)}</span>`).join('') +
    (issueMap.size ? `<span class="tag-chip problems ${S.filter.problems ? 'on' : ''}" data-problems="1">con problemi (${issueMap.size})</span>` : '');

  const st = M.stats(S.book);
  $('#stats').textContent = `${st.paragraphs} paragrafi · ${st.words.toLocaleString('it-IT')} parole`;
}

function renderIssuesBadge() {
  const errs = S.issues.filter(i => i.level === 'error').length;
  const warns = S.issues.filter(i => i.level === 'warn').length;
  const b = $('#issueBadge');
  b.hidden = !(errs || warns);
  b.textContent = errs || warns;
  b.className = 'badge' + (errs ? '' : ' warn');
}

// ------------------------------------------------------------------ editor
function openParagraph(id, { focus = true, pushHistory = true } = {}) {
  if (!byId(id)) return;
  S.currentId = id;
  if (pushHistory && S.history[S.histPos] !== id) {
    S.history = S.history.slice(0, S.histPos + 1);
    S.history.push(id);
    S.histPos = S.history.length - 1;
  }
  hideAutocomplete();
  renderEditor();
  renderSidebar();
  const li = $(`#parList li[data-id="${id}"]`);
  li?.scrollIntoView({ block: 'nearest' });
  if (focus) $('#pText').focus();
}

function renderEditor() {
  const p = current();
  $('#noPar').hidden = !!p;
  $('#editor').hidden = !p;
  if (!p) return;
  const set = (sel, v) => { const el = $(sel); if (document.activeElement !== el) el.value = v; };
  set('#pNumber', p.number);
  set('#pKey', p.key);
  set('#pTags', p.tags.map(t => '#' + t).join(' '));
  if ($('#pText').value !== p.text) $('#pText').value = p.text;
  set('#pNotes', p.notes);
  $('#pType').value = p.type;
  $('#pFixed').checked = p.fixed;
  const isStart = S.book.settings.start === p.id;
  const bs = $('#btnStart');
  bs.textContent = isStart ? '▶ inizio' : 'imposta come inizio';
  bs.classList.toggle('on', isStart);
  bs.disabled = isStart;
  $('#navBack').disabled = S.histPos <= 0;
  $('#navFwd').disabled = S.histPos >= S.history.length - 1;
  renderLinks();
}

function renderLinks() {
  const p = current();
  if (!p) return;
  const { byKey, inc } = M.index(S.book);
  const out = extractLinks(p.text);
  $('#outLinks').innerHTML = out.length ? out.map(k => {
    const t = byKey.get(k);
    return t
      ? `<li data-id="${t.id}" title="Apri"><span class="n">${t.number}</span>${escapeHtml(k)}</li>`
      : `<li class="broken" title="Il paragrafo non esiste"><span class="n">?</span>${escapeHtml(k)}<button data-create="${escapeHtml(k)}">Crea</button></li>`;
  }).join('') : '<li class="none">Nessuna uscita</li>';
  const ins = inc.get(p.id) || [];
  $('#inLinks').innerHTML = ins.length
    ? M.sorted({ paragraphs: ins }).map(q => `<li data-id="${q.id}" title="Apri"><span class="n">${q.number}</span>${escapeHtml(q.key)}</li>`).join('')
    : `<li class="none">${p.id === S.book.settings.start ? 'È il paragrafo iniziale' : 'Nessun paragrafo porta qui'}</li>`;
  const w = M.countWords(p.text);
  $('#wordCount').textContent = `${w} ${w === 1 ? 'parola' : 'parole'}`;
}

function addParagraph({ key, open = true } = {}) {
  const p = M.addParagraph(S.book, { key: key || 'paragrafo' });
  touch({ structure: true });
  if (open) {
    openParagraph(p.id, { focus: false });
    if (!key) { $('#pKey').focus(); $('#pKey').select(); } else $('#pText').focus();
  }
  return p;
}

async function deleteCurrent() {
  const p = current();
  if (!p) return;
  const { inc } = M.index(S.book);
  const n = inc.get(p.id).length;
  const msg = `Eliminare il paragrafo ${p.number} “${p.key}”?` + (n ? `\n\n${n} ${n === 1 ? 'paragrafo contiene un link' : 'paragrafi contengono link'} a questo paragrafo: diventeranno link spezzati.` : '');
  if (!(await P.confirmDialog(msg))) return;
  snapshot(`eliminazione di “${p.key}”`);
  const list = M.sorted(S.book);
  const idx = list.findIndex(q => q.id === p.id);
  M.deleteParagraph(S.book, p);
  S.history = S.history.filter(id => id !== p.id);
  S.histPos = Math.min(S.histPos, S.history.length - 1);
  const next = list[idx + 1] || list[idx - 1];
  S.currentId = next && next.id !== p.id ? next.id : null;
  touch({ structure: true });
  toast('Paragrafo eliminato. Puoi annullare con ↶');
}

function commitKey() {
  const p = current();
  const el = $('#pKey');
  const wanted = el.value.trim();
  if (!p || !wanted || M.slugify(wanted) === p.key) { el.value = p?.key || ''; return; }
  snapshot(`rinomina di “${p.key}”`);
  const old = p.key;
  const k = M.renameParagraph(S.book, p, wanted);
  el.value = k;
  touch({ structure: true });
  toast(`“${old}” ora si chiama “${k}”: link aggiornati`);
}

function commitNumber() {
  const p = current();
  const el = $('#pNumber');
  const n = parseInt(el.value, 10);
  if (!p || !n || n === p.number) { el.value = p?.number ?? ''; return; }
  const other = S.book.paragraphs.find(q => q.number === n && q.id !== p.id);
  snapshot('cambio di numero');
  M.setNumber(S.book, p, n);
  touch({ structure: true });
  if (other) toast(`Scambiato con “${other.key}”, che ora è il ${other.number}`);
}

function createMissing(key) {
  const before = S.currentId;
  const p = M.addParagraph(S.book, { key });
  if (p.key !== M.slugify(key)) { /* non dovrebbe succedere: chiave già libera */ }
  touch({ structure: true });
  toast(`Creato il paragrafo ${p.number} “${p.key}”`);
  return { p, before };
}

// ---------- formattazione e autocompletamento link ----------
function wrapSelection(mark) {
  const ta = $('#pText');
  const { selectionStart: a, selectionEnd: b, value: v } = ta;
  const sel = v.slice(a, b);
  ta.focus();
  ta.setSelectionRange(a, b);
  if (sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= mark.length * 2) {
    document.execCommand('insertText', false, sel.slice(mark.length, sel.length - mark.length));
  } else {
    if (!document.execCommand('insertText', false, mark + sel + mark)) {
      ta.setRangeText(mark + sel + mark, a, b, 'end');
      ta.dispatchEvent(new Event('input'));
    }
    if (!sel) ta.setSelectionRange(a + mark.length, a + mark.length);
  }
}

function insertAtCursor(text) {
  const ta = $('#pText');
  ta.focus();
  if (!document.execCommand('insertText', false, text)) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  }
}

const AC = { open: false, items: [], sel: 0, from: 0 };

function linkQueryAtCaret() {
  const ta = $('#pText');
  if (ta.selectionStart !== ta.selectionEnd) return null;
  const before = ta.value.slice(0, ta.selectionStart);
  const m = before.match(/\[\[([^\]|\n]{0,60})$/);
  return m ? { q: m[1], from: ta.selectionStart - m[1].length } : null;
}

function updateAutocomplete() {
  const lq = linkQueryAtCaret();
  if (!lq) return hideAutocomplete();
  const q = lq.q.trim().toLowerCase();
  const cur = current();
  let items = M.sorted(S.book).filter(p => p.id !== cur?.id || q).map(p => ({ p }));
  if (q) {
    items = items.filter(({ p }) => p.key.includes(M.slugify(q)) || p.key.includes(q) || String(p.number).startsWith(q))
      .sort((a, b) => (b.p.key.startsWith(M.slugify(q)) - a.p.key.startsWith(M.slugify(q))) || a.p.number - b.p.number);
  }
  items = items.slice(0, 30);
  if (q && !/^\d+$/.test(q) && !S.book.paragraphs.some(p => p.key === M.slugify(q))) items.push({ create: M.slugify(q) });
  AC.items = items; AC.from = lq.from; AC.sel = 0; AC.open = items.length > 0;
  if (!AC.open) return hideAutocomplete();
  const box = $('#ac');
  box.innerHTML = items.map((it, i) => it.create
    ? `<div data-i="${i}" class="create">+ Crea “${escapeHtml(it.create)}”</div>`
    : `<div data-i="${i}"><span class="n">${it.p.number}</span><span>${escapeHtml(it.p.key)}</span></div>`).join('');
  highlightAc();
  const pos = caretCoords($('#pText'));
  const wrap = $('.text-wrap').getBoundingClientRect();
  box.hidden = false;
  const top = Math.min(pos.top + pos.height + 4, wrap.height - box.offsetHeight - 4);
  box.style.top = Math.max(4, top) + 'px';
  box.style.left = Math.min(pos.left, wrap.width - box.offsetWidth - 8) + 'px';
}

function highlightAc() {
  $$('#ac div').forEach((d, i) => d.classList.toggle('sel', i === AC.sel));
  $(`#ac div[data-i="${AC.sel}"]`)?.scrollIntoView({ block: 'nearest' });
}

function hideAutocomplete() { AC.open = false; $('#ac').hidden = true; }

function chooseAc(i) {
  const it = AC.items[i];
  if (!it) return;
  const ta = $('#pText');
  let key;
  if (it.create) {
    key = createMissing(it.create).p.key;
  } else key = it.p.key;
  // Sostituisce "[[parziale" con "[[chiave]]", consumando un eventuale "]]" già presente
  const end = ta.selectionStart;
  const rest = ta.value.slice(end);
  const closing = rest.startsWith(']]') ? 2 : 0;
  ta.focus();
  ta.setSelectionRange(AC.from, end + closing);
  insertAtCursor(`${key}]]`);
  hideAutocomplete();
}

/** Coordinate del cursore dentro la textarea (tecnica del div specchio). */
function caretCoords(ta) {
  const div = document.createElement('div');
  const cs = getComputedStyle(ta);
  for (const prop of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'tabSize', 'wordSpacing']) div.style[prop] = cs[prop];
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px' });
  div.textContent = ta.value.slice(0, ta.selectionStart);
  const span = document.createElement('span');
  span.textContent = ta.value.slice(ta.selectionStart) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const r = { top: span.offsetTop - ta.scrollTop, left: span.offsetLeft - ta.scrollLeft, height: parseFloat(cs.lineHeight) || 24 };
  div.remove();
  return r;
}

// ------------------------------------------------------------------ viste
function setView(v) {
  S.view = v;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  hideAutocomplete();
  renderView();
}

function renderView() {
  if (S.view === 'map') renderMapView();
  else if (S.view === 'play') renderPlay();
  else if (S.view === 'check') renderCheck();
  else if (S.view === 'book') renderBookSettings();
}

// ---------- mappa ----------
async function renderMapView() {
  const legend = $('#mapColor').value === 'tag'
    ? M.allTags(S.book).map(t => `<span><i style="background:${M.tagColor(S.book, t)};border-color:${M.tagColor(S.book, t)}"></i>#${escapeHtml(t)}</span>`).join('') || '<span>Nessun hashtag: aggiungine ai paragrafi per raggrupparli per zona</span>'
    : `<span><i style="border-color:#2a7f62;border-width:3px"></i>inizio</span>
       <span><i style="background:#f2dc8c;border-color:#b8901f"></i>vittoria</span>
       <span><i style="background:#e9b4ad;border-color:#a33"></i>sconfitta</span>
       <span><i style="border-style:double;border-width:4px"></i>fisso</span>
       <span><i style="border-style:dashed"></i>vuoto</span>
       <span><i style="border-color:#c0392b;border-style:dashed"></i>link spezzato</span>
       <span><i style="outline:2px solid #d28a2a;outline-offset:1px"></i>senza entrate</span>`;
  $('#mapLegend').innerHTML = legend;
  if (!S.map.stale && S.map.cy) { S.map.cy.resize(); return; }
  const { renderMap } = await import('./map.js');
  S.map.cy?.destroy();
  S.map.cy = renderMap($('#cy'), S.book, {
    colorBy: $('#mapColor').value,
    direction: $('#mapDir').value,
    focusId: S.currentId,
    onOpen: p => { setView('write'); openParagraph(p.id); },
    onCreate: key => { const { p } = createMissing(key); setView('write'); openParagraph(p.id); },
  });
  S.map.stale = false;
}

// ---------- gioca ----------
function renderPlay() {
  if (S.play.pos < 0 || !byId(S.play.path[S.play.pos])) {
    const start = byId(S.book.settings.start) || M.sorted(S.book)[0];
    S.play = { path: start ? [start.id] : [], pos: start ? 0 : -1 };
  }
  const p = byId(S.play.path[S.play.pos]);
  if (!p) { $('#playText').innerHTML = '<p class="muted">Il libro è vuoto.</p>'; return; }
  const { byKey } = M.index(S.book);
  const numberOf = k => byKey.get(k)?.number ?? null;
  const html = toHtml(parse(p.text), {
    numberOf, linkFormat: S.book.settings.linkFormat,
    href: k => byKey.has(k) ? '#' : null,
    linkAttrs: k => ` data-go="${byKey.get(k).id}"`,
  });
  const isStart = p.id === S.book.settings.start && S.play.pos === 0;
  const intro = isStart && S.book.intro.trim()
    ? `<div class="intro">${toHtml(parse(S.book.intro), { numberOf, linkFormat: S.book.settings.linkFormat, href: k => byKey.has(k) ? '#' : null, linkAttrs: k => ` data-go="${byKey.get(k).id}"` })}</div><hr/>` : '';
  const exits = extractLinks(p.text).length;
  const end = p.type === 'vittoria' ? '★ Finale: vittoria' : p.type === 'morte' ? '✝ Finale: sconfitta' : exits === 0 ? 'Nessuna uscita da questo paragrafo' : '';
  $('#playText').innerHTML = `${intro}<h2>${p.number}</h2>${html || '<p class="muted">(paragrafo vuoto)</p>'}${end ? `<div class="end">${end}</div>` : ''}`;
  $('#playPath').innerHTML = S.play.path.slice(0, S.play.pos + 1).map((id, i) => {
    const q = byId(id);
    return q ? `<li data-i="${i}" class="${i === S.play.pos ? 'cur' : ''}">${q.number} <span class="muted">${escapeHtml(q.key)}</span></li>` : '';
  }).join('');
  $('#playBack').disabled = S.play.pos <= 0;
}

function playGo(id) {
  S.play.path = S.play.path.slice(0, S.play.pos + 1);
  S.play.path.push(id);
  S.play.pos++;
  renderPlay();
  $('#view-play').scrollTop = 0;
}

async function savePlayPath() {
  const lines = S.play.path.slice(0, S.play.pos + 1).map((id, i) => {
    const q = byId(id);
    return q ? `${String(i + 1).padStart(3)}. §${q.number}  ${q.key}` : '';
  });
  const text = `Percorso in “${S.book.title}” — ${new Date().toLocaleString('it-IT')}\n\n${lines.join('\n')}\n`;
  const r = await P.saveExport(text, { name: `${fileBase(S.book)}_percorso.txt`, ext: 'txt', label: 'Testo', mime: 'text/plain' });
  if (r) toast('Percorso salvato');
}

// ---------- controlli ----------
function renderCheck() {
  updateShuffleForm();
  S.issues = M.validate(S.book);
  const st = M.stats(S.book);
  $('#checkStats').innerHTML = [
    [st.paragraphs, 'paragrafi'], [st.words.toLocaleString('it-IT'), 'parole'],
    [st.victories, 'finali di vittoria'], [st.deaths, 'finali di sconfitta'],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  const order = { error: 0, warn: 1, info: 2 };
  const label = { error: 'Errore', warn: 'Attenzione', info: 'Nota' };
  const list = [...S.issues].sort((a, b) => order[a.level] - order[b.level]);
  $('#issueList').innerHTML = list.length ? list.map((i, n) => `<li class="${i.level}">
      <span class="lvl">${label[i.level]}</span><span class="msg">${escapeHtml(i.msg)}</span>
      ${i.kind === 'broken' ? `<button data-create="${escapeHtml(i.key)}">Crea “${escapeHtml(i.key)}”</button>` : ''}
      ${i.p ? `<button data-open="${i.p.id}">Apri</button>` : ''}
      ${i.kind === 'gaps' || i.kind === 'dupnum' ? `<button data-compact="1">Sistema</button>` : ''}
    </li>`).join('') : '<li class="ok">Nessun problema trovato. Ogni strada porta da qualche parte.</li>';
  const todos = M.sorted(S.book).filter(p => p.notes.trim());
  $('#btnTodoExport').disabled = !todos.length;
  $('#todoList').innerHTML = todos.length ? todos.map(p => `<li class="todo">
      <span class="lvl">§${p.number}</span><span class="msg"><b>${escapeHtml(p.key)}</b> · ${escapeHtml(p.notes.trim())}</span>
      <button data-open="${p.id}">Apri</button></li>`).join('')
    : '<li class="muted-row">Nessun promemoria. Li scrivi nel riquadro “Promemoria” accanto al testo di un paragrafo.</li>';
}

async function exportTodos() {
  const todos = M.sorted(S.book).filter(p => p.notes.trim());
  const text = `Promemoria · ${S.book.title}\n\n` + todos.map(p => `§${p.number} ${p.key}\n${p.notes.trim()}\n`).join('\n');
  const r = await P.saveExport(text, { name: `${fileBase(S.book)}_promemoria.txt`, ext: 'txt', label: 'Testo', mime: 'text/plain' });
  if (r) toast('Promemoria salvati');
}

const SHUFFLE_HELP = {
  all: 'Tutti i paragrafi ricevono un numero nuovo.',
  within: 'Solo i paragrafi del primo gruppo si scambiano i numeri tra loro: il resto del libro non cambia.',
  between: 'I paragrafi dei due gruppi si scambiano i numeri tra loro: il resto del libro non cambia.',
  spread: 'Ogni paragrafo del primo gruppo prende il numero di un paragrafo a caso del resto del libro, che prende il suo.',
};

function selectionInfo(inputSel, countSel) {
  const text = $(inputSel).value.trim();
  if (!text) { $(countSel).textContent = 'Scrivi numeri, intervalli, #hashtag o nomi di paragrafi.'; $(countSel).className = 'sel-count'; return null; }
  const { ids, unknown } = M.parseSelection(S.book, text);
  const locked = S.book.paragraphs.filter(p => ids.has(p.id) && (p.fixed || p.id === S.book.settings.start)).length;
  let msg = `${ids.size} ${ids.size === 1 ? 'paragrafo' : 'paragrafi'}`;
  if (locked) msg += ` (${locked} ${locked === 1 ? 'fisso resta fermo' : 'fissi restano fermi'})`;
  if (unknown.length) msg += ` · non trovati: ${unknown.join(', ')}`;
  $(countSel).textContent = msg;
  $(countSel).className = 'sel-count' + (unknown.length ? ' warn' : '');
  return ids;
}

function updateShuffleForm() {
  const mode = $('#shMode').value;
  $('#shGroupA').hidden = mode === 'all';
  $('#shGroupB').hidden = mode !== 'between';
  $('#shHelp').textContent = SHUFFLE_HELP[mode];
  if (mode !== 'all') selectionInfo('#shA', '#shACount');
  if (mode === 'between') selectionInfo('#shB', '#shBCount');
  updateSwapInfo();
}

function selectionFromList() {
  const list = M.sorted(S.book).filter(matchesFilter).map(p => p.number);
  if (!list.length) return '';
  // Comprime i numeri consecutivi in intervalli: 3,4,5,9 → "3-5, 9"
  const out = [];
  let a = list[0], b = list[0];
  for (const n of list.slice(1).concat([null])) {
    if (n === b + 1) { b = n; continue; }
    out.push(a === b ? `${a}` : `${a}-${b}`);
    a = b = n;
  }
  return out.join(', ');
}

async function doShuffle() {
  const mode = $('#shMode').value;
  let a = null, b = null;
  if (mode !== 'all') {
    a = selectionInfo('#shA', '#shACount');
    if (!a || a.size === 0) { toast('Indica i paragrafi del primo gruppo', true); $('#shA').focus(); return; }
  }
  if (mode === 'between') {
    b = selectionInfo('#shB', '#shBCount');
    if (!b || b.size === 0) { toast('Indica i paragrafi del secondo gruppo', true); $('#shB').focus(); return; }
    const both = [...a].filter(id => b.has(id)).length;
    if (both) { toast(`${both} paragrafi sono in entrambi i gruppi: toglili da uno dei due`, true); return; }
  }
  const label = { all: 'tutto il libro', within: 'il primo gruppo tra sé', between: 'i due gruppi tra loro', spread: 'il primo gruppo nel resto del libro' }[mode];
  if (!(await P.confirmDialog(`Rimescolare ${label}?\n\nI paragrafi fissi e quello iniziale mantengono il loro numero. Puoi annullare con ↶.`))) return;
  snapshot('rimescolamento');
  const { score, moved } = M.shuffle(S.book, { mode, a, b });
  touch({ structure: true });
  if (!moved) { S.undo.pop(); $('#btnUndo').disabled = S.undo.length === 0; toast('Nessun paragrafo da spostare: sono tutti fissi?', true); return; }
  toast(`${moved} paragrafi rinumerati` + (score === 0 ? ' · nessun link fra numeri vicini' : ` · restano ${score} link fra numeri vicini`));
  updateShuffleForm();
}

function swapPair() {
  const x = parseInt($('#swX').value, 10), y = parseInt($('#swY').value, 10);
  const px = S.book.paragraphs.find(p => p.number === x), py = S.book.paragraphs.find(p => p.number === y);
  return { x, y, px, py };
}

function updateSwapInfo() {
  const { x, y, px, py } = swapPair();
  const name = (n, p) => !n ? '' : p ? `§${n} “${p.key}”${p.fixed || p.id === S.book.settings.start ? ' ⚓' : ''}` : `§${n} non esiste`;
  $('#swInfo').textContent = [name(x, px), name(y, py)].filter(Boolean).join(' ⇄ ');
  $('#btnSwap').disabled = !(px && py && px !== py);
}

function doSwap() {
  const { px, py } = swapPair();
  if (!px || !py || px === py) return;
  snapshot(`scambio di ${px.number} e ${py.number}`);
  M.setNumber(S.book, px, py.number);
  touch({ structure: true });
  toast(`Scambiati: “${px.key}” ora è il ${px.number}, “${py.key}” il ${py.number}` + (px.fixed || py.fixed ? ' (anche se fisso)' : ''));
  $('#swX').value = ''; $('#swY').value = '';
  updateSwapInfo();
}

function doCompact() {
  snapshot('compattazione della numerazione');
  M.compact(S.book);
  touch({ structure: true });
  toast('Numerazione compattata');
}

// ---------- libro ----------
function renderBookSettings() {
  const b = S.book;
  const set = (sel, v) => { const el = $(sel); if (document.activeElement !== el) el.value = v; };
  set('#bTitle', b.title);
  set('#bAuthor', b.author);
  set('#bIntro', b.intro);
  set('#bLinkFmt', b.settings.linkFormat);
  set('#bDist', b.settings.minDistance ?? 2);
  $('#bPage').value = b.settings.pageSize;
  $('#bFont').value = b.settings.pdfFont || 'serif';
  $('#bStart').innerHTML = M.sorted(b).map(p => `<option value="${p.id}">${p.number} · ${escapeHtml(p.key)}</option>`).join('');
  $('#bStart').value = b.settings.start;
  const tags = M.allTags(b);
  $('#tagColors').innerHTML = tags.length
    ? tags.map(t => `<label><input type="color" data-tagcolor="${escapeHtml(t)}" value="${M.tagColor(b, t)}"/>#${escapeHtml(t)}</label>`).join('')
    : '<span class="muted">Nessun hashtag nel libro.</span>';
}

// ------------------------------------------------------------------ file
async function newBookCmd() {
  if (S.dirty && !(await P.confirmDialog('Ci sono modifiche non salvate. Creare comunque un nuovo libro?'))) return;
  setBook(M.newBook(), null);
  saveBackup();
  setView('write');
  toast('Nuovo libro: un piccolo esempio da cui partire');
}

async function openCmd() {
  if (S.dirty && !(await P.confirmDialog('Ci sono modifiche non salvate. Aprire comunque un altro libro?'))) return;
  try {
    const f = await P.openBookFile();
    if (!f) return;
    setBook(M.loadBook(f.text), f.path || f.name);
    saveBackup();
    toast(`Aperto “${S.book.title}”`);
  } catch (e) {
    toast(e.message || 'Impossibile aprire il file', true);
  }
}

/** Crea un paragrafo nuovo con il primo numero libero e inserisce il link al cursore, restando nel paragrafo attuale. */
function linkToNewParagraph() {
  const cur = current();
  if (!cur) return;
  const p = M.addParagraph(S.book, { key: `p${M.nextNumber(S.book)}` });
  S.currentId = cur.id;
  insertAtCursor(`[[${p.key}]]`);
  touch({ structure: true });
  toast(`Creato il paragrafo ${p.number} “${p.key}”: lo trovi nelle uscite a destra`);
}

// ---------- importazione da testo ----------
async function importCmd() {
  if (S.dirty && !(await P.confirmDialog("Ci sono modifiche non salvate. L'importazione apre un libro nuovo: continuare?"))) return;
  let f;
  try { f = await P.openTextFileBytes(); } catch (e) { toast('Impossibile leggere il file: ' + (e.message || e), true); return; }
  if (!f) return;
  const { importText, decodeText, DEFAULT_KEYWORDS } = await import('./import/text.js');
  const text = decodeText(f.bytes);
  const title = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Libro importato';
  let keywords = DEFAULT_KEYWORDS;
  try { keywords = localStorage.getItem('bivio:parole-rimando') || DEFAULT_KEYWORDS; } catch { /* nessun ricordo */ }

  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="impTitle">
    <h2 id="impTitle">Importa da testo</h2>
    <p class="muted">${escapeHtml(f.name)}</p>
    <div id="impStats" class="imp-stats"></div>
    <label for="impKeywords">Espressioni che introducono un rimando <small>(una per riga; il numero che segue diventa un link)</small></label>
    <textarea id="impKeywords" rows="7" spellcheck="false"></textarea>
    <div class="imp-preview"><span class="muted">Anteprima del primo paragrafo</span><pre id="impPreview"></pre></div>
    <div class="modal-btns"><button data-v="reset" class="ghost">Espressioni predefinite</button><span class="grow"></span><button data-v="0">Annulla</button><button class="primary" data-v="1">Importa</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const kw = wrap.querySelector('#impKeywords');
  kw.value = keywords;
  let result = null;
  const run = () => {
    try {
      result = importText(text, { keywords: kw.value, title });
      const s = result.stats;
      wrap.querySelector('#impStats').innerHTML = `<b>${s.paragraphs}</b> paragrafi · <b>${s.links}</b> rimandi riconosciuti` +
        (s.missing.length ? `<br><span class="warn">Rimandi a paragrafi che nel file non ci sono: ${s.missing.slice(0, 15).join(', ')}${s.missing.length > 15 ? '…' : ''}</span>` : '') +
        (s.duplicates.length ? `<br><span class="warn">Numeri doppi (rinumerati in fondo, con un promemoria): ${s.duplicates.join(', ')}</span>` : '');
      const first = [...result.book.paragraphs].sort((a, b) => a.number - b.number)[0];
      wrap.querySelector('#impPreview').textContent = first ? `${first.number}\n${first.text.slice(0, 600)}` : '';
      wrap.querySelector('.primary').disabled = false;
    } catch (e) {
      result = null;
      wrap.querySelector('#impStats').innerHTML = `<span class="warn">${escapeHtml(e.message)}</span>`;
      wrap.querySelector('#impPreview').textContent = '';
      wrap.querySelector('.primary').disabled = true;
    }
  };
  let t = null;
  kw.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); });
  run();
  const choice = await new Promise(resolve => {
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      if (b.dataset.v === 'reset') { kw.value = DEFAULT_KEYWORDS; run(); return; }
      resolve(b.dataset.v === '1');
    });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') resolve(false); });
  });
  wrap.remove();
  if (!choice || !result) return;
  try { localStorage.setItem('bivio:parole-rimando', kw.value); } catch { /* facoltativo */ }
  setBook(result.book, null, { dirty: true });
  saveBackup();
  setView('check');
  toast(`Importati ${result.stats.paragraphs} paragrafi: controlla i problemi e poi salva`);
}

async function saveCmd(saveAs = false) {
  try {
    const path = await P.saveBookFile(M.serialize(S.book), {
      path: P.isDesktop && !saveAs ? S.path : null,
      suggestedName: `${fileBase(S.book)}.bivio`,
    });
    if (!path) return;
    S.path = path;
    S.dirty = false;
    updateTitle();
    saveBackup();
    toast(P.isDesktop ? 'Salvato' : 'File scaricato');
  } catch (e) {
    toast('Salvataggio non riuscito: ' + (e.message || e), true);
  }
}

async function exportCmd(kind) {
  $('#exportMenu').hidden = true;
  const base = fileBase(S.book);
  const errors = S.issues.filter(i => i.kind === 'broken').length;
  if (errors && kind !== 'png' && !(await P.confirmDialog(`Ci sono ${errors} link a paragrafi inesistenti: nel libro esportato appariranno come “??”. Esportare comunque?`))) return;
  try {
    let r;
    if (kind === 'html') {
      const { exportHtml } = await import('./export/html.js');
      r = await P.saveExport(exportHtml(S.book), { name: `${base}.html`, ext: 'html', label: 'Pagina web', mime: 'text/html' });
    } else if (kind === 'txt') {
      const { exportText } = await import('./export/text.js');
      r = await P.saveExport(exportText(S.book), { name: `${base}.txt`, ext: 'txt', label: 'Testo', mime: 'text/plain' });
    } else if (kind === 'docx' || kind === 'docx-print') {
      toast('Preparo il file Word…');
      const { exportDocx } = await import('./export/docx.js');
      const print = kind === 'docx-print';
      r = await P.saveExport(await exportDocx(S.book, { print }), { name: `${base}${print ? '_stampa' : ''}.docx`, ext: 'docx', label: 'Documento Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    } else if (kind === 'pdf' || kind === 'pdf-print') {
      toast('Preparo il PDF…');
      const { exportPdf } = await import('./export/pdf.js');
      const print = kind === 'pdf-print';
      r = await P.saveExport(await exportPdf(S.book, { print }), { name: `${base}${print ? '_stampa' : ''}.pdf`, ext: 'pdf', label: 'PDF', mime: 'application/pdf' });
    } else if (kind === 'epub') {
      const { exportEpub } = await import('./export/epub.js');
      r = await P.saveExport(await exportEpub(S.book), { name: `${base}.epub`, ext: 'epub', label: 'ePub', mime: 'application/epub+zip' });
    } else if (kind === 'site') {
      const { exportSite } = await import('./export/site.js');
      r = await P.saveExport(await exportSite(S.book), { name: `${base}_sito.zip`, ext: 'zip', label: 'Archivio ZIP', mime: 'application/zip' });
    } else if (kind === 'png') {
      if (S.view !== 'map') setView('map');
      await renderMapView();
      const { mapPng } = await import('./map.js');
      r = await P.saveExport(await mapPng(S.map.cy), { name: `${base}_mappa.png`, ext: 'png', label: 'Immagine PNG', mime: 'image/png' });
    }
    if (r) toast(`Esportato: ${P.basename(r)}`);
  } catch (e) {
    console.error(e);
    toast('Esportazione non riuscita: ' + (e.message || e), true);
  }
}

// ------------------------------------------------------------------ avvisi
let toastTimer = null;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, error ? 5000 : 2600);
}

// ------------------------------------------------------------------ eventi
function bindEvents() {
  // barra superiore
  $$('.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btnNew').onclick = newBookCmd;
  $('#btnOpen').onclick = openCmd;
  $('#btnImport').onclick = importCmd;
  $('#btnTodoExport').onclick = exportTodos;
  $('#todoList').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) { setView('write'); openParagraph(b.dataset.open); } });
  $('#btnSave').onclick = () => saveCmd(false);
  $('#btnUndo').onclick = undo;
  $('#btnExport').onclick = e => { e.stopPropagation(); $('#exportMenu').hidden = !$('#exportMenu').hidden; };
  $('#exportMenu').addEventListener('click', e => { const b = e.target.closest('[data-export]'); if (b) exportCmd(b.dataset.export); });
  document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) $('#exportMenu').hidden = true; });
  $('#bookTitle').addEventListener('input', e => { S.book.title = e.target.value; touch(); });

  // elenco
  $('#parList').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) openParagraph(li.dataset.id, { focus: false }); });
  $('#search').addEventListener('input', e => { S.filter.q = e.target.value.trim(); renderSidebar(); });
  $('#search').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const li = $('#parList li[data-id]');
      if (li) {
        openParagraph(li.dataset.id);
        const q = S.filter.q.toLowerCase(), ta = $('#pText');
        const i = q ? ta.value.toLowerCase().indexOf(q) : -1;
        if (i >= 0 && !/^\d+$/.test(q)) ta.setSelectionRange(i, i + q.length);
      }
    } else if (e.key === 'Escape') { e.target.value = ''; S.filter.q = ''; renderSidebar(); }
  });
  $('#tagFilter').addEventListener('click', e => {
    const c = e.target.closest('.tag-chip');
    if (!c) return;
    if (c.dataset.problems) S.filter.problems = !S.filter.problems;
    else { const t = c.dataset.tag; S.filter.tags.has(t) ? S.filter.tags.delete(t) : S.filter.tags.add(t); }
    renderSidebar();
  });
  $('#btnAdd').onclick = () => addParagraph();

  // editor
  const ta = $('#pText');
  ta.addEventListener('input', () => { const p = current(); if (!p) return; p.text = ta.value; touch(); updateAutocomplete(); });
  ta.addEventListener('click', updateAutocomplete);
  ta.addEventListener('blur', () => setTimeout(hideAutocomplete, 150));
  ta.addEventListener('scroll', () => { if (AC.open) updateAutocomplete(); });
  ta.addEventListener('keydown', e => {
    if (AC.open) {
      if (e.key === 'ArrowDown') { AC.sel = (AC.sel + 1) % AC.items.length; highlightAc(); e.preventDefault(); return; }
      if (e.key === 'ArrowUp') { AC.sel = (AC.sel - 1 + AC.items.length) % AC.items.length; highlightAc(); e.preventDefault(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { chooseAc(AC.sel); e.preventDefault(); return; }
      if (e.key === 'Escape') { hideAutocomplete(); e.preventDefault(); return; }
    }
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { wrapSelection('**'); e.preventDefault(); }
      else if (k === 'i') { wrapSelection('*'); e.preventDefault(); }
      else if (k === 'k') { startLink(); e.preventDefault(); }
    }
    if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { linkToNewParagraph(); e.preventDefault(); }
  });
  ta.addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateAutocomplete(); });
  $('#ac').addEventListener('mousedown', e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); chooseAc(+d.dataset.i); } });

  $$('.ed-toolbar [data-fmt]').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  $$('.ed-toolbar [data-fmt]').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.fmt;
    if (f === 'bold') wrapSelection('**'); else if (f === 'italic') wrapSelection('*'); else if (f === 'newlink') linkToNewParagraph(); else startLink();
  }));

  $('#pKey').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitKey(); $('#pText').focus(); } if (e.key === 'Escape') { $('#pKey').value = current()?.key || ''; $('#pText').focus(); } });
  $('#pKey').addEventListener('blur', commitKey);
  $('#pNumber').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitNumber(); } });
  $('#pNumber').addEventListener('change', commitNumber);
  $('#pType').addEventListener('change', e => { current().type = e.target.value; touch({ structure: true }); });
  $('#pFixed').addEventListener('change', e => { current().fixed = e.target.checked; touch({ structure: true }); });
  $('#btnStart').onclick = () => { S.book.settings.start = S.currentId; touch({ structure: true }); };
  $('#btnDelete').onclick = deleteCurrent;
  $('#pTags').addEventListener('change', e => { const p = current(); p.tags = M.parseTags(e.target.value); e.target.value = p.tags.map(t => '#' + t).join(' '); touch({ structure: true }); });
  $('#pTags').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  $('#pNotes').addEventListener('input', e => { current().notes = e.target.value; touch(); });
  $('#navBack').onclick = () => navHistory(-1);
  $('#navFwd').onclick = () => navHistory(1);

  const linkClick = e => {
    const c = e.target.closest('[data-create]');
    if (c) { e.stopPropagation(); const { p } = createMissing(c.dataset.create); openParagraph(p.id); return; }
    const li = e.target.closest('li[data-id]');
    if (li) openParagraph(li.dataset.id, { focus: false });
  };
  $('#outLinks').addEventListener('click', linkClick);
  $('#inLinks').addEventListener('click', linkClick);

  // mappa
  $('#mapColor').onchange = () => { S.map.stale = true; renderMapView(); };
  $('#mapDir').onchange = () => { S.map.stale = true; renderMapView(); };
  $('#mapFit').onclick = () => S.map.cy?.fit(undefined, 30);
  $('#mapPng').onclick = () => exportCmd('png');

  // gioca
  $('#playText').addEventListener('click', e => { const a = e.target.closest('a[data-go]'); if (a) { e.preventDefault(); playGo(a.dataset.go); } });
  $('#playRestart').onclick = () => { S.play = { path: [], pos: -1 }; renderPlay(); };
  $('#playBack').onclick = () => { if (S.play.pos > 0) { S.play.pos--; renderPlay(); } };
  $('#playHere').onclick = () => { if (S.currentId) { S.play = { path: [S.currentId], pos: 0 }; renderPlay(); } };
  $('#playEdit').onclick = () => { const id = S.play.path[S.play.pos]; setView('write'); if (id) openParagraph(id); };
  $('#playPath').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) { S.play.pos = +li.dataset.i; renderPlay(); } });
  $('#playSave').onclick = savePlayPath;

  // controlli
  $('#btnShuffle').onclick = doShuffle;
  $('#shMode').addEventListener('change', updateShuffleForm);
  $('#shA').addEventListener('input', () => selectionInfo('#shA', '#shACount'));
  $('#shB').addEventListener('input', () => selectionInfo('#shB', '#shBCount'));
  $('#shAFromList').onclick = () => { $('#shA').value = selectionFromList(); selectionInfo('#shA', '#shACount'); };
  $('#shBFromList').onclick = () => { $('#shB').value = selectionFromList(); selectionInfo('#shB', '#shBCount'); };
  $('#swX').addEventListener('input', updateSwapInfo);
  $('#swY').addEventListener('input', updateSwapInfo);
  $('#swY').addEventListener('keydown', e => { if (e.key === 'Enter') doSwap(); });
  $('#btnSwap').onclick = doSwap;
  $('#btnCompact').onclick = doCompact;
  $('#issueList').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) { setView('write'); openParagraph(b.dataset.open); }
    else if (b.dataset.create) { const { p } = createMissing(b.dataset.create); setView('write'); openParagraph(p.id); }
    else if (b.dataset.compact) { doCompact(); renderCheck(); }
  });

  // libro
  $('#bTitle').addEventListener('input', e => { S.book.title = e.target.value; touch(); });
  $('#bAuthor').addEventListener('input', e => { S.book.author = e.target.value; touch(); });
  $('#bIntro').addEventListener('input', e => { S.book.intro = e.target.value; touch(); });
  $('#bDist').addEventListener('change', e => { const v = Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)); S.book.settings.minDistance = v; e.target.value = v; touch(); });
  $('#bLinkFmt').addEventListener('input', e => { S.book.settings.linkFormat = e.target.value.includes('{n}') ? e.target.value : '{n}'; touch(); });
  $('#bPage').addEventListener('change', e => { S.book.settings.pageSize = e.target.value; touch(); });
  $('#bFont').addEventListener('change', e => { S.book.settings.pdfFont = e.target.value; touch(); });
  $('#bStart').addEventListener('change', e => { S.book.settings.start = e.target.value; touch({ structure: true }); });
  $('#tagColors').addEventListener('input', e => { const t = e.target.dataset.tagcolor; if (t) { S.book.tagColors[t] = e.target.value; touch(); renderSidebar(); } });

  // scorciatoie globali
  document.addEventListener('keydown', e => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); saveCmd(e.shiftKey); }
    else if (mod && k === 'o') { e.preventDefault(); openCmd(); }
    else if (mod && e.shiftKey && k === 'n') { e.preventDefault(); setView('write'); addParagraph(); }
    else if (mod && (k === 'f' || k === 'g')) { e.preventDefault(); $('#search').focus(); $('#search').select(); }
    else if (mod && !e.shiftKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); setView(['write', 'map', 'play', 'check', 'book'][+e.key - 1]); }
    else if (e.altKey && e.key === 'ArrowLeft' && S.view === 'write') { e.preventDefault(); navHistory(-1); }
    else if (e.altKey && e.key === 'ArrowRight' && S.view === 'write') { e.preventDefault(); navHistory(1); }
    else if (mod && k === 'z' && !e.shiftKey && !isTextField(document.activeElement) && S.undo.length) { e.preventDefault(); undo(); }
  });
}

const isTextField = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'color', 'radio', 'button'].includes(el.type)));

function startLink() {
  const ta = $('#pText');
  const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  insertAtCursor('[[' + M.slugify(sel).replace(/^paragrafo$/, '') + (sel ? '' : ''));
  updateAutocomplete();
}

function navHistory(d) {
  const pos = S.histPos + d;
  if (pos < 0 || pos >= S.history.length) return;
  S.histPos = pos;
  openParagraph(S.history[pos], { focus: false, pushHistory: false });
}

init();
