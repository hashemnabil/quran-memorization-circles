const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const {Blob}=require('buffer');
function load(file,overrides={}){
  let states=[],cursor=0;const selected=[];const played=[];
  const jsx=(type,props)=>({type,props:props||{}});
  const react={useState:initial=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect:()=>{},useId:()=> 'picker',useRef:value=>({current:value})};
  const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/ui':{Modal:'Modal'},'@/lib/api':{api:{defaults:{baseURL:'/api'}}},'@/store/auth':{useAuthStore:()=> 'account'},'@/lib/notification-preview':{notificationPreview:{play:async(...args)=>played.push(args),stop:async()=>{},subscribe:()=>()=>{}}},...overrides};
  const mod={exports:{}};
  const js=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{URL,Blob,File:class extends Blob{constructor(parts,name,options){super(parts,options);this.name=name;}},localStorage:{getItem:()=>null},console})(id=>deps[id]||{},mod,mod.exports);
  return {exports:mod.exports,render:(fn,props)=>{cursor=0;return fn(props);},selected,played};
}
const nodes=view=>Array.isArray(view)?view.flatMap(nodes):view&&typeof view==='object'?[view,...nodes(view.props?.children)]:[];
(async()=>{
 const f=load('components/CuratedBackground.tsx');const choices=[];
 const value={assets:[{id:'image-1',title:'Garden',kind:'CHAT_BACKGROUND'}],selected:'',url:'',choose:id=>choices.push(id)};
 let view=f.render(f.exports.BackgroundChoice,{value,label:'خلفية المحادثة'});
 assert.equal(nodes(view).filter(node=>node.type==='select').length,0);
 nodes(view).find(node=>node.props['aria-haspopup']==='dialog').props.onClick();
 view=f.render(f.exports.BackgroundChoice,{value,label:'خلفية المحادثة'});assert.equal(nodes(view).find(node=>node.type==='Modal').props.open,true);
 const image=nodes(view).find(node=>node.type==='button'&&nodes(node).some(child=>child.type==='img'&&child.props.alt==='Garden'));
 image.props.onClick();assert.deepEqual(choices,['image-1']);
 view=f.render(f.exports.BackgroundChoice,{value,label:'خلفية المحادثة'});assert.equal(nodes(view).find(node=>node.type==='Modal').props.open,false);
 const a=load('components/LibrarySoundOptions.tsx',{'./CuratedBackground':{libraryAssetBlob:async()=>new Blob(['audio'],{type:'application/octet-stream'})},'@/lib/notification-sounds':{importAudio:async(account,scope,file)=>({account,scope,name:file.name,mime:file.type})}});
 const asset={id:'sound-1',title:'Library tone',kind:'NOTIFICATION_SOUND',mime:'audio/ogg'};
 const imported=await a.exports.importLibrarySound('account','general',asset);assert.equal(imported.scope,'general');assert.equal(imported.name,'Library tone');assert.equal(imported.mime,'audio/ogg');
 const picked=[];const options=a.render(a.exports.LibrarySoundOptions,{assets:[asset],selected:'sound-1',name:'same-sound-radio-group',onSelect:entry=>picked.push(entry.id)});
 const radio=nodes(options).find(node=>node.type==='input');assert.equal(radio.props.name,'same-sound-radio-group');assert.equal(radio.props.checked,true);radio.props.onChange();assert.deepEqual(picked,['sound-1']);assert.equal(a.played.length,0);
 console.log('PASS: gallery opens, thumbnails choose backgrounds, selection closes the dialog, audio uses the shared group and import path, selecting never autoplays');
})().catch(error=>{console.error(error);process.exitCode=1;});
