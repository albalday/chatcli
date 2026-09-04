const test = require('node:test');
const assert = require('node:assert');
const I18n = require('../js/i18n.js');

test('i18n - 100% key parity between Spanish and English', () => {
  const T = I18n.TRANSLATIONS;
  assert.ok(T.es, 'TRANSLATIONS.es should exist');
  assert.ok(T.en, 'TRANSLATIONS.en should exist');

  const esKeys = Object.keys(T.es).sort();
  const enKeys = Object.keys(T.en).sort();

  const missingInEn = esKeys.filter(k => !(k in T.en));
  const missingInEs = enKeys.filter(k => !(k in T.es));

  assert.deepStrictEqual(missingInEn, [], `Keys in ES missing in EN: ${missingInEn.join(', ')}`);
  assert.deepStrictEqual(missingInEs, [], `Keys in EN missing in ES: ${missingInEs.join(', ')}`);
  assert.strictEqual(esKeys.length, enKeys.length, 'Key counts must match exactly');
});

test('i18n - reactive onChange listener fires on setLanguage', () => {
  let callCount = 0;
  let receivedLang = null;

  const unsubscribe = I18n.onChange(lang => {
    callCount++;
    receivedLang = lang;
  });

  try {
    I18n.setLanguage('en', false);
    assert.strictEqual(callCount, 1);
    assert.strictEqual(receivedLang, 'en');
    assert.strictEqual(I18n.getLanguage(), 'en');

    // Test translation in English
    const enText = I18n.t('rag_branch_summary_format', { count: 5, plural: 's', bytes: '12 MB' });
    assert.strictEqual(enText, '5 documents of 12 MB');

    I18n.setLanguage('es', false);
    assert.strictEqual(callCount, 2);
    assert.strictEqual(receivedLang, 'es');
    assert.strictEqual(I18n.getLanguage(), 'es');

    // Test translation in Spanish
    const esText = I18n.t('rag_branch_summary_format', { count: 5, plural: 's', bytes: '12 MB' });
    assert.strictEqual(esText, '5 documentos de 12 MB');
  } finally {
    unsubscribe();
  }

  // After unsubscribe, listener should not be called
  I18n.setLanguage('en', false);
  assert.strictEqual(callCount, 2, 'Unsubscribed listener should not be called');

  // Reset to default
  I18n.setLanguage('es', false);
});
