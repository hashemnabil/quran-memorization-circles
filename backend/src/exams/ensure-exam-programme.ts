import type { PrismaClient } from '@prisma/client';

// Existing databases may still have the old 60-hizb programme, with retired
// or missing juz rows. Preserve all IDs and grades while restoring the programme
// already displayed by the student table: two ahzab followed by their juz.
export const examProgramme = Array.from({ length:30 }, (_,index)=>{
  const juz=30-index;
  return [
    {code:`HIZB-${String(juz*2).padStart(2,'0')}`,name:`الحزب ${juz*2}`,kind:'HIZB' as const,order:index*3+1,pagesCount:10},
    {code:`HIZB-${String(juz*2-1).padStart(2,'0')}`,name:`الحزب ${juz*2-1}`,kind:'HIZB' as const,order:index*3+2,pagesCount:10},
    {code:`JUZ-${String(juz).padStart(2,'0')}`,name:`الجزء ${juz}`,kind:'JUZ' as const,order:index*3+3,pagesCount:20},
  ];
}).flat();

export async function ensureExamProgramme(prisma: Pick<PrismaClient,'$transaction'>) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('exam-programme:hizb-juz:v1'))) AS locked`;
    const existing=await tx.examSection.findMany({select:{id:true,code:true,name:true,order:true,kind:true,isActive:true,isRequired:true}});
    const byCode=new Map(existing.map(row=>[row.code,row]));
    if(examProgramme.every(item=>{
      const row=byCode.get(item.code);
      return row&&row.isActive&&row.isRequired&&row.order===item.order&&row.kind===item.kind;
    }))return false;

    // Park changed rows above every existing order to avoid the unique-order
    // collisions that a direct interleaving update would cause.
    const maxOrder=Math.max(90,...existing.map(row=>row.order));
    let temporaryOrder=maxOrder+1000;
    const canonicalCodes=new Set(examProgramme.map(item=>item.code));
    const conflicts=existing.filter(row=>!canonicalCodes.has(row.code)&&row.order>=1&&row.order<=90);
    for(const row of existing.filter(row=>canonicalCodes.has(row.code)||conflicts.some(other=>other.id===row.id))) {
      await tx.examSection.update({where:{id:row.id},data:{order:temporaryOrder++}});
    }
    let customOrder=maxOrder+1;
    for(const row of conflicts)await tx.examSection.update({where:{id:row.id},data:{order:customOrder++}});
    const names=new Set(existing.map(row=>row.name));
    for(const item of examProgramme){
      const row=byCode.get(item.code);
      if(row){
        await tx.examSection.update({where:{id:row.id},data:{order:item.order,kind:item.kind,isActive:true,isRequired:true}});
      }else{
        const name=names.has(item.name)?`${item.name} (${item.code})`:item.name;
        await tx.examSection.create({data:{...item,name,minScore:80,isActive:true,isRequired:true}});
        names.add(name);
      }
    }
    return true;
  },{maxWait:10000,timeout:30000});
}
