const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_PROD_PATH = path.join(__dirname, 'tmp_test_prod.html');
const TEST_FALLBACK_PATH = path.join(__dirname, 'tmp_test_fallback.html');
const TEST_DEV_PATH = path.join(__dirname, 'tmp_test_dev.html');

test('Bundler - Generación en modo Producción (Terser/esbuild)', () => {
  try {
    const stdout = execSync(`python3 bundle.py --mode=prod -o "${TEST_PROD_PATH}"`, { cwd: ROOT_DIR, encoding: 'utf-8' });
    assert.ok(stdout.includes("generado con éxito"));
    assert.ok(fs.existsSync(TEST_PROD_PATH));

    const content = fs.readFileSync(TEST_PROD_PATH, 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'));
    assert.ok(content.includes('<html lang="es">'));
    assert.ok(content.includes('<style>'));
    assert.ok(content.includes('<script>'));

    // Verificar que el tamaño de producción es compacto (< 450 KB)
    assert.ok(content.length < 450000, `El bundle de producción debe ser compacto (actual: ${content.length} bytes)`);

    // Verificar ausencia de enlaces locales externos
    assert.equal(/<script[^>]*src=["']js\//i.test(content), false, 'No deben quedar etiquetas <script src="js/...">');
    assert.equal(/<link[^>]*href=["']css\//i.test(content), false, 'No deben quedar etiquetas <link href="css/...">');

    // Verificar presencia de módulos fundamentales
    const expectedModules = [
      'ChatStorage', 'ChatRagStorage', 'ChatIngestionEngine', 'ChatTreeRagService', 'ChatTreeRagUI',
      'ChatI18n', 'ChatSandbox', 'ChatCharts',
      'ChatWebBrowser', 'ChatWebSearch', 'ChatMarkdown',
      'ChatProviders', 'ChatAPI', 'ChatFileParser',
      'ChatAgentCore', 'ChatMCP', 'ChatDebug',
      'ChatToolCards', 'ChatAttachments', 'ChatExport',
      'ChatState', 'ChatContextManager'
    ];
    for (const mod of expectedModules) {
      assert.ok(content.includes(mod), `El módulo ${mod} debe estar presente en el bundle`);
    }
  } finally {
    if (fs.existsSync(TEST_PROD_PATH)) fs.unlinkSync(TEST_PROD_PATH);
  }
});

test('Bundler - Generación en modo Fallback Puro (Python FSM Tokenizer)', () => {
  try {
    const stdout = execSync(`python3 bundle.py --fallback-only -o "${TEST_FALLBACK_PATH}"`, { cwd: ROOT_DIR, encoding: 'utf-8' });
    assert.ok(stdout.includes('Python FSM Tokenizer'));
    assert.ok(fs.existsSync(TEST_FALLBACK_PATH));

    const content = fs.readFileSync(TEST_FALLBACK_PATH, 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'));

    // Extraer el JS embebido y comprobar sintaxis
    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/i);
    assert.ok(scriptMatch, 'Debe contener un bloque <script>');

    const jsCode = scriptMatch[1];
    assert.doesNotThrow(() => {
      execSync('node -c', { input: jsCode, encoding: 'utf-8' });
    }, 'El JavaScript del fallback debe ser 100% válido sintácticamente');
  } finally {
    if (fs.existsSync(TEST_FALLBACK_PATH)) fs.unlinkSync(TEST_FALLBACK_PATH);
  }
});

test('Bundler - Generación en modo Desarrollo (--mode=dev)', () => {
  try {
    const stdout = execSync(`python3 bundle.py --mode=dev -o "${TEST_DEV_PATH}"`, { cwd: ROOT_DIR, encoding: 'utf-8' });
    assert.ok(stdout.includes('Modo: DEV'));
    assert.ok(fs.existsSync(TEST_DEV_PATH));

    const content = fs.readFileSync(TEST_DEV_PATH, 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'));
    assert.ok(content.length > 500000, 'El archivo en modo dev debe preservar formato e identación');
  } finally {
    if (fs.existsSync(TEST_DEV_PATH)) fs.unlinkSync(TEST_DEV_PATH);
  }
});
