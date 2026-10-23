import { extractLinks, renameLinks } from './markup.js';

export const FORMAT = 'bivio';
export const FORMAT_VERSION = 1;

export const TYPES = {
  normale: 'Normale',
  vittoria: 'Finale (vittoria)',
  morte: 'Finale (sconfitta)',
};

let seq = 0;
const newUuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : uid());
const uid = () => 'p' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

export function newBook() {
  const start = makeParagraph({ key: 'inizio', number: 1, fixed: true,
    text: "La tua avventura comincia qui.\n\nSe vuoi seguire il sentiero nel bosco, vai al [[bosco]].\nSe preferisci la strada per il villaggio, vai al [[villaggio]]." });
  const p2 = makeParagraph({ key: 'bosco', number: 2, tags: ['bosco'],
    text: "Gli alberi si chiudono sopra di te. Un lupo ti sbarra la strada.\n\nSe combatti, vai al [[lupo]]. Se torni indietro, vai al [[inizio]]." });
  const p3 = makeParagraph({ key: 'villaggio', number: 3, type: 'vittoria',
    text: "Raggiungi il villaggio al tramonto. Sei al sicuro.\n\n**FINE**" });
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    uuid: newUuid(),
    title: 'Nuovo librogame',
    author: '',
    intro: "Qui puoi scrivere le regole del gioco e l'antefatto. Il testo compare prima del paragrafo 1.",
    settings: { start: start.id, linkFormat: '{n}', pageSize: 'A5', pdfFont: 'serif' },
    tagColors: { bosco: PALETTE[0] },
    paragraphs: [start, p2, p3],
  };
}

export function makeParagraph(o = {}) {
  return {
    id: uid(),
    key: o.key || 'paragrafo',
    number: o.number ?? 0,
    text: o.text || '',
    notes: o.notes || '',
    tags: o.tags || [],
    type: o.type || 'normale',
    fixed: !!o.fixed,
  };
}

/** Controlla e normalizza un libro letto da file. */
export function loadBook(json) {
  const b = typeof json === 'string' ? JSON.parse(json) : json;
  if (!b || b.format !== FORMAT || !Array.isArray(b.paragraphs)) throw new Error('Il file non è un librogame di Bivio.');
  if (b.version > FORMAT_VERSION) throw new Error('Il file è stato creato con una versione più recente di Bivio.');
  b.settings = Object.assign({ linkFormat: '{n}', pageSize: 'A5', pdfFont: 'serif' }, b.settings || {});
  b.tagColors = b.tagColors || {};
  b.intro = b.intro || '';
  b.uuid = b.uuid || newUuid();
  b.paragraphs = b.paragraphs.map(p => Object.assign(makeParagraph(), p, { tags: p.tags || [] }));
  if (!b.paragraphs.some(p => p.id === b.settings.start)) b.settings.start = b.paragraphs[0]?.id;
  ensureTagColors(b);
  return b;
}

export function serialize(book) {
  return JSON.stringify(book, null, 2);
}

// ---------- chiavi ----------

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'paragrafo';
}

export function uniqueKey(book, base, exceptId = null) {
  const k0 = slugify(base);
  const taken = new Set(book.paragraphs.filter(p => p.id !== exceptId).map(p => p.key));
  if (!taken.has(k0)) return k0;
  let i = 2;
  while (taken.has(`${k0}-${i}`)) i++;
  return `${k0}-${i}`;
}

/** Rinomina un paragrafo aggiornando tutti i link che lo citano. Restituisce la chiave effettiva. */
export function renameParagraph(book, p, wanted) {
  const newKey = uniqueKey(book, wanted, p.id);
  const old = p.key;
  if (newKey === old) return old;
  for (const q of book.paragraphs) q.text = renameLinks(q.text, old, newKey);
  p.key = newKey;
  return newKey;
}

// ---------- indici ----------

export function index(book) {
  const byKey = new Map(book.paragraphs.map(p => [p.key, p]));
  const out = new Map();
  const inc = new Map(book.paragraphs.map(p => [p.id, []]));
  for (const p of book.paragraphs) {
    const keys = extractLinks(p.text);
    out.set(p.id, keys);
    for (const k of keys) {
      const t = byKey.get(k);
      if (t && !inc.get(t.id).includes(p)) inc.get(t.id).push(p);
    }
  }
  return { byKey, out, inc };
}

export function sorted(book) {
  return [...book.paragraphs].sort((a, b) => a.number - b.number || a.key.localeCompare(b.key));
}

export function nextNumber(book) {
  return book.paragraphs.reduce((m, p) => Math.max(m, p.number), 0) + 1;
}

export function addParagraph(book, o = {}) {
  const p = makeParagraph({ ...o, key: uniqueKey(book, o.key || 'paragrafo'), number: nextNumber(book) });
  book.paragraphs.push(p);
  return p;
}

export function deleteParagraph(book, p) {
  book.paragraphs = book.paragraphs.filter(q => q.id !== p.id);
  if (book.settings.start === p.id) book.settings.start = sorted(book)[0]?.id;
}

/** Assegna un numero a un paragrafo; se è già usato, i due paragrafi si scambiano. */
export function setNumber(book, p, n) {
  n = Math.max(1, Math.floor(n));
  const other = book.paragraphs.find(q => q.number === n && q.id !== p.id);
  if (other) other.number = p.number;
  p.number = n;
}

/** Rinumera 1..N mantenendo l'ordine attuale (chiude i buchi). */
export function compact(book) {
  sorted(book).forEach((p, i) => { p.number = i + 1; });
}

/**
 * Rimescola la numerazione. I paragrafi fissi (e quello iniziale) tengono il loro numero.
 * Fra molti tentativi sceglie quello con meno link tra numeri vicini,
 * così il lettore non indovina la strada guardando la pagina accanto.
 */
export function shuffle(book, { attempts = 300, random = Math.random } = {}) {
  compactIfBroken(book);
  const N = book.paragraphs.length;
  const fixed = book.paragraphs.filter(p => p.fixed || p.id === book.settings.start);
  const used = new Set(fixed.map(p => p.number));
  const free = [];
  for (let n = 1; n <= N; n++) if (!used.has(n)) free.push(n);
  const movable = book.paragraphs.filter(p => !fixed.includes(p));
  const { out, byKey } = index(book);

  let best = null, bestScore = Infinity;
  for (let a = 0; a < attempts; a++) {
    const nums = [...free];
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    const assign = new Map(fixed.map(p => [p.id, p.number]));
    movable.forEach((p, i) => assign.set(p.id, nums[i]));
    let score = 0;
    for (const p of book.paragraphs) {
      for (const k of out.get(p.id)) {
        const t = byKey.get(k);
        if (t && t !== p && Math.abs(assign.get(p.id) - assign.get(t.id)) <= 2) score++;
      }
    }
    if (score < bestScore) { best = assign; bestScore = score; }
    if (score === 0) break;
  }
  // Rifinitura: scambia coppie di numeri finché i link vicini diminuiscono
  if (bestScore > 0 && movable.length > 1) {
    const edges = [];
    for (const p of book.paragraphs) for (const k of out.get(p.id)) { const t = byKey.get(k); if (t && t !== p) edges.push([p.id, t.id]); }
    const scoreOf = a => edges.reduce((s, [x, y]) => s + (Math.abs(a.get(x) - a.get(y)) <= 2 ? 1 : 0), 0);
    for (let it = 0; it < 3000 && bestScore > 0; it++) {
      const a = movable[Math.floor(random() * movable.length)].id;
      const b = movable[Math.floor(random() * movable.length)].id;
      if (a === b) continue;
      const na = best.get(a), nb = best.get(b);
      best.set(a, nb); best.set(b, na);
      const s = scoreOf(best);
      if (s < bestScore) bestScore = s;
      else { best.set(a, na); best.set(b, nb); }
    }
  }
  for (const p of book.paragraphs) p.number = best.get(p.id);
  return bestScore;
}

/** Se i fissi hanno numeri fuori intervallo o duplicati, il rimescolamento non può funzionare. */
function compactIfBroken(book) {
  const N = book.paragraphs.length;
  const fixed = book.paragraphs.filter(p => p.fixed || p.id === book.settings.start);
  const nums = fixed.map(p => p.number);
  if (nums.some(n => n < 1 || n > N) || new Set(nums).size !== nums.length) compact(book);
}

// ---------- controlli ----------

/**
 * Elenca i problemi del libro. Ogni voce: {level: 'error'|'warn'|'info', kind, msg, p?, key?}
 */
export function validate(book) {
  const issues = [];
  const { byKey, out, inc } = index(book);
  const start = book.paragraphs.find(p => p.id === book.settings.start);

  for (const p of sorted(book)) {
    for (const k of out.get(p.id)) {
      if (!byKey.has(k)) issues.push({ level: 'error', kind: 'broken', p, key: k, msg: `§${p.number} rimanda a “${k}”, che non esiste.` });
    }
    if (!p.text.trim()) issues.push({ level: 'warn', kind: 'empty', p, msg: `§${p.number} “${p.key}” è vuoto.` });
    else if (out.get(p.id).length === 0 && p.type === 'normale')
      issues.push({ level: 'warn', kind: 'deadend', p, msg: `§${p.number} “${p.key}” non ha uscite e non è segnato come finale.` });
    if (p.type !== 'normale' && out.get(p.id).length > 0)
      issues.push({ level: 'info', kind: 'finalWithLinks', p, msg: `§${p.number} “${p.key}” è un finale ma contiene dei link.` });
    if (p !== start && inc.get(p.id).length === 0)
      issues.push({ level: 'warn', kind: 'orphan', p, msg: `§${p.number} “${p.key}” non è raggiunto da nessun paragrafo.` });
  }

  // Raggiungibilità dall'inizio
  if (start) {
    const seen = new Set([start.id]);
    const queue = [start];
    while (queue.length) {
      const p = queue.shift();
      for (const k of out.get(p.id)) {
        const t = byKey.get(k);
        if (t && !seen.has(t.id)) { seen.add(t.id); queue.push(t); }
      }
    }
    for (const p of sorted(book)) {
      if (!seen.has(p.id) && inc.get(p.id).length > 0)
        issues.push({ level: 'warn', kind: 'unreachable', p, msg: `§${p.number} “${p.key}” ha link in entrata ma non si raggiunge partendo dall'inizio.` });
    }
    const finals = book.paragraphs.filter(p => p.type !== 'normale' && seen.has(p.id));
    if (book.paragraphs.length > 1 && !finals.some(p => p.type === 'vittoria'))
      issues.push({ level: 'info', kind: 'novictory', msg: 'Nessun finale di vittoria raggiungibile dall’inizio.' });
  } else {
    issues.push({ level: 'error', kind: 'nostart', msg: 'Non è indicato il paragrafo iniziale.' });
  }

  // Numerazione
  const counts = new Map();
  for (const p of book.paragraphs) counts.set(p.number, (counts.get(p.number) || 0) + 1);
  for (const [n, c] of counts) if (c > 1) issues.push({ level: 'error', kind: 'dupnum', msg: `Il numero ${n} è usato da ${c} paragrafi.` });
  const N = book.paragraphs.length;
  const missing = [];
  for (let n = 1; n <= N; n++) if (!counts.has(n)) missing.push(n);
  if (missing.length) issues.push({ level: 'warn', kind: 'gaps', msg: `Numerazione con buchi (mancano: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}).` });

  return issues;
}

export function stats(book) {
  const words = book.paragraphs.reduce((s, p) => s + countWords(p.text), 0);
  return {
    paragraphs: book.paragraphs.length,
    words,
    victories: book.paragraphs.filter(p => p.type === 'vittoria').length,
    deaths: book.paragraphs.filter(p => p.type === 'morte').length,
  };
}

export function countWords(text) {
  const t = (text || '').replace(/\[\[[^\]]*\]\]/g, ' 0 ').replace(/[*]/g, '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function allTags(book) {
  const s = new Set();
  for (const p of book.paragraphs) p.tags.forEach(t => s.add(t));
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Legge "#bosco #combattimento, notte" → ['bosco','combattimento','notte'] */
export function parseTags(s) {
  return [...new Set(String(s).split(/[\s,]+/).map(t => t.replace(/^#+/, '').trim().toLowerCase()).filter(Boolean))];
}

const PALETTE = ['#2f8f5b', '#d9822b', '#3a72c4', '#9b4dca', '#c9a227', '#d0435b', '#1fa2a8', '#8a6a45', '#7f9c2c', '#e06bb0'];

/** Dà a ogni hashtag nuovo un colore stabile, scegliendo quello meno usato. */
export function ensureTagColors(book) {
  const used = new Map(PALETTE.map(c => [c, 0]));
  for (const c of Object.values(book.tagColors)) used.set(c, (used.get(c) || 0) + 1);
  let changed = false;
  for (const t of allTags(book)) {
    if (book.tagColors[t]) continue;
    const c = PALETTE.reduce((best, c) => (used.get(c) < used.get(best) ? c : best), PALETTE[0]);
    book.tagColors[t] = c;
    used.set(c, used.get(c) + 1);
    changed = true;
  }
  return changed;
}

export function tagColor(book, tag) {
  return book.tagColors[tag] || PALETTE[0];
}
