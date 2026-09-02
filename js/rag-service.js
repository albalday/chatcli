/** Connects the agent tools with IndexedDB storage and the Orama index. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./ragStorage.js'), require('./rag-index.js'));
  } else {
    root.ChatRagService = factory(root.ChatRagStorage, root.ChatRagIndex);
  }
})(typeof self !== 'undefined' ? self : this, function (RagStorage, RagIndex) {
  'use strict';

  function parseArguments(rawArgs) {
    if (!rawArgs) return {};
    if (typeof rawArgs === 'object') return rawArgs;
    try { return JSON.parse(String(rawArgs)); } catch (_) { return { query: String(rawArgs) }; }
  }

  function normalizeBranchIds(input) {
    if (!input) return [];
    const list = Array.isArray(input) ? input : String(input).split(',');
    return Array.from(new Set(list.map(id => String(id || '').trim()).filter(Boolean)));
  }

  async function resolveBranches(branchIdsInput) {
    const ids = normalizeBranchIds(branchIdsInput);
    if (ids.length === 0) throw new Error('No hay ninguna rama de conocimiento activa.');
    const branches = (await Promise.all(ids.map(id => RagStorage.getBranchById(id)))).filter(Boolean);
    if (branches.length === 0) throw new Error(`No se encontró ninguna de las ramas especificadas: ${ids.join(', ')}.`);
    return branches;
  }

  async function buildRagSystemContext(branchIds) {
    if (!branchIds) return '';
    try {
      const branches = await resolveBranches(branchIds);
      const names = branches.map(b => b.name).join(', ');
      const label = branches.length === 1 ? `[BASE DE CONOCIMIENTO ACTIVA: ${names}]` : `[BASES DE CONOCIMIENTO ACTIVAS: ${names}]`;
      return `${label}\nBusca primero con search_knowledge_base y usa read_knowledge_chunk cuando necesites el texto completo de un resultado.\nPuedes incluir las referencias a imágenes incrustadas que aparezcan en los fragmentos consultados (![...](rag-image://...)) para mostrarlas al usuario.`;
    } catch (_) {
      return '';
    }
  }

  async function injectRagContext(systemPrompt, branchIds) {
    const context = await buildRagSystemContext(branchIds);
    return [context, String(systemPrompt || '').trim()].filter(Boolean).join('\n\n');
  }

  async function listDocuments(branchIds) {
    try {
      const branches = await resolveBranches(branchIds);
      const allDocs = [];
      const sections = [];
      for (const branch of branches) {
        const documents = await RagStorage.getDocumentsByBranch(branch.id);
        allDocs.push(...documents);
        const lines = [`[DOCUMENTOS EN ${branch.name}]`];
        for (const document of documents) {
          lines.push(`- ${document.title} (documentId: ${document.id}, ${document.chunkCount} fragmentos, ${document.fileType})`);
        }
        if (!documents.length) lines.push('La rama no contiene documentos.');
        sections.push(lines.join('\n'));
      }
      return {
        success: true,
        branchId: branches[0]?.id || '',
        branchName: branches.map(b => b.name).join(', '),
        branchIds: branches.map(b => b.id),
        count: allDocs.length,
        documents: allDocs,
        text: sections.join('\n\n')
      };
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  }

  function makeSnippet(content, query, maxLength = 700) {
    const text = String(content || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    const term = String(query || '').split(/\s+/).find(word => word.length > 3) || '';
    const found = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
    const start = found > 0 ? Math.max(0, found - Math.floor(maxLength * 0.3)) : 0;
    return `${start > 0 ? '…' : ''}${text.slice(start, start + maxLength)}${start + maxLength < text.length ? '…' : ''}`;
  }

  async function searchKnowledgeBase(branchIds, rawArgs) {
    const args = parseArguments(rawArgs);
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: 'La consulta de búsqueda está vacía.' };
    try {
      const branches = await resolveBranches(branchIds);
      const branchNamesById = new Map(branches.map(b => [b.id, b.name]));
      const ids = branches.map(b => b.id);
      const limit = Number(args.limit) > 0 ? Number(args.limit) : 10;
      const result = typeof RagIndex.searchBranches === 'function'
        ? await RagIndex.searchBranches(ids, query, { limit, tolerance: args.tolerance })
        : await RagIndex.searchBranch(ids[0], query, { limit, tolerance: args.tolerance });

      const matches = result.hits.map(hit => {
        const bName = branchNamesById.get(hit.branchId) || branches[0].name;
        return {
          branchId: hit.branchId || branches[0].id,
          branchName: bName,
          documentId: hit.documentId,
          chunkId: hit.chunkId,
          documentTitle: hit.documentTitle,
          sectionTitle: hit.sectionTitle,
          score: hit.score,
          snippet: makeSnippet(hit.content, query)
        };
      });

      const branchLabel = branches.map(b => b.name).join(', ');
      const lines = [`[RESULTADOS EN ${branchLabel} PARA: ${query}]`];
      for (const match of matches) {
        const branchBadge = branches.length > 1 ? ` [Rama: ${match.branchName}]` : '';
        lines.push(`- ${match.documentTitle} · ${match.sectionTitle}${branchBadge} (chunkId: ${match.chunkId}, score: ${match.score.toFixed(3)})`);
        lines.push(`  ${match.snippet}`);
      }
      if (!matches.length) lines.push('No se encontraron fragmentos relevantes.');

      return {
        success: true,
        branchId: branches[0]?.id || '',
        branchName: branchLabel,
        branchIds: ids,
        query,
        matchesCount: matches.length,
        totalMatches: result.count,
        matches,
        text: lines.join('\n')
      };
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  }

  async function readKnowledgeChunk(branchIds, rawArgs) {
    const args = parseArguments(rawArgs);
    const chunkId = String(args.chunkId || '').trim();
    if (!chunkId) return { success: false, error: 'chunkId es obligatorio.' };
    try {
      const branches = await resolveBranches(branchIds);
      const allowedBranchIds = new Set(branches.map(b => b.id));
      const chunk = await RagStorage.getChunkById(chunkId);
      if (!chunk || !allowedBranchIds.has(chunk.branchId)) {
        return { success: false, error: `No existe el fragmento ${chunkId} en las ramas activas.` };
      }
      const document = await RagStorage.getDocumentById(chunk.documentId);
      return {
        success: true,
        chunkId,
        documentId: chunk.documentId,
        branchId: chunk.branchId,
        documentTitle: document?.title || '',
        sectionTitle: chunk.title,
        charCount: chunk.content.length,
        content: chunk.content,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd
      };
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  }

  return {
    parseArguments, normalizeBranchIds, resolveBranches,
    buildRagSystemContext, injectRagContext,
    listDocuments, searchKnowledgeBase, readKnowledgeChunk
  };
});
