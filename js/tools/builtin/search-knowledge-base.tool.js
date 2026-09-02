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

  function createCardWrapper(ui) { const doc = ui?.document || (typeof document !== 'undefined' ? document : null); if (!doc) return null; const card = doc.createElement('div'); card.className = 'tool-card-wrapper'; return card; }
  function createLiveCard(args, ui) {
    const card = createCardWrapper(ui); if (!card) return null; const Markdown = ui?.markdown || { escapeHtml: (v) => String(v || '') }; const t = ui?.t || ((key) => key); const query = args?.query || args?.q || args?.search || '';
    card.innerHTML = `<div class="tool-execution-card rag-execution-card collapsed"><div class="tool-card-header"><div class="tool-card-title"><span>📖</span><span>Base de Conocimiento (Búsqueda: "${Markdown.escapeHtml(query)}")</span></div><div class="tool-card-header-actions"><span class="tool-card-badge status-loading">⏳ Buscando en base de conocimiento...</span><button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}"><span>▸</span></button></div></div><div class="tool-card-collapsible-body"><div class="tool-card-result"><div class="tool-loading-placeholder">⏳ Recuperando índice y resúmenes desde IndexedDB...</div></div></div></div>`; return card;
  }
  function updateLiveCard(card, _args, result = {}, elapsedMs = 0, ui) { if (!card) return; const Markdown = ui?.markdown || { escapeHtml: (v) => String(v || '') }; const success = result?.success !== false && !result?.error; const count = result?.matchesCount ?? 0; const text = result?.text || (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result || '')); const badge = card.querySelector('.tool-card-badge'); if (badge) { badge.className = `tool-card-badge ${success ? 'status-success' : 'status-error'}`; badge.textContent = success ? `✅ ${count} doc${count === 1 ? '' : 's'} indexado${count === 1 ? '' : 's'} (${elapsedMs || 0}ms)` : `❌ ${result?.error || 'Error al consultar'}`; } const body = card.querySelector('.tool-card-result'); if (body) body.innerHTML = `<pre class="tool-result-pre"><code>${Markdown.escapeHtml(text.slice(0, 3000))}${text.length > 3000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>`; }
  function renderHistoricalCard(args, message, ui) { const card = createLiveCard(args, ui); if (!card) return null; let result = {}; if (message?.content) { try { result = JSON.parse(message.content); } catch (e) { result = { text: message.content }; } } updateLiveCard(card, args, result, 0, ui); return card; }

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
      view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard }
    });
  }

  const toolModule = { id: definition.name, definition, createTool, getBranchId, getTreeRagService, view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard } };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
