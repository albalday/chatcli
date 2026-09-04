/**
 * Versioned repository for editable connection profiles.
 * Runtime consumers must use ChatConfig instead of reading this repository.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./cookies.js'));
  } else {
    root.ChatProfileRepository = factory(root.ChatStorage);
  }
}(typeof self !== 'undefined' ? self : this, function (Storage) {
  'use strict';

  const STORAGE_KEY = 'profiles_v1';
  const SCHEMA_VERSION = 1;
  const PROFILE_FIELDS = Object.freeze([
    'apiUrl', 'apiType', 'apiKey', 'model', 'systemPrompt', 'temperature',
    'reasoningEffort', 'modelReasoningConfig', 'enabledTools',
    'enableRawLogs', 'sendDateTime'
  ]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createId(name) {
    return `legacy:${encodeURIComponent(String(name || '').trim())}`;
  }

  function normalizeSettings(source = {}) {
    const settings = {};
    PROFILE_FIELDS.forEach(key => {
      if (source[key] !== undefined) settings[key] = clone(source[key]);
    });
    return settings;
  }

  function normalizeRecord(record = {}) {
    const name = String(record.name || '').trim();
    if (!name) throw new Error('El nombre del perfil no puede estar vacío.');
    return {
      id: String(record.id || createId(name)),
      name,
      schemaVersion: SCHEMA_VERSION,
      version: Number.isInteger(record.version) && record.version > 0 ? record.version : 1,
      updatedAt: Number(record.updatedAt) || Date.now(),
      settings: normalizeSettings(record.settings || record)
    };
  }

  function createRepository(storage = Storage) {
    function readDocument() {
      const raw = storage?.getStorageItem ? storage.getStorageItem(STORAGE_KEY) : null;
      if (!raw) return null;
      try {
        const doc = JSON.parse(raw);
        if (!doc || doc.schemaVersion !== SCHEMA_VERSION || !Array.isArray(doc.profiles)) return null;
        return {
          schemaVersion: SCHEMA_VERSION,
          profiles: doc.profiles.map(normalizeRecord)
        };
      } catch (_) {
        return null;
      }
    }

    function writeDocument(document) {
      if (!storage?.setStorageItem) throw new Error('El almacenamiento de perfiles no está disponible.');
      storage.setStorageItem(STORAGE_KEY, JSON.stringify(document));
    }

    function initialize() {
      const existing = readDocument();
      if (existing) return clone(existing);

      const legacyProfiles = storage?.getProfiles ? storage.getProfiles() : {};
      const profiles = Object.keys(legacyProfiles || {}).map(name => normalizeRecord({
        id: createId(name), name, settings: legacyProfiles[name], version: 1
      }));
      const document = { schemaVersion: SCHEMA_VERSION, profiles };
      writeDocument(document);
      return clone(document);
    }

    function list() {
      return initialize().profiles;
    }

    function get(id) {
      const cleanId = String(id || '');
      return list().find(profile => profile.id === cleanId) || null;
    }

    function findByName(name) {
      const cleanName = String(name || '').trim();
      return list().find(profile => profile.name === cleanName) || null;
    }

    function save(record) {
      const current = initialize();
      const normalized = normalizeRecord(record);
      const index = current.profiles.findIndex(profile => profile.id === normalized.id);
      if (index >= 0) {
        normalized.version = current.profiles[index].version + 1;
      }
      normalized.updatedAt = Date.now();
      if (index >= 0) current.profiles[index] = normalized;
      else current.profiles.push(normalized);
      writeDocument(current);
      return clone(normalized);
    }

    function remove(id) {
      const current = initialize();
      const index = current.profiles.findIndex(profile => profile.id === String(id || ''));
      if (index < 0) return false;
      current.profiles.splice(index, 1);
      writeDocument(current);
      return true;
    }

    return { initialize, list, get, findByName, save, remove };
  }

  const defaultRepository = createRepository();
  return { STORAGE_KEY, SCHEMA_VERSION, PROFILE_FIELDS, createRepository, ...defaultRepository };
}));
