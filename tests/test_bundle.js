const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUNDLE_PATH = path.join(ROOT_DIR, 'chatcli.html');

test('Bundler - Generación en modo Producción (Terser/esbuild)', () => {
  const stdout = execSync('python3 bundle.py --mode=prod', { cwd: ROOT_DIR, encoding: 'utf-8' });
  assert.ok(stdout.includes("ChatCLI Standalone Bundle ('chatcli.html') generado con éxito"));
  assert.ok(fs.existsSync(BUNDLE_PATH));

  const content = fs.readFileSync(BUNDLE_PATH, 'utf-8');
  assert.ok(content.includes('<!DOCTYPE html>'));
  assert.ok(content.includes('<html lang="es">'));
  assert.ok(content.includes('<style>'));
  assert.ok(content.includes('<script>'));

  // Verificar ausencia de enlaces locales externos
  assert.equal(/<script[^>]*src=["']js\//i.test(content), false, 'No deben quedar etiquetas <script src="js/...">');
  assert.equal(/<link[^>]*href=["']css\//i.test(content), false, 'No deben quedar etiquetas <link href="css/...">');

  // Verificar presencia de módulos fundamentales
  const expectedModules = [
    'ChatStorage', 'ChatI18n', 'ChatSandbox', 'ChatCharts',
    'ChatWebBrowser', 'ChatWebSearch', 'ChatMarkdown',
    'ChatProviders', 'ChatAPI', 'ChatFileParser',
    'ChatAgentCore', 'ChatMCP'
  ];
  for (const mod of expectedModules) {
    assert.ok(content.includes(mod), `El módulo ${mod} debe estar presente en el bundle`);
  }
});

test('Bundler - Generación en modo Fallback Puro (Python FSM Tokenizer)', () => {
  const stdout = execSync('python3 bundle.py --fallback-only', { cwd: ROOT_DIR, encoding: 'utf-8' });
  assert.ok(stdout.includes('Python FSM Tokenizer'));
  assert.ok(fs.existsSync(BUNDLE_PATH));

  const content = fs.readFileSync(BUNDLE_PATH, 'utf-8');
  assert.ok(content.includes('<!DOCTYPE html>'));

  // Extraer el JS embebido y comprobar sintaxis
  const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, 'Debe contener un bloque <script>');

  const jsCode = scriptMatch[1];
  assert.doesNotThrow(() => {
    execSync('node -c', { input: jsCode, encoding: 'utf-8' });
  }, 'El JavaScript del fallback debe ser 100% válido sintácticamente');
});

test('Bundler - Generación en modo Desarrollo (--mode=dev)', () => {
  const stdout = execSync('python3 bundle.py --mode=dev', { cwd: ROOT_DIR, encoding: 'utf-8' });
  assert.ok(stdout.includes('Modo: DEV'));
  assert.ok(fs.existsSync(BUNDLE_PATH));

  const content = fs.readFileSync(BUNDLE_PATH, 'utf-8');
  assert.ok(content.includes('<!DOCTYPE html>'));
  assert.ok(content.length > 500000, 'El archivo en modo dev debe preservar formato e identación');
});
