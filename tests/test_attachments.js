const test = require('node:test');
const assert = require('node:assert');
const ChatAttachments = require('../js/attachments.js');

test('ChatAttachments - Gestión del estado de adjuntos y formateo de payload', () => {
  ChatAttachments.clearFiles();
  assert.equal(ChatAttachments.getFiles().length, 0);

  ChatAttachments.addFile({ name: 'datos.txt', size: 1024, type: 'text', content: 'col1,col2\n1,2' });
  ChatAttachments.addFile({ name: 'foto.png', size: 2048, type: 'image', dataUrl: 'data:image/png;base64,123' });

  assert.equal(ChatAttachments.getFiles().length, 2);

  const payload = ChatAttachments.buildAttachmentsPayload('Analiza esto:');
  assert.ok(payload.fullPrompt.includes('--- File: datos.txt'));
  assert.ok(payload.fullPrompt.includes('--- Image: foto.png'));
  assert.equal(payload.imageAttachments.length, 1);
  assert.equal(payload.imageAttachments[0].name, 'foto.png');
  assert.ok(payload.displayText.includes('Analiza esto:'));
  assert.ok(payload.displayText.includes('datos.txt'));

  ChatAttachments.removeFileAt(0);
  assert.equal(ChatAttachments.getFiles().length, 1);
  assert.equal(ChatAttachments.getFiles()[0].name, 'foto.png');
});
