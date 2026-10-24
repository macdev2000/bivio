// Markup minimale dei paragrafi.
//   **grassetto**   *corsivo*   [[chiave]]   [[chiave|testo del link]]
// Una riga vuota separa i capoversi; un a capo singolo diventa un'interruzione di riga.

const LINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

/** Restituisce le chiavi citate nel testo, in ordine e senza duplicati. */
export function extractLinks(text) {
  const out = [];
  const seen = new Set();
  for (const m of (text || '').matchAll(new RegExp(LINK_RE.source, 'g'))) {
    const key = m[1].trim();
    if (key && !seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

/** Sostituisce i link a `oldKey` con `newKey` (usato quando si rinomina un paragrafo). */
export function renameLinks(text, oldKey, newKey) {
  return (text || '').replace(new RegExp(LINK_RE.source, 'g'), (all, key, label) => {
    if (key.trim() !== oldKey) return all;
    return label !== undefined ? `[[${newKey}|${label}]]` : `[[${newKey}]]`;
  });
}

/**
 * Converte il testo in blocchi di frammenti:
 *   [[ {text, bold, italic, link?, label?, br?}, ... ], ...]
 * Ogni blocco è un capoverso.
 */
export function parse(text) {
  const src = (text || '').replace(/\r\n?/g, '\n').trim();
  if (!src) return [];
  return src.split(/\n\s*\n/).map(block => parseInline(block));
}

function parseInline(block) {
  const runs = [];
  let bold = false, italic = false;
  let buf = '';
  const flush = () => { if (buf) { runs.push({ text: buf, bold, italic }); buf = ''; } };
  let i = 0;
  while (i < block.length) {
    const c = block[i];
    if (c === '\\' && i + 1 < block.length && '*[\\'.includes(block[i + 1])) {
      buf += block[i + 1]; i += 2; continue;
    }
    if (c === '[' && block[i + 1] === '[') {
      // Copia locale: non si deve toccare lo stato (lastIndex) dell'espressione condivisa
      const re = new RegExp(LINK_RE.source, 'g');
      re.lastIndex = i;
      const m = re.exec(block);
      if (m && m.index === i) {
        flush();
        runs.push({ text: '', bold, italic, link: m[1].trim(), label: m[2] !== undefined ? m[2] : null });
        i += m[0].length; continue;
      }
    }
    if (c === '*' && block[i + 1] === '*') { flush(); bold = !bold; i += 2; continue; }
    if (c === '*') { flush(); italic = !italic; i += 1; continue; }
    if (c === '\n') { flush(); runs.push({ text: '', br: true }); i += 1; continue; }
    buf += c; i += 1;
  }
  flush();
  return runs;
}

/** Testo del link come apparirà nel libro. */
export function linkText(run, numberOf, linkFormat) {
  const n = numberOf(run.link);
  const num = n == null ? '??' : String(n);
  // Nell'etichetta si può usare {n}: [[bosco|vai al {n}]] → "vai al 37"
  if (run.label) return run.label.replaceAll('{n}', num);
  return (linkFormat || '{n}').replaceAll('{n}', num);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * HTML dei blocchi. `href(key)` restituisce l'href del link oppure null
 * (link spezzato). `attrs(key)` può aggiungere attributi.
 */
export function toHtml(blocks, { numberOf, linkFormat, href, linkAttrs = () => '' }) {
  return blocks.map(runs => '<p>' + runs.map(r => {
    if (r.br) return '<br/>';
    let inner;
    if (r.link) {
      const t = escapeHtml(linkText(r, numberOf, linkFormat));
      const h = href(r.link);
      inner = h ? `<a href="${escapeHtml(h)}"${linkAttrs(r.link)}>${t}</a>` : `<span class="broken">${t}</span>`;
    } else inner = escapeHtml(r.text);
    if (r.italic) inner = `<em>${inner}</em>`;
    if (r.bold) inner = `<strong>${inner}</strong>`;
    return inner;
  }).join('') + '</p>').join('\n');
}

/** Testo semplice, con i link risolti in numeri. */
export function toPlain(blocks, numberOf, linkFormat) {
  return blocks.map(runs => runs.map(r => r.br ? '\n' : r.link ? linkText(r, numberOf, linkFormat) : r.text).join('')).join('\n\n');
}
