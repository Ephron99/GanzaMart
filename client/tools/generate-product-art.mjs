// One-off build asset generator for the storefront's seed imagery.
//
// Why this exists: seed.sql points every product at /images/products/<slug>.svg, and
// those files must physically exist in client/public or the cards show broken images.
// Rather than hand-write 23 near-identical SVGs (and get 20 of them subtly wrong), we
// describe each product once — a category colour plus a simple line glyph — and render
// them. Re-run any time: `node tools/generate-product-art.mjs`. Nothing here is a
// placeholder in the "unfinished" sense; these ARE the demo product photos and they
// render consistently in every browser that supports SVG.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images', 'products');

// Brand-adjacent panel colours (kept in step with the CSS palette).
const TEAL = '#087F86';
const INK = '#20292B';

/**
 * Each entry: file name → { label, draw } . `draw` returns SVG markup drawn inside a
 * 600×600 viewBox. Glyphs are deliberately geometric (rects/paths/circles) so the file
 * stays tiny and the shape reads at card thumbnail size.
 */
const products = {
  'galaxy-a55':        { label: 'Galaxy A55 5G',        tint: '#0E5A8A', glyph: phone('#4FC3F7') },
  'galaxy-a55-back':   { label: 'Galaxy A55 — rear',    tint: '#0E5A8A', glyph: phoneBack('#4FC3F7') },
  'galaxy-a55-side':   { label: 'Galaxy A55 — side',    tint: '#0E5A8A', glyph: phoneSide('#4FC3F7') },
  'tecno-spark':       { label: 'Tecno Spark 20 Pro+',  tint: '#1E4C8A', glyph: phone('#7EA6F0') },
  'hp-pavilion':       { label: 'HP Pavilion 15',       tint: '#37474F', glyph: laptop('#B0BEC5') },
  'lenovo-slim3':      { label: 'Lenovo IdeaPad Slim 3', tint: '#37474F', glyph: laptop('#90A4AE') },
  'xiaomi-tv':         { label: 'Xiaomi TV A2 43"',     tint: '#12232B', glyph: tv('#4FC3F7') },
  'jbl-tune':          { label: 'JBL Tune 520BT',       tint: '#0B3D41', glyph: headphones('#4DD0E1') },
  'oxford-shirt':      { label: "Cotton Oxford Shirt",  tint: '#1F5C8B', glyph: shirt('#BBDEFB') },
  'chino':             { label: 'Chino Trousers',       tint: '#6D5B3B', glyph: trousers('#D7C4A0') },
  'ankara-dress':      { label: 'Ankara Maxi Dress',    tint: '#7A2E50', glyph: dress('#FF8AB0') },
  'ankara-dress-back': { label: 'Ankara Dress — back',  tint: '#7A2E50', glyph: dress('#FF8A60') },
  'leather-tote':      { label: 'Leather Tote Bag',     tint: '#5A3A22', glyph: bag('#C79A6B') },
  'blender':           { label: 'NutriBlend 800W',      tint: '#2E5D4E', glyph: blender('#A5D6A7') },
  'air-fryer':         { label: 'Digital Air Fryer 5.5L', tint: '#3A3A3A', glyph: airFryer('#CFD8DC') },
  'lotion':            { label: 'Shea Body Lotion',     tint: '#8A6D3B', glyph: bottle('#EAD9B0') },
  'serum':             { label: 'Vitamin C Serum',      tint: '#B26A00', glyph: dropper('#FFCC80') },
  'football':          { label: 'Match Football',       tint: '#1B5E20', glyph: ball('#FFFFFF') },
  'dumbbell':          { label: 'Adjustable Dumbbell 20kg', tint: '#2B2B2B', glyph: dumbbell('#B0BEC5') },
  'pragmatic':         { label: 'The Pragmatic Programmer', tint: '#4A2E6B', glyph: book('#D1C4E9') },
  'notebooks':         { label: 'A5 Dotted Notebook ×3', tint: '#00695C', glyph: notebook('#80CBC4') },
  'cookware':          { label: 'Ceramic Cookware Set 8pc', tint: '#7A1F1F', glyph: cookware('#EF9A9A') },
  'pillow':            { label: 'Memory Foam Pillow ×2', tint: '#3E5C76', glyph: pillow('#BBD4E8') },
};

// ── Glyph builders (drawn centred in a ~360×360 box within the 600 viewBox) ──
function phone(c) {
  return `<rect x="215" y="120" width="170" height="360" rx="24" fill="none" stroke="${c}" stroke-width="10"/>
    <rect x="235" y="150" width="130" height="280" rx="8" fill="${c}" opacity="0.18"/>
    <circle cx="300" cy="455" r="12" fill="${c}"/>
    <rect x="278" y="138" width="44" height="8" rx="4" fill="${c}"/>`;
}
function phoneBack(c) {
  return `<rect x="215" y="120" width="170" height="360" rx="24" fill="none" stroke="${c}" stroke-width="10"/>
    <rect x="238" y="145" width="70" height="110" rx="14" fill="${c}" opacity="0.25"/>
    <circle cx="262" cy="175" r="14" fill="${c}"/><circle cx="262" cy="220" r="14" fill="${c}"/>
    <circle cx="320" cy="197" r="20" fill="${c}" opacity="0.7"/>`;
}
function phoneSide(c) {
  return `<rect x="285" y="130" width="30" height="340" rx="12" fill="none" stroke="${c}" stroke-width="10"/>
    <rect x="293" y="170" width="14" height="60" rx="6" fill="${c}"/>`;
}
function laptop(c) {
  return `<rect x="150" y="150" width="300" height="200" rx="12" fill="${c}" opacity="0.18" stroke="${c}" stroke-width="10"/>
    <path d="M120 380 L480 380 L510 430 L90 430 Z" fill="none" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <rect x="185" y="180" width="230" height="140" rx="4" fill="${c}" opacity="0.5"/>`;
}
function tv(c) {
  return `<rect x="110" y="140" width="380" height="240" rx="10" fill="${c}" opacity="0.15" stroke="${c}" stroke-width="10"/>
    <line x1="220" y1="420" x2="380" y2="420" stroke="${c}" stroke-width="12"/>
    <line x1="300" y1="380" x2="300" y2="420" stroke="${c}" stroke-width="12"/>
    <rect x="140" y="170" width="320" height="180" rx="4" fill="${c}" opacity="0.45"/>`;
}
function headphones(c) {
  return `<path d="M170 340 A130 130 0 0 1 430 340" fill="none" stroke="${c}" stroke-width="14"/>
    <rect x="140" y="330" width="70" height="120" rx="26" fill="${c}" opacity="0.25" stroke="${c}" stroke-width="10"/>
    <rect x="390" y="330" width="70" height="120" rx="26" fill="${c}" opacity="0.25" stroke="${c}" stroke-width="10"/>`;
}
function shirt(c) {
  return `<path d="M230 150 L300 175 L370 150 L450 210 L405 255 L405 460 L195 460 L195 255 L150 210 Z"
      fill="${c}" opacity="0.22" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M270 150 L300 200 L330 150" fill="none" stroke="${c}" stroke-width="8"/>
    <line x1="300" y1="210" x2="300" y2="440" stroke="${c}" stroke-width="6"/>`;
}
function trousers(c) {
  return `<path d="M205 150 L395 150 L388 460 L312 460 L300 300 L288 460 L212 460 Z"
      fill="${c}" opacity="0.22" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <line x1="205" y1="185" x2="395" y2="185" stroke="${c}" stroke-width="8"/>`;
}
function dress(c) {
  return `<path d="M255 150 L345 150 L360 235 L420 460 L180 460 L240 235 Z"
      fill="${c}" opacity="0.22" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M255 150 Q300 195 345 150" fill="none" stroke="${c}" stroke-width="8"/>
    <line x1="240" y1="235" x2="360" y2="235" stroke="${c}" stroke-width="8"/>`;
}
function bag(c) {
  return `<path d="M190 240 L410 240 L395 460 L205 460 Z" fill="${c}" opacity="0.22" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M250 240 A50 50 0 0 1 350 240" fill="none" stroke="${c}" stroke-width="10"/>`;
}
function blender(c) {
  return `<path d="M245 150 L355 150 L335 330 L265 330 Z" fill="${c}" opacity="0.25" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <rect x="255" y="330" width="90" height="130" rx="10" fill="none" stroke="${c}" stroke-width="10"/>
    <line x1="272" y1="200" x2="328" y2="200" stroke="${c}" stroke-width="6"/>
    <line x1="270" y1="250" x2="330" y2="250" stroke="${c}" stroke-width="6"/>`;
}
function airFryer(c) {
  return `<rect x="200" y="150" width="200" height="300" rx="22" fill="${c}" opacity="0.18" stroke="${c}" stroke-width="10"/>
    <circle cx="300" cy="220" r="34" fill="none" stroke="${c}" stroke-width="10"/>
    <rect x="230" y="300" width="140" height="90" rx="10" fill="none" stroke="${c}" stroke-width="10"/>
    <line x1="255" y1="345" x2="345" y2="345" stroke="${c}" stroke-width="8"/>`;
}
function bottle(c) {
  return `<rect x="262" y="150" width="76" height="40" rx="8" fill="${c}" stroke="${c}" stroke-width="8"/>
    <path d="M255 190 L345 190 L360 460 L240 460 Z" fill="${c}" opacity="0.22" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <line x1="262" y1="300" x2="338" y2="300" stroke="${c}" stroke-width="6"/>`;
}
function dropper(c) {
  return `<rect x="278" y="140" width="44" height="60" rx="8" fill="none" stroke="${c}" stroke-width="10"/>
    <path d="M290 200 L310 200 L332 430 L268 430 Z" fill="${c}" opacity="0.25" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="300" cy="300" r="6" fill="${c}"/>`;
}
function ball(c) {
  return `<circle cx="300" cy="300" r="150" fill="none" stroke="${c}" stroke-width="10"/>
    <path d="M300 200 L360 250 L338 320 L262 320 L240 250 Z" fill="${c}" opacity="0.7"/>
    <path d="M300 200 L300 150 M360 250 L438 235 M338 320 L390 405 M262 320 L210 405 M240 250 L162 235" stroke="${c}" stroke-width="8"/>`;
}
function dumbbell(c) {
  return `<rect x="255" y="270" width="90" height="60" rx="8" fill="none" stroke="${c}" stroke-width="10"/>
    <rect x="150" y="220" width="60" height="160" rx="12" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="10"/>
    <rect x="390" y="220" width="60" height="160" rx="12" fill="${c}" opacity="0.3" stroke="${c}" stroke-width="10"/>
    <line x1="210" y1="300" x2="255" y2="300" stroke="${c}" stroke-width="14"/>
    <line x1="345" y1="300" x2="390" y2="300" stroke="${c}" stroke-width="14"/>`;
}
function book(c) {
  return `<path d="M170 150 L430 150 L430 450 L170 450 Z" fill="${c}" opacity="0.22" stroke="${c}" stroke-width="10"/>
    <line x1="200" y1="150" x2="200" y2="450" stroke="${c}" stroke-width="10"/>
    <line x1="245" y1="210" x2="390" y2="210" stroke="${c}" stroke-width="8"/>
    <line x1="245" y1="250" x2="360" y2="250" stroke="${c}" stroke-width="8"/>`;
}
function notebook(c) {
  return `<rect x="185" y="150" width="230" height="300" rx="8" fill="${c}" opacity="0.22" stroke="${c}" stroke-width="10"/>
    <circle cx="220" cy="200" r="7" fill="${c}"/><circle cx="220" cy="240" r="7" fill="${c}"/>
    <circle cx="220" cy="280" r="7" fill="${c}"/><circle cx="220" cy="320" r="7" fill="${c}"/>
    <circle cx="220" cy="360" r="7" fill="${c}"/><circle cx="220" cy="400" r="7" fill="${c}"/>
    <line x1="250" y1="220" x2="390" y2="220" stroke="${c}" stroke-width="5" opacity="0.6"/>
    <line x1="250" y1="270" x2="390" y2="270" stroke="${c}" stroke-width="5" opacity="0.6"/>`;
}
function cookware(c) {
  return `<path d="M160 250 L360 250 L345 400 L175 400 Z" fill="${c}" opacity="0.25" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <line x1="360" y1="285" x2="440" y2="285" stroke="${c}" stroke-width="12"/>
    <path d="M200 250 A60 60 0 0 1 320 250" fill="none" stroke="${c}" stroke-width="10"/>`;
}
function pillow(c) {
  return `<path d="M150 220 Q300 190 450 220 Q475 300 450 380 Q300 410 150 380 Q125 300 150 220 Z"
      fill="${c}" opacity="0.25" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>
    <path d="M180 250 Q300 300 420 250" fill="none" stroke="${c}" stroke-width="6" opacity="0.7"/>`;
}

function render({ label, tint, glyph }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="${escapeAttr(label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tint}"/>
      <stop offset="1" stop-color="${shade(tint, -0.35)}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <circle cx="300" cy="290" r="205" fill="#FFFFFF" opacity="0.06"/>
  ${glyph}
  <rect x="0" y="500" width="600" height="100" fill="${INK}" opacity="0.82"/>
  <text x="300" y="552" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#FFFFFF">${escapeXml(label)}</text>
  <text x="300" y="582" text-anchor="middle" font-family="Georgia, serif" font-size="15" letter-spacing="3" fill="#8FD3D8">GANZA MART</text>
</svg>`;
}

function renderPlaceholder() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="No image available">
  <rect width="600" height="600" fill="#F2F5F4"/>
  <rect x="150" y="180" width="300" height="240" rx="12" fill="none" stroke="${TEAL}" stroke-width="8" opacity="0.5"/>
  <circle cx="235" cy="255" r="26" fill="${TEAL}" opacity="0.4"/>
  <path d="M170 400 L270 300 L350 380 L420 320 L450 400 Z" fill="${TEAL}" opacity="0.4"/>
  <text x="300" y="480" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#5C6B6E">No image yet</text>
</svg>`;
}

// Small colour helper so the gradient has depth without a second hard-coded hex.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * (1 + amt));
  const g = clamp(((n >> 8) & 255) * (1 + amt));
  const b = clamp((n & 255) * (1 + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
function escapeXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(s) { return escapeXml(s).replace(/"/g, '&quot;'); }

mkdirSync(OUT, { recursive: true });
let count = 0;
for (const [name, spec] of Object.entries(products)) {
  writeFileSync(join(OUT, `${name}.svg`), render(spec), 'utf8');
  count += 1;
}
writeFileSync(join(OUT, 'placeholder.svg'), renderPlaceholder(), 'utf8');
count += 1;
console.log(`Wrote ${count} SVG files to ${OUT}`);
