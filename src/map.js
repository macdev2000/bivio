import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { index, tagColor } from './model.js';

cytoscape.use(dagre);

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Disegna la mappa del libro dentro `container`.
 * options: { colorBy: 'type'|'tag', direction: 'TB'|'LR', onOpen(paragraph), onCreate(key) }
 */
export function renderMap(container, book, options) {
  const { byKey, out, inc } = index(book);
  const start = book.settings.start;
  const elements = [];
  const missing = new Set();

  for (const p of book.paragraphs) {
    const classes = [p.type];
    if (p.id === start) classes.push('start');
    if (p.fixed) classes.push('fixed');
    if (!p.text.trim()) classes.push('empty');
    if (p.id !== start && inc.get(p.id).length === 0) classes.push('orphan');
    const tag = p.tags[0];
    elements.push({
      data: {
        id: p.id, label: `${p.number}\n${p.key}`,
        tagColor: tag ? tagColor(book, tag) : cssVar('--map-node'),
      },
      classes: classes.join(' '),
    });
  }
  for (const p of book.paragraphs) {
    for (const k of out.get(p.id)) {
      const t = byKey.get(k);
      let target = t?.id;
      if (!t) {
        target = 'missing:' + k;
        if (!missing.has(k)) {
          missing.add(k);
          elements.push({ data: { id: target, label: `?\n${k}`, missingKey: k }, classes: 'missing' });
        }
      }
      elements.push({ data: { id: `${p.id}->${target}`, source: p.id, target }, classes: t ? '' : 'broken' });
    }
  }

  const ink = cssVar('--ink'), paper = cssVar('--paper'), accent = cssVar('--accent');
  const nodeFill = cssVar('--map-node'), muted = cssVar('--muted');

  const cy = cytoscape({
    container,
    elements,
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 3,
    style: [
      { selector: 'node', style: {
        'shape': 'round-rectangle', 'width': 'label', 'height': 'label', 'padding': '8px',
        'label': 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center',
        'font-size': 11, 'font-family': 'system-ui, sans-serif', 'color': ink,
        'background-color': options.colorBy === 'tag' ? 'data(tagColor)' : nodeFill,
        'background-opacity': options.colorBy === 'tag' ? 0.28 : 1,
        'border-width': 1.5, 'border-color': muted,
      } },
      { selector: 'node.vittoria', style: { 'border-color': '#b8901f', 'border-width': 3 } },
      { selector: 'node.vittoria', style: options.colorBy === 'tag' ? {} : { 'background-color': '#f2dc8c', 'color': '#2b2410' } },
      { selector: 'node.morte', style: { 'border-color': '#a33', 'border-width': 3 } },
      { selector: 'node.morte', style: options.colorBy === 'tag' ? {} : { 'background-color': '#e9b4ad', 'color': '#2b1210' } },
      { selector: 'node.start', style: { 'border-color': '#2a7f62', 'border-width': 4 } },
      { selector: 'node.fixed', style: { 'border-style': 'double', 'border-width': 5 } },
      { selector: 'node.empty', style: { 'border-style': 'dashed', 'background-opacity': 0.35 } },
      { selector: 'node.orphan', style: { 'outline-width': 2, 'outline-color': '#d28a2a', 'outline-offset': 3 } },
      { selector: 'node.missing', style: { 'background-color': paper, 'border-color': '#c0392b', 'border-style': 'dashed', 'border-width': 2, 'color': '#c0392b' } },
      { selector: 'node:selected', style: { 'overlay-color': accent, 'overlay-opacity': 0.18, 'overlay-padding': 6 } },
      { selector: 'edge', style: {
        'width': 1.4, 'line-color': muted, 'target-arrow-color': muted, 'target-arrow-shape': 'triangle',
        'curve-style': 'bezier', 'arrow-scale': 0.9, 'opacity': 0.8,
      } },
      { selector: 'edge.broken', style: { 'line-color': '#c0392b', 'target-arrow-color': '#c0392b', 'line-style': 'dashed' } },
      { selector: '.dim', style: { 'opacity': 0.12 } },
      { selector: 'edge.hl', style: { 'line-color': accent, 'target-arrow-color': accent, 'width': 2.5, 'opacity': 1 } },
    ],
    layout: { name: 'dagre', rankDir: options.direction || 'TB', nodeSep: 18, rankSep: 46, edgeSep: 8, animate: false },
  });

  // Evidenzia vicini al passaggio del mouse
  cy.on('mouseover', 'node', e => {
    const n = e.target;
    const nb = n.closedNeighborhood();
    cy.elements().not(nb).addClass('dim');
    n.connectedEdges().addClass('hl');
  });
  cy.on('mouseout', 'node', () => { cy.elements().removeClass('dim hl'); });
  cy.on('dbltap', 'node', e => {
    const d = e.target.data();
    if (d.missingKey) options.onCreate?.(d.missingKey);
    else options.onOpen?.(book.paragraphs.find(p => p.id === d.id));
  });

  // Con pochi paragrafi l'adattamento automatico ingrandisce troppo
  if (cy.zoom() > 1.1) { cy.zoom(1.1); cy.center(); }
  if (options.focusId) {
    const n = cy.getElementById(options.focusId);
    if (n.nonempty()) { n.select(); if (cy.zoom() < 0.6) { cy.zoom(0.9); cy.center(n); } }
  }
  return cy;
}

/** Immagine PNG della mappa intera (Blob). */
export function mapPng(cy) {
  return cy.png({ output: 'blob', full: true, scale: 2, bg: cssVar('--paper') || '#ffffff' });
}
