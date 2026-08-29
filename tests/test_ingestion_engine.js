const { test } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');
const IngestionEngine = require('../js/ingestionEngine.js');

test('IngestionEngine - Normalización y extracción de texto plano', async () => {
  const rawText = 'Línea 1\r\nLínea 2\x00\x07 con caracteres especiales y acentos: acción.';
  const extracted = await IngestionEngine.extractTextFromPlainText(rawText);

  assert.ok(!extracted.includes('\r\n'));
  assert.ok(!extracted.includes('\x00'));
  assert.ok(extracted.includes('Línea 1\nLínea 2'));
  assert.ok(extracted.includes('acción.'));
});

test('IngestionEngine - Partición heurística de documentos en capítulos', async () => {
  const sampleDoc = `
# Introducción a la Arquitectura
Este es el primer capítulo introductorio sobre los principios de diseño de software.

## Patrones de Diseño
Aquí se explican los patrones creacionales, estructurales y de comportamiento.

### Inyección de Dependencias
Detalle específico sobre cómo desacoplar los servicios.

## Despliegue e Infraestructura
Instrucciones detalladas de despliegue en entornos productivos.
`.trim();

  const chapters = IngestionEngine.partitionTextIntoHeuristicChapters(sampleDoc, 2000);
  assert.ok(chapters.length >= 2, 'Debe segmentar el documento en al menos 2 secciones');
  assert.ok(chapters[0].title);
  assert.ok(chapters[0].content);
});

test('IngestionEngine - analyzeDocumentStructure con respuesta JSON estructurada del LLM', async () => {
  const sampleText = 'Manual de seguridad con dos secciones principales.';
  
  // Mock LLM que responde con JSON válido
  const mockLLM = async (prompt, systemPrompt) => {
    return JSON.stringify({
      globalSummary: 'Resumen completo de la normativa de seguridad de la empresa.',
      chapters: [
        {
          chapterId: 1,
          title: 'Control de Accesos',
          summary: 'Políticas de autenticación MFA y gestión de contraseñas.',
          content: 'Todos los empleados deben usar MFA obligatorio.'
        },
        {
          chapterId: 2,
          title: 'Cifrado de Datos',
          summary: 'Cifrado en reposo y en tránsito mediante TLS 1.3.',
          content: 'Los datos deben cifrarse con AES-256.'
        }
      ]
    });
  };

  const result = await IngestionEngine.analyzeDocumentStructure(sampleText, 'Seguridad.md', mockLLM);

  assert.ok(result.globalSummary.includes('normativa de seguridad'));
  assert.equal(result.chapters.length, 2);
  assert.equal(result.chapters[0].chapterId, 1);
  assert.equal(result.chapters[0].title, 'Control de Accesos');
  assert.equal(result.chapters[1].title, 'Cifrado de Datos');
});

test('IngestionEngine - analyzeDocumentStructure con JSON envuelto en Markdown ```json', async () => {
  const sampleText = 'Documento breve de pruebas.';

  const mockLLM = async () => {
    return `Aquí tienes el análisis solicitado:
\`\`\`json
{
  "globalSummary": "Resumen encapsulado en markdown.",
  "chapters": [
    {
      "chapterId": 1,
      "title": "Capítulo Único",
      "summary": "Resumen conciso.",
      "content": "Contenido del capítulo."
    }
  ]
}
\`\`\``;
  };

  const result = await IngestionEngine.analyzeDocumentStructure(sampleText, 'Prueba.txt', mockLLM);
  assert.equal(result.globalSummary, 'Resumen encapsulado en markdown.');
  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, 'Capítulo Único');
});

test('IngestionEngine - processDocumentQueue procesa secuencialmente y emite eventos', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Rama de Pruebas Ingesta');
  const progressEvents = [];

  const files = [
    {
      name: 'doc1.md',
      content: '# Sección 1\nContenido de prueba para el documento 1.'
    },
    {
      name: 'doc2.txt',
      content: 'Contenido simple de prueba para el documento 2.'
    }
  ];

  const mockLLM = async (prompt) => {
    return JSON.stringify({
      globalSummary: 'Resumen generado por el mock.',
      chapters: [
        {
          chapterId: 1,
          title: 'Sección Principal',
          summary: 'Micro resumen.',
          content: prompt
        }
      ]
    });
  };

  const onProgress = (prog) => {
    progressEvents.push({ ...prog });
  };

  const result = await IngestionEngine.processDocumentQueue(files, branch.id, mockLLM, onProgress);

  assert.equal(result.total, 2);
  assert.equal(result.processed, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.documents.length, 2);

  // Verificar contrato de eventos de progreso
  assert.ok(progressEvents.length >= 6, 'Debe emitir múltiples eventos de micro-pasos');
  assert.equal(progressEvents[0].fileIndex, 0);
  assert.equal(progressEvents[0].totalFiles, 2);
  assert.equal(progressEvents[0].fileName, 'doc1.md');
  assert.ok(['reading', 'generating_summaries', 'saving', 'completed'].includes(progressEvents[0].status));

  // Verificar que los documentos fueron guardados en RagStorage
  const storedDocs = await RagStorage.getDocumentsByBranch(branch.id);
  assert.equal(storedDocs.length, 2);
  const titles = storedDocs.map(d => d.title);
  assert.ok(titles.includes('doc1.md'));
  assert.ok(titles.includes('doc2.txt'));
});

test('IngestionEngine - processDocumentQueue continúa ante fallos individuales (Resiliencia)', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Rama Resiliencia');
  const progressEvents = [];

  const files = [
    {
      name: 'doc_vacio.txt',
      content: '   ' // Texto vacío intencional para forzar error en el primer archivo
    },
    {
      name: 'doc_valido.md',
      content: '# Documento Válido\nTexto que debe procesarse con éxito.'
    }
  ];

  const mockLLM = async () => {
    return JSON.stringify({
      globalSummary: 'Resumen válido.',
      chapters: [
        {
          chapterId: 1,
          title: 'Capítulo 1',
          summary: 'Resumen.',
          content: 'Texto válido.'
        }
      ]
    });
  };

  const result = await IngestionEngine.processDocumentQueue(files, branch.id, mockLLM, (p) => progressEvents.push(p));

  // Debe haber 1 fallido y 1 procesado
  assert.equal(result.total, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.processed, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].fileName, 'doc_vacio.txt');

  // Verificar que el evento de error fue emitido
  const errorEvent = progressEvents.find(e => e.status === 'error');
  assert.ok(errorEvent);
  assert.equal(errorEvent.fileName, 'doc_vacio.txt');

  // Verificar que el documento válido sí se guardó en la base de datos
  const docs = await RagStorage.getDocumentsByBranch(branch.id);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'doc_valido.md');
});
