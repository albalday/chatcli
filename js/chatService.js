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
        lines.push(`Descripción: ${branch.description}`);
      }

      if (options.fallbackMode) {
        lines.push(`Tienes acceso a los siguientes documentos y resúmenes de capítulos indexados. Como la llamada a herramientas no está disponible en este modelo, responde con la información presente en estos resúmenes estructurados:\n`);
      } else {
        lines.push(`Tienes acceso a los siguientes documentos y capítulos. Utiliza los resúmenes para responder preguntas generales. Si necesitas detalles específicos, comandos, fragmentos de código o citas exactas, DEBES invocar la herramienta 'read_chapter_content'.\n`);
      }

      for (const doc of docHeaders) {
        lines.push(`- Documento: "${doc.title}" (docId: "${doc.id}")`);
        if (doc.globalSummary) {
          lines.push(`  Resumen Global: ${doc.globalSummary}`);
        }

        if (Array.isArray(doc.chapters) && doc.chapters.length > 0) {
          lines.push(`  Capítulos disponibles:`);
          for (const chap of doc.chapters) {
            const sumText = chap.summary || 'Sin resumen específico.';
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
   * @param {Object} args - Parámetros { docId, chapterId }.
   * @returns {Promise<{ success: boolean, docId: string, chapterId: number, content?: string, charCount?: number, error?: string }>}
   */
  async function resolveChapterToolCall(args = {}) {
    const RagStorage = getRagStorage();
    if (!RagStorage || !RagStorage.getChapterContent) {
      return {
        success: false,
        error: 'El módulo de almacenamiento RagStorage no está disponible.'
      };
    }

    const docId = args.docId || args.doc_id || args.id || '';
    const chapterId = typeof args.chapterId === 'number' ? args.chapterId : parseInt(args.chapter_id || args.chapterId || args.chapter, 10);

    if (!docId || isNaN(chapterId)) {
      return {
        success: false,
        error: 'Parámetros inválidos: docId (string) y chapterId (número) son obligatorios.'
      };
    }

    try {
      const content = await RagStorage.getChapterContent(docId, chapterId);
      if (content !== null && typeof content === 'string') {
        return {
          success: true,
          docId,
          chapterId,
          charCount: content.length,
          content
        };
      }

      return {
        success: false,
        error: `No se encontró el capítulo ID [${chapterId}] en el documento "${docId}".`
      };
    } catch (err) {
      return {
        success: false,
        error: `Error al leer capítulo de la base de datos: ${err?.message || String(err)}`
      };
    }
  }

  return {
    READ_CHAPTER_TOOL_DEFINITION,
    buildTreeRagSystemContext,
    injectTreeRagContext,
    resolveChapterToolCall
  };
});
