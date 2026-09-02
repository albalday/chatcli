/** Tool autocontenida: search_web. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatBuiltinSearchWebTool = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const definition = {
    name: 'search_web',
    description: 'Busca en internet en tiempo real información actualizada, noticias, artículos y enlaces web utilizando DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Términos o consulta de búsqueda (ej: "INE poblacion Ceuta padron", "DeepSeek R1").' } },
      required: ['query']
    }
  };

  function getQuery(args) {
    return args?.query || args?.q || args?.search || args?.keyword || args?.term || args?.input || (typeof args === 'string' ? args : '');
  }

  function createTool(Tool) {
    if (typeof Tool !== 'function') throw new Error('La clase Tool es necesaria para crear search_web.');
    return new Tool({
      id: definition.name,
      definition,
      aliases: ['searchweb', 'web_search', 'duckduckgo_search', 'duckduckgo', 'search_internet', 'internet_search', 'search'],
      category: 'web',
      metadata: { icon: '🔍', label: definition.name },
      settings: {
        titleKey: 'agent_search_title', titleFallback: '🔍 Búsqueda en DuckDuckGo en Tiempo Real',
        descKey: 'agent_search_desc', descFallback: 'Permite al modelo invocar search_web para buscar información actualizada, definiciones, noticias y enlaces web mediante la API de DuckDuckGo.',
        icon: '🔍', defaultEnabled: true, showInSettings: true
      },
      promptGuide: (lang) => lang === 'en'
        ? '- `search_web(query="...")`: Searches up-to-date information, news, articles, and links on the internet using DuckDuckGo.'
        : '- `search_web(query="...")`: Busca información actualizada, noticias, artículos y enlaces en internet mediante DuckDuckGo.',
      execute: async (args, context = {}) => {
        const WebSearch = context.services?.webSearch;
        if (!WebSearch || !WebSearch.search) return { success: false, error: 'Módulo WebSearch no disponible.' };
        return WebSearch.search(getQuery(args), context.language || context.lang || 'es');
      },
      result: {
        toModel: (_args, result) => result?.markdown || JSON.stringify(result || {}),
        toMarkdown: (args, result) => {
          const resultText = result?.markdown || JSON.stringify(result || {});
          return `> 🔍 **search_web** (${result?.count || 0} fuentes)\n> Query: "${args.query || ''}"\n> \`\`\`markdown\n> ${resultText.split('\n').join('\n> ')}\n> \`\`\``;
        }
      },
      view: { id: definition.name }
    });
  }

  const toolModule = { id: definition.name, definition, createTool, getQuery };
  let manifestApi = null;
  if (typeof window !== 'undefined' && window.ChatToolManifest) manifestApi = window.ChatToolManifest;
  else if (typeof require !== 'undefined') { try { manifestApi = require('../tool-manifest.js'); } catch (e) {} }
  if (manifestApi?.builtin && !manifestApi.builtin.has(toolModule.id)) manifestApi.builtin.register(toolModule);
  return toolModule;
});
