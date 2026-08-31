const { test } = require('node:test');
const assert = require('node:assert/strict');
const ChatFileSystem = require('../js/file-system.js');
const RagStorage = require('../js/ragStorage.js');
const IngestionEngine = require('../js/ingestionEngine.js');
const FileParser = require('../js/file-parser.js');
const { createMockDirectoryHandle } = require('./mock_file_system_handle.js');

// Configurar mock de directorio para el entorno de test en Node.js
const mockRoot = createMockDirectoryHandle('zerochat');
ChatFileSystem.setRootDirectoryHandle(mockRoot);

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

  // Partición con límite de 16K tokens (mínimo)
  const chapters = IngestionEngine.partitionTextIntoHeuristicChapters(docWithImages, 16);
  assert.ok(chapters.length >= 2, 'Debe identificar las secciones');
  
  // Verificar que la imagen Base64 y la etiqueta HTML no fueron cortadas
  const jfpChapter = chapters.find(c => c.title.includes('Conectores') || c.content.includes('JFP1'));
  assert.ok(jfpChapter, 'Debe existir el capítulo con conectores');
  assert.ok(jfpChapter.content.includes('![Diagrama JFP1](data:image/png;base64,'), 'La imagen Markdown debe estar intacta');
  assert.ok(jfpChapter.content.includes('<img src="https://example.com/images/audio_panel.svg"'), 'La etiqueta img HTML debe estar intacta');

  // Partición con límite amplio de 256K y 1024K tokens
  const chapters256k = IngestionEngine.partitionTextIntoHeuristicChapters(docWithImages, 256);
  assert.ok(chapters256k.length >= 1, 'Debe mantener el documento estructurado en rango 256K');

  const chapters1M = IngestionEngine.partitionTextIntoHeuristicChapters(docWithImages, 1024);
  assert.ok(chapters1M.length >= 1, 'Debe soportar 1M tokens');
});

test('IngestionEngine - prepareTextForSummarization extrae contexto de 10 líneas y omite base64 pesado', () => {
  const textWithImages = `
Línea 1: Manual de instalación del hardware.
Línea 2: Desconecte la alimentación eléctrica.
Línea 3: Conecte el cable de 24 pines ATX.
Línea 4: Esquema detallado del panel frontal y conectores JFP1:
![Diagrama JFP1](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=)
Línea 5: El LED positivo corresponde al pin 1.
Línea 6: El interruptor de encendido va en pines 6 y 8.
Línea 7: Verifique la polaridad antes de encender.
  `.trim();

  const prepared = IngestionEngine.prepareTextForSummarization(textWithImages);
  assert.ok(!prepared.includes('data:image/jpeg;base64'), 'No debe incluir la cadena base64 en el texto del resumen');
  assert.ok(prepared.includes('[IMAGEN / ESQUEMA: "Diagrama JFP1"'), 'Debe incluir la etiqueta referencial de la imagen');
  assert.ok(prepared.includes('Esquema detallado del panel frontal'), 'Debe incluir las líneas de contexto anterior');
  assert.ok(prepared.includes('El LED positivo corresponde al pin 1'), 'Debe incluir las líneas de contexto posterior');
});

test('IngestionEngine - Partición de PDF por páginas completas', () => {
  const paginatedPdfText = `
--- Página 1 ---
# Overview & Specifications
Especificaciones técnicas de la placa base Z790.
Soporta procesadores Intel Core 14th Gen y memoria DDR5.

--- Página 2 ---
## Panel de E/S Trasero
Puertos USB 3.2 Gen 2x2, HDMI 2.1 y DisplayPort 1.4.

--- Página 3 ---
## Ranuras PCIe y M.2
Ranura PCIe 5.0 x16 reforzada y 4 ranuras M.2 Shield Frozr.

--- Página 4 ---
## Configuración de BIOS UEFI
Instrucciones para actualizar BIOS con M-Flash.
  `.trim();

  const chapters = IngestionEngine.partitionTextIntoHeuristicChapters(paginatedPdfText, 16);
  assert.ok(chapters.length >= 1, 'Debe generar capítulos por páginas');
  chapters.forEach(chap => {
    assert.ok(chap.pageRange, 'Cada capítulo debe tener su rango de páginas asignado');
    assert.ok(chap.title.includes('Pág'), 'El título debe indicar las páginas comprendidas');
  });
});

test('FileParser - Filtra fuentes TrueType/Type1 y extrae texto limpio y diagramas de PDF', async () => {
  // Simular un PDF sintético con stream de fuente que debe ser ignorado y stream de texto BT...ET que debe extraerse
  const mockPdf = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /FontFile2 /Length 45 >>
stream
(Typeface Monotype Arial Font Data \x00\x01\x02\x03)
endstream
endobj
2 0 obj
<< /Length 75 >>
stream
BT
/F1 12 Tf
72 712 Td
(GA-Z77P-D3 Motherboard User Manual) Tj
ET
endstream
endobj
%%EOF`);

  const extracted = await FileParser.extractTextFromPdf(mockPdf.buffer);
  assert.ok(extracted.includes('GA-Z77P-D3 Motherboard User Manual'), 'Debe extraer el texto de página en bloque BT...ET');
  assert.ok(!extracted.includes('Typeface Monotype Arial'), 'Debe ignorar por completo streams de fuentes (/FontFile2)');
});

test('IngestionEngine - Generación de payload multimodal con imágenes in-line para el LLM', async () => {
  const paginatedDoc = `
--- Página 1 ---
# Overview
Introducción a la placa base.

--- Página 2 ---
## Panel Trasero
Detalles de conectores y puertos traseros.
![Diagrama E/S #img_2_1](rag-image://img_2_1)
`.trim();

  const mockImages = [
    {
      id: 'img_2_1',
      page: 2,
      caption: 'Diagrama E/S (Pág. 2)',
      dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...'
    }
  ];

  const receivedCalls = [];

  const mockMultimodalLLM = async (prompt, systemPrompt) => {
    receivedCalls.push({ prompt, systemPrompt });
    return 'Resumen de prueba con diagrama #img_2_1';
  };

  const result = await IngestionEngine.analyzeDocumentStructure(
    paginatedDoc,
    'manual.pdf',
    mockMultimodalLLM,
    null,
    16,
    { images: mockImages }
  );

  assert.ok(result);
  assert.ok(result.chapters.length >= 1);
  
  // Buscar la llamada de capítulo que contenía la imagen de la página 2
  const multimodalCall = receivedCalls.find(c => Array.isArray(c.prompt) && c.prompt.some(p => p.type === 'image_url'));
  assert.ok(multimodalCall, 'Debe haber al menos una llamada multimodal con array de prompt e imágenes');
  assert.ok(multimodalCall.systemPrompt.includes('visión multimodal'), 'System prompt del capítulo debe instruir visión multimodal');
  
  const textPart = multimodalCall.prompt.find(p => p.type === 'text');
  const imgPart = multimodalCall.prompt.find(p => p.type === 'image_url');
  assert.ok(textPart && textPart.text.includes('Panel Trasero'));
  assert.ok(imgPart && imgPart.image_url.url.startsWith('data:image/jpeg;base64,'));
});

test('IngestionEngine - Detección de títulos de capítulos genérica y multiidioma (ES, EN, DE, FR, IT)', () => {
  const multilingualDoc = `
--- Page 1 ---
# Chapter 1: System Architecture
This section provides an overview of the microservices ecosystem.

--- Seite 2 ---
## Kapitel 2: Sicherheitsrichtlinien
Hier werden die Richtlinien für Datenverschlüsselung und Authentifizierung definiert.

--- Page 3 ---
3.1.2 Procédures de Déploiement
Instructions détaillées pour le déploiement sur les serveurs de production.

--- Pagina 4 ---
NORMATIVA GENERALE SULLA PRIVACY
Trattamento dei dati personali e conformità con il regolamento europeo.

--- Página 5 ---
Apéndice B: Glosario de Términos
Definición de acrónimos y vocabulario técnico utilizado a lo largo del documento.
`.trim();

  const chapters = IngestionEngine.partitionTextIntoHeuristicChapters(multilingualDoc, 16);
  assert.ok(chapters.length >= 4, `Debe detectar al menos 4 secciones estructuradas (obtenidos: ${chapters.length})`);
  
  const titles = chapters.map(c => c.title);
  assert.ok(titles.some(t => t.includes('System Architecture') || t.includes('Chapter 1')), 'Debe detectar Chapter en inglés');
  assert.ok(titles.some(t => t.includes('Sicherheitsrichtlinien') || t.includes('Kapitel 2')), 'Debe detectar Kapitel en alemán');
  assert.ok(titles.some(t => t.includes('Procédures de Déploiement') || t.includes('3.1.2')), 'Debe detectar numeración jerárquica y francés');
  assert.ok(titles.some(t => t.includes('NORMATIVA GENERALE') || t.includes('PRIVACY')), 'Debe detectar títulos en ALL CAPS');
  assert.ok(titles.some(t => t.includes('Apéndice B') || t.includes('Glosario')), 'Debe detectar Apéndice / Glosario en español');
});

test('IngestionEngine - Particionado no paginado por numeración jerárquica y Title Case', () => {
  const unpaginatedDoc = `
1. Introducción General
El propósito de este contrato es regular los términos de prestación de servicios.

1.1 Objeto del Contrato
El prestador se compromete a realizar las tareas de mantenimiento descritas.

1.2 Obligaciones Financieras y Formas de Pago
El cliente abonará las cantidades acordadas en un plazo máximo de 30 días.

POLÍTICA DE CONFIDENCIALIDAD
Ambas partes mantendrán el secreto profesional sobre la información compartida.
`.trim();

  const chapters = IngestionEngine.partitionTextIntoHeuristicChapters(unpaginatedDoc, 1000);
  assert.ok(chapters.length >= 3, `Debe detectar encabezados por numeración y ALL CAPS (obtenidos: ${chapters.length})`);
  const titles = chapters.map(c => c.title);
  assert.ok(titles.some(t => t.includes('Introducción General')));
  assert.ok(titles.some(t => t.includes('Obligaciones Financieras')));
  assert.ok(titles.some(t => t.includes('POLÍTICA DE CONFIDENCIALIDAD')));
});



