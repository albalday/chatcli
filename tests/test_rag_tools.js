const test = require('node:test');
const assert = require('node:assert/strict');

// Cargar módulos
const ChatFileSystem = require('../js/file-system.js');
const RagStorage = require('../js/ragStorage.js');
const AgentCore = require('../js/agent-core.js');
const TreeRagService = require('../js/chatService.js');
const { createMockDirectoryHandle } = require('./mock_file_system_handle.js');

// Configurar mock de directorio para el entorno de test en Node.js
const mockRoot = createMockDirectoryHandle('zerochat');
ChatFileSystem.setRootDirectoryHandle(mockRoot);

test('RagTools - Tool definitions válidas y esquemas Function Calling correctos', () => {
  assert.ok(TreeRagService.LIST_DOCUMENTS_TOOL_DEFINITION);
  assert.equal(TreeRagService.LIST_DOCUMENTS_TOOL_DEFINITION.function.name, 'list_documents');

  assert.ok(TreeRagService.SEARCH_KNOWLEDGE_BASE_TOOL_DEFINITION);
  assert.equal(TreeRagService.SEARCH_KNOWLEDGE_BASE_TOOL_DEFINITION.function.name, 'search_knowledge_base');

  assert.ok(TreeRagService.READ_CHAPTER_TOOL_DEFINITION);
  assert.equal(TreeRagService.READ_CHAPTER_TOOL_DEFINITION.function.name, 'read_chapter_content');
});

test('RagTools - resolveListDocumentsToolCall y resolveSearchKnowledgeBaseToolCall con rama activa', async () => {
  // Crear una rama de prueba en RagStorage
  const branch = await RagStorage.createBranch(
    'Manuales de Hardware Test',
    'Documentación técnica de placas base y BIOS'
  );

  // Guardar un documento con capítulos en la rama
  const doc = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Manual GA-Z77P-D3',
    globalSummary: 'Guía de instalación y configuración de placa base Gigabyte GA-Z77P-D3.',
    chapters: [
      {
        chapterId: 1,
        title: 'Instalación de Componentes',
        summary: 'Pasos para instalar la CPU, memoria RAM DDR3 y disipador.',
        content: '# Capítulo 1: Instalación\nPara instalar la memoria RAM, inserte los módulos DDR3 en los slots DIMM 1 y 3 para Dual Channel.'
      },
      {
        chapterId: 2,
        title: 'Configuración de BIOS UEFI',
        summary: 'Opciones de arranque, overclocking y parámetros de voltaje.',
        content: '# Capítulo 2: BIOS\nPresione <Del> durante el POST para acceder a la utilidad UEFI DualBIOS.'
      }
    ]
  });

  // 1. Probar list_documents
  const listRes = await TreeRagService.resolveListDocumentsToolCall(branch.id);
  assert.ok(listRes.success);
  assert.equal(listRes.count, 1);
  assert.ok(listRes.text.includes('Manual GA-Z77P-D3'));
  assert.ok(listRes.text.includes('Cap [1]'));
  assert.ok(listRes.text.includes('Cap [2]'));

  // 2. Probar search_knowledge_base con término coincidente
  const searchMatch = await TreeRagService.resolveSearchKnowledgeBaseToolCall(branch.id, { query: 'RAM DDR3' });
  assert.ok(searchMatch.success);
  assert.equal(searchMatch.matchesCount, 1);
  assert.ok(searchMatch.text.includes('Instalación de Componentes'));

  // 3. Probar search_knowledge_base con búsqueda de BIOS
  const searchBios = await TreeRagService.resolveSearchKnowledgeBaseToolCall(branch.id, 'BIOS');
  assert.ok(searchBios.success);
  assert.ok(searchBios.text.includes('Configuración de BIOS'));

  // 4. Probar dispatchToolCall para list_documents a través de ChatAgentCore
  const listToolCall = {
    id: 'call_list_docs',
    type: 'function',
    function: {
      name: 'list_documents',
      arguments: '{}'
    }
  };

  const dispatchRes = await AgentCore.dispatchToolCall(listToolCall, {
    activeRagBranchId: branch.id
  });

  assert.ok(dispatchRes.success);
  assert.ok(dispatchRes.resultText.includes('Manual GA-Z77P-D3'));
  assert.ok(dispatchRes.markdownBlock.includes('list_documents'));

  // 5. Probar read_chapter_content
  const readToolCall = {
    id: 'call_read_chap',
    type: 'function',
    function: {
      name: 'read_chapter_content',
      arguments: JSON.stringify({ docId: doc.id, chapterId: 1 })
    }
  };

  const readRes = await AgentCore.dispatchToolCall(readToolCall);
  assert.ok(readRes.success);
  assert.ok(readRes.resultText.includes('Dual Channel'));

  // Limpieza de la rama de prueba
  await RagStorage.deleteBranch(branch.id);
});

test('RagTools - Manejo seguro de error cuando no hay rama activa', async () => {
  const listRes = await TreeRagService.resolveListDocumentsToolCall('');
  assert.equal(listRes.success, false);
  assert.ok(listRes.error.includes('No hay ninguna rama'));

  const searchRes = await TreeRagService.resolveSearchKnowledgeBaseToolCall('', 'test');
  assert.equal(searchRes.success, false);
});
