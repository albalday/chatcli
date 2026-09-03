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

  const DOCUMENT_REFERENCE_STOPWORDS = new Set([
    'a', 'al', 'and', 'annual', 'archivo', 'de', 'del', 'document', 'documento',
    'el', 'en', 'file', 'for', 'form', 'in', 'informe', 'la', 'las', 'los',
    'of', 'para', 'por', 'report', 'the', 'un', 'una', 'y', '10k', '10q'
  ]);
  function normalizeDocumentReference(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\.(?:pdf|txt|md|csv|json)\b/g, ' ')
      .replace(/[_\-]+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\bfy\s*(\d{4})\b/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function documentReferenceTokens(value) {
    return Array.from(new Set(normalizeDocumentReference(value).split(' ')
      .map(token => /^fy\d{4}$/.test(token) ? token.slice(2) : token)
      .filter(token => token && !DOCUMENT_REFERENCE_STOPWORDS.has(token))));
  }

  function selectDocumentCandidate(documents, reference) {
    const queryText = normalizeDocumentReference(reference);
    const queryTokens = documentReferenceTokens(reference);
    if (!queryText || queryTokens.length === 0 || documents.length === 0) {
      return { selected: null, candidates: [], confident: false };
    }

    const prepared = documents.map(document => {
      const normalizedTitle = normalizeDocumentReference(document.title);
      return { ...document, normalizedTitle, titleTokens: new Set(documentReferenceTokens(document.title)) };
    });
    const frequencies = new Map();
    for (const token of queryTokens) {
      frequencies.set(token, prepared.filter(document => document.titleTokens.has(token)).length);
    }
    const rareThreshold = Math.max(1, Math.floor(prepared.length * 0.1));
    const candidates = prepared.map(document => {
      const matchedTerms = queryTokens.filter(token => document.titleTokens.has(token));
      const distinctiveTerms = matchedTerms.filter(token => (frequencies.get(token) || 0) <= rareThreshold);
      let score = matchedTerms.reduce((total, token) => {
        const frequency = frequencies.get(token) || prepared.length;
        let weight = 1 + Math.log2((prepared.length + 1) / (frequency + 1));
        if (/^\d{4}$/.test(token)) weight *= 0.8;
        if (/^[a-z]{1,2}$/.test(token)) weight *= 0.75;
        return total + weight;
      }, 0);
      const exactTitle = queryText === document.normalizedTitle;
      if (exactTitle) score += 10;
      return {
        branchId: document.branchId,
        documentId: document.id,
        title: document.title,
        score,
        matchedTerms,
        distinctiveTerms,
        exactTitle
      };
    }).filter(candidate => candidate.matchedTerms.length > 0)
      .sort((a, b) => b.score - a.score || b.matchedTerms.length - a.matchedTerms.length);

    const best = candidates[0] || null;
    const second = candidates[1] || null;
    const exactTitleCount = candidates.filter(candidate => candidate.exactTitle).length;
    const hasDistinctiveMatch = Boolean(best && best.distinctiveTerms.length > 0);
    const leadsClearly = Boolean(best && (!second || (best.exactTitle && exactTitleCount === 1) ||
      best.matchedTerms.length > second.matchedTerms.length || best.score >= second.score * 1.25));
    const confident = Boolean(best && hasDistinctiveMatch && leadsClearly);
    return { selected: confident ? best : null, candidates: candidates.slice(0, 5), confident };
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
      return `${label}\nUsa search_knowledge_base con scope="document" cuando la pregunta señale una fuente identificable, scope="corpus" para comparar o cubrir varias fuentes y scope="auto" si no está claro. Revisa el alcance realmente aplicado que devuelve la herramienta.\nUsa read_knowledge_chunk cuando necesites el texto completo de un resultado. Puedes incluir las referencias a imágenes incrustadas que aparezcan en los fragmentos consultados (![...](rag-image://...)) para mostrarlas al usuario.\n\nOrientación de búsqueda: identifica si la respuesta está en una fuente concreta, en un fragmento o sección localizada, o repartida entre fuentes. Si la fuente está identificada, busca primero en ese documento. Trata cada resultado como una pista: si apunta a la sección correcta pero el extracto es incompleto, usa read_knowledge_chunk antes de repetir una búsqueda similar. Reformula solo para reducir ambigüedad o cambiar de eje; no amplíes al corpus por falta de un resultado inmediato ni uses otra fuente para completar una respuesta localizada.`;
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
      const requestedScope = ['auto', 'document', 'corpus'].includes(String(args.scope || '').toLowerCase())
        ? String(args.scope).toLowerCase()
        : 'auto';
      const reference = [args.documentHint, query].map(value => String(value || '').trim()).filter(Boolean).join(' ');
      const documentsByBranch = await Promise.all(branches.map(branch => RagStorage.getDocumentsByBranch(branch.id)));
      const documents = documentsByBranch.flat();
      const selection = requestedScope === 'corpus'
        ? { selected: null, candidates: [], confident: false }
        : selectDocumentCandidate(documents, reference);

      let appliedScope = 'corpus';
      let scopeReason = requestedScope === 'corpus'
        ? 'La consulta solicitó cobertura transversal entre documentos.'
        : 'No se encontró una coincidencia documental inequívoca; se aplicó búsqueda transversal.';
      let result;
      if (selection.selected && typeof RagIndex.searchDocuments === 'function') {
        appliedScope = 'document';
        scopeReason = `Coincidencia inequívoca con el título «${selection.selected.title}».`;
        result = await RagIndex.searchDocuments(
          selection.selected.branchId,
          [selection.selected.documentId],
          query,
          { limit, tolerance: args.tolerance }
        );
      } else {
        const corpusOptions = {
          limit,
          tolerance: args.tolerance,
          groupByDocument: true,
          maxPerDocument: 2
        };
        result = typeof RagIndex.searchBranches === 'function'
          ? await RagIndex.searchBranches(ids, query, corpusOptions)
          : await RagIndex.searchBranch(ids[0], query, corpusOptions);
      }

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
      const lines = [
        `[RESULTADOS EN ${branchLabel} PARA: ${query}]`,
        `Alcance solicitado: ${requestedScope}`,
        `Alcance aplicado: ${appliedScope}`,
        `Motivo: ${scopeReason}`
      ];
      if (selection.selected) lines.push(`Documento seleccionado: ${selection.selected.title} (${selection.selected.documentId})`);
      if (!selection.selected && selection.candidates.length > 0) {
        lines.push(`Candidatos documentales: ${selection.candidates.map(candidate => candidate.title).join(', ')}`);
      }
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
        requestedScope,
        appliedScope,
        scopeReason,
        documentHint: String(args.documentHint || ''),
        selectedDocument: selection.selected,
        documentCandidates: selection.candidates,
        maxChunksPerDocument: appliedScope === 'corpus' ? 2 : null,
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
    normalizeDocumentReference, documentReferenceTokens, selectDocumentCandidate,
    buildRagSystemContext, injectRagContext,
    listDocuments, searchKnowledgeBase, readKnowledgeChunk
  };
});
