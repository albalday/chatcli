const { test } = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../js/cookies.js');

test('Storage - Configuración por defecto', () => {
  const defaults = Storage.getDefaultConfig();
  assert.ok(defaults, 'Debe devolver un objeto de configuración');
  assert.equal(defaults.apiType, 'openai');
  assert.equal(defaults.systemPrompt, '');
  assert.equal(defaults.theme, 'light');
  assert.equal(defaults.language, 'es');
  assert.equal(defaults.enableContextCache, true);
  assert.equal(defaults.enableRawLogs, false);
});

test('Storage - Guardar y recuperar valores en memoria/storage', () => {
  Storage.setStorageItem('test_key', 'test_value');
  const val = Storage.getStorageItem('test_key');
  assert.equal(val, 'test_value');

  Storage.deleteStorageItem('test_key');
  const valDeleted = Storage.getStorageItem('test_key');
  assert.equal(valDeleted, null);
});

test('Storage - Guardar configuración completa y resetear', () => {
  Storage.saveConfig({
    apiUrl: 'http://localhost:9999/v1',
    model: 'custom-test-model',
    temperature: 0.2
  });

  const loaded = Storage.loadConfig();
  assert.equal(loaded.apiUrl, 'http://localhost:9999/v1');
  assert.equal(loaded.model, 'custom-test-model');
  assert.equal(parseFloat(loaded.temperature), 0.2);

  Storage.resetConfigToDefaults();
  const reset = Storage.loadConfig();
  assert.equal(reset.apiUrl, 'http://localhost:1234/v1');
});
