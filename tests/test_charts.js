const { test } = require('node:test');
const assert = require('node:assert/strict');
const Charts = require('../js/charts.js');

test('Charts - Generación de gráfico de barras SVG', () => {
  const spec = {
    type: 'bar',
    title: 'Ventas Trimestrales',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [{ label: 'Ingresos', data: [100, 200, 150, 300] }]
  };
  const html = Charts.renderChartCard(spec);
  assert.ok(html.includes('<svg'), 'Debe generar una etiqueta <svg>');
  assert.ok(html.includes('Ventas Trimestrales'), 'Debe incluir el título');
  assert.ok(html.includes('chat-chart-card'), 'Debe tener contenedor de gráfico');
});

test('Charts - Generación de gráfico de líneas', () => {
  const spec = {
    type: 'line',
    title: 'Tendencia',
    labels: ['Ene', 'Feb', 'Mar'],
    datasets: [{ label: 'Usuarios', data: [10, 25, 40] }]
  };
  const html = Charts.renderChartCard(spec);
  assert.ok(html.includes('<svg') && (html.includes('<path') || html.includes('<polyline') || html.includes('<circle')), 'Debe generar líneas de gráfico');
});

test('Charts - Generación de gráfico de tarta / donut', () => {
  const spec = {
    type: 'pie',
    title: 'Distribución',
    labels: ['A', 'B'],
    datasets: [{ data: [60, 40] }]
  };
  const html = Charts.renderChartCard(spec);
  assert.ok(html.includes('<svg'), 'Debe generar svg para pie chart');
});
