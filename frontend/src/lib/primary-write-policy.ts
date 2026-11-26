type PendingWrite={entityId:string;table:string;data?:Record<string,any>};
export function writeReferenceIds(value:unknown):string[]{
  if(typeof value==='string')return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)?[value]:[];
  if(Array.isArray(value))return value.flatMap(writeReferenceIds);
  return value&&typeof value==='object'?Object.values(value).flatMap(writeReferenceIds):[];
}
export function remapWriteReferences(value:any,aliases:Map<string,string>):any{
  if(typeof value==='string')return aliases.get(value)??value;
  if(Array.isArray(value))return value.map(item=>remapWriteReferences(item,aliases));
  return value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,remapWriteReferences(item,aliases)])):value;
}
/** Keep dependent offline edits ordered; unrelated online writes use the server immediately. */
export function dependsOnPendingWrite(path:string,payload:unknown,operations:PendingWrite[]) {
  const segments=path.split('?')[0].split('/').filter(Boolean);
  const references=new Set(segments);
  const visit=(value:unknown)=>{if(typeof value==='string')references.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};
  visit(payload);
  const data=(payload??{}) as Record<string,any>;
  return operations.some(operation=>{
    if(references.has(operation.entityId))return true;
    if(segments[0]==='settings'&&operation.table==='schoolSettings')return true;
    if(segments[0]==='community'&&segments[1]==='nickname'&&operation.table==='accountPreferences')return true;
    if(segments[0]==='exams'&&['exams','examRequests'].includes(operation.table)&&data.studentId&&data.studentId===operation.data?.studentId)return true;
    if(segments[0]==='attendance'&&segments.length===1&&operation.table==='attendance'&&data.date===operation.data?.date&&data.entries?.some((entry:any)=>entry.studentId===operation.data?.studentId))return true;
    return false;
  });
}
