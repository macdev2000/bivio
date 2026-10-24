import { linkText } from '../markup.js';
import { prepare } from './common.js';

import crimsonRegular from '../fonts/CrimsonText-Regular.ttf?url';
import crimsonBold from '../fonts/CrimsonText-Bold.ttf?url';
import crimsonItalic from '../fonts/CrimsonText-Italic.ttf?url';
import crimsonBoldItalic from '../fonts/CrimsonText-BoldItalic.ttf?url';

let pm = null, hasRoboto = false, hasSerif = false;

async function base64Of(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function getPdfMake(font) {
  pm ||= (await import('pdfmake/build/pdfmake')).default;
  if (font === 'Roboto' && !hasRoboto) {
    pm.addVirtualFileSystem((await import('pdfmake/build/vfs_fonts')).default);
    hasRoboto = true;
  }
  if (font === 'Crimson' && !hasSerif) {
    const files = { 'CrimsonText-Regular.ttf': crimsonRegular, 'CrimsonText-Bold.ttf': crimsonBold, 'CrimsonText-Italic.ttf': crimsonItalic, 'CrimsonText-BoldItalic.ttf': crimsonBoldItalic };
    const vfs = {};
    await Promise.all(Object.entries(files).map(async ([name, url]) => { vfs[name] = await base64Of(url); }));
    pm.addVirtualFileSystem(vfs);
    pm.addFonts({ Crimson: { normal: 'CrimsonText-Regular.ttf', bold: 'CrimsonText-Bold.ttf', italics: 'CrimsonText-Italic.ttf', bolditalics: 'CrimsonText-BoldItalic.ttf' } });
    hasSerif = true;
  }
  return pm;
}

// Il carattere serif (Crimson Text, incorporato nel PDF) copre gli alfabeti latini.
// Se il libro contiene altro (greco, cirillico, emoji…) si passa a Roboto.
const SERIF_OK = /^[\u0000-\u017f\u0192\u02c6\u02c7\u02d8-\u02dd\u2010-\u2027\u2030-\u203a\u20ac\u2122]*$/;
export function pickFont(book) {
  if (book.settings.pdfFont === 'sans') return 'Roboto';
  const all = [book.title, book.author, ...(book.sections || []).map(s => s.title + s.text), ...(book.variables || []).map(v => v.value), ...book.paragraphs.map(p => p.text)].join('');
  return SERIF_OK.test(all) ? 'Crimson' : 'Roboto';
}

const LINK_COLOR = '#8a3b12';

function inline(runs, d, print) {
  return runs.map(r => {
    if (r.br) return { text: '\n' };
    if (r.link) {
      const t = linkText(r, d.numberOf, d.linkFormat);
      if (print) return { text: t, bold: true, italics: r.italic };
      return d.exists(r.link)
        ? { text: t, bold: true, italics: r.italic, color: LINK_COLOR, linkToDestination: `p${d.numberOf(r.link)}` }
        : { text: t, bold: true, color: '#bb0000' };
    }
    return { text: r.text, bold: r.bold, italics: r.italic };
  });
}

const blocks = (bl, d, print) => bl.map(runs => ({ text: inline(runs, d, print), style: 'body' }));

export function pdfDefinition(book, font = 'Roboto', print = false) {
  const d = prepare(book);
  const content = [
    { text: d.title, style: 'title' },
    d.author ? { text: d.author, style: 'author' } : null,
    { text: '', pageBreak: 'after' },
  ].filter(Boolean);
  const section = s => {
    if (s.title) content.push({ text: s.title, style: 'section' });
    content.push(...blocks(s.blocks, d, print));
    content.push({ text: '', pageBreak: 'after' });
  };
  d.before.forEach(section);
  for (const p of d.paragraphs) {
    content.push({ text: String(p.number), id: `p${p.number}`, style: 'number', headlineLevel: 1 });
    content.push(...blocks(p.blocks, d, print));
  }
  if (d.after.length) content.push({ text: '', pageBreak: 'after' });
  d.after.forEach(section);
  return {
    info: { title: d.title, author: d.author, creator: 'Bivio' },
    pageSize: d.pageSize,
    pageMargins: [48, 52, 48, 56],
    footer: (page, pages) => page > 1 ? { text: `${page}`, alignment: 'center', fontSize: 8, color: '#888', margin: [0, 20, 0, 0] } : null,
    content,
    defaultStyle: { font, fontSize: font === 'Crimson' ? 11.5 : 10.5, lineHeight: font === 'Crimson' ? 1.2 : 1.3 },
    styles: {
      title: { fontSize: 26, bold: true, alignment: 'center', margin: [0, 160, 0, 12] },
      author: { fontSize: 14, italics: true, alignment: 'center' },
      section: { fontSize: 17, bold: true, alignment: 'center', margin: [0, 10, 0, 14] },
      number: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 14, 0, 6] },
      body: { alignment: 'justify', margin: [0, 0, 0, 7] },
    },
    // Evita che il numero di un paragrafo resti da solo in fondo alla pagina
    pageBreakBefore: (node, following) => node.headlineLevel === 1 && following.length === 0,
  };
}

/** Restituisce un Blob PDF */
export async function exportPdf(book, { print = false } = {}) {
  const font = pickFont(book);
  const pdf = await getPdfMake(font);
  return pdf.createPdf(pdfDefinition(book, font, print)).getBlob();
}
