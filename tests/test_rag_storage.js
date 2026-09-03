const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');

beforeEach(async () => RagStorage.clearAllData());

test('RagStorage - usa el esquema RAG unificado de ZeroChatDB', () => {
  assert.equal(RagStorage.DB_NAME, 'ZeroChatDB');
  assert.equal(RagStorage.DB_VERSION, 3);
  assert.equal(RagStorage.STORE_BRANCHES, 'rag_branches');
  assert.equal(RagStorage.STORE_DOCUMENTS, 'rag_documents');
  assert.equal(RagStorage.STORE_FILES, 'rag_files');
  assert.equal(RagStorage.STORE_CHUNKS, 'rag_chunks');
});

test('RagStorage - CRUD de ramas', async () => {
  const created = await RagStorage.createBranch('Manuales', 'Documentación técnica');
  assert.equal(created.language, 'spanish');
  assert.equal((await RagStorage.getBranches()).length, 1);
  assert.equal((await RagStorage.getBranchById(created.id)).name, 'Manuales');

  const updated = await RagStorage.updateBranch(created.id, { name: 'Guías' });
  assert.equal(updated.name, 'Guías');
  assert.equal(updated.description, 'Documentación técnica');
});

test('RagStorage - guarda metadatos, archivo original y chunks por separado', async () => {
  const branch = await RagStorage.createBranch('Arquitectura');
  const source = new Uint8Array([37, 80, 68, 70]);
  const document = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'manual.pdf',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    fileSize: source.byteLength,
    chunks: [
      { title: 'CPU', content: 'Instalación del procesador LGA1155.', pageStart: 1, pageEnd: 2 },
      { title: 'RAM', content: 'Configuración de memoria DDR3.', pageStart: 3, pageEnd: 3 }
    ]
  }, source);

  const stored = await RagStorage.getDocumentById(document.id);
  assert.equal(stored.chunkCount, 2);
  assert.equal(stored.imageCount, 0);
  assert.equal(stored.chunks, undefined);
  assert.deepEqual(await RagStorage.getSourceFile(document.id), source);

  const chunks = await RagStorage.getChunksByDocument(document.id);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].id, `${document.id}:chunk:0`);
  assert.equal(chunks[1].content, 'Configuración de memoria DDR3.');
  assert.equal((await RagStorage.getChunksByBranch(branch.id)).length, 2);
});

test('RagStorage - guarda el número de imágenes como metadato del documento', async () => {
  const branch = await RagStorage.createBranch('Imágenes');
  const document = await RagStorage.saveDocument({
    branchId: branch.id, title: 'informe.pdf', fileType: 'pdf', chunks: [{ content: 'Informe con gráfico.' }]
  }, null, [{ id: 'img_1' }, { id: 'img_2' }]);

  assert.equal(document.imageCount, 2);
  assert.equal((await RagStorage.getDocumentById(document.id)).imageCount, 2);
});

test('RagStorage - elimina documentos y ramas en cascada', async () => {
  const branch = await RagStorage.createBranch('Temporal');
  const first = await RagStorage.saveDocument({
    branchId: branch.id, title: 'uno.txt', fileType: 'txt', chunks: [{ content: 'Uno' }]
  }, 'Uno');
  await RagStorage.saveDocument({
    branchId: branch.id, title: 'dos.txt', fileType: 'txt', chunks: [{ content: 'Dos' }]
  }, 'Dos');

  assert.equal(await RagStorage.deleteDocument(first.id), true);
  assert.equal(await RagStorage.getChunkById(`${first.id}:chunk:0`), null);
  const result = await RagStorage.deleteBranch(branch.id);
  assert.equal(result.deletedDocumentsCount, 1);
  assert.equal((await RagStorage.getDocumentsByBranch(branch.id)).length, 0);
  assert.equal((await RagStorage.getChunksByBranch(branch.id)).length, 0);
});

test('RagStorage - valida entradas y expone estimación de cuota', async () => {
  await assert.rejects(() => RagStorage.createBranch(''), RagStorage.ValidationError);
  await assert.rejects(() => RagStorage.saveDocument({ title: 'sin-rama.txt' }), RagStorage.ValidationError);
  const estimate = await RagStorage.getStorageEstimate();
  assert.equal(typeof estimate.usage, 'number');
  assert.equal(typeof estimate.usagePercent, 'string');
});

test('RagStorage - exporta e importa únicamente el formato actual', async () => {
  const branch = await RagStorage.createBranch('Respaldo', 'Copia portable');
  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'notas.txt',
    fileType: 'txt',
    mimeType: 'text/plain',
    fileSize: 5,
    chunks: [{ title: 'Nota', content: 'cinco' }]
  }, 'cinco');

  const backup = await RagStorage.exportBranch(branch.id);
  assert.equal(backup.schema, 'zerochat-knowledge');
  assert.equal(backup.version, 1);
  assert.equal(backup.documents[0].source.base64, 'Y2luY28=');

  await RagStorage.clearAllData();
  const restoredBranch = await RagStorage.importBranch(JSON.stringify(backup));
  const restoredDocuments = await RagStorage.getDocumentsByBranch(restoredBranch.id);
  assert.equal(restoredBranch.name, 'Respaldo');
  assert.equal(restoredDocuments.length, 1);
  assert.equal((await RagStorage.getChunksByDocument(restoredDocuments[0].id))[0].content, 'cinco');
  assert.equal(await (await RagStorage.getSourceFile(restoredDocuments[0].id)).text(), 'cinco');

  await assert.rejects(
    () => RagStorage.importBranch({ schema: 'unsupported-format', version: 99, branch: {}, documents: [] }),
    RagStorage.ValidationError
  );
});

test('RagStorage - getChunkById resuelve alias comunes generados por LLMs (docId#0, docId:0)', async () => {
  const branch = await RagStorage.createBranch('AliasTest');
  const doc = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'doc.txt',
    fileType: 'txt',
    chunks: [
      { order: 0, title: 'Sección 0', content: 'Contenido sección 0' },
      { order: 1, title: 'Sección 1', content: 'Contenido sección 1' }
    ]
  }, 'doc');

  // Consulta por ID canónico
  const c0 = await RagStorage.getChunkById(`${doc.id}:chunk:0`);
  assert.equal(c0.content, 'Contenido sección 0');

  // Consulta por alias con almohadilla: doc_id#0
  const c0Hash = await RagStorage.getChunkById(`${doc.id}#0`);
  assert.ok(c0Hash);
  assert.equal(c0Hash.content, 'Contenido sección 0');

  // Consulta por alias doc_id#1
  const c1Hash = await RagStorage.getChunkById(`${doc.id}#1`);
  assert.ok(c1Hash);
  assert.equal(c1Hash.content, 'Contenido sección 1');

  // Consulta pasando directamente el documentId
  const cDoc = await RagStorage.getChunkById(doc.id);
  assert.ok(cDoc);
  assert.equal(cDoc.content, 'Contenido sección 0');
});
