const { test } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');
const ChatService = require('../js/chatService.js');
const AgentCore = require('../js/agent-core.js');

test('ChatService - READ_CHAPTER_TOOL_DEFINITION cumple con la especificación de OpenAI Tool Calling', () => {
  const def = ChatService.READ_CHAPTER_TOOL_DEFINITION;
  assert.equal(def.type, 'function');
  assert.equal(def.function.name, 'read_chapter_content');
  assert.ok(def.function.description);
  assert.equal(def.function.parameters.type, 'object');
  assert.ok(def.function.parameters.properties.docId);
  assert.ok(def.function.parameters.properties.chapterId);
  assert.deepEqual(def.function.parameters.required, ['docId', 'chapterId']);
});

test('ChatService - buildTreeRagSystemContext genera el bloque jerárquico compacto', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Normativas IT', 'Guías de arquitectura y seguridad');

  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Seguridad_2026.pdf',
    fileType: 'pdf',
    fileSize: 2048,
    globalSummary: 'Resumen global de políticas de seguridad para el año 2026.',
    chapters: [
      {
        chapterId: 1,
        title: 'MFA y Contraseñas',
        summary: 'Obligatoriedad de doble factor de autenticación.',
        content: 'Todos los usuarios deben configurar TOTP o llave FIDO2.'
      },
      {
        chapterId: 2,
        title: 'Gestión de Secretos',
        summary: 'Rotación automática de API Keys cada 90 días.',
        content: 'Las API Keys deben almacenarse en Vault.'
      }
    ]
  });

  const contextBlock = await ChatService.buildTreeRagSystemContext(branch.id);

  assert.ok(contextBlock.includes('[BASE DE CONOCIMIENTO ACTIVA: Normativas IT]'));
  assert.ok(contextBlock.includes('read_chapter_content'));
  assert.ok(contextBlock.includes('- Documento: "Seguridad_2026.pdf"'));
  assert.ok(contextBlock.includes('Resumen Global: Resumen global de políticas de seguridad'));
  assert.ok(contextBlock.includes('Cap ID [1]: "MFA y Contraseñas" -> Obligatoriedad de doble factor'));
  assert.ok(contextBlock.includes('Cap ID [2]: "Gestión de Secretos" -> Rotación automática'));
});

test('ChatService - injectTreeRagContext prefija el contexto al System Prompt existente', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Proyecto Finanzas');
  await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Presupuesto.md',
    fileType: 'md',
    fileSize: 500,
    globalSummary: 'Resumen financiero anual.',
    chapters: [
      { chapterId: 1, title: 'Gastos Q1', summary: 'Detalle de gastos.', content: 'Gastos Q1: 10.000€' }
    ]
  });

  const basePrompt = 'Eres un asistente contable servicial.';
  const enrichedPrompt = await ChatService.injectTreeRagContext(basePrompt, branch.id);

  assert.ok(enrichedPrompt.startsWith('[BASE DE CONOCIMIENTO ACTIVA: Proyecto Finanzas]'));
  assert.ok(enrichedPrompt.endsWith('Eres un asistente contable servicial.'));
});

test('ChatService - resolveChapterToolCall recupera el contenido exacto desde IndexedDB', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Rama Pruebas');
  const doc = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Manual_DevOps.txt',
    fileType: 'txt',
    fileSize: 800,
    globalSummary: 'Manual de operaciones.',
    chapters: [
      {
        chapterId: 10,
        title: 'Despliegues con Kubernetes',
        summary: 'Comandos kubectl para aplicar manifiestos.',
        content: 'Comando exacto: kubectl apply -f deployment.yaml'
      }
    ]
  });

  // 1. Resolución exitosa
  const result = await ChatService.resolveChapterToolCall({ docId: doc.id, chapterId: 10 });
  assert.equal(result.success, true);
  assert.equal(result.docId, doc.id);
  assert.equal(result.chapterId, 10);
  assert.equal(result.content, 'Comando exacto: kubectl apply -f deployment.yaml');
  assert.equal(result.charCount, 48);

  // 2. Capítulo no encontrado
  const notFound = await ChatService.resolveChapterToolCall({ docId: doc.id, chapterId: 99 });
  assert.equal(notFound.success, false);
  assert.ok(notFound.error.includes('No se encontró el capítulo ID [99]'));

  // 3. Argumentos inválidos
  const invalidArgs = await ChatService.resolveChapterToolCall({});
  assert.equal(invalidArgs.success, false);
  assert.ok(invalidArgs.error.includes('Parámetros inválidos'));
});

test('ChatService - Integración con ToolRegistry y ejecución en AgentCore', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Rama Agente');
  const doc = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Protocolo.md',
    fileType: 'md',
    fileSize: 400,
    globalSummary: 'Protocolo de emergencia.',
    chapters: [
      {
        chapterId: 1,
        title: 'Evacuación',
        summary: 'Pasos para evacuar el edificio.',
        content: 'Paso 1: Salir por la salida de emergencia norte.'
      }
    ]
  });

  const registry = new AgentCore.ToolRegistry();
  registry.registerProvider(new AgentCore.BuiltinToolProvider());

  const ragTool = registry.getTool('read_chapter_content');
  assert.ok(ragTool, 'La herramienta read_chapter_content debe estar registrada en ToolRegistry');
  assert.equal(ragTool.name, 'read_chapter_content');

  // Ejecutar tool a través del registry
  const execResult = await ragTool.execute({ docId: doc.id, chapterId: 1 });
  assert.equal(execResult.success, true);
  assert.equal(execResult.content, 'Paso 1: Salir por la salida de emergencia norte.');

  // Formatear markdown
  const md = ragTool.formatMarkdownResult({ docId: doc.id, chapterId: 1 }, execResult);
  assert.ok(md.includes('read_chapter_content'));
  assert.ok(md.includes('Paso 1: Salir por la salida de emergencia norte.'));
});
