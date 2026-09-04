/** Minimal UI for IndexedDB-backed local knowledge. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatRagUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let activeBranchIds = new Set();
  let initialized = false;

  function storage() {
    if (typeof window !== 'undefined') return window.ChatRagStorage;
    try { return require('./ragStorage.js'); } catch (_) { return null; }
  }
  function ingestion() {
    if (typeof window !== 'undefined') return window.ChatIngestionEngine || window.IngestionEngine;
    try { return require('./ingestionEngine.js'); } catch (_) { return null; }
  }
  function indexer() {
    if (typeof window !== 'undefined') return window.ChatRagIndex;
    try { return require('./rag-index.js'); } catch (_) { return null; }
  }
  function runtimeConfig() {
    return typeof window !== 'undefined' ? window.ChatConfig : null;
  }
  function escapeHtml(value) {
    const markdown = typeof window !== 'undefined' ? window.ChatMarkdown : null;
    return markdown?.escapeHtml ? markdown.escapeHtml(String(value || '')) : String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, exponent)).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
  }

  function t(key, params) {
    if (typeof window !== 'undefined' && window.ChatI18n?.t) {
      return window.ChatI18n.t(key, params);
    }
    return '';
  }

  async function getBranchMetrics(branches) {
    const metrics = await Promise.all((branches || []).map(async branch => {
      const documents = await storage().getDocumentsByBranch(branch.id);
      return [branch.id, {
        documentCount: documents.length,
        totalBytes: documents.reduce((sum, document) => sum + (Number(document.fileSize) || 0), 0)
      }];
    }));
    return new Map(metrics);
  }

  function formatBranchMetrics(metrics) {
    const count = Number(metrics?.documentCount) || 0;
    return `${count} documento${count === 1 ? '' : 's'} de ${formatBytes(metrics?.totalBytes || 0)}`;
  }

  function formatDocumentMetrics(document) {
    const hasImageCount = Number.isInteger(document?.imageCount) && document.imageCount >= 0;
    const images = hasImageCount
      ? `${document.imageCount} ${document.imageCount === 1 ? 'imagen' : 'imágenes'}`
      : 'imágenes: recarga necesaria';
    return `${document?.chunkCount || 0} fragmentos · ${formatBytes(document?.fileSize)} · ${images}`;
  }

  function getActiveBranchIds() {
    return Array.from(activeBranchIds);
  }

  function getActiveBranchId() {
    return activeBranchIds.values().next().value || '';
  }

  function setActiveBranchIds(ids) {
    const list = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    activeBranchIds = new Set(list.map(id => String(id || '').trim()).filter(Boolean));
    const config = runtimeConfig();
    if (config?.updateGeneral) {
      config.updateGeneral({
        activeRagBranchIds: Array.from(activeBranchIds),
        activeRagBranchId: getActiveBranchId()
      });
    }
    updateToolbarStatus();
    return Array.from(activeBranchIds);
  }

  function setActiveBranchId(branchId) {
    if (!branchId) return setActiveBranchIds([]);
    return setActiveBranchIds([branchId]);
  }

  function toggleBranchActive(branchId) {
    const cleanId = String(branchId || '').trim();
    if (!cleanId) return getActiveBranchIds();
    if (activeBranchIds.has(cleanId)) {
      activeBranchIds.delete(cleanId);
    } else {
      activeBranchIds.add(cleanId);
    }
    return setActiveBranchIds(Array.from(activeBranchIds));
  }

  function isBranchActive(branchId) {
    return activeBranchIds.has(String(branchId || '').trim());
  }

  async function updateToolbarStatus() {
    if (typeof document === 'undefined') return;
    const button = document.getElementById('btn-open-rag');
    if (!button) return;
    const count = activeBranchIds.size;
    button.classList.toggle('active', count > 0);
    button.title = count === 0
      ? 'Gestionar conocimiento local'
      : (count === 1 ? 'Conocimiento local activo (1 rama)' : `Conocimiento local activo (${count} ramas)`);
  }

  async function renderActiveTab() {
    if (typeof document === 'undefined') return;
    const branches = await storage().getBranches();
    const branchMetrics = await getBranchMetrics(branches);
    const list = document.getElementById('rag-active-branch-list');
    const title = document.getElementById('rag-active-status-title');
    const description = document.getElementById('rag-active-status-desc');
    const toggle = document.getElementById('btn-rag-toggle-master');
    const activeList = branches.filter(branch => activeBranchIds.has(branch.id));
    const activeCount = activeList.length;

    if (title) {
      if (activeCount === 0) title.textContent = 'Conocimiento desactivado';
      else if (activeCount === 1) title.textContent = activeList[0].name;
      else title.textContent = `${activeCount} ramas activas (${activeList.map(b => b.name).join(', ')})`;
    }
    if (description) {
      if (activeCount === 0) description.textContent = 'Selecciona una o varias ramas para que el agente pueda buscar en tus documentos.';
      else if (activeCount === 1) description.textContent = 'El agente puede buscar fragmentos de esta rama mediante Orama.';
      else description.textContent = `El agente consultará en paralelo las ${activeCount} ramas activas en cada búsqueda.`;
    }
    if (toggle) {
      toggle.disabled = activeCount === 0;
      toggle.textContent = 'Desactivar todas';
    }
    if (!list) return;
    if (!branches.length) {
      list.innerHTML = '<div class="rag-empty-state">No hay ramas. Crea la primera en la pestaña Documentos.</div>';
      return;
    }
    list.innerHTML = branches.map(branch => {
      const isActive = activeBranchIds.has(branch.id);
      const metrics = branchMetrics.get(branch.id);
      return `
      <button type="button" class="setting-toggle-card rag-branch-select-card${isActive ? ' active' : ''}" data-branch-id="${escapeHtml(branch.id)}">
        <span class="toggle-card-info"><strong>${escapeHtml(branch.name)}</strong><span class="toggle-card-desc">${escapeHtml(branch.description || 'Sin descripción')}</span><span class="rag-branch-metrics">Esta rama cargó ${escapeHtml(formatBranchMetrics(metrics))}</span></span>
        <span class="rag-branch-badge-status">${isActive ? '✓ Activa' : '+ Activar'}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('[data-branch-id]').forEach(button => button.addEventListener('click', async () => {
      toggleBranchActive(button.dataset.branchId);
      await renderActiveTab();
    }));
  }

  function progressMarkup(event) {
    return `<div class="rag-ingestion-progress-item ${event.status === 'error' ? 'error' : ''}"><strong>${escapeHtml(event.fileName)}</strong><span>${escapeHtml(event.message)}</span><progress max="100" value="${Number(event.percent) || 0}"></progress></div>`;
  }

  function globalProgressMarkup(event) {
    const total = Number(event.totalFiles) || 0;
    const finished = Number(event.finishedFiles) || 0;
    const processed = Number(event.processedFiles) || 0;
    const failed = Number(event.failedFiles) || 0;
    const overallPercent = Math.round(Number(event.overallPercent) || 0);
    const status = failed
      ? `${processed} indexados · ${failed} con error`
      : `${processed} indexados`;
    return `<div class="rag-ingestion-global-progress"><div><strong>Carga global: ${finished} de ${total}</strong><span>${status}</span></div><progress max="100" value="${overallPercent}"></progress><span>${overallPercent}%</span></div>`;
  }

  function syncFooterSummaryVisibility(isManage) {
    const el = document.getElementById('rag-branch-summary-footer');
    const sep = document.getElementById('rag-footer-separator');
    const active = typeof isManage === 'boolean'
      ? isManage
      : !!document.querySelector('#rag-modal-tabs-nav [data-rag-tab="tab-rag-manage"]')?.classList.contains('active');
    const hasText = !!(el && el.textContent.trim());
    if (el) el.style.display = (active && hasText) ? '' : 'none';
    if (sep) sep.style.display = (active && hasText) ? '' : 'none';
  }

  function updateBranchSummaryFooter(metrics) {
    const el = document.getElementById('rag-branch-summary-footer');
    if (!el) return;
    if (metrics) {
      el.innerHTML = `Esta rama cargó <strong>${escapeHtml(formatBranchMetrics(metrics))}</strong>.`;
    } else {
      el.innerHTML = '';
    }
    syncFooterSummaryVisibility();
  }

  async function renderWorkspace(branchId) {
    if (typeof document === 'undefined') return;
    await updateBranchFields(branchId);
    const workspace = document.getElementById('rag-manage-workspace');
    if (!workspace) return;
    if (!branchId) {
      workspace.innerHTML = '<div class="rag-empty-state">Escribe un nombre arriba y pulsa "Crear rama" para empezar.</div>';
      updateBranchSummaryFooter(null);
      return;
    }
    const documents = await storage().getDocumentsByBranch(branchId);
    const branchMetrics = {
      documentCount: documents.length,
      totalBytes: documents.reduce((sum, document) => sum + (Number(document.fileSize) || 0), 0)
    };
    updateBranchSummaryFooter(branchMetrics);
    workspace.innerHTML = `
      <label class="rag-dropzone" id="rag-dropzone">
        <strong>Arrastra o selecciona archivos</strong>
        <span>PDF, Markdown o texto · guardado privado en IndexedDB</span>
        <input id="rag-file-input" type="file" accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf" multiple hidden>
      </label>
      <div id="rag-ingestion-progress"></div>
      <div class="rag-documents-list">${documents.length ? documents.map(document => `
        <div class="rag-document-card" data-document-id="${escapeHtml(document.id)}">
          <div><strong>${escapeHtml(document.title)}</strong><div class="toggle-card-desc">${formatDocumentMetrics(document)}</div></div>
          <button type="button" class="btn-secondary btn-danger-hover" data-delete-document="${escapeHtml(document.id)}" title="Eliminar documento"><svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>`).join('') : '<div class="rag-empty-state">La rama todavía no contiene documentos.</div>'}</div>`;

    const input = document.getElementById('rag-file-input');
    const dropzone = document.getElementById('rag-dropzone');
    const handleFiles = files => ingestFiles(Array.from(files || []), branchId);
    if (input) input.addEventListener('change', () => handleFiles(input.files));
    if (dropzone) {
      dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('drag-over'); });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
      dropzone.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('drag-over'); handleFiles(event.dataTransfer.files); });
    }
    workspace.querySelectorAll('[data-delete-document]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este documento y todos sus fragmentos?')) return;
      await storage().deleteDocument(button.dataset.deleteDocument);
      indexer()?.invalidateBranch(branchId);
      await renderWorkspace(branchId);
      await updateQuota();
    }));
  }

  async function ingestFiles(files, branchId) {
    if (!files.length) return;
    const container = document.getElementById('rag-ingestion-progress');
    const events = new Map();
    await ingestion().processDocumentQueue(files, branchId, event => {
      events.set(event.fileIndex, event);
      if (container) {
        const recentEvents = Array.from(events.values()).slice(-12).reverse();
        container.innerHTML = `${globalProgressMarkup(event)}<div class="rag-ingestion-progress-recent">${recentEvents.map(progressMarkup).join('')}</div>`;
      }
    });
    await renderWorkspace(branchId);
    await updateQuota();
  }

  async function renderManageTab(preferredBranchId) {
    if (typeof document === 'undefined') return;
    const branches = await storage().getBranches();
    const branchMetrics = await getBranchMetrics(branches);
    const select = document.getElementById('rag-manage-branch-select');
    if (!select) return;
    const selected = preferredBranchId || select.value || branches[0]?.id || '';
    select.innerHTML = branches.map(branch => `<option value="${escapeHtml(branch.id)}"${branch.id === selected ? ' selected' : ''}>${escapeHtml(branch.name)} (${escapeHtml(formatBranchMetrics(branchMetrics.get(branch.id)))})</option>`).join('');
    select.disabled = !branches.length;
    await renderWorkspace(selected);
  }

  const SVG_PLUS = `<svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  const SVG_SAVE = `<svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;

  let isCreatingBranch = false;
  let loadedBranchName = '';
  let loadedBranchDesc = '';
  let currentButtonMode = 'new';

  function setNewBranchButtonMode(mode) {
    currentButtonMode = mode;
    const btn = document.getElementById('btn-rag-new-branch');
    const icon = document.getElementById('rag-new-branch-icon');
    const text = document.getElementById('rag-new-branch-text');
    if (!btn || !text) return;

    if (mode === 'save') {
      if (icon) icon.innerHTML = SVG_SAVE;
      text.textContent = t('rag_btn_save') || 'Guardar';
      btn.setAttribute('title', t('rag_btn_save') || 'Guardar');
    } else {
      if (icon) icon.innerHTML = SVG_PLUS;
      text.textContent = t('rag_new_branch') || 'Nueva rama';
      btn.setAttribute('title', t('rag_new_branch') || 'Nueva rama');
    }
  }

  function checkBranchInputsChanged() {
    const nameInput = document.getElementById('rag-branch-name-input');
    const descInput = document.getElementById('rag-branch-desc-input');
    const currentName = nameInput?.value?.trim() || '';
    const currentDesc = descInput?.value?.trim() || '';

    if (isCreatingBranch) {
      setNewBranchButtonMode('save');
      return;
    }

    const hasChanged = currentName !== loadedBranchName.trim() || currentDesc !== (loadedBranchDesc || '').trim();
    setNewBranchButtonMode(hasChanged ? 'save' : 'new');
  }

  async function updateBranchFields(branchId) {
    if (typeof document === 'undefined') return;
    const nameInput = document.getElementById('rag-branch-name-input');
    const descInput = document.getElementById('rag-branch-desc-input');
    const feedback = document.getElementById('rag-branch-feedback');
    if (feedback) feedback.style.display = 'none';

    if (!branchId) {
      isCreatingBranch = true;
      loadedBranchName = '';
      loadedBranchDesc = '';
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      setNewBranchButtonMode('new');
      return;
    }

    isCreatingBranch = false;
    const branch = await storage().getBranchById(branchId);
    loadedBranchName = branch?.name || '';
    loadedBranchDesc = branch?.description || '';
    if (nameInput) nameInput.value = loadedBranchName;
    if (descInput) descInput.value = loadedBranchDesc;
    setNewBranchButtonMode('new');
  }

  async function handleNewBranchButtonClick() {
    if (currentButtonMode === 'save') {
      await saveOrUpdateBranch();
    } else {
      prepareNewBranch();
    }
  }

  function prepareNewBranch() {
    isCreatingBranch = true;
    loadedBranchName = '';
    loadedBranchDesc = '';
    const nameInput = document.getElementById('rag-branch-name-input');
    const descInput = document.getElementById('rag-branch-desc-input');
    const feedback = document.getElementById('rag-branch-feedback');
    if (feedback) feedback.style.display = 'none';

    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
    if (descInput) descInput.value = '';
    setNewBranchButtonMode('save');
  }

  function showBranchFeedback(msg, type = 'success') {
    const el = document.getElementById('rag-branch-feedback');
    if (!el) return;
    el.style.display = 'block';
    el.className = `server-query-status status-${type}`;
    el.textContent = msg;
    setTimeout(() => {
      if (el) el.style.display = 'none';
    }, 4000);
  }

  async function saveOrUpdateBranch() {
    const nameInput = document.getElementById('rag-branch-name-input');
    const descInput = document.getElementById('rag-branch-desc-input');
    const name = nameInput?.value?.trim();
    const description = descInput?.value?.trim() || '';

    if (!name) {
      showBranchFeedback(t('rag_branch_name_empty') || 'Por favor, escribe un nombre para la rama.', 'error');
      nameInput?.focus();
      return;
    }

    if (isCreatingBranch) {
      const branch = await storage().createBranch(name, description);
      isCreatingBranch = false;
      await renderManageTab(branch.id);
      await renderActiveTab();
      setNewBranchButtonMode('new');
      showBranchFeedback(t('rag_branch_created', { name }) || `Rama "${name}" creada con éxito.`, 'success');
    } else {
      const select = document.getElementById('rag-manage-branch-select');
      const id = select?.value;
      if (!id) {
        const branch = await storage().createBranch(name, description);
        isCreatingBranch = false;
        await renderManageTab(branch.id);
        await renderActiveTab();
        setNewBranchButtonMode('new');
        showBranchFeedback(t('rag_branch_created', { name }) || `Rama "${name}" creada con éxito.`, 'success');
        return;
      }
      await storage().updateBranch(id, { name, description });
      loadedBranchName = name;
      loadedBranchDesc = description;
      await renderManageTab(id);
      await renderActiveTab();
      setNewBranchButtonMode('new');
      showBranchFeedback(t('rag_branch_updated', { name }) || `Rama "${name}" guardada con éxito.`, 'success');
    }
  }

  function editBranch() {
    const nameInput = document.getElementById('rag-branch-name-input');
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }

  async function deleteBranch() {
    const select = document.getElementById('rag-manage-branch-select');
    const id = select?.value;
    if (!id || !confirm('¿Eliminar la rama y todos sus documentos?')) return;
    await storage().deleteBranch(id);
    indexer()?.invalidateBranch(id);
    if (activeBranchIds.has(id)) {
      activeBranchIds.delete(id);
      setActiveBranchIds(Array.from(activeBranchIds));
    }
    await renderManageTab();
    await renderActiveTab();
    await updateQuota();
  }

  async function isGzipBlob(blob) {
    try {
      if (!blob || blob.size < 2) return false;
      const slice = blob.slice(0, 2);
      const buf = await slice.arrayBuffer();
      const bytes = new Uint8Array(buf);
      return bytes[0] === 0x1F && bytes[1] === 0x8B;
    } catch (_) {
      return false;
    }
  }

  async function decompressFileIfNeeded(file) {
    if (!file) return '';
    const isGz = file.name?.toLowerCase().endsWith('.gz') || await isGzipBlob(file);
    if (isGz && typeof DecompressionStream !== 'undefined') {
      const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    }
    return await file.text();
  }

  async function exportBranch() {
    const select = document.getElementById('rag-manage-branch-select');
    const branchId = select?.value;
    if (!branchId) return;

    const btnExport = document.getElementById('btn-rag-export-branch');
    const prevHtml = btnExport?.innerHTML;
    try {
      if (btnExport) {
        btnExport.disabled = true;
        btnExport.textContent = 'Exportando 0%...';
      }
      const { blob, filename } = await storage().exportBranchBlob(branchId, {
        compress: true,
        onProgress: ({ current, total, percent }) => {
          if (btnExport) btnExport.textContent = `Exportando ${percent}% (${current}/${total})...`;
        }
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (btnExport) btnExport.textContent = '¡Exportado!';
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      alert(`Error al exportar la rama: ${error.message || error}`);
    } finally {
      if (btnExport) {
        btnExport.disabled = false;
        if (prevHtml) btnExport.innerHTML = prevHtml;
      }
    }
  }

  async function importBranchFile(file) {
    if (!file) return null;
    const btnImport = document.getElementById('btn-rag-import-branch');
    const prevHtml = btnImport?.innerHTML;
    try {
      if (btnImport) {
        btnImport.disabled = true;
        btnImport.textContent = 'Descomprimiendo...';
      }
      let text;
      try {
        text = await decompressFileIfNeeded(file);
      } catch (err) {
        if (err.name === 'RangeError' || err.code === 'ERR_STRING_TOO_LONG' || String(err).includes('string')) {
          throw new Error('El archivo supera el límite de memoria del navegador (512 MB). Utiliza el respaldo ligero optimizado.');
        }
        throw err;
      }
      if (!text) throw new Error('El archivo de respaldo está vacío o no se pudo leer.');
      if (btnImport) btnImport.textContent = 'Restaurando 0%...';

      const branch = await storage().importBranch(text, ({ current, total, percent }) => {
        if (btnImport) btnImport.textContent = `Restaurando ${percent}% (${current}/${total})...`;
      });
      indexer()?.invalidateBranch(branch.id);
      await renderManageTab(branch.id);
      await renderActiveTab();
      await updateQuota();
      alert(`Rama "${branch.name}" restaurada con éxito.`);
      return branch;
    } catch (error) {
      alert(`Error al restaurar: ${error.message || error}`);
      throw error;
    } finally {
      if (btnImport) {
        btnImport.disabled = false;
        if (prevHtml) btnImport.innerHTML = prevHtml;
      }
    }
  }

  async function updateQuota() {
    if (typeof document === 'undefined') return;
    const node = document.getElementById('rag-storage-quota-info');
    const estimate = await storage().getStorageEstimate();
    const dbIcon = '<svg class="ui-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>';
    if (node) node.innerHTML = estimate.quota ? `${dbIcon} <span>IndexedDB: ${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)}</span>` : `${dbIcon} <span>IndexedDB local</span>`;
  }

  async function refresh() {
    await renderActiveTab();
    await renderManageTab();
    await updateQuota();
    await updateToolbarStatus();
  }

  function initRagUI() {
    if (initialized || typeof document === 'undefined') return;
    initialized = true;
    const cfg = runtimeConfig()?.getActive?.() || {};
    if (Array.isArray(cfg.activeRagBranchIds) && cfg.activeRagBranchIds.length > 0) {
      activeBranchIds = new Set(cfg.activeRagBranchIds.map(String).filter(Boolean));
    } else if (cfg.activeRagBranchId) {
      activeBranchIds = new Set([String(cfg.activeRagBranchId)]);
    } else {
      activeBranchIds = new Set();
    }
    const modal = document.getElementById('rag-modal');
    document.getElementById('btn-open-rag')?.addEventListener('click', async () => {
      await refresh();
      const navButtons = document.querySelectorAll('#rag-modal-tabs-nav [data-rag-tab]');
      const activeBtn = Array.from(navButtons).find(b => b.classList.contains('active')) || navButtons[0];
      if (activeBtn) {
        navButtons.forEach(item => item.classList.toggle('active', item === activeBtn));
        document.querySelectorAll('#rag-modal .modal-tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === activeBtn.dataset.ragTab));
        syncFooterSummaryVisibility(activeBtn.dataset.ragTab === 'tab-rag-manage');
        if (activeBtn.dataset.ragTab === 'tab-rag-manage') await renderManageTab();
      }
      modal?.showModal();
    });
    document.getElementById('btn-close-rag')?.addEventListener('click', () => modal?.close());
    document.getElementById('btn-close-rag-footer')?.addEventListener('click', () => modal?.close());
    document.getElementById('btn-rag-toggle-master')?.addEventListener('click', async () => { setActiveBranchIds([]); await renderActiveTab(); });
    document.getElementById('btn-rag-activate-all')?.addEventListener('click', async () => {
      const branches = await storage().getBranches();
      setActiveBranchIds(branches.map(b => b.id));
      await renderActiveTab();
    });
    document.getElementById('btn-rag-new-branch')?.addEventListener('click', handleNewBranchButtonClick);
    document.getElementById('btn-rag-edit-branch')?.addEventListener('click', editBranch);

    document.getElementById('rag-branch-name-input')?.addEventListener('input', checkBranchInputsChanged);
    document.getElementById('rag-branch-desc-input')?.addEventListener('input', checkBranchInputsChanged);

    const handleBranchKeyEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveOrUpdateBranch();
      }
    };
    document.getElementById('rag-branch-name-input')?.addEventListener('keydown', handleBranchKeyEnter);
    document.getElementById('rag-branch-desc-input')?.addEventListener('keydown', handleBranchKeyEnter);

    document.getElementById('btn-rag-delete-branch')?.addEventListener('click', deleteBranch);
    document.getElementById('btn-rag-export-branch')?.addEventListener('click', () => exportBranch().catch(error => alert(error.message)));
    const importInput = document.getElementById('rag-import-input');
    document.getElementById('btn-rag-import-branch')?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', async () => {
      try { await importBranchFile(importInput.files?.[0]); }
      catch (error) { alert(error.message); }
      finally { importInput.value = ''; }
    });
    document.getElementById('rag-manage-branch-select')?.addEventListener('change', event => renderWorkspace(event.target.value));
    document.querySelectorAll('[data-rag-tab]').forEach(button => button.addEventListener('click', async () => {
      document.querySelectorAll('[data-rag-tab]').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('#rag-modal .modal-tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === button.dataset.ragTab));
      const isManage = button.dataset.ragTab === 'tab-rag-manage';
      syncFooterSummaryVisibility(isManage);
      if (isManage) await renderManageTab();
    }));
    updateToolbarStatus();
  }

  return {
    initRagUI, refresh, renderActiveTab, renderManageTab,
    getActiveBranchId, setActiveBranchId,
    getActiveBranchIds, setActiveBranchIds, toggleBranchActive, isBranchActive,
    updateToolbarStatus, exportBranch, importBranchFile
  };
});
