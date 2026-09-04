const test = require('node:test');
const assert = require('node:assert/strict');
const State = require('../js/state.js');
const ChatConfig = require('../js/config-store.js');

function createFixture() {
  let persisted = null;
  const profile = {
    id: 'office', name: 'Servidor Oficina', version: 3,
    settings: {
      apiUrl: 'http://office.test/v1', apiType: 'openai', apiKey: 'secret',
      model: 'qwen-office', systemPrompt: 'Oficina', temperature: '0.2',
      reasoningEffort: 'high', enabledTools: { search_web: false },
      enableRawLogs: true, sendDateTime: false
    }
  };
  const storage = {
    loadRuntimeConfigV2: () => persisted,
    saveRuntimeConfigV2: value => { persisted = JSON.parse(JSON.stringify(value)); },
    loadConfig: () => ({ theme: 'dark', language: 'en', activeProfileName: 'Servidor Oficina', activeRagBranchIds: ['rag-a'] }),
    getActiveProfileName: () => 'Servidor Oficina'
  };
  const profiles = {
    PROFILE_FIELDS: require('../js/profile-repository.js').PROFILE_FIELDS,
    initialize: () => {},
    findByName: name => name === profile.name ? profile : null,
    get: id => id === profile.id ? profile : null
  };
  return { store: ChatConfig.createConfigStore({ state: State.createStore(), storage, profiles }), getPersisted: () => persisted };
}

test('ChatConfig - migra la configuración efectiva y registra el perfil aplicado', () => {
  const { store, getPersisted } = createFixture();
  const config = store.initialize();

  assert.equal(config.schemaVersion, 2);
  assert.equal(config.theme, 'dark');
  assert.equal(config.language, 'en');
  assert.equal(config.activeProfile.name, 'Servidor Oficina');
  assert.deepEqual(config.activeRagBranchIds, ['rag-a']);
  assert.equal(getPersisted().activeProfileName, undefined);
});

test('ChatConfig - activar perfil reemplaza campos de perfil y conserva preferencias generales', () => {
  const { store } = createFixture();
  store.initialize();
  store.updateGeneral({ theme: 'dark', activeRagBranchIds: ['rag-a', 'rag-b'] });
  const config = store.activateProfile('office');

  assert.equal(config.apiUrl, 'http://office.test/v1');
  assert.equal(config.model, 'qwen-office');
  assert.equal(config.reasoningEffort, 'high');
  assert.equal(config.enableRawLogs, true);
  assert.equal(config.theme, 'dark');
  assert.deepEqual(config.activeRagBranchIds, ['rag-a', 'rag-b']);
  assert.equal(config.activeProfile.version, 3);
});

test('ChatConfig - snapshots no permiten mutar el estado interno', () => {
  const { store } = createFixture();
  store.initialize();
  store.activateProfile('office');
  const snapshot = store.getActive();
  snapshot.enabledTools.search_web = true;
  assert.equal(store.getActive().enabledTools.search_web, false);
});
