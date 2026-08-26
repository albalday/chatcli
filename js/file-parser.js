/**
 * Módulo de procesamiento y extracción de contenido de archivos (ChatFileParser).
 * Compatible con file:// y http:// sin dependencias externas.
 * Soporta:
 * - Documentos PDF (extracción y descompresión de texto en streams FlateDecode y objetos BT/ET).
 * - Archivos de código y texto plano (.txt, .md, .js, .py, .html, .css, .json, .csv, etc.).
 * - Imágenes (.png, .jpg, .jpeg, .webp, .gif, .svg).
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatFileParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function decodePdfString(rawStr) {
    if (!rawStr) return '';
    let str = rawStr;
    str = str.replace(/\\n/g, '\n')
             .replace(/\\r/g, '\r')
             .replace(/\\t/g, '\t')
             .replace(/\\b/g, '\b')
             .replace(/\\f/g, '\f')
             .replace(/\\\(/g, '(')
             .replace(/\\\)/g, ')')
             .replace(/\\\\/g, '\\');

    // Reemplazar caracteres octales (\000 a \377) habituales en codificación WinAnsi
    str = str.replace(/\\([0-7]{1,3})/g, function (_, oct) {
      const code = parseInt(oct, 8);
      return String.fromCharCode(code);
    });

    return str;
  }

  function decodePdfHexString(hex) {
    if (!hex) return '';
    let cleanHex = hex.replace(/\s+/g, '');
    if (cleanHex.length % 2 !== 0) cleanHex += '0';
    let str = '';

    if (cleanHex.toUpperCase().startsWith('FEFF')) {
      for (let i = 4; i < cleanHex.length; i += 4) {
        const code = parseInt(cleanHex.substr(i, 4), 16);
        if (!isNaN(code)) str += String.fromCharCode(code);
      }
      return str;
    }

    for (let i = 0; i < cleanHex.length; i += 2) {
      const code = parseInt(cleanHex.substr(i, 2), 16);
      if (!isNaN(code)) str += String.fromCharCode(code);
    }
    return str;
  }

  function extractTextFromPdfStream(streamString) {
    if (!streamString) return '';
    let resultText = '';

    // Bloques de texto delimitados por BT y ET
    const btBlocks = streamString.match(/BT[\s\S]*?ET/g) || [streamString];

    const tjArrayRegex = /\[((?:(?:\([^)]*\))|(?:<[^>]*>)|[^\]])*)\]\s*TJ/g;
    const tjStringRegex = /\(([^)]*)\)\s*(?:Tj|'|")/g;
    const tjHexRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g;

    for (const block of btBlocks) {
      let blockText = '';

      // 1. Extraer arrays con TJ: [(Texto) 120 (más texto)] TJ
      const arrayMatches = block.matchAll(tjArrayRegex);
      for (const m of arrayMatches) {
        const arrayContent = m[1];
        const strParts = arrayContent.matchAll(/\(([^)]*)\)|<([0-9a-fA-F]+)>/g);
        for (const sp of strParts) {
          if (sp[1] !== undefined) {
            blockText += decodePdfString(sp[1]);
          } else if (sp[2] !== undefined) {
            blockText += decodePdfHexString(sp[2]);
          }
        }
        blockText += ' ';
      }

      // 2. Extraer cadenas simples con Tj / ' / "
      const strMatches = block.matchAll(tjStringRegex);
      for (const m of strMatches) {
        blockText += decodePdfString(m[1]) + ' ';
      }

      // 3. Extraer cadenas hexadecimales <hex> Tj
      const hexMatches = block.matchAll(tjHexRegex);
      for (const m of hexMatches) {
        blockText += decodePdfHexString(m[1]) + ' ';
      }

      if (blockText.trim()) {
        resultText += blockText.trim() + '\n';
      }
    }

    return resultText;
  }

  async function decompressDeflateData(uint8Array) {
    if (!uint8Array || uint8Array.length === 0) return null;

    if (typeof DecompressionStream !== 'undefined') {
      // Intento 1: DecompressionStream('deflate')
      try {
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        const writePromise = writer.write(uint8Array).then(() => writer.close()).catch(() => {});
        const res = new Response(ds.readable);
        const buf = await res.arrayBuffer();
        await writePromise;
        return new Uint8Array(buf);
      } catch (e) {}

      // Intento 2: DecompressionStream('deflate-raw')
      try {
        let rawSlice = uint8Array;
        if (uint8Array.length > 6 && uint8Array[0] === 0x78) {
          rawSlice = uint8Array.subarray(2, uint8Array.length - 4);
        }
        const dsRaw = new DecompressionStream('deflate-raw');
        const writer = dsRaw.writable.getWriter();
        const writePromise = writer.write(rawSlice).then(() => writer.close()).catch(() => {});
        const res = new Response(dsRaw.readable);
        const buf = await res.arrayBuffer();
        await writePromise;
        return new Uint8Array(buf);
      } catch (e) {}
    }

    return null;
  }

  /**
   * Extrae el texto legible de un archivo PDF analizando sus streams y objetos.
   */
  async function extractTextFromPdf(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const fullText = decoder.decode(bytes);

    let extractedPages = [];
    let foundTextChunks = [];

    // Buscar posiciones de inicio y fin de streams en el PDF
    const streamRegex = /stream\r?\n/g;
    const endStreamRegex = /\r?\nendstream/g;

    let streamMatch;
    const streamStarts = [];
    while ((streamMatch = streamRegex.exec(fullText)) !== null) {
      streamStarts.push({
        start: streamMatch.index + streamMatch[0].length,
        headerIndex: streamMatch.index
      });
    }

    let endMatch;
    const streamEnds = [];
    while ((endMatch = endStreamRegex.exec(fullText)) !== null) {
      streamEnds.push(endMatch.index);
    }

    for (let i = 0; i < streamStarts.length; i++) {
      const sStart = streamStarts[i].start;
      // Encontrar el endstream correspondiente
      const sEnd = streamEnds.find(endIdx => endIdx > sStart);
      if (!sEnd) continue;

      // Verificar si el stream está comprimido con FlateDecode
      const precedingHeader = fullText.substring(Math.max(0, streamStarts[i].headerIndex - 200), streamStarts[i].headerIndex);
      const isFlate = precedingHeader.includes('FlateDecode');

      const rawStreamBytes = bytes.subarray(sStart, sEnd);

      let streamString = '';
      if (isFlate) {
        const decompressed = await decompressDeflateData(rawStreamBytes);
        if (decompressed) {
          streamString = decoder.decode(decompressed);
        }
      } else {
        streamString = decoder.decode(rawStreamBytes);
      }

      if (streamString) {
        const parsed = extractTextFromPdfStream(streamString);
        if (parsed.trim()) {
          foundTextChunks.push(parsed.trim());
        }
      }
    }

    // Fallback: si no se encontraron streams descomprimidos, buscar patrones BT...ET en todo el archivo
    if (foundTextChunks.length === 0) {
      const directText = extractTextFromPdfStream(fullText);
      if (directText.trim()) {
        foundTextChunks.push(directText.trim());
      }
    }

    // Limpiar y estructurar el texto resultante
    let finalCleanText = foundTextChunks.join('\n\n').trim();

    if (!finalCleanText) {
      return `[Documento PDF adjunto: No se pudo extraer texto seleccionable. Es posible que el PDF contenga únicamente imágenes escaneadas o esté protegido por contraseña.]`;
    }

    return finalCleanText;
  }

  /**
   * Lee y procesa cualquier tipo de archivo (PDF, texto, código, imagen).
   */
  async function parseFile(file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);

    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const extractedText = await extractTextFromPdf(arrayBuffer);
      return {
        name: file.name,
        size: file.size,
        type: 'pdf',
        content: extractedText,
        preview: `📄 PDF: ${file.name} (${formatBytes(file.size)})`
      };
    }

    if (isImage) {
      const base64 = await readFileAsDataUrl(file);
      return {
        name: file.name,
        size: file.size,
        type: 'image',
        content: `[Imagen adjunta: ${file.name} (${formatBytes(file.size)}, tipo: ${file.type || 'imagen'})]`,
        dataUrl: base64,
        preview: `🖼️ Imagen: ${file.name} (${formatBytes(file.size)})`
      };
    }

    // Archivos de texto o código
    const text = await readFileAsText(file);
    return {
      name: file.name,
      size: file.size,
      type: 'text',
      content: text,
      preview: `📄 ${file.name} (${formatBytes(file.size)})`
    };
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  return {
    formatBytes,
    parseFile,
    extractTextFromPdf
  };
});

