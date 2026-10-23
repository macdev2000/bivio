import { toPlain } from '../markup.js';
import { prepare } from './common.js';

export function exportText(book) {
  const d = prepare(book);
  const parts = [d.title.toUpperCase()];
  if (d.author) parts.push(d.author);
  if (d.intro.length) parts.push(toPlain(d.intro, d.numberOf, d.linkFormat));
  for (const p of d.paragraphs) parts.push(`${p.number}\n\n${toPlain(p.blocks, d.numberOf, d.linkFormat)}`);
  return parts.join('\n\n\n') + '\n';
}
