const { test } = require('node:test');
const assert = require('node:assert/strict');
const UISettings = require('../js/ui-settings.js');

test('UISettings - applyTheme actualiza data-theme y botones activos', () => {
  const btnLight = {
    className: '',
    getAttribute: (name) => name === 'data-theme' ? 'light' : null,
    classList: {
      add: (cls) => { btnLight.className = cls; },
      remove: () => { btnLight.className = ''; }
    }
  };
  const btnDark = {
    className: '',
    getAttribute: (name) => name === 'data-theme' ? 'dark' : null,
    classList: {
      add: (cls) => { btnDark.className = cls; },
      remove: () => { btnDark.className = ''; }
    }
  };

  const elements = { themeButtons: [btnLight, btnDark] };
  const appConfig = { theme: 'light' };

  const themeDark = UISettings.applyTheme(elements, appConfig, 'dark');
  assert.equal(themeDark, 'dark');
  assert.equal(appConfig.theme, 'dark');
  assert.equal(btnDark.className, 'active');
  assert.equal(btnLight.className, '');

  const themeLight = UISettings.applyTheme(elements, appConfig, 'light');
  assert.equal(themeLight, 'light');
  assert.equal(appConfig.theme, 'light');
  assert.equal(btnLight.className, 'active');
});

test('UISettings - gatherEnabledToolsFromUI extrae mapa booleano de checkboxes', () => {
  const checkboxes = [
    { getAttribute: () => 'search_web', checked: true },
    { getAttribute: () => 'execute_javascript', checked: false }
  ];

  const fakeContainer = {
    querySelectorAll: (sel) => sel === '.agent-tool-checkbox' ? checkboxes : []
  };

  const map = UISettings.gatherEnabledToolsFromUI(fakeContainer);
  assert.deepEqual(map, {
    search_web: true,
    execute_javascript: false
  });
});

test('UISettings - applyProfileToForm rellena los inputs de configuración', () => {
  const elements = {
    settingApiType: { value: '' },
    settingApiUrl: { value: '' },
    settingApiKey: { value: '' },
    settingModel: { value: '' },
    modelSelectHelper: { value: '' },
    settingSystemPrompt: { value: '' },
    settingTemperature: { value: '' },
    temperatureVal: { textContent: '' },
    settingEnableContextCache: { checked: false },
    settingEnableRawLogs: { checked: false },
    settingSendDateTime: { checked: false }
  };

  const profileData = {
    apiType: 'anthropic',
    apiUrl: 'https://api.anthropic.com/v1',
    apiKey: 'sk-ant-test',
    model: 'claude-3-7-sonnet',
    systemPrompt: 'Eres un asistente experto.',
    temperature: '0.2',
    enableContextCache: true,
    enableRawLogs: true,
    sendDateTime: true
  };

  UISettings.applyProfileToForm(elements, profileData);

  assert.equal(elements.settingApiType.value, 'anthropic');
  assert.equal(elements.settingApiUrl.value, 'https://api.anthropic.com/v1');
  assert.equal(elements.settingApiKey.value, 'sk-ant-test');
  assert.equal(elements.settingModel.value, 'claude-3-7-sonnet');
  assert.equal(elements.settingSystemPrompt.value, 'Eres un asistente experto.');
  assert.equal(elements.settingTemperature.value, '0.2');
  assert.equal(elements.temperatureVal.textContent, '0.2');
  assert.equal(elements.settingEnableContextCache.checked, true);
  assert.equal(elements.settingEnableRawLogs.checked, true);
  assert.equal(elements.settingSendDateTime.checked, true);
});
