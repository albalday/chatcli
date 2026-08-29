const { test } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');
const TreeRagUI = require('../js/treeRagUI.js');

test('TreeRagUI - Exporta métodos principales', () => {
  assert.equal(typeof TreeRagUI.initTreeRagUI, 'function');
  assert.equal(typeof TreeRagUI.refreshBranchSelector, 'function');
  assert.equal(typeof TreeRagUI.renderBranchesList, 'function');
  assert.equal(typeof TreeRagUI.renderBranchWorkspace, 'function');
  assert.equal(typeof TreeRagUI.openDocumentStructureViewer, 'function');
  assert.equal(typeof TreeRagUI.getActiveChatBranchId, 'function');
  assert.equal(typeof TreeRagUI.setActiveChatBranchId, 'function');
});

test('TreeRagUI - getActiveChatBranchId y setActiveChatBranchId gestionan la rama activa', () => {
  TreeRagUI.setActiveChatBranchId('branch_test_123');
  assert.equal(TreeRagUI.getActiveChatBranchId(), 'branch_test_123');

  TreeRagUI.setActiveChatBranchId('');
  assert.equal(TreeRagUI.getActiveChatBranchId(), '');
});
