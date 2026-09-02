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
      view: { id: definition.name }
    });
  }

  const toolModule = { id: definition.name, definition, createTool, getUrl };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
