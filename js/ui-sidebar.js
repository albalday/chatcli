/**
 * Módulo de Interfaz de Usuario para Barra Lateral y Gestión de Sesiones de Chat.
 * ZeroChat - js/ui-sidebar.js
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatUISidebar = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getI18n() {
    return (typeof window !== 'undefined' && window.ChatI18n)
      ? window.ChatI18n
      : (typeof require !== 'undefined' ? (function () { try { return require('./i18n.js'); } catch (e) { return null; } })() : null);
  }

  function getMarkdown() {
    return (typeof window !== 'undefined' && window.ChatMarkdown)
      ? window.ChatMarkdown
      : (typeof require !== 'undefined' ? (function () { try { return require('./markdown.js'); } catch (e) { return null; } })() : null);
  }

  function t(key, params) {
    const I18n = getI18n();
    if (I18n && typeof I18n.t === 'function') return I18n.t(key, params);
    return key;
  }

  function escapeHtml(str) {
    const Markdown = getMarkdown();
    if (Markdown && typeof Markdown.escapeHtml === 'function') {
      return Markdown.escapeHtml(str);
    }
    return String(str || '').replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
  }

  function toggleSidebar(elements) {
    if (!elements || !elements.chatSidebar) return;
    const isHidden = elements.chatSidebar.style.display === 'none' || !elements.chatSidebar.style.display;
    elements.chatSidebar.style.display = isHidden ? 'flex' : 'none';
    if (elements.btnToggleSidebar) {
      elements.btnToggleSidebar.style.display = isHidden ? 'none' : 'inline-flex';
    }
  }

  function openSidebar(elements) {
    if (!elements || !elements.chatSidebar) return;
    elements.chatSidebar.style.display = 'flex';
    if (elements.btnToggleSidebar) {
      elements.btnToggleSidebar.style.display = 'none';
    }
  }

  function closeSidebar(elements) {
    if (!elements || !elements.chatSidebar) return;
    elements.chatSidebar.style.display = 'none';
    if (elements.btnToggleSidebar) {
      elements.btnToggleSidebar.style.display = 'inline-flex';
    }
  }

  function filterSessions(sessions, filterText = '') {
    if (!Array.isArray(sessions)) return [];
    const filter = String(filterText || '').toLowerCase().trim();
    if (!filter) return sessions;
    return sessions.filter(s => {
      if (s.title && s.title.toLowerCase().includes(filter)) return true;
      return false;
    });
  }

  function renderSidebarChats(elements, savedSessions, currentSessionId, callbacks = {}) {
    if (!elements || !elements.sidebarChatsList) return;
    elements.sidebarChatsList.innerHTML = '';

    const filterText = elements.sidebarSearchInput ? elements.sidebarSearchInput.value : '';
    const matching = filterSessions(savedSessions, filterText);

    const doc = elements.sidebarChatsList.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    if (matching.length === 0) {
      const emptyDiv = doc.createElement('div');
      emptyDiv.className = 'sidebar-no-chats';
      emptyDiv.style.cssText = 'padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;';
      emptyDiv.textContent = t('sidebar_no_chats');
      elements.sidebarChatsList.appendChild(emptyDiv);
      return;
    }

    matching.forEach(s => {
      const item = doc.createElement('div');
      item.className = 'sidebar-chat-item' + (s.id === currentSessionId ? ' active' : '');
      item.setAttribute('data-session-id', s.id);

      const d = new Date(s.updatedAt || s.createdAt || Date.now());
      const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const rawTitle = s.title || t('chat_untitled') || 'Nueva conversación';
      const safeTitle = escapeHtml(rawTitle);

      item.innerHTML = `
        <div class="sidebar-chat-info">
          <span class="sidebar-chat-title" title="${safeTitle}">${safeTitle}</span>
          <span class="sidebar-chat-time">${timeStr}</span>
        </div>
        <div class="sidebar-chat-actions">
          <button type="button" class="btn-chat-action btn-rename" title="Renombrar chat">✏️</button>
          <button type="button" class="btn-chat-action btn-delete" title="Eliminar chat">🗑️</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.sidebar-chat-actions')) return;
        if (typeof callbacks.onSwitchSession === 'function') {
          callbacks.onSwitchSession(s.id);
        }
      });

      const btnRename = item.querySelector('.btn-rename');
      if (btnRename) {
        btnRename.addEventListener('click', (e) => {
          if (typeof callbacks.onRenameSession === 'function') {
            callbacks.onRenameSession(s.id, e);
          }
        });
      }

      const btnDelete = item.querySelector('.btn-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
          if (typeof callbacks.onDeleteSession === 'function') {
            callbacks.onDeleteSession(s.id, e);
          }
        });
      }

      elements.sidebarChatsList.appendChild(item);
    });
  }

  return {
    toggleSidebar,
    openSidebar,
    closeSidebar,
    filterSessions,
    renderSidebarChats
  };
});
