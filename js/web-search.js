/**
 * Módulo de Búsqueda en Internet en Tiempo Real (ChatWebSearch) para ChatCLI.
 * - Utiliza exclusivamente la API de DuckDuckGo (Instant Answer & Web Knowledge).
 * - Diseñado para no bloquearse por peticiones repetidas, sin límites de scraping ni CAPTCHAs.
 * - Formatea los resultados en Markdown estructurado y compacto para el modelo.
 * - Compatible con file:// y http://.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatWebSearch = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIMEOUT_MS = 8000;

  async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Consulta la API de DuckDuckGo y extrae todos los datos relevantes.
   */
  async function searchDuckDuckGo(query) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`;
      const res = await fetchWithTimeout(url, {
        headers: {
          'Accept': 'application/json'
        }
      }, TIMEOUT_MS);

      if (!res.ok) return [];

      const data = await res.json();
      const results = [];
      const seenUrls = new Set();

      function addResult(title, snippet, resUrl, source) {
        if (!resUrl) return;
        const normalizedUrl = resUrl.toLowerCase();
        if (seenUrls.has(normalizedUrl)) return;
        seenUrls.add(normalizedUrl);
        results.push({
          source: source || 'DuckDuckGo',
          title: (title || query).trim(),
          snippet: (snippet || '').trim(),
          url: resUrl
        });
      }

      // 1. Respuesta Directa
      if (data.Answer) {
        addResult('Respuesta Directa', data.Answer, data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`, 'DuckDuckGo Instant Answer');
      }

      // 2. Resumen / Abstract Principal
      if (data.AbstractText && data.AbstractURL) {
        addResult(data.Heading || query, data.AbstractText, data.AbstractURL, data.AbstractSource ? `DuckDuckGo (${data.AbstractSource})` : 'DuckDuckGo Abstract');
      }

      // 3. Definición de diccionario
      if (data.Definition && data.DefinitionURL) {
        addResult(data.Heading || 'Definición', data.Definition, data.DefinitionURL, data.DefinitionSource ? `DuckDuckGo (${data.DefinitionSource})` : 'DuckDuckGo Definition');
      }

      // 4. Resultados Oficiales / Primarios
      if (data.Results && Array.isArray(data.Results)) {
        data.Results.forEach(r => {
          if (r.FirstURL && r.Text) {
            const title = r.Text.split(' - ')[0] || r.Text;
            addResult(title, r.Text, r.FirstURL, 'DuckDuckGo Web');
          }
        });
      }

      // 5. Temas Relacionados (incluyendo grupos anidados)
      function processRelatedTopics(topics) {
        if (!Array.isArray(topics)) return;
        topics.forEach(item => {
          if (item.Topics && Array.isArray(item.Topics)) {
            processRelatedTopics(item.Topics);
          } else if (item.FirstURL && item.Text) {
            const title = item.Text.split(' - ')[0] || item.Text.slice(0, 70);
            addResult(title, item.Text, item.FirstURL, 'DuckDuckGo Knowledge');
          }
        });
      }

      if (data.RelatedTopics) {
        processRelatedTopics(data.RelatedTopics);
      }

      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Realiza una búsqueda en internet exclusivamente con la API de DuckDuckGo.
   * @param {string} query - Consulta de búsqueda
   * @param {string} lang - Idioma preferido ('es' o 'en')
   * @returns {Promise<{ success: boolean, query: string, count: number, results: Array, markdown: string, elapsedMs: number, error?: string }>}
   */
  async function search(query, lang = 'es') {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) {
      return {
        success: false,
        query: '',
        count: 0,
        results: [],
        markdown: 'No se especificó ninguna consulta de búsqueda.',
        elapsedMs: 0,
        error: 'Consulta vacía'
      };
    }

    const startTime = performance.now();
    const results = await searchDuckDuckGo(cleanQuery);
    const elapsed = parseFloat((performance.now() - startTime).toFixed(2));

    let mdOutput = '';
    const isEn = (lang === 'en');
    if (results.length === 0) {
      mdOutput = isEn
        ? `[DuckDuckGo search for "${cleanQuery}"]: No direct results found. Try searching with different terms or use \`fetch_web_page\` directly with a specific URL.`
        : `[Búsqueda DuckDuckGo para "${cleanQuery}"]: No se encontraron resultados directos. Puedes intentar buscar con otros términos o usar directamente la herramienta \`fetch_web_page\` con una URL concreta.`;
    } else {
      mdOutput = isEn
        ? `### 🔍 DuckDuckGo search results for: "${cleanQuery}" (${results.length} results found):\n\n`
        : `### 🔍 Resultados de búsqueda DuckDuckGo para: "${cleanQuery}" (${results.length} resultados encontrados):\n\n`;
      results.forEach((item, idx) => {
        mdOutput += `${idx + 1}. **[${item.title}](${item.url})**\n`;
        mdOutput += `   - *${isEn ? 'Source' : 'Fuente'}:* \`${item.source}\`\n`;
        if (item.snippet) {
          mdOutput += `   - *${isEn ? 'Snippet' : 'Resumen'}:* ${item.snippet}\n`;
        }
        mdOutput += `   - *${isEn ? 'Link' : 'Enlace'}:* ${item.url}\n\n`;
      });
      mdOutput += isEn
        ? `> *Assistant Note:* If you need to read the full content of a web page call \`fetch_web_page\`, or if it is a PDF document call \`download_pdf\` with the corresponding URL.`
        : `> *Nota para el asistente:* Si necesitas leer el contenido completo de una página web invoca \`fetch_web_page\`, y si se trata de un documento PDF invoca \`download_pdf\` pasando la URL correspondiente.`;
    }

    return {
      success: results.length > 0,
      query: cleanQuery,
      count: results.length,
      results: results,
      markdown: mdOutput,
      elapsedMs: elapsed
    };
  }

  /**
   * Definición estándar de herramienta (Tool/Function Calling) para OpenAI y LLMs compatibles.
   */
  const SEARCH_TOOL_DEFINITION = {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Busca en internet en tiempo real información actualizada, noticias, artículos y enlaces web utilizando DuckDuckGo.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Términos o consulta de búsqueda en DuckDuckGo (ej: "DeepSeek R1", "Node.js 22 features").'
          }
        },
        required: ['query']
      }
    }
  };

  return {
    search,
    SEARCH_TOOL_DEFINITION
  };
});
