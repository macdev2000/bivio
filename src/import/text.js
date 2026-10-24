import { makeParagraph, FORMAT, FORMAT_VERSION, ensureTagColors } from '../model.js';

// Espressioni che introducono un rimando, una per riga. Si possono cambiare al momento dell'importazione.
export const DEFAULT_KEYWORDS = [
  'vai al', 'vai subito al', 'vai a', 'passa al', 'leggi il', 'torna al', 'prosegui al', 'procedi al',
  'continua al', 'gira al', 'recati al', 'paragrafo',
  'turn to', 'turn back to', 'go to',
  've al', 'pasa al', 'ir al',
].join('\n');

/** Decodifica i byte di un file di testo: UTF-8 se valido, altrimenti Windows-1252 (vecchi file di Windows). */
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(u8);
  }
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Converte un testo nel formato
 *     1.
 *     Testo del primo paragrafo… vai al 37.
 *     2
 *     Testo del secondo…
 * in un libro di Bivio. Il testo prima del primo numero diventa l'introduzione.
 * Restituisce { book, stats: { paragraphs, links, missing: [numeri citati ma assenti] } }.
 */
export function importText(text, { keywords = DEFAULT_KEYWORDS, title = 'Libro importato' } = {}) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const header = /^\s*(\d{1,5})\s*\.?\s*$/;
  const intro = [];
  const raw = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(header);
    if (m) { cur = { number: +m[1], lines: [] }; raw.push(cur); continue; }
    (cur ? cur.lines : intro).push(line);
  }
  if (!raw.length) throw new Error('Nel file non ho trovato paragrafi: ogni paragrafo deve iniziare con il suo numero da solo su una riga (es. “1” oppure “1.”).');

  // Numeri doppi: si tiene il primo, gli altri ricevono un numero libero in fondo
  const seen = new Set();
  let maxN = raw.reduce((m, r) => Math.max(m, r.number), 0);
  const duplicates = [];
  for (const r of raw) {
    if (seen.has(r.number)) { duplicates.push(r.number); r.number = ++maxN; r.duplicate = true; }
    seen.add(r.number);
  }

  const keyOf = n => `p${n}`;
  const words = keywords.split('\n').map(s => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const exists = new Set(raw.filter(r => !r.duplicate).map(r => r.number));
  let links = 0;
  const missing = new Set();
  const linkify = s => {
    if (!words.length) return s;
    const re = new RegExp(`(^|[^\\p{L}])(${words.map(w => esc(w).replace(/\s+/g, '\\s+')).join('|')})(\\s+(?:il\\s+|al\\s+|paragrafo\\s+|§\\s*)?)(\\d{1,5})(?!\\d)`, 'giu');
    return s.replace(re, (all, pre, kw, mid, num) => {
      links++;
      if (!exists.has(+num)) missing.add(+num);
      return `${pre}${kw}${mid}[[${keyOf(+num)}]]`;
    });
  };
  const clean = ls => ls.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // Le righe a capo dentro un capoverso (testo copiato da PDF) vengono unite
  // (si uniscono solo le righe lunghe che non finiscono con un segno di fine frase: i titoli brevi restano su una riga a sé)
  const reflow = s => s.split(/\n\s*\n/).map(b => {
    const ls = b.split('\n');
    let out = ls[0] || '';
    for (let i = 1; i < ls.length; i++) {
      const prev = ls[i - 1].trimEnd();
      out += (prev.length >= 50 && !/[.!?:;»”"]$/.test(prev)) ? ' ' + ls[i].trimStart() : '\n' + ls[i];
    }
    return out;
  }).join('\n\n');

  const paragraphs = raw.map(r => makeParagraph({
    key: keyOf(r.number),
    number: r.number,
    text: linkify(reflow(clean(r.lines))),
    notes: r.duplicate ? 'Nel file importato questo numero era doppio: controlla i rimandi.' : '',
  }));
  const first = paragraphs.reduce((a, b) => (b.number < a.number ? b : a));
  const book = {
    format: FORMAT, version: FORMAT_VERSION,
    uuid: globalThis.crypto?.randomUUID?.() || String(Date.now()),
    title, author: '',
    intro: linkify(reflow(clean(intro))),
    settings: { start: first.id, linkFormat: '{n}', pageSize: 'A5', pdfFont: 'serif', minDistance: 2 },
    tagColors: {},
    paragraphs,
  };
  ensureTagColors(book);
  return { book, stats: { paragraphs: paragraphs.length, links, missing: [...missing].sort((a, b) => a - b), duplicates } };
}
