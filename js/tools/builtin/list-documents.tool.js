/** Tool autocontenida: list_documents. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinListDocumentsTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'list_documents',
    description: 'Lista todos los documentos, manuales, resúmenes temáticos y la lista completa de capítulos indexados en la base de conocimiento local del usuario. Úsala para descubrir qué información existe o ante preguntas sobre el catálogo documental disponible.',
    parameters: { type: 'object', properties: {}, required: [] }
  };

  function getBranchId(context = {}) {
    return context.activeRagBranchId || context.branchId || context.config?.activeRagBranchId || '';
  }

  function getTreeRagService(context = {}) {
    if (context.services?.treeRagService) return context.services.treeRagService;
    if (typeof window !== 'undefined' && (window.ChatTreeRagService || window.ChatService)) {
      return window.ChatTreeRagService || window.ChatService;
    }
    if (typeof require !== 'undefined') {
      try { return require('../../chatService.js'); } catch (e) {}
    }
    return null;
  }

  function createTool(Tool) {
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear list_documents.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: ['listdocuments', 'list_knowledge_base', 'list_docs', 'get_documents', 'listar_documentos'],
      category: 'rag',
      metadata: { icon: '📖', label: definition.name },
      settings: { showInSettings: false },
      isAvailable: (config = {}) => Boolean(config.activeRagBranchId || config.enableAgentRag),
      execute: async (_args, context = {}) => {
        const TreeRagService = getTreeRagService(context);
        if (!TreeRagService?.resolveListDocumentsToolCall) return { success: false, error: 'Servicio de RAG no disponible.' };
        return TreeRagService.resolveListDocumentsToolCall(getBranchId(context));
      },
      result: {
        toModel: (_args, result) => result?.text || JSON.stringify(result || {}),
        toMarkdown: (_args, result) => `> 📖 **list_documents** (${result?.count || 0} documentos indexados)\n\n`
      },
      formatter: (_args, result) => '> 📖 **list_documents** (' + (result.count || 0) + ' documentos disponibles)\n> ```\n> ' +
        String(result.text || '').split('\n').join('\n> ') + '\n> ```',
      view: { id: definition.name }
    });
  }

  const toolModule = { id: definition.name, definition, createTool, getBranchId, getTreeRagService };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
