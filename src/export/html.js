import { toHtml, escapeHtml } from '../markup.js';
import { prepare } from './common.js';

const CSS = `
body{font-family:Georgia,'Iowan Old Style',serif;max-width:38em;margin:2em auto;padding:0 1em;line-height:1.55;color:#222;background:#fffdf8}
h1{text-align:center;font-size:2em;margin-bottom:.2em}
.author{text-align:center;font-style:italic;margin-top:0}
.intro{margin:2em 0 3em}
.intro h2{text-align:center;font-size:1.35em}
section.par{margin:0 0 2.2em}
section.par h2{text-align:center;font-size:1.25em;margin:0 0 .6em;letter-spacing:.05em}
a{color:#8a3b12;font-weight:bold;text-decoration:none}
a:hover{text-decoration:underline}
.broken{color:#b00;font-weight:bold}
section.par:target h2{background:#f3e7cf;border-radius:4px}
@media (prefers-color-scheme:dark){body{background:#1d1b18;color:#e8e2d6}a{color:#e9a06f}section.par:target h2{background:#3a3226}}
`;

export function exportHtml(book) {
  const d = prepare(book);
  const opts = { numberOf: d.numberOf, linkFormat: d.linkFormat, href: k => d.exists(k) ? `#p${d.numberOf(k)}` : null };
  const body = d.paragraphs.map(p =>
    `<section class="par" id="p${p.number}">\n<h2>${p.number}</h2>\n${toHtml(p.blocks, opts)}\n</section>`).join('\n');
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(d.title)}</title><style>${CSS}</style></head>
<body>
<h1>${escapeHtml(d.title)}</h1>
${d.author ? `<p class="author">${escapeHtml(d.author)}</p>` : ''}
${d.before.map(s => `<div class="intro">${s.title ? `<h2>${escapeHtml(s.title)}</h2>` : ''}${toHtml(s.blocks, opts)}</div>`).join('\n')}
${body}
${d.after.map(s => `<div class="intro">${s.title ? `<h2>${escapeHtml(s.title)}</h2>` : ''}${toHtml(s.blocks, opts)}</div>`).join('\n')}
</body></html>`;
}
