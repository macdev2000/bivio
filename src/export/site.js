import JSZip from 'jszip';
import { toHtml, escapeHtml } from '../markup.js';
import { prepare } from './common.js';

const CSS = `body{font-family:Georgia,'Iowan Old Style',serif;max-width:38em;margin:2em auto;padding:0 1em;line-height:1.6;color:#222;background:#fffdf8}
h1{text-align:center}
h2{text-align:center;font-size:1.6em;margin:.4em 0 .8em}
a{color:#8a3b12;font-weight:bold;text-decoration:none}
a:hover{text-decoration:underline}
.broken{color:#b00;font-weight:bold}
nav{margin-top:3em;font-size:.85em;text-align:center;color:#777}
nav a{font-weight:normal;margin:0 .6em}
@media (prefers-color-scheme:dark){body{background:#1d1b18;color:#e8e2d6}a{color:#e9a06f}}`;

const page = (title, body, root = '') => `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><link rel="stylesheet" href="${root}stile.css"></head>
<body>
${body}
</body></html>`;

/** Sito con una pagina per paragrafo, impacchettato in un .zip (Blob). Si apre da index.html. */
export async function exportSite(book) {
  const d = prepare(book);
  const opts = { numberOf: d.numberOf, linkFormat: d.linkFormat, href: k => d.exists(k) ? `${d.numberOf(k)}.html` : null };
  const zip = new JSZip();
  zip.file('stile.css', CSS);
  const startNum = book.paragraphs.find(p => p.id === book.settings.start)?.number ?? d.paragraphs[0]?.number;
  const nav = `<nav><a href="index.html">Inizio</a></nav>`;
  zip.file('index.html', page(d.title, `<h1>${escapeHtml(d.title)}</h1>
${d.author ? `<p style="text-align:center"><em>${escapeHtml(d.author)}</em></p>` : ''}
${d.intro.length ? toHtml(d.intro, opts) : ''}
${startNum != null ? `<p style="text-align:center;margin-top:2em"><a href="${startNum}.html">Comincia l'avventura</a></p>` : ''}`));
  for (const p of d.paragraphs) {
    zip.file(`${p.number}.html`, page(`${p.number} · ${d.title}`, `<h2>${p.number}</h2>\n${toHtml(p.blocks, opts)}\n${nav}`));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
}
