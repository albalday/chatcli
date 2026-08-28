const { test } = require('node:test');
const assert = require('node:assert/strict');
const Sandbox = require('../js/sandbox.js');

test('Sandbox - Ejecución básica de código y retorno', async () => {
  const res = await Sandbox.execute('const a = 10; const b = 20; return a + b;');
  assert.equal(res.success, true);
  assert.equal(res.result, '30');
});

test('Sandbox - Captura de logs de consola', async () => {
  const res = await Sandbox.execute('console.log("Hola", "Mundo"); return 42;');
  assert.equal(res.success, true);
  assert.deepEqual(res.logs, ['Hola Mundo']);
  assert.equal(res.result, '42');
});

test('Sandbox - Manejo de errores de sintaxis o runtime', async () => {
  const res = await Sandbox.execute('throw new Error("Fallo de prueba");');
  assert.equal(res.success, false);
  assert.match(res.error, /Fallo de prueba/);
});

test('Sandbox - Manejo de expresiones matemáticas y estructuras', async () => {
  const res = await Sandbox.execute('Math.sqrt(144)');
  assert.equal(res.success, true);
  assert.equal(res.result, '12');
});
