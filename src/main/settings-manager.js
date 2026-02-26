const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function loadSettings() {
  try {
    const data = await fs.promises.readFile(getSettingsPath(), 'utf-8');
    const settings = JSON.parse(data);
    // Decrypt secret key if encrypted
    if (settings.r2 && settings.r2._encSecret && safeStorage.isEncryptionAvailable()) {
      try {
        settings.r2.secretAccessKey = safeStorage.decryptString(
          Buffer.from(settings.r2._encSecret, 'base64')
        );
      } catch { /* decryption failed, leave empty */ }
      delete settings.r2._encSecret;
    }
    return settings;
  } catch {
    return {};
  }
}

async function saveSettings(settings) {
  const toSave = JSON.parse(JSON.stringify(settings));
  // Encrypt secret key before saving
  if (toSave.r2 && toSave.r2.secretAccessKey && safeStorage.isEncryptionAvailable()) {
    toSave.r2._encSecret = safeStorage.encryptString(toSave.r2.secretAccessKey).toString('base64');
    delete toSave.r2.secretAccessKey;
  }
  await fs.promises.writeFile(getSettingsPath(), JSON.stringify(toSave, null, 2), 'utf-8');
}

async function loadR2Settings() {
  const settings = await loadSettings();
  return settings.r2 || null;
}

async function saveR2Settings(r2Settings) {
  const settings = await loadSettings();
  settings.r2 = r2Settings;
  await saveSettings(settings);
}

module.exports = { loadR2Settings, saveR2Settings };
