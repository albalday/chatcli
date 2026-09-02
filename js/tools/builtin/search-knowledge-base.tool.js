/** Tool autocontenida: search_knowledge_base. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinSearchKnowledgeBaseTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'search_knowledge_base',
    description: 'Busca temas, palabras clave o preguntas técnicas en la base de conocimiento local del usuario. Devuelve resúmenes de documentos y capítulos coincidentes para identificar qué leer.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Término, tema o pregunta clave a buscar en la base de conocimiento.' } }, required: ['query'] }
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
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear search_knowledge_base.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: ['search_kb', 'searchknowledgebase', 'search_documents', 'search_knowledge', 'buscar_en_documentos'],
      category: 'rag',
      metadata: { icon: '🔍', label: definition.name },
      settings: { showInSettings: false },
      isAvailable: (config = {}) => Boolean(config.activeRagBranchId || config.enableAgentRag),
      execute: async (args, context = {}) => {
        const TreeRagService = getTreeRagService(context);
        if (!TreeRagService?.resolveSearchKnowledgeBaseToolCall) return { success: false, error: 'Servicio de RAG no disponible.' };
        return TreeRagService.resolveSearchKnowledgeBaseToolCall(getBranchId(context), args);
      },
      result: {
        toModel: (_args, result) => result?.text || JSON.stringify(result || {}),
        toMarkdown: (args, result) => `> 🔍 **search_knowledge_base** ("${args.query || ''}") [${result?.matchesCount || 0} coincidencias]\n\n`
      },
      formatter: (args, result) => '> 🔍 **search_knowledge_base** ("' + (args.query || '') + '") [' + (result.matchesCount || 0) + ' coincidencias]\n> ```\n> ' +
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
