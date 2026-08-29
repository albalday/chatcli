const test = require('node:test');
const assert = require('node:assert');
const ChatToolCards = require('../js/tool-cards.js');

test('ChatToolCards - Normalización de nombres de herramientas', () => {
  assert.equal(ChatToolCards.normalizeName('execute_javascript'), 'executejavascript');
  assert.equal(ChatToolCards.normalizeName('SEARCH_WEB'), 'searchweb');
  assert.equal(ChatToolCards.normalizeName('fetch_web_page'), 'fetchwebpage');
  assert.equal(ChatToolCards.normalizeName('download_pdf'), 'downloadpdf');
});
