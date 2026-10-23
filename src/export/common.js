import { parse } from '../markup.js';
import { sorted, index } from '../model.js';

/** Dati comuni a tutte le esportazioni. */
export function prepare(book) {
  const { byKey } = index(book);
  const numberOf = key => byKey.get(key)?.number ?? null;
  const exists = key => byKey.has(key);
  return {
    title: book.title || 'Librogame',
    author: book.author || '',
    linkFormat: book.settings.linkFormat || '{n}',
    pageSize: book.settings.pageSize || 'A5',
    intro: parse(book.intro),
    paragraphs: sorted(book).map(p => ({ number: p.number, key: p.key, blocks: parse(p.text) })),
    numberOf,
    exists,
  };
}

export function fileBase(book) {
  return (book.title || 'librogame').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'librogame';
}
