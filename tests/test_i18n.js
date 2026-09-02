const { test } = require('node:test');
const assert = require('node:assert/strict');
const I18n = require('../js/i18n.js');

test('I18n - Traducción básica y fallback', () => {
  assert.ok(I18n.TRANSLATIONS.es, 'Debe existir diccionario español');
  assert.ok(I18n.TRANSLATIONS.en, 'Debe existir diccionario inglés');
  
  const esKeys = Object.keys(I18n.TRANSLATIONS.es);
  const enKeys = Object.keys(I18n.TRANSLATIONS.en);
  
  // Comprobar paridad de claves entre idiomas
  const missingInEn = esKeys.filter(k => !(k in I18n.TRANSLATIONS.en));
  const missingInEs = enKeys.filter(k => !(k in I18n.TRANSLATIONS.es));
  
  assert.deepEqual(missingInEn, [], 'No deben faltar claves en el diccionario en');
  assert.deepEqual(missingInEs, [], 'No deben faltar claves en el diccionario es');
});

test('I18n - Reemplazo dinámico de parámetros en t()', () => {
  const t = I18n.t;
  const msg = t('field_temperature', { val: '0.85' });
  assert.match(msg, /0\.85/);
});

test('I18n - Traducciones del conocimiento local', () => {
  I18n.setLanguage('es', false);
  assert.equal(I18n.t('rag_modal_title'), 'Conocimiento local');
  assert.ok(I18n.t('rag_help_storage_desc').includes('IndexedDB'));

  I18n.setLanguage('en', false);
  assert.equal(I18n.t('rag_modal_title'), 'Local knowledge');
  assert.ok(I18n.t('rag_help_storage_desc').includes('Orama'));
});
