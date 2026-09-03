const { test } = require('node:test');
const assert = require('node:assert/strict');
const FileParser = require('../js/file-parser.js');

test('FileParser - desofusca desplazamiento de glifos/fuente (+3) en tablas PDF', () => {
  // Casos reportados por el usuario
  assert.equal(
    FileParser.decodePdfShiftedText('O L T X L G L W \\'),
    'LIQUIDITY'
  );

  assert.equal(
    FileParser.decodePdfShiftedText('F R D O P L Q H G'),
    'COAL MINED'
  );

  // Fila tabular con cifras numéricas (comas y puntos decimales codificados en +3)
  assert.equal(
    FileParser.decodePdfShiftedText('O L T X L G L W \\   4 / 5 6 7 1 8 3'),
    'LIQUIDITY 1,234.50'
  );

  assert.equal(
    FileParser.decodePdfShiftedText('F R D O P L Q H G   : ; < 1 5'),
    'COAL MINED 789.2'
  );
});

test('FileParser - desofusca tablas multilínea con números y términos financieros', () => {
  const shiftedTable = [
    'O L T X L G L W \\   4 / 5 6 7 1 8 3',
    'F D V K   D Q G   F D V K   H T X L Y D O H Q W V   8 9 1 0',
    '4 / 8 3 3 1 3 3'
  ].join('\n');

  const decoded = FileParser.decodePdfShiftedText(shiftedTable);
  assert.match(decoded, /LIQUIDITY 1,234\.50/);
  assert.match(decoded, /CASH/);
  assert.match(decoded, /1,500\.00/);
});

test('FileParser - no altera texto normal en español o inglés (evita falsos positivos)', () => {
  const spanishText = 'El presente informe anual corresponde al ejercicio 2023. La empresa aumentó sus ventas.';
  assert.equal(FileParser.decodePdfShiftedText(spanishText), spanishText);

  const englishText = 'The quick brown fox jumps over the lazy dog. Revenue was positive in Q3.';
  assert.equal(FileParser.decodePdfShiftedText(englishText), englishText);
});

test('FileParser - compacta glifos espaciados de PDF antes de indexarlos', () => {
  const extracted = 'C a s h F l o w\nC a p i t a l E x p e n d i t u r e s';
  const normalized = FileParser.decodePdfShiftedText(extracted);

  assert.doesNotMatch(normalized, /C a s h/);
  assert.doesNotMatch(normalized, /C a p i t a l/);
  assert.match(normalized, /CASH FLOW/);
  assert.match(normalized, /CAPITAL EXPENDITURES/);
});
