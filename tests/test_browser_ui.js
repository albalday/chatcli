const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

test('Browser UI - Carga limpia del bundle zerochat.html sin errores de consola', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon')) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });

    assert.equal(consoleErrors.length, 0, 'No debe haber errores de consola: ' + consoleErrors.join(' | '));
    const title = await page.title();
    assert.ok(title.includes('ZeroChat'), 'El título debe incluir ZeroChat');

    // Verificar que los componentes clave están en el DOM
    const hasChatContainer = await page.$eval('.chat-container', el => !!el);
    assert.ok(hasChatContainer, 'El contenedor de chat debe existir');

    const hasMessagesList = await page.$eval('#messages-list', el => !!el);
    assert.ok(hasMessagesList, 'La lista de mensajes debe existir');

    const hasChatForm = await page.$eval('#chat-form', el => !!el);
    assert.ok(hasChatForm, 'El formulario de chat debe existir');

    // Verificar resolución de variables CSS de diseño
    const styles = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      return {
        bgApp: bodyStyle.backgroundColor,
        color: bodyStyle.color,
        fontFamily: bodyStyle.fontFamily
      };
    });
    assert.ok(styles.bgApp, 'El fondo de la app debe estar computado');
    assert.ok(styles.color, 'El color de texto debe estar computado');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Modo Oscuro y resolución de Design Tokens', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });

    // 1. Validar tokens en modo claro
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    const lightTokens = await page.evaluate(() => {
      const docStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      return {
        primary: docStyle.getPropertyValue('--primary').trim(),
        bgApp: docStyle.getPropertyValue('--bg-app').trim(),
        bgSurface: docStyle.getPropertyValue('--bg-surface').trim(),
        textMain: docStyle.getPropertyValue('--text-main').trim(),
        radiusMd: docStyle.getPropertyValue('--radius-md').trim(),
        bodyBg: bodyStyle.backgroundColor
      };
    });

    assert.ok(lightTokens.primary, 'Debe resolver --primary');
    assert.ok(lightTokens.bgApp, 'Debe resolver --bg-app');
    assert.ok(lightTokens.bgSurface, 'Debe resolver --bg-surface');
    assert.ok(lightTokens.radiusMd, 'Debe resolver --radius-md');

    // 2. Validar tokens en modo oscuro
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    const darkTokens = await page.evaluate(() => {
      const docStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      return {
        primary: docStyle.getPropertyValue('--primary').trim(),
        bgApp: docStyle.getPropertyValue('--bg-app').trim(),
        bgSurface: docStyle.getPropertyValue('--bg-surface').trim(),
        textMain: docStyle.getPropertyValue('--text-main').trim(),
        bodyBg: bodyStyle.backgroundColor
      };
    });

    assert.ok(darkTokens.primary, 'Debe resolver --primary en dark');
    assert.notEqual(darkTokens.bgApp, lightTokens.bgApp, 'El fondo de la app debe diferir entre temas');
    assert.notEqual(darkTokens.bodyBg, lightTokens.bodyBg, 'El fondo computado del body debe cambiar en dark');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Fase 2: Header Superior Moderno y Acciones Integradas', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });

    // 1. Verificar presencia y posición del header moderno
    const headerInfo = await page.$eval('.app-header', el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        exists: !!el,
        position: style.position,
        top: rect.top,
        height: rect.height,
        display: style.display
      };
    });
    assert.ok(headerInfo.exists, 'El header (.app-header) debe existir');
    assert.equal(headerInfo.display, 'flex', 'El header debe ser flex');
    assert.ok(headerInfo.height >= 40, 'El header debe tener altura suficiente');

    // 2. Verificar que la antigua barra superior sobre el prompt ya NO existe
    const hasOldToolbar = await page.$eval('.input-toolbar-top', () => true).catch(() => false);
    assert.equal(hasOldToolbar, false, 'La barra .input-toolbar-top obsoleta debe haber sido retirada');

    // 3. Verificar que el botón de toggle del sidebar reside en el header y abre/cierra la barra lateral
    const isSidebarToggleInHeader = await page.$eval('.app-header #btn-toggle-sidebar', el => !!el);
    assert.ok(isSidebarToggleInHeader, '#btn-toggle-sidebar debe residir dentro de .app-header');

    // Estado inicial: sidebar cerrado
    const sidebarInitialDisplay = await page.$eval('#chat-sidebar', el => getComputedStyle(el).display);
    assert.equal(sidebarInitialDisplay, 'none');

    // Abrir sidebar pulsando el botón del header
    await page.click('#btn-toggle-sidebar');
    const sidebarOpenedDisplay = await page.$eval('#chat-sidebar', el => getComputedStyle(el).display);
    assert.equal(sidebarOpenedDisplay, 'flex', 'El sidebar debe abrirse (display: flex) tras pulsar el botón del header');

    // Cerrar sidebar pulsando el botón de cerrar del sidebar
    await page.click('#btn-close-sidebar');
    const sidebarClosedAgain = await page.$eval('#chat-sidebar', el => getComputedStyle(el).display);
    assert.equal(sidebarClosedAgain, 'none', 'El sidebar debe cerrarse');

    // 4. Selector de perfiles activo en el header
    const hasProfileSelect = await page.$eval('.app-header #active-profile-select', el => !!el);
    assert.ok(hasProfileSelect, 'El selector de perfil debe residir dentro del header');

    // 5. Botón de Configuración abre el diálogo
    await page.click('#btn-open-settings');
    await page.waitForFunction(() => document.getElementById('settings-dialog')?.open);
    const isSettingsOpen = await page.$eval('#settings-dialog', el => el.open);
    assert.ok(isSettingsOpen, 'Pulsar el botón de ajustes en el header debe abrir #settings-dialog');
    await page.click('#btn-close-settings');
    await page.waitForFunction(() => !document.getElementById('settings-dialog')?.open);

    // 6. Botón de RAG abre el diálogo de conocimiento (asíncrono con refresh)
    await page.click('#btn-open-rag');
    await page.waitForFunction(() => document.getElementById('rag-modal')?.open);
    const isRagOpen = await page.$eval('#rag-modal', el => el.open);
    assert.ok(isRagOpen, 'Pulsar el botón de conocimiento en el header debe abrir #rag-modal');
    await page.click('#btn-close-rag');
    await page.waitForFunction(() => !document.getElementById('rag-modal')?.open);
  } finally {
    await browser.close();
  }
});
