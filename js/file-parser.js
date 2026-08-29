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

  function isPdfDelimiterOrWs(charCode) {
    return charCode <= 32 || charCode === 40 || charCode === 41 || charCode === 60 || 
           charCode === 62 || charCode === 91 || charCode === 93 || charCode === 47 || charCode === 37;
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
        if (!isNaN(code) && code > 0) str += String.fromCharCode(code);
      }
      return str;
    }

    for (let i = 0; i < cleanHex.length; i += 2) {
      const code = parseInt(cleanHex.substr(i, 2), 16);
      if (!isNaN(code) && code >= 32) str += String.fromCharCode(code);
    }
    return str;
  }

  function scanPdfLiteralString(stream, startIdx) {
    let depth = 1;
    let i = startIdx + 1;
    let raw = '';
    const len = stream.length;

    while (i < len && depth > 0) {
      const ch = stream.charAt(i);
      if (ch === '\\') {
        if (i + 1 < len) {
          raw += ch + stream.charAt(i + 1);
          i += 2;
          continue;
        }
      } else if (ch === '(') {
        depth++;
        raw += ch;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
        raw += ch;
      } else {
        raw += ch;
      }
      i++;
    }

    return {
      strVal: decodePdfString(raw),
      nextIndex: i
    };
  }

  function scanPdfHexString(stream, startIdx) {
    let i = startIdx + 1;
    let hex = '';
    const len = stream.length;

    while (i < len) {
      const ch = stream.charAt(i);
      if (ch === '>') {
        i++;
        break;
      }
      hex += ch;
      i++;
    }

    return {
      strVal: decodePdfHexString(hex),
      nextIndex: i
    };
  }

  function scanPdfArrayTJ(stream, startIdx) {
    let i = startIdx + 1;
    let extractedText = '';
    const len = stream.length;

    while (i < len) {
      const c = stream.charCodeAt(i);
      if (c === 93 /* ] */) {
        i++;
        break;
      }

      if (c === 40 /* ( */) {
        const res = scanPdfLiteralString(stream, i);
        extractedText += res.strVal;
        i = res.nextIndex;
        continue;
      }

      if (c === 60 /* < */) {
        if (i + 1 < len && stream.charCodeAt(i + 1) === 60) {
          i += 2;
          continue;
        }
        const res = scanPdfHexString(stream, i);
        extractedText += res.strVal;
        i = res.nextIndex;
        continue;
      }

      // Números de espaciado en arrays TJ (valores negativos grandes representan espacio entre palabras)
      if ((c >= 48 && c <= 57) || c === 45 /* - */) {
        let numStr = '';
        while (i < len && ((stream.charCodeAt(i) >= 48 && stream.charCodeAt(i) <= 57) || stream.charCodeAt(i) === 45 || stream.charCodeAt(i) === 46)) {
          numStr += stream.charAt(i);
          i++;
        }
        const num = parseFloat(numStr);
        if (!isNaN(num) && num < -100) {
          extractedText += ' ';
        }
        continue;
      }

      i++;
    }

    // Comprobar operador TJ
    let j = i;
    while (j < len && stream.charCodeAt(j) <= 32) j++;
    let hasTJ = false;
    if (j + 1 < len && stream.charAt(j) === 'T' && stream.charAt(j + 1) === 'J') {
      hasTJ = true;
      i = j + 2;
    }

    return {
      extractedText,
      nextIndex: i,
      hasTJ
    };
  }

  function scanNextPdfOperator(stream, startIdx) {
    let i = startIdx;
    const len = stream.length;
    while (i < len && stream.charCodeAt(i) <= 32) i++;
    if (i >= len) return '';
    if (i + 1 < len && stream.charAt(i) === 'T' && stream.charAt(i + 1) === 'j') return 'Tj';
    if (stream.charAt(i) === "'" || stream.charAt(i) === '"') return stream.charAt(i);
    return '';
  }

  function parsePdfStreamText(streamString) {
    if (!streamString || typeof streamString !== 'string') return '';

    let out = [];
    let inTextObject = false;
    const len = streamString.length;
    let i = 0;

    while (i < len) {
      const c = streamString.charCodeAt(i);

      // Check BT (Begin Text)
      if (c === 66 /* B */ && i + 1 < len && streamString.charCodeAt(i + 1) === 84 /* T */) {
        const prev = i > 0 ? streamString.charCodeAt(i - 1) : 32;
        const next = i + 2 < len ? streamString.charCodeAt(i + 2) : 32;
        if (isPdfDelimiterOrWs(prev) && isPdfDelimiterOrWs(next)) {
          inTextObject = true;
          i += 2;
          continue;
        }
      }

      // Check ET (End Text)
      if (c === 69 /* E */ && i + 1 < len && streamString.charCodeAt(i + 1) === 84 /* T */) {
        const prev = i > 0 ? streamString.charCodeAt(i - 1) : 32;
        const next = i + 2 < len ? streamString.charCodeAt(i + 2) : 32;
        if (isPdfDelimiterOrWs(prev) && isPdfDelimiterOrWs(next)) {
          inTextObject = false;
          out.push('\n');
          i += 2;
          continue;
        }
      }

      // Literal string: (texto)
      if (c === 40 /* ( */) {
        const { strVal, nextIndex } = scanPdfLiteralString(streamString, i);
        i = nextIndex;
        const op = scanNextPdfOperator(streamString, i);
        if (op === 'Tj' || op === "'" || op === '"' || inTextObject) {
          if (strVal) out.push(strVal);
          if (op === "'" || op === '"') out.push('\n');
        }
        continue;
      }

      // Hex string: <hex>
      if (c === 60 /* < */) {
        if (i + 1 < len && streamString.charCodeAt(i + 1) === 60) {
          i += 2;
          continue;
        }
        const { strVal, nextIndex } = scanPdfHexString(streamString, i);
        i = nextIndex;
        const op = scanNextPdfOperator(streamString, i);
        if (op === 'Tj' || op === "'" || op === '"' || inTextObject) {
          if (strVal) out.push(strVal);
          if (op === "'" || op === '"') out.push('\n');
        }
        continue;
      }

      // Array TJ: [(str) num (str)] TJ
      if (c === 91 /* [ */) {
        const { extractedText, nextIndex } = scanPdfArrayTJ(streamString, i);
        i = nextIndex;
        if (extractedText) {
          out.push(extractedText + ' ');
        }
        continue;
      }

      // Operadores de salto de línea T*, Td, TD
      if (inTextObject && c === 84 /* T */ && i + 1 < len) {
        const nextC = streamString.charCodeAt(i + 1);
        if (nextC === 42 /* * */ || nextC === 100 /* d */ || nextC === 68 /* D */) {
          const after = i + 2 < len ? streamString.charCodeAt(i + 2) : 32;
          if (isPdfDelimiterOrWs(after)) {
            out.push('\n');
            i += 2;
            continue;
          }
        }
      }

      i++;
    }

    return out.join('').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
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
  function uint8ToBase64(uint8) {
    if (!uint8 || uint8.length === 0) return '';
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(uint8).toString('base64');
    }
    let binary = '';
    const len = uint8.byteLength;
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
      const sub = uint8.subarray(i, Math.min(i + chunk, len));
      binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
  }

  /**
   * Extrae el texto legible y esquemas/imágenes de un archivo PDF analizando streams y objetos por páginas completas.
   */
  async function extractTextFromPdf(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const fullText = decoder.decode(bytes);

    let pages = [];
    let currentPageItems = [];
    let pageNum = 1;
    let imgCounter = 0;
    let pos = 0;
    const len = fullText.length;

    while (pos < len) {
      const streamIdx = fullText.indexOf('stream', pos);
      if (streamIdx === -1) break;

      const prevChar = streamIdx > 0 ? fullText.charCodeAt(streamIdx - 1) : 32;
      if (prevChar <= 32 || prevChar === 62 || prevChar === 47) {
        let dataStart = streamIdx + 6;
        if (dataStart < len && fullText.charCodeAt(dataStart) === 13) dataStart++;
        if (dataStart < len && fullText.charCodeAt(dataStart) === 10) dataStart++;

        const endStreamIdx = fullText.indexOf('endstream', dataStart);
        if (endStreamIdx !== -1) {
          const dictStart = Math.max(0, streamIdx - 400);
          const dictSlice = fullText.substring(dictStart, streamIdx);
          const isFlate = dictSlice.includes('FlateDecode');
          const isDCT = dictSlice.includes('DCTDecode');

          let rawEnd = endStreamIdx;
          if (rawEnd > dataStart && (fullText.charCodeAt(rawEnd - 1) === 10 || fullText.charCodeAt(rawEnd - 1) === 13)) rawEnd--;
          if (rawEnd > dataStart && (fullText.charCodeAt(rawEnd - 1) === 10 || fullText.charCodeAt(rawEnd - 1) === 13)) rawEnd--;

          const rawStreamBytes = bytes.subarray(dataStart, rawEnd);

          // 1. Extracción de imágenes JPEG (esquemas, diagramas de placa)
          if (isDCT && rawStreamBytes.length > 2048 && rawStreamBytes[0] === 0xFF && rawStreamBytes[1] === 0xD8) {
            imgCounter++;
            const b64 = uint8ToBase64(rawStreamBytes);
            if (b64) {
              currentPageItems.push(`\n![Esquema / Imagen (Pág. ${pageNum}) #img_${pageNum}_${imgCounter}](data:image/jpeg;base64,${b64})\n`);
            }
          }
          // 2. Extracción de streams de texto
          else {
            let streamString = '';
            if (isFlate) {
              const decompressed = await decompressDeflateData(rawStreamBytes);
              if (decompressed) {
                streamString = decoder.decode(decompressed);
              }
            } else if (!isDCT) {
              streamString = decoder.decode(rawStreamBytes);
            }

            if (streamString) {
              const parsed = parsePdfStreamText(streamString);
              if (parsed && parsed.trim().length > 0) {
                currentPageItems.push(parsed.trim());
              }
            }
          }

          // Si se han acumulado elementos significativos en la página
          if (currentPageItems.length >= 3) {
            const pageText = currentPageItems.join('\n\n').trim();
            if (pageText.length > 0) {
              pages.push(`--- Página ${pageNum} ---\n${pageText}`);
              pageNum++;
              currentPageItems = [];
            }
          }

          pos = endStreamIdx + 9;
          continue;
        }
      }
      pos = streamIdx + 6;
    }

    // Volcar cualquier contenido restante en la última página
    if (currentPageItems.length > 0) {
      const pageText = currentPageItems.join('\n\n').trim();
      if (pageText.length > 0) {
        pages.push(`--- Página ${pageNum} ---\n${pageText}`);
      }
    }

    // Fallback si no se pudieron dividir por páginas
    if (pages.length === 0) {
      const directText = parsePdfStreamText(fullText);
      if (directText && directText.trim().length > 0) {
        pages.push(`--- Página 1 ---\n${directText.trim()}`);
      }
    }

    let finalCleanText = pages.join('\n\n').trim();

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
      const mime = file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : file.name.toLowerCase().endsWith('.webp') ? 'image/webp' : file.name.toLowerCase().endsWith('.gif') ? 'image/gif' : file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg');
      return {
        name: file.name,
        size: file.size,
        type: 'image',
        mimeType: mime,
        content: `[Imagen adjunta: ${file.name} (${formatBytes(file.size)})]`,
        dataUrl: base64,
        preview: `🖼️ ${file.name} (${formatBytes(file.size)})`
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

