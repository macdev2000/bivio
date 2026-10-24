import JSZip from 'jszip';
import { toHtml, escapeHtml } from '../markup.js';
import { prepare } from './common.js';

const CHUNK = 40; // paragrafi per file XHTML

const CSS = `body{font-family:serif;line-height:1.5;margin:0 .5em}
h1{text-align:center;margin-top:30%}
.author{text-align:center;font-style:italic}
h2{text-align:center;font-size:1.2em;margin:1.6em 0 .5em}
p{margin:0 0 .6em;text-indent:0}
a{font-weight:bold}
.broken{color:#b00;font-weight:bold}
.cover{text-align:center;margin:0;padding:0}
.cover img{max-width:100%;max-height:100%}`;

const xhtml = (title, body) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="it" lang="it">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;

/**
 * Restituisce un Blob .epub (EPUB 3, con toc.ncx per i lettori più vecchi).
 * cover (facoltativa): { bytes: Uint8Array, type: 'image/jpeg' | 'image/png' }
 */
export async function exportEpub(book, { cover = null } = {}) {
  const d = prepare(book);
  const id = 'urn:uuid:' + (book.uuid || crypto.randomUUID());
  const fileOf = new Map();
  const chunks = [];
  d.paragraphs.forEach((p, i) => {
    const c = Math.floor(i / CHUNK);
    (chunks[c] ||= []).push(p);
    fileOf.set(p.number, `par${String(c + 1).padStart(3, '0')}.xhtml`);
  });
  const opts = {
    numberOf: d.numberOf, linkFormat: d.linkFormat,
    href: k => d.exists(k) ? `${fileOf.get(d.numberOf(k))}#p${d.numberOf(k)}` : null,
  };

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  const O = zip.folder('OEBPS');
  O.file('style.css', CSS);

  const items = [];
  const spine = [];
  const add = (idRef, href, content, props = '') => {
    O.file(href, content);
    items.push(`<item id="${idRef}" href="${href}" media-type="application/xhtml+xml"${props ? ` properties="${props}"` : ''}/>`);
    spine.push(`<itemref idref="${idRef}"/>`);
  };

  if (cover) {
    const ext = cover.type === 'image/png' ? 'png' : 'jpg';
    O.file(`cover.${ext}`, cover.bytes);
    items.push(`<item id="cover-image" href="cover.${ext}" media-type="${cover.type}" properties="cover-image"/>`);
    add('cover', 'cover.xhtml', xhtml(d.title, `<div class="cover"><img src="cover.${ext}" alt="${escapeHtml(d.title)}"/></div>`));
  }
  add('title', 'title.xhtml', xhtml(d.title,
    `<h1>${escapeHtml(d.title)}</h1>${d.author ? `<p class="author">${escapeHtml(d.author)}</p>` : ''}`));
  const secBody = sct => `${sct.title ? `<h2>${escapeHtml(sct.title)}</h2>` : ''}${toHtml(sct.blocks, opts)}`;
  d.before.forEach((sct, i) => add(`before${i + 1}`, `prima${i + 1}.xhtml`, xhtml(sct.title || d.title, secBody(sct))));
  chunks.forEach((list, c) => {
    const href = `par${String(c + 1).padStart(3, '0')}.xhtml`;
    const body = list.map(p => `<section id="p${p.number}">\n<h2>${p.number}</h2>\n${toHtml(p.blocks, opts)}\n</section>`).join('\n');
    add(`c${c + 1}`, href, xhtml(`${list[0].number}–${list[list.length - 1].number}`, body));
  });
  d.after.forEach((sct, i) => add(`after${i + 1}`, `dopo${i + 1}.xhtml`, xhtml(sct.title || d.title, secBody(sct))));

  // Indice: inizio e gruppi di paragrafi
  const navEntries = [['title.xhtml', d.title]];
  d.before.forEach((sct, i) => navEntries.push([`prima${i + 1}.xhtml`, sct.title || `Sezione ${i + 1}`]));
  chunks.forEach((list, c) => navEntries.push([`par${String(c + 1).padStart(3, '0')}.xhtml`, `Paragrafi ${list[0].number}–${list[list.length - 1].number}`]));
  d.after.forEach((sct, i) => navEntries.push([`dopo${i + 1}.xhtml`, sct.title || `Sezione finale ${i + 1}`]));
  O.file('nav.xhtml', xhtml('Indice', `<nav epub:type="toc" id="toc"><h1>Indice</h1><ol>
${navEntries.map(([h, t]) => `<li><a href="${h}">${escapeHtml(t)}</a></li>`).join('\n')}
</ol></nav>`));
  O.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${id}"/></head>
<docTitle><text>${escapeHtml(d.title)}</text></docTitle>
<navMap>
${navEntries.map(([h, t], i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeHtml(t)}</text></navLabel><content src="${h}"/></navPoint>`).join('\n')}
</navMap></ncx>`);

  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  O.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="it">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${escapeHtml(d.title)}</dc:title>
${d.author ? `<dc:creator>${escapeHtml(d.author)}</dc:creator>` : ''}
<dc:language>it</dc:language>
${cover ? '<meta name="cover" content="cover-image"/>' : ''}
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${items.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>`);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}
