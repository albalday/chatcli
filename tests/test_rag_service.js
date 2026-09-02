const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');
const RagIndex = require('../js/rag-index.js');
const RagService = require('../js/rag-service.js');

beforeEach(async () => { RagIndex.clearCache(); await RagStorage.clearAllData(); });

async function seed() {
  const branch = await RagStorage.createBranch('Operaciones', 'Procedimientos internos');
  const document = await RagStorage.saveDocument({
    branchId: branch.id, title: 'servidores.md', fileType: 'md',
    chunks: [
      { title: 'Despliegue', content: 'El despliegue de Kubernetes utiliza Helm y el namespace producción.' },
      { title: 'Copias', content: 'Las copias PostgreSQL se ejecutan cada noche a las 02:00.' }
    ]
  });
  return { branch, document };
}

test('RagService - inyecta solo instrucciones compactas', async () => {
  const { branch } = await seed();
  const context = await RagService.buildRagSystemContext(branch.id);
  assert.match(context, /Operaciones/);
  assert.match(context, /search_knowledge_base/);
  assert.doesNotMatch(context, /Kubernetes|PostgreSQL/);
  assert.match(await RagService.injectRagContext('Responde brevemente.', branch.id), /Responde brevemente/);
});

test('RagService - lista, busca y lee chunks', async () => {
  const { branch, document } = await seed();
  const list = await RagService.listDocuments(branch.id);
  assert.equal(list.count, 1);
  assert.equal(list.documents[0].id, document.id);

  const search = await RagService.searchKnowledgeBase(branch.id, { query: 'copias PostgreSQL', tolerance: 0 });
  assert.ok(search.matchesCount >= 1);
  assert.match(search.text, /chunkId/);
  const chunkId = search.matches[0].chunkId;
  const read = await RagService.readKnowledgeChunk(branch.id, { chunkId });
  assert.equal(read.success, true);
  assert.match(read.content, /PostgreSQL/);
});

test('RagService - valida rama, consulta y chunk', async () => {
  assert.equal((await RagService.listDocuments('')).success, false);
  assert.equal((await RagService.searchKnowledgeBase('', { query: '' })).success, false);
  assert.equal((await RagService.readKnowledgeChunk('', {})).success, false);
});

test('RagService - impide leer chunks de una rama distinta', async () => {
  const { branch } = await seed();
  const foreign = await RagStorage.createBranch('Otra rama');
  const search = await RagService.searchKnowledgeBase(branch.id, { query: 'Kubernetes', tolerance: 0 });
  const read = await RagService.readKnowledgeChunk(foreign.id, { chunkId: search.matches[0].chunkId });
  assert.equal(read.success, false);
  assert.match(read.error, /rama activa/);
});
