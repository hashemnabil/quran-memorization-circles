import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../',import.meta.url));
const relative=file=>path.relative(root,file).replaceAll('\\','/');
async function files(directory){const entries=await readdir(directory,{withFileTypes:true});return (await Promise.all(entries.map(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):/\.tsx?$/.test(entry.name)?[path.join(directory,entry.name)]:[]))).flat().sort();}
function route(node){
 if(ts.isStringLiteralLike(node))return node.text;
 if(ts.isTemplateExpression(node))return node.head.text+node.templateSpans.map(span=>'{'+span.expression.getText()+'}'+span.literal.text).join('');
 if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return route(node.left)+route(node.right);
 return '{'+node.getText().slice(0,100)+'}';
}
function alternatives(node){
 if(ts.isConditionalExpression(node))return [...alternatives(node.whenTrue),...alternatives(node.whenFalse)];
 if(ts.isTemplateExpression(node)){
  let values=[node.head.text];for(const span of node.templateSpans){const choices=ts.isConditionalExpression(span.expression)?alternatives(span.expression):['{'+span.expression.getText()+'}'];values=values.flatMap(value=>choices.map(choice=>value+choice+span.literal.text)).slice(0,16);}return values;
 }
 return [route(node)];
}
const localRules=[
 ['POST',/^\/(students|circles|teachers|recitations|attendance|exams|courses|users|profile-reviews|announcements|media-activities|staff-attendance|support|meetings|examCommittees)$/],
 ['PATCH',/^\/(students|circles|teachers|recitations|attendance|exams|courses|users|announcements|media-activities|support|transfers|suspensions|meetings|examCommittees)\/:id$/],
 ['DELETE',/^\/(students|circles|teachers|recitations|exams|courses|notifications|announcements|media-activities|meetings|examCommittees)\/:id$/],
 ['POST',/^\/courses\/:id\/(students|attendance)$/],['DELETE',/^\/courses\/:id\/students\/:id$/],
 ['POST',/^\/chat\/conversations\/(direct|group)$/],['POST',/^\/chat\/conversations\/:id\/messages$/],['PATCH',/^\/chat\/conversations\/:id\/messages\/:id$/],['DELETE',/^\/chat\/conversations\/:id\/messages\/:id$/],
 ['POST',/^\/community\/posts$/],['DELETE',/^\/community\/posts\/:id$/],['PATCH',/^\/community\/nickname$/],['POST',/^\/community\/(posts\/:id\/comments|comments\/:id\/replies)$/],
 ['POST',/^\/support\/:id\/reply$/],['PATCH',/^\/settings$/],
 ['POST',/^\/students\/bulk-delete$/],
 ['POST',/^\/(transfers\/students|suspensions)$/],['PATCH',/^\/(transfers|suspensions)\/:id\/(approve|reject|cancel|return)$/],
 ['POST',/^\/exams\/requests$/],['POST',/^\/exams\/requests\/:id\/schedule$/],['PATCH',/^\/exams\/requests\/:id\/(reject|cancel)$/],['PATCH',/^\/exams\/:id\/result$/],
 ['POST',/^\/students\/:id\/(notes|surahs|account|account\/reset-password)$/],['DELETE',/^\/students\/:id\/surahs\/:id$/],['PATCH',/^\/students\/:id\/evaluation$/],['PATCH',/^\/students\/me\/questionnaire$/],
 ['PATCH',/^\/users\/:id\/reset-password$/],['POST',/^\/notifications\/broadcast$/],['PATCH',/^\/notifications\/(read-all|:id\/read)$/],
 ['POST',/^\/preparations$/],['PATCH',/^\/preparations\/:id(?:\/(?:complete|reopen))?$/],['DELETE',/^\/preparations\/:id$/],
 ['POST',/^\/attendance\/(absence-permissions|summons)$/],['PATCH',/^\/attendance\/absence-permissions\/:id\/(approve|reject)$/],
 ['POST',/^\/certificates\/(requests|templates)$/],['PATCH',/^\/certificates\/(requests\/:id\/decision|templates\/:id\/deactivate)$/],
 ['POST',/^\/schedules\/(media|duties)$/],['PATCH',/^\/schedules\/(media|duties)\/:id$/],['DELETE',/^\/schedules\/(media|duties)\/:id$/],['PATCH',/^\/profile-reviews\/:id\/decision$/],
];
function classify(operation){
 const clean=operation.path.replace(/\{[^}]*\}/g,':id').split('?')[0];
 if(operation.client==='registryApi')return {kind:'online',label:'عميل تسجيل مستقل: يحتاج شبكة/تحقق؛ لا يوجد طابور محلي مؤكد لهذا المسار'};
 if(operation.method==='GET'){
  if(operation.blob)return {kind:'file',label:'تحميل ملف: يحتاج فحص توفر النسخة/الموارد المحلية؛ لا يُضمن دون اتصال'};
  if(/^\/(auth|registry)(\/|$)/.test(clean)&&clean!=='/auth/me')return {kind:'online',label:'تحقق/جلسة يحتاج الخادم؛ لا يُعتمد دون اتصال'};
  return {kind:'cached-read',label:'قراءة محلية مشروطة بتنزيل البيانات والصلاحيات؛ وجود المسار لا يثبت اكتمال البيانات'};
 }
 if(/^\/(auth|registry|uploads)(\/|$)/.test(clean)||/^\/support\/(public|account-deletion)$/.test(clean)||/^\/settings\/logo$/.test(clean)||/credentials-export|export-with-temporary-passwords/.test(clean))return {kind:'online',label:'مسار شبكة/تحقق أو رفع فعلي/إصدار اعتماد؛ راجع وجود تحضير محلي منفصل في المكونات'};
 if(localRules.some(([method,pattern])=>method===operation.method&&pattern.test(clean)))return {kind:'queued-write',label:'مسار طابور محلي موجود؛ الاعتماد والصلاحيات والتعارض تُراجع على الخادم'};
 return {kind:'gap',label:'غير مغطى بكتابة محلية مؤكدة في الجرد: يلزم تحويل أو فحص يدوي'};
}
async function inspect(file){
 const text=await readFile(file,'utf8'),source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),operations=[],controls=[],components=[];
 for(const statement of source.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)&&statement.moduleSpecifier.text.startsWith('@/components/'))components.push(statement.moduleSpecifier.text);
 function visit(node){
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['api','registryApi'].includes(node.expression.expression.getText())&&node.arguments[0]){
   const method=node.expression.name.text.toUpperCase();if(['GET','POST','PATCH','PUT','DELETE','REQUEST'].includes(method)){
    const client=node.expression.expression.getText(),line=source.getLineAndCharacterOfPosition(node.getStart()).line+1,blob=node.arguments.slice(1).some(argument=>/responseType\s*:\s*['"]blob/.test(argument.getText()));
    if(method==='REQUEST'&&ts.isObjectLiteralExpression(node.arguments[0])){
     const properties=node.arguments[0].properties.filter(ts.isPropertyAssignment),url=properties.find(property=>property.name.getText()==='url')?.initializer,verb=properties.find(property=>property.name.getText()==='method')?.initializer;
     if(url){const paths=alternatives(url),verbs=verb?alternatives(verb):['get'];for(let index=0;index<paths.length;index++){const operation={client,method:(verbs[index]||verbs[0]).toUpperCase(),path:paths[index],line,blob};operations.push({...operation,...classify(operation)});}}
    }else for(const value of alternatives(node.arguments[0])){const operation={client,method,path:value,line,blob};operations.push({...operation,...classify(operation)});}
   }
  }
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)){
   const opening=ts.isJsxElement(node)?node.openingElement:node,tag=opening.tagName.getText();
   if(['Button','button','form'].includes(tag)||tag==='input'&&/type\s*=\s*["']file["']/.test(opening.getText())){
    const literal=ts.isJsxElement(node)?node.children.filter(ts.isJsxText).map(child=>child.text.trim()).filter(Boolean).join(' '):'';
    const label=literal||opening.attributes.properties.filter(ts.isJsxAttribute).find(attribute=>['aria-label','title'].includes(attribute.name.getText()))?.initializer?.getText()|| (tag==='form'?'إرسال نموذج':tag==='input'?'اختيار ملف':'عنصر تفاعلي ذو عنوان ديناميكي/أيقونة');
    controls.push({line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,label:label.replace(/\s+/g,' ').slice(0,120),verification:'لم يُختبر هذا العنصر فعليًا بكل الأدوار ضمن الجرد الآلي'});
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);return {page:relative(file),operations,controls,components:[...new Set(components)]};
}
const pages=await Promise.all((await files(path.join(root,'frontend/src/pages'))).map(inspect));
const shared=(await Promise.all((await files(path.join(root,'frontend/src/components'))).map(inspect))).filter(row=>row.operations.length);
const summary={pages:pages.length,operations:pages.reduce((sum,page)=>sum+page.operations.length,0),controls:pages.reduce((sum,page)=>sum+page.controls.length,0),uncoveredWrites:pages.flatMap(page=>page.operations.filter(operation=>operation.kind==='gap').map(operation=>({page:page.page,...operation}))),sharedModules:shared.length};
let verification;try{verification=JSON.parse(await readFile(path.join(root,'docs/offline-verification-latest.json'),'utf8'));}catch{}
const report={scope:'جرد كود لكل صفحة، وليس شهادة اختبار كل زر على كل دور أو جهاز',summary,verification:verification||null,pages,shared};
await writeFile(path.join(root,'docs/offline-page-coverage.json'),JSON.stringify(report,null,2)+'\n');
const escape=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
let markdown='# تقرير تغطية العمل دون إنترنت لكل صفحة\n\nهذا جرد للمشروع الحالي، يشمل استدعاءات API المباشرة والعناصر التفاعلية الظاهرة في مصدر كل صفحة، ثم المكونات المشتركة التي تحتوي استدعاءات API. لا يثبت الجرد تنفيذ كل زر أو اختبار كل دور. مسار محلي موجود يعني وجود تنفيذ في الكود، وليس نجاحًا نهائيًا أو اكتمال كل الحالات.\n\n';
markdown+=`عدد الصفحات: **${summary.pages}**. استدعاءات الصفحات المباشرة: **${summary.operations}**. عناصر تفاعلية/نماذج في مصدر الصفحات: **${summary.controls}**. استدعاءات كتابة تحتاج تحويلًا أو مراجعة: **${summary.uncoveredWrites.length}**.\n\n`;
markdown+='## حدود التحقق الحالية\n\n- أول دخول، اعتماد الصلاحيات، استلام بيانات جديدة وPush ورفع الملف فعليًا تتطلب اتصالًا. الحفظ المحلي لا يعني اعتماد الخادم.\n- حساب ولي الأمر موقوف حاليًا في auth.service.ts وjwt.strategy.ts؛ لم يُفعّل لتجاوز هذا القيد، ولا توجد دعوى اختبار دخول فعلي لهذا الدور.\n- فحص PostgreSQL الحقيقي وAndroid SDK/جهاز فعلي وWorkManager لم يُثبت نجاحه في هذه البيئة.\n- القوائم والتقارير المحلية قد تكون جزئية؛ لا تعادل نسخة خادم كاملة. المرفقات المستأنفة والوظائف المصنفة غير مغطاة ليست مكتملة.\n\n';
if(verification)markdown+='## آخر تشغيل مسجل للاختبارات\n\n'+verification.suites.map(suite=>`- ${suite.name}: ${suite.passed?'نجح':'فشل'}؛ حالات ${suite.tests}، ناجح ${suite.pass}، فاشل ${suite.fail}، متخطى ${suite.skipped}.`).join('\n')+'\n\nالاختبارات أعلاه وحدات/تكامل محاكى حسب ملفاتها، ولا تُنسب تلقائيًا لكل زر أو لكل دور. التفاصيل في offline-verification-latest.json.\n\n';
function section(page){
 let output=`## ${page.page}\n\n`;
 if(!page.operations.length)output+='لا توجد استدعاءات API مباشرة في هذا الملف؛ راجع المكونات المشتركة والتحكم المحلي. لا يعني ذلك أن كل إجراء مكتمل دون اتصال.\n\n';
 else output+='| السطر | العملية | المسار | الحالة من الكود |\n|---|---|---|---|\n'+page.operations.map(operation=>`| ${operation.line} | ${operation.method} | \`${escape(operation.path)}\` | ${escape(operation.label)} |`).join('\n')+'\n\n';
 if(page.components?.length)output+='مكونات مشتركة مستوردة: '+page.components.map(component=>'`'+component+'`').join('، ')+'.\n\n';
 if(page.controls.length)output+='قائمة التحقق للعناصر التفاعلية (الاختبار الفعلي لجميع الأدوار غير منفذ ضمن هذا الجرد):\n\n'+page.controls.map(control=>`- السطر ${control.line}: ${escape(control.label)}.`).join('\n')+'\n\n';
 return output;
}
for(const page of pages)markdown+=section(page);
markdown+='## مكونات مشتركة ذات استدعاءات شبكة\n\nلا تُحسب هذه الاستدعاءات كاختبار لكل صفحة تستورد المكوّن، وقد تكون الاستيرادات غير مباشرة. ملفات الحفظ المحلي للصور والقفل وتغيير المظهر لها اختبارات منفصلة.\n\n';
for(const component of shared)markdown+=section(component);
await writeFile(path.join(root,'docs/OFFLINE_PAGE_COVERAGE.md'),markdown);
console.log(JSON.stringify({pages:summary.pages,operations:summary.operations,controls:summary.controls,uncoveredWrites:summary.uncoveredWrites.length,sharedModules:summary.sharedModules}));
