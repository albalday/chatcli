/** Tool autocontenida: download_pdf. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinDownloadPdfTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'download_pdf',
    description: 'Descarga un archivo o documento PDF desde una URL web y extrae todo su texto legible para analizarlo e integrarlo en el contexto (ej: "https://arxiv.org/pdf/2310.06825.pdf").',
    parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL directa del documento PDF a descargar y extraer.' } }, required: ['url'] }
  };

  function getUrl(args) {
    return args?.url || args?.URL || args?.uri || args?.link || args?.href || args?.path || args?.input || (typeof args === 'string' ? args : '');
  }

  function createCardWrapper(ui) {
    const doc = ui?.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const cardDiv = doc.createElement('div');
    cardDiv.className = 'tool-card-wrapper';
    return cardDiv;
  }

  const SPINNER_SVG = '<svg class="ui-icon ui-icon-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CHECK_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const ERROR_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  const CHEVRON_SVG = '<svg class="ui-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  const PDF_ICON_SVG = '<svg class="ui-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';

  function createLiveCard(args, ui) {
    const cardDiv = createCardWrapper(ui);
    if (!cardDiv) return null;
    const Markdown = ui?.markdown || { escapeHtml: (value) => String(value || ''), sanitizeUrl: (value) => String(value || '') };
    const t = ui?.t || ((key) => key);
    const url = getUrl(args);
    cardDiv.innerHTML = `<div class="web-request-card pdf-request-card"><div class="web-card-header"><div class="web-card-title"><span>${PDF_ICON_SVG}</span><span>${t('tool_pdf_title')}</span></div><div class="tool-card-header-actions"><span class="web-card-badge status-loading">${SPINNER_SVG} <span>${t('tool_badge_downloading') || 'Descargando...'}</span></span><button type="button" class="btn-tool-collapse" title="${t('tool_btn_collapse') || 'Minimizar'}">${CHEVRON_SVG}</button></div></div><div class="tool-card-collapsible-body"><div class="web-card-section web-request-section"><div class="section-label">${t('tool_web_requested_url')}</div><div class="url-badge"><a href="${Markdown.sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">${Markdown.escapeHtml(url)}</a></div></div><div class="web-card-section web-response-section"><div class="section-label section-response-label">${t('tool_web_receiving') || 'Recibiendo contenido...'}</div><div class="web-response-body tool-loading-placeholder">${SPINNER_SVG} <span>${t('tool_loading_pdf')}</span></div></div></div></div>`;
    return cardDiv;
  }

  function updateLiveCard(cardDiv, _args, result = {}, elapsedMs = 0, ui) {
    if (!cardDiv) return;
    const Markdown = ui?.markdown || { escapeHtml: (value) => String(value || '') };
    const t = ui?.t || ((key) => key);
    const success = result?.success !== false && !result?.error;
    const content = result?.content || result?.error || '';
    const badge = cardDiv.querySelector('.web-card-badge');
    if (badge) {
      badge.className = `web-card-badge ${success ? 'status-success' : 'status-error'}`;
      badge.innerHTML = success
        ? `${CHECK_SVG} <span>PDF OK (${elapsedMs || 0}ms)</span>`
        : `${ERROR_SVG} <span>Error PDF (${elapsedMs || 0}ms)</span>`;
    }
    const label = cardDiv.querySelector('.section-response-label');
    if (label) label.textContent = t('tool_web_content_received', { size: `${content.length} chars` }) || `Contenido recibido (${content.length} caracteres):`;
    const body = cardDiv.querySelector('.web-response-body');
    if (body) { body.className = 'web-response-body'; body.innerHTML = `<code>${Markdown.escapeHtml(content.slice(0, 1500))}${content.length > 1500 ? '...' : ''}</code>`; }
  }

  function renderHistoricalCard(args, toolMessage, ui) {
    const cardDiv = createLiveCard(args, ui);
    if (!cardDiv) return null;
    let result = {};
    if (toolMessage?.content) { try { result = JSON.parse(toolMessage.content); } catch (e) { result = { content: toolMessage.content }; } }
    updateLiveCard(cardDiv, args, result, 0, ui);
    return cardDiv;
  }

  function createTool(Tool) {
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear download_pdf.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: ['downloadpdf', 'fetch_pdf', 'download_pdf_document', 'fetch_pdf_document', 'download_file', 'getpdf', 'readpdf'],
      category: 'web',
      metadata: { icon: '📄', label: definition.name },
      settings: {
        titleKey: 'agent_pdf_title', titleFallback: '📄 Descarga y Lectura de Documentos PDF',
        descKey: 'agent_pdf_desc', descFallback: 'Permite al modelo descargar documentos PDF desde la web y extraer todo su texto al contexto en tiempo real.',
        icon: '📄', defaultEnabled: true, showInSettings: true
      },
      promptGuide: (lang) => lang === 'en'
        ? '- `download_pdf(url="...")`: Downloads a PDF file from a URL and extracts its readable text into the prompt context.'
        : '- `download_pdf(url="...")`: Descarga un documento PDF desde una URL y extrae todo su texto legible al contexto.',
      execute: async (args, context = {}) => {
        const WebBrowser = context.services?.webBrowser;
        if (!WebBrowser || !WebBrowser.downloadPdf) return { success: false, error: 'Módulo WebBrowser no disponible.' };
        return WebBrowser.downloadPdf(getUrl(args), context.options || {});
      },
      result: {
        toModel: (_args, result) => JSON.stringify(result || {}),
        toMarkdown: (args) => `> 📄 **download_pdf**\n> URL: "${args.url || ''}"\n\n`
      },
      view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard }
    });
  }

  const toolModule = { id: definition.name, definition, createTool, getUrl, view: { id: definition.name, createLiveCard, updateLiveCard, renderHistoricalCard } };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
