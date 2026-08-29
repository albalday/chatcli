/**
 * Módulo de Interfaz de Usuario para RAG Jerárquico por Ramas (ChatTreeRagUI).
 *
 * Administra:
 * 1. Selector rápido de ramas en la cabecera/barra superior del chat.
 * 2. Modal de gestión de ramas y documentos con diseño split-panel y dropzone Drag & Drop.
 * 3. Monitor en vivo de la cola de ingesta secuencial con barras de progreso y badges.
 * 4. Visor de estructura de documento (Árbol de conocimiento, resumen global y lector de capítulos).
 *
 * Integrado 100% con los estilos y temas visuales (Claro/Oscuro) de ChatCLI.
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatTreeRagUI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getRagStorage() {
    return (typeof window !== 'undefined' && (window.ChatRagStorage || window.RagStorage)) ? (window.ChatRagStorage || window.RagStorage) : null;
  }

  function getIngestionEngine() {
    return (typeof window !== 'undefined' && (window.ChatIngestionEngine || window.IngestionEngine)) ? (window.ChatIngestionEngine || window.IngestionEngine) : null;
  }

  function getMarkdown() {
    return (typeof window !== 'undefined' && window.ChatMarkdown) ? window.ChatMarkdown : {
      escapeHtml: (s) => String(s || ''),
      renderMarkdown: (s) => String(s || '')
    };
  }

  function getI18n() {
    return (typeof window !== 'undefined' && window.ChatI18n) ? window.ChatI18n : {
      t: (k) => k
    };
  }

  function getStorage() {
    if (typeof window !== 'undefined' && window.ChatStorage) return window.ChatStorage;
    if (typeof require !== 'undefined') {
      try { return require('./cookies.js'); } catch (e) {}
    }
    return null;
  }

  function t(key, params) {
    const i18n = getI18n();
    return i18n.t ? i18n.t(key, params) : key;
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Estado interno de la UI de RAG
  let selectedManageBranchId = null;
  let activeQueueController = null;
  let isQueueRunning = false;

  /**
   * Actualiza el estado visual y título del botón RAG en la barra superior.
   */
  async function updateToolbarRagButtonStatus() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('btn-open-tree-rag');
    if (!btn) return;

    const activeBranchId = getActiveChatBranchId();
    if (activeBranchId) {
      btn.classList.add('is-active');
      const RagStorage = getRagStorage();
      let branchName = '';
      if (RagStorage && RagStorage.getBranchById) {
        const b = await RagStorage.getBranchById(activeBranchId).catch(() => null);
        if (b) branchName = b.name;
      }
      btn.title = branchName
        ? `Base de Conocimiento (Rama activa: "${branchName}")`
        : 'Base de Conocimiento (RAG Activo)';
      btn.innerHTML = '<span>🌿</span><span data-i18n="btn_tree_rag">Conocimiento</span><span class="rag-toolbar-badge-dot" title="RAG Activo">●</span>';
    } else {
      btn.classList.remove('is-active');
      btn.title = 'Gestionar Base de Conocimiento por Ramas (RAG Jerárquico)';
      btn.innerHTML = '<span>🌿</span><span data-i18n="btn_tree_rag">Conocimiento</span>';
    }
  }

  /**
   * Alias de compatibilidad para refrescar estado del selector/botón.
   */
  async function refreshBranchSelector() {
    return await updateToolbarRagButtonStatus();
  }

  /**
   * Pestaña 1: Renderiza la tarjeta principal de estado y la cuadrícula de ramas para activar en el chat.
   */
  async function renderActiveBranchTab() {
    if (typeof document === 'undefined') return;
    const grid = document.getElementById('rag-active-branch-grid');
    const titleEl = document.getElementById('rag-active-status-title');
    const descEl = document.getElementById('rag-active-status-desc');
    const btnMaster = document.getElementById('btn-rag-toggle-master');
    if (!grid) return;

    const RagStorage = getRagStorage();
    if (!RagStorage) return;

    try {
      const branches = await RagStorage.getBranches();
      const activeChatBranchId = getActiveChatBranchId();
      const activeBranchObj = activeChatBranchId ? branches.find(b => b.id === activeChatBranchId) : null;

      // Actualizar tarjeta superior
      if (activeBranchObj) {
        if (titleEl) titleEl.textContent = `🌿 RAG Activado: "${activeBranchObj.name}"`;
        if (descEl) descEl.textContent = `Los resúmenes de "${activeBranchObj.name}" están integrados en el contexto del chat. El modelo leerá capítulos completos bajo demanda con read_chapter_content.`;
        if (btnMaster) {
          btnMaster.textContent = t('rag_btn_deactivate') || 'Desactivar RAG';
          btnMaster.className = 'btn-secondary btn-danger-hover';
          btnMaster.disabled = false;
          btnMaster.onclick = () => {
            setActiveChatBranchId('');
            renderActiveBranchTab();
            updateToolbarRagButtonStatus();
          };
        }
      } else {
        if (titleEl) titleEl.textContent = '⚪ ' + (t('rag_inactive_label') || 'RAG Desactivado (Sin contexto)');
        if (descEl) descEl.textContent = 'El chat opera en modo estándar sin inyectar conocimiento documental. Haz clic en una de las ramas inferiores para activarla.';
        if (btnMaster) {
          btnMaster.textContent = 'RAG Desactivado';
          btnMaster.className = 'btn-secondary';
          btnMaster.disabled = true;
          btnMaster.onclick = null;
        }
      }

      grid.innerHTML = '';

      // Tarjeta "Sin contexto"
      const noContextActivePill = !activeChatBranchId ? '<span class="rag-active-pill">ACTIVA</span>' : '';
      const noContextCard = document.createElement('div');
      noContextCard.className = `rag-branch-card ${!activeChatBranchId ? 'is-active-chat' : ''}`;
      noContextCard.innerHTML = `
        <div class="rag-branch-card-header">
          <span class="rag-branch-card-title">🌿 Sin contexto (RAG desactivado)</span>
          ${noContextActivePill}
        </div>
        <p class="rag-branch-card-desc">El modelo responderá únicamente con su conocimiento general sin consultar documentos locales.</p>
        <div class="rag-branch-card-meta">
          <span>⚪ Modo estándar</span>
        </div>
      `;
      noContextCard.addEventListener('click', () => {
        setActiveChatBranchId('');
        renderActiveBranchTab();
        updateToolbarRagButtonStatus();
      });
      grid.appendChild(noContextCard);

      // Tarjetas por cada rama
      for (const branch of branches) {
        const docs = await RagStorage.getDocumentsByBranch(branch.id).catch(() => []);
        const isCurrentActive = branch.id === activeChatBranchId;
        const branchActivePill = isCurrentActive ? '<span class="rag-active-pill">ACTIVA</span>' : '';

        let totalChapters = 0;
        let totalSize = 0;
        docs.forEach(d => {
          totalChapters += (d.chapters ? d.chapters.length : 0);
          totalSize += (d.fileSize || 0);
        });

        const card = document.createElement('div');
        card.className = `rag-branch-card ${isCurrentActive ? 'is-active-chat' : ''}`;
        card.innerHTML = `
          <div class="rag-branch-card-header">
            <span class="rag-branch-card-title">📁 ${getMarkdown().escapeHtml(branch.name)}</span>
            ${branchActivePill}
          </div>
          <p class="rag-branch-card-desc">${branch.description ? getMarkdown().escapeHtml(branch.description) : '<em>Sin descripción</em>'}</p>
          <div class="rag-branch-card-meta">
            <span>📄 ${docs.length} docs</span>
            <span>•</span>
            <span>📑 ${totalChapters} caps</span>
            <span>•</span>
            <span>💾 ${formatBytes(totalSize)}</span>
          </div>
        `;
        card.addEventListener('click', () => {
          setActiveChatBranchId(branch.id);
          renderActiveBranchTab();
          updateToolbarRagButtonStatus();
        });
        grid.appendChild(card);
      }

      updateStorageQuotaDisplay();
    } catch (err) {
      console.warn('ChatTreeRagUI: Error al renderizar pestaña activa:', err);
    }
  }

  /**
   * Pestaña 2: Renderiza la barra de herramientas y espacio de trabajo de gestión de ramas.
   */
  async function renderManageTab() {
    if (typeof document === 'undefined') return;
    const selectBranch = document.getElementById('rag-manage-branch-select');
    const btnEdit = document.getElementById('btn-rag-edit-branch');
    const btnExport = document.getElementById('btn-rag-export-branch');
    const btnDelete = document.getElementById('btn-rag-delete-branch');
    if (!selectBranch) return;

    const RagStorage = getRagStorage();
    if (!RagStorage) return;

    try {
      const branches = await RagStorage.getBranches();
      selectBranch.innerHTML = '';

      if (branches.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- No hay ramas creadas --';
        selectBranch.appendChild(opt);
        selectBranch.disabled = true;
        if (btnEdit) btnEdit.disabled = true;
        if (btnExport) btnExport.disabled = true;
        if (btnDelete) btnDelete.disabled = true;
        selectedManageBranchId = null;
        renderManageWorkspace(null);
        return;
      }

      selectBranch.disabled = false;
      if (btnEdit) btnEdit.disabled = false;
      if (btnExport) btnExport.disabled = false;
      if (btnDelete) btnDelete.disabled = false;

      // Si la rama seleccionada no existe, asignar la activa o la primera
      if (!selectedManageBranchId || !branches.some(b => b.id === selectedManageBranchId)) {
        const activeId = getActiveChatBranchId();
        if (activeId && branches.some(b => b.id === activeId)) {
          selectedManageBranchId = activeId;
        } else {
          selectedManageBranchId = branches[0].id;
        }
      }

      branches.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `📁 ${b.name}`;
        if (b.id === selectedManageBranchId) opt.selected = true;
        selectBranch.appendChild(opt);
      });

      selectBranch.onchange = (e) => {
        selectedManageBranchId = e.target.value;
        renderManageWorkspace(selectedManageBranchId);
      };

      renderManageWorkspace(selectedManageBranchId);
      updateStorageQuotaDisplay();
    } catch (err) {
      console.warn('ChatTreeRagUI: Error al renderizar pestaña de gestión:', err);
    }
  }

  /**
   * Renderiza el contenido y documentos de la rama en edición en la pestaña de gestión.
   */
  async function renderManageWorkspace(branchId) {
    const workspaceContainer = document.getElementById('rag-manage-workspace');
    if (!workspaceContainer) return;

    if (!branchId) {
      workspaceContainer.innerHTML = `
        <div class="rag-empty-workspace">
          <div class="rag-empty-icon">📁</div>
          <h3>${t('rag_no_branches') || 'No hay ramas creadas'}</h3>
          <p>Crea una nueva rama arriba para comenzar a indexar documentos PDF, Markdown o Texto.</p>
        </div>
      `;
      return;
    }

    const RagStorage = getRagStorage();
    if (!RagStorage) return;

    try {
      const branch = await RagStorage.getBranchById(branchId);
      if (!branch) return;

      const docs = await RagStorage.getDocumentsByBranch(branchId);

      workspaceContainer.innerHTML = `
        <!-- Zona Drag & Drop para Ingesta -->
        <div id="rag-dropzone" class="rag-dropzone">
          <input type="file" id="rag-file-input" multiple accept=".pdf,.txt,.md" style="display: none;">
          <div class="rag-dropzone-icon">📤</div>
          <div class="rag-dropzone-text">
            <strong>${t('rag_dropzone_title') || 'Arrastra tus documentos PDF, Markdown o Texto (.txt) aquí'}</strong>
            <span class="rag-dropzone-hint">${t('rag_dropzone_hint') || 'o haz clic para explorar tus archivos locales'}</span>
          </div>
          <div class="rag-dropzone-badges">
            <span class="filetype-badge">PDF</span>
            <span class="filetype-badge">Markdown</span>
            <span class="filetype-badge">TXT</span>
          </div>
        </div>

        <!-- Panel de Estado de Carga / Cola de Ingesta Secuencial -->
        <div id="rag-ingestion-progress-container" class="rag-progress-container" style="display: none;">
          <div class="rag-progress-header">
            <div class="rag-progress-title">
              <span>⚡</span>
              <strong id="rag-progress-summary-title">Procesando documentos...</strong>
            </div>
            <button type="button" id="btn-rag-cancel-queue" class="btn-secondary btn-danger-hover" style="font-size: 0.75rem; padding: 0.2rem 0.55rem;">
              ${t('rag_btn_cancel_queue') || 'Cancelar Cola'}
            </button>
          </div>
          <div class="rag-progress-bar-wrapper">
            <div id="rag-progress-bar-fill" class="rag-progress-bar-fill" style="width: 0%;"></div>
          </div>
          <div id="rag-progress-file-list" class="rag-progress-file-list"></div>
        </div>

        <!-- Lista de Documentos Indexados -->
        <div class="rag-docs-section">
          <div class="rag-docs-section-header">
            <h4>${t('rag_docs_title') || 'Documentos Indexados en esta Rama'} (${docs.length})</h4>
          </div>
          <div id="rag-docs-list" class="rag-docs-list">
            ${docs.length === 0 ? `
              <div class="rag-no-docs-message">
                <p>${t('rag_no_docs') || 'No hay documentos en esta rama. Arrastra archivos arriba para comenzar a indexar.'}</p>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      // Drag & Drop Handlers
      setupDropzoneEvents(branchId);

      // Renderizar filas de documentos
      const docsListContainer = workspaceContainer.querySelector('#rag-docs-list');
      if (docsListContainer && docs.length > 0) {
        docs.forEach((doc) => {
          const docRow = document.createElement('div');
          docRow.className = 'rag-doc-row';
          docRow.innerHTML = `
            <div class="rag-doc-icon">${doc.fileType === 'pdf' ? '📄' : (doc.fileType === 'md' ? '📝' : '📃')}</div>
            <div class="rag-doc-info">
              <div class="rag-doc-title" title="${getMarkdown().escapeHtml(doc.title)}">${getMarkdown().escapeHtml(doc.title)}</div>
              <div class="rag-doc-meta">
                <span>${doc.fileType ? doc.fileType.toUpperCase() : 'TXT'}</span>
                <span>•</span>
                <span>${formatBytes(doc.fileSize)}</span>
                <span>•</span>
                <span>${doc.chapters ? doc.chapters.length : 0} capítulos</span>
                <span>•</span>
                <span>${formatDate(doc.createdAt)}</span>
              </div>
            </div>
            <div class="rag-doc-actions">
              <button type="button" class="btn-secondary btn-view-structure" data-doc-id="${doc.id}">
                👁️ ${t('rag_btn_view_structure') || 'Ver estructura'}
              </button>
              <button type="button" class="btn-secondary btn-danger-hover btn-delete-doc" data-doc-id="${doc.id}" title="Eliminar documento">
                🗑️
              </button>
            </div>
          `;

          docRow.querySelector('.btn-view-structure').addEventListener('click', () => {
            openDocumentStructureViewer(doc);
          });

          docRow.querySelector('.btn-delete-doc').addEventListener('click', () => {
            handleDeleteDocument(doc, branchId);
          });

          docsListContainer.appendChild(docRow);
        });
      }
    } catch (err) {
      console.warn('ChatTreeRagUI: Error al renderizar workspace:', err);
    }
  }

  /**
   * Alias de compatibilidad.
   */
  async function renderBranchesList() {
    await renderActiveBranchTab();
    await renderManageTab();
  }

  /**
   * Alias de compatibilidad.
   */
  async function renderBranchWorkspace(branchId) {
    await renderManageWorkspace(branchId);
  }

  /**
   * Configura la interacción Drag & Drop y selección de archivos en la dropzone.
   */
  function setupDropzoneEvents(branchId) {
    const dropzone = document.getElementById('rag-dropzone');
    const fileInput = document.getElementById('rag-file-input');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => {
      if (!isQueueRunning) fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesSelected(Array.from(e.target.files), branchId);
        fileInput.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFilesSelected(Array.from(dt.files), branchId);
      }
    }, false);
  }

  /**
   * Ejecuta el pipeline secuencial de ingesta mostrando la barra de progreso reactiva.
   */
  async function handleFilesSelected(files, branchId) {
    if (!files || files.length === 0 || !branchId) return;

    const IngestionEngine = getIngestionEngine();
    if (!IngestionEngine) {
      alert('Error: Motor de Ingesta no disponible.');
      return;
    }

    const progressContainer = document.getElementById('rag-ingestion-progress-container');
    const progressBarFill = document.getElementById('rag-progress-bar-fill');
    const progressSummaryTitle = document.getElementById('rag-progress-summary-title');
    const progressFileList = document.getElementById('rag-progress-file-list');
    const btnCancel = document.getElementById('btn-rag-cancel-queue');

    if (!progressContainer || !progressBarFill || !progressFileList) return;

    // Inicializar contenedor de progreso
    progressContainer.style.display = 'block';
    progressBarFill.style.width = '0%';
    progressSummaryTitle.textContent = `Procesando 0 de ${files.length} documentos...`;
    progressFileList.innerHTML = '';

    // Crear filas individuales por cada archivo
    const fileRowMap = new Map();
    files.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'rag-progress-file-row';
      row.innerHTML = `
        <div class="rag-progress-file-name">${getMarkdown().escapeHtml(file.name)}</div>
        <div class="rag-progress-file-status"><span class="rag-status-badge status-waiting">⏳ En espera</span></div>
      `;
      progressFileList.appendChild(row);
      fileRowMap.set(file.name, row);
    });

    activeQueueController = new AbortController();
    isQueueRunning = true;

    if (btnCancel) {
      btnCancel.onclick = () => {
        if (activeQueueController) {
          activeQueueController.abort();
          btnCancel.textContent = 'Cancelando...';
        }
      };
    }

    try {
      // Callback de progreso en tiempo real
      const onProgress = (event) => {
        const { fileIndex, totalFiles, fileName, status, message, errorDetails } = event;
        const percent = Math.round((fileIndex / totalFiles) * 100);
        progressBarFill.style.width = `${percent}%`;
        progressSummaryTitle.textContent = `Procesando documento ${fileIndex} de ${totalFiles}...`;

        const row = fileRowMap.get(fileName);
        if (row) {
          const statusContainer = row.querySelector('.rag-progress-file-status');
          let badgeHtml = '';

          switch (status) {
            case 'reading':
              badgeHtml = '<span class="rag-status-badge status-reading">📖 Leyendo</span>';
              break;
            case 'extracting_pdf':
              badgeHtml = '<span class="rag-status-badge status-extracting">📄 Extrayendo PDF</span>';
              break;
            case 'generating_summaries':
              badgeHtml = '<span class="rag-status-badge status-summaries">🧠 Generando resúmenes...</span>';
              break;
            case 'saving':
              badgeHtml = '<span class="rag-status-badge status-saving">💾 Guardando...</span>';
              break;
            case 'completed':
              badgeHtml = '<span class="rag-status-badge status-completed">✅ Guardado</span>';
              break;
            case 'error':
              badgeHtml = `<span class="rag-status-badge status-error" title="${getMarkdown().escapeHtml(errorDetails || '')}">❌ Error</span>`;
              break;
            default:
              badgeHtml = `<span class="rag-status-badge status-waiting">${getMarkdown().escapeHtml(message || 'En espera')}</span>`;
          }

          if (statusContainer) statusContainer.innerHTML = badgeHtml;
        }
      };

      // Cliente LLM configurado en la app
      const llmClient = (typeof window !== 'undefined' && window.ChatAPI) ? window.ChatAPI : null;

      await IngestionEngine.processDocumentQueue(files, branchId, llmClient, onProgress);

      progressBarFill.style.width = '100%';
      progressSummaryTitle.textContent = `✅ Ingesta completada con éxito (${files.length} archivos procesados).`;

      // Refrescar lista de documentos tras un breve instante
      setTimeout(() => {
        renderManageWorkspace(branchId);
        renderActiveBranchTab();
      }, 1200);

    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        progressSummaryTitle.textContent = '⏹️ Cola de ingesta cancelada por el usuario.';
      } else {
        progressSummaryTitle.textContent = `❌ Error en la cola: ${err.message || String(err)}`;
      }
    } finally {
      isQueueRunning = false;
      activeQueueController = null;
      if (btnCancel) btnCancel.textContent = t('rag_btn_cancel_queue') || 'Cancelar Cola';
    }
  }

  /**
   * Abre el visor de estructura / Árbol de conocimiento del documento.
   */
  async function openDocumentStructureViewer(doc) {
    const viewerDialog = document.getElementById('rag-structure-dialog');
    if (!viewerDialog) return;

    const titleEl = viewerDialog.querySelector('#rag-structure-title');
    const summaryEl = viewerDialog.querySelector('#rag-structure-global-summary');
    const chaptersContainer = viewerDialog.querySelector('#rag-structure-chapters-list');

    if (titleEl) titleEl.textContent = doc.title || 'Documento';
    if (summaryEl) {
      summaryEl.innerHTML = doc.globalSummary 
        ? getMarkdown().renderMarkdown(doc.globalSummary) 
        : '<p><em>Sin resumen global disponible.</em></p>';
    }

    if (chaptersContainer) {
      chaptersContainer.innerHTML = '';
      const chapters = doc.chapters || [];

      if (chapters.length === 0) {
        chaptersContainer.innerHTML = '<p class="rag-empty-chapters">No se detectaron capítulos estructurados.</p>';
      } else {
        chapters.forEach((chap) => {
          const chapItem = document.createElement('div');
          chapItem.className = 'rag-chapter-card';
          chapItem.innerHTML = `
            <div class="rag-chapter-card-header">
              <div class="rag-chapter-title-group">
                <span class="rag-chapter-badge">Cap ID ${chap.chapterId}</span>
                <strong class="rag-chapter-title">${getMarkdown().escapeHtml(chap.title || 'Sin título')}</strong>
              </div>
              <button type="button" class="btn-secondary btn-preview-chapter-content">
                👁️ ${t('rag_btn_view_chapter_content') || 'Ver contenido íntegro'}
              </button>
            </div>
            <div class="rag-chapter-summary">
              ${getMarkdown().escapeHtml(chap.summary || '')}
            </div>
            <div class="rag-chapter-content-preview" style="display: none;">
              <div class="rag-content-preview-header">Texto íntegro almacenado:</div>
              <pre class="rag-content-pre"><code></code></pre>
            </div>
          `;

          const btnPreview = chapItem.querySelector('.btn-preview-chapter-content');
          const previewBox = chapItem.querySelector('.rag-chapter-content-preview');
          const preCode = chapItem.querySelector('.rag-content-pre code');

          btnPreview.addEventListener('click', async () => {
            if (previewBox.style.display === 'none') {
              btnPreview.textContent = '⏳ Cargando...';
              const RagStorage = getRagStorage();
              const fullContent = await RagStorage.getChapterContent(doc.id, chap.chapterId);
              preCode.textContent = fullContent || '(Sin contenido almacenado)';
              previewBox.style.display = 'block';
              btnPreview.textContent = '🔼 Ocultar contenido';
            } else {
              previewBox.style.display = 'none';
              btnPreview.textContent = `👁️ ${t('rag_btn_view_chapter_content') || 'Ver contenido íntegro'}`;
            }
          });

          chaptersContainer.appendChild(chapItem);
        });
      }
    }

    viewerDialog.showModal();
  }

  /**
   * Manejador para crear una nueva rama.
   */
  async function handleCreateBranch() {
    const name = prompt('Introduce el nombre de la nueva rama de conocimiento (ej: "Proyecto API 2026"):');
    if (!name || !name.trim()) return;

    const description = prompt('Descripción opcional de la rama temática:') || '';

    const RagStorage = getRagStorage();
    if (!RagStorage) return;

    try {
      const newBranch = await RagStorage.createBranch(name.trim(), description.trim());
      selectedManageBranchId = newBranch.id;
      await renderBranchesList();
      await refreshBranchSelector();
    } catch (err) {
      alert(`Error al crear rama: ${err?.message || String(err)}`);
    }
  }

  /**
   * Manejador para editar nombre y descripción de una rama.
   */
  async function handleEditBranch(branchId) {
    const targetBranchId = branchId || selectedManageBranchId;
    if (!targetBranchId) return;

    const RagStorage = getRagStorage();
    if (!RagStorage) return;

    const branch = await RagStorage.getBranchById(targetBranchId);
    if (!branch) return;

    const newName = prompt('Editar nombre de la rama:', branch.name);
    if (newName === null || !newName.trim()) return;

    const newDesc = prompt('Editar descripción de la rama:', branch.description || '') ?? branch.description;

    try {
      await RagStorage.updateBranch(branch.id, { name: newName.trim(), description: newDesc.trim() });
      await renderBranchesList();
      await refreshBranchSelector();
    } catch (err) {
      alert(`Error al actualizar rama: ${err?.message || String(err)}`);
    }
  }

  /**
   * Manejador para eliminar una rama en cascada.
   */
  async function handleDeleteBranch(branchId) {
    const targetBranchId = branchId || selectedManageBranchId;
    if (!targetBranchId) return;

    const RagStorage = getRagStorage();
    if (!RagStorage) return;

    const branch = await RagStorage.getBranchById(targetBranchId);
    if (!branch) return;

    const confirmMsg = `${t('rag_confirm_delete_branch') || '¿Estás seguro de que deseas eliminar esta rama?'}\n\nRama: "${branch.name}"`;
    if (!confirm(confirmMsg)) return;

    try {
      await RagStorage.deleteBranch(branch.id);
      if (getActiveChatBranchId() === branch.id) {
        setActiveChatBranchId('');
      }
      if (selectedManageBranchId === branch.id) {
        selectedManageBranchId = null;
      }
      await renderBranchesList();
      await refreshBranchSelector();
    } catch (err) {
      alert(`Error al eliminar rama: ${err?.message || String(err)}`);
    }
  }

  /**
   * Manejador para eliminar un documento individual.
   */
  async function handleDeleteDocument(doc, branchId) {
    const confirmMsg = `${t('rag_confirm_delete_doc') || '¿Estás seguro de que deseas eliminar este documento?'}\n\nDocumento: "${doc.title}"`;
    if (!confirm(confirmMsg)) return;

    const RagStorage = getRagStorage();
    if (!RagStorage) return;

    try {
      await RagStorage.deleteDocument(doc.id);
      await renderManageWorkspace(branchId);
      await renderActiveBranchTab();
    } catch (err) {
      alert(`Error al eliminar documento: ${err?.message || String(err)}`);
    }
  }

  /**
   * Actualiza el indicador visual de uso y cuota de almacenamiento disponible.
   */
  async function updateStorageQuotaDisplay() {
    const quotaElem = document.getElementById('rag-storage-quota-info');
    if (!quotaElem) return;

    const RagStorage = getRagStorage();
    if (!RagStorage || !RagStorage.getStorageEstimate) {
      quotaElem.innerHTML = `<span>💾 Almacenamiento local persistente</span>`;
      return;
    }

    try {
      const estimate = await RagStorage.getStorageEstimate();
      if (estimate && estimate.supported) {
        quotaElem.innerHTML = `<span>💾 ${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)} (${estimate.usagePercent}%)</span>`;
        quotaElem.title = `Espacio libre estimado: ${formatBytes(estimate.available)}`;
      } else {
        quotaElem.innerHTML = `<span>💾 Almacenamiento local persistente</span>`;
      }
    } catch (err) {
      quotaElem.innerHTML = `<span>💾 Almacenamiento local</span>`;
    }
  }

  /**
   * Manejador para exportar una rama a archivo JSON descargable.
   */
  async function handleExportBranch(branchId) {
    const targetBranchId = branchId || selectedManageBranchId;
    if (!targetBranchId) return;

    const RagStorage = getRagStorage();
    if (!RagStorage || !RagStorage.exportBranchToJson) return;

    try {
      const exportData = await RagStorage.exportBranchToJson(targetBranchId);
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (exportData.branch?.name || 'branch').replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
      a.href = url;
      a.download = `${safeName}_rag_branch.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error al exportar rama: ${err?.message || String(err)}`);
    }
  }

  /**
   * Manejador para importar una rama completa desde un archivo JSON.
   */
  async function handleImportBranchFile(file) {
    if (!file) return;
    const RagStorage = getRagStorage();
    if (!RagStorage || !RagStorage.importBranchFromJson) return;

    try {
      const text = await file.text();
      const result = await RagStorage.importBranchFromJson(text);
      selectedManageBranchId = result.branch.id;
      await renderBranchesList();
      await refreshBranchSelector();
      updateStorageQuotaDisplay();
      alert(`✅ Rama "${result.branch.name}" importada con éxito (${result.documentCount} documentos).`);
    } catch (err) {
      alert(`Error al importar rama: ${err?.message || String(err)}`);
    }
  }

  let fallbackActiveBranchId = '';

  /**
   * Obtiene el ID de la rama activa en la conversación actual.
   */
  function getActiveChatBranchId() {
    if (typeof window !== 'undefined' && window.appConfig && window.appConfig.activeRagBranchId !== undefined) {
      return window.appConfig.activeRagBranchId;
    }
    const Storage = getStorage();
    if (Storage && Storage.loadConfig) {
      const cfg = Storage.loadConfig();
      if (cfg && cfg.activeRagBranchId !== undefined) {
        return cfg.activeRagBranchId;
      }
    }
    return fallbackActiveBranchId;
  }

  /**
   * Establece el ID de la rama activa y guarda la configuración.
   */
  function setActiveChatBranchId(branchId) {
    fallbackActiveBranchId = branchId || '';
    if (typeof window !== 'undefined' && window.appConfig) {
      window.appConfig.activeRagBranchId = branchId || '';
    }
    const Storage = getStorage();
    if (Storage && Storage.saveConfig) {
      const cfg = Storage.loadConfig ? Storage.loadConfig() : {};
      cfg.activeRagBranchId = branchId || '';
      Storage.saveConfig(cfg);
    }
    updateToolbarRagButtonStatus();
  }

  /**
   * Inicializa la interfaz de usuario de RAG, vinculando eventos y modales.
   */
  function initTreeRagUI() {
    const btnOpenModal = document.getElementById('btn-open-tree-rag');
    const modalDialog = document.getElementById('tree-rag-modal');
    const btnCloseModal = document.getElementById('btn-close-tree-rag');
    const btnCloseModalFooter = document.getElementById('btn-close-tree-rag-footer');
    const btnNewBranch = document.getElementById('btn-rag-new-branch');
    const btnEditBranch = document.getElementById('btn-rag-edit-branch');
    const btnExportBranch = document.getElementById('btn-rag-export-branch');
    const btnDeleteBranch = document.getElementById('btn-rag-delete-branch');
    const btnImportBranch = document.getElementById('btn-rag-import-branch');
    const importFileInput = document.getElementById('rag-import-file-input');
    const structureDialog = document.getElementById('rag-structure-dialog');
    const btnCloseStructure = document.getElementById('btn-close-rag-structure');

    // Pestañas del modal
    const tabBtns = document.querySelectorAll('#rag-modal-tabs-nav .modal-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.getAttribute('data-rag-tab');
        tabBtns.forEach(b => b.classList.toggle('active', b === btn));
        
        const panes = modalDialog ? modalDialog.querySelectorAll('.modal-tab-pane') : [];
        panes.forEach(pane => {
          pane.classList.toggle('active', pane.id === targetTabId);
        });

        if (targetTabId === 'tab-rag-active') {
          renderActiveBranchTab();
        } else if (targetTabId === 'tab-rag-manage') {
          renderManageTab();
        }
      });
    });

    if (btnOpenModal && modalDialog) {
      btnOpenModal.addEventListener('click', () => {
        renderActiveBranchTab();
        renderManageTab();
        modalDialog.showModal();
      });
    }

    if (btnCloseModal && modalDialog) {
      btnCloseModal.addEventListener('click', () => modalDialog.close());
    }

    if (btnCloseModalFooter && modalDialog) {
      btnCloseModalFooter.addEventListener('click', () => modalDialog.close());
    }

    // Cerrar al hacer clic en el backdrop
    if (modalDialog) {
      modalDialog.addEventListener('click', (e) => {
        if (e.target === modalDialog) modalDialog.close();
      });
    }

    if (structureDialog && btnCloseStructure) {
      btnCloseStructure.addEventListener('click', () => structureDialog.close());
      structureDialog.addEventListener('click', (e) => {
        if (e.target === structureDialog) structureDialog.close();
      });
    }

    if (btnNewBranch) {
      btnNewBranch.addEventListener('click', handleCreateBranch);
    }

    if (btnEditBranch) {
      btnEditBranch.addEventListener('click', () => handleEditBranch());
    }

    if (btnExportBranch) {
      btnExportBranch.addEventListener('click', () => handleExportBranch());
    }

    if (btnDeleteBranch) {
      btnDeleteBranch.addEventListener('click', () => handleDeleteBranch());
    }

    if (btnImportBranch && importFileInput) {
      btnImportBranch.addEventListener('click', () => {
        importFileInput.value = '';
        importFileInput.click();
      });

      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          handleImportBranchFile(file);
        }
      });
    }

    // Carga inicial del estado
    updateToolbarRagButtonStatus();
    updateStorageQuotaDisplay();
  }

  return {
    initTreeRagUI,
    updateToolbarRagButtonStatus,
    refreshBranchSelector,
    renderActiveBranchTab,
    renderManageTab,
    renderBranchesList,
    renderBranchWorkspace,
    renderManageWorkspace,
    openDocumentStructureViewer,
    updateStorageQuotaDisplay,
    handleExportBranch,
    handleImportBranchFile,
    getActiveChatBranchId,
    setActiveChatBranchId
  };
});
