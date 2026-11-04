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
