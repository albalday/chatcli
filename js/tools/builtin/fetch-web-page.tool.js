/** Tool autocontenida: fetch_web_page. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinFetchWebPageTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'fetch_web_page',
    description: 'Descarga y lee el texto y contenido de una página web pública o artículo HTML a partir de su URL (ej: "https://es.wikipedia.org/wiki/Sol").',
    parameters: { type: 'object', properties: { url: { type: 'string', description: 'URL de la página web a consultar.' } }, required: ['url'] }
  };

  function getUrl(args) {
    return args?.url || args?.URL || args?.uri || args?.link || args?.href || args?.path || args?.input || (typeof args === 'string' ? args : '');
  }

  function createTool(Tool) {
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear fetch_web_page.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: ['fetchwebpage', 'fetch_web', 'fetch_url', 'get_web_page', 'read_web_page', 'web_fetch', 'browse_web', 'webpage'],
      category: 'web',
      metadata: { icon: '🌐', label: definition.name },
      settings: {
        titleKey: 'agent_web_title', titleFallback: '🌐 Navegación Web en Tiempo Real',
        descKey: 'agent_web_desc', descFallback: 'Permite al modelo invocar fetch_web_page para consultar páginas web públicas y extraer su contenido textual en tiempo real.',
        icon: '🌐', defaultEnabled: true, showInSettings: true
      },
      promptGuide: (lang) => lang === 'en'
        ? '- `fetch_web_page(url="...")`: Reads and extracts clean text content from public web pages or HTML articles.'
        : '- `fetch_web_page(url="...")`: Lee y extrae el texto de páginas web públicas o artículos HTML.',
      execute: async (args, context = {}) => {
        const WebBrowser = context.services?.webBrowser;
        if (!WebBrowser || !WebBrowser.fetchPage) return { success: false, error: 'Módulo WebBrowser no disponible.' };
        return WebBrowser.fetchPage(getUrl(args), context.options || {});
      },
      result: {
        toModel: (_args, result) => JSON.stringify(result || {}),
        toMarkdown: (args) => `> 🌐 **fetch_web_page**\n> URL: "${args.url || ''}"\n\n`
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
