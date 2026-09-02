const { test } = require('node:test');
const assert = require('node:assert/strict');
const UISidebar = require('../js/ui-sidebar.js');

test('UISidebar - filterSessions filtra por título ignorando mayúsculas/minúsculas', () => {
  const sessions = [
    { id: '1', title: 'Aprender JS Moderno' },
    { id: '2', title: 'Receta de Cocina' },
    { id: '3', title: 'Refactorización de Código JS' }
  ];

  const resJs = UISidebar.filterSessions(sessions, 'js');
  assert.equal(resJs.length, 2);
  assert.equal(resJs[0].id, '1');
  assert.equal(resJs[1].id, '3');

  const resAll = UISidebar.filterSessions(sessions, '');
  assert.equal(resAll.length, 3);

  const resNone = UISidebar.filterSessions(sessions, 'inexistente');
  assert.equal(resNone.length, 0);
});

test('UISidebar - toggleSidebar, openSidebar y closeSidebar gestionan visibilidad', () => {
  const fakeSidebar = { style: { display: 'none' } };
  const fakeToggleBtn = { style: { display: 'inline-flex' } };
  const elements = { chatSidebar: fakeSidebar, btnToggleSidebar: fakeToggleBtn };

  UISidebar.openSidebar(elements);
  assert.equal(fakeSidebar.style.display, 'flex');
  assert.equal(fakeToggleBtn.style.display, 'none');

  UISidebar.closeSidebar(elements);
  assert.equal(fakeSidebar.style.display, 'none');
  assert.equal(fakeToggleBtn.style.display, 'inline-flex');

  UISidebar.toggleSidebar(elements);
  assert.equal(fakeSidebar.style.display, 'flex');
  assert.equal(fakeToggleBtn.style.display, 'none');
});

test('UISidebar - renderSidebarChats renderiza items y marca la sesión activa', () => {
  const appendedItems = [];
  const fakeList = {
    innerHTML: '',
    ownerDocument: {
      createElement: (tag) => {
        const el = {
          tagName: tag,
          className: '',
          attributes: {},
          innerHTML: '',
          setAttribute: (k, v) => { el.attributes[k] = v; },
          getAttribute: (k) => el.attributes[k],
          querySelector: (sel) => ({
            addEventListener: (evt, handler) => { el['_' + sel] = handler; }
          }),
          addEventListener: (evt, handler) => { el._click = handler; }
        };
        return el;
      }
    },
    appendChild: (item) => appendedItems.push(item)
  };

  const elements = { sidebarChatsList: fakeList };
  const sessions = [
    { id: 'sess_1', title: 'Primer Chat', updatedAt: Date.now() },
    { id: 'sess_2', title: 'Segundo Chat', updatedAt: Date.now() }
  ];

  let switchedTo = null;
  UISidebar.renderSidebarChats(elements, sessions, 'sess_2', {
    onSwitchSession: (id) => { switchedTo = id; }
  });

  assert.equal(appendedItems.length, 2);
  assert.ok(!appendedItems[0].className.includes('active'));
  assert.ok(appendedItems[1].className.includes('active'));

  // Click en el primer chat
  appendedItems[0]._click({ target: appendedItems[0] });
  assert.equal(switchedTo, 'sess_1');
});
