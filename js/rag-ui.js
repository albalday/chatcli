/** Minimal UI for IndexedDB-backed local knowledge. */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = factory();
  else root.ChatRagUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let activeBranchId = '';
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

  function getActiveBranchId() { return activeBranchId; }
  function setActiveBranchId(branchId) {
    activeBranchId = String(branchId || '');
    const store = configStorage();
    if (store?.saveConfig) store.saveConfig({ activeRagBranchId: activeBranchId });
    updateToolbarStatus();
    return activeBranchId;
  }

  async function updateToolbarStatus() {
    if (typeof document === 'undefined') return;
    const button = document.getElementById('btn-open-rag');
    if (!button) return;
    button.classList.toggle('active', Boolean(activeBranchId));
    button.title = activeBranchId ? 'Conocimiento local activo' : 'Gestionar conocimiento local';
  }

  async function renderActiveTab() {
    if (typeof document === 'undefined') return;
    const branches = await storage().getBranches();
    const list = document.getElementById('rag-active-branch-list');
    const title = document.getElementById('rag-active-status-title');
    const description = document.getElementById('rag-active-status-desc');
    const toggle = document.getElementById('btn-rag-toggle-master');
    const active = branches.find(branch => branch.id === activeBranchId);
    if (title) title.textContent = active ? `🔎 ${active.name}` : 'Conocimiento desactivado';
    if (description) description.textContent = active ? 'El agente puede buscar fragmentos de esta rama mediante Orama.' : 'Selecciona una rama para activar la búsqueda local.';
    if (toggle) { toggle.disabled = !active; toggle.textContent = 'Desactivar'; }
    if (!list) return;
    if (!branches.length) {
      list.innerHTML = '<div class="rag-empty-state">No hay ramas. Crea la primera en la pestaña Documentos.</div>';
      return;
    }
    list.innerHTML = branches.map(branch => `
      <button type="button" class="setting-toggle-card rag-branch-select-card${branch.id === activeBranchId ? ' active' : ''}" data-branch-id="${escapeHtml(branch.id)}">
        <span class="toggle-card-info"><strong>${escapeHtml(branch.name)}</strong><span class="toggle-card-desc">${escapeHtml(branch.description || 'Sin descripción')}</span></span>
        <span>${branch.id === activeBranchId ? '✓ Activa' : 'Activar'}</span>
      </button>`).join('');
    list.querySelectorAll('[data-branch-id]').forEach(button => button.addEventListener('click', async () => {
      setActiveBranchId(button.dataset.branchId);
      await renderActiveTab();
    }));
  }

  function progressMarkup(event) {
    return `<div class="rag-ingestion-progress-item ${event.status === 'error' ? 'error' : ''}"><strong>${escapeHtml(event.fileName)}</strong><span>${escapeHtml(event.message)}</span><progress max="100" value="${Number(event.percent) || 0}"></progress></div>`;
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
    workspace.innerHTML = `
      <label class="rag-dropzone" id="rag-dropzone">
        <strong>Arrastra o selecciona archivos</strong>
        <span>PDF, Markdown o texto · guardado privado en IndexedDB</span>
        <input id="rag-file-input" type="file" accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf" multiple hidden>
      </label>
      <div id="rag-ingestion-progress"></div>
      <div class="rag-documents-list">${documents.length ? documents.map(document => `
        <div class="rag-document-card" data-document-id="${escapeHtml(document.id)}">
          <div><strong>${escapeHtml(document.title)}</strong><div class="toggle-card-desc">${document.chunkCount} fragmentos · ${formatBytes(document.fileSize)}</div></div>
          <button type="button" class="btn-secondary btn-danger-hover" data-delete-document="${escapeHtml(document.id)}">🗑️</button>
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
      if (container) container.innerHTML = Array.from(events.values()).map(progressMarkup).join('');
    });
    await renderWorkspace(branchId);
    await updateQuota();
  }

  async function renderManageTab(preferredBranchId) {
    if (typeof document === 'undefined') return;
    const branches = await storage().getBranches();
    const select = document.getElementById('rag-manage-branch-select');
    if (!select) return;
    const selected = preferredBranchId || select.value || branches[0]?.id || '';
    select.innerHTML = branches.map(branch => `<option value="${escapeHtml(branch.id)}"${branch.id === selected ? ' selected' : ''}>${escapeHtml(branch.name)}</option>`).join('');
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
    if (activeBranchId === id) setActiveBranchId('');
    await renderManageTab();
    await renderActiveTab();
    await updateQuota();
  }

  async function exportBranch() {
    const select = document.getElementById('rag-manage-branch-select');
    const branchId = select?.value;
    if (!branchId) return;
    const backup = await storage().exportBranch(branchId);
    const safeName = String(backup.branch.name || 'conocimiento').normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'conocimiento';
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}.zerochat-knowledge.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBranchFile(file) {
    if (!file) return null;
    const branch = await storage().importBranch(await file.text());
    indexer()?.invalidateBranch(branch.id);
    await renderManageTab(branch.id);
    await renderActiveTab();
    await updateQuota();
    return branch;
  }

  async function updateQuota() {
    if (typeof document === 'undefined') return;
    const node = document.getElementById('rag-storage-quota-info');
    const estimate = await storage().getStorageEstimate();
    if (node) node.textContent = estimate.quota ? `💾 IndexedDB: ${formatBytes(estimate.usage)} de ${formatBytes(estimate.quota)}` : '💾 IndexedDB local';
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
    activeBranchId = configStorage()?.loadConfig?.()?.activeRagBranchId || '';
    const modal = document.getElementById('rag-modal');
    document.getElementById('btn-open-rag')?.addEventListener('click', async () => { await refresh(); modal?.showModal(); });
    document.getElementById('btn-close-rag')?.addEventListener('click', () => modal?.close());
    document.getElementById('btn-close-rag-footer')?.addEventListener('click', () => modal?.close());
    document.getElementById('btn-rag-toggle-master')?.addEventListener('click', async () => { setActiveBranchId(''); await renderActiveTab(); });
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
    getActiveBranchId, setActiveBranchId, updateToolbarStatus, exportBranch, importBranchFile
  };
});
