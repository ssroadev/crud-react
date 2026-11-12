const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createChatRealtime } = require('./realtime');

test('chat realtime: comparte el canal, propaga eventos entre instancias y libera suscripciones', () => {
  const channels = []; const removed = []; const received = [];
  const database = {
    channel(name) {
      const channel = { name, on(_event, filter, callback) { this.filter = filter; this.change = callback; return this; },
        subscribe(callback) { this.status = callback; return this; },
      };
      channels.push(channel); return channel;
    },
    async removeChannel(channel) { removed.push(channel); },
  };
  const realtime = createChatRealtime(database);
  const stop1 = realtime.watch('7', () => received.push('owner'));
  const stop2 = realtime.watch('7', () => received.push('caregiver'));
  const stop3 = realtime.watch('8', () => received.push('other'));
  assert.equal(channels.length, 2);
  assert.deepEqual(channels[0].filter, { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: 'booking_id=eq.7' });
  channels[0].change(); assert.deepEqual(received, ['owner', 'caregiver']);
  stop1(); channels[0].status('SUBSCRIBED');
  assert.deepEqual(received, ['owner', 'caregiver', 'caregiver']);
  assert.equal(removed.length, 0);
  stop2(); stop3(); assert.equal(removed.length, 2);
  realtime.notify('7'); assert.equal(received.length, 3);
});
