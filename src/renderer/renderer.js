import './styles.css';
import { loadPdf, renderPage } from './pdf-renderer';

// DOM elements
const dropZone = document.getElementById('dropZone');
const btnSelectFile = document.getElementById('btnSelectFile');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const filePages = document.getElementById('filePages');
const presetSection = document.getElementById('presetSection');
const btnConvert = document.getElementById('btnConvert');
const progressSection = document.getElementById('progressSection');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');
const sizeText = document.getElementById('sizeText');
const sizeFill = document.getElementById('sizeFill');
const sizeWarning = document.getElementById('sizeWarning');
const resultSection = document.getElementById('resultSection');
const btnPreview = document.getElementById('btnPreview');
const btnOpenFolder = document.getElementById('btnOpenFolder');
const btnNewFile = document.getElementById('btnNewFile');
const pdfCanvas = document.getElementById('pdfCanvas');

const dpiSlider = document.getElementById('dpiSlider');
const dpiValue = document.getElementById('dpiValue');
const widthSlider = document.getElementById('widthSlider');
const widthValue = document.getElementById('widthValue');
const trimToggle = document.getElementById('trimToggle');
const trimGapSlider = document.getElementById('trimGapSlider');
const trimGapValue = document.getElementById('trimGapValue');
const trimKeepSlider = document.getElementById('trimKeepSlider');
const trimKeepValue = document.getElementById('trimKeepValue');
const separatorToggle = document.getElementById('separatorToggle');
const recentSection = document.getElementById('recentSection');
const recentList = document.getElementById('recentList');
const helpModal = document.getElementById('helpModal');
const btnCloseHelp = document.getElementById('btnCloseHelp');
const helpTrigger = document.getElementById('helpTrigger');
const btnBack = document.getElementById('btnBack');

let pdfDoc = null;
let pdfFilePath = null;
let outputDir = null;

// DPI slider
dpiSlider.addEventListener('input', () => {
  dpiValue.textContent = `${dpiSlider.value} DPI`;
});

// Width slider (percentage of source image width)
widthSlider.addEventListener('input', () => {
  widthValue.textContent = `${widthSlider.value}%`;
});

// Trim toggle → enable/disable sub-sliders + separator mutual exclusion
function updateTrimSliders() {
  const enabled = trimToggle.checked;
  trimGapSlider.disabled = !enabled;
  trimKeepSlider.disabled = !enabled;
  document.querySelectorAll('.trim-sub-row').forEach(row => {
    row.classList.toggle('disabled', !enabled);
  });
  // Separator is mutually exclusive with trim
  if (enabled) {
    separatorToggle.checked = false;
    separatorToggle.disabled = true;
  } else {
    separatorToggle.disabled = false;
  }
}
trimToggle.addEventListener('change', updateTrimSliders);
updateTrimSliders(); // initial state

// Trim gap slider
trimGapSlider.addEventListener('input', () => {
  trimGapValue.textContent = `${trimGapSlider.value} px`;
});

// Trim keep slider (percentage)
trimKeepSlider.addEventListener('input', () => {
  trimKeepValue.textContent = `${trimKeepSlider.value}%`;
});

// ── Help Modal ──────────────────────────────
helpTrigger.addEventListener('click', () => {
  helpModal.classList.remove('hidden');
});

btnCloseHelp.addEventListener('click', () => {
  helpModal.classList.add('hidden');
});

helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) {
    helpModal.classList.add('hidden');
  }
});

// ── Recent Files ──────────────────────────────
async function loadRecentFiles() {
  const files = await window.api.getRecentFiles();
  if (!files || files.length === 0) {
    recentSection.classList.add('hidden');
    return;
  }
  recentSection.classList.remove('hidden');
  recentList.innerHTML = '';

  for (const file of files) {
    const exists = await window.api.fileExists(file.filePath);
    const item = document.createElement('div');
    item.className = 'recent-item';
    if (!exists) item.style.opacity = '0.45';

    const dateStr = formatDate(file.convertedAt);

    item.innerHTML = `
      <span class="recent-item-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4A6CF7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </span>
      <div class="recent-item-info">
        <div class="recent-item-name">${escapeHtml(file.name)}</div>
        <div class="recent-item-meta">${file.pages ? file.pages + '페이지 · ' : ''}${dateStr}${!exists ? ' · 파일 없음' : ''}</div>
      </div>
      <button class="recent-item-remove" title="목록에서 제거">&times;</button>
    `;

    if (exists) {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.recent-item-remove')) return;
        handleFile(file.filePath);
      });
    }

    item.querySelector('.recent-item-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.removeRecentFile(file.filePath);
      loadRecentFiles();
    });

    recentList.appendChild(item);
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Load on startup
loadRecentFiles();

// File selection via button
btnSelectFile.addEventListener('click', async (e) => {
  e.stopPropagation();
  const filePath = await window.api.selectPdf();
  if (filePath) {
    await handleFile(filePath);
  }
});

// Drop zone click
dropZone.addEventListener('click', async () => {
  const filePath = await window.api.selectPdf();
  if (filePath) {
    await handleFile(filePath);
  }
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith('.pdf')) {
    // Electron gives us the full path via file.path
    if (file.path) {
      await handleFile(file.path);
    } else {
      await handleFileFromDrop(file);
    }
  }
});

async function handleFile(filePath) {
  pdfFilePath = filePath;
  const name = filePath.split(/[/\\]/).pop();

  try {
    const arrayBuffer = await window.api.readPdfFile(filePath);
    pdfDoc = await loadPdf(new Uint8Array(arrayBuffer));

    fileName.textContent = name;
    filePages.textContent = `${pdfDoc.numPages} 페이지`;

    showSection('preset');
  } catch (err) {
    alert(`PDF 로드 실패: ${err.message}`);
  }
}

async function handleFileFromDrop(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await loadPdf(arrayBuffer);
    pdfFilePath = file.name;

    fileName.textContent = file.name;
    filePages.textContent = `${pdfDoc.numPages} 페이지`;

    showSection('preset');
  } catch (err) {
    alert(`PDF 로드 실패: ${err.message}`);
  }
}

// Convert button
btnConvert.addEventListener('click', async () => {
  if (!pdfDoc) return;

  showSection('progress');
  await window.api.resetPipeline();

  const dpi = parseInt(dpiSlider.value) || 250;
  const widthPercent = parseInt(widthSlider.value) || 135;

  try {
    // Process each page sequentially
    let pdfPageWidthPt = null; // PDF 원본 폭(pt) — DPI 독립 표시 폭 계산용
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      progressText.textContent = `페이지 ${i}/${pdfDoc.numPages} 처리 중...`;

      const pageData = await renderPage(pdfDoc, i, pdfCanvas, dpi);

      // 첫 번째 페이지의 PDF 원본 폭을 저장
      if (i === 1) pdfPageWidthPt = pageData.pdfPageWidthPt;

      // Convert width % to actual pixel width based on source image
      const imageWidth = Math.round(pageData.pagePixelWidth * widthPercent / 100);
      // Convert display-px gap slider to source image pixels (based on output image width)
      const displayToSrc = pageData.pagePixelWidth / imageWidth;
      await window.api.processPage({
        pageIndex: i - 1,
        pngBase64: pageData.pngBase64,
        links: pageData.links,
        pagePixelWidth: pageData.pagePixelWidth,
        pagePixelHeight: pageData.pagePixelHeight,
        pdfPageWidthPt: pageData.pdfPageWidthPt,
        totalPages: pdfDoc.numPages,
        imageWidth,
        trimWhitespace: trimToggle.checked,
        trimGapSize: Math.round(parseInt(trimGapSlider.value, 10) * displayToSrc),
        trimKeepPercent: parseInt(trimKeepSlider.value, 10),
      });
    }

    // Generate output
    progressText.textContent = 'HTML 생성 중...';
    const pdfName = (pdfFilePath || 'output').split(/[/\\]/).pop().replace(/\.pdf$/i, '');
    // HTML 표시 폭은 PDF 원본 크기 × 배율(%)로 계산 (DPI 독립)
    const displayWidth = Math.round((pdfPageWidthPt || 595) * widthPercent / 100);
    const result = await window.api.generateOutput({ pdfName, separator: separatorToggle.checked, displayWidth });

    outputDir = result.outputDir;

    // Save to recent files
    const pdfNameForRecent = (pdfFilePath || 'output').split(/[/\\]/).pop();
    await window.api.addRecentFile({
      filePath: pdfFilePath,
      name: pdfNameForRecent,
      pages: result.metadata.pageCount,
    });

    // Show results
    document.getElementById('statPages').textContent = result.metadata.pageCount;
    document.getElementById('statLinks').textContent = result.metadata.linkCount;
    document.getElementById('statSize').textContent = `${result.metadata.totalSizeMB} MB`;

    const avgKB = result.metadata.pageCount > 0
      ? ((result.sizeStatus.currentBytes / 1024) / result.metadata.pageCount).toFixed(0)
      : 0;
    document.getElementById('statAvgSize').textContent = `${avgKB} KB`;

    showSection('result');
  } catch (err) {
    alert(`변환 실패: ${err.message}`);
    showSection('preset');
  }
});

// Progress updates from main process
window.api.onProgress((data) => {
  progressPercent.textContent = `${data.percent}%`;
  progressFill.style.width = `${data.percent}%`;
});

window.api.onSizeUpdate((data) => {
  sizeText.textContent = `${data.currentMB} MB / ${data.limitMB} MB`;
  sizeFill.style.width = `${data.percent}%`;

  sizeFill.classList.remove('warning', 'danger');
  if (data.level === 'danger' || data.level === 'exceeded') {
    sizeFill.classList.add('danger');
  } else if (data.level === 'warning') {
    sizeFill.classList.add('warning');
  }

  if (data.message) {
    sizeWarning.textContent = data.message;
    sizeWarning.classList.remove('hidden');
  } else {
    sizeWarning.classList.add('hidden');
  }
});

// Result actions
btnPreview.addEventListener('click', () => {
  if (outputDir) {
    window.api.openInBrowser(outputDir + '\\preview.html');
  }
});

btnOpenFolder.addEventListener('click', () => {
  if (outputDir) {
    window.api.openOutputFolder(outputDir);
  }
});

btnNewFile.addEventListener('click', () => {
  pdfDoc = null;
  pdfFilePath = null;
  outputDir = null;
  showSection('drop');
});

// Back button → return to drop zone
btnBack.addEventListener('click', () => {
  pdfDoc = null;
  pdfFilePath = null;
  outputDir = null;
  showSection('drop');
});

function showSection(section) {
  dropZone.classList.toggle('hidden', section !== 'drop');
  fileInfo.classList.toggle('hidden', section === 'drop' || section === 'result');
  presetSection.classList.toggle('hidden', section !== 'preset');
  progressSection.classList.toggle('hidden', section !== 'progress');
  resultSection.classList.toggle('hidden', section !== 'result');

  // Back button: visible on preset and result screens
  btnBack.classList.toggle('hidden', section === 'drop' || section === 'progress');

  // Show recent files only on drop screen
  if (section === 'drop') {
    loadRecentFiles();
  } else {
    recentSection.classList.add('hidden');
  }

  if (section === 'preset') {
    fileInfo.classList.remove('hidden');
  }

  if (section === 'drop') {
    // Reset progress
    progressFill.style.width = '0%';
    sizeFill.style.width = '0%';
    progressPercent.textContent = '0%';
    sizeText.textContent = '0 MB / 25 MB';
    sizeWarning.classList.add('hidden');
  }
}
