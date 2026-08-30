/**
 * ZeroChat Local RAG Storage Module (ChatRagStorage)
 *
 * Arquitectura de almacenamiento en sistema de ficheros local sobre ./zerochat/RAG/
 *
 * Estructura de directorios:
 *  zerochat/
 *  └── RAG/
 *      └── <branch_id>/
 *          ├── rama.md                  (Definición, nombre, descripción y metadatos de la rama)
 *          ├── 0001/                    (Subdirectorios numerados con máximo 100 archivos)
 *          │   ├── documento1.pdf       (Archivo original subido)
 *          │   ├── documento1.md        (Resumen general, capítulos e índice de imágenes)
 *          │   ├── guia.txt
 *          │   ├── guia.md
 *          │   └── images/              (Diagramas/imágenes extraídas)
 *          │       ├── img_87_0.jpg
 *          │       └── img_87_1.jpg
 *          └── 0002/                    (Siguiente subdirectorio al superar los 100 archivos)
 *
 * Compatible con Browser (File System Access API vía ChatFileSystem) y Node.js.
 */

(function (root, factory) {
  if (typeof exports === "object" && typeof module !== "undefined") {
    module.exports = factory();
  } else {
    root.ChatRagStorage = factory();
    root.RagStorage = root.ChatRagStorage; // Alias corto
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RAG_ROOT = "RAG";
  const MAX_FILES_PER_BUCKET = 100;
  const RAMA_FILE = "rama.md";

  // Constantes de compatibilidad con código legacy
  const DB_NAME = "LocalRAG_DB";
  const DB_VERSION = 1;
  const STORE_BRANCHES = "branches";
  const STORE_DOCUMENTS = "documents";

  // ==========================================================================
  // Clases de Error Personalizadas
  // ==========================================================================

  class RagStorageError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = "RagStorageError";
      this.details = details;
    }
  }

  class ValidationError extends RagStorageError {
    constructor(message, details = {}) {
      super(message, details);
      this.name = "ValidationError";
    }
  }

  class QuotaExceededError extends RagStorageError {
    constructor(message = "Se ha superado el límite de almacenamiento disponible en el navegador (QuotaExceededError).", details = {}) {
      super(message, details);
      this.name = "QuotaExceededError";
    }
  }

  class NotFoundError extends RagStorageError {
    constructor(message, details = {}) {
      super(message, details);
      this.name = "NotFoundError";
    }
  }

  // ==========================================================================
  // Resolución de Dependencia de Sistema de Archivos
  // ==========================================================================

  function getFS() {
    if (typeof window !== "undefined" && (window.ChatFileSystem || window.LocalFS)) {
      return window.ChatFileSystem || window.LocalFS;
    }
    if (typeof require !== "undefined") {
      try {
        return require("./file-system.js");
      } catch (e) {}
    }
    return null;
  }

  function getFileParser() {
    if (typeof window !== "undefined" && window.ChatFileParser) {
      return window.ChatFileParser;
    }
    if (typeof globalThis !== "undefined" && globalThis.ChatFileParser) {
      return globalThis.ChatFileParser;
    }
    if (typeof require !== "undefined") {
      try {
        return require("./file-parser.js");
      } catch (e) {}
    }
    return null;
  }

  // ==========================================================================
  // Caché de Imágenes y Diagramas en Memoria
  // ==========================================================================

  const ragImageCache = new Map(); // key -> { dataUrl, docId, metadata }
  const docLocationIndex = new Map(); // docId -> { branchId, bucket, fileName, mdPath, origPath }

  function normalizeImageKey(key) {
    if (!key) return "";
    return String(key).replace(/^rag-image:\/\//, "").replace(/^#/, "").trim();
  }

  function registerImage(docId, imgId, base64Data, metadata = {}) {
    const cleanId = normalizeImageKey(imgId);
    if (!cleanId || !base64Data) return;
    const entry = {
      dataUrl: base64Data,
      docId: docId || "",
      metadata: metadata || {}
    };
    ragImageCache.set(cleanId, entry);
    if (docId) {
      ragImageCache.set(`${docId}/${cleanId}`, entry);
    }
  }

  async function resolveImageSrc(src, branchId = "") {
    if (!src) return src;
    if (typeof src === "string") {
      if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:")) {
        return src;
      }

      const cleanKey = normalizeImageKey(src);
      
      // 1. Búsqueda exacta en caché
      if (ragImageCache.has(cleanKey)) {
        return ragImageCache.get(cleanKey).dataUrl;
      }

      // 2. Búsqueda por sub-clave (ej: img_7_12)
      const lastPart = cleanKey.split("/").pop().replace(/^#/, "");
      if (ragImageCache.has(lastPart)) {
        return ragImageCache.get(lastPart).dataUrl;
      }

      const fs = getFS();
      const FileParser = getFileParser();

      // 3. Búsqueda en los documentos de la rama o globalmente
      let branchesToSearch = [];
      if (branchId) {
        branchesToSearch = [{ id: branchId }];
      } else {
        try {
          branchesToSearch = await getBranches();
        } catch (_) {}
      }

      for (const br of branchesToSearch) {
        try {
          const docs = await getDocumentsByBranch(br.id);
          for (const d of docs) {
            // A. Extracción bajo demanda a partir del índice de imágenes (doc.images)
            const imgMeta = (d.images || []).find(img => img.id === lastPart || ('#' + img.id) === lastPart || img.id === `img_${lastPart}`);
            if (imgMeta && typeof imgMeta.offset === "number" && typeof imgMeta.length === "number" && fs) {
              const origPath = `${RAG_ROOT}/${d.branchId}/${d.bucket || "0001"}/${d.title}`;
              const exists = await fs.exists(origPath);
              if (exists.exists) {
                try {
                  const pdfBytes = await fs.readFile(origPath, "uint8Array");
                  if (pdfBytes && FileParser && typeof FileParser.extractImageFromPdfBytes === "function") {
                    const dataUrl = FileParser.extractImageFromPdfBytes(pdfBytes, imgMeta);
                    if (dataUrl) {
                      registerImage(d.id, lastPart, dataUrl, imgMeta);
                      registerImage(d.id, `${d.id}/${lastPart}`, dataUrl, imgMeta);
                      return dataUrl;
                    }
                  }
                } catch (readErr) {
                  console.warn(`[ChatRagStorage] Error al extraer imagen ${lastPart} de ${origPath}:`, readErr);
                }
              }
            }

            // B. Fallback para imágenes legacy/mock embebidas en capítulos
            for (const ch of d.chapters || []) {
              if (ch.content && ch.content.includes(lastPart)) {
                const match = ch.content.match(new RegExp('!\\[[^\\]]*#' + lastPart + '[^\\]]*\\]\\((data:image/[^)]+)\\)'));
                if (match && match[1]) {
                  registerImage(d.id, lastPart, match[1]);
                  return match[1];
                }
              }
            }
          }
        } catch (_) {}
      }
    }
    return src;
  }

  function extractAndRegisterChapterImages(docId, chapters) {
    if (!Array.isArray(chapters)) return;
    for (const ch of chapters) {
      if (!ch.content) continue;
      const regex = /!\[[^\]]*#(img_[\w_\-]+)[^\]]*\]\((data:image\/[^)]+)\)/g;
      let m;
      while ((m = regex.exec(ch.content)) !== null) {
        const imgTag = m[1];
        const dataUrl = m[2];
        const chId = ch.chapterId || "";
        registerImage(docId, imgTag, dataUrl, { chapterId: chId });
        registerImage(docId, `${chId}/${imgTag}`, dataUrl, { chapterId: chId });
        registerImage(docId, `${docId}/${chId}/${imgTag}`, dataUrl, { chapterId: chId });
      }
    }
  }

  // ==========================================================================
  // Generador de Identificadores Únicos
  // ==========================================================================

  function generateId(prefix = "id") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    const rand = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  function getSummaryMdFileName(fileName) {
    if (!fileName) return "documento.md";
    const idx = fileName.lastIndexOf(".");
    if (idx > 0) {
      const ext = fileName.slice(idx).toLowerCase();
      if (ext === ".md") {
        return fileName;
      }
      return `${fileName.slice(0, idx)}.md`;
    }
    return `${fileName}.md`;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // ==========================================================================
  // Parseadores y Serializadores Frontmatter Markdown
  // ==========================================================================

  function parseFrontmatter(markdownText) {
    if (!markdownText || typeof markdownText !== "string") return { meta: {}, body: "" };
    const trimmed = markdownText.trimStart();
    if (!trimmed.startsWith("---")) {
      return { meta: {}, body: markdownText };
    }
    const endIdx = trimmed.indexOf("\n---", 3);
    if (endIdx === -1) {
      return { meta: {}, body: markdownText };
    }
    const frontmatterContent = trimmed.slice(3, endIdx).trim();
    const body = trimmed.slice(endIdx + 4).trim();
    const meta = {};
    for (const line of frontmatterContent.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > -1) {
        const key = line.slice(0, colonIdx).trim();
        let val = line.slice(colonIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        } else if (val === "true") {
          val = true;
        } else if (val === "false") {
          val = false;
        } else if (!isNaN(Number(val)) && val !== "") {
          val = Number(val);
        }
        if (key) meta[key] = val;
      }
    }
    return { meta, body };
  }

  function serializeFrontmatter(meta, body = "") {
    let yaml = "---\n";
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined || v === null) continue;
      if (typeof v === "string") {
        yaml += `${k}: "${v.replace(/"/g, '\\"')}"\n`;
      } else {
        yaml += `${k}: ${v}\n`;
      }
    }
    yaml += "---\n\n";
    return yaml + body;
  }

  // ==========================================================================
  // Formateadores y Parseadores de Rama (rama.md)
  // ==========================================================================

  function formatRamaMarkdown(branch) {
    const meta = {
      id: branch.id,
      name: branch.name,
      createdAt: branch.createdAt || Date.now(),
      updatedAt: branch.updatedAt || Date.now()
    };
    const body = `# Rama: ${branch.name}\n\n${branch.description || ""}\n`;
    return serializeFrontmatter(meta, body);
  }

  function parseRamaMarkdown(content, branchId) {
    const { meta, body } = parseFrontmatter(content);
    let description = body;
    description = description.replace(/^#\s+Rama:[^\n]*\n+/i, "").trim();
    return {
      id: meta.id || branchId,
      name: meta.name || branchId,
      description: description,
      createdAt: meta.createdAt || Date.now(),
      updatedAt: meta.updatedAt || Date.now()
    };
  }

  // ==========================================================================
  // Formateadores y Parseadores de Documentos (<doc>.md)
  // ==========================================================================

  function formatDocumentMarkdown(doc) {
    const meta = {
      id: doc.id,
      branchId: doc.branchId,
      title: doc.title,
      originalFilename: doc.title,
      fileType: doc.fileType || "txt",
      fileSize: doc.fileSize || 0,
      bucket: doc.bucket || "0001",
      createdAt: doc.createdAt || Date.now(),
      totalChapters: (doc.chapters || []).length
    };

    let body = `# Resumen General del Documento\n\n${doc.globalSummary || "Sin resumen global."}\n\n---\n\n## Capítulos\n\n`;

    if (Array.isArray(doc.chapters)) {
      for (let i = 0; i < doc.chapters.length; i++) {
        const ch = doc.chapters[i];
        const chId = ch.chapterId || (i + 1);
        const chTitle = ch.title || `Capítulo ${chId}`;
        body += `### Capítulo ${chId}: ${chTitle}\n`;
        body += `**Resumen**: ${ch.summary || ""}\n\n`;
        body += `**Contenido**:\n${ch.content || ""}\n\n`;
      }
    }

    body += `---\n\n## Índice de Imágenes y Diagramas\n\n`;
    if (Array.isArray(doc.images) && doc.images.length > 0) {
      for (const img of doc.images) {
        const cleanId = String(img.id || "").replace(/^#/, "");
        const pageStr = img.page !== undefined ? ` | page=${img.page}` : "";
        const offsetStr = img.offset !== undefined ? ` | offset=${img.offset}` : "";
        const lenStr = img.length !== undefined ? ` | length=${img.length}` : "";
        const cmykStr = (img.isCmyk || img.cmyk) ? ` | cmyk=1` : "";
        const fmtStr = img.format ? ` | format=${img.format}` : "";
        body += `- **#${cleanId}**: ${img.caption || "Diagrama / Esquema"}${pageStr}${offsetStr}${lenStr}${cmykStr}${fmtStr}\n`;
      }
    } else {
      body += `*(No se detectaron diagramas en este documento)*\n`;
    }

    return serializeFrontmatter(meta, body);
  }

  function parseDocumentMarkdown(mdContent, fallbackTitle = "", bucket = "0001", branchId = "") {
    const { meta, body } = parseFrontmatter(mdContent);

    // 1. Extraer resumen global
    let globalSummary = "";
    const sumMatch = body.match(/#\s+Resumen General del Documento\n+([\s\S]*?)(?=\n+---\n+|\n+##\s+Capítulos|$)/i);
    if (sumMatch) {
      globalSummary = sumMatch[1].trim();
    }

    // 2. Extraer capítulos
    const chapters = [];
    const chapRegex = /###\s+Capítulo\s+(\d+):\s*([^\n]+)\n+\*\*Resumen\*\*:\s*([\s\S]*?)\n+\*\*Contenido\*\*:\n+([\s\S]*?)(?=\n+###\s+Capítulo|\n+---\n+|\n+##\s+Índice|$)/gi;
    let match;
    let fallbackIdx = 1;

    while ((match = chapRegex.exec(body)) !== null) {
      const chId = parseInt(match[1], 10) || fallbackIdx;
      const title = match[2].trim();
      const summary = match[3].trim();
      const content = match[4].trim();
      chapters.push({
        chapterId: chId,
        title: title,
        summary: summary,
        content: content,
        charCount: content.length
      });
      fallbackIdx++;
    }

    // 3. Extraer imágenes e índices de acceso
    const images = [];
    const imgRegex = /- \*\*#([^\*:]+)\*\*:\s*([^|\n]+)([\s\S]*?)(?=\n- \*\*#|\n\n|$)/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(body)) !== null) {
      const imgId = imgMatch[1].trim();
      const caption = imgMatch[2].trim();
      const rest = imgMatch[3] || "";
      const pageM = rest.match(/page=(\d+)/i);
      const offsetM = rest.match(/offset=(\d+)/i);
      const lenM = rest.match(/length=(\d+)/i);
      const cmykM = rest.match(/cmyk=(\d+)/i);
      const fmtM = rest.match(/format=([a-zA-Z0-9_-]+)/i);

      images.push({
        id: imgId,
        caption: caption,
        page: pageM ? parseInt(pageM[1], 10) : 1,
        offset: offsetM ? parseInt(offsetM[1], 10) : undefined,
        length: lenM ? parseInt(lenM[1], 10) : undefined,
        isCmyk: cmykM ? (parseInt(cmykM[1], 10) === 1) : false,
        format: fmtM ? fmtM[1] : "jpeg"
      });
    }

    const title = meta.title || meta.originalFilename || fallbackTitle;
    const docId = meta.id || generateId("doc");

    return {
      id: docId,
      branchId: meta.branchId || branchId,
      title: title,
      fileType: meta.fileType || "txt",
      fileSize: meta.fileSize || 0,
      bucket: meta.bucket || bucket,
      createdAt: meta.createdAt || Date.now(),
      globalSummary: globalSummary,
      chapters: chapters,
      images: images
    };
  }

  // ==========================================================================
  // Gestión de Buckets Paginados (0001, 0002, ...)
  // ==========================================================================

  async function getBranchBuckets(branchId) {
    const fs = getFS();
    if (!fs) return ["0001"];

    const branchDir = `${RAG_ROOT}/${branchId}`;
    const exists = await fs.exists(branchDir);
    if (!exists.exists) return ["0001"];

    const list = await fs.listDirectory(branchDir, { recursive: false });
    const buckets = list
      .filter(item => item.kind === "directory" && /^\d{4}$/.test(item.name))
      .map(item => item.name)
      .sort();

    return buckets.length > 0 ? buckets : ["0001"];
  }

  async function getAvailableBucket(branchId) {
    const fs = getFS();
    if (!fs) return "0001";

    const buckets = await getBranchBuckets(branchId);
    const lastBucket = buckets[buckets.length - 1] || "0001";

    const bucketPath = `${RAG_ROOT}/${branchId}/${lastBucket}`;
    const exists = await fs.exists(bucketPath);
    if (!exists.exists) {
      await fs.createDirectory(bucketPath);
      return lastBucket;
    }

    const items = await fs.listDirectory(bucketPath, { recursive: false });
    const mdFiles = items.filter(item => item.kind === "file" && item.name.endsWith(".md"));

    if (mdFiles.length >= MAX_FILES_PER_BUCKET) {
      const nextNum = parseInt(lastBucket, 10) + 1;
      const nextBucket = String(nextNum).padStart(4, "0");
      await fs.createDirectory(`${RAG_ROOT}/${branchId}/${nextBucket}`);
      return nextBucket;
    }

    return lastBucket;
  }

  // ==========================================================================
  // Validación de Entidades
  // ==========================================================================

  function validateBranch(data) {
    if (!data || typeof data !== "object") {
      throw new ValidationError("Los datos de la rama deben ser un objeto válido.");
    }
    if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
      throw new ValidationError("El nombre de la rama es obligatorio y no puede estar vacío.");
    }
    return {
      id: data.id ? String(data.id).trim() : generateId("branch"),
      name: String(data.name).trim(),
      description: data.description ? String(data.description).trim() : "",
      createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now()
    };
  }

  const ALLOWED_FILE_TYPES = new Set([
    "txt", "md", "markdown", "pdf", "csv", "json", "js", "ts", "py", "html", "css", "xml", "log", "yaml", "yml", "doc", "docx"
  ]);

  function validateDocument(data) {
    if (!data || typeof data !== "object") {
      throw new ValidationError("Los datos del documento deben ser un objeto válido.");
    }
    if (!data.branchId || typeof data.branchId !== "string" || data.branchId.trim().length === 0) {
      throw new ValidationError("El documento debe estar asociado a un branchId válido.");
    }
    if (!data.title || typeof data.title !== "string" || data.title.trim().length === 0) {
      throw new ValidationError("El título del documento es obligatorio.");
    }
    const cleanType = data.fileType ? String(data.fileType).toLowerCase().replace(/^\./, "").trim() : "txt";
    if (!ALLOWED_FILE_TYPES.has(cleanType)) {
      throw new ValidationError(`Tipo de archivo no permitido: "${data.fileType}"`);
    }
    return {
      id: data.id ? String(data.id).trim() : generateId("doc"),
      branchId: String(data.branchId).trim(),
      title: String(data.title).trim(),
      fileType: cleanType,
      fileSize: typeof data.fileSize === "number" ? data.fileSize : 0,
      globalSummary: data.globalSummary ? String(data.globalSummary).trim() : "",
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      images: Array.isArray(data.images) ? data.images : [],
      createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now()
    };
  }

  // ==========================================================================
  // Métodos CRUD: Ramas (Branches)
  // ==========================================================================

  async function createBranch(nameOrData, description = "") {
    const fs = getFS();
    if (!fs) throw new RagStorageError("ChatFileSystem no está disponible.");

    let branchInput;
    if (typeof nameOrData === "string") {
      branchInput = { name: nameOrData, description: description };
    } else {
      branchInput = nameOrData;
    }

    const branch = validateBranch(branchInput);
    const branchDir = `${RAG_ROOT}/${branch.id}`;

    await fs.createDirectory(branchDir);
    await fs.createDirectory(`${branchDir}/0001`);

    const ramaMd = formatRamaMarkdown(branch);
    await fs.writeFile(`${branchDir}/${RAMA_FILE}`, ramaMd);

    console.info(`[ChatRagStorage] Rama creada en disco: "${branch.name}" [${branch.id}]`);
    return { ...branch };
  }

  async function getBranches() {
    const fs = getFS();
    if (!fs) return [];

    const exists = await fs.exists(RAG_ROOT);
    if (!exists.exists) return [];

    const items = await fs.listDirectory(RAG_ROOT, { recursive: false });
    const branches = [];

    for (const item of items) {
      if (item.kind === "directory") {
        const ramaPath = `${RAG_ROOT}/${item.name}/${RAMA_FILE}`;
        const ramaExists = await fs.exists(ramaPath);
        if (ramaExists.exists) {
          try {
            const content = await fs.readFile(ramaPath, "text");
            const branch = parseRamaMarkdown(content, item.name);
            branches.push(branch);
          } catch (err) {
            console.warn(`[ChatRagStorage] Error al leer rama en "${ramaPath}":`, err);
          }
        }
      }
    }

    return branches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function getBranchById(id) {
    const cleanId = String(id || "").trim();
    if (!cleanId) return null;

    const fs = getFS();
    if (!fs) return null;

    const ramaPath = `${RAG_ROOT}/${cleanId}/${RAMA_FILE}`;
    const exists = await fs.exists(ramaPath);
    if (!exists.exists) {
      return null;
    }

    const content = await fs.readFile(ramaPath, "text");
    return parseRamaMarkdown(content, cleanId);
  }

  async function updateBranch(id, updates = {}) {
    const cleanId = String(id || "").trim();
    if (!cleanId) throw new ValidationError("El ID de la rama es obligatorio.");

    const branch = await getBranchById(cleanId);
    if (!branch) {
      throw new NotFoundError(`No existe la rama [${cleanId}].`);
    }

    if (updates.name) branch.name = String(updates.name).trim();
    if (updates.description !== undefined) branch.description = String(updates.description).trim();
    branch.updatedAt = Date.now();

    const fs = getFS();
    const ramaPath = `${RAG_ROOT}/${cleanId}/${RAMA_FILE}`;
    const ramaMd = formatRamaMarkdown(branch);
    await fs.writeFile(ramaPath, ramaMd);

    return { ...branch };
  }

  async function deleteBranch(id) {
    const cleanId = String(id || "").trim();
    if (!cleanId) throw new ValidationError("El ID de la rama es obligatorio.");

    const branch = await getBranchById(cleanId);
    if (!branch) {
      throw new NotFoundError(`No existe la rama [${cleanId}].`);
    }

    const fs = getFS();
    const branchDir = `${RAG_ROOT}/${cleanId}`;

    const headers = await getDocumentHeadersByBranch(cleanId);
    const docCount = headers.length;

    await fs.deleteDirectory(branchDir, { recursive: true });

    // Limpiar índice en memoria
    for (const [docId, loc] of Array.from(docLocationIndex.entries())) {
      if (loc.branchId === cleanId) {
        docLocationIndex.delete(docId);
      }
    }

    console.info(`[ChatRagStorage] Rama [${cleanId}] y ${docCount} documentos eliminados en cascada.`);
    return { success: true, deletedBranchId: cleanId, deletedDocumentsCount: docCount };
  }

  // ==========================================================================
  // Métodos CRUD: Documentos (Documents)
  // ==========================================================================

  async function saveDocument(documentData, rawFileContent = null) {
    const doc = validateDocument(documentData);
    const fs = getFS();
    if (!fs) throw new RagStorageError("ChatFileSystem no está disponible.");

    // 1. Verificar que la rama existe
    const branch = await getBranchById(doc.branchId);
    if (!branch) {
      throw new NotFoundError(`No se puede guardar el documento: La rama asociada [${doc.branchId}] no existe.`);
    }

    // 2. Obtener bucket disponible (0001, 0002, ...)
    const bucket = await getAvailableBucket(doc.branchId);
    doc.bucket = bucket;

    const bucketPath = `${RAG_ROOT}/${doc.branchId}/${bucket}`;
    const baseName = doc.title;
    const mdName = getSummaryMdFileName(baseName);

    const mdPath = `${bucketPath}/${mdName}`;
    const origPath = `${bucketPath}/${baseName}`;

    // 3. Guardar archivo original si se proporciona
    if (rawFileContent !== null && rawFileContent !== undefined) {
      try {
        await fs.writeFile(origPath, rawFileContent);
      } catch (err) {
        console.warn(`[ChatRagStorage] No se pudo escribir archivo original en ${origPath}:`, err);
      }
    }

    // 4. Registrar imágenes de capítulos si existen
    extractAndRegisterChapterImages(doc.id, doc.chapters);

    // 5. Guardar archivo estructurado Markdown con resúmenes y capítulos
    const mdContent = formatDocumentMarkdown(doc);
    await fs.writeFile(mdPath, mdContent);

    // 6. Actualizar rama updatedAt
    await updateBranch(doc.branchId, { updatedAt: Date.now() });

    // 7. Indexar ubicación en memoria
    docLocationIndex.set(doc.id, {
      branchId: doc.branchId,
      bucket: bucket,
      fileName: baseName,
      mdPath: mdPath,
      origPath: origPath
    });

    console.info(`[ChatRagStorage] Documento guardado en disco: "${doc.title}" [${doc.id}] en ${bucketPath}/`);
    return { ...doc };
  }

  async function getDocumentsByBranch(branchId) {
    const cleanId = String(branchId || "").trim();
    if (!cleanId) return [];

    const fs = getFS();
    if (!fs) return [];

    const buckets = await getBranchBuckets(cleanId);
    const documents = [];

    for (const b of buckets) {
      const bucketPath = `${RAG_ROOT}/${cleanId}/${b}`;
      const exists = await fs.exists(bucketPath);
      if (!exists.exists) continue;

      const items = await fs.listDirectory(bucketPath, { recursive: false });
      const mdFiles = items.filter(item => item.kind === "file" && item.name.endsWith(".md"));

      for (const f of mdFiles) {
        const filePath = `${bucketPath}/${f.name}`;
        try {
          const content = await fs.readFile(filePath, "text");
          const doc = parseDocumentMarkdown(content, f.name.replace(/\.md$/, ""), b, cleanId);
          documents.push(doc);

          extractAndRegisterChapterImages(doc.id, doc.chapters);

          docLocationIndex.set(doc.id, {
            branchId: cleanId,
            bucket: b,
            fileName: doc.title,
            mdPath: filePath,
            origPath: `${bucketPath}/${doc.title}`
          });
        } catch (err) {
          console.warn(`[ChatRagStorage] Error al leer documento "${filePath}":`, err);
        }
      }
    }

    return documents.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function getDocumentHeadersByBranch(branchId) {
    const cleanId = String(branchId || "").trim();
    if (!cleanId) return [];

    const docs = await getDocumentsByBranch(cleanId);
    return docs.map(doc => ({
      id: doc.id,
      branchId: doc.branchId,
      title: doc.title,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      bucket: doc.bucket,
      createdAt: doc.createdAt,
      globalSummary: doc.globalSummary,
      chaptersCount: (doc.chapters || []).length,
      chapters: (doc.chapters || []).map(ch => ({
        chapterId: ch.chapterId,
        title: ch.title,
        summary: ch.summary,
        charCount: ch.charCount
      }))
    }));
  }

  async function getDocumentById(docId) {
    const cleanId = String(docId || "").trim();
    if (!cleanId) return null;

    const fs = getFS();
    if (!fs) return null;

    // 1. Intentar resolver por índice rápido
    let loc = docLocationIndex.get(cleanId);
    if (loc && loc.mdPath) {
      const exists = await fs.exists(loc.mdPath);
      if (exists.exists) {
        const content = await fs.readFile(loc.mdPath, "text");
        const doc = parseDocumentMarkdown(content, loc.fileName, loc.bucket, loc.branchId);
        extractAndRegisterChapterImages(doc.id, doc.chapters);
        return doc;
      }
    }

    // 2. Búsqueda por escaneo de ramas
    const branches = await getBranches();
    for (const b of branches) {
      const docs = await getDocumentsByBranch(b.id);
      for (const d of docs) {
        if (d.id === cleanId) {
          return d;
        }
      }
    }

    return null;
  }

  async function getChapterContent(docId, chapterId) {
    try {
      const doc = await getDocumentById(docId);
      if (!doc) return null;
      const chId = Number(chapterId);
      const chapter = (doc.chapters || []).find(ch => ch.chapterId === chId);
      if (!chapter) {
        return null;
      }
      return chapter.content || "";
    } catch (_) {
      return null;
    }
  }

  async function deleteDocument(docId) {
    const cleanId = String(docId || "").trim();
    if (!cleanId) throw new ValidationError("El docId es obligatorio.");

    const doc = await getDocumentById(docId);
    if (!doc) return false;

    const fs = getFS();
    if (!fs) throw new RagStorageError("ChatFileSystem no está disponible.");

    const bucketPath = `${RAG_ROOT}/${doc.branchId}/${doc.bucket || "0001"}`;
    const baseName = doc.title;
    const mdName = getSummaryMdFileName(baseName);

    const mdPath = `${bucketPath}/${mdName}`;
    const origPath = `${bucketPath}/${baseName}`;

    try { await fs.deleteFile(mdPath); } catch (_) {}
    if (origPath !== mdPath) {
      try { await fs.deleteFile(origPath); } catch (_) {}
    }

    docLocationIndex.delete(cleanId);
    console.info(`[ChatRagStorage] Documento [${cleanId}] eliminado de ${bucketPath}/`);
    return true;
  }

  // ==========================================================================
  // Exportación e Importación Comprimida (.rag.gz)
  // ==========================================================================

  async function compressData(jsonStr) {
    if (typeof globalThis.CompressionStream !== 'undefined') {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(jsonStr));
          controller.close();
        }
      }).pipeThrough(new globalThis.CompressionStream('gzip'));
      
      const chunks = [];
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
      }
      return result;
    } else {
      throw new Error('El navegador o entorno no soporta CompressionStream.');
    }
  }

  async function decompressData(uint8Array) {
    if (typeof globalThis.DecompressionStream !== 'undefined') {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(uint8Array);
          controller.close();
        }
      }).pipeThrough(new globalThis.DecompressionStream('gzip'));
      
      const chunks = [];
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
      }
      return new TextDecoder().decode(result);
    } else {
      throw new Error('El navegador o entorno no soporta DecompressionStream.');
    }
  }

  function base64ToUint8(base64) {
    const binaryString = atob(base64.trim());
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

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

  function getParentPath(pathStr) {
    const idx = pathStr.lastIndexOf("/");
    return idx > -1 ? pathStr.slice(0, idx) : "";
  }

  async function exportBranch(branchId) {
    const branch = await getBranchById(branchId);
    if (!branch) throw new NotFoundError(`No existe la rama [${branchId}].`);

    const fs = getFS();
    if (!fs) throw new RagStorageError("ChatFileSystem no está disponible.");

    const branchDir = `${RAG_ROOT}/${branchId}`;
    const files = await fs.listDirectory(branchDir, { recursive: true });

    const packedFiles = [];

    for (const f of files) {
      if (f.kind !== "file") continue;
      const absolutePath = f.path; // f.path ya es la ruta completa desde la raíz de ChatFileSystem
      const relativePath = absolutePath.startsWith(branchDir) 
        ? absolutePath.slice(branchDir.length + 1) 
        : absolutePath;

      // Determinar si es texto o binario para una codificación óptima
      const isText = relativePath.endsWith(".md") || relativePath.endsWith(".txt") || relativePath.endsWith(".json");
      if (isText) {
        const textContent = await fs.readFile(absolutePath, "text");
        packedFiles.push({
          path: relativePath,
          content: textContent,
          encoding: "utf8"
        });
      } else {
        const bytes = await fs.readFile(absolutePath, "uint8Array");
        const base64Content = uint8ToBase64(bytes);
        packedFiles.push({
          path: relativePath,
          content: base64Content,
          encoding: "base64"
        });
      }
    }

    const packageData = {
      schema: "ChatCLI_RAG_Branch_Directory_v1",
      version: 1,
      exportedAt: Date.now(),
      branch: {
        id: branch.id,
        name: branch.name,
        description: branch.description,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt
      },
      files: packedFiles
    };

    const jsonStr = JSON.stringify(packageData);
    const compressedBytes = await compressData(jsonStr);
    return compressedBytes;
  }

  async function importBranch(inputData, options = {}) {
    // 1. Detectar si el inputData es el formato JSON legacy (cadena o JSON parseado)
    let isLegacyJson = false;
    let legacyPayload = null;

    if (typeof inputData === "string") {
      const trimmed = inputData.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          legacyPayload = JSON.parse(inputData);
          isLegacyJson = true;
        } catch (_) {}
      }
    } else if (inputData && typeof inputData === "object" && !(inputData instanceof ArrayBuffer) && !(inputData instanceof Uint8Array) && !(typeof Blob !== "undefined" && inputData instanceof Blob)) {
      legacyPayload = inputData;
      isLegacyJson = true;
    }

    if (isLegacyJson) {
      return await importBranchFromJson(legacyPayload, options);
    }

    // 2. Procesar como paquete comprimido Gzip (.rag.gz)
    let compressedBytes;
    if (inputData instanceof Uint8Array) {
      compressedBytes = inputData;
    } else if (inputData instanceof ArrayBuffer) {
      compressedBytes = new Uint8Array(inputData);
    } else if (typeof Blob !== "undefined" && inputData instanceof Blob) {
      compressedBytes = new Uint8Array(await inputData.arrayBuffer());
    } else {
      throw new ValidationError("Tipo de datos de importación no soportado.");
    }

    const fs = getFS();
    if (!fs) throw new RagStorageError("ChatFileSystem no está disponible.");

    let packageData;
    try {
      const jsonStr = await decompressData(compressedBytes);
      packageData = JSON.parse(jsonStr);
    } catch (err) {
      throw new ValidationError("El archivo importado no contiene una firma Gzip válida o la estructura del paquete RAG está corrupta.");
    }

    if (!packageData || !packageData.branch || !packageData.branch.name) {
      throw new ValidationError('Estructura de rama inválida en el paquete importado.');
    }

    const branchName = String(packageData.branch.name).trim();
    const branchDesc = String(packageData.branch.description || "").trim();
    const files = Array.isArray(packageData.files) ? packageData.files : [];

    const existingBranch = packageData.branch.id ? await getBranchById(packageData.branch.id).catch(() => null) : null;
    const shouldCreateNew = options.createNewId || Boolean(existingBranch);

    let targetBranch;
    if (shouldCreateNew) {
      const importedName = existingBranch ? `${branchName} (Copia)` : branchName;
      targetBranch = await createBranch(importedName, branchDesc);
    } else {
      targetBranch = await createBranch(branchName, branchDesc);
    }

    const targetBranchDir = `${RAG_ROOT}/${targetBranch.id}`;

    // Restaurar cada archivo individualmente en la nueva ubicación física del disco
    for (const f of files) {
      if (!f.path) continue;
      const targetFilePath = `${targetBranchDir}/${f.path}`;
      const parentDir = getParentPath(targetFilePath);
      if (parentDir) {
        await fs.createDirectory(parentDir);
      }

      if (f.encoding === "base64") {
        const fileBytes = base64ToUint8(f.content);
        await fs.writeFile(targetFilePath, fileBytes);
      } else {
        await fs.writeFile(targetFilePath, f.content);
      }
    }

    // Re-indexar los documentos en memoria
    const docs = await getDocumentsByBranch(targetBranch.id);

    return {
      branch: targetBranch,
      documentCount: docs.length
    };
  }

  async function exportBranchToJson(branchId) {
    const branch = await getBranchById(branchId);
    if (!branch) throw new NotFoundError(`No existe la rama [${branchId}].`);
    const docs = await getDocumentsByBranch(branchId);

    return {
      schema: "ChatCLI_RAG_Branch_v1",
      version: 1,
      exportedAt: Date.now(),
      branch: {
        id: branch.id,
        name: branch.name,
        description: branch.description,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt
      },
      documents: docs.map(d => ({
        id: d.id,
        title: d.title,
        fileType: d.fileType,
        fileSize: d.fileSize,
        globalSummary: d.globalSummary,
        chapters: (d.chapters || []).map(ch => ({
          chapterId: ch.chapterId,
          title: ch.title,
          summary: ch.summary,
          content: ch.content
        }))
      }))
    };
  }

  async function importBranchFromJson(branchData, options = {}) {
    let payload = branchData;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        throw new ValidationError("El archivo importado no contiene un formato JSON válido.");
      }
    }

    if (!payload || !payload.branch || !payload.branch.name) {
      throw new ValidationError('Estructura de rama inválida: falta el objeto "branch" o "branch.name".');
    }

    const branchName = String(payload.branch.name).trim();
    const branchDesc = String(payload.branch.description || "").trim();
    const rawDocs = Array.isArray(payload.documents) ? payload.documents : [];

    const existingBranch = payload.branch.id ? await getBranchById(payload.branch.id).catch(() => null) : null;
    const shouldCreateNew = options.createNewId || Boolean(existingBranch);

    let targetBranch;
    if (shouldCreateNew) {
      const importedName = existingBranch ? `${branchName} (Copia)` : branchName;
      targetBranch = await createBranch(importedName, branchDesc);
    } else {
      targetBranch = await createBranch(branchName, branchDesc);
    }

    let savedDocCount = 0;
    for (const rawDoc of rawDocs) {
      if (!rawDoc.title) continue;
      const docToSave = {
        id: generateId("doc"),
        branchId: targetBranch.id,
        title: String(rawDoc.title).trim(),
        fileType: rawDoc.fileType || "txt",
        fileSize: Number(rawDoc.fileSize) || 0,
        globalSummary: String(rawDoc.globalSummary || ""),
        chapters: Array.isArray(rawDoc.chapters) ? rawDoc.chapters.map((ch, idx) => ({
          chapterId: typeof ch.chapterId === "number" ? ch.chapterId : (idx + 1),
          title: String(ch.title || `Capítulo ${idx + 1}`),
          summary: String(ch.summary || ""),
          content: String(ch.content || "")
        })) : []
      };

      await saveDocument(docToSave);
      savedDocCount++;
    }

    return {
      branch: targetBranch,
      documentCount: savedDocCount
    };
  }

  async function getStorageEstimate() {
    const fs = getFS();
    if (!fs) return { usage: 0, quota: 0, usageFormatted: "0 B", quotaFormatted: "10 GB", percentUsed: 0, isPersisted: true };

    const branches = await getBranches();
    let totalDocs = 0;
    let totalSize = 0;

    for (const b of branches) {
      const docs = await getDocumentsByBranch(b.id);
      totalDocs += docs.length;
      for (const d of docs) {
        totalSize += d.fileSize || 0;
      }
    }

    const quota = 10 * 1024 * 1024 * 1024;
    return {
      usage: totalSize,
      quota: quota,
      usagePercent: `${((totalSize / quota) * 100).toFixed(2)}%`,
      usageFormatted: formatBytes(totalSize),
      quotaFormatted: formatBytes(quota),
      percentUsed: Number(((totalSize / quota) * 100).toFixed(2)),
      isPersisted: true,
      totalBranches: branches.length,
      totalDocuments: totalDocs
    };
  }

  async function clearAllData() {
    const fs = getFS();
    if (fs) {
      try {
        await fs.deleteDirectory(RAG_ROOT, { recursive: true });
      } catch (_) {}
    }
    docLocationIndex.clear();
    ragImageCache.clear();
    return true;
  }

  async function openDatabase() {
    return true;
  }

  async function closeDB() {
    return true;
  }

  async function requestPersistentStorage() {
    return true;
  }

  // ==========================================================================
  // Exportación Pública
  // ==========================================================================

  return {
    RAG_ROOT,
    MAX_FILES_PER_BUCKET,
    RAMA_FILE,
    DB_NAME,
    DB_VERSION,
    STORE_BRANCHES,
    STORE_DOCUMENTS,

    // Errores
    RagStorageError,
    ValidationError,
    QuotaExceededError,
    NotFoundError,

    // Conexión y utilidades
    openDatabase,
    requestPersistentStorage,
    getStorageEstimate,
    clearAllData,
    closeDB,

    // Ramas
    createBranch,
    updateBranch,
    getBranches,
    getBranchById,
    deleteBranch,
    exportBranch,
    importBranch,
    exportBranchToJson,
    importBranchFromJson,

    // Documentos y Capítulos
    saveDocument,
    getDocumentById,
    getDocumentsByBranch,
    getDocumentHeadersByBranch,
    getChapterContent,
    deleteDocument,

    // Caché y Resolución de Imágenes
    registerImage,
    resolveImageSrc,
    ragImageCache
  };
});
