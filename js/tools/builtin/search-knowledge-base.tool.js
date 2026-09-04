/** Tool autocontenida: search_knowledge_base. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinSearchKnowledgeBaseTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'search_knowledge_base',
    description: 'Busca evidencia relevante en la base de conocimiento local para responder a la consulta del usuario. Devuelve fragmentos breves e identificadores para el razonamiento interno; úsalo como fuente, no como contenido que debas reproducir. Selecciona scope="document" con documentHint para una fuente identificable, scope="corpus" para comparaciones o información distribuida, y scope="auto" si no está claro.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Término, tema o pregunta clave a buscar en la base de conocimiento.' },
        scope: {
          type: 'string',
          enum: ['auto', 'document', 'corpus'],
          description: 'Alcance de la búsqueda: document para una fuente identificable, corpus para varias fuentes y auto si no está claro. Por defecto auto.'
        },
        documentHint: {
          type: 'string',
          description: 'Nombre, título o términos distintivos de la fuente buscada. Recomendado con scope=document; no inventes un identificador interno.'
        },
        limit: { type: 'integer', description: 'Número opcional de fragmentos a devolver (por defecto 10).' }
      },
      required: ['query']
    }
  };

  function getBranchIds(context = {}) {
    return context.activeRagBranchIds || context.activeRagBranchId || context.branchId || context.config?.activeRagBranchIds || context.config?.activeRagBranchId || '';
  }
  const getBranchId = getBranchIds;

  function getRagService(context = {}) {
    if (context.services?.ragService) return context.services.ragService;
    if (typeof window !== 'undefined' && window.ChatRagService) return window.ChatRagService;
    if (typeof require !== 'undefined') {
      try { return require('../../rag-service.js'); } catch (e) {}
    }
    return null;
  }

  const SPINNER_SVG = '<svg class="ui-icon ui-icon-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CHECK_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const ERROR_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  const CHEVRON_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  const DB_ICON_SVG = '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>';

  function createCardWrapper(ui) { const doc = ui?.document || (typeof document !== 'undefined' ? document : null); if (!doc) return null; const card = doc.createElement('div'); card.className = 'tool-card-wrapper'; return card; }
  function createLiveCard(args, ui) {
    const card = createCardWrapper(ui); if (!card) return null; const Markdown = ui?.markdown || { escapeHtml: (v) => String(v || '') }; const t = ui?.t || ((key) => key); const query = args?.query || args?.q || args?.search || '';
    card.innerHTML = `<div class="tool-execution-card rag-execution-card collapsed"><div class="tool-card-header"><div class="tool-card-title"><span>${DB_ICON_SVG}</span><span>Conocimiento local: "${Markdown.escapeHtml(query)}"</span></div><div class="tool-card-header-actions"><span class="tool-card-badge status-loading">${SPINNER_SVG} <span>Buscando con Orama...</span></span><button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}">${CHEVRON_SVG}</button></div></div><div class="tool-card-collapsible-body"><div class="tool-card-result"><div class="tool-loading-placeholder">${SPINNER_SVG} <span>Construyendo el índice local...</span></div></div></div></div>`; return card;
  }
  function updateLiveCard(card, _args, result = {}, elapsedMs = 0, ui) { if (!card) return; const Markdown = ui?.markdown || { escapeHtml: (v) => String(v || '') }; const success = result?.success !== false && !result?.error; const count = result?.matchesCount ?? 0; const text = result?.text || (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result || '')); const badge = card.querySelector('.tool-card-badge'); if (badge) { badge.className = `tool-card-badge ${success ? 'status-success' : 'status-error'}`; badge.innerHTML = success ? `${CHECK_SVG} <span>${count} coincidencia${count === 1 ? '' : 's'} · ${result?.appliedScope || 'auto'} (${elapsedMs || 0}ms)</span>` : `${ERROR_SVG} <span>${result?.error || 'Error al consultar'}</span>`; } const body = card.querySelector('.tool-card-result'); if (body) body.innerHTML = `<pre class="tool-result-pre"><code>${Markdown.escapeHtml(text.slice(0, 3000))}${text.length > 3000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>`; }
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
      isAvailable: (config = {}) => Boolean(config.activeRagBranchId || (config.activeRagBranchIds && config.activeRagBranchIds.length > 0)),
      execute: async (args, context = {}) => {
        const RagService = getRagService(context);
        if (!RagService?.searchKnowledgeBase) return { success: false, error: 'Servicio de RAG no disponible.' };
        return RagService.searchKnowledgeBase(getBranchIds(context), args);
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

  const toolModule = { id: definition.name, definition, createTool, getBranchId, getRagService, view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard } };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
