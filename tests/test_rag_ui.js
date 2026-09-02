const { test } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');
const RagUI = require('../js/rag-ui.js');

test('RagUI - exporta la superficie mínima', () => {
  assert.equal(typeof RagUI.initRagUI, 'function');
  assert.equal(typeof RagUI.updateToolbarStatus, 'function');
  assert.equal(typeof RagUI.renderActiveTab, 'function');
  assert.equal(typeof RagUI.renderManageTab, 'function');
  assert.equal(typeof RagUI.getActiveBranchId, 'function');
  assert.equal(typeof RagUI.setActiveBranchId, 'function');
  assert.equal(typeof RagUI.exportBranch, 'function');
  assert.equal(typeof RagUI.importBranchFile, 'function');
});

test('RagUI - gestiona la rama activa', () => {
  RagUI.setActiveBranchId('branch_test_123');
  assert.equal(RagUI.getActiveBranchId(), 'branch_test_123');

  RagUI.setActiveBranchId('');
  assert.equal(RagUI.getActiveBranchId(), '');
});
