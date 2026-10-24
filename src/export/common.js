import { parse } from '../markup.js';
import { sorted, index } from '../model.js';

/**
 * Sostituisce le parole chiave @nome con il loro valore (attributi di gioco, scheda Libro).
 * Es. con { name: 'eroe', value: 'Lupo Solitario' }: "@eroe entra" → "Lupo Solitario entra".
 */
export function applyVariables(text, variables) {
  if (!text || !variables || !variables.length) return text || '';
  const map = new Map(variables.filter(v => v.name).map(v => [v.name.toLowerCase(), v.value ?? '']));
  if (!map.size) return text;
  return text.replace(/(^|[^\p{L}\p{N}_@])@([\p{L}\p{N}_]+)/gu, (all, pre, name) =>
    map.has(name.toLowerCase()) ? pre + map.get(name.toLowerCase()) : all);
}

/** Dati comuni a tutte le esportazioni. I paragrafi segnati come “non esportare” sono esclusi. */
export function prepare(book) {
  const { byKey } = index(book);
  const numberOf = key => byKey.get(key)?.number ?? null;
  const exists = key => byKey.has(key) && byKey.get(key).exportable !== false;
  const vars = book.variables || [];
  const section = s => ({ title: s.title || '', blocks: parse(applyVariables(s.text, vars)) });
  const sections = (book.sections || []).filter(s => s.text.trim() || s.title.trim());
  return {
    title: book.title || 'Librogame',
    author: book.author || '',
    version: book.bookVersion || '',
    linkFormat: book.settings.linkFormat || '{n}',
    pageSize: book.settings.pageSize || 'A5',
    before: sections.filter(s => s.place !== 'after').map(section),
    after: sections.filter(s => s.place === 'after').map(section),
    paragraphs: sorted(book).filter(p => p.exportable !== false)
      .map(p => ({ number: p.number, key: p.key, blocks: parse(applyVariables(p.text, vars)) })),
    numberOf,
    exists,
  };
}

export function fileBase(book) {
  return (book.title || 'librogame').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'librogame';
}
