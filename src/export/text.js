import { toPlain } from '../markup.js';
import { prepare } from './common.js';

export function exportText(book) {
  const d = prepare(book);
  const parts = [d.title.toUpperCase()];
  if (d.author) parts.push(d.author);
  const sec = s => parts.push((s.title ? s.title.toUpperCase() + '\n\n' : '') + toPlain(s.blocks, d.numberOf, d.linkFormat));
  d.before.forEach(sec);
  for (const p of d.paragraphs) parts.push(`${p.number}\n\n${toPlain(p.blocks, d.numberOf, d.linkFormat)}`);
  d.after.forEach(sec);
  return parts.join('\n\n\n') + '\n';
}
