/** Tool module: read_knowledge_chunk. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinReadKnowledgeChunkTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'read_knowledge_chunk',
    description: 'Lee el contenido completo de un fragmento localizado previamente para resolver una duda concreta necesaria para la respuesta. Úsalo como evidencia interna; después sintetiza y responde, sin copiar el fragmento completo salvo petición explícita del usuario.',
    parameters: {
      type: 'object',
      properties: { chunkId: { type: 'string', description: 'Identificador exacto del fragmento (chunkId).' } },
      required: ['chunkId']
    }
  };

  function getRagService(context = {}) {
    if (context.services?.ragService) return context.services.ragService;
    if (typeof window !== 'undefined' && window.ChatRagService) return window.ChatRagService;
    if (typeof require !== 'undefined') { try { return require('../../rag-service.js'); } catch (_) {} }
    return null;
  }

  function getBranchIds(context = {}) {
    return context.activeRagBranchIds || context.activeRagBranchId || context.branchId || context.config?.activeRagBranchIds || context.config?.activeRagBranchId || '';
  }
  const getBranchId = getBranchIds;

  function createCardWrapper(ui) {
    const doc = ui?.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const card = doc.createElement('div'); card.className = 'tool-card-wrapper'; return card;
  }
  const SPINNER_SVG = '<svg class="ui-icon ui-icon-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CHECK_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const ERROR_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  const CHEVRON_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  const DOC_ICON_SVG = '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';

  function createLiveCard(args, ui) {
    const card = createCardWrapper(ui); if (!card) return null;
    const Markdown = ui?.markdown || { escapeHtml: value => String(value || '') };
    const t = ui?.t || (key => key);
    card.innerHTML = `<div class="tool-execution-card rag-execution-card collapsed"><div class="tool-card-header"><div class="tool-card-title"><span>${DOC_ICON_SVG}</span><span>Fragmento de conocimiento</span></div><div class="tool-card-header-actions"><span class="tool-card-badge status-loading">${SPINNER_SVG} <span>Leyendo ${Markdown.escapeHtml(args?.chunkId || '')}...</span></span><button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}">${CHEVRON_SVG}</button></div></div><div class="tool-card-collapsible-body"><div class="tool-card-result"><div class="tool-loading-placeholder">${SPINNER_SVG} <span>Recuperando texto desde IndexedDB...</span></div></div></div></div>`;
    return card;
  }
  function updateLiveCard(card, _args, result = {}, _elapsedMs, ui) {
    if (!card) return;
    const Markdown = ui?.markdown || { escapeHtml: value => String(value || '') };
    const success = result?.success !== false && !result?.error;
    const content = result?.content || result?.error || '';
    const badge = card.querySelector('.tool-card-badge');
    if (badge) { badge.className = `tool-card-badge ${success ? 'status-success' : 'status-error'}`; badge.innerHTML = success ? `${CHECK_SVG} <span>Fragmento recuperado (${content.length} caracteres)</span>` : `${ERROR_SVG} <span>${result?.error || 'No encontrado'}</span>`; }
    const body = card.querySelector('.tool-card-result');
    if (body) body.innerHTML = `<pre class="tool-result-pre"><code>${Markdown.escapeHtml(content.slice(0, 2500))}${content.length > 2500 ? '\n…' : ''}</code></pre>`;
  }
  function renderHistoricalCard(args, message, ui) {
    const card = createLiveCard(args, ui); if (!card) return null;
    let result = {}; try { result = JSON.parse(message?.content || '{}'); } catch (_) { result = { content: message?.content || '' }; }
    updateLiveCard(card, args, result, 0, ui); return card;
  }

  function createTool(Tool) {
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear read_knowledge_chunk.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: [],
      category: 'rag',
      metadata: { icon: '📄', label: definition.name },
      settings: { showInSettings: false },
      isAvailable: config => Boolean(config.activeRagBranchId || (config.activeRagBranchIds && config.activeRagBranchIds.length > 0)),
      execute: async (args, context = {}) => {
        const service = getRagService(context);
        return service?.readKnowledgeChunk ? service.readKnowledgeChunk(getBranchIds(context), args) : { success: false, error: 'Servicio de RAG no disponible.' };
      },
      result: {
        toModel: (_args, result) => result?.content || JSON.stringify(result || {}),
        toMarkdown: args => `> 📄 **read_knowledge_chunk** (${args.chunkId || ''})\n\n`
      },
      formatter: (args, result) => result.success
        ? `> 📄 **read_knowledge_chunk** (${result.chunkId})\n> \`\`\`text\n> ${String(result.content).split('\n').join('\n> ')}\n> \`\`\``
        : `> 📄 **read_knowledge_chunk** (${args.chunkId || ''})\n> ❌ ${result.error || 'Error'}`,
      view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard }
    });
  }

  const toolModule = { id: definition.name, definition, createTool, getRagService, getBranchId, view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard } };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (_) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
