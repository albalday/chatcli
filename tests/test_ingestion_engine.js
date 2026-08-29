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

test('IngestionEngine - Reparación de JSON con texto conversacional y comas sobrantes', async () => {
  const sampleText = 'Documento de políticas internas.';
  
  // LLM que devuelve prefacio conversacional, comas sobrantes y sufijo
  const noisyLLM = async () => {
    return `
      ¡Hola! Aquí tienes la estructura JSON solicitada:
      \`\`\`json
      {
        "globalSummary": "Resumen con comas sobrantes.",
        "chapters": [
          {
            "chapterId": 1,
            "title": "Capítulo 1",
            "summary": "Resumen 1",
            "content": "Contenido 1",
          },
        ],
      }
      \`\`\`
      Espero que te sea de gran utilidad.
    `;
  };

  const result = await IngestionEngine.analyzeDocumentStructure(sampleText, 'Politicas.md', noisyLLM);
  assert.ok(result);
  assert.equal(result.globalSummary, 'Resumen con comas sobrantes.');
  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, 'Capítulo 1');
});

test('IngestionEngine - Auto-reintento (1 retry) si el primer intento falla en formatear JSON', async () => {
  const sampleText = 'Documento para prueba de reintento.';
  let attemptCount = 0;

  const flakyLLM = async (prompt) => {
    attemptCount++;
    if (attemptCount === 1) {
      // Primer intento: texto no JSON
      return 'Lo siento, no pude generar el formato JSON pedido.';
    }
    // Segundo intento (reintento automático): JSON estructurado válido
    return JSON.stringify({
      globalSummary: 'Resumen obtenido tras reintento exitoso.',
      chapters: [
        {
          chapterId: 1,
          title: 'Capítulo Reintentado',
          summary: 'Resumen ok.',
          content: 'Contenido ok.'
        }
      ]
    });
  };

  const result = await IngestionEngine.analyzeDocumentStructure(sampleText, 'Reintento.txt', flakyLLM);
  assert.equal(attemptCount, 2, 'Debe haber ejecutado exactamente 1 reintento');
  assert.equal(result.globalSummary, 'Resumen obtenido tras reintento exitoso.');
  assert.equal(result.chapters.length, 1);
});

test('IngestionEngine - Partición con protección atómica de imágenes y límite K de contexto', async () => {
  const docWithImages = `
# Guía de Hardware y Conexiones
Esta guía detalla el cableado principal de la fuente y periféricos.

## Conectores del Panel Frontal
A continuación se muestra el esquema del conector JFP1:
![Diagrama JFP1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==)

Asegúrese de respetar la polaridad de los LEDs.

<img src="https://example.com/images/audio_panel.svg" alt="Audio Frontal" />

## Configuración de Memoria RAM
Coloque los módulos en las ranuras DIMMA2 y DIMMB2 para activar Dual Channel.
  `.trim();

  // Partición con límite de 4K
  const chapters = IngestionEngine.partitionTextIntoHeuristicChapters(docWithImages, 4);
  assert.ok(chapters.length >= 2, 'Debe identificar las secciones');
  
  // Verificar que la imagen Base64 y la etiqueta HTML no fueron cortadas
  const jfpChapter = chapters.find(c => c.title.includes('Conectores') || c.content.includes('JFP1'));
  assert.ok(jfpChapter, 'Debe existir el capítulo con conectores');
  assert.ok(jfpChapter.content.includes('![Diagrama JFP1](data:image/png;base64,'), 'La imagen Markdown debe estar intacta');
  assert.ok(jfpChapter.content.includes('<img src="https://example.com/images/audio_panel.svg"'), 'La etiqueta img HTML debe estar intacta');
});
