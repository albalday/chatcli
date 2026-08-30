const test = require("node:test");
const assert = require("node:assert/strict");
const ChatFileSystem = require("../js/file-system.js");
const RagStorage = require("../js/ragStorage.js");
const { createMockDirectoryHandle } = require("./mock_file_system_handle.js");

test("RAG FileSystem Structure - Creación de rama y archivo rama.md", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch(
    "Manuales de Hardware",
    "Colección de manuales y diagramas para placas base."
  );

  // 1. Verificar que existe la carpeta RAG/<branch.id>
  const branchDirExists = await ChatFileSystem.exists(`RAG/${branch.id}`);
  assert.equal(branchDirExists.exists, true);
  assert.equal(branchDirExists.kind, "directory");

  // 2. Verificar que existe RAG/<branch.id>/rama.md
  const ramaMdExists = await ChatFileSystem.exists(`RAG/${branch.id}/rama.md`);
  assert.equal(ramaMdExists.exists, true);
  assert.equal(ramaMdExists.kind, "file");

  // 3. Verificar contenido de rama.md (frontmatter + body)
  const ramaContent = await ChatFileSystem.readFile(`RAG/${branch.id}/rama.md`, "text");
  assert.ok(ramaContent.startsWith("---"));
  assert.ok(ramaContent.includes(`id: "${branch.id}"`));
  assert.ok(ramaContent.includes(`name: "Manuales de Hardware"`));
  assert.ok(ramaContent.includes("# Rama: Manuales de Hardware"));
  assert.ok(ramaContent.includes("Colección de manuales y diagramas para placas base."));
});

test("RAG FileSystem Structure - Guardado de documento original y archivo .md con resúmenes y diagramas", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch("Placas Base");
  const rawPdfBuffer = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]); // %PDF-1.7

  const doc = await RagStorage.saveDocument({
    branchId: branch.id,
    title: "mb_manual_ga-z77p-d3.pdf",
    fileType: "pdf",
    fileSize: rawPdfBuffer.byteLength,
    globalSummary: "Manual técnico de la placa GA-Z77P-D3 con diagramas y conectores.",
    chapters: [
      {
        chapterId: 1,
        title: "Instalación de Componentes",
        summary: "Guía de instalación de CPU y RAM.",
        content: "Paso 1: Colocar la CPU en el socket LGA1155.\n![Esquema frontal #img_87_0](data:image/jpeg;base64,abc)"
      }
    ]
  }, rawPdfBuffer);

  // 1. Verificar archivo binario original en 0001/mb_manual_ga-z77p-d3.pdf
  const origPath = `RAG/${branch.id}/0001/mb_manual_ga-z77p-d3.pdf`;
  const origExists = await ChatFileSystem.exists(origPath);
  assert.equal(origExists.exists, true);
  assert.equal(origExists.kind, "file");

  const readOrig = await ChatFileSystem.readFile(origPath, "uint8Array");
  assert.deepEqual(Array.from(readOrig), [37, 80, 68, 70, 45, 49, 46, 55]);

  // 2. Verificar archivo de resumen en 0001/mb_manual_ga-z77p-d3.md
  const mdPath = `RAG/${branch.id}/0001/mb_manual_ga-z77p-d3.md`;
  const mdExists = await ChatFileSystem.exists(mdPath);
  assert.equal(mdExists.exists, true);

  const mdContent = await ChatFileSystem.readFile(mdPath, "text");
  assert.ok(mdContent.includes(`id: "${doc.id}"`));
  assert.ok(mdContent.includes(`originalFilename: "mb_manual_ga-z77p-d3.pdf"`));
  assert.ok(mdContent.includes("# Resumen General del Documento"));
  assert.ok(mdContent.includes("Manual técnico de la placa GA-Z77P-D3"));
  assert.ok(mdContent.includes("### Capítulo 1: Instalación de Componentes"));
  assert.ok(mdContent.includes("**Resumen**: Guía de instalación de CPU y RAM."));
  assert.ok(mdContent.includes("## Índice de Imágenes y Diagramas"));
});

test("RAG FileSystem Structure - Paginación en subdirectorios 0001, 0002 cuando hay más de 100 archivos", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch("Documentos Masivos");

  // Crear 100 documentos en la rama
  for (let i = 1; i <= 100; i++) {
    await RagStorage.saveDocument({
      branchId: branch.id,
      title: `doc_${String(i).padStart(3, "0")}.txt`,
      fileType: "txt",
      fileSize: 100,
      globalSummary: `Resumen del doc ${i}`,
      chapters: [{ chapterId: 1, title: "Inicio", summary: "Sum", content: "Cont" }]
    });
  }

  // Verificar que el doc 100 está en 0001/
  const doc100Exists = await ChatFileSystem.exists(`RAG/${branch.id}/0001/doc_100.md`);
  assert.equal(doc100Exists.exists, true);

  // Guardar el documento 101
  const doc101 = await RagStorage.saveDocument({
    branchId: branch.id,
    title: "doc_101.txt",
    fileType: "txt",
    fileSize: 100,
    globalSummary: "Resumen del doc 101",
    chapters: [{ chapterId: 1, title: "Inicio", summary: "Sum", content: "Cont" }]
  });

  // Verificar que el doc 101 se guardó en 0002/
  assert.equal(doc101.bucket, "0002");
  const doc101Exists = await ChatFileSystem.exists(`RAG/${branch.id}/0002/doc_101.md`);
  assert.equal(doc101Exists.exists, true);

  // Verificar que getDocumentsByBranch recupera los 101 documentos a través de todos los buckets
  const allDocs = await RagStorage.getDocumentsByBranch(branch.id);
  assert.equal(allDocs.length, 101);
});
