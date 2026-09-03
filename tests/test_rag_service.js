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
  assert.match(context, /Trata cada resultado como una pista/);
  assert.match(context, /antes de repetir una búsqueda similar/);
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
  assert.match(read.error, /ramas activas/);
});

test('RagService - soporta múltiples ramas activas simultáneamente', async () => {
  const { branch: b1 } = await seed();
  const b2 = await RagStorage.createBranch('Redes', 'Configuración de red');
  await RagStorage.saveDocument({
    branchId: b2.id, title: 'firewall.md', fileType: 'md',
    chunks: [
      { title: 'Puertos', content: 'El puerto 443 HTTPS y el puerto 22 SSH están abiertos.' }
    ]
  });

  const context = await RagService.buildRagSystemContext([b1.id, b2.id]);
  assert.match(context, /BASES DE CONOCIMIENTO ACTIVAS/);
  assert.match(context, /Operaciones/);
  assert.match(context, /Redes/);

  const list = await RagService.listDocuments([b1.id, b2.id]);
  assert.equal(list.count, 2);
  assert.match(list.text, /DOCUMENTOS EN Operaciones/);
  assert.match(list.text, /DOCUMENTOS EN Redes/);

  const search = await RagService.searchKnowledgeBase([b1.id, b2.id], { query: 'puerto SSH', tolerance: 0 });
  assert.ok(search.matchesCount >= 1);
  assert.match(search.text, /Rama: Redes/);
  const chunkId = search.matches[0].chunkId;

  const read = await RagService.readKnowledgeChunk([b1.id, b2.id], { chunkId });
  assert.equal(read.success, true);
  assert.match(read.content, /puerto 443/);
});

test('RagService - focaliza una fuente identificable sin contaminar con otros documentos', async () => {
  const branch = await RagStorage.createBranch('Catálogo de productos');
  const alpha = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Product_Alpha_datasheet.pdf',
    chunks: [
      { title: 'Battery', content: 'Battery runtime is twelve hours.' },
      { title: 'Charging', content: 'The battery uses a USB-C charging port.' }
    ]
  });
  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Product_Beta_datasheet.pdf',
    chunks: [{ title: 'Battery', content: 'Battery runtime is eight hours.' }]
  });

  const result = await RagService.searchKnowledgeBase(branch.id, {
    query: 'What is the battery runtime?',
    scope: 'document',
    documentHint: 'Product Alpha',
    tolerance: 0
  });

  assert.equal(result.success, true);
  assert.equal(result.requestedScope, 'document');
  assert.equal(result.appliedScope, 'document');
  assert.equal(result.selectedDocument.documentId, alpha.id);
  assert.ok(result.matches.length >= 1);
  assert.ok(result.matches.every(match => match.documentId === alpha.id));
  assert.match(result.text, /Alcance aplicado: document/);
});

test('RagService - scope auto resuelve empresa y ejercicio desde títulos FinanceBench', async () => {
  const branch = await RagStorage.createBranch('FinanceBench');
  const target = await RagStorage.saveDocument({
    branchId: branch.id,
    title: '3M_2018_10K.pdf',
    chunks: [{ title: 'Cash Flows', content: 'Purchases of property plant and equipment were 1577 million dollars.' }]
  });
  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'ADOBE_2017_10K.pdf',
    chunks: [{ title: 'Capitalization', content: 'Cash flows and capital expenditure discussion.' }]
  });

  const result = await RagService.searchKnowledgeBase(branch.id, {
    query: '3M FY2018 cash flow statement capital expenditure',
    scope: 'auto',
    documentHint: '3M',
    tolerance: 0
  });

  assert.equal(result.appliedScope, 'document');
  assert.equal(result.selectedDocument.documentId, target.id);
  assert.ok(result.matches.every(match => match.documentId === target.id));
});

test('RagService - usa corpus ante una referencia documental ambigua', async () => {
  const branch = await RagStorage.createBranch('Manuales');
  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Product_Alpha_manual.pdf',
    chunks: [{ content: 'Alpha wireless connection setup procedure.' }]
  });
  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Product_Alpha_accessories.pdf',
    chunks: [{ content: 'Alpha wireless accessories and connection options.' }]
  });

  const result = await RagService.searchKnowledgeBase(branch.id, {
    query: 'Alpha wireless connection',
    scope: 'document',
    documentHint: 'Product Alpha',
    tolerance: 0
  });

  assert.equal(result.requestedScope, 'document');
  assert.equal(result.appliedScope, 'corpus');
  assert.equal(result.selectedDocument, null);
  assert.equal(new Set(result.matches.map(match => match.documentId)).size, 2);
  assert.match(result.text, /Candidatos documentales/);
});

test('RagService - no focaliza arbitrariamente títulos idénticos', async () => {
  const branch = await RagStorage.createBranch('Duplicados');
  const duplicates = [];
  for (const content of ['First raven evidence.', 'Second raven evidence.']) {
    duplicates.push(await RagStorage.saveDocument({
      branchId: branch.id,
      title: 'Raven_2024.pdf',
      chunks: [{ content }]
    }));
  }
  for (let index = 0; index < 18; index += 1) {
    await RagStorage.saveDocument({
      branchId: branch.id,
      title: `Other_${index}.pdf`,
      chunks: [{ content: `Unrelated reference ${index}.` }]
    });
  }

  const result = await RagService.searchKnowledgeBase(branch.id, {
    query: 'Raven_2024.pdf',
    scope: 'auto',
    tolerance: 0
  });

  assert.equal(result.appliedScope, 'corpus');
  assert.equal(result.selectedDocument, null);
  assert.deepEqual(
    new Set(result.matches.map(match => match.documentId)),
    new Set(duplicates.map(document => document.id))
  );
});

test('RagService - diversifica una consulta transversal entre documentos', async () => {
  const branch = await RagStorage.createBranch('Comparador');
  const documentIds = [];
  for (const product of ['Alpha', 'Beta', 'Gamma']) {
    const document = await RagStorage.saveDocument({
      branchId: branch.id,
      title: `Product_${product}_datasheet.pdf`,
      chunks: [
        { title: 'Battery', content: `${product} battery runtime specification.` },
        { title: 'Charging', content: `${product} battery charging specification.` },
        { title: 'Power', content: `${product} battery power specification.` }
      ]
    });
    documentIds.push(document.id);
  }

  const result = await RagService.searchKnowledgeBase(branch.id, {
    query: 'Compare battery specification',
    scope: 'corpus',
    limit: 6,
    tolerance: 0
  });

  assert.equal(result.appliedScope, 'corpus');
  assert.equal(result.maxChunksPerDocument, 2);
  assert.deepEqual(new Set(result.matches.map(match => match.documentId)), new Set(documentIds));
  for (const documentId of documentIds) {
    assert.ok(result.matches.filter(match => match.documentId === documentId).length <= 2);
  }
});

test('RagService - diversidad de corpus no pierde documentos tras un resultado dominante', async () => {
  const branch = await RagStorage.createBranch('Resultados desiguales');
  const dominant = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Dominant.pdf',
    chunks: Array.from({ length: 30 }, (_, index) => ({
      title: `Battery ${index}`,
      content: `Battery specification dominant evidence ${index}.`
    }))
  });
  const secondary = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Secondary.pdf',
    chunks: [{ title: 'Battery', content: 'Battery specification secondary evidence.' }]
  });

  const result = await RagService.searchKnowledgeBase(branch.id, {
    query: 'battery specification',
    scope: 'corpus',
    limit: 4,
    tolerance: 0
  });

  const returnedIds = new Set(result.matches.map(match => match.documentId));
  assert.ok(returnedIds.has(dominant.id));
  assert.ok(returnedIds.has(secondary.id));
  assert.ok(result.matches.filter(match => match.documentId === dominant.id).length <= 2);
});
