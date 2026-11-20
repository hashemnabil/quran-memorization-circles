import { createHash } from 'node:crypto';

// Stable UUID-shaped ids remain compatible with the existing v4-only outbox.
export function transferNotificationId(sourceId, studentId) {
  const bytes = createHash('sha256').update(`parent-transfer:${sourceId}:${studentId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function studentTransferUsername(studentId) {
  return `student-${createHash('sha256').update(studentId).digest('hex').slice(0,24)}`;
}

// No inference from names or phone numbers: siblings can share both.
export function resolveStudent(record, children, explicitId) {
  const linked = id => children.find(student => student.id === id);
  const fromLink = record.link?.match(/^\/parent\/children\/([^/?#]+)/)?.[1];
  const declared = [record.data?.studentId, fromLink, explicitId].filter(Boolean);
  if (new Set(declared).size > 1) throw new Error(`Conflicting student references: ${record.id}`);
  if (declared.length) {
    const student = linked(declared[0]);
    if (!student) throw new Error(`Student is not linked to source account: ${record.id}`);
    return student;
  }
  if (children.length === 1) return children[0];
  throw new Error(`Explicit student mapping required: ${record.id}`);
}

export function validateTransferContexts(transfers) {
  const conversations = transfers.filter(item => item.kind === 'conversation');
  const tickets = transfers.filter(item => item.kind === 'ticket');
  for (const transfer of transfers) {
    if (transfer.kind !== 'notification') continue;
    for (const related of conversations.filter(item => item.source.userId === transfer.source.userId && item.source.conversationId === transfer.source.data?.conversationId)) {
      if (related.student.id !== transfer.student.id) throw new Error(`Notification and conversation map to different students: ${transfer.source.id}`);
    }
    for (const related of tickets.filter(item => item.source.createdById === transfer.source.userId && item.source.id === transfer.source.data?.ticketId)) {
      if (related.student.id !== transfer.student.id) throw new Error(`Notification and support ticket map to different students: ${transfer.source.id}`);
    }
  }
  for (const transfer of conversations) {
    for (const message of transfer.source.conversation?.messages || []) {
      for (const match of String(message.body || '').matchAll(/\/parent\/children\/([A-Za-z0-9-]+)/g)) {
        if (match[1] !== transfer.student.id) throw new Error(`Conversation contains another student's reference; split and review it before migration: ${transfer.source.conversationId}`);
      }
    }
  }
}
