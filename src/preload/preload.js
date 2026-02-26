const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectPdf: () => ipcRenderer.invoke('select-pdf'),
  readPdfFile: (filePath) => ipcRenderer.invoke('read-pdf-file', filePath),
  processPage: (data) => ipcRenderer.invoke('process-page', data),
  generateOutput: (data) => ipcRenderer.invoke('generate-output', data),
  openOutputFolder: (folderPath) => ipcRenderer.invoke('open-output-folder', folderPath),
  openInBrowser: (filePath) => ipcRenderer.invoke('open-in-browser', filePath),
  resetPipeline: () => ipcRenderer.invoke('reset-pipeline'),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  addRecentFile: (fileInfo) => ipcRenderer.invoke('add-recent-file', fileInfo),
  removeRecentFile: (filePath) => ipcRenderer.invoke('remove-recent-file', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  // R2 Settings
  loadR2Settings: () => ipcRenderer.invoke('load-r2-settings'),
  saveR2Settings: (settings) => ipcRenderer.invoke('save-r2-settings', settings),
  testR2Connection: (settings) => ipcRenderer.invoke('test-r2-connection', settings),
  // Clipboard
  copyEmailHtml: (outputDir) => ipcRenderer.invoke('copy-email-html', outputDir),
  onProgress: (callback) => {
    ipcRenderer.on('progress', (_event, data) => callback(data));
  },
  onSizeUpdate: (callback) => {
    ipcRenderer.on('size-update', (_event, data) => callback(data));
  },
});
