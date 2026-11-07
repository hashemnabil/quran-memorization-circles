import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function releaseVersion(env = process.env) {
  const defaults=JSON.parse(readFileSync(new URL('../release-version.json',import.meta.url),'utf8'));
  const version=env.VERSION_NAME||env.ANDROID_VERSION_NAME||defaults.version;
  const build=env.VERSION_CODE||env.ANDROID_VERSION_CODE||defaults.build;
  if(!/^\d+\.\d+\.\d+$/.test(version)||! /^[1-9]\d*$/.test(String(build)))throw new Error('Invalid release version');
  return {version,build:String(build)};
}
export function syncIosVersion() {
  const project=fileURLToPath(new URL('../ios/App/App.xcodeproj/project.pbxproj',import.meta.url));
  if(!existsSync(project))return;
  const {version,build}=releaseVersion();
  const source=readFileSync(project,'utf8');
  writeFileSync(project,source.replace(/MARKETING_VERSION = [^;]+;/g,`MARKETING_VERSION = ${version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g,`CURRENT_PROJECT_VERSION = ${build};`));
}
