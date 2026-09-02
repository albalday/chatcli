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

  function createCardWrapper(ui) { const doc = ui?.document || (typeof document !== 'undefined' ? document : null); if (!doc) return null; const card = doc.createElement('div'); card.className = 'tool-card-wrapper'; return card; }
  function createLiveCard(_args, ui) {
    const card = createCardWrapper(ui); if (!card) return null; const t = ui?.t || ((key) => key);
    card.innerHTML = `<div class="tool-execution-card rag-execution-card collapsed"><div class="tool-card-header"><div class="tool-card-title"><span>📖</span><span>Base de Conocimiento (Índice de Documentos)</span></div><div class="tool-card-header-actions"><span class="tool-card-badge status-loading">⏳ Consultando documentos indexados...</span><button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}"><span>▸</span></button></div></div><div class="tool-card-collapsible-body"><div class="tool-card-result"><div class="tool-loading-placeholder">⏳ Recuperando índice y resúmenes desde IndexedDB...</div></div></div></div>`; return card;
  }
  function updateLiveCard(card, _args, result = {}, elapsedMs = 0, ui) {
    if (!card) return; const Markdown = ui?.markdown || { escapeHtml: (v) => String(v || '') }; const success = result?.success !== false && !result?.error; const count = result?.count ?? 0; const text = result?.text || (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result || ''));
    const badge = card.querySelector('.tool-card-badge'); if (badge) { badge.className = `tool-card-badge ${success ? 'status-success' : 'status-error'}`; badge.textContent = success ? `✅ ${count} doc${count === 1 ? '' : 's'} indexado${count === 1 ? '' : 's'} (${elapsedMs || 0}ms)` : `❌ ${result?.error || 'Error al consultar'}`; }
    const body = card.querySelector('.tool-card-result'); if (body) body.innerHTML = `<pre class="tool-result-pre"><code>${Markdown.escapeHtml(text.slice(0, 3000))}${text.length > 3000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>`;
  }
  function renderHistoricalCard(args, message, ui) { const card = createLiveCard(args, ui); if (!card) return null; let result = {}; if (message?.content) { try { result = JSON.parse(message.content); } catch (e) { result = { text: message.content }; } } updateLiveCard(card, args, result, 0, ui); return card; }

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
