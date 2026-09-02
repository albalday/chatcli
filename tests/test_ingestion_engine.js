const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');
const RagIndex = require('../js/rag-index.js');
const Ingestion = require('../js/ingestionEngine.js');

beforeEach(async () => {
  RagIndex.clearCache();
  await RagStorage.clearAllData();
});

test('IngestionEngine - normaliza y lee texto sin LLM', async () => {
  assert.equal(Ingestion.normalizeExtractedText(' hola\r\n\0mundo '), 'hola\nmundo');
  assert.equal(await Ingestion.extractTextFromPlainText({ content: '# Guía\nTexto' }), '# Guía\nTexto');
  assert.equal(Ingestion.detectFileType({ name: 'manual.PDF' }), 'pdf');
  assert.equal(Ingestion.detectFileType({ name: 'notas.md' }), 'md');
  assert.equal(Ingestion.detectFileType({ name: 'imagen.png', type: 'image/png' }), null);
});

test('IngestionEngine - genera chunks acotados con solapamiento y títulos', () => {
  const sectionA = '# Instalación\n\n' + 'Configuración inicial. '.repeat(90);
  const sectionB = '# Seguridad\n\n' + 'Autenticación multifactor. '.repeat(90);
  const chunks = Ingestion.partitionTextIntoChunks(`${sectionA}\n\n${sectionB}`, { maxChars: 1200, overlapChars: 120 });
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].title, 'Instalación');
  assert.ok(chunks.every(chunk => chunk.content.length <= 1320));
  assert.ok(chunks[1].content.includes(chunks[0].content.slice(-40).trim()));
});

test('IngestionEngine - conserva rangos de página', () => {
  const text = '--- Página 2 ---\nInicio\n\n' + 'dato '.repeat(250) + '\n\n--- Página 3 ---\nFinal';
  const chunks = Ingestion.partitionTextIntoChunks(text, { maxChars: 1100, overlapChars: 0 });
  assert.equal(chunks[0].pageStart, 2);
  assert.ok(chunks.some(chunk => chunk.pageEnd === 3));
});

test('IngestionEngine - procesa cola, persiste e indexa sin cliente LLM', async () => {
  const branch = await RagStorage.createBranch('Pruebas');
  const progress = [];
  const result = await Ingestion.processDocumentQueue([
    { name: 'uno.md', type: 'text/markdown', content: '# Redes\nProtocolo BGP para enrutamiento.', size: 38 },
    { name: 'vacio.txt', content: '' },
    { name: 'imagen.png', type: 'image/png', content: 'no indexar' }
  ], branch.id, event => progress.push(event), { maxChars: 2000 });
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 2);
  assert.equal((await RagStorage.getDocumentsByBranch(branch.id)).length, 1);
  assert.ok(progress.some(event => event.status === 'chunking'));
  assert.ok(progress.every(event => event.percent >= 0 && event.percent <= 100));
  const found = await RagIndex.searchBranch(branch.id, 'BGP', { tolerance: 0 });
  assert.equal(found.hits[0].documentTitle, 'uno.md');
});
