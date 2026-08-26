/**
 * Módulo de consulta y navegación de páginas web y documentos PDF en el navegador (ChatWebBrowser).
 * - Permite al modelo en modo agente consultar URLs, páginas web públicas y descargar documentos PDF en tiempo real.
 * - Extrae texto limpio, títulos, enlaces, estructura en Markdown y contenido íntegro de PDFs para integrarlo en el contexto.
 * - Utiliza un motor optimizado para LLMs con soporte CORS universal y fallback local.
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

  function getFileParser() {
    if (typeof window !== 'undefined' && window.ChatFileParser) {
      return window.ChatFileParser;
    }
    if (typeof require !== 'undefined') {
      try {
        return require('./file-parser.js');
      } catch (e) {}
    }
    return null;
  }

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
   * Consulta una página web o descarga un documento PDF y devuelve el contenido legible.
   * @param {string} rawUrl - URL a consultar o descargar
   * @returns {Promise<{ success: boolean, url: string, content: string, byteSize?: number, status?: number, elapsedMs: number, isPdf?: boolean, error?: string }>}
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
    const isPdfUrl = /\.pdf(\?|#|$)/i.test(url);
    const FileParser = getFileParser();

    // 1. Si es una URL local o una API directa, intentar fetch directo primero
    if (isLocalUrl) {
      try {
        const directRes = await fetchWithTimeout(url, {
          headers: { 'Accept': 'application/json,application/pdf,text/html,text/plain,*/*' }
        }, 5000);

        const contentType = (directRes.headers.get('content-type') || '').toLowerCase();
        let content = '';
        let byteSize = 0;
        let isPdf = isPdfUrl || contentType.includes('application/pdf');

        if (isPdf && FileParser && FileParser.extractTextFromPdf) {
          const arrayBuffer = await directRes.arrayBuffer();
          byteSize = arrayBuffer.byteLength;
          const extractedText = await FileParser.extractTextFromPdf(arrayBuffer);
          content = `[Documento PDF: ${url.split('/').pop().split('?')[0] || 'documento.pdf'}]\n[URL: ${url}]\n[Tamaño: ${FileParser.formatBytes ? FileParser.formatBytes(byteSize) : byteSize + ' B'}]\n\n--- Contenido extraído del PDF ---\n\n${extractedText}`;
        } else {
          const rawText = await directRes.text();
          byteSize = rawText.length;
          content = rawText.slice(0, MAX_CONTENT_LENGTH);
        }

        const elapsed = parseFloat((performance.now() - startTime).toFixed(2));
        return {
          success: directRes.ok,
          url: url,
          status: directRes.status,
          content: content,
          byteSize: byteSize,
          isPdf: isPdf,
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

    // 2. Método principal para páginas web públicas y PDFs: Gateway Reader para LLMs (CORS universal y extracción en Markdown)
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
          isPdf: isPdfUrl,
          elapsedMs: elapsed
        };
      }
    } catch (readerErr) {
      console.warn('Reader API no disponible, intentando extracción directa/proxy:', readerErr);
    }

    // 3. Si es un documento PDF, intentar descarga binaria directa y extracción local con FileParser
    if (isPdfUrl && FileParser && FileParser.extractTextFromPdf) {
      try {
        const directRes = await fetchWithTimeout(url, {
          headers: { 'Accept': 'application/pdf,*/*' }
        }, 8000);

        if (directRes.ok) {
          const arrayBuffer = await directRes.arrayBuffer();
          const extractedText = await FileParser.extractTextFromPdf(arrayBuffer);
          const elapsed = parseFloat((performance.now() - startTime).toFixed(2));
          const fileName = url.split('/').pop().split('?')[0] || 'documento.pdf';
          const sizeStr = FileParser.formatBytes ? FileParser.formatBytes(arrayBuffer.byteLength) : arrayBuffer.byteLength + ' B';

          return {
            success: true,
            url: url,
            status: 200,
            content: `[Documento PDF: ${fileName}]\n[URL: ${url}]\n[Tamaño: ${sizeStr}]\n\n--- Contenido extraído del PDF ---\n\n${extractedText}`,
            byteSize: arrayBuffer.byteLength,
            isPdf: true,
            elapsedMs: elapsed
          };
        }
      } catch (pdfErr) {
        console.warn('Descarga directa de PDF bloqueada o fallida:', pdfErr);
      }
    }

    // 4. Fallback: Proxy AllOrigins JSON
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

    // 5. Fallback final: Fetch directo estándar por si el servidor de destino tiene cabeceras CORS
    try {
      const directRes = await fetchWithTimeout(url, {
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/json,application/pdf,text/plain;q=0.9,*/*;q=0.8' }
      }, 5000);

      const contentType = (directRes.headers.get('content-type') || '').toLowerCase();
      let parsedContent;
      let isPdf = isPdfUrl || contentType.includes('application/pdf');

      if (isPdf && FileParser && FileParser.extractTextFromPdf) {
        const arrayBuffer = await directRes.arrayBuffer();
        const extractedText = await FileParser.extractTextFromPdf(arrayBuffer);
        const fileName = url.split('/').pop().split('?')[0] || 'documento.pdf';
        parsedContent = `[Documento PDF: ${fileName}]\n[URL: ${url}]\n\n--- Contenido extraído del PDF ---\n\n${extractedText}`;
      } else {
        const rawText = await directRes.text();
        if (rawText.includes('<html') || rawText.includes('<!DOCTYPE')) {
          parsedContent = extractReadableTextFromHtml(rawText, url);
        } else {
          parsedContent = rawText.slice(0, MAX_CONTENT_LENGTH);
        }
      }

      const elapsed = parseFloat((performance.now() - startTime).toFixed(2));
      return {
        success: directRes.ok,
        url: url,
        status: directRes.status,
        content: parsedContent,
        byteSize: parsedContent.length,
        isPdf: isPdf,
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
        error: `No se pudo acceder a la página web o descargar el documento PDF (${finalErr.message || 'Error de conexión o bloqueo de red'}).`
      };
    }
  }

  /**
   * Definiciones estándar de herramientas (Tool/Function Calling) para OpenAI y LLMs compatibles.
   */
  const WEB_TOOL_DEFINITION = {
    type: 'function',
    function: {
      name: 'fetch_web_page',
      description: 'Descarga y lee el texto y contenido de una página web o artículo a partir de su URL (ej: "https://es.wikipedia.org/wiki/Sol" o "https://nodejs.org/en/about").',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL de la página web a consultar.'
          }
        },
        required: ['url']
      }
    }
  };

  const PDF_TOOL_DEFINITION = {
    type: 'function',
    function: {
      name: 'download_pdf',
      description: 'Descarga un archivo o documento PDF desde una URL web y extrae todo su texto legible para analizarlo e integrarlo en el contexto de la conversación (ej: "https://arxiv.org/pdf/2310.06825.pdf" o "https://ejemplo.com/informe.pdf").',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL directa del documento PDF a descargar y extraer.'
          }
        },
        required: ['url']
      }
    }
  };

  return {
    fetchPage,
    downloadPdf: fetchPage,
    WEB_TOOL_DEFINITION,
    PDF_TOOL_DEFINITION
  };
});
