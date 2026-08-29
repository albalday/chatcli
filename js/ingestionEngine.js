/**
 * Motor de Ingesta y Generación de Resúmenes Estructurados (ChatIngestionEngine).
 *
 * Características:
 * - Procesamiento estrictamente SECUENCIAL (uno a uno) mediante cola no bloqueante.
 * - Extracción en cliente de texto plano (.txt, .md, código) y PDFs (pdfjs-dist con fallback a ChatFileParser).
 * - Generación estructurada de resúmenes (Global + Capítulos) vía LLM con prompts estrictos y JSON parser resiliente.
 * - Estrategia adaptativa para documentos grandes (partición jerárquica por títulos/páginas y síntesis progresiva).
 * - Notificación en tiempo real mediante eventos de progreso (onProgressCallback).
 * - Integración directa y atómica con ChatRagStorage (LocalRAG_DB).
 *
 * Compatible con Browser (file://, http://) y Node.js.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatIngestionEngine = factory();
    root.IngestionEngine = root.ChatIngestionEngine; // Alias corto
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getRagStorage() {
    if (typeof window !== 'undefined' && (window.ChatRagStorage || window.RagStorage)) {
      return window.ChatRagStorage || window.RagStorage;
    }
    if (typeof require !== 'undefined') {
      try { return require('./ragStorage.js'); } catch (e) {}
    }
    return null;
  }

  function getFileParser() {
    if (typeof window !== 'undefined' && window.ChatFileParser) {
      return window.ChatFileParser;
    }
    if (typeof require !== 'undefined') {
      try { return require('./file-parser.js'); } catch (e) {}
    }
    return null;
  }

  function getChatAPI() {
    if (typeof window !== 'undefined' && window.ChatAPI) {
      return window.ChatAPI;
    }
    if (typeof require !== 'undefined') {
      try { return require('./api.js'); } catch (e) {}
    }
    return null;
  }

  function getStorage() {
    if (typeof window !== 'undefined' && window.ChatStorage) {
      return window.ChatStorage;
    }
    if (typeof require !== 'undefined') {
      try { return require('./cookies.js'); } catch (e) {}
    }
    return null;
  }

  // ==========================================================================
  // 1. Parsers de Texto en Cliente
  // ==========================================================================

  /**
   * Normaliza texto limpiando caracteres de control no imprimibles (conserva saltos y tabulaciones).
   */
  function normalizeExtractedText(rawText) {
    if (!rawText) return '';
    let text = typeof rawText === 'string' ? rawText : String(rawText);
    if (text.normalize) {
      text = text.normalize('NFKC');
    }
    // Normalizar saltos de línea a LF
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Eliminar caracteres nulos o de control corruptos
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return text.trim();
  }

  /**
   * Lee un archivo de texto plano (.txt, .md, código) en el navegador o entorno Node.js.
   * @param {File|Blob|string|Buffer} file - Archivo a leer.
   * @returns {Promise<string>} - Contenido de texto normalizado.
   */
  async function extractTextFromPlainText(file) {
    if (!file) return '';

    // Si ya es un string
    if (typeof file === 'string') {
      return normalizeExtractedText(file);
    }

    // Entorno Node.js Buffer
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) {
      return normalizeExtractedText(file.toString('utf-8'));
    }

    // Objeto File o Blob en el navegador
    if (typeof file.text === 'function') {
      const text = await file.text();
      return normalizeExtractedText(text);
    }

    // Fallback con FileReader
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(normalizeExtractedText(reader.result));
        reader.onerror = () => reject(reader.error || new Error('Error al leer archivo con FileReader.'));
        reader.readAsText(file, 'utf-8');
      });
    }

    throw new Error('No se pudo determinar el método de lectura para el archivo de texto.');
  }

  /**
   * Extrae texto página a página de un archivo PDF usando pdfjs-dist o fallback a ChatFileParser.
   * @param {File|Blob|ArrayBuffer|Uint8Array} file - Archivo PDF.
   * @returns {Promise<string>} - Texto estructurado con marcadores de página.
   */
  async function extractTextFromPDF(file) {
    if (!file) return '';

    let arrayBuffer = null;

    if (file instanceof ArrayBuffer) {
      arrayBuffer = file;
    } else if (file instanceof Uint8Array) {
      arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    } else if (typeof file.arrayBuffer === 'function') {
      arrayBuffer = await file.arrayBuffer();
    } else if (typeof FileReader !== 'undefined') {
      arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Error al leer ArrayBuffer del PDF.'));
        reader.readAsArrayBuffer(file);
      });
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) {
      arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    }

    if (!arrayBuffer) {
      throw new Error('No se pudo obtener el ArrayBuffer del documento PDF.');
    }

    // 1. Intentar usar Mozilla pdfjs-dist si está disponible globalmente
    const pdfjs = (typeof window !== 'undefined' && (window.pdfjsLib || window['pdfjs-dist/build/pdf'])) ||
                  (typeof globalThis !== 'undefined' && globalThis.pdfjsLib);

    if (pdfjs && typeof pdfjs.getDocument === 'function') {
      let pdfDoc = null;
      try {
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
        const pageTexts = [];

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          const pageStrings = textContent.items
            ? textContent.items.map(item => item.str || '')
            : [];
          const pageMerged = pageStrings.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
          if (pageMerged.length > 0) {
            pageTexts.push(`--- Página ${i} ---\n${pageMerged}`);
          }
          if (typeof page.cleanup === 'function') {
            page.cleanup();
          }
        }

        const fullPdfText = pageTexts.join('\n\n');
        if (fullPdfText.trim().length > 0) {
          return normalizeExtractedText(fullPdfText);
        }
      } catch (pdfjsErr) {
        console.warn('ChatIngestionEngine: Error con pdfjsLib, recurriendo a ChatFileParser:', pdfjsErr);
      } finally {
        if (pdfDoc && typeof pdfDoc.destroy === 'function') {
          try { await pdfDoc.destroy(); } catch (e) {}
        }
        if (pdfDoc && typeof pdfDoc.cleanup === 'function') {
          try { pdfDoc.cleanup(); } catch (e) {}
        }
        arrayBuffer = null;
      }
    }

    // 2. Fallback fiable: ChatFileParser nativo de ChatCLI
    const FileParser = getFileParser();
    if (FileParser && typeof FileParser.extractTextFromPdf === 'function') {
      const parsedText = await FileParser.extractTextFromPdf(arrayBuffer);
      arrayBuffer = null;
      return normalizeExtractedText(parsedText);
    }

    throw new Error('No se dispone de un motor de extracción de PDF (pdfjs-dist o ChatFileParser).');
  }

  // ==========================================================================
  // 2. Segmentación Inteligente de Texto (Particionador)
  // ==========================================================================

  /**
   * Detecta bloques atómicos que nunca deben cortarse por la mitad (imágenes Markdown, HTML, SVGs, data URIs, bloques de código, etc.).
   */
  function findAtomicBlocks(text) {
    if (!text) return [];
    const ranges = [];

    // 1. Imágenes Markdown: ![alt](url)
    const mdImgRegex = /!\[[^\]]*\]\([^\)]+\)/g;
    let match;
    while ((match = mdImgRegex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, type: 'image_md' });
    }

    // 2. Imágenes HTML y etiquetas img
    const htmlImgRegex = /<img\b[^>]*\/?>/gi;
    while ((match = htmlImgRegex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, type: 'image_html' });
    }

    // 3. Gráficos y diagramas SVG
    const svgRegex = /<svg\b[\s\S]*?<\/svg>/gi;
    while ((match = svgRegex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, type: 'svg' });
    }

    // 4. Data URIs de imágenes embebidas en Base64
    const dataUriRegex = /data:image\/[a-zA-Z0-9\+\-\.]+;base64,[A-Za-z0-9+/=]+/g;
    while ((match = dataUriRegex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, type: 'data_uri' });
    }

    // 5. Bloques de código cercados: ``` ... ```
    const codeBlockRegex = /```[\s\S]*?```/g;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      ranges.push({ start: match.index, end: match.index + match[0].length, type: 'code_block' });
    }

    return ranges.sort((a, b) => a.start - b.start);
  }

  /**
   * Encuentra el punto de corte más seguro y cercano al índice objetivo,
   * respetando los límites de bloques atómicos (imágenes, código, etc.) y prefiriendo saltos de párrafo.
   */
  function findSafeSplitIndex(text, targetIndex, minIndex = 0, atomicRanges = null) {
    if (!text || targetIndex >= text.length) return text ? text.length : 0;
    const ranges = atomicRanges || findAtomicBlocks(text);
    let safeIndex = Math.min(targetIndex, text.length);

    // Si targetIndex cae dentro de un bloque atómico (ej. en medio de una imagen)
    for (const range of ranges) {
      if (safeIndex > range.start && safeIndex < range.end) {
        if (range.start >= minIndex) {
          safeIndex = range.start;
        } else {
          safeIndex = Math.min(range.end, text.length);
        }
        break;
      }
    }

    // Buscar el mejor salto de línea o párrafo antes de safeIndex
    let bestBreak = -1;
    const lastDoubleNl = text.lastIndexOf('\n\n', safeIndex);
    if (lastDoubleNl >= minIndex) {
      const inside = ranges.some(r => lastDoubleNl > r.start && lastDoubleNl < r.end);
      if (!inside) bestBreak = lastDoubleNl + 2;
    }

    if (bestBreak === -1) {
      const lastNl = text.lastIndexOf('\n', safeIndex);
      if (lastNl >= minIndex) {
        const inside = ranges.some(r => lastNl > r.start && lastNl < r.end);
        if (!inside) bestBreak = lastNl + 1;
      }
    }

    if (bestBreak === -1) {
      const lastDot = text.lastIndexOf('. ', safeIndex);
      if (lastDot >= minIndex) {
        const inside = ranges.some(r => lastDot > r.start && lastDot < r.end);
        if (!inside) bestBreak = lastDot + 2;
      }
    }

    return bestBreak !== -1 ? bestBreak : safeIndex;
  }

  /**
   * Divide un documento extenso en fragmentos/capítulos candidatos coherentes por títulos o páginas,
   * unificando subsecciones pequeñas y delimitando el tamaño máximo según el límite de contexto configurado (K).
   */
  function partitionTextIntoHeuristicChapters(text, maxCharsOrLimitK = 16) {
    if (!text) return [];

    const lines = text.split('\n');
    const rawSections = [];
    let currentTitle = 'Introducción / Información General';
    let currentLines = [];

    const headingRegex = /^(?:#{1,6}\s+|--- Página \d+ ---|\[(?:Página|Page)\s+\d+\]|\b(?:Capítulo|Capitulo|Sección|Seccion|Tema|Módulo|Modulo|Module|Section|Chapter|Parte|Part)\s+[0-9A-Za-zIVXLCDM]+[:.]?|\b(?:Overview|Quick Start|Specifications|Special Features|Rear I\/O Panel|Component Overview|CPU Socket|DIMM Slots|PCI_E|M\.?2 Slots|SATA|Front Panel|Power Connectors|Fan Headers|Audio|JRGB|JARGB|EZ Debug|BIOS Setup|RAID Configuration|Driver|Troubleshooting|Safety Information|Package Contents|Block Diagram|Hardware Setup|Software Description|Appendix)\b|^[0-9]+(?:\.[0-9]+)*\s+[A-ZÁÉÍÓÚÑ])/i;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const isHeading = line.length > 0 && line.length < 90 && (
        headingRegex.test(line) ||
        (line.startsWith('#') && line.length > 3)
      );

      if (isHeading) {
        const textSoFar = currentLines.join('\n').trim();
        if (textSoFar.length > 0) {
          rawSections.push({
            title: currentTitle,
            content: textSoFar
          });
          currentLines = [];
        }
        currentTitle = line.replace(/^#+\s*/, '').replace(/---/g, '').replace(/[\[\]]/g, '').trim() || `Sección ${rawSections.length + 1}`;
        currentLines.push(rawLine);
      } else {
        currentLines.push(rawLine);
      }
    }

    if (currentLines.join('\n').trim().length > 0) {
      rawSections.push({
        title: currentTitle,
        content: currentLines.join('\n').trim()
      });
    }

    const totalLen = text.length;
    let maxChapterSize = 16000;
    if (typeof maxCharsOrLimitK === 'number') {
      if (maxCharsOrLimitK <= 512) {
        // En unidades de K (ej: 4, 8, 16, 32, 64, 128)
        maxChapterSize = maxCharsOrLimitK * 1000;
      } else {
        // En caracteres directos (ej: 2000, 5000, 25000)
        maxChapterSize = maxCharsOrLimitK;
      }
    }

    const minSize = Math.max(500, Math.floor(maxChapterSize * 0.3));
    const targetChapters = Math.max(15, Math.ceil(totalLen / maxChapterSize));

    let sectionsToProcess = rawSections;

    if (rawSections.length > targetChapters * 1.5) {
      const coalesced = [];
      let curChunk = [];
      let curChunkTitle = '';
      let curChunkLen = 0;

      for (const sec of rawSections) {
        if (curChunkLen + sec.content.length > maxChapterSize && curChunkLen >= minSize) {
          coalesced.push({
            title: curChunkTitle || ('Capítulo ' + (coalesced.length + 1)),
            content: curChunk.join('\n\n').trim()
          });
          curChunk = [sec.content];
          curChunkTitle = sec.title;
          curChunkLen = sec.content.length;
        } else {
          if (!curChunkTitle) curChunkTitle = sec.title;
          curChunk.push(sec.content);
          curChunkLen += sec.content.length;
        }
      }

      if (curChunk.length > 0) {
        coalesced.push({
          title: curChunkTitle || ('Capítulo ' + (coalesced.length + 1)),
          content: curChunk.join('\n\n').trim()
        });
      }
      sectionsToProcess = coalesced;
    }

    // Subdividir cualquier sección que exceda maxChapterSize protegiendo imágenes y bloques atómicos
    const finalChapters = [];
    for (const sec of sectionsToProcess) {
      if (sec.content.length <= maxChapterSize) {
        finalChapters.push(sec);
      } else {
        const atomicRanges = findAtomicBlocks(sec.content);
        let start = 0;
        let part = 1;
        while (start < sec.content.length) {
          let targetEnd = start + maxChapterSize;
          let safeEnd = findSafeSplitIndex(sec.content, targetEnd, start + minSize, atomicRanges);
          if (safeEnd <= start || safeEnd >= sec.content.length) {
            safeEnd = sec.content.length;
          }
          finalChapters.push({
            title: `${sec.title} (Parte ${part})`,
            content: sec.content.slice(start, safeEnd).trim()
          });
          part++;
          start = safeEnd;
        }
      }
    }

    return finalChapters.filter(c => c.content.length > 0);
  }

  // ==========================================================================
  // 3. Generación Estructurada vía LLM
  // ==========================================================================

  /**
   * Invoca al LLM provisto de forma segura y devuelve su respuesta en texto.
   */
  async function callLLM(llmClient, prompt, systemPrompt = '') {
    if (!llmClient) {
      throw new Error('No se proporcionó un cliente LLM válido para la generación de resúmenes.');
    }

    // 1. Si llmClient es una función directa async (prompt, systemPrompt)
    if (typeof llmClient === 'function') {
      return await llmClient(prompt, systemPrompt);
    }

    // 2. Si llmClient es un objeto con método complete()
    if (typeof llmClient.complete === 'function') {
      return await llmClient.complete({ prompt, systemPrompt });
    }

    // 3. Si llmClient es un objeto con método streamChatCompletion o sendChatCompletion o ChatAPI
    if (typeof llmClient.streamChatCompletion === 'function' || typeof llmClient.sendChatCompletion === 'function') {
      return new Promise((resolve, reject) => {
        let accumulatedText = '';
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const Storage = getStorage();
        const appCfg = (typeof window !== 'undefined' && window.appConfig) ? window.appConfig : (Storage?.loadConfig ? Storage.loadConfig() : {});
        const clientCfg = llmClient.config || {};

        const apiUrl = clientCfg.apiUrl || appCfg.apiUrl || 'http://localhost:1234/v1';
        const apiType = clientCfg.apiType || appCfg.apiType || 'openai';
        const apiKey = clientCfg.apiKey !== undefined ? clientCfg.apiKey : (appCfg.apiKey || '');
        const model = clientCfg.model || appCfg.model || '';

        const apiMethod = llmClient.streamChatCompletion || llmClient.sendChatCompletion;
        apiMethod.call(llmClient, {
          apiUrl,
          apiType,
          apiKey,
          model,
          messages,
          temperature: 0.2,
          enableTools: false,
          enableContextCache: false,
          onChunk: (fullTextSoFar, delta) => {
            if (typeof fullTextSoFar === 'string') accumulatedText = fullTextSoFar;
            else if (delta && delta.content) accumulatedText += delta.content;
          },
          onDone: (finalText) => {
            resolve(typeof finalText === 'string' ? finalText : (finalText?.text || accumulatedText));
          },
          onError: (err) => {
            reject(new Error(typeof err === 'string' ? err : err?.message || 'Error en llamada LLM'));
          }
        });
      });
    }

    throw new Error('El objeto llmClient no implementa una interfaz reconocida (complete o function).');
  }

  /**
   * Extrae y repara un bloque JSON devuelto por un modelo LLM tolerando fallos de sintaxis.
   * Maneja bloques markdown, texto conversacional anterior/posterior, comas sobrantes y caracteres de control.
   */
  function extractJsonFromResponse(rawResponse) {
    if (!rawResponse) return null;
    let clean = String(rawResponse).trim();

    // 1. Eliminar bloques ```json ... ``` o ``` ... ```
    const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
      clean = match[1].trim();
    }

    // 2. Extraer primer '{' y último '}' para ignorar prefacios/sufijos conversacionales
    const startIdx = clean.indexOf('{');
    const endIdx = clean.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      clean = clean.substring(startIdx, endIdx + 1);
    }

    // 3. Intento directo de parseo
    try {
      return JSON.parse(clean);
    } catch (e1) {
      // 4. Limpieza de comas sobrantes (trailing commas: ,} o ,]) y caracteres de control
      try {
        const repaired = clean
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u0000-\u0019]+/g, ' ');
        return JSON.parse(repaired);
      } catch (e2) {
        return null;
      }
    }
  }

  /**
   * Analiza la estructura del documento y genera el resumen global y los micro-resúmenes de capítulos.
   * Cuenta con auto-reintento (1 reintento) si la respuesta inicial no es JSON estructurado válido.
   * @param {string} text - Texto íntegro del documento.
   * @param {string} filename - Nombre del archivo.
   * @param {Object|Function} llmClient - Cliente de invocación del LLM.
   * @returns {Promise<{ globalSummary: string, chapters: Array<{ chapterId: number, title: string, summary: string, content: string, charCount: number }> }>}
   */
  async function analyzeDocumentStructure(text, filename, llmClient, onChapterProgress, contextLimitK = 16) {
    const cleanText = normalizeExtractedText(text);
    if (!cleanText) {
      return {
        globalSummary: `Documento vacío: ${filename}`,
        chapters: []
      };
    }

    const SYSTEM_PROMPT = `Eres un asistente de indexación documental y extracción estructurada para un sistema RAG local.
Tu misión es analizar el texto del documento y responder EXCLUSIVAMENTE con un objeto JSON válido con la siguiente estructura:
{
  "globalSummary": "Resumen conciso y temático del documento completo (150-250 palabras).",
  "chapters": [
    {
      "chapterId": 1,
      "title": "Título descriptivo del capítulo o sección",
      "summary": "Resumen técnico de 2-4 frases de lo que se cubre aquí.",
      "content": "Texto original íntegro o sección clave asignada a este capítulo."
    }
  ]
}
No incluyas texto explicativo antes ni después del bloque JSON.`;

    // Si el texto es de longitud moderada (<= 12.000 caracteres / ~3.000 tokens)
    if (cleanText.length <= 12000) {
      const prompt = `Analiza el siguiente documento titulado "${filename}" y divide su contenido en capítulos lógicos estructurados con sus respectivos resúmenes y el resumen global:\n\n---\n${cleanText}\n---`;

      try {
        let responseText = await callLLM(llmClient, prompt, SYSTEM_PROMPT);
        let parsed = extractJsonFromResponse(responseText);

        // Auto-reintento (máximo 1 reintento) si el primer intento no es JSON estructurado válido
        if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
          try {
            const retryPrompt = `La respuesta anterior no era un JSON válido. Devuelve ÚNICAMENTE el objeto JSON estructurado con "globalSummary" y "chapters" para el documento "${filename}":\n\n---\n${cleanText}\n---`;
            const retryResponse = await callLLM(llmClient, retryPrompt, SYSTEM_PROMPT);
            const retryParsed = extractJsonFromResponse(retryResponse);
            if (retryParsed && Array.isArray(retryParsed.chapters) && retryParsed.chapters.length > 0) {
              parsed = retryParsed;
            }
          } catch (retryErr) {
            // Continuar al particionador heurístico
          }
        }

        if (parsed && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
          return {
            globalSummary: parsed.globalSummary || `Resumen del documento ${filename}`,
            chapters: parsed.chapters.map((ch, idx) => ({
              chapterId: idx + 1,
              title: ch.title || `Capítulo ${idx + 1}`,
              summary: ch.summary || '',
              content: ch.content || cleanText,
              charCount: (ch.content || cleanText).length
            }))
          };
        }
      } catch (err) {
        // Fallback al particionador heurístico
      }
    }

    // Estrategia para documentos extensos:
    // Partición heurística coalescida respetando el límite de contexto K y bloques atómicos (imágenes, código, tablas)
    const candidateChapters = partitionTextIntoHeuristicChapters(cleanText, contextLimitK);
    const processedChapters = [];
    const chapterSummaries = [];
    const totalChapters = candidateChapters.length;

    for (let i = 0; i < totalChapters; i++) {
      const cand = candidateChapters[i];

      if (typeof onChapterProgress === 'function') {
        try {
          onChapterProgress(i + 1, totalChapters, cand.title);
        } catch (e) {}
      }

      // Muestreo ágil adaptado al tamaño de contexto K configurado
      const maxSampleChars = Math.min(6000, Math.max(2000, contextLimitK * 250));
      const sampleText = cand.content.length > maxSampleChars ? (cand.content.slice(0, maxSampleChars) + '...') : cand.content;
      const chapPrompt = `Sintetiza de forma muy concisa (2 a 4 frases técnicas) el siguiente fragmento del documento "${filename}" titulado "${cand.title}":\n\n${sampleText}`;

      let chapSummary = '';
      try {
        chapSummary = await callLLM(llmClient, chapPrompt, 'Eres un sintetizador técnico. Responde solo con el resumen conciso de 2 a 4 frases.');
        chapSummary = chapSummary.trim().replace(/^Resumen:\s*/i, '');
      } catch (e) {
        chapSummary = `Sección sobre ${cand.title}.`;
      }

      chapterSummaries.push(`- ${cand.title}: ${chapSummary}`);
      processedChapters.push({
        chapterId: i + 1,
        title: cand.title,
        summary: chapSummary,
        content: cand.content,
        charCount: cand.content.length
      });
    }

    // Generar resumen global a partir de los micro-resúmenes
    let globalSummary = '';
    try {
      const summariesBlock = chapterSummaries.join('\n').slice(0, 4000);
      const globalPrompt = `A partir de los siguientes resúmenes de secciones del documento "${filename}", redacta un resumen global conciso y cohesivo (100-200 palabras):\n\n${summariesBlock}`;
      globalSummary = await callLLM(llmClient, globalPrompt, 'Eres un redactor técnico. Responde únicamente con el resumen global.');
      globalSummary = globalSummary.trim();
    } catch (e) {
      globalSummary = `Documento ${filename} compuesto por ${processedChapters.length} secciones estructuradas.`;
    }

    return {
      globalSummary,
      chapters: processedChapters
    };
  }

  // ==========================================================================
  // 4. Motor de Cola Secuencial (Queue Processor)
  // ==========================================================================

  /**
   * Determina el tipo de archivo soportado a partir del nombre o tipo MIME.
   */
  function detectFileType(file) {
    const name = (file && file.name) ? String(file.name).toLowerCase() : '';
    if (name.endsWith('.pdf') || (file && file.type === 'application/pdf')) return 'pdf';
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
    return 'txt';
  }

  /**
   * Procesa un conjunto de archivos de forma estrictamente SECUENCIAL (uno a uno)
   * emitiendo eventos de progreso continuos y guardando los resultados en IndexedDB.
   *
   * @param {Array<File|Blob|Object>} files - Lista de archivos a ingerir.
   * @param {string} branchId - ID de la rama destino.
   * @param {Object|Function} llmClient - Cliente de IA configurado.
   * @param {Function} [onProgressCallback] - Callback de estado: (progress: IngestionProgress) => void.
   * @param {Object} [options] - Opciones adicionales ({ ragContextLimitK: number }).
   * @returns {Promise<{ total: number, processed: number, failed: number, documents: Array<Object>, errors: Array<Object> }>}
   */
  async function processDocumentQueue(files, branchId, llmClient, onProgressCallback, options = {}) {
    const fileList = Array.isArray(files) ? files : [files];
    const totalFiles = fileList.length;
    const RagStorage = getRagStorage();
    const Storage = getStorage();
    const appCfg = (typeof window !== 'undefined' && window.appConfig) ? window.appConfig : (Storage?.loadConfig ? Storage.loadConfig() : {});
    const contextLimitK = options.ragContextLimitK || llmClient?.config?.ragContextLimitK || appCfg?.ragContextLimitK || 16;

    if (!RagStorage) {
      throw new Error('ChatRagStorage no está disponible para persistir los documentos de la cola.');
    }

    if (!branchId) {
      throw new Error('Se requiere un branchId válido para la ingesta de documentos.');
    }

    function emitProgress(fileIndex, fileName, status, message, errorDetails, percent) {
      if (typeof onProgressCallback === 'function') {
        try {
          const calcPercent = typeof percent === 'number'
            ? percent
            : Math.round(((fileIndex) / totalFiles) * 100);
          onProgressCallback({
            fileIndex,
            totalFiles,
            fileName,
            status,
            message,
            percent: Math.min(100, Math.max(0, calcPercent)),
            errorDetails
          });
        } catch (cbErr) {
          console.warn('ChatIngestionEngine: Error en onProgressCallback:', cbErr);
        }
      }
    }

    const result = {
      total: totalFiles,
      processed: 0,
      failed: 0,
      documents: [],
      errors: []
    };

    console.info(`[ChatIngestionEngine] Iniciando cola secuencial de ${totalFiles} archivo(s) para la rama [${branchId}] con límite ${contextLimitK}K.`);

    // BUCLE SECUENCIAL ESTRICTO (un archivo no inicia hasta guardar el anterior)
    for (let index = 0; index < totalFiles; index++) {
      const file = fileList[index];
      const fileName = file.name || `documento_${index + 1}`;
      const fileSize = file.size || (typeof file.content === 'string' ? file.content.length : 0);
      const fileType = detectFileType(file);

      try {
        const basePercent = Math.round((index / totalFiles) * 100);

        // Paso 1: Lectura y Extracción
        if (fileType === 'pdf') {
          emitProgress(index, fileName, 'extracting_pdf', `Extrayendo texto del PDF "${fileName}" (${index + 1}/${totalFiles})...`, null, basePercent + 5);
        } else {
          emitProgress(index, fileName, 'reading', `Leyendo archivo "${fileName}" (${index + 1}/${totalFiles})...`, null, basePercent + 5);
        }

        let rawText = '';
        if (typeof file.content === 'string') {
          rawText = normalizeExtractedText(file.content);
        } else if (fileType === 'pdf') {
          rawText = await extractTextFromPDF(file);
        } else {
          rawText = await extractTextFromPlainText(file);
        }

        if (!rawText || rawText.trim().length === 0) {
          throw new Error(`El archivo "${fileName}" no contiene texto extraíble.`);
        }

        // Paso 2: Análisis Estructurado y Generación de Resúmenes vía LLM con seguimiento granular de capítulos
        emitProgress(index, fileName, 'generating_summaries', `Analizando estructura y preparando resúmenes (${index + 1}/${totalFiles})...`, null, basePercent + 15);

        const structure = await analyzeDocumentStructure(rawText, fileName, llmClient, (curChap, totChaps, chapTitle) => {
          const chapFrac = curChap / totChaps;
          const currentPct = Math.round(basePercent + 15 + (chapFrac * 70 / totalFiles));
          emitProgress(
            index,
            fileName,
            'generating_summaries',
            `🧠 Resumiendo Cap. ${curChap}/${totChaps} (${Math.round(chapFrac * 100)}%): "${chapTitle}"`,
            null,
            currentPct
          );
        }, contextLimitK);

        // Paso 3: Persistencia en IndexedDB
        emitProgress(index, fileName, 'saving', `Guardando capítulos en base de datos local (${index + 1}/${totalFiles})...`, null, basePercent + 90);
        const docPayload = {
          branchId: branchId,
          title: fileName,
          fileType: fileType,
          fileSize: fileSize,
          globalSummary: structure.globalSummary,
          chapters: structure.chapters
        };

        const savedDoc = await RagStorage.saveDocument(docPayload);

        // Paso 4: Completado para este archivo
        emitProgress(index, fileName, 'completed', `Documento "${fileName}" procesado y guardado con éxito (${index + 1}/${totalFiles}).`, null, Math.round(((index + 1) / totalFiles) * 100));
        result.processed++;
        result.documents.push(savedDoc);

      } catch (fileErr) {
        const errorMsg = fileErr?.message || String(fileErr);
        console.error(`[ChatIngestionEngine] Fallo al procesar archivo "${fileName}":`, fileErr);

        emitProgress(index, fileName, 'error', `Error al procesar "${fileName}": ${errorMsg}`, errorMsg);
        result.failed++;
        result.errors.push({
          fileName,
          error: errorMsg
        });
        // Continúa con el siguiente archivo sin abortar toda la cola
      }
    }

    console.info(`[ChatIngestionEngine] Cola completada. Éxito: ${result.processed}, Fallos: ${result.failed}.`);
    return result;
  }

  // ==========================================================================
  // Exportación Pública
  // ==========================================================================

  return {
    normalizeExtractedText,
    extractTextFromPlainText,
    extractTextFromPDF,
    partitionTextIntoHeuristicChapters,
    analyzeDocumentStructure,
    processDocumentQueue
  };
});
