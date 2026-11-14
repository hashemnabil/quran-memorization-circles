import { readdir,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
const directory=fileURLToPath(new URL('../src/pages/',import.meta.url));
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});return(await Promise.all(entries.map(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):/\.tsx$/.test(entry.name)?[path.join(dir,entry.name)]:[]))).flat();}
const changed=[];
for(const file of await walk(directory)){
 const text=await readFile(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText()==='useMutation'&&node.arguments[0]&&ts.isObjectLiteralExpression(node.arguments[0])){
   const property=node.arguments[0].properties.find(item=>ts.isPropertyAssignment(item)&&item.name.getText()==='onSuccess');
   const callback=property?.initializer;
   if(callback&&ts.isArrowFunction(callback)&&!callback.parameters.length){
    const calls=[];
    function success(child){if(child!==callback.body&&(ts.isArrowFunction(child)||ts.isFunctionExpression(child)))return;if(ts.isCallExpression(child)&&child.expression.getText()==='toast.success')calls.push(child);ts.forEachChild(child,success);}
    success(callback.body);
    if(calls.length){
     let parameter='_offlineWriteResult';while(new RegExp('\\b'+parameter+'\\b').test(callback.getText()))parameter+='_';
     edits.push({start:callback.parameters.pos,end:callback.parameters.pos,value:parameter});
     for(const call of calls){edits.push({start:call.expression.getStart(),end:call.expression.end,value:'notifyWriteSuccess'});edits.push({start:call.arguments.pos,end:call.arguments.pos,value:parameter+(/^\s*\r?\n/.test(text.slice(call.arguments.pos))?',':', ')});}
    }
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
 if(!edits.length)continue;
 let output=text;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.value+output.slice(edit.end);
 output="import { notifyWriteSuccess } from '@/lib/write-feedback';\n"+output;
 const parsed=ts.createSourceFile(file,output,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 if(parsed.parseDiagnostics.length)throw new Error('Refusing invalid syntax: '+file);
 await writeFile(file,output);changed.push(path.relative(directory,file));
}
console.log(JSON.stringify({changedPages:changed.length,files:changed}));
