const { test } = require('node:test');
const assert = require('node:assert/strict');
const Markdown = require('../js/markdown.js');

test('Markdown - Escape HTML básico', () => {
  const safe = Markdown.escapeHtml('<script>alert(1)</script>');
  assert.equal(safe, '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('Markdown - Renderizado de tablas GFM', () => {
  const md = '| Col 1 | Col 2 |\n| :--- | :---: |\n| Val A | Val B |';
  const html = Markdown.parseMarkdown(md);
  assert.ok(html.includes('<table class="markdown-table">'), 'Debe generar <table>');
  assert.ok(html.includes('Col 1</th>'), 'Debe contener cabecera');
  assert.ok(html.includes('Val A</td>'), 'Debe contener celda');
});

test('Markdown - Renderizado de bloques de código', () => {
  const md = '```javascript\nconst x = 10;\n```';
  const html = Markdown.parseMarkdown(md);
  assert.ok(html.includes('code-block-container'), 'Debe contener contenedor de código');
  assert.ok(html.includes('const x = 10;'), 'Debe incluir el código');
});

test('Markdown - Renderizado de bloques de pensamiento <think> y <thought>', () => {
  const md = '<thought>Razonando la respuesta</thought>Respuesta final';
  const html = Markdown.parseMarkdown(md);
  assert.ok(html.includes('<details class="thought-block"'), 'Debe generar bloque <details> para pensamiento');
  assert.ok(html.includes('Razonando la respuesta'), 'Debe contener el razonamiento');
  assert.ok(html.includes('Respuesta final'), 'Debe contener la respuesta final');
});
