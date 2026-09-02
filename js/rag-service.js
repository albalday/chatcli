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

  async function requireBranch(branchId) {
    if (!branchId) throw new Error('No hay ninguna rama de conocimiento activa.');
    const branch = await RagStorage.getBranchById(branchId);
    if (!branch) throw new Error(`No existe la rama de conocimiento ${branchId}.`);
    return branch;
  }

  async function buildRagSystemContext(branchId) {
    if (!branchId) return '';
    try {
      const branch = await requireBranch(branchId);
      return `[BASE DE CONOCIMIENTO ACTIVA: ${branch.name}]\nBusca primero con search_knowledge_base y usa read_knowledge_chunk cuando necesites el texto completo de un resultado.\nSi un fragmento de conocimiento incluye una referencia de imagen del tipo [IMAGEN: ... | Para mostrar al usuario usa: ![...](rag-image://docId:imgId)], incluye esa misma etiqueta Markdown en tu respuesta para mostrar la imagen al usuario.`;
    } catch (_) {
      return '';
    }
  }

  async function injectRagContext(systemPrompt, branchId) {
    const context = await buildRagSystemContext(branchId);
    return [context, String(systemPrompt || '').trim()].filter(Boolean).join('\n\n');
  }

  async function listDocuments(branchId) {
    try {
      const branch = await requireBranch(branchId);
      const documents = await RagStorage.getDocumentsByBranch(branchId);
      const lines = [`[DOCUMENTOS EN ${branch.name}]`];
      for (const document of documents) {
        lines.push(`- ${document.title} (documentId: ${document.id}, ${document.chunkCount} fragmentos, ${document.fileType})`);
      }
      if (!documents.length) lines.push('La rama no contiene documentos.');
      return { success: true, branchId, branchName: branch.name, count: documents.length, documents, text: lines.join('\n') };
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

  async function searchKnowledgeBase(branchId, rawArgs) {
    const args = parseArguments(rawArgs);
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: 'La consulta de búsqueda está vacía.' };
    try {
      const branch = await requireBranch(branchId);
      const result = await RagIndex.searchBranch(branchId, query, { limit: args.limit || 8, tolerance: args.tolerance });
      const matches = result.hits.map(hit => ({
        documentId: hit.documentId,
        chunkId: hit.chunkId,
        documentTitle: hit.documentTitle,
        sectionTitle: hit.sectionTitle,
        score: hit.score,
        snippet: makeSnippet(hit.content, query)
      }));
      const lines = [`[RESULTADOS EN ${branch.name} PARA: ${query}]`];
      for (const match of matches) {
        lines.push(`- ${match.documentTitle} · ${match.sectionTitle} (chunkId: ${match.chunkId}, score: ${match.score.toFixed(3)})`);
        lines.push(`  ${match.snippet}`);
      }
      if (!matches.length) lines.push('No se encontraron fragmentos relevantes.');
      return {
        success: true, branchId, branchName: branch.name, query,
        matchesCount: matches.length, totalMatches: result.count, matches, text: lines.join('\n')
      };
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  }

  async function readKnowledgeChunk(branchId, rawArgs) {
    const args = parseArguments(rawArgs);
    const chunkId = String(args.chunkId || '').trim();
    if (!chunkId) return { success: false, error: 'chunkId es obligatorio.' };
    try {
      await requireBranch(branchId);
      const chunk = await RagStorage.getChunkById(chunkId);
      if (!chunk || chunk.branchId !== branchId) return { success: false, error: `No existe el fragmento ${chunkId} en la rama activa.` };
      const document = await RagStorage.getDocumentById(chunk.documentId);
      return {
        success: true, chunkId, documentId: chunk.documentId,
        documentTitle: document?.title || '', sectionTitle: chunk.title,
        charCount: chunk.content.length, content: chunk.content,
        pageStart: chunk.pageStart, pageEnd: chunk.pageEnd
      };
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  }

  return {
    parseArguments, buildRagSystemContext, injectRagContext,
    listDocuments, searchKnowledgeBase, readKnowledgeChunk
  };
});
