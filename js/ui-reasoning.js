/**
 * Módulo de Interfaz de Usuario para Selección de Razonamiento (Thinking / CoT).
 * ZeroChat - js/ui-reasoning.js
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.ChatUIReasoning = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getI18n() {
    return (typeof window !== 'undefined' && window.ChatI18n)
      ? window.ChatI18n
      : (typeof require !== 'undefined' ? (function () { try { return require('./i18n.js'); } catch (e) { return null; } })() : null);
  }

  function getApi() {
    return (typeof window !== 'undefined' && window.ChatAPI)
      ? window.ChatAPI
      : (typeof require !== 'undefined' ? (function () { try { return require('./api.js'); } catch (e) { return null; } })() : null);
  }

  function t(key, params) {
    const I18n = getI18n();
    if (I18n && typeof I18n.t === 'function') return I18n.t(key, params);
    return key;
  }

  function getReasoningLevelLabel(lvl) {
    const lower = String(lvl).toLowerCase().trim();
    switch (lower) {
      case 'off':
      case 'none':
        return { icon: '⚪', label: t('reasoning_level_none'), desc: t('reasoning_desc_none') };
      case 'on':
        return { icon: '🧠', label: t('reasoning_level_on'), desc: t('reasoning_desc_on') };
      case 'minimal':
        return { icon: '🟢', label: t('reasoning_level_minimal'), desc: t('reasoning_desc_minimal') };
      case 'low':
        return { icon: '🟢', label: t('reasoning_level_low'), desc: t('reasoning_desc_low') };
      case 'medium':
        return { icon: '🟡', label: t('reasoning_level_medium'), desc: t('reasoning_desc_medium') };
      case 'high':
        return { icon: '🔴', label: t('reasoning_level_high'), desc: t('reasoning_desc_high') };
      case 'xhigh':
        return { icon: '🔥', label: t('reasoning_level_xhigh'), desc: t('reasoning_desc_xhigh') };
      default:
        return { icon: '⚙️', label: lvl.charAt(0).toUpperCase() + lvl.slice(1), desc: '' };
    }
  }

  function renderReasoningMenuOptions(elements, reasoningInfo, activeLevel, onSelect) {
    if (!elements || !elements.reasoningOptionsContainer) return;

    elements.reasoningOptionsContainer.innerHTML = '';
    const levels = (reasoningInfo && Array.isArray(reasoningInfo.levels)) ? reasoningInfo.levels : ['off', 'low', 'medium', 'high'];

    levels.forEach(lvl => {
      const doc = elements.reasoningOptionsContainer.ownerDocument || document;
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'reasoning-option';
      btn.setAttribute('data-level', lvl);

      const info = getReasoningLevelLabel(lvl);
      const lower = String(lvl).toLowerCase().trim();
      const activeLower = String(activeLevel || 'off').toLowerCase().trim();

      if (lower === activeLower || (activeLower === 'off' && lower === 'none') || (activeLower === 'none' && lower === 'off')) {
        btn.classList.add('active');
      }

      btn.innerHTML = `
        <span class="option-icon">${info.icon}</span>
        <div class="option-text">
          <strong>${info.label}</strong>
          ${info.desc ? `<small>${info.desc}</small>` : ''}
        </div>
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onSelect === 'function') {
          onSelect(lvl);
        }
      });

      elements.reasoningOptionsContainer.appendChild(btn);
    });
  }

  function positionReasoningMenu(elements) {
    if (!elements || !elements.reasoningMenu || !elements.btnReasoning) return;
    if (elements.reasoningMenu.style.display === 'none') return;

    const btnRect = elements.btnReasoning.getBoundingClientRect();
    const win = elements.reasoningMenu.ownerDocument?.defaultView || window;
    const viewportHeight = win.visualViewport ? win.visualViewport.height : win.innerHeight;
    const viewportWidth = win.innerWidth;

    const spaceAbove = btnRect.top;
    const menuWidth = Math.min(290, viewportWidth - 16);

    let leftPos = btnRect.left;
    if (leftPos + menuWidth > viewportWidth - 8) {
      leftPos = viewportWidth - menuWidth - 8;
    }
    if (leftPos < 8) {
      leftPos = 8;
    }

    elements.reasoningMenu.style.position = 'fixed';
    elements.reasoningMenu.style.left = `${Math.round(leftPos)}px`;
    elements.reasoningMenu.style.width = `${Math.round(menuWidth)}px`;

    const bottomPos = Math.max(8, viewportHeight - btnRect.top + 8);
    const maxHeight = Math.max(140, Math.min(380, spaceAbove - 16));

    elements.reasoningMenu.style.bottom = `${Math.round(bottomPos)}px`;
    elements.reasoningMenu.style.top = 'auto';
    elements.reasoningMenu.style.maxHeight = `${Math.round(maxHeight)}px`;
  }

  function openReasoningMenu(elements, appConfig, onSelect) {
    if (!elements || !elements.reasoningMenu) return;
    elements.reasoningMenu.style.display = 'flex';

    const API = getApi();
    const apiType = appConfig?.apiType || (elements.settingApiType ? elements.settingApiType.value : 'openai');
    const reasoningConfig = API?.getStandardReasoningOptions
      ? API.getStandardReasoningOptions(apiType, appConfig?.apiUrl)
      : { levels: ['off', 'low', 'medium', 'high'], label: 'OpenAI / LM Studio' };

    if (elements.reasoningModelBadge) {
      elements.reasoningModelBadge.textContent = reasoningConfig.label || apiType.toUpperCase();
      elements.reasoningModelBadge.title = `Protocol: ${reasoningConfig.label || apiType}`;
    }

    renderReasoningMenuOptions(elements, reasoningConfig, appConfig?.reasoningEffort || 'off', onSelect);
    positionReasoningMenu(elements);
  }

  function closeReasoningMenu(elements) {
    if (!elements || !elements.reasoningMenu) return;
    elements.reasoningMenu.style.display = 'none';
    elements.reasoningMenu.style.left = '0px';
    elements.reasoningMenu.style.right = 'auto';
  }

  function toggleReasoningMenu(elements, appConfig, onSelect) {
    if (!elements || !elements.reasoningMenu) return;
    const isVisible = elements.reasoningMenu.style.display === 'flex' || elements.reasoningMenu.style.display === 'block';
    if (isVisible) {
      closeReasoningMenu(elements);
    } else {
      openReasoningMenu(elements, appConfig, onSelect);
    }
  }

  function selectReasoningLevel(elements, appConfig, level, onLevelChanged) {
    let norm = String(level).trim();
    if (norm.toLowerCase() === 'off') norm = 'none';
    updateReasoningUI(elements, norm);
    closeReasoningMenu(elements);
    if (typeof onLevelChanged === 'function') {
      onLevelChanged(norm);
    }
  }

  function updateReasoningUI(elements, level) {
    if (!elements) return;
    const val = level || 'none';
    const lower = String(val).toLowerCase().trim();

    if (elements.reasoningLabel && elements.btnReasoning) {
      if (lower === 'off' || lower === 'none') {
        elements.reasoningLabel.textContent = 'None';
        elements.btnReasoning.classList.remove('active', 'active-on', 'active-low', 'active-medium', 'active-high', 'active-xhigh', 'level-low', 'level-medium', 'level-high', 'level-xhigh');
      } else {
        let displayTxt = lower.charAt(0).toUpperCase() + lower.slice(1);
        if (lower === 'low') displayTxt = 'Low';
        else if (lower === 'medium') displayTxt = 'Med';
        else if (lower === 'high') displayTxt = 'High';
        else if (lower === 'xhigh') displayTxt = 'XHigh';
        else if (lower === 'on') displayTxt = 'On';

        elements.reasoningLabel.textContent = displayTxt;
        elements.btnReasoning.classList.add('active');
        elements.btnReasoning.classList.remove('active-on', 'active-low', 'active-medium', 'active-high', 'active-xhigh', 'level-low', 'level-medium', 'level-high', 'level-xhigh');
        if (['low', 'medium', 'high', 'xhigh', 'on'].includes(lower)) {
          elements.btnReasoning.classList.add(`active-${lower}`);
        }
      }
    }

    if (elements.reasoningOptionsContainer) {
      const options = elements.reasoningOptionsContainer.querySelectorAll('.reasoning-option');
      options.forEach(opt => {
        const optLower = String(opt.getAttribute('data-level') || '').toLowerCase().trim();
        if (optLower === lower || (lower === 'off' && optLower === 'none') || (lower === 'none' && optLower === 'off')) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
    }
  }

  return {
    getReasoningLevelLabel,
    renderReasoningMenuOptions,
    positionReasoningMenu,
    openReasoningMenu,
    closeReasoningMenu,
    toggleReasoningMenu,
    selectReasoningLevel,
    updateReasoningUI
  };
});
