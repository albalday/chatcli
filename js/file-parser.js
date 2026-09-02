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

  function decodePdfEscapes(str) {
    if (!str) return '';
    return str.replace(/\\([0-7]{1,3})/g, (m, oct) => {
      const code = parseInt(oct, 8);
      return String.fromCharCode(code);
    }).replace(/\\([nrtbf\\()])/g, (m, esc) => {
      switch (esc) {
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        case 'b': return '\b';
        case 'f': return '\f';
        default: return esc;
      }
    });
  }

  function parseCMapData(text, cmap) {
    if (!text || typeof text !== 'string') return;

    // 1. beginbfchar
    const bfcharRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let cm;
    while ((cm = bfcharRegex.exec(text)) !== null) {
      const src = cm[1].toLowerCase();
      const dstHex = cm[2];
      let dstChar = '';
      for (let k = 0; k < dstHex.length; k += 4) {
        const code = parseInt(dstHex.substr(k, 4), 16);
        if (!isNaN(code)) dstChar += String.fromCharCode(code);
      }
      if (dstChar) {
        cmap.set(src, dstChar);
        if (src.length === 2) cmap.set('00' + src, dstChar);
        if (src.startsWith('00') && src.length === 4) cmap.set(src.substring(2), dstChar);
      }
    }

    // 2. beginbfrange con destino simple: <start> <end> <destStart>
    const bfrangeSimpleRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    while ((cm = bfrangeSimpleRegex.exec(text)) !== null) {
      const start = parseInt(cm[1], 16);
      const end = parseInt(cm[2], 16);
      const destStart = parseInt(cm[3], 16);
      const len = cm[1].length;
      for (let s = start; s <= end; s++) {
        const srcHex = s.toString(16).padStart(len, '0').toLowerCase();
        const dstCode = destStart + (s - start);
        const dstChar = String.fromCharCode(dstCode);
        cmap.set(srcHex, dstChar);
        if (srcHex.length === 2) cmap.set('00' + srcHex, dstChar);
        if (srcHex.startsWith('00') && srcHex.length === 4) cmap.set(srcHex.substring(2), dstChar);
      }
    }

    // 3. beginbfrange con array de destinos: <start> <end> [ <dest1> <dest2> ... ]
    const bfrangeArrayRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g;
    while ((cm = bfrangeArrayRegex.exec(text)) !== null) {
      const start = parseInt(cm[1], 16);
      const end = parseInt(cm[2], 16);
      const len = cm[1].length;
      const destMatches = cm[3].match(/<([0-9a-fA-F]+)>/g) || [];
      for (let s = start, idx = 0; s <= end && idx < destMatches.length; s++, idx++) {
        const srcHex = s.toString(16).padStart(len, '0').toLowerCase();
        const dstHex = destMatches[idx].replace(/[<>]/g, '');
        let dstChar = '';
        for (let k = 0; k < dstHex.length; k += 4) {
          const code = parseInt(dstHex.substr(k, 4), 16);
          if (!isNaN(code)) dstChar += String.fromCharCode(code);
        }
        if (dstChar) {
          cmap.set(srcHex, dstChar);
          if (srcHex.length === 2) cmap.set('00' + srcHex, dstChar);
          if (srcHex.startsWith('00') && srcHex.length === 4) cmap.set(srcHex.substring(2), dstChar);
        }
      }
    }
  }

  async function parseCMaps(allObjects, fullText, bytes, objOffsets) {
    const cmap = new Map();
    const toUnicodeObjNums = new Set();

    // Buscar referencias /ToUnicode en fullText y en todos los objetos (incluidos los de ObjStm)
    const toUnicodeRegex = /\/ToUnicode\s+(\d+)\s+\d+\s+R/g;
    let m;
    while ((m = toUnicodeRegex.exec(fullText)) !== null) {
      toUnicodeObjNums.add(m[1]);
    }

    for (const [num, body] of allObjects.entries()) {
      let bm;
      const bRegex = /\/ToUnicode\s+(\d+)\s+\d+\s+R/g;
      while ((bm = bRegex.exec(body)) !== null) {
        toUnicodeObjNums.add(bm[1]);
      }
      // Si el objeto ya contiene directamente CMap
      if (body.includes('beginbfchar') || body.includes('beginbfrange')) {
        parseCMapData(body, cmap);
      }
    }

    for (const objNum of toUnicodeObjNums) {
      const body = allObjects.get(String(objNum));
      if (body && (body.includes('beginbfchar') || body.includes('beginbfrange'))) {
        parseCMapData(body, cmap);
        continue;
      }

      const offset = objOffsets.get(String(objNum));
      if (offset !== undefined) {
        const streamIdx = fullText.indexOf('stream', offset);
        const endStreamIdx = fullText.indexOf('endstream', streamIdx);
        if (streamIdx !== -1 && endStreamIdx !== -1) {
          let dataStart = streamIdx + 6;
          if (fullText.charCodeAt(dataStart) === 13) dataStart++;
          if (fullText.charCodeAt(dataStart) === 10) dataStart++;
          try {
            const rawBytes = bytes.subarray(dataStart, endStreamIdx);
            const decomp = await decompressDeflateData(rawBytes);
            if (decomp) {
              const text = new TextDecoder('latin1').decode(decomp);
              parseCMapData(text, cmap);
            }
          } catch (e) {}
        }
      }
    }

    return cmap;
  }

  function isReadablePdfText(str) {
    if (!str || str.length < 3) return false;
    let printable = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255) || code === 10 || code === 13 || code === 9) {
        printable++;
      }
    }
    const ratio = printable / str.length;
    if (/SF\d{6}|afii\d+|upblock|dnblock|triagup|dmacron/.test(str)) return false;
    return ratio >= 0.70;
  }

  function mapPdfLiteralString(lit, cmap) {
    const raw = decodePdfEscapes(lit);
    if (!cmap || cmap.size === 0) return raw;

    // Intentar decodificar como pares de 2 bytes (UTF-16BE / CID) o bytes simples mapeados en CMap
    let decoded = '';
    let hasMapping = false;
    for (let k = 0; k < raw.length; k++) {
      const c1 = raw.charCodeAt(k);
      const hex1 = c1.toString(16).padStart(2, '0').toLowerCase();
      
      if (k + 1 < raw.length) {
        const c2 = raw.charCodeAt(k + 1);
        const hex2 = hex1 + c2.toString(16).padStart(2, '0').toLowerCase();
        if (cmap.has(hex2)) {
          decoded += cmap.get(hex2);
          hasMapping = true;
          k++;
          continue;
        }
      }

      if (cmap.has(hex1)) {
        decoded += cmap.get(hex1);
        hasMapping = true;
      } else if (cmap.has('00' + hex1)) {
        decoded += cmap.get('00' + hex1);
        hasMapping = true;
      } else if (c1 >= 32 && c1 <= 126) {
        decoded += raw.charAt(k);
      } else if (c1 === 0 && k + 1 < raw.length && raw.charCodeAt(k + 1) >= 32 && raw.charCodeAt(k + 1) <= 126) {
        // Ignorar byte nulo en UTF-16BE de ASCII estándar
        decoded += raw.charAt(k + 1);
        k++;
      }
    }

    return (hasMapping || decoded.length >= raw.length * 0.5) ? decoded : raw;
  }

  function parsePdfStreamText(streamString, cmap = new Map()) {
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

      if (!inTextObject) {
        i++;
        continue;
      }

      // Literal string: (texto)
      if (c === 40 /* ( */) {
        let depth = 1;
        let j = i + 1;
        let lit = '';
        while (j < len && depth > 0) {
          const sc = streamString.charCodeAt(j);
          if (sc === 92 /* \ */) {
            lit += streamString.charAt(j) + (j + 1 < len ? streamString.charAt(j + 1) : '');
            j += 2;
            continue;
          }
          if (sc === 40 /* ( */) depth++;
          else if (sc === 41 /* ) */) {
            depth--;
            if (depth === 0) { j++; break; }
          }
          lit += streamString.charAt(j);
          j++;
        }
        if (lit) out.push(mapPdfLiteralString(lit, cmap));
        i = j;
        continue;
      }

      // Hex string: <hex>
      if (c === 60 /* < */) {
        if (i + 1 < len && streamString.charCodeAt(i + 1) === 60) {
          i += 2;
          continue;
        }
        let j = i + 1;
        let hex = '';
        while (j < len && streamString.charCodeAt(j) !== 62 /* > */) {
          const hc = streamString.charCodeAt(j);
          if ((hc >= 48 && hc <= 57) || (hc >= 65 && hc <= 70) || (hc >= 97 && hc <= 102)) {
            hex += streamString.charAt(j);
          }
          j++;
        }
        if (j < len && streamString.charCodeAt(j) === 62) j++;
        let decoded = '';
        for (let k = 0; k < hex.length; k += 4) {
          const chunk = hex.substr(k, 4).toLowerCase();
          if (cmap.has(chunk)) decoded += cmap.get(chunk);
          else {
            const sub2 = hex.substr(k, 2).toLowerCase();
            if (cmap.has(sub2)) { decoded += cmap.get(sub2); k -= 2; }
            else {
              const code = parseInt(chunk, 16);
              if (!isNaN(code) && code >= 32 && code < 127) decoded += String.fromCharCode(code);
            }
          }
        }
        if (decoded) out.push(decoded);
        i = j;
        continue;
      }

      // Array TJ: [(str) num (str)] TJ
      if (c === 91 /* [ */) {
        let j = i + 1;
        let arrText = '';
        while (j < len && streamString.charCodeAt(j) !== 93 /* ] */) {
          const ac = streamString.charCodeAt(j);
          if (ac === 40 /* ( */) {
            let depth = 1;
            let k = j + 1;
            let lit = '';
            while (k < len && depth > 0) {
              const sc = streamString.charCodeAt(k);
              if (sc === 92) {
                lit += streamString.charAt(k) + (k + 1 < len ? streamString.charAt(k + 1) : '');
                k += 2;
                continue;
              }
              if (sc === 40) depth++;
              else if (sc === 41) {
                depth--;
                if (depth === 0) { k++; break; }
              }
              lit += streamString.charAt(k);
              k++;
            }
            arrText += mapPdfLiteralString(lit, cmap);
            j = k;
            continue;
          } else if (ac === 60 /* < */) {
            if (j + 1 < len && streamString.charCodeAt(j + 1) === 60) { j += 2; continue; }
            let k = j + 1;
            let hex = '';
            while (k < len && streamString.charCodeAt(k) !== 62) {
              const hc = streamString.charCodeAt(k);
              if ((hc >= 48 && hc <= 57) || (hc >= 65 && hc <= 70) || (hc >= 97 && hc <= 102)) {
                hex += streamString.charAt(k);
              }
              k++;
            }
            if (k < len && streamString.charCodeAt(k) === 62) k++;
            for (let m = 0; m < hex.length; m += 4) {
              const chunk = hex.substr(m, 4).toLowerCase();
              if (cmap.has(chunk)) arrText += cmap.get(chunk);
              else {
                const sub2 = hex.substr(m, 2).toLowerCase();
                if (cmap.has(sub2)) { arrText += cmap.get(sub2); m -= 2; }
              }
            }
            j = k;
            continue;
          } else if ((ac >= 48 && ac <= 57) || ac === 45 /* - */) {
            let numStr = '';
            while (j < len && ((streamString.charCodeAt(j) >= 48 && streamString.charCodeAt(j) <= 57) || streamString.charCodeAt(j) === 45 || streamString.charCodeAt(j) === 46)) {
              numStr += streamString.charAt(j);
              j++;
            }
            const num = parseFloat(numStr);
            if (!isNaN(num) && num < -100) arrText += ' ';
            continue;
          }
          j++;
        }
        if (j < len && streamString.charCodeAt(j) === 93) j++;
        if (arrText) out.push(arrText);
        i = j;
        continue;
      }

      // Operadores de salto de línea T*, Td, TD
      if (c === 84 /* T */ && i + 1 < len) {
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

    const res = out.join('').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    return res;
  }

  async function decompressDeflateData(uint8Array) {
    if (!uint8Array || uint8Array.length === 0) return null;

    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        const writePromise = writer.write(uint8Array).then(() => writer.close()).catch(() => {});
        const res = new Response(ds.readable);
        const buf = await res.arrayBuffer();
        await writePromise;
        return new Uint8Array(buf);
      } catch (e) {}

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

    if (typeof require !== 'undefined') {
      try {
        const zlib = require('zlib');
        return zlib.inflateSync(uint8Array);
      } catch (e) {
        try {
          const zlib = require('zlib');
          return zlib.inflateRawSync(uint8Array);
        } catch (e2) {}
      }
    }

    return null;
  }

  /** Extrae texto de un PDF sin enviar su contenido a servicios externos. */
  async function extractTextFromPdf(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const fullText = decoder.decode(bytes);

    // 1. Mapeo de objetos directos PDF
    const allObjects = new Map();
    const objOffsets = new Map();
    const objRegex = /(\d+)\s+(\d+)\s+obj/g;
    let m;
    while ((m = objRegex.exec(fullText)) !== null) {
      objOffsets.set(m[1], m.index);
    }

    for (const [num, offset] of objOffsets.entries()) {
      const endObj = fullText.indexOf('endobj', offset);
      if (endObj !== -1) {
        allObjects.set(num, fullText.substring(offset, endObj + 6));
      }
    }

    // 2. Descomprimir todos los flujos de objetos comprimidos (/Type /ObjStm) antes de extraer CMaps
    for (const [num, body] of Array.from(allObjects.entries())) {
      if (body.includes('/Type/ObjStm') || body.includes('/Type /ObjStm')) {
        const sIdx = body.indexOf('stream');
        const eIdx = body.indexOf('endstream', sIdx);
        if (sIdx !== -1 && eIdx !== -1) {
          let dStart = sIdx + 6;
          if (body.charCodeAt(dStart) === 13) dStart++;
          if (body.charCodeAt(dStart) === 10) dStart++;
          let rEnd = eIdx;
          if (rEnd > dStart && (body.charCodeAt(rEnd - 1) === 10 || body.charCodeAt(rEnd - 1) === 13)) rEnd--;
          if (rEnd > dStart && (body.charCodeAt(rEnd - 1) === 10 || body.charCodeAt(rEnd - 1) === 13)) rEnd--;

          const offset = objOffsets.get(num) || 0;
          const rawStream = bytes.subarray(offset + dStart, offset + rEnd);
          try {
            const decomp = await decompressDeflateData(rawStream);
            if (decomp) {
              const decStr = decoder.decode(decomp);
              const nMatch = body.match(/\/N\s+(\d+)/);
              const firstMatch = body.match(/\/First\s+(\d+)/);
              const n = nMatch ? parseInt(nMatch[1]) : 0;
              const first = firstMatch ? parseInt(firstMatch[1]) : 0;
              const header = decStr.substring(0, first).trim().split(/\s+/);
              for (let i = 0; i < header.length; i += 2) {
                const oNum = header[i];
                const oOffset = parseInt(header[i + 1]);
                const nextOffset = (i + 3 < header.length) ? parseInt(header[i + 3]) : decStr.length - first;
                const oBody = decStr.substring(first + oOffset, first + nextOffset);
                allObjects.set(oNum, oBody);
              }
            }
          } catch (e) {}
        }
      }
    }

    // 3. Extracción exhaustiva de CMaps / ToUnicode (incluyendo objetos dentro de ObjStm)
    const cmap = await parseCMaps(allObjects, fullText, bytes, objOffsets);

    // 4. Resolución del catálogo y árbol jerárquico de páginas (Page Tree)
    let catalogObjNum = null;
    for (const [num, body] of allObjects.entries()) {
      if (/\/Type\s*\/Catalog\b/.test(body)) {
        catalogObjNum = num;
        break;
      }
    }

    const catalogBody = catalogObjNum ? (allObjects.get(catalogObjNum) || '') : '';
    const pagesMatch = catalogBody.match(/\/Pages\s+(\d+)\s+\d+\s+R/);

    const pagesList = [];
    function traverse(nodeObjNum) {
      const body = allObjects.get(String(nodeObjNum));
      if (!body) return;
      if (/\/Type\s*\/Page\b/i.test(body) && !/\/Type\s*\/Pages\b/i.test(body)) {
        pagesList.push(nodeObjNum);
        return;
      }
      const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
      if (kidsMatch) {
        const refs = kidsMatch[1].match(/(\d+)\s+\d+\s+R/g) || [];
        for (const ref of refs) {
          const kidNum = ref.match(/^(\d+)/)[1];
          traverse(kidNum);
        }
      }
    }
    if (pagesMatch) traverse(pagesMatch[1]);

    let pages = [];
    let pageNum = 1;

    // A. Extracción secuencial basada en el Page Tree
    if (pagesList.length > 0) {
      for (const pageObjNum of pagesList) {
        const body = allObjects.get(String(pageObjNum));
        if (!body) continue;

        const contentsMatch = body.match(/\/Contents\s+(?:\[([\s\S]*?)\]|(\d+)\s+\d+\s+R)/);
        let contentObjs = [];
        if (contentsMatch) {
          if (contentsMatch[1]) {
            contentObjs = (contentsMatch[1].match(/(\d+)\s+\d+\s+R/g) || []).map(r => r.match(/^(\d+)/)[1]);
          } else if (contentsMatch[2]) {
            contentObjs = [contentsMatch[2]];
          }
        }

        let pageItems = [];

        // Extraer contenido de streams de texto de la página
        for (const cNum of contentObjs) {
          const cBody = allObjects.get(String(cNum));
          if (!cBody) continue;
          const streamIdx = cBody.indexOf('stream');
          const endStreamIdx = cBody.indexOf('endstream', streamIdx);
          if (streamIdx !== -1 && endStreamIdx !== -1) {
            let dataStart = streamIdx + 6;
            if (cBody.charCodeAt(dataStart) === 13) dataStart++;
            if (cBody.charCodeAt(dataStart) === 10) dataStart++;
            let rawEnd = endStreamIdx;
            if (rawEnd > dataStart && (cBody.charCodeAt(rawEnd - 1) === 10 || cBody.charCodeAt(rawEnd - 1) === 13)) rawEnd--;
            if (rawEnd > dataStart && (cBody.charCodeAt(rawEnd - 1) === 10 || cBody.charCodeAt(rawEnd - 1) === 13)) rawEnd--;

            const offset = objOffsets.get(String(cNum));
            const rawBytes = offset !== undefined
              ? bytes.subarray(offset + dataStart, offset + rawEnd)
              : new Uint8Array(Array.from(cBody.substring(dataStart, rawEnd), ch => ch.charCodeAt(0)));

            try {
              let streamString = '';
              const decompressed = await decompressDeflateData(rawBytes);
              if (decompressed) {
                streamString = decoder.decode(decompressed);
              } else {
                streamString = decoder.decode(rawBytes);
              }

              if (streamString) {
                const parsed = parsePdfStreamText(streamString, cmap);
                if (parsed && parsed.length > 0) {
                  pageItems.push(parsed);
                }
              }
            } catch (e) {}
          }
        }

        const pageText = pageItems.join('\n\n').replace(/[ \t]+/g, ' ').trim();
        if (pageText.length > 0) {
          pages.push(`--- Página ${pageNum} ---\n${pageText}`);
        }
        pageNum++;
      }
    }

    // B. Fallback a escaneo lineal si el árbol de páginas no produjo resultados
    if (pages.length === 0) {
      let currentPageItems = [];
      let pos = 0;
      const len = fullText.length;
      pageNum = 1;

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
            const isDCT = dictSlice.includes('DCTDecode');
            const isFlate = dictSlice.includes('FlateDecode');
            const isFontOrMeta = dictSlice.includes('/Font') || dictSlice.includes('/Metadata') || dictSlice.includes('/ICCBased');
            let rawEnd = endStreamIdx;
            if (rawEnd > dataStart && (fullText.charCodeAt(rawEnd - 1) === 10 || fullText.charCodeAt(rawEnd - 1) === 13)) rawEnd--;
            if (rawEnd > dataStart && (fullText.charCodeAt(rawEnd - 1) === 10 || fullText.charCodeAt(rawEnd - 1) === 13)) rawEnd--;

            const byteOffset = dataStart;
            const byteLen = rawEnd - dataStart;
            const rawStreamBytes = bytes.subarray(byteOffset, byteOffset + byteLen);

            if (!isFontOrMeta && !isDCT) {
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
                const parsed = parsePdfStreamText(streamString, cmap);
                if (parsed && parsed.trim().length > 0) {
                  currentPageItems.push(parsed.trim());
                }
              }
            }

            if (currentPageItems.length >= 4) {
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

      if (currentPageItems.length > 0) {
        const pageText = currentPageItems.join('\n\n').trim();
        if (pageText.length > 0) {
          pages.push(`--- Página ${pageNum} ---\n${pageText}`);
        }
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
      finalCleanText = `[Documento PDF adjunto: No se pudo extraer texto seleccionable. Es posible que el PDF contenga únicamente imágenes escaneadas o esté protegido por contraseña.]`;
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
        content: String(extractedText),
        preview: `📕 ${file.name} (${formatBytes(file.size)})`
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
