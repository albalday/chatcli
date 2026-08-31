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

    // 2. Fallback fiable: ChatFileParser nativo de ZeroChat
    const FileParser = getFileParser();
    if (FileParser && typeof FileParser.extractTextFromPdf === 'function') {
      const parsedText = await FileParser.extractTextFromPdf(arrayBuffer);
      arrayBuffer = null;
      const normalized = normalizeExtractedText(parsedText);
      const res = new String(normalized);
      res.images = parsedText.images || [];
      return res;
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
   * Prepara el texto para el LLM durante la fase de resumen, extrayendo el contexto relevante
   * de las imágenes (~10 líneas antes y después) y eliminando las cadenas base64 pesadas.
   */
  function prepareTextForSummarization(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const resultLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const imgMatch = line.match(/!\[([^\]]*)\]\((?:data:image\/[^)]+|rag-image:\/\/[^)]+|https?:\/\/[^)]+)\)/i) ||
                       line.match(/<img\b[^>]*alt=["']([^"']*)["'][^>]*\/?>/i) ||
                       line.match(/!\[([^\]]*)\]\(.*?\)/i);
      if (imgMatch) {
        const label = (imgMatch[1] || 'Diagrama / Esquema').trim();
        const before = lines.slice(Math.max(0, i - 8), i)
          .filter(l => !l.includes('data:image') && !l.includes('rag-image://'))
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .join(' ');
        const after = lines.slice(i + 1, Math.min(lines.length, i + 9))
          .filter(l => !l.includes('data:image') && !l.includes('rag-image://'))
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .join(' ');
        const contextSnippet = (before + ' ' + after).slice(0, 400).trim();
        resultLines.push(`[IMAGEN / ESQUEMA: "${label}" | Referencia de contenido (contexto): ${contextSnippet || 'Diagrama técnico del capítulo'}]`);
      } else if (!line.includes('data:image/')) {
        resultLines.push(line);
      }
    }
    return resultLines.join('\n');
  }

  /**
   * Divide un documento extenso en fragmentos/capítulos candidatos coherentes.
   * Si es un PDF/documento paginado, realiza el corte ESTRICTAMENTE por páginas completas.
   * En otros documentos, particiona por secciones y protege bloques atómicos respetando el límite K.
   */
  function partitionTextIntoHeuristicChapters(text, maxCharsOrLimitK = 16) {
    if (!text) return [];

    let maxChapterSize = 256000;
    if (typeof maxCharsOrLimitK === 'number') {
      if (maxCharsOrLimitK <= 2048) {
        // En unidades de K tokens (1K tokens ~ 4.000 caracteres)
        const kTokens = Math.min(1024, Math.max(16, maxCharsOrLimitK));
        maxChapterSize = kTokens * 4000;
      } else {
        maxChapterSize = maxCharsOrLimitK;
      }
    }

    const headingRegex = /^(?:#{1,6}\s+|--- (?:Página|Page)\s+\d+\s+---|\[(?:Página|Page)\s+\d+\]|\b(?:Capítulo|Capitulo|Sección|Seccion|Tema|Módulo|Modulo|Module|Section|Chapter|Parte|Part)\s+[0-9A-Za-zIVXLCDM]+[:.]?|\b(?:Overview|Quick Start|Specifications|Special Features|Rear I\/O Panel|Component Overview|CPU Socket|DIMM Slots|PCI_E|M\.?2 Slots|SATA|Front Panel|Power Connectors|Fan Headers|Audio|JRGB|JARGB|EZ Debug|BIOS Setup|RAID Configuration|Driver|Troubleshooting|Safety Information|Package Contents|Block Diagram|Hardware Setup|Software Description|Appendix)\b|^[0-9]+(?:\.[0-9]+)*\s+[A-ZÁÉÍÓÚÑ])/i;

    const headingKeywords = [
      'Quick Start', 'Safety Information', 'Specifications', 'Special Features',
      'Rear I/O Panel', 'Component Overview', 'CPU Socket', 'DIMM Slots', 'PCI_E1~4', 'PCIe Expansion Slots',
      'M2_1~4', 'M.2 Slots', 'SATA1~6', 'SATA 6Gb/s Connectors', 'Power Connectors', 'Fan Connectors',
      'Front Panel Connectors', 'EZ Debug LED', 'Installing OS', 'MSI Center', 'UEFI BIOS', 'BIOS Setup',
      'Resetting BIOS', 'Updating BIOS', 'RAID Configuration', 'Troubleshooting', 'Regulatory Notices',
      'Package Contents', 'Block Diagram', 'Hardware Setup', 'Software Description', 'Connecting Peripheral Devices',
      'Installing DDR5 memory', 'Connecting the Power Connectors', 'Installing a Graphics Card', 'Case stand-off',
      'Inhalt', 'Lieferumfang', 'Spezifikationen', 'Übersicht der Komponenten', 'Rückseite I/O',
      'Table des matières', 'Contenu', 'Spécifications', 'Vue d\'ensemble des composants', 'Panneau arrière E/S'
    ];

    // 1. Detección de páginas completas (para PDFs o documentos paginados)
    const pageSplitRegex = /(?:^|\n)(?=--- (?:Página|Page)\s+\d+\s+---|\[(?:Página|Page)\s+\d+\])/i;
    const rawPages = text.split(pageSplitRegex).map(p => p.trim()).filter(p => p.length > 0);

    if (rawPages.length > 1) {
      const chapters = [];
      let curPages = [];
      let curChapterLen = 0;
      let curChapterTitle = '';
      let startPage = 1;
      let curPageNum = 1;
      const maxPagesPerChapter = 20;
      const minPageChapterSize = Math.min(3000, Math.floor(maxChapterSize * 0.1));

      for (let i = 0; i < rawPages.length; i++) {
        const pageText = rawPages[i];
        const pageMatch = pageText.match(/(?:--- (?:Página|Page)\s+(\d+)\s+---|\[(?:Página|Page)\s+(\d+)\])/i);
        if (pageMatch) {
          curPageNum = parseInt(pageMatch[1] || pageMatch[2], 10);
        } else {
          curPageNum = i + 1;
        }

        const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let pageHeading = '';
        for (const line of lines.slice(0, 8)) {
          let clean = line.replace(/^---.*?---|\[.*?\]/g, '').replace(/https?:\/\/[^\s]+/g, '').replace(/[•·*ᨀ࢈㍭\s]+/g, ' ').trim();
          clean = clean.replace(/^\d+([A-ZÁÉÍÓÚÑa-z])/, '$1').replace(/^\d+[\s.:-]+/, '').trim();
          for (const kw of headingKeywords) {
            if (clean.toLowerCase().includes(kw.toLowerCase())) {
              pageHeading = kw;
              break;
            }
          }
          if (!pageHeading && clean.length > 2 && clean.length < 80 && headingRegex.test(clean)) {
            pageHeading = clean.replace(/^#+\s*/, '').trim();
            break;
          }
          if (pageHeading) break;
        }

        const isNewHeading = pageHeading && pageHeading !== curChapterTitle;
        const shouldSplitByHeading = isNewHeading && (curChapterLen >= minPageChapterSize || curPages.length >= 3);
        const shouldSplitBySize = (curPages.length >= maxPagesPerChapter || curChapterLen + pageText.length > maxChapterSize) && curPages.length > 0;

        if ((shouldSplitBySize || shouldSplitByHeading) && curPages.length > 0) {
          const endPage = curPageNum > startPage ? curPageNum - 1 : startPage;
          const pageRange = startPage === endPage ? `Pág. ${startPage}` : `Págs. ${startPage}-${endPage}`;
          chapters.push({
            title: curChapterTitle ? `${curChapterTitle} (${pageRange})` : `Capítulo ${chapters.length + 1} (${pageRange})`,
            content: curPages.join('\n\n').trim(),
            pageRange: { start: startPage, end: endPage }
          });
          curPages = [pageText];
          curChapterLen = pageText.length;
          startPage = curPageNum;
          curChapterTitle = pageHeading || '';
        } else {
          if (!curChapterTitle && pageHeading) {
            curChapterTitle = pageHeading;
          }
          curPages.push(pageText);
          curChapterLen += pageText.length;
        }
      }

      if (curPages.length > 0) {
        const endPage = curPageNum;
        const pageRange = startPage === endPage ? `Pág. ${startPage}` : `Págs. ${startPage}-${endPage}`;
        chapters.push({
          title: curChapterTitle ? `${curChapterTitle} (${pageRange})` : `Capítulo ${chapters.length + 1} (${pageRange})`,
          content: curPages.join('\n\n').trim(),
          pageRange: { start: startPage, end: endPage }
        });
      }

      return chapters.filter(c => c.content.length > 0);
    }

    // 2. Particionado por encabezados y bloques atómicos (documentos no paginados)
    const lines = text.split('\n');
    const rawSections = [];
    let currentTitle = 'Introducción / Información General';
    let currentLines = [];

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

    const minSize = Math.max(500, Math.floor(maxChapterSize * 0.25));
    const targetChapters = Math.max(8, Math.ceil(text.length / maxChapterSize));

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
   * Analiza la estructura semántica de un documento utilizando el LLM conectado.
   * Filtra cadenas base64 de imágenes reemplazándolas por su contexto descriptivo (~10 líneas).
   *
   * @param {string} text - Texto limpio del documento.
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

    const SYSTEM_PROMPT = `Eres un indexador semántico de alta precisión y densidad informativa para un sistema RAG jerárquico.
Tu misión es estructurar el contenido en un objeto JSON válido con máxima concisión y anclaje de palabras clave esenciales.

Estructura requerida:
{
  "globalSummary": "Resumen global denso y directo (1-2 frases, máx. 40 palabras) con tema central, alcance, tecnologías/entidades clave y rangos de fechas/versiones si existen.",
  "chapters": [
    {
      "chapterId": 1,
      "title": "Título descriptivo y preciso de la sección",
      "summary": "Micro-resumen telegráfico de alta densidad (1-2 frases, máx. 25-30 palabras): palabras clave exactas, APIs/comandos, rangos de fecha/hora o eventos/logs (si aplica), tags/fuentes y mención explícita de diagramas.",
      "content": "Texto original íntegro de la sección."
    }
  ]
}

Reglas estrictas de indexación RAG:
1. BREVEDAD Y ALTA DENSIDAD: Cero palabras de relleno o muletillas como "En esta sección...", "Este documento describe...", "A continuación se muestra...".
2. PALABRAS CLAVE Y ENTIDADES: Conserva términos técnicos literales, identificadores de funciones/APIs, endpoints, librerías, parámetros y acrónimos clave.
3. LOGS, FECHAS Y REGISTROS: Si el texto contiene logs, registros o eventos cronológicos, incluye el rango de fechas/horas, niveles de severidad (ERROR, WARN) o códigos de estado relevantes.
4. FUENTES Y TAGS: Si hay etiquetas (#tag), nombres de archivo, metadatos de autor o versiones (vX.Y), inclúyelos.
5. ESQUEMAS Y DIAGRAMAS: Si aparecen marcas [IMAGEN / ESQUEMA: ...], enumera qué diagramas o ilustraciones clave contiene (ej: "Diagrama pinout GPIO", "Esquema arquitectura").`;

    // Si el texto es ultra-breve (un solo fragmento sin páginas ni secciones, <= 2.500 caracteres)
    const hasMultiplePagesOrSections = cleanText.includes('--- Página') || cleanText.includes('[Página') || cleanText.length > 2500;
    if (!hasMultiplePagesOrSections) {
      const summaryCleanText = prepareTextForSummarization(cleanText);
      const prompt = `Analiza el documento "${filename}" y divide su contenido en capítulos estructurados con micro-resúmenes telegráficos de alta densidad semántica (palabras clave exactas, fechas/logs, diagramas, máx. 25-30 palabras por capítulo):\n\n---\n${summaryCleanText}\n---`;

      try {
        let responseText = await callLLM(llmClient, prompt, SYSTEM_PROMPT);
        let parsed = extractJsonFromResponse(responseText);

        if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
          try {
            const retryPrompt = `La respuesta anterior no era un JSON válido. Devuelve ÚNICAMENTE el objeto JSON estructurado con "globalSummary" (1-2 frases densas) y "chapters" (micro-resúmenes telegráficos con palabras clave, logs/fechas y diagramas) para "${filename}":\n\n---\n${summaryCleanText}\n---`;
            const retryResponse = await callLLM(llmClient, retryPrompt, SYSTEM_PROMPT);
            const retryParsed = extractJsonFromResponse(retryResponse);
            if (retryParsed && Array.isArray(retryParsed.chapters) && retryParsed.chapters.length > 0) {
              parsed = retryParsed;
            }
          } catch (retryErr) {}
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
    // Partición heurística (por páginas completas en PDFs) respetando el límite de contexto K
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

      // Muestreo ágil adaptado al tamaño de contexto K configurado (hasta 32.000 caracteres / ~8.000 tokens)
      const kVal = typeof contextLimitK === 'number' ? contextLimitK : 64;
      const maxSampleChars = Math.min(32000, Math.max(4000, kVal * 200));
      const cleanedSample = prepareTextForSummarization(cand.content);
      const sampleText = cleanedSample.length > maxSampleChars ? (cleanedSample.slice(0, maxSampleChars) + '...') : cleanedSample;
      const chapPrompt = `Genera un micro-resumen telegráfico de alta densidad semántica (1-2 frases concisas, máx. 25-30 palabras) para la sección "${cand.title}" del documento "${filename}".

Reglas estrictas de indexación RAG:
- Cero muletillas ("En esta sección se explica...", "Este capítulo trata..."). Sé directo.
- Incluye palabras clave técnicas exactas, nombres de componentes, comandos, parámetros, librerías o funciones.
- Si contiene logs, auditorías o registros temporales, captura el rango de fecha/hora, tags (#tag) o eventos críticos.
- Si contiene esquemas, imágenes o diagramas visuales ([IMAGEN / ESQUEMA: ...]), especifícalos explícitamente (ej: "Incluye diagrama de conectores de audio 7.1", "Esquema del zócalo CPU").

Contenido:
${sampleText}`;

      let chapSummary = '';
      try {
        chapSummary = await callLLM(llmClient, chapPrompt, 'Eres un indexador técnico ultra-conciso para un sistema RAG jerárquico. Responde ÚNICAMENTE con 1-2 frases directas y telegráficas con máxima densidad de palabras clave, fechas/logs y diagramas, sin introducciones ni texto conversacional.');
        chapSummary = chapSummary.trim()
          .replace(/^Resumen:\s*/i, '')
          .replace(/^En esta sección se\s+/i, '')
          .replace(/^En este capítulo se\s+/i, '')
          .replace(/^Esta sección describe\s+/i, '')
          .replace(/^Este documento describe\s+/i, '')
          .replace(/^Capítulo \d+:\s*/i, '');
      } catch (e) {
        chapSummary = `${cand.title}.`;
      }

      chapterSummaries.push(`- ${cand.title}: ${chapSummary}`);
      processedChapters.push({
        chapterId: i + 1,
        title: cand.title,
        summary: chapSummary,
        content: cand.content, // Se guarda el contenido completo íntegro con sus imágenes para recuperación RAG
        charCount: cand.content.length
      });
    }

    // Generar resumen global a partir de los micro-resúmenes
    let globalSummary = '';
    try {
      const summariesBlock = chapterSummaries.join('\n').slice(0, 4000);
      const globalPrompt = `A partir de los siguientes resúmenes de sección, genera un resumen global denso y conciso (1-2 frases directas, máx. 40 palabras) del documento "${filename}".
Destaca el propósito central, tecnologías/entidades clave, versiones/fechas relevantes y alcance general:\n\n${summariesBlock}`;
      globalSummary = await callLLM(llmClient, globalPrompt, 'Eres un redactor técnico de alta densidad. Responde ÚNICAMENTE con 1 o 2 frases directas resumiendo el propósito, tecnologías clave y alcance, sin prefacios ni relleno.');
      globalSummary = globalSummary.trim()
        .replace(/^Resumen Global:\s*/i, '')
        .replace(/^Resumen:\s*/i, '')
        .replace(/^En este documento se\s+/i, '');
    } catch (e) {
      globalSummary = `Documento ${filename} (${processedChapters.length} secciones).`;
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

        // Paso 3: Persistencia en Sistema de Ficheros Local (RAG/<branch_id>/<bucket>/)
        emitProgress(index, fileName, 'saving', `Guardando capítulos y archivo en sistema de ficheros (${index + 1}/${totalFiles})...`, null, basePercent + 90);
        const docPayload = {
          branchId: branchId,
          title: fileName,
          fileType: fileType,
          fileSize: fileSize,
          globalSummary: structure.globalSummary,
          chapters: structure.chapters,
          images: (rawText && rawText.images) ? rawText.images : (file.images || [])
        };

        const savedDoc = await RagStorage.saveDocument(docPayload, file);

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
    prepareTextForSummarization,
    extractTextFromPlainText,
    extractTextFromPDF,
    partitionTextIntoHeuristicChapters,
    analyzeDocumentStructure,
    processDocumentQueue
  };
});
