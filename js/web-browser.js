/**
 * Módulo de consulta y navegación de páginas web en el navegador (ChatWebBrowser).
 * - Permite al modelo en modo agente consultar URLs y páginas web públicas en tiempo real.
 * - Utiliza un motor de lectura y extracción optimizado para LLMs con soporte CORS universal.
 * - Extrae texto limpio, títulos, enlaces y estructura en Markdown.
 * - Compatible con file:// y http://.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatWebBrowser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_CONTENT_LENGTH = 60000;
  const TIMEOUT_MS = 12000;

  /**
   * Extrae el texto legible y estructurado de un documento HTML local.
   */
  function extractReadableTextFromHtml(htmlString, targetUrl) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');

      // Eliminar scripts, estilos, iframes y elementos no relevantes
      const elementsToRemove = doc.querySelectorAll('script, style, noscript, iframe, svg, canvas, nav, footer, form');
      elementsToRemove.forEach(el => el.remove());

      const title = doc.querySelector('title') ? doc.querySelector('title').innerText.trim() : '';
      const metaDesc = doc.querySelector('meta[name="description"]') ? doc.querySelector('meta[name="description"]').getAttribute('content') : '';

      // Obtener el cuerpo principal
      const mainElement = doc.querySelector('main, article, #content, .content, #main, .main-content') || doc.body;
      let text = mainElement ? (mainElement.innerText || mainElement.textContent || '') : '';

      text = text.replace(/\r\n/g, '\n')
                 .replace(/[ \t]+/g, ' ')
                 .replace(/\n\s*\n\s*\n+/g, '\n\n')
                 .trim();

      let headerInfo = `[Título: ${title || 'Sin título'}]\n[URL: ${targetUrl}]\n`;
      if (metaDesc) headerInfo += `[Descripción: ${metaDesc}]\n`;
      headerInfo += '\n--- Contenido de la página ---\n';

      const fullOutput = headerInfo + text;
      if (fullOutput.length > MAX_CONTENT_LENGTH) {
        return fullOutput.slice(0, MAX_CONTENT_LENGTH) + '\n\n[... Contenido truncado por longitud ...]';
      }
      return fullOutput;
    } catch (e) {
      return htmlString.slice(0, MAX_CONTENT_LENGTH);
    }
  }

  /**
   * Realiza un fetch con timeout controlado.
   */
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
   * Consulta una página web o endpoint y devuelve el contenido legible.
   * @param {string} rawUrl - URL a consultar
   * @returns {Promise<{ success: boolean, url: string, content: string, byteSize?: number, status?: number, elapsedMs: number, error?: string }>}
   */
  async function fetchPage(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) {
      return {
        success: false,
        url: '',
        content: '',
        elapsedMs: 0,
        error: 'No se proporcionó una URL válida.'
      };
    }

    // Normalizar protocolo
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const startTime = performance.now();
    const isLocalUrl = /^(https?:\/\/)?(localhost|127\.0\.0\.1|192\.168\.|10\.|0\.0\.0\.0)/i.test(url);

    // 1. Si es una URL local o una API directa, intentar fetch directo primero
    if (isLocalUrl) {
      try {
        const directRes = await fetchWithTimeout(url, {
          headers: { 'Accept': 'application/json,text/html,text/plain,*/*' }
        }, 5000);

        const rawText = await directRes.text();
        const elapsed = parseFloat((performance.now() - startTime).toFixed(2));

        return {
          success: directRes.ok,
          url: url,
          status: directRes.status,
          content: rawText.slice(0, MAX_CONTENT_LENGTH),
          byteSize: rawText.length,
          elapsedMs: elapsed,
          error: directRes.ok ? undefined : `HTTP ${directRes.status}`
        };
      } catch (localErr) {
        const elapsed = parseFloat((performance.now() - startTime).toFixed(2));
        return {
          success: false,
          url: url,
          content: '',
          elapsedMs: elapsed,
          error: `Error al conectar con host local: ${localErr.message}`
        };
      }
    }

    // 2. Método principal para páginas web públicas: Gateway Reader para LLMs (CORS universal y extracción en Markdown)
    try {
      const readerUrl = `https://r.jina.ai/${url}`;
      const readerRes = await fetchWithTimeout(readerUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'markdown'
        }
      }, TIMEOUT_MS);

      if (readerRes.ok) {
        let content = await readerRes.text();
        const elapsed = parseFloat((performance.now() - startTime).toFixed(2));

        if (content.length > MAX_CONTENT_LENGTH) {
          content = content.slice(0, MAX_CONTENT_LENGTH) + '\n\n[... Contenido truncado por límite de tamaño ...]';
        }

        return {
          success: true,
          url: url,
          status: 200,
          content: content,
          byteSize: content.length,
          elapsedMs: elapsed
        };
      }
    } catch (readerErr) {
      console.warn('Reader API no disponible, intentando proxy alternativo:', readerErr);
    }

    // 3. Fallback: Proxy AllOrigins JSON
    try {
      const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const aoRes = await fetchWithTimeout(allOriginsUrl, {}, 8000);

      if (aoRes.ok) {
        const aoData = await aoRes.json();
        const rawHtml = aoData.contents || '';
        const elapsed = parseFloat((performance.now() - startTime).toFixed(2));

        if (rawHtml) {
          const parsedContent = extractReadableTextFromHtml(rawHtml, url);
          return {
            success: true,
            url: url,
            status: aoData.status?.http_code || 200,
            content: parsedContent,
            byteSize: rawHtml.length,
            elapsedMs: elapsed
          };
        }
      }
    } catch (aoErr) {
      console.warn('Fallback AllOrigins no disponible:', aoErr);
    }

    // 4. Fallback final: Fetch directo estándar por si el servidor de destino tiene cabeceras CORS
    try {
      const directRes = await fetchWithTimeout(url, {
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8' }
      }, 5000);

      const rawText = await directRes.text();
      const elapsed = parseFloat((performance.now() - startTime).toFixed(2));

      let parsedContent;
      if (rawText.includes('<html') || rawText.includes('<!DOCTYPE')) {
        parsedContent = extractReadableTextFromHtml(rawText, url);
      } else {
        parsedContent = rawText.slice(0, MAX_CONTENT_LENGTH);
      }

      return {
        success: directRes.ok,
        url: url,
        status: directRes.status,
        content: parsedContent,
        byteSize: rawText.length,
        elapsedMs: elapsed,
        error: directRes.ok ? undefined : `HTTP ${directRes.status}: ${directRes.statusText}`
      };
    } catch (finalErr) {
      const elapsed = parseFloat((performance.now() - startTime).toFixed(2));
      return {
        success: false,
        url: url,
        content: '',
        elapsedMs: elapsed,
        error: `No se pudo acceder a la página web (${finalErr.message || 'Error de conexión o bloqueo de red'}).`
      };
    }
  }

  /**
   * Definición estándar de herramienta (Tool/Function Calling) para OpenAI.
   */
  const WEB_TOOL_DEFINITION = {
    type: 'function',
    function: {
      name: 'fetch_web_page',
      description: 'Descarga el texto de una URL web (ej: "https://es.wikipedia.org/wiki/Sol").',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL a consultar.'
          }
        },
        required: ['url']
      }
    }
  };

  return {
    fetchPage,
    WEB_TOOL_DEFINITION
  };
});
