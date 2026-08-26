/**
 * Módulo de Búsqueda en Internet en Tiempo Real (ChatWebSearch) para ChatCLI.
 * - Motor de búsqueda multi-fuente federado con soporte nativo de CORS (DuckDuckGo + Wikipedia + Algolia Live Web).
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

  const TIMEOUT_MS = 9000;

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

  function cleanSnippet(htmlSnippet) {
    if (!htmlSnippet) return '';
    return htmlSnippet
      .replace(/<span class="searchmatch">/gi, '**')
      .replace(/<\/span>/gi, '**')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Consulta DuckDuckGo Instant Answer API (CORS oficial).
   */
  async function searchDuckDuckGo(query) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetchWithTimeout(url, {}, 5000);
      if (!res.ok) return [];

      const data = await res.json();
      const results = [];

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          source: 'DuckDuckGo Instant Answer',
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL
        });
      }

      if (data.Results && Array.isArray(data.Results)) {
        data.Results.slice(0, 2).forEach(r => {
          if (r.FirstURL && r.Text) {
            results.push({
              source: 'DuckDuckGo Web',
              title: r.Text.split(' - ')[0] || r.Text,
              snippet: r.Text,
              url: r.FirstURL
            });
          }
        });
      }

      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.slice(0, 3).forEach(rt => {
          if (rt.FirstURL && rt.Text) {
            results.push({
              source: 'DuckDuckGo Related',
              title: rt.Text.slice(0, 70) + (rt.Text.length > 70 ? '...' : ''),
              snippet: rt.Text,
              url: rt.FirstURL
            });
          }
        });
      }

      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Consulta Wikipedia Full-Text Search API (CORS origin=* ilimitado).
   */
  async function searchWikipedia(query, lang = 'es') {
    try {
      const targetLang = (lang === 'en') ? 'en' : 'es';
      const url = `https://${targetLang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*&srlimit=5`;
      const res = await fetchWithTimeout(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ChatCLI/1.0 (https://github.com/albalday/chatcli; albalday@users.noreply.github.com)'
        }
      }, 6000);
      if (!res.ok) return [];

      const data = await res.json();
      const results = [];

      if (data.query && data.query.search && Array.isArray(data.query.search)) {
        data.query.search.forEach(item => {
          const title = item.title;
          const snippet = cleanSnippet(item.snippet);
          const articleUrl = `https://${targetLang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
          results.push({
            source: `Wikipedia (${targetLang.toUpperCase()})`,
            title: title,
            snippet: snippet,
            url: articleUrl
          });
        });
      }

      // Si el idioma principal era 'es' y no hubo resultados, probar en inglés como respaldo
      if (results.length === 0 && targetLang === 'es') {
        const enUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*&srlimit=3`;
        const enRes = await fetchWithTimeout(enUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'ChatCLI/1.0 (https://github.com/albalday/chatcli; albalday@users.noreply.github.com)'
          }
        }, 5000);
        if (enRes.ok) {
          const enData = await enRes.json();
          if (enData.query && enData.query.search && Array.isArray(enData.query.search)) {
            enData.query.search.forEach(item => {
              const title = item.title;
              const snippet = cleanSnippet(item.snippet);
              const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
              results.push({
                source: `Wikipedia (EN)`,
                title: title,
                snippet: snippet,
                url: articleUrl
              });
            });
          }
        }
      }

      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Consulta Algolia Live Web / Tech News API (CORS oficial sin bloqueos).
   */
  async function searchAlgoliaLive(query) {
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=3`;
      const res = await fetchWithTimeout(url, {}, 5000);
      if (!res.ok) return [];

      const data = await res.json();
      const results = [];

      if (data.hits && Array.isArray(data.hits)) {
        data.hits.forEach(hit => {
          const title = hit.title || '';
          const hitUrl = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
          const dateStr = hit.created_at ? hit.created_at.slice(0, 10) : '';
          const points = hit.points || 0;
          results.push({
            source: 'Web & Tech News',
            title: title,
            snippet: `Publicación / Noticia [${dateStr}] con ${points} puntos. Enlace directo: ${hitUrl}`,
            url: hitUrl
          });
        });
      }

      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * Realiza una búsqueda federada en internet.
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

    // Ejecutar consultas en paralelo sin que el fallo de una bloquee a las demás
    const [ddgSettled, wikiSettled, algoliaSettled] = await Promise.allSettled([
      searchDuckDuckGo(cleanQuery),
      searchWikipedia(cleanQuery, lang),
      searchAlgoliaLive(cleanQuery)
    ]);

    const ddgResults = ddgSettled.status === 'fulfilled' ? ddgSettled.value : [];
    const wikiResults = wikiSettled.status === 'fulfilled' ? wikiSettled.value : [];
    const algoliaResults = algoliaSettled.status === 'fulfilled' ? algoliaSettled.value : [];

    // Unificar y deduplicar por URL
    const seenUrls = new Set();
    const combined = [];

    [...ddgResults, ...wikiResults, ...algoliaResults].forEach(item => {
      if (item && item.url && !seenUrls.has(item.url.toLowerCase())) {
        seenUrls.add(item.url.toLowerCase());
        combined.push(item);
      }
    });

    const elapsed = parseFloat((performance.now() - startTime).toFixed(2));

    // Formatear salida estructurada en Markdown para el LLM
    let mdOutput = '';
    if (combined.length === 0) {
      mdOutput = `[Búsqueda Web para "${cleanQuery}"]: No se encontraron resultados directos en las fuentes disponibles.`;
    } else {
      mdOutput = `### 🔍 Resultados de búsqueda web para: "${cleanQuery}" (${combined.length} fuentes encontradas):\n\n`;
      combined.forEach((item, idx) => {
        mdOutput += `${idx + 1}. **[${item.title}](${item.url})**\n`;
        mdOutput += `   - *Fuente:* \`${item.source}\`\n`;
        if (item.snippet) {
          mdOutput += `   - *Resumen:* ${item.snippet}\n`;
        }
        mdOutput += `   - *Enlace:* ${item.url}\n\n`;
      });
      mdOutput += `> *Nota para el asistente:* Si necesitas leer el contenido íntegro de cualquiera de estos enlaces, puedes invocar la herramienta \`fetch_web_page\` pasando la URL correspondiente.`;
    }

    return {
      success: combined.length > 0,
      query: cleanQuery,
      count: combined.length,
      results: combined,
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
      description: 'Busca en internet en tiempo real información actualizada, noticias, artículos, documentación y enlaces web.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Términos o consulta de búsqueda (ej: "últimas novedades DeepSeek", "Node.js 22 features").'
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
