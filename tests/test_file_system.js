const test = require("node:test");
const assert = require("node:assert");
const ChatFileSystem = require("../js/file-system.js");
const { createMockDirectoryHandle } = require("./mock_file_system_handle.js");

test("ChatFileSystem - Inicialización y vinculación de root handle", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);
  const isConfig = await ChatFileSystem.isConfigured();
  assert.strictEqual(isConfig, true, "Debe estar configurado con root handle");
});

test("ChatFileSystem - Normalización y utilidades de rutas", () => {
  assert.strictEqual(ChatFileSystem.normalizePath("foo/bar/"), "foo/bar");
  assert.strictEqual(ChatFileSystem.normalizePath("/foo//bar///baz/"), "foo/bar/baz");
  assert.strictEqual(ChatFileSystem.normalizePath("foo/../bar"), "bar");
  assert.strictEqual(ChatFileSystem.normalizePath("foo/./bar/./baz"), "foo/bar/baz");
  assert.strictEqual(ChatFileSystem.normalizePath(""), "");
  assert.strictEqual(ChatFileSystem.getParentPath("a/b/c.json"), "a/b");
  assert.strictEqual(ChatFileSystem.getParentPath("file.txt"), "");
  assert.strictEqual(ChatFileSystem.getBaseName("a/b/c.json"), "c.json");
});

test("ChatFileSystem - Creación recursiva de directorios", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);

  await ChatFileSystem.createDirectory("chats/2026/archive");
  
  const ex = await ChatFileSystem.exists("chats/2026/archive");
  assert.strictEqual(ex.exists, true);
  assert.strictEqual(ex.kind, "directory");

  const exParent = await ChatFileSystem.exists("chats/2026");
  assert.strictEqual(exParent.exists, true);
  assert.strictEqual(exParent.kind, "directory");
});

test("ChatFileSystem - Escritura y lectura de archivos de texto y JSON", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);

  // 1. Texto plano
  const textRes = await ChatFileSystem.writeFile("docs/nota.txt", "Hola ZeroChat");
  assert.strictEqual(textRes.success, true);
  assert.ok(textRes.size > 0);

  const readText = await ChatFileSystem.readFile("docs/nota.txt", "text");
  assert.strictEqual(readText, "Hola ZeroChat");

  // 2. Objeto JSON
  const chatData = {
    id: "chat_001",
    title: "Conversación de prueba",
    messages: [
      { role: "user", content: "¿Cómo estás?" },
      { role: "assistant", content: "¡Excelente!" }
    ]
  };
  await ChatFileSystem.writeFile("chats/chat_001.json", chatData);
  const readJson = await ChatFileSystem.readFile("chats/chat_001.json", "json");
  assert.deepStrictEqual(readJson, chatData);
});

test("ChatFileSystem - Escritura y lectura de datos binarios (Uint8Array y ArrayBuffer)", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);

  const binaryData = new Uint8Array([10, 20, 30, 40, 50, 255]);
  await ChatFileSystem.writeFile("bin/data.dat", binaryData);

  const readU8 = await ChatFileSystem.readFile("bin/data.dat", "uint8Array");
  assert.ok(readU8 instanceof Uint8Array);
  assert.deepStrictEqual(Array.from(readU8), [10, 20, 30, 40, 50, 255]);

  const readAB = await ChatFileSystem.readFile("bin/data.dat", "arrayBuffer");
  assert.ok(readAB instanceof ArrayBuffer);
  assert.strictEqual(readAB.byteLength, 6);
});

test("ChatFileSystem - Listado de directorios y metadatos", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);

  await ChatFileSystem.writeFile("proyecto/a.txt", "Archivo A");
  await ChatFileSystem.writeFile("proyecto/b.txt", "Archivo B");
  await ChatFileSystem.writeFile("proyecto/sub/c.txt", "Archivo C");

  // Listado directo
  const directList = await ChatFileSystem.listDirectory("proyecto", { recursive: false });
  const names = directList.map(e => e.name).sort();
  assert.ok(names.includes("a.txt"));
  assert.ok(names.includes("b.txt"));
  assert.ok(names.includes("sub"));

  // Listado recursivo
  const recList = await ChatFileSystem.listDirectory("proyecto", { recursive: true });
  const recPaths = recList.map(e => e.path).sort();
  assert.ok(recPaths.includes("proyecto/a.txt"));
  assert.ok(recPaths.includes("proyecto/sub/c.txt"));

  // Metadatos
  const stats = await ChatFileSystem.getFileStats("proyecto/a.txt");
  assert.strictEqual(stats.name, "a.txt");
  assert.strictEqual(stats.kind, "file");
  assert.strictEqual(stats.size, 9);
  assert.ok(stats.lastModified > 0);
});

test("ChatFileSystem - Eliminación de archivos y directorios recursivos", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);

  await ChatFileSystem.writeFile("temp/f1.txt", "Contenido 1");
  await ChatFileSystem.writeFile("temp/sub/f2.txt", "Contenido 2");

  // Borrar archivo
  await ChatFileSystem.deleteFile("temp/f1.txt");
  const exF1 = await ChatFileSystem.exists("temp/f1.txt");
  assert.strictEqual(exF1.exists, false);

  // Borrar directorio recursivo
  await ChatFileSystem.deleteDirectory("temp", { recursive: true });
  const exTemp = await ChatFileSystem.exists("temp");
  assert.strictEqual(exTemp.exists, false);
});

test("ChatFileSystem - Manejo de errores y archivos inexistentes", async () => {
  const mockRoot = createMockDirectoryHandle("zerochat");
  await ChatFileSystem.setRootDirectoryHandle(mockRoot);

  await assert.rejects(
    async () => {
      await ChatFileSystem.readFile("no_existe.txt");
    },
    { name: "NotFoundError" }
  );

  await assert.rejects(
    async () => {
      await ChatFileSystem.deleteFile("no_existe_tampoco.txt");
    },
    { name: "NotFoundError" }
  );
});
