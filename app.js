'use strict';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

// ---------- Cấu hình & giới hạn ----------
const MAX_MB = 100, MAX_FILES = 50, MAX_PAGES = 300, MAX_PIXELS = 50e6, MAX_RENDER_PIXELS = 16e6;
const $ = id => document.getElementById(id);
let lang = 'en', tool = 'removebg', files = [], busy = false;
const t = (en, vi) => (lang === 'vi' ? vi : en);

const UI = {
  en: { title: 'OmniTools - Browser-Based File Suite', heading: 'OmniTools Workspace',
    sub: 'Document & image utilities that run on your device.', badge: 'Processed locally — no upload',
    drop: 'Drag & drop files here, or click to browse', run: 'Process File', selected: 'Selected',
    lblSplit: 'Page range (e.g. 1-3, 5):', lblCompress: 'Compression level:',
    optLow: 'Light (high quality - 75%)', optMed: 'Medium (balanced - 50%)', optHigh: 'High (smallest - 30%)' },
  vi: { title: 'OmniTools - Bộ công cụ tệp trên trình duyệt', heading: 'Trạm Công Cụ OmniTools',
    sub: 'Công cụ xử lý tài liệu & ảnh chạy ngay trên thiết bị của bạn.', badge: 'Xử lý tại máy — không tải lên',
    drop: 'Kéo & thả tệp vào đây, hoặc nhấn để chọn', run: 'Bắt đầu xử lý', selected: 'Đã chọn',
    lblSplit: 'Khoảng trang (ví dụ: 1-3, 5):', lblCompress: 'Mức nén:',
    optLow: 'Nén nhẹ (chất lượng tốt - 75%)', optMed: 'Nén vừa (cân bằng - 50%)', optHigh: 'Nén cao (nhỏ nhất - 30%)' }
};

// type: loại tệp chấp nhận; multi: cho chọn nhiều; en/vi = [tên, mô tả, gợi ý]
const TOOLS = {
  removebg: { icon: '✨', c: 'bg-pink-100 text-pink-600', type: 'image', multi: false, run: removeBg,
    en: ['Background Remover', 'Remove a solid-colour background to transparent PNG.', 'Select 1 image (JPG, PNG, WebP)'],
    vi: ['Xóa nền đơn sắc', 'Xóa phông nền đồng màu, xuất PNG trong suốt.', 'Chọn 1 ảnh (JPG, PNG, WebP)'] },
  img2pdf: { icon: '📁', c: 'bg-sky-100 text-sky-600', type: 'image', multi: true, run: imagesToPdf,
    en: ['Images to PDF', 'Merge images into one PDF (fit to A4).', 'Select one or more images'],
    vi: ['Ảnh sang PDF', 'Gộp ảnh thành 1 PDF (vừa khổ A4).', 'Chọn một hoặc nhiều ảnh'] },
  word: { icon: '📝', c: 'bg-blue-100 text-blue-600', type: 'pdf', multi: false, run: pdfToWord,
    en: ['PDF to Word', 'Extract PDF text into DOCX (text only).', 'Select 1 PDF file'],
    vi: ['PDF sang Word', 'Trích văn bản PDF sang DOCX (chỉ văn bản).', 'Chọn 1 tệp PDF'] },
  excel: { icon: '📊', c: 'bg-emerald-100 text-emerald-600', type: 'pdf', multi: false, run: pdfToExcel,
    en: ['PDF to Excel', 'Extract text lines into XLSX.', 'Select 1 PDF file'],
    vi: ['PDF sang Excel', 'Trích các dòng văn bản sang XLSX.', 'Chọn 1 tệp PDF'] },
  image: { icon: '🖼️', c: 'bg-amber-100 text-amber-600', type: 'pdf', multi: false, run: pdfToImages,
    en: ['PDF to Images', 'Render PDF pages to a ZIP of PNGs.', 'Select 1 PDF file'],
    vi: ['PDF sang hình ảnh', 'Xuất từng trang PDF thành PNG, nén ZIP.', 'Chọn 1 tệp PDF'] },
  merge: { icon: '📑', c: 'bg-indigo-100 text-indigo-600', type: 'pdf', multi: true, run: mergePdf,
    en: ['Merge PDF', 'Combine PDF files in selection order.', 'Select 2 or more PDF files'],
    vi: ['Gộp PDF', 'Gộp các PDF theo thứ tự đã chọn.', 'Chọn từ 2 tệp PDF trở lên'] },
  split: { icon: '✂️', c: 'bg-rose-100 text-rose-600', type: 'pdf', multi: false, run: splitPdf,
    en: ['Split PDF', 'Extract pages or page ranges.', 'Select 1 PDF and enter a page range'],
    vi: ['Tách PDF', 'Tách trang theo khoảng tùy chọn.', 'Chọn 1 PDF và nhập khoảng trang'] },
  compress: { icon: '🗜️', c: 'bg-purple-100 text-purple-600', type: 'pdf', multi: false, run: compressPdf,
    en: ['Compress PDF', 'Shrink scanned/image PDFs (pages become images).', 'Select 1 PDF file'],
    vi: ['Nén PDF', 'Giảm dung lượng PDF scan/ảnh (trang chuyển thành ảnh).', 'Chọn 1 tệp PDF'] }
};

// ---------- Tiện ích ----------
const baseName = f => f.name.replace(/\.[^/.]+$/, '');
const tick = () => new Promise(r => setTimeout(r));
const toBlob = (c, type, q) => new Promise((res, rej) =>
  c.toBlob(b => (b ? res(b) : rej(new Error(t('Image export failed.', 'Xuất ảnh thất bại.')))), type, q));
const freeCanvas = c => { c.width = c.height = 0; };
function newCanvas(w, h) {
  if (w * h > MAX_PIXELS) throw new Error(t('Image is too large.', 'Ảnh quá lớn.'));
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function setStatus(msg, isError = false) {
  const el = $('status'); el.textContent = msg;
  el.classList.toggle('text-red-600', isError); el.classList.toggle('text-slate-600', !isError);
}
async function progress(i, n) { setStatus(`⏳ ${t('Processing', 'Đang xử lý')} ${i}/${n}`); await tick(); }
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000); // không thu hồi ngay: Safari/Firefox có thể hủy tải
}
function loadImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(t('Cannot read image.', 'Không đọc được ảnh.'))); };
    img.src = url;
  });
}
// pdf.js: isEvalSupported:false giảm thiểu CVE-2024-4367 (bản 3.x)
async function openPdf(file) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    if (pdf.numPages > MAX_PAGES) throw new Error(t(`Too many pages (max ${MAX_PAGES}).`, `Quá nhiều trang (tối đa ${MAX_PAGES}).`));
    return pdf;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error(t(`"${file.name}" is password-protected.`, `"${file.name}" có mật khẩu.`));
    throw e;
  }
}
async function loadLib(file) {
  try { return await PDFLib.PDFDocument.load(await file.arrayBuffer()); }
  catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error(t(`"${file.name}" is encrypted.`, `"${file.name}" đã được mã hóa.`));
    throw e;
  }
}

// ---------- Các công cụ (mỗi hàm trả về thông báo thành công) ----------
async function removeBg(fs) {
  const f = fs[0], img = await loadImage(f);
  const c = newCanvas(img.width, img.height), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data, r = p[0], g = p[1], b = p[2];
  for (let i = 0; i < p.length; i += 4)
    if (Math.abs(p[i] - r) + Math.abs(p[i + 1] - g) + Math.abs(p[i + 2] - b) < 120) p[i + 3] = 0;
  x.putImageData(d, 0, 0);
  download(await toBlob(c, 'image/png'), baseName(f) + '-no-bg.png'); freeCanvas(c);
  return t('Background removed.', 'Đã xóa phông nền.');
}

async function imagesToPdf(fs) {
  const doc = await PDFLib.PDFDocument.create();
  for (let i = 0; i < fs.length; i++) {
    await progress(i + 1, fs.length);
    const img = await loadImage(fs[i]), c = newCanvas(img.width, img.height), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); // tránh nền đen khi PNG trong suốt → JPEG
    x.drawImage(img, 0, 0);
    const jpg = await doc.embedJpg(await (await toBlob(c, 'image/jpeg', 0.9)).arrayBuffer()); freeCanvas(c);
    const [pw, ph] = jpg.width > jpg.height ? [842, 595] : [595, 842]; // A4
    const s = Math.min(pw / jpg.width, ph / jpg.height), w = jpg.width * s, h = jpg.height * s;
    doc.addPage([pw, ph]).drawImage(jpg, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  download(new Blob([await doc.save()], { type: 'application/pdf' }), 'images.pdf');
  return t('Images merged into PDF.', 'Đã gộp ảnh thành PDF.');
}

async function pdfToWord(fs) {
  const pdf = await openPdf(fs[0]), paras = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    await progress(i, pdf.numPages);
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    paras.push(new docx.Paragraph({ children: [new docx.TextRun(tc.items.map(it => it.str).join(' '))], spacing: { after: 200 } }));
    page.cleanup();
  }
  download(await docx.Packer.toBlob(new docx.Document({ sections: [{ children: paras }] })), baseName(fs[0]) + '.docx');
  return t('Converted to Word (text only).', 'Đã chuyển sang Word (chỉ văn bản).');
}

async function pdfToExcel(fs) {
  const pdf = await openPdf(fs[0]), rows = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    await progress(i, pdf.numPages);
    const page = await pdf.getPage(i), tc = await page.getTextContent(), lines = {};
    tc.items.forEach(it => { const y = Math.round(it.transform[5]); (lines[y] = lines[y] || []).push({ x: it.transform[4], s: it.str }); });
    Object.keys(lines).sort((a, b) => b - a).forEach(y => rows.push(lines[y].sort((a, b) => a.x - b.x).map(c => c.s)));
    page.cleanup();
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Data');
  download(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), baseName(fs[0]) + '.xlsx');
  return t('Exported to Excel.', 'Đã xuất ra Excel.');
}

async function pdfToImages(fs) {
  const pdf = await openPdf(fs[0]), zip = new JSZip();
  for (let i = 1; i <= pdf.numPages; i++) {
    await progress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    let vp = page.getViewport({ scale: 2 });
    if (vp.width * vp.height > MAX_RENDER_PIXELS) vp = page.getViewport({ scale: 2 * Math.sqrt(MAX_RENDER_PIXELS / (vp.width * vp.height)) });
    const c = newCanvas(Math.floor(vp.width), Math.floor(vp.height));
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    zip.file(`page-${i}.png`, await toBlob(c, 'image/png')); freeCanvas(c); page.cleanup();
  }
  download(await zip.generateAsync({ type: 'blob' }), baseName(fs[0]) + '-images.zip');
  return t('ZIP downloaded.', 'Đã tải tệp ZIP.');
}

async function mergePdf(fs) {
  if (fs.length < 2) throw new Error(t('Select at least 2 PDF files.', 'Vui lòng chọn từ 2 tệp PDF trở lên.'));
  const out = await PDFLib.PDFDocument.create();
  for (let i = 0; i < fs.length; i++) {
    await progress(i + 1, fs.length);
    const src = await loadLib(fs[i]);
    (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
  }
  download(new Blob([await out.save()], { type: 'application/pdf' }), 'merged.pdf');
  return t('PDFs merged.', 'Đã gộp PDF.');
}

function parseRanges(s, total) {
  const set = new Set();
  for (const raw of s.split(',')) {
    const part = raw.trim(); if (!part) continue;
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(t(`Invalid range: "${part}"`, `Khoảng trang không hợp lệ: "${part}"`));
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a || b > total) throw new Error(t(`"${part}" is out of range (1-${total}).`, `"${part}" ngoài phạm vi (1-${total}).`));
    for (let p = a; p <= b; p++) set.add(p - 1);
  }
  if (!set.size) throw new Error(t('No pages selected.', 'Chưa chọn trang nào.'));
  return [...set].sort((x, y) => x - y);
}
async function splitPdf(fs) {
  const src = await loadLib(fs[0]);
  const idx = parseRanges($('splitRange').value, src.getPageCount());
  const out = await PDFLib.PDFDocument.create();
  (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
  download(new Blob([await out.save()], { type: 'application/pdf' }), 'split-' + fs[0].name);
  return t(`Extracted ${idx.length} page(s).`, `Đã tách ${idx.length} trang.`);
}

async function compressPdf(fs) {
  const f = fs[0], q = parseFloat($('compressLevel').value), pdf = await openPdf(f);
  const out = await PDFLib.PDFDocument.create();
  for (let i = 1; i <= pdf.numPages; i++) {
    await progress(i, pdf.numPages);
    const page = await pdf.getPage(i), base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 1.5 });
    const c = newCanvas(Math.floor(vp.width), Math.floor(vp.height));
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const img = await out.embedJpg(await (await toBlob(c, 'image/jpeg', q)).arrayBuffer()); freeCanvas(c); page.cleanup();
    out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height }); // giữ đúng khổ trang gốc
  }
  const bytes = await out.save(), oldKB = (f.size / 1024).toFixed(1), newKB = (bytes.byteLength / 1024).toFixed(1);
  if (bytes.byteLength >= f.size)
    return t(`No gain (${oldKB} KB → ${newKB} KB). Original kept; nothing downloaded.`, `Không giảm được (${oldKB} KB → ${newKB} KB). Giữ nguyên tệp gốc, không tải xuống.`);
  download(new Blob([bytes], { type: 'application/pdf' }), 'compressed-' + f.name);
  return t(`Compressed ${oldKB} KB → ${newKB} KB.`, `Đã nén ${oldKB} KB → ${newKB} KB.`);
}

// ---------- Giao diện ----------
function renderCards() {
  $('tools').innerHTML = Object.entries(TOOLS).map(([k, v]) =>
    `<button type="button" data-tool="${k}" class="tool-card ${k === tool ? 'active' : ''} text-left bg-white p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-400">` +
    `<div class="w-9 h-9 rounded-xl ${v.c} flex items-center justify-center text-lg mb-2">${v.icon}</div>` +
    `<h3 class="font-bold text-slate-900 text-sm">${v[lang][0]}</h3><p class="text-xs text-slate-500 mt-1">${v[lang][1]}</p></button>`).join('');
}
function refreshPanel() {
  const cfg = TOOLS[tool];
  $('panelTitle').textContent = cfg[lang][0];
  $('panelDesc').textContent = cfg[lang][1];
  $('fileHint').textContent = cfg[lang][2];
  $('fileInput').accept = cfg.type === 'pdf' ? 'application/pdf' : 'image/*';
  $('fileInput').multiple = cfg.multi;
  $('optSplit').classList.toggle('hidden', tool !== 'split');
  $('optCompress').classList.toggle('hidden', tool !== 'compress');
  $('fileName').textContent = files.length
    ? `📂 ${UI[lang].selected}: ${files.length === 1 ? files[0].name : files.length + ' files'}` : '';
}
function applyLang(l) {
  lang = l; document.documentElement.lang = l; document.title = UI[l].title;
  document.querySelectorAll('[data-ui]').forEach(el => { el.textContent = UI[l][el.dataset.ui]; });
  renderCards(); refreshPanel();
}
function selectTool(k) {
  if (busy) return;
  tool = k; files = []; setStatus('');
  renderCards(); refreshPanel();
}
function setFiles(list) {
  const cfg = TOOLS[tool], arr = [...list];
  const ok = arr.filter(f => (cfg.type === 'pdf' ? f.type === 'application/pdf' || /\.pdf$/i.test(f.name) : f.type.startsWith('image/')));
  if (!ok.length) return setStatus(t('Unsupported file type for this tool.', 'Định dạng tệp không phù hợp với công cụ này.'), true);
  if (ok.length > MAX_FILES || ok.some(f => f.size > MAX_MB * 1048576))
    return setStatus(t(`Max ${MAX_FILES} files, ${MAX_MB} MB each.`, `Tối đa ${MAX_FILES} tệp, mỗi tệp ${MAX_MB} MB.`), true);
  files = cfg.multi ? ok : ok.slice(0, 1);
  setStatus(ok.length < arr.length || (!cfg.multi && ok.length > 1) ? t('Some files were skipped.', 'Một số tệp đã bị bỏ qua.') : '');
  refreshPanel();
}
async function runTool() {
  if (busy) return;
  if (!files.length) return setStatus(t('Please select or drop a file first.', 'Vui lòng chọn hoặc kéo thả tệp trước.'), true);
  busy = true; $('runBtn').disabled = true;
  try { setStatus('✅ ' + await TOOLS[tool].run(files)); }
  catch (e) { console.error(e); setStatus('❌ ' + (e.message || e), true); }
  finally { busy = false; $('runBtn').disabled = false; }
}

// ---------- Sự kiện (không dùng onclick inline vì CSP) ----------
const dz = $('dropZone'), fi = $('fileInput');
$('tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) selectTool(b.dataset.tool); });
$('runBtn').addEventListener('click', runTool);
$('langSelect').addEventListener('change', e => applyLang(e.target.value));
dz.addEventListener('click', () => fi.click());
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
fi.addEventListener('change', () => { if (fi.files.length) setFiles(fi.files); fi.value = ''; });
['dragover', 'drop'].forEach(n => window.addEventListener(n, e => e.preventDefault())); // thả ngoài vùng không mở file
['dragenter', 'dragover'].forEach(n => dz.addEventListener(n, () => dz.classList.add('drag-over')));
['dragleave', 'drop'].forEach(n => dz.addEventListener(n, () => dz.classList.remove('drag-over')));
dz.addEventListener('drop', e => setFiles(e.dataTransfer.files));

const initLang = (navigator.language || 'en').startsWith('vi') ? 'vi' : 'en';
$('langSelect').value = initLang;
applyLang(initLang);
