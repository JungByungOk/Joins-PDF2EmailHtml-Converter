const { ipcMain, dialog, shell, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { PdfPipeline } = require('./pdf-pipeline');

let pipeline = null;

const MAX_RECENT_FILES = 5;

function getRecentFilesPath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

function loadRecentFiles() {
  try {
    const data = fs.readFileSync(getRecentFilesPath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveRecentFiles(files) {
  fs.writeFileSync(getRecentFilesPath(), JSON.stringify(files, null, 2), 'utf-8');
}

function registerIpcHandlers(mainWindow) {
  pipeline = new PdfPipeline(mainWindow);

  ipcMain.handle('select-pdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'PDF 파일 선택',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('read-pdf-file', async (_event, filePath) => {
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  ipcMain.handle('process-page', async (_event, data) => {
    return pipeline.processPage(data);
  });

  ipcMain.handle('generate-output', async (_event, data) => {
    return pipeline.generateOutput(data.pdfName, { separator: data.separator, displayWidth: data.displayWidth });
  });

  ipcMain.handle('reset-pipeline', async () => {
    pipeline.reset();
    return true;
  });

  ipcMain.handle('open-output-folder', async (_event, folderPath) => {
    await shell.openPath(folderPath);
  });

  ipcMain.handle('open-in-browser', async (_event, filePath) => {
    await shell.openPath(path.resolve(filePath));
  });

  // Recent files
  ipcMain.handle('get-recent-files', async () => {
    return loadRecentFiles();
  });

  ipcMain.handle('add-recent-file', async (_event, fileInfo) => {
    const files = loadRecentFiles();
    // Remove if already exists (to move it to top)
    const filtered = files.filter(f => f.filePath !== fileInfo.filePath);
    // Add to beginning
    filtered.unshift({
      filePath: fileInfo.filePath,
      name: fileInfo.name,
      pages: fileInfo.pages,
      convertedAt: new Date().toISOString(),
    });
    // Keep only max
    const trimmed = filtered.slice(0, MAX_RECENT_FILES);
    saveRecentFiles(trimmed);
    return trimmed;
  });

  ipcMain.handle('remove-recent-file', async (_event, filePath) => {
    const files = loadRecentFiles();
    const filtered = files.filter(f => f.filePath !== filePath);
    saveRecentFiles(filtered);
    return filtered;
  });

  ipcMain.handle('file-exists', async (_event, filePath) => {
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = { registerIpcHandlers };
