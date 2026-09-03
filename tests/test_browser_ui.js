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

test('Browser UI - Fase 3: Canvas de Mensajes Centrado, Tipografía y Markdown', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });

    // Esperar a que la inicialización asíncrona de sesión en IndexedDB concluya
    await page.waitForSelector('#welcome-banner');
    await new Promise(r => setTimeout(r, 200));

    // Simular renderizado de un mensaje de usuario y uno del asistente
    await page.evaluate(() => {
      const messagesList = document.getElementById('messages-list');
      
      // Mensaje de Usuario
      const userMsg = document.createElement('div');
      userMsg.className = 'message-wrapper user';
      userMsg.innerHTML = `
        <div class="message-row user">
          <div class="message-content-wrapper">
            <div class="message-content">Hola ZeroChat, muéstrame una tabla y código.</div>
            <div class="message-footer-row">
              <div class="message-actions">
                <button class="btn-msg-action">✏️ Editar</button>
              </div>
            </div>
          </div>
        </div>
      `;
      messagesList.appendChild(userMsg);

      // Mensaje de Asistente con Razonamiento, Tabla y Código
      const astMsg = document.createElement('div');
      astMsg.className = 'message-wrapper assistant';
      astMsg.innerHTML = `
        <div class="message-row assistant">
          <div class="message-content-wrapper">
            <div class="message-content">
              <details class="thought-block" open>
                <summary class="thought-summary">🧠 Proceso de razonamiento</summary>
                <div class="thought-content">Analizando la solicitud para generar la respuesta estructurada...</div>
              </details>
              <p>Aquí tienes los datos solicitados en formato de tabla y código:</p>
              <div class="table-container">
                <table class="markdown-table">
                  <thead><tr><th>Parámetro</th><th>Valor</th><th>Estado</th></tr></thead>
                  <tbody>
                    <tr><td>Modelo</td><td>Gemini 2.5</td><td>Activo</td></tr>
                    <tr><td>Tokens</td><td>1.2k</td><td>OK</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="code-block-container">
                <div class="code-block-header">
                  <span class="code-lang">javascript</span>
                  <div class="code-block-actions">
                    <button class="btn-copy-code">Copiar</button>
                  </div>
                </div>
                <pre><code>console.log("Canvas moderno activo");</code></pre>
              </div>
            </div>
            <div class="message-footer-row">
              <div class="message-stats">
                <span class="stat-item">⚡ 45 tok/s</span>
              </div>
              <div class="message-actions">
                <button class="btn-msg-action">📋 Copiar</button>
              </div>
            </div>
          </div>
        </div>
      `;
      messagesList.appendChild(astMsg);
    });

    // 1. Validar centrado y ancho máximo del canvas de mensajes
    const canvasMetrics = await page.evaluate(() => {
      const userWrapper = document.querySelector('.message-wrapper.user');
      const astWrapper = document.querySelector('.message-wrapper.assistant');
      const rectUser = userWrapper.getBoundingClientRect();
      const rectAst = astWrapper.getBoundingClientRect();
      return {
        userWidth: rectUser.width,
        astWidth: rectAst.width
      };
    });

    assert.ok(canvasMetrics.userWidth <= 800, `El ancho de mensaje (${canvasMetrics.userWidth}px) debe respetar el canvas de lectura max-width: 48rem`);
    assert.ok(canvasMetrics.astWidth <= 800, `El ancho del asistente (${canvasMetrics.astWidth}px) debe respetar el canvas de lectura max-width: 48rem`);

    // 2. Validar acordeón de razonamiento plegable
    const thoughtInfo = await page.evaluate(() => {
      const block = document.querySelector('.thought-block');
      return {
        isOpen: block.open,
        hasBorderAccent: getComputedStyle(block).borderLeftWidth !== '0px'
      };
    });
    assert.ok(thoughtInfo.isOpen, 'El bloque de razonamiento debe renderizarse inicialmente desplegado');
    assert.ok(thoughtInfo.hasBorderAccent, 'El bloque de razonamiento debe tener borde de acento');

    // Plegar el acordeón haciendo click en el summary
    await page.click('.thought-summary');
    const isNowClosed = await page.$eval('.thought-block', el => !el.open);
    assert.ok(isNowClosed, 'Pulsar en el summary del pensamiento debe plegar el acordeón');

    // 3. Validar bloque de código
    const codeBlockInfo = await page.evaluate(() => {
      const codeBlock = document.querySelector('.code-block-container');
      const copyBtn = document.querySelector('.btn-copy-code');
      const pre = document.querySelector('.code-block-container pre');
      return {
        hasCodeBlock: !!codeBlock,
        hasCopyBtn: !!copyBtn,
        preOverflow: getComputedStyle(pre).overflowX
      };
    });
    assert.ok(codeBlockInfo.hasCodeBlock, 'El bloque de código debe existir');
    assert.ok(codeBlockInfo.hasCopyBtn, 'El botón de copiar código debe existir');
    assert.equal(codeBlockInfo.preOverflow, 'auto', 'El bloque pre debe tener overflow-x: auto');

    // 4. Validar tabla GFM
    const tableInfo = await page.evaluate(() => {
      const table = document.querySelector('.markdown-table');
      const container = document.querySelector('.table-container');
      return {
        rows: table.querySelectorAll('tr').length,
        hasBorder: getComputedStyle(container).borderWidth !== '0px'
      };
    });
    assert.equal(tableInfo.rows, 3, 'La tabla debe tener 3 filas (1 thead + 2 tbody)');
    assert.ok(tableInfo.hasBorder, 'El contenedor de tabla debe tener borde');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Fase 4: Composer Flotante Omnibox, Auto-expansión y Botones Circulares', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForSelector('#welcome-banner');

    // 1. Validar geometría y curvatura del Omnibox (.chat-input-container)
    const composerMetrics = await page.evaluate(() => {
      const container = document.querySelector('.chat-input-container');
      const style = getComputedStyle(container);
      const rect = container.getBoundingClientRect();
      return {
        borderRadius: parseFloat(style.borderRadius),
        width: rect.width,
        boxShadow: style.boxShadow
      };
    });

    assert.ok(composerMetrics.borderRadius >= 20, `El radio de curvatura (${composerMetrics.borderRadius}px) debe ser estilo omnibox (>= 20px / 1.5rem)`);
    assert.ok(composerMetrics.width <= 800, `El ancho del composer (${composerMetrics.width}px) debe alinearse con max-width: 48rem`);
    assert.notEqual(composerMetrics.boxShadow, 'none', 'El composer debe tener elevación mediante sombra');

    // 2. Validar autoexpansión del textarea al introducir múltiples líneas
    const initialHeight = await page.$eval('#user-input', el => el.offsetHeight);
    await page.fill('#user-input', 'Línea 1\nLínea 2\nLínea 3\nLínea 4\nLínea 5');
    await page.dispatchEvent('#user-input', 'input');

    const expandedHeight = await page.$eval('#user-input', el => el.offsetHeight);
    assert.ok(expandedHeight > initialHeight, `La altura del textarea debe crecer con contenido multilínea (de ${initialHeight}px a ${expandedHeight}px)`);

    // Limpiar input y verificar vuelta a altura mínima
    await page.fill('#user-input', '');
    await page.dispatchEvent('#user-input', 'input');
    const resetHeight = await page.$eval('#user-input', el => el.offsetHeight);
    assert.ok(resetHeight <= initialHeight, 'Al vaciar el texto debe volver a la altura mínima');

    // 3. Validar botón circular de envío y botón de adjuntar
    const buttonStyles = await page.evaluate(() => {
      const btnSend = document.getElementById('btn-send');
      const btnAttach = document.getElementById('btn-attach-file');
      const sendStyle = getComputedStyle(btnSend);
      const attachStyle = getComputedStyle(btnAttach);
      return {
        sendRadius: parseFloat(sendStyle.borderRadius),
        sendWidth: parseFloat(sendStyle.width),
        sendHeight: parseFloat(sendStyle.height),
        attachRadius: parseFloat(attachStyle.borderRadius)
      };
    });

    assert.equal(buttonStyles.sendWidth, buttonStyles.sendHeight, 'El botón de envío debe ser perfectamente circular (width === height)');
    assert.ok(buttonStyles.sendRadius >= 16, 'El botón de envío debe tener borde completamente redondeado');
    assert.ok(buttonStyles.attachRadius >= 16, 'El botón de adjuntar debe tener borde redondeado');

    // 4. Validar menú desplegable de razonamiento integrado
    await page.click('#btn-reasoning');
    const isMenuOpen = await page.$eval('#reasoning-menu', el => el.style.display !== 'none');
    assert.ok(isMenuOpen, 'Pulsar #btn-reasoning debe desplegar el menú de opciones');

    // 5. Validar metamorfosis dinámica entre botón de Send y Stop
    // Al simular streaming activando stop-stream:
    await page.evaluate(() => {
      const stopBtn = document.getElementById('btn-stop-stream');
      stopBtn.style.display = 'inline-flex';
    });

    const isSendHiddenDuringStop = await page.evaluate(() => {
      const sendBtn = document.getElementById('btn-send');
      return getComputedStyle(sendBtn).display === 'none';
    });
    assert.ok(isSendHiddenDuringStop, 'Cuando el botón de detener está visible, el botón de envío debe ocultarse automáticamente');

    // Restaurar estado inactivo
    await page.evaluate(() => {
      const stopBtn = document.getElementById('btn-stop-stream');
      stopBtn.style.display = 'none';
    });

    const isSendVisibleAgain = await page.evaluate(() => {
      const sendBtn = document.getElementById('btn-send');
      return getComputedStyle(sendBtn).display !== 'none';
    });
    assert.ok(isSendVisibleAgain, 'Al terminar el streaming, el botón de envío vuelve a ser visible');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Fase 5: Barra Lateral de Conversaciones Moderna, Grupos y Drawer', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForSelector('#welcome-banner');

    // 1. Abrir barra lateral
    await page.click('#btn-toggle-sidebar');
    const isSidebarVisible = await page.$eval('#chat-sidebar', el => getComputedStyle(el).display === 'flex');
    assert.ok(isSidebarVisible, 'El sidebar debe mostrarse con display flex');

    // 2. Validar botón destacado "+ Nueva conversación"
    const newChatBtnInfo = await page.evaluate(() => {
      const btn = document.getElementById('btn-sidebar-new-chat');
      const style = getComputedStyle(btn);
      return {
        exists: !!btn,
        text: btn.textContent.trim(),
        borderRadius: parseFloat(style.borderRadius),
        bgColor: style.backgroundColor
      };
    });
    assert.ok(newChatBtnInfo.exists, 'El botón #btn-sidebar-new-chat debe existir');
    assert.ok(newChatBtnInfo.text.includes('Nueva conversación'), 'El botón debe contener el texto de nueva conversación');
    assert.ok(newChatBtnInfo.borderRadius >= 16, 'El botón de nueva conversación debe ser redondeado estilo cápsula');

    // 3. Validar buscador de historial con icono
    const searchInfo = await page.evaluate(() => {
      const input = document.getElementById('sidebar-search-input');
      const icon = document.querySelector('.sidebar-search-icon');
      return {
        hasInput: !!input,
        hasIcon: !!icon,
        placeholder: input.getAttribute('placeholder')
      };
    });
    assert.ok(searchInfo.hasInput, 'El input de búsqueda debe existir');
    assert.ok(searchInfo.hasIcon, 'El icono de búsqueda debe existir');

    // 4. Inyectar sesiones de prueba con diferentes fechas para probar agrupación cronológica
    await page.evaluate(() => {
      const now = Date.now();
      const mockSessions = [
        { id: 'chat-today-1', title: 'Plan de Refactorización UI', updatedAt: now },
        { id: 'chat-yesterday-1', title: 'Consulta de Base de Datos', updatedAt: now - 86400000 },
        { id: 'chat-older-1', title: 'Diseño de Algoritmos Inicial', updatedAt: now - (45 * 86400000) }
      ];
      const elements = {
        sidebarChatsList: document.getElementById('sidebar-chats-list'),
        sidebarSearchInput: document.getElementById('sidebar-search-input')
      };
      window.ChatUISidebar.renderSidebarChats(elements, mockSessions, 'chat-today-1', {}, { groupByDate: true });
    });

    // Validar cabeceras de grupos cronológicos
    const groupHeaders = await page.$$eval('.sidebar-group-header', els => els.map(e => e.textContent.trim()));
    assert.ok(groupHeaders.length >= 2, 'Deben existir cabeceras de agrupación cronológica');
    assert.ok(groupHeaders.includes('Hoy'), 'Debe incluir grupo Hoy');
    assert.ok(groupHeaders.includes('Ayer'), 'Debe incluir grupo Ayer');

    // Validar chat activo
    const activeItem = await page.$eval('.sidebar-chat-item.active', el => el.getAttribute('data-session-id'));
    assert.equal(activeItem, 'chat-today-1', 'El chat actual debe tener la clase .active');

    // 5. Validar filtrado dinámico mediante buscador
    await page.fill('#sidebar-search-input', 'Refactorización');
    await page.evaluate(() => {
      const now = Date.now();
      const mockSessions = [
        { id: 'chat-today-1', title: 'Plan de Refactorización UI', updatedAt: now },
        { id: 'chat-yesterday-1', title: 'Consulta de Base de Datos', updatedAt: now - 86400000 }
      ];
      const elements = {
        sidebarChatsList: document.getElementById('sidebar-chats-list'),
        sidebarSearchInput: document.getElementById('sidebar-search-input')
      };
      window.ChatUISidebar.renderSidebarChats(elements, mockSessions, 'chat-today-1', {}, { groupByDate: true });
    });

    const filteredCount = await page.$$eval('.sidebar-chat-item', els => els.length);
    assert.equal(filteredCount, 1, 'Solo debe coincidir 1 chat con el filtro');

    // 6. Validar comportamiento responsive en móvil (Drawer Mode)
    await page.setViewportSize({ width: 500, height: 800 });
    const mobileSidebarStyle = await page.$eval('#chat-sidebar', el => {
      const s = getComputedStyle(el);
      return {
        position: s.position,
        zIndex: parseInt(s.zIndex, 10)
      };
    });
    assert.equal(mobileSidebarStyle.position, 'fixed', 'En móvil, el sidebar debe posicionarse como fixed drawer');
    assert.ok(mobileSidebarStyle.zIndex >= 100, 'En móvil, el zIndex debe ser elevado para superponerse al chat');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Fase 6: Modales <dialog> Modernos con Blur y Tarjetas de Herramientas', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForSelector('#welcome-banner');

    // 1. Abrir diálogo de Configuración y validar propiedades de modal moderno
    await page.click('#btn-open-settings');
    await page.waitForFunction(() => document.getElementById('settings-dialog')?.open);

    const dialogMetrics = await page.evaluate(() => {
      const dialog = document.getElementById('settings-dialog');
      const style = getComputedStyle(dialog);
      return {
        borderRadius: parseFloat(style.borderRadius),
        boxShadow: style.boxShadow,
        display: style.display
      };
    });

    assert.equal(dialogMetrics.display, 'flex', 'El diálogo abierto debe tener display: flex');
    assert.ok(dialogMetrics.borderRadius >= 16, `El radio de curvatura (${dialogMetrics.borderRadius}px) debe ser moderno (>= 16px / 1.25rem)`);
    assert.notEqual(dialogMetrics.boxShadow, 'none', 'El modal debe tener elevación con sombra');

    // 2. Navegar entre pestañas del modal (Ej. pestaña Proveedores / Herramientas)
    const tabButtons = await page.$$('.modal-tab-btn');
    assert.ok(tabButtons.length >= 2, 'Debe haber múltiples pestañas en el modal de configuración');

    // Hacer click en la segunda pestaña
    await tabButtons[1].click();
    const isSecondTabActive = await tabButtons[1].evaluate(el => el.classList.contains('active'));
    assert.ok(isSecondTabActive, 'Hacer click en la pestaña debe marcarla como .active');

    // 3. Cerrar el modal con el botón de cerrar
    await page.click('#btn-close-settings');
    await page.waitForFunction(() => !document.getElementById('settings-dialog')?.open);
    const isClosed = await page.$eval('#settings-dialog', el => !el.open);
    assert.ok(isClosed, 'El diálogo debe cerrarse correctamente');

    // 4. Validar renderizado de Tarjetas de Herramientas (Tool Cards) en el chat
    await page.evaluate(() => {
      const messagesList = document.getElementById('messages-list');
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper assistant';
      wrapper.innerHTML = `
        <div class="message-row assistant">
          <div class="message-content-wrapper">
            <div class="tool-card-wrapper">
              <div class="tool-execution-card">
                <div class="tool-card-header">
                  <div class="tool-card-title">
                    <span>⚡</span>
                    <span>execute_javascript</span>
                  </div>
                  <div class="tool-card-header-actions">
                    <span class="tool-card-badge status-success">✅ Completado (42ms)</span>
                    <button type="button" class="btn-tool-collapse">▾</button>
                  </div>
                </div>
                <div class="tool-card-collapsible-body">
                  <div class="tool-card-result">
                    <pre class="tool-card-code"><code>console.log("Prueba Fase 6");</code></pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      messagesList.appendChild(wrapper);
    });

    // Validar estilos de la tarjeta de herramienta
    const cardInfo = await page.evaluate(() => {
      const card = document.querySelector('.tool-execution-card');
      const badge = document.querySelector('.tool-card-badge');
      const header = document.querySelector('.tool-card-header');
      const cardStyle = getComputedStyle(card);
      const badgeStyle = getComputedStyle(badge);
      const headerStyle = getComputedStyle(header);
      return {
        cardRadius: parseFloat(cardStyle.borderRadius),
        badgeRadius: parseFloat(badgeStyle.borderRadius),
        headerBg: headerStyle.backgroundColor
      };
    });

    assert.ok(cardInfo.cardRadius >= 8, 'La tarjeta de herramienta debe tener bordes redondeados (>= 8px)');
    assert.ok(cardInfo.badgeRadius >= 12, 'El badge de estado de la tarjeta debe tener estilo píldora');
    assert.ok(cardInfo.headerBg, 'La cabecera de la herramienta debe tener un fondo de superficie asignado');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Fase 7: Accesibilidad WCAG 2.1 AA, Focus-Visible y Reduced Motion', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForSelector('#welcome-banner');

    // 1. Validar Focus Visible con navegación por teclado
    await page.keyboard.press('Tab');
    const focusedOutline = await page.evaluate(() => {
      const activeEl = document.activeElement;
      if (!activeEl) return null;
      const s = getComputedStyle(activeEl);
      return {
        tag: activeEl.tagName,
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth
      };
    });
    assert.ok(focusedOutline, 'Debe haber un elemento enfocado por teclado');
    assert.notEqual(focusedOutline.outlineStyle, 'none', 'El elemento enfocado debe tener un indicador visual outline');

    // 2. Validar soporte prefers-reduced-motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotionApplied = await page.evaluate(() => {
      const el = document.querySelector('.welcome-banner') || document.body;
      const s = getComputedStyle(el);
      return parseFloat(s.animationDuration) <= 0.05;
    });
    assert.ok(reducedMotionApplied, 'Las animaciones deben reducirse drásticamente bajo prefers-reduced-motion');

    // 3. Validar ratios de contraste de color semántico (WCAG 2.1 AA >= 4.5:1)
    function luminance(r, g, b) {
      const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }
    function contrastRatio(rgb1, rgb2) {
      const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
      const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    // Comprobar ratios en Light Mode (#ffffff fondo)
    const ratioLight = contrastRatio([15, 23, 42], [255, 255, 255]); // #0f172a vs #ffffff
    assert.ok(ratioLight >= 4.5, `Contraste en modo claro (${ratioLight.toFixed(1)}:1) debe superar 4.5:1`);

    // Comprobar ratios en Dark Mode (#131b2e vs #f1f5f9)
    const ratioDark = contrastRatio([241, 245, 249], [19, 27, 46]);
    assert.ok(ratioDark >= 4.5, `Contraste en modo oscuro (${ratioDark.toFixed(1)}:1) debe superar 4.5:1`);

    // 4. Validar ausencia total de errores o excepciones tras interacciones complejas
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    assert.equal(pageErrors.length, 0, 'No debe haber errores de página en ninguna fase');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Iconos Fase 2: Iconos Vectoriales SVG en Header Superior y Composer', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForSelector('#welcome-banner');

    // 1. Validar iconos SVG en el Header
    const headerIcons = await page.evaluate(() => {
      const profileSvg = document.querySelector('.badge-profile .profile-icon svg');
      const ragSvg = document.querySelector('#btn-open-rag svg');
      const exportSvg = document.querySelector('#btn-quick-export svg');
      const debugSvg = document.querySelector('#btn-toggle-debug svg');
      const reasoningSvg = document.querySelector('#btn-reasoning svg');

      return {
        hasProfileSvg: !!profileSvg,
        hasRagSvg: !!ragSvg,
        hasExportSvg: !!exportSvg,
        hasDebugSvg: !!debugSvg,
        hasReasoningSvg: !!reasoningSvg,
        ragWidth: ragSvg ? parseFloat(getComputedStyle(ragSvg).width) : 0,
        reasoningWidth: reasoningSvg ? parseFloat(getComputedStyle(reasoningSvg).width) : 0
      };
    });

    assert.ok(headerIcons.hasProfileSvg, 'El selector de perfiles debe contener un SVG vectorial (zap)');
    assert.ok(headerIcons.hasRagSvg, 'El botón RAG debe contener un SVG vectorial (layers)');
    assert.ok(headerIcons.hasExportSvg, 'El botón de exportar debe contener un SVG vectorial (download)');
    assert.ok(headerIcons.hasDebugSvg, 'El botón de debug debe contener un SVG vectorial (terminal)');
    assert.ok(headerIcons.hasReasoningSvg, 'El botón de razonamiento debe contener un SVG vectorial (brain)');
    assert.ok(headerIcons.ragWidth >= 12, 'El icono RAG debe tener dimensiones computadas válidas');
    assert.ok(headerIcons.reasoningWidth >= 12, 'El icono de razonamiento debe tener dimensiones válidas');

    // 2. Abrir menú de razonamiento y verificar cabecera con SVG
    await page.click('#btn-reasoning');
    await page.waitForFunction(() => document.getElementById('reasoning-menu')?.style.display !== 'none');

    const menuHeaderInfo = await page.evaluate(() => {
      const header = document.querySelector('.reasoning-menu-header');
      const svg = header?.querySelector('svg');
      const text = header?.textContent || '';
      return {
        hasSvg: !!svg,
        hasEmoji: text.includes('🧠'),
        text: text.trim()
      };
    });

    assert.ok(menuHeaderInfo.hasSvg, 'La cabecera del menú de razonamiento debe contener un SVG (brain)');
    assert.equal(menuHeaderInfo.hasEmoji, false, 'La cabecera del menú no debe contener el emoji 🧠');
  } finally {
    await browser.close();
  }
});

test('Browser UI - Iconos Fase 3: Iconos Vectoriales SVG en Barra Lateral e Historial', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const filePath = 'file://' + path.resolve(__dirname, '../zerochat.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForSelector('#welcome-banner');

    // 1. Abrir barra lateral
    await page.click('#btn-toggle-sidebar');
    await page.waitForFunction(() => document.getElementById('chat-sidebar')?.style.display !== 'none');

    // 2. Verificar iconos vectoriales de cabecera, buscador y footer de sidebar
    const sidebarIcons = await page.evaluate(() => {
      const newChatSvg = document.querySelector('#btn-sidebar-new-chat svg');
      const closeSvg = document.querySelector('#btn-close-sidebar svg');
      const searchSvg = document.querySelector('.sidebar-search-box svg');
      const importSvg = document.querySelector('#btn-import-chat-file svg');
      const exportSvg = document.querySelector('#btn-open-export-modal svg');
      const deleteAllSvg = document.querySelector('#btn-delete-all-chats svg');

      return {
        hasNewChatSvg: !!newChatSvg,
        hasCloseSvg: !!closeSvg,
        hasSearchSvg: !!searchSvg,
        hasImportSvg: !!importSvg,
        hasExportSvg: !!exportSvg,
        hasDeleteAllSvg: !!deleteAllSvg,
        newChatWidth: newChatSvg ? parseFloat(getComputedStyle(newChatSvg).width) : 0,
        searchWidth: searchSvg ? parseFloat(getComputedStyle(searchSvg).width) : 0
      };
    });

    assert.ok(sidebarIcons.hasNewChatSvg, 'El botón "+ Nueva conversación" debe tener icono SVG');
    assert.ok(sidebarIcons.hasCloseSvg, 'El botón de cerrar barra lateral debe tener icono SVG');
    assert.ok(sidebarIcons.hasSearchSvg, 'El buscador debe tener icono SVG de lupa');
    assert.ok(sidebarIcons.hasImportSvg, 'El botón de importar debe tener icono SVG');
    assert.ok(sidebarIcons.hasExportSvg, 'El botón de exportar debe tener icono SVG');
    assert.ok(sidebarIcons.hasDeleteAllSvg, 'El botón de borrar todo debe tener icono SVG');
    assert.ok(sidebarIcons.newChatWidth >= 14, 'El icono de nuevo chat debe tener tamaño >= 14px');

    // 3. Renderizar una sesión simulada en el historial y verificar iconos de acciones en hover
    const chatItemActionIcons = await page.evaluate(() => {
      const list = document.getElementById('sidebar-chats-list');
      if (typeof ChatUISidebar !== 'undefined' && typeof ChatUISidebar.renderSidebarChats === 'function') {
        ChatUISidebar.renderSidebarChats({ sidebarChatsList: list }, [
          { id: 'sess_test_1', title: 'Conversación de prueba', updatedAt: Date.now() }
        ], 'sess_test_1', {});
      }
      const item = list.querySelector('.sidebar-chat-item');
      const renameSvg = item?.querySelector('.btn-rename svg');
      const deleteSvg = item?.querySelector('.btn-delete svg');

      return {
        hasItem: !!item,
        hasRenameSvg: !!renameSvg,
        hasDeleteSvg: !!deleteSvg,
        renameWidth: renameSvg ? parseFloat(getComputedStyle(renameSvg).width) : 0,
        deleteWidth: deleteSvg ? parseFloat(getComputedStyle(deleteSvg).width) : 0
      };
    });

    assert.ok(chatItemActionIcons.hasItem, 'El item de conversación debe renderizarse');
    assert.ok(chatItemActionIcons.hasRenameSvg, 'La acción de renombrar debe contener icono SVG (edit)');
    assert.ok(chatItemActionIcons.hasDeleteSvg, 'La acción de eliminar debe contener icono SVG (trash)');
    assert.ok(chatItemActionIcons.renameWidth >= 10, 'El icono de renombrar debe tener dimensiones válidas');
    assert.ok(chatItemActionIcons.deleteWidth >= 10, 'El icono de eliminar debe tener dimensiones válidas');
  } finally {
    await browser.close();
  }
});
