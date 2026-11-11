export function mergeMessages(current, incoming) {
  const messages = new Map(current.map((message) => [String(message.id), message]));
  for (const message of incoming) messages.set(String(message.id), message);
  return [...messages.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
}

export function reconcileOutbox(outbox, incoming, accountId) {
  const delivered = new Set(incoming.filter((message) => String(message.sender_id) === String(accountId)).map((message) => message.client_message_id));
  return outbox.filter((message) => !delivered.has(message.client_message_id));
}
