/** Deterministic, local document ingestion for the ZeroChat knowledge base. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatIngestionEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getRagStorage() {
    if (typeof window !== 'undefined') return window.ChatRagStorage;
    try { return require('./ragStorage.js'); } catch (_) { return null; }
  }
  function getRagIndex() {
    if (typeof window !== 'undefined') return window.ChatRagIndex;
    try { return require('./rag-index.js'); } catch (_) { return null; }
  }
  function getFileParser() {
    if (typeof window !== 'undefined') return window.ChatFileParser;
    try { return require('./file-parser.js'); } catch (_) { return null; }
  }

  function normalizeExtractedText(rawText) {
    if (!rawText) return '';
    let text = typeof rawText === 'string' ? rawText : String(rawText);
    if (text.normalize) text = text.normalize('NFKC');
    return text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  }

  async function extractTextFromPlainText(file) {
    if (!file) return '';
    if (typeof file === 'string') return normalizeExtractedText(file);
    if (typeof file.content === 'string') return normalizeExtractedText(file.content);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) return normalizeExtractedText(file.toString('utf8'));
    if (typeof file.text === 'function') return normalizeExtractedText(await file.text());
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(normalizeExtractedText(reader.result));
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
        reader.readAsText(file, 'utf-8');
      });
    }
    throw new Error('No se pudo leer el archivo de texto.');
  }

  async function toArrayBuffer(file) {
    if (file instanceof ArrayBuffer) return file;
    if (file instanceof Uint8Array) return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer el PDF.'));
        reader.readAsArrayBuffer(file);
      });
    }
    throw new Error('No se pudo obtener el contenido binario del PDF.');
  }

  async function extractTextFromPDF(file) {
    const bytes = await toArrayBuffer(file);
    const parser = getFileParser();
    if (!parser?.extractTextFromPdf) throw new Error('El extractor de PDF no está disponible.');
    return normalizeExtractedText(await parser.extractTextFromPdf(bytes));
  }

  async function extractDocumentContent(file, fileType) {
    if (fileType === 'pdf') {
      const bytes = await toArrayBuffer(file);
      const parser = getFileParser();
      if (!parser) throw new Error('El extractor de PDF no está disponible.');
      if (typeof parser.parsePdfDocument === 'function') {
        const parsed = await parser.parsePdfDocument(bytes);
        return {
          text: normalizeExtractedText(parsed.text),
          images: parsed.images || []
        };
      }
      const rawText = await parser.extractTextFromPdf(bytes);
      return { text: normalizeExtractedText(rawText), images: [] };
    }

    if (fileType === 'md') {
      let rawText = await extractTextFromPlainText(file);
      const images = [];
      let imgCounter = 1;
      rawText = rawText.replace(/!\[([^\]]*)\]\((data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+)\)/gi, (match, alt, dataUrl) => {
        const imgId = `img_${imgCounter++}`;
        const cleanDataUrl = dataUrl.replace(/\s+/g, '');
        const mimeMatch = cleanDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const label = (alt && alt.trim()) || `Imagen ${imgCounter - 1}`;
        images.push({
          id: imgId,
          page: 1,
          width: 0,
          height: 0,
          mimeType,
          dataUrl: cleanDataUrl,
          label
        });
        return `![${label}](rag-image://__DOC_ID__:${imgId})`;
      });
      return { text: normalizeExtractedText(rawText), images };
    }

    const text = await extractTextFromPlainText(file);
    return { text: normalizeExtractedText(text), images: [] };
  }

  function detectSectionHeading(line) {
    const value = String(line || '').trim();
    if (!value || value.length > 140) return '';
    const markdown = value.match(/^#{1,6}\s+(.+)$/);
    if (markdown) return markdown[1].trim();
    const numbered = value.match(/^(?:\d+(?:\.\d+)*|[IVXLCDM]+)[.)]?\s+(.+)$/i);
    if (numbered) return numbered[1].trim();
    if (/^(?:cap[ií]tulo|chapter|secci[oó]n|section|anexo|appendix)\s+[\w.-]+/i.test(value)) return value;
    if (value.length <= 80 && /^[A-ZÁÉÍÓÚÜÑ0-9][^.!?]*$/.test(value) && value.split(/\s+/).length <= 12) return value;
    return '';
  }

  function findPageRange(content) {
    const pages = Array.from(String(content).matchAll(/---\s*P[aá]gina\s+(\d+)\s*---/gi), match => Number(match[1]));
    return pages.length ? { pageStart: Math.min(...pages), pageEnd: Math.max(...pages) } : { pageStart: null, pageEnd: null };
  }

  function findSafeCut(text, maxChars) {
    if (text.length <= maxChars) return text.length;
    const floor = Math.floor(maxChars * 0.65);
    for (const separator of ['\n\n', '\n', '. ', '; ', ', ', ' ']) {
      const index = text.lastIndexOf(separator, maxChars);
      if (index >= floor) return index + separator.length;
    }
    return maxChars;
  }

  function tailOverlap(text, overlapChars) {
    if (!overlapChars || text.length <= overlapChars) return '';
    const tail = text.slice(-overlapChars);
    const boundary = tail.search(/(?:\n\n|[.!?]\s)/);
    return (boundary >= 0 ? tail.slice(boundary).trimStart() : tail).trim();
  }

  function partitionTextIntoChunks(rawText, options = {}) {
    const text = normalizeExtractedText(rawText);
    if (!text) return [];
    const maxChars = Math.max(1000, Number(options.maxChars) || 6000);
    const requestedOverlap = options.overlapChars === undefined ? 400 : Number(options.overlapChars);
    const overlapChars = Math.max(0, Math.min(Math.floor(maxChars * 0.2), requestedOverlap || 0));
    const chunks = [];
    let remaining = text;
    let overlap = '';
    while (remaining) {
      const cut = findSafeCut(remaining, maxChars);
      const body = remaining.slice(0, cut).trim();
      const content = [overlap, body].filter(Boolean).join('\n\n');
      const firstHeading = content.split('\n').map(detectSectionHeading).find(Boolean);
      chunks.push({ order: chunks.length, title: firstHeading || `Fragmento ${chunks.length + 1}`, content, ...findPageRange(content) });
      remaining = remaining.slice(cut).trimStart();
      overlap = remaining ? tailOverlap(body, overlapChars) : '';
    }
    return chunks;
  }

  function detectFileType(file) {
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.pdf') || file?.type === 'application/pdf') return 'pdf';
    if (name.endsWith('.md') || name.endsWith('.markdown') || file?.type === 'text/markdown') return 'md';
    if (name.endsWith('.txt') || file?.type === 'text/plain') return 'txt';
    return null;
  }

  async function processDocumentQueue(files, branchId, onProgress, options = {}) {
    const queue = Array.isArray(files) ? files : Array.from(files || []);
    const storage = getRagStorage();
    const index = getRagIndex();
    if (!storage) throw new Error('El almacenamiento RAG no está disponible.');
    if (!branchId) throw new Error('Se requiere una rama de destino.');
    const result = { total: queue.length, processed: 0, failed: 0, documents: [], errors: [] };
    const emit = (fileIndex, fileName, status, message, percent, errorDetails) => {
      if (typeof onProgress === 'function') onProgress({ fileIndex, totalFiles: queue.length, fileName, status, message, percent, errorDetails });
    };
    for (let fileIndex = 0; fileIndex < queue.length; fileIndex++) {
      const file = queue[fileIndex];
      const fileName = file?.name || `documento_${fileIndex + 1}.txt`;
      const fileType = detectFileType(file);
      try {
        if (!fileType) throw new Error('Tipo de archivo no soportado. Usa PDF, Markdown o TXT.');
        emit(fileIndex, fileName, 'extracting', `Extrayendo texto de ${fileName}…`, 10);
        const { text: extracted, images } = await extractDocumentContent(file, fileType);
        if (!extracted) throw new Error('El archivo no contiene texto extraíble.');
        emit(fileIndex, fileName, 'chunking', `Particionando ${fileName}…`, 45);

        const documentId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `doc_${crypto.randomUUID()}`
          : `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const preparedText = extracted.replace(/__DOC_ID__/g, documentId);

        const chunks = partitionTextIntoChunks(preparedText, options);
        if (!chunks.length) throw new Error('No se pudieron generar fragmentos del documento.');
        emit(fileIndex, fileName, 'saving', `Guardando ${fileName} en IndexedDB…`, 75);
        const document = await storage.saveDocument({
          id: documentId,
          branchId, title: fileName, fileType, mimeType: file?.type || '',
          fileSize: Number(file?.size) || preparedText.length, chunks
        }, file, images);
        if (index?.invalidateBranch) index.invalidateBranch(branchId);
        emit(fileIndex, fileName, 'completed', `${fileName} indexado (${chunks.length} fragmentos, ${(images && images.length) || 0} imágenes).`, 100);
        result.processed++;
        result.documents.push(document);
      } catch (error) {
        const message = error?.message || String(error);
        emit(fileIndex, fileName, 'error', `Error en ${fileName}: ${message}`, 0, message);
        result.failed++;
        result.errors.push({ fileName, error: message });
      }
    }
    return result;
  }

  return { normalizeExtractedText, extractTextFromPlainText, extractTextFromPDF, detectSectionHeading, partitionTextIntoChunks, detectFileType, processDocumentQueue };
});
