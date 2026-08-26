/**
 * Módulo de Búsqueda en Internet en Tiempo Real (ChatWebSearch) para ChatCLI.
 * - Motor de búsqueda multitrayecto (DuckDuckGo Web Results + Universal Reader Gateway + DDG Instant Answers + Wikipedia).
 * - Diseñado para no bloquearse por peticiones repetidas, sin límites ni CAPTCHAs.
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

  const TIMEOUT_MS = 10000;

  function unwrapDdgUrl(rawUrl) {
    if (!rawUrl) return '';
    const match = rawUrl.match(/[?&]uddg=([^&]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch (e) {
        return match[1];
      }
    }
    if (rawUrl.startsWith('//')) return 'https:' + rawUrl;
    return rawUrl;
  }

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
   * Extrae resultados reales de búsqueda web desde Markdown generado por Reader Gateway.
   */
  function parseDdgMarkdown(md) {
    const results = [];
    const seenUrls = new Set();

    const sections = md.split(/\n(?=##\s*\[)/);
    for (const sec of sections) {
      const titleMatch = sec.match(/^##\s*\[([^\]]+)\]\(([^)]+)\)/);
      if (!titleMatch) continue;
      const rawTitle = titleMatch[1].trim();
      const rawUrl = titleMatch[2].trim();
      const realUrl = unwrapDdgUrl(rawUrl);

      if (!realUrl || seenUrls.has(realUrl.toLowerCase()) || realUrl.includes('duckduckgo.com/html') || realUrl.includes('duckduckgo.com/?q=')) {
        continue;
      }
      seenUrls.add(realUrl.toLowerCase());

      const linkMatches = [...sec.matchAll(/\[([^\]]{25,})\]\([^)]+\)/g)];
      let snippet = '';
      if (linkMatches.length > 0) {
        snippet = linkMatches[linkMatches.length - 1][1].replace(/\*\*/g, '').trim();
      } else {
        const lines = sec.split('\n').filter(l => !l.startsWith('##') && !l.startsWith('[!') && l.trim().length > 20);
        if (lines.length > 0) {
          snippet = lines.join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').trim();
        }
      }

      results.push({
        title: rawTitle,
        url: realUrl,
        snippet: snippet,
        source: 'DuckDuckGo Web'
      });
    }
    return results;
  }

  /**
   * Extrae resultados de DuckDuckGo desde HTML crudo.
   */
  function parseDdgHtml(html) {
    const results = [];
    const seenUrls = new Set();

    const blockRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>|$)/g;
    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      const rawUrl = match[1].trim();
      const rawTitle = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = (match[3] || match[4] || '').replace(/<[^>]*>/g, '').trim();
      const realUrl = unwrapDdgUrl(rawUrl);

      if (realUrl && !seenUrls.has(realUrl.toLowerCase()) && !realUrl.includes('duckduckgo.com/html')) {
        seenUrls.add(realUrl.toLowerCase());
        results.push({
          title: rawTitle,
          url: realUrl,
          snippet: snippet,
          source: 'DuckDuckGo Web'
        });
      }
    }
    return results;
  }

  /**
   * Consulta DuckDuckGo Instant Answer API.
   */
  async function searchDdgInstantApi(query) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`;
      const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, 4000);
      if (!res.ok) return [];
      const data = await res.json();
      const results = [];

      if (data.Answer) {
        results.push({
          title: 'Respuesta Directa',
          snippet: data.Answer,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          source: 'DuckDuckGo Instant Answer'
        });
      }
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL,
          source: data.AbstractSource ? `DuckDuckGo (${data.AbstractSource})` : 'DuckDuckGo Abstract'
        });
      }
      if (data.Results && Array.isArray(data.Results)) {
        data.Results.forEach(r => {
          if (r.FirstURL && r.Text) {
            results.push({
              title: r.Text.split(' - ')[0] || r.Text,
              snippet: r.Text,
              url: r.FirstURL,
              source: 'DuckDuckGo'
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
   * Realiza la búsqueda web utilizando todas las vías disponibles de forma resiliente.
   */
  async function searchDuckDuckGo(query) {
    const cleanQuery = query.trim();

    // 1. Vía Universal Reader Gateway (con bypass CORS transparente para resultados web completos de DuckDuckGo)
    try {
      const targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
      const readerUrl = `https://r.jina.ai/${targetUrl}`;
      const res = await fetchWithTimeout(readerUrl, { headers: { 'Accept': 'text/plain' } }, 7000);
      if (res.ok) {
        const md = await res.text();
        const results = parseDdgMarkdown(md);
        if (results.length > 0) {
          return results;
        }
      }
    } catch (e) {
      console.warn('Reader Gateway no disponible para búsqueda web, intentando vía directa:', e.message);
    }

    // 2. Vía Directa a DuckDuckGo HTML
    try {
      const targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
      const res = await fetchWithTimeout(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }, 5000);
      if (res.ok) {
        const html = await res.text();
        const results = parseDdgHtml(html);
        if (results.length > 0) {
          return results;
        }
      }
    } catch (e) {
      console.warn('DuckDuckGo HTML directo no disponible:', e.message);
    }

    // 3. Vía DuckDuckGo Instant Answer API
    try {
      const apiResults = await searchDdgInstantApi(cleanQuery);
      if (apiResults.length > 0) {
        return apiResults;
      }
    } catch (e) {}

    // 4. Vía Wikipedia Search API (fallback enciclopédico garantizado)
    try {
      const wikiUrl = `https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanQuery)}&limit=5&namespace=0&format=json&origin=*`;
      const res = await fetchWithTimeout(wikiUrl, {}, 4000);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data) && data[1] && data[1].length > 0) {
          const wikiResults = [];
          for (let i = 0; i < data[1].length; i++) {
            wikiResults.push({
              title: data[1][i],
              snippet: data[2] ? data[2][i] || '' : '',
              url: data[3] ? data[3][i] : '',
              source: 'Wikipedia'
            });
          }
          if (wikiResults.length > 0) {
            return wikiResults;
          }
        }
      }
    } catch (e) {}

    return [];
  }

  /**
   * Realiza una búsqueda en internet en tiempo real.
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
            description: 'Términos o consulta de búsqueda en DuckDuckGo (ej: "INE poblacion Ceuta padron", "DeepSeek R1").'
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
