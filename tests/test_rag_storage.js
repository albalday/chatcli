const { test } = require('node:test');
const assert = require('node:assert/strict');
const RagStorage = require('../js/ragStorage.js');

test('RagStorage - Inicialización y configuración de base de datos', async () => {
  assert.equal(RagStorage.DB_NAME, 'LocalRAG_DB');
  assert.equal(RagStorage.DB_VERSION, 1);
  assert.equal(RagStorage.STORE_BRANCHES, 'branches');
  assert.equal(RagStorage.STORE_DOCUMENTS, 'documents');
});

test('RagStorage - CRUD de Ramas (Creación, Listado, Obtención por ID)', async () => {
  await RagStorage.clearAllData();

  // 1. Crear ramas
  const branchA = await RagStorage.createBranch('Kubernetes Docs', 'Documentación oficial de Kubernetes');
  assert.ok(branchA.id);
  assert.equal(branchA.name, 'Kubernetes Docs');
  assert.equal(branchA.description, 'Documentación oficial de Kubernetes');
  assert.ok(branchA.createdAt > 0);

  // Esperar un breve instante para diferenciar createdAt
  await new Promise(r => setTimeout(r, 10));

  const branchB = await RagStorage.createBranch('Manual RRHH 2026', 'Políticas y normativas internas');
  assert.ok(branchB.id);
  assert.equal(branchB.name, 'Manual RRHH 2026');

  // 2. Listar ramas (deben ordenarse por fecha descendente: branchB primero)
  const branches = await RagStorage.getBranches();
  assert.equal(branches.length, 2);
  assert.equal(branches[0].id, branchB.id);
  assert.equal(branches[1].id, branchA.id);

  // 3. Obtener rama por ID
  const fetched = await RagStorage.getBranchById(branchA.id);
  assert.ok(fetched);
  assert.equal(fetched.id, branchA.id);
  assert.equal(fetched.name, 'Kubernetes Docs');

  const notFound = await RagStorage.getBranchById('non_existent_branch');
  assert.equal(notFound, null);
});

test('RagStorage - Validación de esquemas en creación de Ramas', async () => {
  await assert.rejects(
    async () => {
      await RagStorage.createBranch('');
    },
    RagStorage.ValidationError
  );

  await assert.rejects(
    async () => {
      await RagStorage.createBranch('   ');
    },
    RagStorage.ValidationError
  );
});

test('RagStorage - Guardar y recuperar Documentos con Capítulos', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Arquitectura Cloud', 'Diseño de microservicios');

  const docPayload = {
    branchId: branch.id,
    title: 'Guía de Despliegue en AWS.pdf',
    fileType: 'pdf',
    fileSize: 1048576,
    globalSummary: 'Resumen global del documento de despliegue en AWS con ECS y Fargate.',
    chapters: [
      {
        chapterId: 1,
        title: 'Introducción a ECS',
        summary: 'Conceptos básicos de contenedores en Elastic Container Service.',
        content: 'El servicio Amazon ECS permite ejecutar contenedores Docker con alta disponibilidad sin gestionar instancias EC2 si se usa el modo Fargate.',
        charCount: 140
      },
      {
        chapterId: 2,
        title: 'Configuración de Redes VPC',
        summary: 'Subnets públicas y privadas, Security Groups y NAT Gateways.',
        content: 'Para garantizar la seguridad, las tareas de Fargate deben ubicarse en subredes privadas con rutas hacia un NAT Gateway para acceso de salida.',
        charCount: 145
      }
    ]
  };

  const savedDoc = await RagStorage.saveDocument(docPayload);
  assert.ok(savedDoc.id);
  assert.equal(savedDoc.branchId, branch.id);
  assert.equal(savedDoc.title, 'Guía de Despliegue en AWS.pdf');
  assert.equal(savedDoc.chapters.length, 2);

  // Recuperar documento completo por ID
  const retrievedDoc = await RagStorage.getDocumentById(savedDoc.id);
  assert.ok(retrievedDoc);
  assert.equal(retrievedDoc.id, savedDoc.id);
  assert.equal(retrievedDoc.chapters.length, 2);
  assert.equal(retrievedDoc.chapters[0].title, 'Introducción a ECS');
  assert.ok(retrievedDoc.chapters[0].content.includes('Amazon ECS'));

  // Rechazar documento en rama inexistente
  await assert.rejects(
    async () => {
      await RagStorage.saveDocument({
        ...docPayload,
        branchId: 'rama_inexistente_999'
      });
    },
    RagStorage.NotFoundError
  );
});

test('RagStorage - getDocumentHeadersByBranch proyecta datos excluyendo el contenido pesado', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Documentación Backend');

  const doc1 = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Manual API.md',
    fileType: 'md',
    fileSize: 5000,
    globalSummary: 'Resumen API',
    chapters: [
      {
        chapterId: 1,
        title: 'Endpoints de Usuarios',
        summary: 'Rutas CRUD de usuarios.',
        content: 'CONTENIDO MUY PESADO Y EXTENSO DE 500 KB...',
        charCount: 40
      }
    ]
  });

  const headers = await RagStorage.getDocumentHeadersByBranch(branch.id);
  assert.equal(headers.length, 1);
  assert.equal(headers[0].id, doc1.id);
  assert.equal(headers[0].title, 'Manual API.md');
  assert.equal(headers[0].chapters.length, 1);
  assert.equal(headers[0].chapters[0].title, 'Endpoints de Usuarios');
  assert.equal(headers[0].chapters[0].summary, 'Rutas CRUD de usuarios.');
  // CRÍTICO: el campo 'content' no debe existir en las cabeceras para no saturar memoria
  assert.equal(headers[0].chapters[0].content, undefined);
});

test('RagStorage - getChapterContent recupera directamente el texto bajo demanda', async () => {
  await RagStorage.clearAllData();

  const branch = await RagStorage.createBranch('Proyecto Seguros');

  const doc = await RagStorage.saveDocument({
    branchId: branch.id,
    title: 'Polizas.txt',
    fileType: 'txt',
    fileSize: 1200,
    globalSummary: 'Condiciones de pólizas de auto.',
    chapters: [
      {
        chapterId: 101,
        title: 'Cobertura Todo Riesgo',
        summary: 'Cubre daños propios, robo e incendio con franquicia de 150€.',
        content: 'Cláusula 1: La cobertura a todo riesgo incluye reparación en talleres concertados y vehículo de sustitución durante 5 días.',
        charCount: 120
      },
      {
        chapterId: 102,
        title: 'Asistencia en Viaje',
        summary: 'Servicio 24/7 desde el km 0.',
        content: 'Cláusula 2: Asistencia mecánica en carretera las 24 horas del día sin límite de kilometraje dentro del territorio nacional.',
        charCount: 115
      }
    ]
  });

  // 1. Recuperar capítulo 101
  const content101 = await RagStorage.getChapterContent(doc.id, 101);
  assert.ok(content101);
  assert.ok(content101.includes('Cláusula 1: La cobertura a todo riesgo'));

  // 2. Recuperar capítulo 102 por string
  const content102 = await RagStorage.getChapterContent(doc.id, '102');
  assert.ok(content102);
  assert.ok(content102.includes('Cláusula 2: Asistencia mecánica'));

  // 3. Capítulo inexistente
  const notFound = await RagStorage.getChapterContent(doc.id, 999);
  assert.equal(notFound, null);

  // 4. Documento inexistente
  const notFoundDoc = await RagStorage.getChapterContent('doc_inexistente', 101);
  assert.equal(notFoundDoc, null);
});

test('RagStorage - Eliminación individual de documento y eliminación en cascada de Rama', async () => {
  await RagStorage.clearAllData();

  const branchA = await RagStorage.createBranch('Rama Principal');
  const branchB = await RagStorage.createBranch('Rama Secundaria');

  const docA1 = await RagStorage.saveDocument({
    branchId: branchA.id,
    title: 'Doc A1.txt',
    fileType: 'txt',
    fileSize: 100,
    globalSummary: 'Doc A1',
    chapters: [{ chapterId: 1, title: 'C1', summary: 'S1', content: 'T1' }]
  });

  const docA2 = await RagStorage.saveDocument({
    branchId: branchA.id,
    title: 'Doc A2.txt',
    fileType: 'txt',
    fileSize: 100,
    globalSummary: 'Doc A2',
    chapters: [{ chapterId: 1, title: 'C1', summary: 'S1', content: 'T2' }]
  });

  const docB1 = await RagStorage.saveDocument({
    branchId: branchB.id,
    title: 'Doc B1.txt',
    fileType: 'txt',
    fileSize: 100,
    globalSummary: 'Doc B1',
    chapters: [{ chapterId: 1, title: 'C1', summary: 'S1', content: 'TB1' }]
  });

  // 1. Borrar documento individual docA1
  const deletedDoc = await RagStorage.deleteDocument(docA1.id);
  assert.equal(deletedDoc, true);

  const docsBranchAAfterSingleDel = await RagStorage.getDocumentsByBranch(branchA.id);
  assert.equal(docsBranchAAfterSingleDel.length, 1);
  assert.equal(docsBranchAAfterSingleDel[0].id, docA2.id);

  // 2. Eliminar rama A en cascada (debe borrar la rama y todos sus documentos restantes)
  const cascadeRes = await RagStorage.deleteBranch(branchA.id);
  assert.equal(cascadeRes.success, true);
  assert.equal(cascadeRes.deletedBranchId, branchA.id);
  assert.equal(cascadeRes.deletedDocumentsCount, 1);

  // Verificar que la rama A ya no existe
  const branchAFetched = await RagStorage.getBranchById(branchA.id);
  assert.equal(branchAFetched, null);

  const docsBranchAFinal = await RagStorage.getDocumentsByBranch(branchA.id);
  assert.equal(docsBranchAFinal.length, 0);

  // Verificar que los documentos de la rama B no se vieron afectados
  const docsBranchB = await RagStorage.getDocumentsByBranch(branchB.id);
  assert.equal(docsBranchB.length, 1);
  assert.equal(docsBranchB[0].id, docB1.id);
});

test('RagStorage - Manejo de errores de validación y QuotaExceededError', async () => {
  // Documento sin branchId
  await assert.rejects(
    async () => {
      await RagStorage.saveDocument({ title: 'Sin Rama' });
    },
    RagStorage.ValidationError
  );

  // Documento sin título
  await assert.rejects(
    async () => {
      await RagStorage.saveDocument({ branchId: 'b_123', title: '' });
    },
    RagStorage.ValidationError
  );

  // Tipo de archivo no permitido
  await assert.rejects(
    async () => {
      await RagStorage.saveDocument({ branchId: 'b_123', title: 'Archivo.exe', fileType: 'exe' });
    },
    RagStorage.ValidationError
  );

  // Instanciación de QuotaExceededError
  const quotaErr = new RagStorage.QuotaExceededError('Disco lleno');
  assert.equal(quotaErr.name, 'QuotaExceededError');
  assert.ok(quotaErr instanceof RagStorage.RagStorageError);
});

