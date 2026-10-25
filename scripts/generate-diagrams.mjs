// Genera los diagramas de arquitectura y de flujo de EntraFactura en SVG y PNG.
// Uso: node scripts/generate-diagrams.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'docs');
const FONT =
  "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif";

const C = {
  bg: '#f8fafc',
  panel: '#ffffff',
  title: '#0f172a',
  subtitle: '#475569',
  bandFill: '#f1f5f9',
  bandStroke: '#e2e8f0',
  divider: '#cbd5e1',
  arrow: '#64748b',
  soft: '#94a3b8',
};

const LAYERS = {
  users: { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a', label: '#1d4ed8' },
  front: { fill: '#e0f2fe', stroke: '#0284c7', text: '#075985', label: '#0369a1' },
  back: { fill: '#e0e7ff', stroke: '#4f46e5', text: '#3730a3', label: '#4338ca' },
  extract: { fill: '#ede9fe', stroke: '#7c3aed', text: '#5b21b6', label: '#6d28d9' },
  data: { fill: '#dcfce7', stroke: '#16a34a', text: '#166534', label: '#15803d' },
  ext: { fill: '#ffedd5', stroke: '#ea580c', text: '#9a3412', label: '#c2410c' },
  neutral: { fill: '#e2e8f0', stroke: '#94a3b8', text: '#334155', label: '#475569' },
};

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function text({
  x,
  y,
  str,
  size = 13,
  weight = 400,
  anchor = 'start',
  fill = C.title,
  opacity = 1,
  italic = false,
}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}"${
    opacity !== 1 ? ` opacity="${opacity}"` : ''
  }${italic ? ' font-style="italic"' : ''}>${esc(str)}</text>`;
}

function rect({ x, y, w, h, fill, stroke, rx = 10, sw = 1.5, dash }) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${fill}"${
    stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''
  }${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function arrow({ x1, y1, x2, y2, color = C.arrow, width = 1.8, both = false, dash }) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${
    dash ? ` stroke-dasharray="${dash}"` : ''
  } marker-end="url(#arrowhead)"${both ? ' marker-start="url(#arrowhead-start)"' : ''}/>`;
}

function pathArrow({ d, color = C.arrow, width = 1.8, dash }) {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${
    dash ? ` stroke-dasharray="${dash}"` : ''
  } marker-end="url(#arrowhead)"/>`;
}

function diamond({ cx, cy, w, h, color }) {
  const p = `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;
  return `<polygon points="${p}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="1.6"/>`;
}

// Box with a title and optional subtitle lines, vertically centered.
function box(x, y, w, h, title, sub, color, opts = {}) {
  const titleSize = opts.titleSize ?? 15;
  const subSize = opts.subSize ?? 11.5;
  const subs = sub ? (Array.isArray(sub) ? sub : [sub]) : [];
  const gapAfterTitle = 6;
  const lineH = subSize + 3.5;
  const blockH = titleSize + (subs.length ? gapAfterTitle + subs.length * lineH : 0);
  let cy = y + h / 2 - blockH / 2 + titleSize * 0.82;
  let s = rect({ x, y, w, h, fill: color.fill, stroke: color.stroke, rx: 10 });
  s += text({
    x: x + w / 2,
    y: cy,
    str: title,
    size: titleSize,
    weight: 700,
    anchor: 'middle',
    fill: color.text,
  });
  cy += gapAfterTitle + subSize;
  for (const line of subs) {
    s += text({
      x: x + w / 2,
      y: cy,
      str: line,
      size: subSize,
      anchor: 'middle',
      fill: color.text,
      opacity: 0.85,
    });
    cy += lineH;
  }
  return s;
}

function defs() {
  return `<defs>
    <marker id="arrowhead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
      <path d="M0,0 L9,4.5 L0,9 z" fill="${C.arrow}"/>
    </marker>
    <marker id="arrowhead-start" markerWidth="9" markerHeight="9" refX="2" refY="4.5" orient="auto">
      <path d="M9,0 L0,4.5 L9,9 z" fill="${C.arrow}"/>
    </marker>
  </defs>`;
}

function svgWrap(w, h, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${defs()}
<rect x="0" y="0" width="${w}" height="${h}" fill="${C.bg}"/>
${body}
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Diagrama 1: Arquitectura                                            */
/* ------------------------------------------------------------------ */
function architecture() {
  const W = 1500;
  const H = 910;
  let s = '';

  s += text({ x: 40, y: 52, str: 'EntraFactura — Arquitectura del sistema', size: 28, weight: 800 });
  s += text({
    x: 40,
    y: 76,
    str: 'SaaS multi-tenant de gestión de facturas (Next.js · Supabase · IA)',
    size: 14,
    fill: C.subtitle,
  });

  const bandX = 40;
  const bandW = 1420;
  const labelX = 60;
  const contentX = 230;
  const contentW = 1230;

  const bands = [
    { key: 'users', label: 'Usuarios', y: 95, h: 80 },
    { key: 'front', label: 'Frontend', y: 205, h: 130 },
    { key: 'back', label: 'Backend', y: 365, h: 140 },
  ];

  for (const b of bands) {
    const color = LAYERS[b.key];
    s += rect({ x: bandX, y: b.y, w: bandW, h: b.h, fill: C.bandFill, stroke: C.bandStroke, rx: 14 });
    s += rect({ x: bandX, y: b.y, w: 6, h: b.h, fill: color.stroke, rx: 3 });
    s += text({
      x: labelX,
      y: b.y + b.h / 2 + 6,
      str: b.label,
      size: 17,
      weight: 800,
      fill: color.label,
    });
    s += `<line x1="215" y1="${b.y + 14}" x2="215" y2="${b.y + b.h - 14}" stroke="${C.divider}" stroke-width="1"/>`;
  }

  // Usuarios
  s += box(620, 112, 460, 46, 'Empresa', 'Admin · Miembro (navegador)', LAYERS.users, {
    titleSize: 15,
    subSize: 12,
  });

  // Frontend
  const frontItems = [
    ['Auth', ['Registro · Login', 'Reset de contraseña']],
    ['Dashboard', ['KPIs y resúmenes']],
    ['Facturas', ['Lista · Detalle', 'Subir factura']],
    ['Configuración', ['Correos · NIT', 'Suscripción']],
    ['Billing', ['Planes · Pago']],
  ];
  frontItems.forEach(([t, sub], i) => {
    s += box(295 + i * 225, 225, 210, 90, t, sub, LAYERS.front, { titleSize: 14, subSize: 11 });
  });

  // Backend
  const backItems = [
    ['Middleware', ['Auth + tenant', 'Rate limiting']],
    ['Rutas API', ['Subida · Extracción', 'Archivo · Edición · Export', 'Organización · Suscripción']],
    ['Cron jobs', ['fetch-emails (diario)', 'check-due-invoices']],
    ['Librerías internas', ['gmail · graph', 'ia · plans', 'pdf/xml']],
  ];
  backItems.forEach(([t, sub], i) => {
    s += box(280 + i * 290, 387, 270, 96, t, sub, LAYERS.back, { titleSize: 14, subSize: 11 });
  });

  // Arrows between top bands
  s += arrow({ x1: 850, y1: 177, x2: 850, y2: 203, both: true });
  s += arrow({ x1: 850, y1: 337, x2: 850, y2: 363, both: true });

  // Bottom three panels
  const panelY = 555;
  const panelH = 220;
  const panels = [
    { x: 240, w: 380, key: 'extract', title: 'Motor de extracción' },
    { x: 650, w: 380, key: 'data', title: 'Datos (Supabase)' },
    { x: 1060, w: 410, key: 'ext', title: 'Servicios externos' },
  ];
  for (const p of panels) {
    const color = LAYERS[p.key];
    s += rect({ x: p.x, y: panelY, w: p.w, h: panelH, fill: color.fill, stroke: color.stroke, rx: 14, sw: 1.6 });
    s += text({
      x: p.x + p.w / 2,
      y: panelY + 26,
      str: p.title,
      size: 15,
      weight: 800,
      anchor: 'middle',
      fill: color.label,
    });
  }

  // Panel A: extracción
  s += box(260, 598, 340, 82, 'Factura electrónica (ZIP/XML)', ['UBL 2.1 — sin IA', 'filtro emisor / adquiriente (NIT)'], LAYERS.neutral, { titleSize: 13, subSize: 11 });
  s += box(260, 688, 340, 82, 'PDF / imagen', ['IA Groq (texto / visión)'], LAYERS.neutral, { titleSize: 13, subSize: 11 });

  // Panel B: datos
  s += box(670, 598, 340, 52, 'Supabase Auth', 'sesiones · usuarios', LAYERS.neutral, { titleSize: 13, subSize: 11 });
  s += box(670, 658, 340, 52, 'Postgres + Prisma', 'organizaciones · facturas · planes', LAYERS.neutral, { titleSize: 13, subSize: 11 });
  s += box(670, 718, 340, 52, 'Supabase Storage', 'bucket invoices', LAYERS.neutral, { titleSize: 13, subSize: 11 });

  // Panel C: externos (2 columnas x 4 filas)
  const ext = [
    ['Gmail / Outlook', 'APIs (solo lectura)'],
    ['Groq', 'IA (LangChain)'],
    ['Mercado Pago', 'suscripciones'],
    ['SendGrid', 'alertas email'],
    ['DIAN', 'XML UBL 2.1'],
    ['Upstash Redis', 'rate limiting'],
  ];
  ext.forEach(([t, sub], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    s += box(1075 + col * 190, 598 + row * 45, 180, 37, t, sub, LAYERS.neutral, { titleSize: 11.5, subSize: 9.5 });
  });

  // Arrows backend -> panels
  s += arrow({ x1: 430, y1: 507, x2: 430, y2: 553, both: true });
  s += arrow({ x1: 840, y1: 507, x2: 840, y2: 553, both: true });
  s += arrow({ x1: 1265, y1: 507, x2: 1265, y2: 553, both: true });

  // Legend
  const legend = [
    ['Usuarios', LAYERS.users],
    ['Frontend', LAYERS.front],
    ['Backend', LAYERS.back],
    ['Extracción', LAYERS.extract],
    ['Datos', LAYERS.data],
    ['Externos', LAYERS.ext],
  ];
  let lx = 60;
  s += text({ x: 60, y: 812, str: 'Leyenda:', size: 13, weight: 700, fill: C.subtitle });
  lx = 130;
  for (const [name, color] of legend) {
    s += rect({ x: lx, y: 800, w: 16, h: 16, fill: color.fill, stroke: color.stroke, rx: 4 });
    s += text({ x: lx + 22, y: 813, str: name, size: 12.5, fill: C.subtitle });
    lx += 22 + name.length * 7 + 26;
  }
  s += text({
    x: 60,
    y: 866,
    str: 'Las flechas dobles indican dependencia/uso entre capas. El backend orquesta frontend, datos, extracción y servicios externos.',
    size: 12,
    fill: C.soft,
    italic: true,
  });

  return svgWrap(W, H, s);
}

/* ------------------------------------------------------------------ */
/* Diagrama 2: Flujo de una factura                                    */
/* ------------------------------------------------------------------ */
function flow() {
  const W = 1080;
  const H = 1330;
  let s = '';

  s += text({ x: 40, y: 52, str: 'EntraFactura — Flujo de una factura', size: 28, weight: 800 });
  s += text({
    x: 40,
    y: 76,
    str: 'Desde que entra (carga manual o correo) hasta que queda registrada y disponible',
    size: 14,
    fill: C.subtitle,
  });

  // N1 entrada
  s += box(70, 100, 620, 72, 'Entrada de la factura', ['Subida manual (PDF · imagen · ZIP · XML)  ó  correo (Gmail / Outlook)'], LAYERS.front, { titleSize: 16, subSize: 12 });

  // D1
  s += diamond({ cx: 380, cy: 265, w: 440, h: 130, color: LAYERS.neutral });
  s += text({ x: 380, y: 258, str: '¿Factura electrónica?', size: 15, weight: 700, anchor: 'middle', fill: LAYERS.neutral.text });
  s += text({ x: 380, y: 278, str: '(ZIP / XML)', size: 12, anchor: 'middle', fill: C.subtitle });

  // N2a (IA) y N2b (XML)
  s += box(40, 410, 260, 90, 'IA (Groq)', ['Lee PDF / imagen', 'extrae proveedor, NIT, montos'], LAYERS.extract, { titleSize: 15, subSize: 11 });
  s += box(670, 410, 260, 90, 'XML DIAN (UBL 2.1)', ['Descomprime el ZIP · sin IA', 'parsea el XML de la DIAN'], LAYERS.extract, { titleSize: 15, subSize: 11 });

  // D2
  s += diamond({ cx: 800, cy: 575, w: 320, h: 120, color: LAYERS.neutral });
  s += text({ x: 800, y: 568, str: '¿Empresa = emisor?', size: 14, weight: 700, anchor: 'middle', fill: LAYERS.neutral.text });
  s += text({ x: 800, y: 588, str: '(NIT)', size: 12, anchor: 'middle', fill: C.subtitle });

  // N3 descartar
  s += box(680, 700, 240, 66, 'Descartar', ['No se registra'], LAYERS.ext, { titleSize: 14, subSize: 11 });

  // N4 datos
  s += box(100, 700, 560, 76, 'Datos de la factura', ['Proveedor · NIT · fechas · subtotal / IVA / total · ítems'], LAYERS.data, { titleSize: 15, subSize: 12 });

  // N5..N8 pipeline
  s += box(100, 812, 560, 60, 'Guardar: Postgres + Supabase Storage', null, LAYERS.back, { titleSize: 15 });
  s += box(100, 898, 560, 60, 'Vista previa del archivo original', null, LAYERS.back, { titleSize: 15 });
  s += box(100, 984, 560, 60, 'Listado y detalle (totales, edición)', null, LAYERS.back, { titleSize: 15 });
  s += box(100, 1070, 560, 60, 'Export a Excel', null, LAYERS.back, { titleSize: 15 });

  // N9 / N10 procesos aparte
  s += box(60, 1190, 440, 80, 'Cron de vencimientos', ['Alertas de pago por SendGrid'], LAYERS.extract, { titleSize: 14, subSize: 11.5 });
  s += box(580, 1190, 440, 80, 'Suscripción y cuotas', ['Planes y cobro con Mercado Pago'], LAYERS.extract, { titleSize: 14, subSize: 11.5 });

  // Arrows
  s += arrow({ x1: 380, y1: 172, x2: 380, y2: 198 });
  s += arrow({ x1: 170, y1: 265, x2: 170, y2: 408 });
  s += text({ x: 200, y: 350, str: 'No', size: 13, weight: 700, fill: C.arrow });
  s += arrow({ x1: 600, y1: 265, x2: 790, y2: 408 });
  s += text({ x: 688, y: 350, str: 'Sí', size: 13, weight: 700, fill: C.arrow });

  s += arrow({ x1: 800, y1: 500, x2: 800, y2: 513 });
  s += arrow({ x1: 800, y1: 635, x2: 800, y2: 698 });
  s += text({ x: 812, y: 672, str: 'Sí', size: 13, weight: 700, fill: C.arrow });
  s += arrow({ x1: 640, y1: 575, x2: 520, y2: 698 });
  s += text({ x: 548, y: 645, str: 'No', size: 13, weight: 700, fill: C.arrow });

  s += arrow({ x1: 170, y1: 500, x2: 285, y2: 698 });

  s += arrow({ x1: 380, y1: 776, x2: 380, y2: 810 });
  s += arrow({ x1: 380, y1: 872, x2: 380, y2: 896 });
  s += arrow({ x1: 380, y1: 958, x2: 380, y2: 982 });
  s += arrow({ x1: 380, y1: 1044, x2: 380, y2: 1068 });

  s += pathArrow({ d: 'M380,1130 L380,1160 L280,1160 L280,1188', dash: '6 5' });
  s += pathArrow({ d: 'M380,1130 L380,1160 L800,1160 L800,1188', dash: '6 5' });

  return svgWrap(W, H, s);
}

async function writeBoth(name, svg) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const svgPath = path.join(OUT_DIR, `${name}.svg`);
  const pngPath = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(svgPath, svg, 'utf8');
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(pngPath);
  const png = fs.statSync(pngPath);
  console.log(`OK  ${path.relative(process.cwd(), svgPath)}  y  ${path.relative(process.cwd(), pngPath)} (${Math.round(png.size / 1024)} KB)`);
}

await writeBoth('arquitectura', architecture());
await writeBoth('flujo-factura', flow());
