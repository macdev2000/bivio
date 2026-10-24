import { Document, Packer, Paragraph, TextRun, Bookmark, InternalHyperlink, AlignmentType, PageBreak } from 'docx';
import { linkText } from '../markup.js';
import { prepare } from './common.js';

const FONT = 'Georgia';
const LINK_COLOR = '8A3B12';
const PAGE_SIZES = { A4: { width: 11906, height: 16838 }, A5: { width: 8391, height: 11906 }, Letter: { width: 12240, height: 15840 } };

function runsFor(runs, d, print) {
  const out = [];
  for (const r of runs) {
    if (r.br) { out.push(new TextRun({ break: 1 })); continue; }
    if (r.link) {
      const t = linkText(r, d.numberOf, d.linkFormat);
      if (print) { out.push(new TextRun({ text: t, bold: true, italics: r.italic })); continue; }
      const style = { text: t, bold: true, italics: r.italic, font: FONT, color: LINK_COLOR };
      out.push(d.exists(r.link)
        ? new InternalHyperlink({ anchor: `p${d.numberOf(r.link)}`, children: [new TextRun(style)] })
        : new TextRun({ ...style, color: 'BB0000' }));
      continue;
    }
    out.push(new TextRun({ text: r.text, bold: r.bold, italics: r.italic, ...(print ? {} : { font: FONT }) }));
  }
  return out;
}

function blocksToParagraphs(blocks, d, print) {
  return blocks.map(runs => print
    ? new Paragraph({ style: 'TestoLibrogame', children: runsFor(runs, d, true) })
    : new Paragraph({ children: runsFor(runs, d), spacing: { after: 140, line: 300 }, alignment: AlignmentType.JUSTIFIED }));
}

// Stili con nome: chi impagina può cambiare carattere e spaziature di tutto il libro in un colpo solo.
const PRINT_STYLES = {
  default: { document: { run: { font: FONT, size: 22, color: '000000' } } },
  paragraphStyles: [
    { id: 'TestoLibrogame', name: 'Testo librogame', basedOn: 'Normal', quickFormat: true,
      paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { after: 140, line: 300 } } },
    { id: 'NumeroParagrafo', name: 'Numero paragrafo', basedOn: 'Normal', next: 'TestoLibrogame', quickFormat: true,
      run: { bold: true, size: 30 },
      paragraph: { alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: 360, after: 160 } } },
    { id: 'TitoloLibro', name: 'Titolo libro', basedOn: 'Normal', run: { bold: true, size: 48 },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 300 } } },
    { id: 'TitoloSezione', name: 'Titolo sezione', basedOn: 'Normal', next: 'TestoLibrogame', run: { bold: true, size: 34 },
      paragraph: { alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 240 } } },
    { id: 'AutoreLibro', name: 'Autore libro', basedOn: 'Normal', run: { italics: true, size: 28 },
      paragraph: { alignment: AlignmentType.CENTER } },
  ],
};

/**
 * Restituisce un Blob .docx.
 * Con { print: true } produce la versione per la stampa: niente link né colori,
 * i rimandi sono numeri neri in grassetto e il testo usa stili con nome.
 */
export async function exportDocx(book, { print = false } = {}) {
  const d = prepare(book);
  if (print) return exportPrintDocx(d);
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 300 },
      children: [new TextRun({ text: d.title, bold: true, size: 48, font: FONT })] }),
  ];
  if (d.author) children.push(new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: d.author, italics: true, size: 28, font: FONT })] }));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  const screenSection = s => {
    if (s.title) children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 240 },
      children: [new TextRun({ text: s.title, bold: true, size: 34, font: FONT })] }));
    children.push(...blocksToParagraphs(s.blocks, d));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  };
  d.before.forEach(screenSection);
  for (const p of d.paragraphs) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 360, after: 160 },
      children: [new Bookmark({ id: `p${p.number}`, children: [new TextRun({ text: String(p.number), bold: true, size: 30, font: FONT })] })],
    }));
    children.push(...blocksToParagraphs(p.blocks, d));
  }
  if (d.after.length) children.push(new Paragraph({ children: [new PageBreak()] }));
  d.after.forEach(screenSection);
  const doc = new Document({
    creator: d.author || 'Bivio', title: d.title,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: { page: { size: PAGE_SIZES[d.pageSize] || PAGE_SIZES.A5, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

async function exportPrintDocx(d) {
  const children = [new Paragraph({ style: 'TitoloLibro', children: [new TextRun(d.title)] })];
  if (d.author) children.push(new Paragraph({ style: 'AutoreLibro', children: [new TextRun(d.author)] }));
  children.push(new Paragraph({ children: [new PageBreak()] }));
  const printSection = s => {
    if (s.title) children.push(new Paragraph({ style: 'TitoloSezione', children: [new TextRun(s.title)] }));
    children.push(...blocksToParagraphs(s.blocks, d, true));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  };
  d.before.forEach(printSection);
  for (const p of d.paragraphs) {
    children.push(new Paragraph({ style: 'NumeroParagrafo', children: [new TextRun(String(p.number))] }));
    children.push(...blocksToParagraphs(p.blocks, d, true));
  }
  if (d.after.length) children.push(new Paragraph({ children: [new PageBreak()] }));
  d.after.forEach(printSection);
  const doc = new Document({
    creator: d.author || 'Bivio', title: d.title,
    styles: PRINT_STYLES,
    sections: [{
      properties: { page: { size: PAGE_SIZES[d.pageSize] || PAGE_SIZES.A5, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
