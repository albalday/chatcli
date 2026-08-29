/**
 * Módulo de Almacenamiento Local Persistente para RAG Jerárquico (ChatRagStorage).
 *
 * Características:
 * - Base de datos IndexedDB dedicada: 'LocalRAG_DB' (v1).
 * - Solicitud de persistencia automática mediante navigator.storage.persist().
 * - Stores:
 *    * 'branches': Ramas temáticas/proyectos con metadatos.
 *    * 'documents': Documentos con capítulos estructurados e índice 'by_branch'.
 * - Operaciones transaccionales seguras y eliminación en cascada.
 * - Proyección ligera de cabeceras (getDocumentHeadersByBranch) para evitar saturar RAM.
 * - Manejo robusto de QuotaExceededError, validación de esquemas y fallback transparente.
 *
 * Compatible con Browser (file://, http://) y Node.js.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatRagStorage = factory();
    root.RagStorage = root.ChatRagStorage; // Alias corto
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'LocalRAG_DB';
  const DB_VERSION = 1;

  const STORE_BRANCHES = 'branches';
  const STORE_DOCUMENTS = 'documents';

  const INDEX_BY_BRANCH = 'by_branch';
  const INDEX_BY_CREATED = 'by_createdAt';

  // ==========================================================================
  // Clases de Error Personalizadas
  // ==========================================================================

  class RagStorageError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = 'RagStorageError';
      this.details = details;
    }
  }

  class ValidationError extends RagStorageError {
    constructor(message, details = {}) {
      super(message, details);
      this.name = 'ValidationError';
    }
  }

  class QuotaExceededError extends RagStorageError {
    constructor(message = 'Se ha superado el límite de almacenamiento disponible en el navegador (QuotaExceededError).', details = {}) {
      super(message, details);
      this.name = 'QuotaExceededError';
    }
  }

  class NotFoundError extends RagStorageError {
    constructor(message, details = {}) {
      super(message, details);
      this.name = 'NotFoundError';
    }
  }

  // ==========================================================================
  // Almacén en Memoria para Entornos sin IndexedDB (Fallback / Tests)
  // ==========================================================================

  const memoryBranches = new Map();
  const memoryDocuments = new Map();

  function isIndexedDBAvailable() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch (e) {
      return false;
    }
  }

  // ==========================================================================
  // Solicitud de Almacenamiento Persistente en el Navegador
  // ==========================================================================

  let persistenceRequested = false;

  async function requestPersistentStorage() {
    if (persistenceRequested) return;
    persistenceRequested = true;

    try {
      if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
        const isPersisted = await navigator.storage.persist();
        if (isPersisted) {
          console.info(`[${DB_NAME}] Almacenamiento persistente concedido por el navegador.`);
        } else {
          console.info(`[${DB_NAME}] El navegador usa almacenamiento estándar (best-effort).`);
        }
      }
    } catch (err) {
      console.warn(`[${DB_NAME}] No se pudo solicitar almacenamiento persistente:`, err);
    }
  }

  // ==========================================================================
  // Generador de Identificadores Únicos
  // ==========================================================================

  function generateId(prefix = 'id') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    const rand = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${Date.now()}_${rand}`;
  }

  // ==========================================================================
  // Validadores de Esquema
  // ==========================================================================

  function validateBranch(data) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Los datos de la rama deben ser un objeto válido.');
    }
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new ValidationError('El nombre de la rama es obligatorio y no puede estar vacío.');
    }
    return {
      id: data.id ? String(data.id).trim() : generateId('branch'),
      name: String(data.name).trim(),
      description: data.description ? String(data.description).trim() : '',
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
    };
  }

  function validateChapter(chap, idx) {
    if (!chap || typeof chap !== 'object') {
      throw new ValidationError(`El capítulo en la posición ${idx} debe ser un objeto válido.`);
    }
    const content = typeof chap.content === 'string' ? chap.content : '';
    return {
      chapterId: typeof chap.chapterId === 'number' ? chap.chapterId : (idx + 1),
      title: chap.title ? String(chap.title).trim() : `Capítulo ${idx + 1}`,
      summary: chap.summary ? String(chap.summary).trim() : '',
      content: content,
      charCount: typeof chap.charCount === 'number' ? chap.charCount : content.length
    };
  }

  function validateDocument(data) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Los datos del documento deben ser un objeto válido.');
    }
    if (!data.branchId || typeof data.branchId !== 'string' || data.branchId.trim().length === 0) {
      throw new ValidationError('El documento debe estar asociado a un branchId válido.');
    }
    if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
      throw new ValidationError('El título del documento es obligatorio.');
    }

    const fileType = String(data.fileType || 'txt').toLowerCase().trim();
    if (!['pdf', 'txt', 'md'].includes(fileType)) {
      throw new ValidationError(`Tipo de archivo '${fileType}' no soportado. Debe ser 'pdf', 'txt' o 'md'.`);
    }

    const chapters = Array.isArray(data.chapters)
      ? data.chapters.map((chap, idx) => validateChapter(chap, idx))
      : [];

    return {
      id: data.id ? String(data.id).trim() : generateId('doc'),
      branchId: String(data.branchId).trim(),
      title: String(data.title).trim(),
      fileType: fileType,
      fileSize: typeof data.fileSize === 'number' ? data.fileSize : 0,
      globalSummary: data.globalSummary ? String(data.globalSummary).trim() : '',
      chapters: chapters,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now()
    };
  }

  function isQuotaError(err) {
    if (!err) return false;
    const name = err.name || '';
    const code = err.code || 0;
    return (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      code === 22 ||
      code === 1014 ||
      (err.message && err.message.toLowerCase().includes('quota'))
    );
  }

  // ==========================================================================
  // Conexión y Gestión de IndexedDB (Promise Wrapper estilo 'idb')
  // ==========================================================================

  let dbPromise = null;

  async function openDatabase() {
    if (!isIndexedDBAvailable()) {
      return null;
    }

    if (dbPromise) {
      return dbPromise;
    }

    await requestPersistentStorage();

    dbPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
          const db = event.target.result;
          console.info(`[${DB_NAME}] Creando/Actualizando esquema v${DB_VERSION}...`);

          // 1. Store 'branches'
          if (!db.objectStoreNames.contains(STORE_BRANCHES)) {
            const branchStore = db.createObjectStore(STORE_BRANCHES, { keyPath: 'id' });
            branchStore.createIndex(INDEX_BY_CREATED, 'createdAt', { unique: false });
          }

          // 2. Store 'documents'
          if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
            const docStore = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
            docStore.createIndex(INDEX_BY_BRANCH, 'branchId', { unique: false });
            docStore.createIndex(INDEX_BY_CREATED, 'createdAt', { unique: false });
          }
        };

        request.onsuccess = function (event) {
          const db = event.target.result;

          db.onversionchange = function () {
            db.close();
            dbPromise = null;
            console.warn(`[${DB_NAME}] Base de datos cerrada por cambio de versión en otra pestaña.`);
          };

          resolve(db);
        };

        request.onerror = function (event) {
          console.warn(`[${DB_NAME}] Error al abrir IndexedDB:`, event.target.error);
          resolve(null); // Fallback a memoria
        };

        request.onblocked = function () {
          console.warn(`[${DB_NAME}] Apertura de IndexedDB bloqueada por otra conexión activa.`);
        };
      } catch (err) {
        console.warn(`[${DB_NAME}] Excepción al inicializar IndexedDB:`, err);
        resolve(null);
      }
    });

    return dbPromise;
  }

  // ==========================================================================
  // Métodos CRUD: Ramas (Branches)
  // ==========================================================================

  /**
   * Crea una nueva rama temática en la base de datos.
   * @param {string} name - Nombre identificativo de la rama.
   * @param {string} [description=''] - Descripción o alcance opcional.
   * @returns {Promise<{ id: string, name: string, description: string, createdAt: number, updatedAt: number }>}
   */
  async function createBranch(name, description = '') {
    const branch = validateBranch({ name, description });
    const db = await openDatabase();

    if (!db) {
      memoryBranches.set(branch.id, { ...branch });
      console.info(`[${DB_NAME}] Rama creada (en memoria): "${branch.name}" [${branch.id}]`);
      return { ...branch };
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_BRANCHES], 'readwrite');
        const store = tx.objectStore(STORE_BRANCHES);
        const req = store.add(branch);

        req.onsuccess = () => {
          console.info(`[${DB_NAME}] Rama creada: "${branch.name}" [${branch.id}]`);
          resolve({ ...branch });
        };

        req.onerror = (e) => {
          if (isQuotaError(e.target.error)) {
            reject(new QuotaExceededError(undefined, { error: e.target.error }));
          } else {
            reject(new RagStorageError(`Error al crear la rama: ${e.target.error?.message || e.target.error}`, { error: e.target.error }));
          }
        };
      } catch (err) {
        if (isQuotaError(err)) {
          reject(new QuotaExceededError(undefined, { error: err }));
        } else {
          reject(new RagStorageError(`Excepción al crear la rama: ${err.message}`, { error: err }));
        }
      }
    });
  }

  /**
   * Obtiene la lista de todas las ramas ordenadas por fecha de creación descendente.
   * @returns {Promise<Array<{ id: string, name: string, description: string, createdAt: number, updatedAt: number }>>}
   */
  async function getBranches() {
    const db = await openDatabase();

    if (!db) {
      return Array.from(memoryBranches.values())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map(b => ({ ...b }));
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_BRANCHES], 'readonly');
        const store = tx.objectStore(STORE_BRANCHES);
        const req = store.getAll();

        req.onsuccess = () => {
          const list = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(list);
        };

        req.onerror = (e) => {
          reject(new RagStorageError(`Error al obtener ramas: ${e.target.error?.message || e.target.error}`));
        };
      } catch (err) {
        reject(new RagStorageError(`Excepción al obtener ramas: ${err.message}`));
      }
    });
  }

  /**
   * Recupera una rama específica por su ID.
   * @param {string} branchId - Identificador de la rama.
   * @returns {Promise<{ id: string, name: string, description: string, createdAt: number, updatedAt: number } | null>}
   */
  async function getBranchById(branchId) {
    if (!branchId) return null;
    const cleanId = String(branchId).trim();
    const db = await openDatabase();

    if (!db) {
      const b = memoryBranches.get(cleanId);
      return b ? { ...b } : null;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_BRANCHES], 'readonly');
        const store = tx.objectStore(STORE_BRANCHES);
        const req = store.get(cleanId);

        req.onsuccess = () => {
          resolve(req.result || null);
        };

        req.onerror = (e) => {
          reject(new RagStorageError(`Error al recuperar rama [${cleanId}]: ${e.target.error?.message || e.target.error}`));
        };
      } catch (err) {
        reject(new RagStorageError(`Excepción al recuperar rama [${cleanId}]: ${err.message}`));
      }
    });
  }

  /**
   * Elimina una rama y todos los documentos asociados en cascada en una única transacción segura.
   * @param {string} branchId - Identificador de la rama a eliminar.
   * @returns {Promise<{ success: boolean, deletedBranchId: string, deletedDocumentsCount: number }>}
   */
  async function deleteBranch(branchId) {
    if (!branchId) throw new ValidationError('branchId es requerido para eliminar una rama.');
    const cleanId = String(branchId).trim();
    const db = await openDatabase();

    if (!db) {
      let docCount = 0;
      for (const [dId, doc] of memoryDocuments.entries()) {
        if (doc.branchId === cleanId) {
          memoryDocuments.delete(dId);
          docCount++;
        }
      }
      memoryBranches.delete(cleanId);
      console.info(`[${DB_NAME}] Rama [${cleanId}] y ${docCount} documentos eliminados en cascada (en memoria).`);
      return { success: true, deletedBranchId: cleanId, deletedDocumentsCount: docCount };
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_BRANCHES, STORE_DOCUMENTS], 'readwrite');
        const branchStore = tx.objectStore(STORE_BRANCHES);
        const docStore = tx.objectStore(STORE_DOCUMENTS);
        const docIndex = docStore.index(INDEX_BY_BRANCH);

        let docCount = 0;

        // 1. Obtener todas las claves de documentos pertenecientes a esta rama
        const getDocsReq = docIndex.getAllKeys(cleanId);

        getDocsReq.onsuccess = () => {
          const docKeys = getDocsReq.result || [];
          docCount = docKeys.length;

          // 2. Eliminar cada documento
          for (const key of docKeys) {
            docStore.delete(key);
          }

          // 3. Eliminar la rama
          branchStore.delete(cleanId);
        };

        tx.oncomplete = () => {
          console.info(`[${DB_NAME}] Rama [${cleanId}] y ${docCount} documentos asociados eliminados en cascada.`);
          resolve({ success: true, deletedBranchId: cleanId, deletedDocumentsCount: docCount });
        };

        tx.onerror = (e) => {
          reject(new RagStorageError(`Error en transacción al eliminar rama [${cleanId}]: ${e.target.error?.message || e.target.error}`));
        };
      } catch (err) {
        reject(new RagStorageError(`Excepción al eliminar rama [${cleanId}]: ${err.message}`));
      }
    });
  }

  // ==========================================================================
  // Métodos CRUD: Documentos (Documents)
  // ==========================================================================

  /**
   * Guarda o actualiza un documento con sus capítulos estructurados.
   * @param {Object} documentData - Datos completos del documento.
   * @returns {Promise<Object>} - El documento persistido.
   */
  async function saveDocument(documentData) {
    const doc = validateDocument(documentData);
    const db = await openDatabase();

    if (!db) {
      // Verificar existencia de la rama en fallback
      if (!memoryBranches.has(doc.branchId)) {
        throw new NotFoundError(`La rama [${doc.branchId}] no existe.`);
      }
      // Actualizar updatedAt de la rama
      const branch = memoryBranches.get(doc.branchId);
      branch.updatedAt = Date.now();

      memoryDocuments.set(doc.id, { ...doc });
      console.info(`[${DB_NAME}] Documento guardado (en memoria): "${doc.title}" [${doc.id}] (${doc.chapters.length} capítulos)`);
      return { ...doc };
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_BRANCHES, STORE_DOCUMENTS], 'readwrite');
        const branchStore = tx.objectStore(STORE_BRANCHES);
        const docStore = tx.objectStore(STORE_DOCUMENTS);

        // 1. Validar que la rama existe y actualizar updatedAt
        const checkBranchReq = branchStore.get(doc.branchId);

        checkBranchReq.onsuccess = () => {
          const branch = checkBranchReq.result;
          if (!branch) {
            tx.abort();
            return reject(new NotFoundError(`No se puede guardar el documento: La rama asociada [${doc.branchId}] no existe.`));
          }

          branch.updatedAt = Date.now();
          branchStore.put(branch);

          // 2. Guardar documento
          const putDocReq = docStore.put(doc);
          putDocReq.onerror = (e) => {
            if (isQuotaError(e.target.error)) {
              reject(new QuotaExceededError(undefined, { error: e.target.error }));
            }
          };
        };

        tx.oncomplete = () => {
          console.info(`[${DB_NAME}] Documento guardado: "${doc.title}" [${doc.id}] (${doc.chapters.length} capítulos)`);
          resolve({ ...doc });
        };

        tx.onerror = (e) => {
          if (isQuotaError(e.target.error)) {
            reject(new QuotaExceededError(undefined, { error: e.target.error }));
          } else {
            reject(new RagStorageError(`Error al guardar documento [${doc.id}]: ${e.target.error?.message || e.target.error}`));
          }
        };
      } catch (err) {
        if (isQuotaError(err)) {
          reject(new QuotaExceededError(undefined, { error: err }));
        } else {
          reject(new RagStorageError(`Excepción al guardar documento [${doc.id}]: ${err.message}`));
        }
      }
    });
  }

  /**
   * Obtiene todos los documentos completos de una rama.
   * @param {string} branchId - Identificador de la rama.
   * @returns {Promise<Array<Object>>}
   */
  async function getDocumentsByBranch(branchId) {
    if (!branchId) return [];
    const cleanId = String(branchId).trim();
    const db = await openDatabase();

    if (!db) {
      const results = [];
      for (const doc of memoryDocuments.values()) {
        if (doc.branchId === cleanId) {
          results.push({ ...doc });
        }
      }
      return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DOCUMENTS], 'readonly');
        const store = tx.objectStore(STORE_DOCUMENTS);
        const index = store.index(INDEX_BY_BRANCH);
        const req = index.getAll(cleanId);

        req.onsuccess = () => {
          const list = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(list);
        };

        req.onerror = (e) => {
          reject(new RagStorageError(`Error al obtener documentos de rama [${cleanId}]: ${e.target.error?.message || e.target.error}`));
        };
      } catch (err) {
        reject(new RagStorageError(`Excepción al obtener documentos de rama [${cleanId}]: ${err.message}`));
      }
    });
  }

  /**
   * Obtiene los documentos de una rama EXCLUYENDO el campo 'content' de cada capítulo
   * para optimizar drásticamente el consumo de memoria y la velocidad de renderizado en UI.
   * @param {string} branchId - Identificador de la rama.
   * @returns {Promise<Array<Object>>}
   */
  async function getDocumentHeadersByBranch(branchId) {
    if (!branchId) return [];
    const cleanId = String(branchId).trim();
    const db = await openDatabase();

    function projectDocHeader(doc) {
      return {
        id: doc.id,
        branchId: doc.branchId,
        title: doc.title,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        globalSummary: doc.globalSummary,
        createdAt: doc.createdAt,
        chapters: (doc.chapters || []).map(ch => ({
          chapterId: ch.chapterId,
          title: ch.title,
          summary: ch.summary,
          charCount: ch.charCount
        }))
      };
    }

    if (!db) {
      const results = [];
      for (const doc of memoryDocuments.values()) {
        if (doc.branchId === cleanId) {
          results.push(projectDocHeader(doc));
        }
      }
      return results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DOCUMENTS], 'readonly');
        const store = tx.objectStore(STORE_DOCUMENTS);
        const index = store.index(INDEX_BY_BRANCH);
        const results = [];

        // Usamos cursor para proyectar los datos de forma eficiente
        const req = index.openCursor(IDBKeyRange.only(cleanId));

        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            results.push(projectDocHeader(cursor.value));
            cursor.continue();
          } else {
            results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            resolve(results);
          }
        };

        req.onerror = (e) => {
          reject(new RagStorageError(`Error al consultar cabeceras de documentos [${cleanId}]: ${e.target.error?.message || e.target.error}`));
        };
      } catch (err) {
        reject(new RagStorageError(`Excepción al consultar cabeceras de documentos [${cleanId}]: ${err.message}`));
      }
    });
  }

  /**
   * Recupera directamente la propiedad 'content' de un capítulo específico.
   * Utilizado por la tool 'read_chapter_content' para inyectar solo el texto demandado.
   * @param {string} docId - Identificador del documento.
   * @param {number|string} chapterId - Identificador numérico o ID del capítulo.
   * @returns {Promise<string|null>} - El texto íntegro del capítulo o null si no se encuentra.
   */
  async function getChapterContent(docId, chapterId) {
    if (!docId) return null;
    const cleanDocId = String(docId).trim();
    const targetChapId = parseInt(chapterId, 10);
    const db = await openDatabase();

    let doc = null;

    if (!db) {
      doc = memoryDocuments.get(cleanDocId);
    } else {
      doc = await new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([STORE_DOCUMENTS], 'readonly');
          const store = tx.objectStore(STORE_DOCUMENTS);
          const req = store.get(cleanDocId);

          req.onsuccess = () => resolve(req.result || null);
          req.onerror = (e) => reject(new RagStorageError(`Error al leer documento [${cleanDocId}]: ${e.target.error?.message || e.target.error}`));
        } catch (err) {
          reject(new RagStorageError(`Excepción al leer documento [${cleanDocId}]: ${err.message}`));
        }
      });
    }

    if (!doc || !Array.isArray(doc.chapters)) return null;

    // Buscar por coincidencia exacta de chapterId o por índice
    const chapter = doc.chapters.find(ch => ch.chapterId === targetChapId || String(ch.chapterId) === String(chapterId));
    if (chapter && typeof chapter.content === 'string') {
      return chapter.content;
    }

    return null;
  }

  /**
   * Recupera un documento completo por su ID.
   * @param {string} docId - Identificador del documento.
   * @returns {Promise<Object|null>}
   */
  async function getDocumentById(docId) {
    if (!docId) return null;
    const cleanDocId = String(docId).trim();
    const db = await openDatabase();

    if (!db) {
      const doc = memoryDocuments.get(cleanDocId);
      return doc ? { ...doc } : null;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DOCUMENTS], 'readonly');
        const store = tx.objectStore(STORE_DOCUMENTS);
        const req = store.get(cleanDocId);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(new RagStorageError(`Error al leer documento [${cleanDocId}]: ${e.target.error?.message || e.target.error}`));
      } catch (err) {
        reject(new RagStorageError(`Excepción al leer documento [${cleanDocId}]: ${err.message}`));
      }
    });
  }

  /**
   * Elimina un documento específico por su ID.
   * @param {string} docId - Identificador del documento a eliminar.
   * @returns {Promise<boolean>}
   */
  async function deleteDocument(docId) {
    if (!docId) throw new ValidationError('docId es requerido para eliminar un documento.');
    const cleanDocId = String(docId).trim();
    const db = await openDatabase();

    if (!db) {
      const existed = memoryDocuments.delete(cleanDocId);
      console.info(`[${DB_NAME}] Documento [${cleanDocId}] eliminado (en memoria).`);
      return existed;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DOCUMENTS], 'readwrite');
        const store = tx.objectStore(STORE_DOCUMENTS);
        const req = store.delete(cleanDocId);

        req.onsuccess = () => {
          console.info(`[${DB_NAME}] Documento [${cleanDocId}] eliminado con éxito.`);
          resolve(true);
        };

        req.onerror = (e) => {
          reject(new RagStorageError(`Error al eliminar documento [${cleanDocId}]: ${e.target.error?.message || e.target.error}`));
        };
      } catch (err) {
        reject(new RagStorageError(`Excepción al eliminar documento [${cleanDocId}]: ${err.message}`));
      }
    });
  }

  /**
   * Limpia toda la base de datos RAG (útil para reinicios y pruebas).
   */
  async function clearAllData() {
    memoryBranches.clear();
    memoryDocuments.clear();

    const db = await openDatabase();
    if (!db) return true;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_BRANCHES, STORE_DOCUMENTS], 'readwrite');
        tx.objectStore(STORE_BRANCHES).clear();
        tx.objectStore(STORE_DOCUMENTS).clear();

        tx.oncomplete = () => {
          console.info(`[${DB_NAME}] Todos los datos de ramas y documentos han sido limpiados.`);
          resolve(true);
        };

        tx.onerror = (e) => reject(new RagStorageError(`Error al vaciar base de datos: ${e.target.error?.message || e.target.error}`));
      } catch (err) {
        reject(new RagStorageError(`Excepción al vaciar base de datos: ${err.message}`));
      }
    });
  }

  /**
   * Cierra la conexión a la base de datos.
   */
  async function closeDB() {
    if (dbPromise) {
      const db = await dbPromise;
      if (db) db.close();
      dbPromise = null;
    }
  }

  // ==========================================================================
  // Exportación Pública
  // ==========================================================================

  return {
    DB_NAME,
    DB_VERSION,
    STORE_BRANCHES,
    STORE_DOCUMENTS,

    // Errores
    RagStorageError,
    ValidationError,
    QuotaExceededError,
    NotFoundError,

    // Métodos de Conexión
    openDatabase,
    requestPersistentStorage,
    clearAllData,
    closeDB,

    // Ramas
    createBranch,
    getBranches,
    getBranchById,
    deleteBranch,

    // Documentos y Capítulos
    saveDocument,
    getDocumentById,
    getDocumentsByBranch,
    getDocumentHeadersByBranch,
    getChapterContent,
    deleteDocument
  };
});
