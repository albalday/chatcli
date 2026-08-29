/**
 * Servicio de Conversación y Contexto para RAG Jerárquico (ChatService / ChatTreeRagService).
 *
 * Responsabilidades:
 * - Genera e inyecta dinámicamente el índice jerárquico de resúmenes en el System Prompt
 *   cuando hay una rama activa seleccionada.
 * - Provee la definición estándar OpenAPI / Function Calling para la herramienta 'read_chapter_content'.
 * - Resuelve llamadas a 'read_chapter_content' recuperando los capítulos desde IndexedDB (LocalRAG_DB).
 * - Ofrece un modo fallback para modelos que no soportan Tool Calling, concatenando resúmenes estructurados.
 *
 * Compatible con Browser (file://, http://) y Node.js.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatTreeRagService = factory();
    root.ChatService = root.ChatTreeRagService; // Alias
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getRagStorage() {
    if (typeof window !== 'undefined' && (window.ChatRagStorage || window.RagStorage)) {
      return window.ChatRagStorage || window.RagStorage;
    }
    if (typeof require !== 'undefined') {
      try { return require('./ragStorage.js'); } catch (e) {}
    }
    return null;
  }

  /**
   * Definición oficial de la herramienta 'read_chapter_content' según la especificación OpenAI Tool Calling.
   */
  const READ_CHAPTER_TOOL_DEFINITION = {
    type: 'function',
    function: {
      name: 'read_chapter_content',
      description: 'Recupera el contenido completo y detallado de un capítulo de un documento indexado en la rama activa cuando el resumen no es suficiente.',
      parameters: {
        type: 'object',
        properties: {
          docId: {
            type: 'string',
            description: 'El identificador único del documento (docId).'
          },
          chapterId: {
            type: 'number',
            description: 'El número de ID del capítulo a consultar.'
          }
        },
        required: ['docId', 'chapterId']
      }
    }
  };

  /**
  /**
   * Parsea argumentos de herramientas que pueden venir como objeto, array o múltiples JSONs concatenados.
   */
  function parseToolCallArguments(rawArgs) {
    if (!rawArgs) return [];
    if (typeof rawArgs === 'object') {
      if (Array.isArray(rawArgs)) return rawArgs;
      return [rawArgs];
    }
    const str = String(rawArgs).trim();
    if (!str) return [];

    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      const items = [];
      const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      let m;
      while ((m = jsonRegex.exec(str)) !== null) {
        try {
          const item = JSON.parse(m[0]);
          if (item && typeof item === 'object') items.push(item);
        } catch (itemErr) {}
      }
      return items;
    }
  }

  /**
   * Construye el bloque jerárquico compacto de resúmenes a partir de la rama activa.
   * @param {string} branchId - ID de la rama seleccionada.
   * @param {Object} [options={}] - Opciones adicionales (ej: fallbackMode).
   * @returns {Promise<string>} - Bloque de texto formateado para inyectar en el System Prompt.
   */
  async function buildTreeRagSystemContext(branchId, options = {}) {
    if (!branchId) return '';
    const RagStorage = getRagStorage();
    if (!RagStorage || !RagStorage.getBranchById || !RagStorage.getDocumentHeadersByBranch) {
      return '';
    }

    try {
      const branch = await RagStorage.getBranchById(branchId);
      if (!branch) return '';

      const docHeaders = await RagStorage.getDocumentHeadersByBranch(branchId);
      if (!docHeaders || docHeaders.length === 0) return '';

      const lines = [];
      lines.push(`[BASE DE CONOCIMIENTO ACTIVA: ${branch.name}]`);
      if (branch.description) {
        lines.push(`Descripción: ${branch.description.trim()}`);
      }

      if (options.fallbackMode) {
        lines.push(`Documentos y capítulos indexados:\n`);
      } else {
        lines.push(`Para citas exactas, diagramas o detalles técnicos profundos, invoca 'read_chapter_content(docId, chapterId)'. Si el capítulo contiene diagramas o esquemas (etiquetas '![...](rag-image://...)' o '#img_X_Y'), puedes incluirlos en tu respuesta para que el usuario visualice la imagen.\n`);
      }

      for (const doc of docHeaders) {
        lines.push(`- Documento: "${doc.title}" (docId: "${doc.id}")`);
        if (doc.globalSummary) {
          lines.push(`  Resumen Global: ${doc.globalSummary.trim()}`);
        }

        if (Array.isArray(doc.chapters) && doc.chapters.length > 0) {
          lines.push(`  Capítulos disponibles:`);
          for (const chap of doc.chapters) {
            const sumText = (chap.summary || 'Sin resumen específico.').trim();
            lines.push(`    * Cap ID [${chap.chapterId}]: "${chap.title}" -> ${sumText}`);
          }
        }
      }

      return lines.join('\n').trim();
    } catch (err) {
      console.warn(`ChatTreeRagService: Error al construir contexto de rama [${branchId}]:`, err);
      return '';
    }
  }

  /**
   * Adjunta el bloque de contexto RAG al inicio del System Prompt.
   * @param {string} baseSystemPrompt - Prompt del sistema existente.
   * @param {string} branchId - ID de la rama activa.
   * @param {Object} [options={}] - Opciones de contexto.
   * @returns {Promise<string>} - System Prompt enriquecido.
   */
  async function injectTreeRagContext(baseSystemPrompt = '', branchId = null, options = {}) {
    if (!branchId) return baseSystemPrompt;
    const ragContext = await buildTreeRagSystemContext(branchId, options);
    if (!ragContext) return baseSystemPrompt;

    if (!baseSystemPrompt || baseSystemPrompt.trim().length === 0) {
      return ragContext;
    }

    return `${ragContext}\n\n${baseSystemPrompt}`.trim();
  }

  /**
   * Resuelve la ejecución de una llamada a 'read_chapter_content' contra IndexedDB.
   * Soporta peticiones individuales, arrays y múltiples JSONs concatenados devueltos por el modelo.
   * @param {Object|string} rawArgs - Parámetros { docId, chapterId } o string JSON.
   * @returns {Promise<{ success: boolean, docId: string, chapterId: number|string, content?: string, charCount?: number, error?: string }>}
   */
  async function resolveChapterToolCall(rawArgs = {}) {
    const RagStorage = getRagStorage();
    if (!RagStorage || !RagStorage.getChapterContent) {
      return {
        success: false,
        error: 'El módulo de almacenamiento RagStorage no está disponible.'
      };
    }

    const requests = parseToolCallArguments(rawArgs);
    if (requests.length === 0) {
      return {
        success: false,
        error: 'Parámetros inválidos: docId (string) y chapterId (número) son obligatorios.'
      };
    }

    const results = [];
    for (const req of requests) {
      const docId = req.docId || req.doc_id || req.id || '';
      const chapterId = typeof req.chapterId === 'number' ? req.chapterId : parseInt(req.chapter_id || req.chapterId || req.chapter, 10);
      if (!docId || isNaN(chapterId)) continue;

      try {
        const rawContent = await RagStorage.getChapterContent(docId, chapterId);
        if (rawContent !== null && typeof rawContent === 'string') {
          // Reemplazar cadenas pesadas base64 por referencias ligeras 'rag-image://...' y cachear
          const cleanContent = rawContent.replace(/!\[([^\]]*#img_([0-9_]+)[^\]]*)\]\((data:image\/[^)]+)\)/g, (match, alt, id, dataUrl) => {
            if (RagStorage.registerImage) {
              RagStorage.registerImage(`img_${id}`, dataUrl, docId);
            }
            return `![${alt}](rag-image://${docId}/${chapterId}/img_${id})`;
          }).replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (match, alt, dataUrl) => {
            const autoId = `img_c${chapterId}_${Math.random().toString(36).substring(2, 6)}`;
            if (RagStorage.registerImage) {
              RagStorage.registerImage(autoId, dataUrl, docId);
            }
            return `![${alt}](rag-image://${docId}/${chapterId}/${autoId})`;
          });

          results.push({
            docId,
            chapterId,
            charCount: cleanContent.length,
            content: cleanContent,
            rawContent
          });
        } else {
          results.push({
            docId,
            chapterId,
            error: `No se encontró el capítulo ID [${chapterId}] en el documento "${docId}".`
          });
        }
      } catch (err) {
        results.push({
          docId,
          chapterId,
          error: `Error al leer capítulo ID [${chapterId}]: ${err.message || String(err)}`
        });
      }
    }

    if (results.length === 0) {
      return {
        success: false,
        error: 'Parámetros inválidos: docId (string) y chapterId (número) son obligatorios.'
      };
    }

    if (results.length === 1) {
      const single = results[0];
      if (single.content !== undefined) {
        return {
          success: true,
          docId: single.docId,
          chapterId: single.chapterId,
          charCount: single.charCount,
          content: single.content
        };
      }
      return {
        success: false,
        docId: single.docId,
        chapterId: single.chapterId,
        error: single.error
      };
    }

    const combinedContent = results.map(r => {
      if (r.content !== undefined) {
        return `=== Documento: ${r.docId} | Capítulo ${r.chapterId} ===\n${r.content}`;
      }
      return `=== Documento: ${r.docId} | Capítulo ${r.chapterId} ===\nError: ${r.error}`;
    }).join('\n\n---\n\n');

    return {
      success: results.some(r => r.content !== undefined),
      docId: results.map(r => r.docId).join(', '),
      chapterId: results.map(r => r.chapterId).join(', '),
      charCount: combinedContent.length,
      content: combinedContent
    };
  }

  return {
    READ_CHAPTER_TOOL_DEFINITION,
    parseToolCallArguments,
    buildTreeRagSystemContext,
    injectTreeRagContext,
    resolveChapterToolCall
  };
});

