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
  assert.equal(defaults.enableDebugMessages, false);
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

test('Storage - Gestión completa de perfiles (crear, listar, conmutar, actualizar y borrar)', () => {
  // 1. Obtener perfiles iniciales
  const profiles = Storage.getProfiles();
  assert.ok(profiles['Local chat']);
  assert.ok(profiles['Remoto chat']);
  assert.ok(profiles['Local resumen']);
  assert.ok(profiles['Remoto resumen']);
  assert.ok(profiles['Nuevo']);

  // 2. Guardar nuevo perfil personalizado con todos los campos
  const customProfile = {
    apiUrl: 'http://192.168.1.50:8000/v1',
    apiType: 'openai',
    apiKey: 'sk-test-secret',
    model: 'qwen2.5-coder-32b',
    systemPrompt: 'Instrucciones para perfil local remoto',
    temperature: '0.4',
    reasoningEffort: 'low',
    enableAgentJs: true,
    enableAgentWeb: false,
    enableAgentSearch: true,
    enableAgentChart: true,
    enableContextCache: true,
    enableRawLogs: true,
    enableDebugMessages: false,
    sendDateTime: true,
    ragContextLimitK: 128
  };

  Storage.saveProfile('Servidor Oficina', customProfile);

  // 3. Verificar que se ha guardado y es el activo
  const activeName = Storage.getActiveProfileName();
  assert.equal(activeName, 'Servidor Oficina');

  const retrieved = Storage.getProfile('Servidor Oficina');
  assert.equal(retrieved.apiUrl, 'http://192.168.1.50:8000/v1');
  assert.equal(retrieved.model, 'qwen2.5-coder-32b');
  assert.equal(retrieved.enableAgentWeb, false);
  assert.equal(retrieved.enableRawLogs, true);
  assert.equal(retrieved.ragContextLimitK, 128);

  // 4. Cambiar de perfil activo
  Storage.setActiveProfileName('Remoto chat');
  assert.equal(Storage.getActiveProfileName(), 'Remoto chat');

  // 5. Borrar perfil personalizado
  const deleted = Storage.deleteProfile('Servidor Oficina');
  assert.equal(deleted, true);
  assert.equal(Storage.getProfile('Servidor Oficina'), null);
});

