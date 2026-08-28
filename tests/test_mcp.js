const test = require('node:test');
const assert = require('node:assert/strict');

// Cargar módulos
const AgentCore = require('../js/agent-core.js');
const MCP = require('../js/mcp.js');

test('MCP - Descubrimiento y Mapeo de Herramientas (tools/list)', async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      if (body.method === 'initialize') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'Weather MCP Server', version: '1.2.0' },
              capabilities: { tools: {} }
            }
          })
        };
      }
      if (body.method === 'tools/list') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [
                {
                  name: 'get_weather_forecast',
                  description: 'Obtiene el pronóstico del tiempo para una ciudad.',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      city: { type: 'string', description: 'Nombre de la ciudad' },
                      days: { type: 'number', description: 'Días de previsión' }
                    },
                    required: ['city']
                  }
                }
              ]
            }
          })
        };
      }
      return { ok: false, status: 404, text: async () => 'Not Found' };
    };

    const client = new MCP.McpClient({
      id: 'weather_server',
      name: 'Weather MCP Server',
      url: 'https://mcp.weather.local/rpc'
    });

    const provider = new MCP.McpToolProvider(client);
    const tools = await provider.discoverTools();

    assert.equal(tools.length, 1);
    const weatherTool = tools[0];
    assert.equal(weatherTool.category, 'mcp');
    assert.ok(weatherTool.name.includes('weather_server__get_weather_forecast'));
    assert.ok(weatherTool.aliases.includes('get_weather_forecast'));
    assert.equal(weatherTool.metadata.mcpServerName, 'Weather MCP Server');
    assert.equal(weatherTool.metadata.originalName, 'get_weather_forecast');
    assert.ok(weatherTool.parameters.required.includes('city'));

    // Registro en ToolRegistry
    const registry = new AgentCore.ToolRegistry();
    registry.registerProvider(provider);

    // Debe resolver por alias o por nombre con namespace
    assert.ok(registry.hasTool('get_weather_forecast'));
    assert.ok(registry.hasTool('mcp__weather_server__get_weather_forecast'));

    const defs = registry.getDefinitions();
    const weatherDef = defs.find(d => d.function.name.includes('get_weather_forecast'));
    assert.ok(weatherDef);
  } finally {
    global.fetch = originalFetch;
  }
});

test('MCP - Invocación de herramientas (tools/call) y conversión de resultados', async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      if (body.method === 'tools/call') {
        assert.equal(body.params.name, 'calculate_math');
        assert.equal(body.params.arguments.expression, '40 + 2');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [
                { type: 'text', text: 'Resultado: 42' }
              ],
              isError: false
            }
          })
        };
      }
      return { ok: false, status: 500 };
    };

    const client = new MCP.McpClient({
      id: 'math_server',
      name: 'Math Server',
      url: 'https://mcp.math.local/rpc'
    });

    const res = await client.callTool('calculate_math', { expression: '40 + 2' });
    assert.equal(res.success, true);
    assert.equal(res.isError, false);
    assert.equal(res.content, 'Resultado: 42');
    assert.ok(res.executionTimeMs >= 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('MCP - Manejo de errores de servidor y respuestas con isError: true', async () => {
  const originalFetch = global.fetch;

  try {
    // 1. Error de protocolo JSON-RPC
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        })
      };
    };

    const client = new MCP.McpClient({
      id: 'err_server',
      name: 'Error Server',
      url: 'https://mcp.err.local/rpc'
    });

    await assert.rejects(
      async () => client.request('non_existent_method'),
      /Error MCP \(-32601\): Method not found/
    );

    // 2. Respuesta con isError: true en tools/call
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [{ type: 'text', text: 'Parámetro inválido proporcionado' }],
            isError: true
          }
        })
      };
    };

    const callRes = await client.callTool('some_tool', { invalid: true });
    assert.equal(callRes.success, false);
    assert.equal(callRes.isError, true);
    assert.ok(callRes.content.includes('Parámetro inválido'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('MCP - Timeout, Cancelación con AbortSignal y Truncado de Salida', async () => {
  const originalFetch = global.fetch;

  try {
    // Test de cancelación
    const client = new MCP.McpClient({
      id: 'slow_server',
      name: 'Slow Server',
      url: 'https://mcp.slow.local/rpc'
    });

    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => client.request('tools/list', {}, { signal: controller.signal }),
      /(aborted|cancel)/i
    );

    // Test de truncado de salida con respuestas gigantes
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [{ type: 'text', text: 'X'.repeat(70000) }],
            isError: false
          }
        })
      };
    };

    const hugeRes = await client.callTool('large_dump', {});
    assert.equal(hugeRes.success, true);
    assert.ok(hugeRes.content.length <= 60100);
    assert.ok(hugeRes.content.includes('[... Contenido MCP truncado por límite de tamaño ...]'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('MCP - McpManager administración de servidores y sincronización', async () => {
  const manager = new MCP.McpManager();

  // Añadir servidor
  const server = manager.addServer({
    name: 'Test Local MCP',
    url: 'http://localhost:8000/rpc',
    headers: { 'Authorization': 'Bearer test-secret-token' },
    enabled: true
  });

  assert.ok(server.id);
  assert.equal(server.name, 'Test Local MCP');
  assert.equal(manager.getServers().length >= 1, true);

  // Obtener cliente y verificar que las cabeceras de autorización se mantengan en el cliente
  const client = manager.getClient(server.id);
  assert.equal(client.headers['Authorization'], 'Bearer test-secret-token');

  // Limpiar
  manager.removeServer(server.id);
  assert.equal(manager.getServers().some(s => s.id === server.id), false);
});
