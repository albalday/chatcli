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
  function configStorage() {
    return typeof window !== 'undefined' ? window.ChatStorage : null;
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
    return `${count} documento${count === 1 ? '' : 's'} · ${formatBytes(metrics?.totalBytes || 0)}`;
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
    const store = configStorage();
    if (store?.saveConfig) {
      store.saveConfig({
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
      else if (activeCount === 1) title.textContent = `🔎 ${activeList[0].name}`;
      else title.textContent = `🔎 ${activeCount} ramas activas (${activeList.map(b => b.name).join(', ')})`;
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
        <span class="toggle-card-info"><strong>${escapeHtml(branch.name)}</strong><span class="toggle-card-desc">${escapeHtml(branch.description || 'Sin descripción')}</span><span class="rag-branch-metrics">${escapeHtml(formatBranchMetrics(metrics))}</span></span>
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

  async function renderWorkspace(branchId) {
    if (typeof document === 'undefined') return;
    const workspace = document.getElementById('rag-manage-workspace');
    if (!workspace) return;
    if (!branchId) {
      workspace.innerHTML = '<div class="rag-empty-state">Crea una rama para añadir documentos.</div>';
      return;
    }
    const documents = await storage().getDocumentsByBranch(branchId);
    const branchSummary = formatBranchMetrics({
      documentCount: documents.length,
      totalBytes: documents.reduce((sum, document) => sum + (Number(document.fileSize) || 0), 0)
    });
    workspace.innerHTML = `
      <div class="rag-workspace-summary">Esta rama contiene <strong>${escapeHtml(branchSummary)}</strong>.</div>
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

  async function createBranch() {
    const name = prompt('Nombre de la nueva rama:');
    if (!name?.trim()) return;
    const description = prompt('Descripción opcional:') || '';
    const branch = await storage().createBranch(name.trim(), description.trim());
    await renderManageTab(branch.id);
    await renderActiveTab();
  }

  async function editBranch() {
    const select = document.getElementById('rag-manage-branch-select');
    const branch = await storage().getBranchById(select?.value);
    if (!branch) return;
    const name = prompt('Nombre de la rama:', branch.name);
    if (!name?.trim()) return;
    const description = prompt('Descripción:', branch.description) ?? branch.description;
    await storage().updateBranch(branch.id, { name: name.trim(), description: description.trim() });
    await renderManageTab(branch.id);
    await renderActiveTab();
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
    const prevText = btnExport?.textContent;
    try {
      if (btnExport) {
        btnExport.disabled = true;
        btnExport.textContent = '⏳ Exportando 0%...';
      }
      const { blob, filename } = await storage().exportBranchBlob(branchId, {
        includeSources: false,
        compress: true,
        onProgress: ({ current, total, percent }) => {
          if (btnExport) btnExport.textContent = `⏳ Exportando ${percent}% (${current}/${total})...`;
        }
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (btnExport) btnExport.textContent = '✅ ¡Exportado!';
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      alert(`Error al exportar la rama: ${error.message || error}`);
    } finally {
      if (btnExport) {
        btnExport.disabled = false;
        btnExport.textContent = prevText || '⬇️ Respaldo';
      }
    }
  }

  async function importBranchFile(file) {
    if (!file) return null;
    const btnImport = document.getElementById('btn-rag-import-branch');
    const prevText = btnImport?.textContent;
    try {
      if (btnImport) {
        btnImport.disabled = true;
        btnImport.textContent = '⏳ Descomprimiendo...';
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
      if (btnImport) btnImport.textContent = '⏳ Restaurando 0%...';

      const branch = await storage().importBranch(text, ({ current, total, percent }) => {
        if (btnImport) btnImport.textContent = `⏳ Restaurando ${percent}% (${current}/${total})...`;
      });
      indexer()?.invalidateBranch(branch.id);
      await renderManageTab(branch.id);
      await renderActiveTab();
      await updateQuota();
      alert(`✅ Rama "${branch.name}" restaurada con éxito.`);
      return branch;
    } catch (error) {
      alert(`Error al restaurar: ${error.message || error}`);
      throw error;
    } finally {
      if (btnImport) {
        btnImport.disabled = false;
        btnImport.textContent = prevText || '⬆️ Restaurar';
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
    const cfg = configStorage()?.loadConfig?.() || {};
    if (Array.isArray(cfg.activeRagBranchIds) && cfg.activeRagBranchIds.length > 0) {
      activeBranchIds = new Set(cfg.activeRagBranchIds.map(String).filter(Boolean));
    } else if (cfg.activeRagBranchId) {
      activeBranchIds = new Set([String(cfg.activeRagBranchId)]);
    } else {
      activeBranchIds = new Set();
    }
    const modal = document.getElementById('rag-modal');
    document.getElementById('btn-open-rag')?.addEventListener('click', async () => { await refresh(); modal?.showModal(); });
    document.getElementById('btn-close-rag')?.addEventListener('click', () => modal?.close());
    document.getElementById('btn-close-rag-footer')?.addEventListener('click', () => modal?.close());
    document.getElementById('btn-rag-toggle-master')?.addEventListener('click', async () => { setActiveBranchIds([]); await renderActiveTab(); });
    document.getElementById('btn-rag-activate-all')?.addEventListener('click', async () => {
      const branches = await storage().getBranches();
      setActiveBranchIds(branches.map(b => b.id));
      await renderActiveTab();
    });
    document.getElementById('btn-rag-new-branch')?.addEventListener('click', createBranch);
    document.getElementById('btn-rag-edit-branch')?.addEventListener('click', editBranch);
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
      if (button.dataset.ragTab === 'tab-rag-manage') await renderManageTab();
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
