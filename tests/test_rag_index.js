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

test('RagIndex - busca federadamente entre múltiples ramas', async () => {
  const dev = await RagStorage.createBranch('Logs-Dispositivo-1');
  const prod = await RagStorage.createBranch('Logs-Dispositivo-2');
  await RagStorage.saveDocument({ branchId: dev.id, title: 'dev.log', chunks: [{ title: 'Error 500', content: 'Database timeout connection error on node 1' }] });
  await RagStorage.saveDocument({ branchId: prod.id, title: 'prod.log', chunks: [{ title: 'Warning', content: 'Database high memory usage warning on node 2' }] });

  const result = await RagIndex.searchBranches([dev.id, prod.id], 'database', { tolerance: 0 });
  assert.equal(result.count, 2);
  assert.equal(result.hits.length, 2);
  const branchIds = result.hits.map(h => h.branchId);
  assert.ok(branchIds.includes(dev.id));
  assert.ok(branchIds.includes(prod.id));
});
