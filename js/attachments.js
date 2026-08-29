/**
 * Módulo de Gestión de Adjuntos (ChatAttachments) para ChatCLI.
 * Gestiona la lista de archivos adjuntos (texto, código, imágenes, PDF),
 * su renderizado visual en chips y el ensamblado del prompt enriquecido con adjuntos.
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatAttachments = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getFileParser() {
    return (typeof window !== 'undefined' && window.ChatFileParser) ? window.ChatFileParser : {
      formatBytes: (bytes) => `${bytes} B`
    };
  }

  let attachedFiles = [];

  function getFiles() {
    return [...attachedFiles];
  }

  function setFiles(files) {
    attachedFiles = Array.isArray(files) ? [...files] : [];
  }

  function clearFiles() {
    attachedFiles = [];
  }

  function removeFileAt(index) {
    if (index >= 0 && index < attachedFiles.length) {
      attachedFiles.splice(index, 1);
    }
  }

  function addFile(fileObj) {
    if (fileObj && fileObj.name) {
      attachedFiles.push(fileObj);
    }
  }

  function renderChips(container, onRemoveCallback) {
    if (!container) return;

    if (attachedFiles.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    container.innerHTML = '';

    const FileParser = getFileParser();

    attachedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';

      let icon = '📄';
      if (file.type === 'pdf') icon = '📕';
      else if (file.type === 'image') icon = '🖼️';

      chip.innerHTML = `
        <span class="file-chip-icon">${icon}</span>
        <span class="file-chip-name" title="${file.name}">${file.name}</span>
        <span class="file-chip-size">(${FileParser.formatBytes(file.size)})</span>
        <button type="button" class="btn-remove-chip" data-index="${index}" title="Remove">×</button>
      `;

      chip.querySelector('.btn-remove-chip').addEventListener('click', () => {
        removeFileAt(index);
        renderChips(container, onRemoveCallback);
        if (typeof onRemoveCallback === 'function') {
          onRemoveCallback(index);
        }
      });

      container.appendChild(chip);
    });
  }

  /**
   * Construye el prompt completo y el texto visual a partir del texto del usuario y los adjuntos.
   */
  function buildAttachmentsPayload(rawText = '', files = attachedFiles) {
    let fullPrompt = rawText;
    let displayText = rawText;
    let imageAttachments = [];

    if (files.length > 0) {
      const FileParser = getFileParser();

      imageAttachments = files.filter(f => f.type === 'image' && f.dataUrl).map(f => ({
        name: f.name,
        dataUrl: f.dataUrl,
        mimeType: f.mimeType || 'image/jpeg'
      }));

      const attachmentsText = files.map(file => {
        if (file.type === 'pdf') {
          return `\n\n--- PDF Document: ${file.name} (${FileParser.formatBytes(file.size)}) ---\n\`\`\`text\n${file.content}\n\`\`\``;
        } else if (file.type === 'image') {
          return `\n\n--- Image: ${file.name} (${FileParser.formatBytes(file.size)}) ---`;
        }
        return `\n\n--- File: ${file.name} (${FileParser.formatBytes(file.size)}) ---\n\`\`\`\n${file.content}\n\`\`\``;
      }).join('');

      fullPrompt = rawText ? `${rawText}\n${attachmentsText}` : `Attached files for analysis:${attachmentsText}`;

      const fileNamesList = files.map(f => {
        const icon = f.type === 'pdf' ? '📕' : f.type === 'image' ? '🖼️' : '📎';
        return `${icon} ${f.name}`;
      }).join(', ');

      displayText = rawText ? `${rawText}\n\n[${fileNamesList}]` : `[${fileNamesList}]`;
    }

    return {
      fullPrompt,
      displayText,
      imageAttachments
    };
  }

  return {
    getFiles,
    setFiles,
    clearFiles,
    removeFileAt,
    addFile,
    renderChips,
    buildAttachmentsPayload
  };
}));
