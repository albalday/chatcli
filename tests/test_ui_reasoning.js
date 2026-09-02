const { test } = require('node:test');
const assert = require('node:assert/strict');
const UIReasoning = require('../js/ui-reasoning.js');

test('UIReasoning - Formateo de etiquetas de nivel de razonamiento', () => {
  const none = UIReasoning.getReasoningLevelLabel('none');
  assert.equal(none.icon, '⚪');
  assert.ok(none.label);

  const low = UIReasoning.getReasoningLevelLabel('low');
  assert.equal(low.icon, '🟢');

  const med = UIReasoning.getReasoningLevelLabel('medium');
  assert.equal(med.icon, '🟡');

  const high = UIReasoning.getReasoningLevelLabel('high');
  assert.equal(high.icon, '🔴');

  const xhigh = UIReasoning.getReasoningLevelLabel('xhigh');
  assert.equal(xhigh.icon, '🔥');
});

test('UIReasoning - renderReasoningMenuOptions crea botones interactivos', () => {
  const createdButtons = [];
  const fakeContainer = {
    innerHTML: '',
    ownerDocument: {
      createElement: (tag) => {
        const el = {
          tagName: tag,
          type: '',
          className: '',
          attributes: {},
          classList: {
            add: (cls) => { el.className += ' ' + cls; },
            remove: () => {}
          },
          setAttribute: (name, val) => { el.attributes[name] = val; },
          getAttribute: (name) => el.attributes[name],
          addEventListener: (event, handler) => { el._handler = handler; }
        };
        return el;
      }
    },
    appendChild: (child) => {
      createdButtons.push(child);
    }
  };

  const elements = { reasoningOptionsContainer: fakeContainer };
  const reasoningInfo = { levels: ['off', 'low', 'medium', 'high'] };

  let selectedLevel = null;
  UIReasoning.renderReasoningMenuOptions(elements, reasoningInfo, 'low', (lvl) => {
    selectedLevel = lvl;
  });

  assert.equal(createdButtons.length, 4);
  assert.equal(createdButtons[1].attributes['data-level'], 'low');
  assert.ok(createdButtons[1].className.includes('active'));

  // Simular click
  createdButtons[2]._handler({ stopPropagation: () => {} });
  assert.equal(selectedLevel, 'medium');
});

test('UIReasoning - selectReasoningLevel normaliza y actualiza appConfig', () => {
  const appConfig = { reasoningEffort: 'none' };
  const labelEl = { textContent: '' };
  const btnEl = {
    classList: {
      classes: new Set(),
      add: function (...cls) { cls.forEach(c => this.classes.add(c)); },
      remove: function (...cls) { cls.forEach(c => this.classes.delete(c)); }
    }
  };
  const menuEl = { style: {} };

  const elements = {
    reasoningLabel: labelEl,
    btnReasoning: btnEl,
    reasoningMenu: menuEl
  };

  let callbackCalledWith = null;
  UIReasoning.selectReasoningLevel(elements, appConfig, 'high', (norm) => {
    callbackCalledWith = norm;
  });

  assert.equal(appConfig.reasoningEffort, 'high');
  assert.equal(callbackCalledWith, 'high');
  assert.equal(labelEl.textContent, 'High');
  assert.ok(btnEl.classList.classes.has('active'));
  assert.ok(btnEl.classList.classes.has('active-high'));
  assert.equal(menuEl.style.display, 'none');

  // Seleccionar 'off' normaliza a 'none'
  UIReasoning.selectReasoningLevel(elements, appConfig, 'off');
  assert.equal(appConfig.reasoningEffort, 'none');
  assert.equal(labelEl.textContent, 'None');
  assert.ok(!btnEl.classList.classes.has('active'));
});
