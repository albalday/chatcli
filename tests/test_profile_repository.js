const test = require('node:test');
const assert = require('node:assert/strict');
const Profiles = require('../js/profile-repository.js');

function createStorage(legacyProfiles = {}) {
  const values = new Map();
  return {
    getStorageItem: key => values.has(key) ? values.get(key) : null,
    setStorageItem: (key, value) => values.set(key, String(value)),
    getProfiles: () => JSON.parse(JSON.stringify(legacyProfiles))
  };
}

test('ProfileRepository - migra perfiles heredados a un catálogo versionado', () => {
  const storage = createStorage({
    'Servidor Oficina': {
      apiUrl: 'http://office.test/v1', model: 'qwen', theme: 'dark',
      enabledTools: { search_web: false }
    }
  });
  const repository = Profiles.createRepository(storage);

  const profiles = repository.list();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'Servidor Oficina');
  assert.equal(profiles[0].schemaVersion, 1);
  assert.equal(profiles[0].settings.apiUrl, 'http://office.test/v1');
  assert.equal(profiles[0].settings.theme, undefined);
  assert.equal(profiles[0].settings.enabledTools.search_web, false);
});

test('ProfileRepository - guarda versiones sin exponer referencias mutables', () => {
  const repository = Profiles.createRepository(createStorage());
  const first = repository.save({ id: 'lab', name: 'Laboratorio', settings: { model: 'model-a' } });
  const second = repository.save({ id: 'lab', name: 'Laboratorio', settings: { model: 'model-b' } });

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  const loaded = repository.get('lab');
  loaded.settings.model = 'mutado';
  assert.equal(repository.get('lab').settings.model, 'model-b');
});
