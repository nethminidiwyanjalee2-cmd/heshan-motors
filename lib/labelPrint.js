import JsBarcode from 'jsbarcode';


// Barcode label printing for thermal label printers (e.g. Xprinter).
//
// The label size is saved per device, because each shop PC has its own printer
// and label roll. Width = across the roll, height = along the roll (feed
// direction). The printed page is made exactly that size, so the browser does
// not rotate or shrink it and the printer does not run onto the next label.


const KEY = 'labelSettings';
export const DEFAULT_LABEL = { width: 50, height: 80 };
const MIN = 20;
const MAX = 120;


const clampMm = (v, fallback) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(MAX, Math.max(MIN, Math.round(n * 10) / 10));
};


export function normalizeLabel(s) {
    return {
        width: clampMm(s?.width, DEFAULT_LABEL.width),
        height: clampMm(s?.height, DEFAULT_LABEL.height),
    };
}


export function loadLabelSettings() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? normalizeLabel(JSON.parse(raw)) : { ...DEFAULT_LABEL };
    } catch {
        return { ...DEFAULT_LABEL };
    }
}


export function saveLabelSettings(s) {
    try { localStorage.setItem(KEY, JSON.stringify(normalizeLabel(s))); } catch { }
}


const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


// Bars only (no text inside the SVG), stretched to fill the space it is given.
// Stretching keeps every bar in proportion across the width, so it still scans.
function barsSvg(code) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: 100 });
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');
    return svg.outerHTML;
}


export function printLabels({ name, price, barcode, copies, settings }) {
    const { width: W, height: H } = normalizeLabel(settings);
    const n = Math.max(1, Math.min(100, parseInt(copies, 10) || 1));
    const bars = barsSvg(barcode);


    // Sizes follow the label so small and large labels both look right.
    const pad = Math.min(2, H * 0.04);
    const side = Math.max(2.5, W * 0.04);          // also the scanner's quiet zone
    const titleMm = Math.min(4.2, H * 0.085, W * 0.06);
    const codeMm = Math.min(3, H * 0.06);
    const priceMm = Math.min(5, H * 0.1, W * 0.07);
    const pageH = H - 0.4;                          // just under, so rounding never spills onto a blank label


    const label = `
    <div class="label">
      <div class="title">${esc(name)}</div>
      <div class="bars">${bars}</div>
      <div class="code">${esc(barcode)}</div>
      <div class="price">Rs. ${esc(price)}</div>
    </div>`;


    const w = window.open('', '_blank');
    if (!w) {
        alert('Please allow pop-ups for this website in your browser settings to print barcode labels.');
        return;
    }


    w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Barcode Label — ${esc(name)}</title>
<style>
  @page { size: ${W}mm ${H}mm; margin: 0; }
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}mm; background: #fff; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000; font-weight: bold;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .label {
    width: ${W}mm; height: ${pageH}mm;
    padding: ${pad}mm ${side}mm;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    text-align: center;
    overflow: hidden;
    break-after: page; page-break-after: always;
    break-inside: avoid; page-break-inside: avoid;
  }
  .label:last-child { break-after: auto; page-break-after: auto; }
  .title {
    font-size: ${titleMm}mm; line-height: 1.15;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
    overflow: hidden; word-break: break-word;
  }
  .bars { min-height: 0; padding: ${pad * 0.6}mm 0; }
  .bars svg { display: block; width: 100%; height: 100%; }
  .code { font-size: ${codeMm}mm; line-height: 1.1; letter-spacing: 0.3mm; }
  .price { font-size: ${priceMm}mm; line-height: 1.15; }
</style>
</head>
<body>
${Array(n).fill(label).join('')}
<script>
  window.onload = function () {
    window.onafterprint = function () { window.close(); };
    window.focus();
    window.print();
  };
</script>
</body>
</html>`);
    w.document.close();
}