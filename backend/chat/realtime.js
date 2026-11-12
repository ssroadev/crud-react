// Comparte una suscripción por conversación entre las conexiones de este proceso.
function createChatRealtime(database) {
  const rooms = new Map();
  const notify = (bookingId) => {
    for (const listener of rooms.get(String(bookingId))?.listeners || []) listener();
  };
  return {
    notify,
    watch(bookingId, listener) {
      const key = String(bookingId);
      let room = rooms.get(key);
      if (!room) {
        room = { listeners: new Set(), channel: null };
        rooms.set(key, room);
        if (database.channel) {
          room.channel = database.channel(`booking-chat:${key}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${key}` }, () => notify(key))
            .subscribe((status) => { if (status === 'SUBSCRIBED') notify(key); });
        }
      }
      room.listeners.add(listener);
      return () => {
        room.listeners.delete(listener);
        if (room.listeners.size) return;
        rooms.delete(key);
        if (room.channel) void database.removeChannel(room.channel).catch(() => {});
      };
    },
  };
}

module.exports = { createChatRealtime };
