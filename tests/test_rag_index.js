const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');
const RagIndex = require('../js/rag-index.js');

beforeEach(async () => {
  RagIndex.clearCache();
  await RagStorage.clearAllData();
});

test('RagIndex - indexa y busca chunks con Orama', async () => {
  const branch = await RagStorage.createBranch('Hardware');
  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'placa-base.md',
    fileType: 'md',
    chunks: [
      { title: 'Memoria', content: 'La placa admite memoria DDR3 a 1600 MHz.' },
      { title: 'Procesador', content: 'El socket LGA1155 acepta procesadores Intel.' }
    ]
  });

  const result = await RagIndex.searchBranch(branch.id, 'memoria DDR3', { tolerance: 0 });
  assert.ok(result.count >= 1);
  assert.equal(result.hits[0].documentTitle, 'placa-base.md');
  assert.equal(result.hits[0].sectionTitle, 'Memoria');
});

test('RagIndex - aísla ramas y reconstruye tras invalidar', async () => {
  const first = await RagStorage.createBranch('Primera');
  const second = await RagStorage.createBranch('Segunda');
  await RagStorage.saveDocument({ branchId: first.id, title: 'uno.txt', chunks: [{ content: 'kubernetes ingress controller' }] });
  await RagStorage.saveDocument({ branchId: second.id, title: 'dos.txt', chunks: [{ content: 'receta de paella valenciana' }] });

  assert.equal((await RagIndex.searchBranch(first.id, 'paella', { tolerance: 0 })).count, 0);
  RagIndex.invalidateBranch(second.id);
  assert.equal((await RagIndex.searchBranch(second.id, 'paella', { tolerance: 0 })).hits[0].documentTitle, 'dos.txt');
});
