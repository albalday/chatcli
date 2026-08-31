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

test('I18n - Traducciones de configuración de límite de contexto RAG', () => {
  I18n.setLanguage('es', false);
  assert.ok(I18n.t('rag_context_limit_title').includes('Tamaño de Contexto'));
  assert.ok(I18n.t('rag_context_limit_desc').includes('32K a 1M'));

  I18n.setLanguage('en', false);
  assert.ok(I18n.t('rag_context_limit_title').includes('Chapter Context Size'));
  assert.ok(I18n.t('rag_context_limit_desc').includes('32K to 1M'));
});

