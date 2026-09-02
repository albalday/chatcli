/** In-memory Orama indexes derived from chunks stored in IndexedDB. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('@orama/orama'), require('./ragStorage.js'));
  } else {
    root.ChatRagIndex = factory(root.ZeroChatOrama, root.ChatRagStorage);
  }
})(typeof self !== 'undefined' ? self : this, function (Orama, RagStorage) {
  'use strict';

  const indexes = new Map();
  const builds = new Map();
  const revisions = new Map();

  function assertDependencies() {
    if (!Orama?.create || !Orama?.insertMultiple || !Orama?.search) {
      throw new Error('El motor de búsqueda Orama no está disponible.');
    }
    if (!RagStorage?.getChunksByBranch) {
      throw new Error('El almacenamiento RAG no está disponible.');
    }
  }

  async function buildBranchIndex(branchId) {
    if (!branchId) throw new Error('Se requiere una rama para construir el índice.');
    assertDependencies();
    if (indexes.has(branchId)) return indexes.get(branchId);
    if (builds.has(branchId)) return builds.get(branchId);

    const revision = revisions.get(branchId) || 0;
    const pending = (async () => {
      const branch = await RagStorage.getBranchById(branchId);
      if (!branch) throw new Error(`No existe la rama ${branchId}.`);
      const [chunks, documents] = await Promise.all([
        RagStorage.getChunksByBranch(branchId),
        RagStorage.getDocumentsByBranch(branchId)
      ]);
      const documentsById = new Map(documents.map(document => [document.id, document]));
      const db = await Orama.create({
        schema: {
          id: 'string',
          branchId: 'string',
          documentId: 'string',
          chunkId: 'string',
          rawTitle: 'string',
          documentTitle: 'string',
          sectionTitle: 'string',
          content: 'string',
          fileType: 'string',
          order: 'number'
        },
        components: { tokenizer: { language: branch.language || 'spanish', stemming: false } }
      });
      if (chunks.length > 0) {
        const records = chunks.map(chunk => {
          const document = documentsById.get(chunk.documentId) || {};
          const rawDocTitle = document.title || '';
          const unsluggedDocTitle = rawDocTitle.replace(/[_\-]+/g, ' ');
          const searchableDocTitle = unsluggedDocTitle !== rawDocTitle
            ? `${rawDocTitle} ${unsluggedDocTitle}`
            : rawDocTitle;
          return {
            id: chunk.id,
            branchId,
            documentId: chunk.documentId,
            chunkId: chunk.id,
            rawTitle: rawDocTitle,
            documentTitle: searchableDocTitle,
            sectionTitle: chunk.title || '',
            content: chunk.content || '',
            fileType: document.fileType || '',
            order: chunk.order || 0
          };
        });
        await Orama.insertMultiple(db, records, 250);
      }
      if ((revisions.get(branchId) || 0) === revision) indexes.set(branchId, db);
      return db;
    })();

    builds.set(branchId, pending);
    try {
      return await pending;
    } finally {
      if (builds.get(branchId) === pending) builds.delete(branchId);
    }
  }

  function prepareSearchQuery(rawQuery) {
    if (!rawQuery) return { cleanedTerm: '', tolerance: 0 };
    // 1. Eliminar extensiones de archivo que solo añaden ruido (.pdf, .txt, etc.)
    let cleaned = String(rawQuery).replace(/\.(?:pdf|txt|md|csv|json)\b/gi, ' ');
    // 2. Eliminar operadores booleanos aislados en mayúsculas
    cleaned = cleaned.replace(/\b(?:OR|AND|NOT)\b/g, ' ');
    // 3. Normalizar guiones y barras bajas a espacios para que "3M_2018_10K" se busque como términos individuales
    cleaned = cleaned.replace(/[_\-]+/g, ' ');
    // 4. Limpiar comillas, corchetes y caracteres conflictivos para el tokenizador
    cleaned = cleaned.replace(/["'()[\]{}#*:;]/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 5. Tolerancia inteligente:
    // Si contiene tokens cortos (<= 3 caracteres como "3M", "AMD", "Q1", "SEC"), usar tolerance 0
    // para evitar falsos positivos por distancia Levenshtein (ej. "3M" <-> "TM" o "PM")
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const hasShortToken = tokens.some(t => t.length > 0 && t.length <= 3);
    const tolerance = hasShortToken ? 0 : 1;

    return { cleanedTerm: cleaned || String(rawQuery).trim(), tolerance };
  }

  async function searchBranch(branchId, term, options = {}) {
    const rawQuery = String(term || '').trim();
    if (!rawQuery) return { count: 0, elapsed: null, hits: [] };
    const { cleanedTerm, tolerance: autoTolerance } = prepareSearchQuery(rawQuery);
    if (!cleanedTerm) return { count: 0, elapsed: null, hits: [] };

    const db = await buildBranchIndex(branchId);
    const tolerance = Number.isInteger(options.tolerance) ? options.tolerance : autoTolerance;
    const limit = Number(options.limit) > 0 ? Number(options.limit) : 10;

    const result = await Orama.search(db, {
      term: cleanedTerm,
      properties: ['documentTitle', 'sectionTitle', 'content'],
      boost: {
        documentTitle: 5,
        sectionTitle: 2,
        content: 1
      },
      limit,
      tolerance
    });
    return {
      count: result.count || 0,
      elapsed: result.elapsed || null,
      hits: (result.hits || []).map(hit => ({
        id: hit.id,
        score: hit.score,
        documentId: hit.document.documentId,
        chunkId: hit.document.chunkId,
        documentTitle: hit.document.rawTitle || hit.document.documentTitle,
        sectionTitle: hit.document.sectionTitle,
        content: hit.document.content,
        order: hit.document.order
      }))
    };
  }

  async function searchBranches(branchIds, term, options = {}) {
    const list = Array.isArray(branchIds) ? branchIds : (branchIds ? [branchIds] : []);
    const cleanIds = Array.from(new Set(list.map(id => String(id || '').trim()).filter(Boolean)));
    if (cleanIds.length === 0) return { count: 0, elapsed: null, hits: [] };
    if (cleanIds.length === 1) return searchBranch(cleanIds[0], term, options);

    const limit = Number(options.limit) > 0 ? Number(options.limit) : 10;
    const branchResults = await Promise.all(
      cleanIds.map(async (id) => {
        try {
          const res = await searchBranch(id, term, { ...options, limit });
          return (res.hits || []).map(hit => ({ ...hit, branchId: id }));
        } catch (_) {
          return [];
        }
      })
    );

    const allHits = branchResults.flat();
    allHits.sort((a, b) => (b.score || 0) - (a.score || 0));
    const topHits = allHits.slice(0, limit);

    return {
      count: allHits.length,
      elapsed: null,
      hits: topHits
    };
  }

  function invalidateBranch(branchId) {
    indexes.delete(branchId);
    builds.delete(branchId);
    revisions.set(branchId, (revisions.get(branchId) || 0) + 1);
  }

  function clearCache() {
    indexes.clear();
    builds.clear();
    revisions.clear();
  }

  return { buildBranchIndex, searchBranch, searchBranches, invalidateBranch, clearCache };
});
