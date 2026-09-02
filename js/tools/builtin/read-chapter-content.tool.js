/** Tool autocontenida: read_chapter_content. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinReadChapterContentTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'read_chapter_content',
    description: 'Recupera el texto completo, instrucciones detalladas, código y diagramas de un capítulo específico de un documento (indicando docId y chapterId obtenidos previamente).',
    parameters: {
      type: 'object',
      properties: { docId: { type: 'string', description: 'El identificador único del documento (docId).' }, chapterId: { type: 'number', description: 'El número de ID del capítulo a consultar.' } },
      required: ['docId', 'chapterId']
    }
  };

  function getChapterReference(args = {}) {
    return {
      docId: args.docId || args.doc_id || args.id || '',
      chapterId: typeof args.chapterId === 'number' ? args.chapterId : parseInt(args.chapter_id || args.chapterId || args.chapter, 10)
    };
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

  function getRagStorage(context = {}) {
    if (context.services?.ragStorage) return context.services.ragStorage;
    if (typeof window !== 'undefined' && (window.ChatRagStorage || window.RagStorage)) {
      return window.ChatRagStorage || window.RagStorage;
    }
    if (typeof require !== 'undefined') {
      try { return require('../../ragStorage.js'); } catch (e) {}
    }
    return null;
  }

  function createCardWrapper(ui) { const doc = ui?.document || (typeof document !== 'undefined' ? document : null); if (!doc) return null; const card = doc.createElement('div'); card.className = 'tool-card-wrapper'; return card; }
  function createLiveCard(args, ui) { const card = createCardWrapper(ui); if (!card) return null; const Markdown = ui?.markdown || { escapeHtml: (v) => String(v || '') }; const t = ui?.t || ((key) => key); const { docId, chapterId } = getChapterReference(args); card.innerHTML = `<div class="tool-execution-card rag-execution-card collapsed"><div class="tool-card-header"><div class="tool-card-title"><span>📖</span><span>Base de Conocimiento (RAG Local)</span></div><div class="tool-card-header-actions"><span class="tool-card-badge status-loading">⏳ Consultando doc "${Markdown.escapeHtml(docId)}", Cap ${Markdown.escapeHtml(String(chapterId))}...</span><button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Expandir'}"><span>▸</span></button></div></div><div class="tool-card-collapsible-body"><div class="tool-card-result"><div class="tool-loading-placeholder">⏳ Recuperando contenido íntegro del capítulo desde IndexedDB...</div></div></div></div>`; return card; }
  function updateLiveCard(card, _args, result = {}, _elapsedMs, ui) { if (!card) return; const Markdown = ui?.markdown || { escapeHtml: (v) => String(v || '') }; const success = result?.success !== false && !result?.error; const content = result?.content || result?.error || ''; const size = result?.charCount || content.length; const badge = card.querySelector('.tool-card-badge'); if (badge) { badge.className = `tool-card-badge ${success ? 'status-success' : 'status-error'}`; badge.textContent = success ? `✅ Capítulo recuperado (${size} caracteres)` : `❌ ${result?.error || 'No encontrado'}`; } const body = card.querySelector('.tool-card-result'); if (body) body.innerHTML = `<pre class="tool-result-pre"><code>${Markdown.escapeHtml(content.slice(0, 2000))}${content.length > 2000 ? '\n... (texto completo truncado en tarjeta)' : ''}</code></pre>`; }
  function renderHistoricalCard(args, message, ui) { const card = createLiveCard(args, ui); if (!card) return null; let result = {}; if (message?.content) { try { result = JSON.parse(message.content); } catch (e) { result = { content: message.content }; } } updateLiveCard(card, args, result, 0, ui); return card; }

  function createTool(Tool) {
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear read_chapter_content.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: ['readchaptercontent', 'read_chapter', 'get_chapter', 'get_chapter_content', 'read_doc_chapter'],
      category: 'rag',
      metadata: { icon: '📖', label: definition.name },
      settings: { showInSettings: false },
      isAvailable: (config = {}) => Boolean(config.activeRagBranchId || config.enableAgentRag),
      execute: async (args, context = {}) => {
        const TreeRagService = getTreeRagService(context);
        if (TreeRagService?.resolveChapterToolCall) return TreeRagService.resolveChapterToolCall(args);

        const RagStorage = getRagStorage(context);
        if (!RagStorage?.getChapterContent) return { success: false, error: 'Módulo de almacenamiento RAG no disponible.' };
        const { docId, chapterId } = getChapterReference(args);
        if (!docId || Number.isNaN(chapterId)) return { success: false, error: 'Parámetros inválidos: docId y chapterId numérico son requeridos.' };

        const content = await RagStorage.getChapterContent(docId, chapterId);
        return content !== null && typeof content === 'string'
          ? { success: true, docId, chapterId, charCount: content.length, content }
          : { success: false, error: `No se encontró el capítulo ${chapterId} en el documento [${docId}].` };
      },
      result: {
        toModel: (_args, result) => result?.content || JSON.stringify(result || {}),
        toMarkdown: (args) => `> 📖 **read_chapter_content** (Doc: "${args.docId}", Cap: ${args.chapterId})\n\n`
      },
      formatter: (args, result) => result.success
        ? '> 📖 **read_chapter_content** (Doc: `' + result.docId + '`, Cap: `' + result.chapterId + '`)\n> ```text\n> ' + String(result.content).split('\n').join('\n> ') + '\n> ```'
        : '> 📖 **read_chapter_content** (Doc: `' + args.docId + '`, Cap: `' + args.chapterId + '`)\n> ❌ ' + (result.error || 'Error al recuperar capítulo'),
      view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard }
    });
  }

  const toolModule = { id: definition.name, definition, createTool, getChapterReference, getTreeRagService, getRagStorage, view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard } };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
