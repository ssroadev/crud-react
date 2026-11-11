const { test } = require('node:test');
const assert = require('node:assert/strict');

test('chat: combina páginas y respuestas fuera de orden sin duplicar ni perder precisión de bigint', async () => {
  const { mergeMessages } = await import('../../frontend/src/chat-utils.js');
  const first = { id: '9007199254740993', content: 'Primero' };
  const second = { id: '9007199254740994', content: 'Segundo' };
  const third = { id: '9007199254740995', content: 'Tercero' };
  assert.deepEqual(mergeMessages([third, second], [second, first]), [first, second, third]);
});
test('chat: una lectura recupera envíos cuya respuesta se perdió sin afectar la otra parte', async () => {
  const { reconcileOutbox } = await import('../../frontend/src/chat-utils.js');
  const failed = { client_message_id: 'same-key', content: 'Mensaje', state: 'failed' };
  assert.deepEqual(reconcileOutbox([failed], [{ client_message_id: 'same-key', sender_id: '202' }], 101), [failed]);
  assert.deepEqual(reconcileOutbox([failed], [{ client_message_id: 'same-key', sender_id: '101' }], 101), []);
});
