const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_PROD_PATH = path.join(__dirname, 'tmp_test_prod.html');
const TEST_FALLBACK_PATH = path.join(__dirname, 'tmp_test_fallback.html');
const TEST_DEV_PATH = path.join(__dirname, 'tmp_test_dev.html');

test('Bundler - Generación en modo Producción (Gzip Base64 Level 9)', () => {
  try {
    const stdout = execSync(`python3 bundle.py --mode=prod -o "${TEST_PROD_PATH}"`, { cwd: ROOT_DIR, encoding: 'utf-8' });
    assert.ok(stdout.includes("generado con éxito"));
    assert.ok(fs.existsSync(TEST_PROD_PATH));

    const content = fs.readFileSync(TEST_PROD_PATH, 'utf-8');
    const stats = fs.statSync(TEST_PROD_PATH);
    assert.ok(content.includes('<!DOCTYPE html>'));
    assert.ok(content.includes('<html lang="es">'));
    assert.ok(content.includes('<style>'));
    assert.ok(content.includes('id="compressed-js"'));
    assert.ok(content.includes('DecompressionStream'));

    // Verificar que el tamaño de producción es ultra-compacto (< 350 KB)
    assert.ok(stats.size < 350000, `El bundle comprimido debe ser ultra-compacto (actual: ${stats.size} bytes)`);

    // Verificar ausencia de enlaces locales externos
    assert.equal(/<script[^>]*src=["']js\//i.test(content), false, 'No deben quedar etiquetas <script src="js/...">');
    assert.equal(/<link[^>]*href=["']css\//i.test(content), false, 'No deben quedar etiquetas <link href="css/...">');

    // Extraer y descomprimir el JavaScript embebido
    const match = content.match(/<script[^>]*id=["']compressed-js["'][^>]*>([\s\S]*?)<\/script>/i);
    assert.ok(match, 'Debe contener la etiqueta <script id="compressed-js">');

    const b64Payload = match[1].trim();
    const decompressedJs = zlib.gunzipSync(Buffer.from(b64Payload, 'base64')).toString('utf-8');
    assert.ok(decompressedJs.length > 500000, 'El JavaScript descomprimido debe contener el código completo');

    // Verificar presencia de módulos fundamentales en el JS descomprimido
    const expectedModules = [
      'ZeroChatOrama', 'ZeroChatDB', 'ChatStorage', 'ChatRagStorage', 'ChatRagIndex', 'ChatIngestionEngine', 'ChatRagService', 'ChatRagUI',
      'ChatI18n', 'ChatIcons', 'ChatSandbox', 'ChatCharts',
      'ChatWebBrowser', 'ChatWebSearch', 'ChatMarkdown',
      'ChatProviders', 'ChatAPI', 'ChatFileParser',
      'ChatToolRuntime', 'ChatToolManifest', 'ChatBuiltinExecuteJavascriptTool',
      'ChatBuiltinSearchWebTool', 'ChatBuiltinFetchWebPageTool', 'ChatBuiltinDownloadPdfTool',
      'ChatBuiltinRenderChartTool', 'ChatBuiltinGetCurrentDatetimeTool', 'ChatBuiltinListDocumentsTool',
      'ChatBuiltinSearchKnowledgeBaseTool', 'ChatBuiltinReadKnowledgeChunkTool',
      'ChatAgentCore', 'ChatMCP', 'ChatDebug',
      'ChatToolCards', 'ChatAttachments', 'ChatExport',
      'ChatState', 'ChatContextManager'
    ];
    for (const mod of expectedModules) {
      assert.ok(decompressedJs.includes(mod), `El módulo ${mod} debe estar presente en el código descomprimido`);
    }

    // Verificar validez sintáctica en Node.js
    assert.doesNotThrow(() => {
      execSync('node -c', { input: decompressedJs, encoding: 'utf-8' });
    }, 'El JavaScript descomprimido debe ser 100% válido sintácticamente');
  } finally {
    if (fs.existsSync(TEST_PROD_PATH)) fs.unlinkSync(TEST_PROD_PATH);
  }
});

test('Bundler - Generación en modo Fallback Puro (Python Fallback CSS)', () => {
  try {
    const stdout = execSync(`python3 bundle.py --fallback-only -o "${TEST_FALLBACK_PATH}"`, { cwd: ROOT_DIR, encoding: 'utf-8' });
    assert.ok(stdout.includes('Python Fallback'));
    assert.ok(fs.existsSync(TEST_FALLBACK_PATH));

    const content = fs.readFileSync(TEST_FALLBACK_PATH, 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'));

    // Extraer el JS embebido y comprobar descompresión y sintaxis
    const match = content.match(/<script[^>]*id=["']compressed-js["'][^>]*>([\s\S]*?)<\/script>/i);
    assert.ok(match, 'Debe contener un bloque <script id="compressed-js">');

    const b64Payload = match[1].trim();
    const decompressedJs = zlib.gunzipSync(Buffer.from(b64Payload, 'base64')).toString('utf-8');
    assert.doesNotThrow(() => {
      execSync('node -c', { input: decompressedJs, encoding: 'utf-8' });
    }, 'El JavaScript descomprimido del fallback debe ser 100% válido sintácticamente');
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
    assert.ok(content.includes('id="compressed-js"'));
  } finally {
    if (fs.existsSync(TEST_DEV_PATH)) fs.unlinkSync(TEST_DEV_PATH);
  }
});
