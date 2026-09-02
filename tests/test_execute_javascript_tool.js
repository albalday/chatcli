const test = require('node:test');
const assert = require('node:assert/strict');

const AgentCore = require('../js/agent-core.js');
const ExecuteJavascriptTool = require('../js/tools/builtin/execute-javascript.tool.js');
const ToolManifest = require('../js/tools/tool-manifest.js');

test('ExecuteJavascriptTool - módulo autocontenido cumple el contrato y conserva aliases', () => {
  const tool = ExecuteJavascriptTool.createTool(AgentCore.Tool);
  const validation = AgentCore.validateToolContract(tool);

  assert.equal(validation.valid, true, validation.errors.join(' '));
  assert.equal(tool.name, 'execute_javascript');
  assert.equal(tool.getDefinition().function.name, 'execute_javascript');
  assert.ok(tool.aliases.includes('executejs'));
  assert.equal(tool.view.id, 'execute_javascript');
  assert.equal(ToolManifest.builtin.get('execute_javascript'), ExecuteJavascriptTool);
});

test('ExecuteJavascriptTool - ejecuta con el sandbox inyectado y conserva formatos', async () => {
  const tool = ExecuteJavascriptTool.createTool(AgentCore.Tool);
  let receivedCode = '';
  let receivedTimeout = null;
  const result = await tool.execute({ javascript: 'return 21 * 2;' }, {
    timeoutMs: 123,
    services: {
      sandbox: {
        execute: async (code, timeout) => {
          receivedCode = code;
          receivedTimeout = timeout;
          return { success: true, result: '42' };
        }
      }
    }
  });

  assert.equal(receivedCode, 'return 21 * 2;');
  assert.equal(receivedTimeout, 123);
  assert.equal(tool.serializeResultForModel({}, result), '42');
  assert.match(tool.formatDispatchMarkdown({ code: 'return 21 * 2;' }, result), /execute_javascript/);
});
