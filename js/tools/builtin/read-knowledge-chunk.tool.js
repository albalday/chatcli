/** Tool module: read_knowledge_chunk. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinReadKnowledgeChunkTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'read_knowledge_chunk',
    description: 'Lee el texto completo de un fragmento obtenido previamente con search_knowledge_base.',
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

  function getBranchId(context = {}) {
    return context.activeRagBranchId || context.branchId || context.config?.activeRagBranchId || '';
  }

  function createCardWrapper(ui) {
    const doc = ui?.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const card = doc.createElement('div'); card.className = 'tool-card-wrapper'; return card;
  }
  function createLiveCard(args, ui) {
    const card = createCardWrapper(ui); if (!card) return null;
    const Markdown = ui?.markdown || { escapeHtml: value => String(value || '') };
    const t = ui?.t || (key => key);
    card.innerHTML = `<div class="tool-execution-card rag-execution-card collapsed"><div class="tool-card-header"><div class="tool-card-title"><span>📄</span><span>Fragmento de conocimiento</span></div><div class="tool-card-header-actions"><span class="tool-card-badge status-loading">⏳ Leyendo ${Markdown.escapeHtml(args?.chunkId || '')}...</span><button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}"><span>▸</span></button></div></div><div class="tool-card-collapsible-body"><div class="tool-card-result"><div class="tool-loading-placeholder">⏳ Recuperando texto desde IndexedDB...</div></div></div></div>`;
    return card;
  }
  function updateLiveCard(card, _args, result = {}, _elapsedMs, ui) {
    if (!card) return;
    const Markdown = ui?.markdown || { escapeHtml: value => String(value || '') };
    const success = result?.success !== false && !result?.error;
    const content = result?.content || result?.error || '';
    const badge = card.querySelector('.tool-card-badge');
    if (badge) { badge.className = `tool-card-badge ${success ? 'status-success' : 'status-error'}`; badge.textContent = success ? `✅ Fragmento recuperado (${content.length} caracteres)` : `❌ ${result?.error || 'No encontrado'}`; }
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
      isAvailable: config => Boolean(config.activeRagBranchId),
      execute: async (args, context = {}) => {
        const service = getRagService(context);
        return service?.readKnowledgeChunk ? service.readKnowledgeChunk(getBranchId(context), args) : { success: false, error: 'Servicio de RAG no disponible.' };
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
