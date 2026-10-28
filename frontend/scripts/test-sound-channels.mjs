import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const output=mkdtempSync(path.join(tmpdir(),'school-sound-policy-'));
const executable=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',name+(process.platform==='win32'?'.exe':'')):name;
try {
 execFileSync(executable('javac'),['-encoding','UTF-8','-d',output,fileURLToPath(new URL('../android/app/src/main/java/com/abdullahschool/myapp/SoundChannelPolicy.java',import.meta.url)),fileURLToPath(new URL('../android/app/src/test/java/com/abdullahschool/myapp/SoundChannelPolicyCheck.java',import.meta.url))],{stdio:'inherit'});
 execFileSync(executable('java'),['-cp',output,'com.abdullahschool.myapp.SoundChannelPolicyCheck'],{stdio:'inherit'});
} finally {
 const resolved=path.resolve(output),root=path.resolve(tmpdir());
 if(!resolved.startsWith(root+path.sep)||!path.basename(resolved).startsWith('school-sound-policy-'))throw new Error('Unsafe temporary output path');
 rmSync(resolved,{recursive:true,force:true});
}
