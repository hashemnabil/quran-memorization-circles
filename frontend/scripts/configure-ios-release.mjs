import fs from 'node:fs';
const filename = process.argv[2] || 'frontend/ios/App/App.xcodeproj/project.pbxproj';
const { IOS_TEAM_ID: team, IOS_PROFILE_UUID: profile, VERSION_NAME: version, VERSION_CODE: build } = process.env;
if (!/^[A-Z0-9]{10}$/.test(team || '') || !/^[A-Fa-f0-9-]{36}$/.test(profile || '') || !/^\d+\.\d+\.\d+$/.test(version || '') || !/^[1-9]\d*$/.test(build || '')) throw new Error('Invalid iOS release configuration');
let updated = 0;
const source = fs.readFileSync(filename, 'utf8').replace(/buildSettings = \{([^{}]*)\};\s*name = Release;/g, block => {
  if (!block.includes('PRODUCT_BUNDLE_IDENTIFIER = org.qurancircles.app;')) return block;
  updated++;
  return block.replace(/CODE_SIGN_STYLE = [^;]+;/, `CODE_SIGN_STYLE = Manual;\n\t\t\t\tDEVELOPMENT_TEAM = ${team};\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profile}";`)
    .replace(/MARKETING_VERSION = [^;]+;/, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/, `CURRENT_PROJECT_VERSION = ${build};`);
});
if (updated !== 1) throw new Error('Expected exactly one App Release configuration; project was not modified');
fs.writeFileSync(filename, source);
console.log('Configured App Release signing; dependency targets are unchanged.');
