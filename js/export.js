/**
 * Módulo de Exportación e Importación (ChatExport) para ChatCLI.
 * Gestiona la serialización a Markdown, JSON estructurado, impresión y parseo de archivos importados.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatExport = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function downloadFile(content, filename, mimeType) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.error('ChatExport: Error al descargar archivo:', e);
      return false;
    }
  }

  function buildMarkdownExport(chatHistory, options = {}) {
    const title = options.title || 'ChatCLI_Conversation';
    const model = options.model || 'No especificado';
    const dateStr = options.date || new Date().toLocaleString();

    let md = `# ${title}\n\n*Fecha de exportación: ${dateStr}*\n*Modelo: ${model}*\n\n---\n\n`;

    (chatHistory || []).forEach(m => {
      if (!m || m.role === 'system') return;
      if (m.role === 'user') {
        const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        md += `### 👤 Usuario\n\n${contentStr}\n\n---\n\n`;
      } else if (m.role === 'assistant' && m.content) {
        md += `### 🤖 Asistente\n\n${m.content}\n\n---\n\n`;
      }
    });

    return md;
  }

  function buildJsonExport(sessionMeta = {}, chatHistory = [], appConfig = {}) {
    const title = sessionMeta.title || 'ChatCLI_Conversation';
    const exportData = {
      version: '5.0',
      app: 'ChatCLI',
      exportedAt: new Date().toISOString(),
      session: {
        id: sessionMeta.id || ('session_' + Date.now()),
        title: title,
        createdAt: sessionMeta.createdAt || Date.now(),
        updatedAt: Date.now(),
        history: chatHistory
      },
      config: {
        model: appConfig.model || '',
        apiUrl: appConfig.apiUrl || '',
        apiType: appConfig.apiType || ''
      }
    };
    return JSON.stringify(exportData, null, 2);
  }

  function parseImportedJson(jsonString, defaultTitle = 'Conversación Importada') {
    if (!jsonString || typeof jsonString !== 'string') {
      throw new Error('El contenido proporcionado no es una cadena JSON válida.');
    }

    const data = JSON.parse(jsonString);
    const importedSession = data.session || data;

    if (!importedSession || !Array.isArray(importedSession.history)) {
      throw new Error('El archivo no contiene un historial de chat válido (propiedad history ausente).');
    }

    const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    return {
      id: newId,
      title: importedSession.title || defaultTitle,
      createdAt: importedSession.createdAt || Date.now(),
      updatedAt: Date.now(),
      history: importedSession.history
    };
  }

  return {
    downloadFile,
    buildMarkdownExport,
    buildJsonExport,
    parseImportedJson
  };
}));
