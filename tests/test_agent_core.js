const test = require('node:test');
const assert = require('node:assert/strict');

// Cargar módulos
const AgentCoreModule = require('../js/agent-core.js');

test('AgentCore - Tool & ToolRegistry registro y resolución de herramientas y alias', () => {
  const registry = new AgentCoreModule.ToolRegistry();

  // Comprobar que las 5 herramientas nativas están registradas
  assert.ok(registry.hasTool('execute_javascript'));
  assert.ok(registry.hasTool('search_web'));
  assert.ok(registry.hasTool('fetch_web_page'));
  assert.ok(registry.hasTool('download_pdf'));
  assert.ok(registry.hasTool('render_chart'));

  // Comprobar resolución por alias
  assert.equal(registry.getTool('executejs').name, 'execute_javascript');
  assert.equal(registry.getTool('run_js').name, 'execute_javascript');
  assert.equal(registry.getTool('searchweb').name, 'search_web');
  assert.equal(registry.getTool('fetchwebpage').name, 'fetch_web_page');
  assert.equal(registry.getTool('downloadpdf').name, 'download_pdf');
  assert.equal(registry.getTool('renderchart').name, 'render_chart');

  // Comprobar generación de esquemas Function Calling
  const defs = registry.getDefinitions();
  assert.ok(defs.length >= 5);
  const jsDef = defs.find(d => d.function.name === 'execute_javascript');
  assert.ok(jsDef);
  assert.equal(jsDef.type, 'function');
  assert.ok(jsDef.function.parameters.required.includes('code'));
});

test('AgentCore - Registro de herramientas personalizadas (ToolProvider preparado para MCP)', async () => {
  const registry = new AgentCoreModule.ToolRegistry();

  class CustomMcpMockProvider extends AgentCoreModule.BaseToolProvider {
    constructor() {
      super({ id: 'mcp_filesystem', name: 'MCP Filesystem Provider' });
    }
    getTools() {
      return [
        new AgentCoreModule.Tool({
          name: 'read_file',
          description: 'Lee un archivo del sistema de archivos mediante MCP',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Ruta al archivo' }
            },
            required: ['path']
          },
          category: 'mcp',
          handler: async (args) => {
            return { success: true, content: `Contenido de ${args.path}` };
          }
        })
      ];
    }
  }

  registry.registerProvider(new CustomMcpMockProvider());

  assert.ok(registry.hasTool('read_file'));
  const executor = new AgentCoreModule.ToolExecutor(registry);

  const res = await executor.executeToolCall({
    id: 'call_mcp_1',
    type: 'function',
    function: {
      name: 'read_file',
      arguments: JSON.stringify({ path: '/home/user/test.txt' })
    }
  });

  assert.equal(res.success, true);
  assert.equal(res.result.content, 'Contenido de /home/user/test.txt');
  assert.equal(res.toolName, 'read_file');
});

test('AgentCore - ToolExecutor parseo tolerante de argumentos y captura de errores', async () => {
  const registry = new AgentCoreModule.ToolRegistry();

  // Registrar herramienta con error forzado
  registry.registerTool(new AgentCoreModule.Tool({
    name: 'failing_tool',
    description: 'Herramienta que lanza un error deliberado',
    handler: async () => {
      throw new Error('Fallo crítico simulado');
    }
  }));

  const executor = new AgentCoreModule.ToolExecutor(registry);

  // 1. Herramienta que falla -> no debe romper el proceso, debe devolver error capturado
  const failRes = await executor.executeToolCall({
    id: 'call_fail',
    function: { name: 'failing_tool', arguments: '{}' }
  });
  assert.equal(failRes.success, false);
  assert.equal(failRes.error, 'Fallo crítico simulado');
  assert.ok(failRes.executionTimeMs >= 0);

  // 2. Herramienta no existente
  const notFoundRes = await executor.executeToolCall({
    id: 'call_unknown',
    function: { name: 'non_existent_tool', arguments: '{}' }
  });
  assert.equal(notFoundRes.success, false);
  assert.match(notFoundRes.error, /no encontrada/i);

  // 3. Parseo tolerante de argumentos con sintaxis no estricta
  const parsed1 = executor.parseArguments('url: "https://example.com"');
  assert.equal(parsed1.url, 'https://example.com');

  const parsed2 = executor.parseArguments('code = "console.log(123)"');
  assert.equal(parsed2.code, 'console.log(123)');
});

test('AgentCore - Cancelación de ejecución de herramientas mediante AbortSignal', async () => {
  const registry = new AgentCoreModule.ToolRegistry();
  registry.registerTool(new AgentCoreModule.Tool({
    name: 'slow_tool',
    handler: async (args, ctx) => {
      if (ctx.signal && ctx.signal.aborted) throw new Error('Abortado');
      return { success: true };
    }
  }));

  const executor = new AgentCoreModule.ToolExecutor(registry);
  const controller = new AbortController();
  controller.abort(); // Cancelar inmediatamente

  const res = await executor.executeToolCall({
    id: 'call_cancel',
    function: { name: 'slow_tool', arguments: '{}' }
  }, { signal: controller.signal });

  assert.equal(res.success, false);
  assert.match(res.error, /cancelada/i);
});

test('AgentCore - Detección y detención de bucles infinitos en el agente', () => {
  const agent = new AgentCoreModule.AgentCore();

  const tc1 = { function: { name: 'search_web', arguments: '{"query":"ceuta"}' } };
  const tc2 = { function: { name: 'search_web', arguments: '{"query":"ceuta"}' } };
  const tc3 = { function: { name: 'search_web', arguments: '{"query":"ceuta"}' } };
  const tcDiff = { function: { name: 'search_web', arguments: '{"query":"melilla"}' } };

  assert.equal(agent.getToolCallFingerprint(tc1), agent.getToolCallFingerprint(tc2));
  assert.notEqual(agent.getToolCallFingerprint(tc1), agent.getToolCallFingerprint(tcDiff));
});

