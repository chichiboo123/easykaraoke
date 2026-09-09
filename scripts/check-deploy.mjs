import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const required = ['index.html', 'app.js', 'types.js', 'lib/lyrics.js', 'lib/renderer.js', 'styles.css'];
const missing = required.filter((file) => !existsSync(join(dist, file)) || !statSync(join(dist, file)).isFile());
if (missing.length) {
  console.error(`배포 산출물 누락: ${missing.join(', ')}`);
  process.exit(1);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
for (const asset of ['./styles.css', './app.js']) {
  if (!html.includes(asset)) throw new Error(`index.html에서 배포 자산을 찾을 수 없음: ${asset}`);
}
const app = readFileSync(join(dist, 'app.js'), 'utf8');
for (const match of app.matchAll(/from\s*['"](.+?\.js)['"]/g)) {
  if (!existsSync(resolve(dist, match[1]))) throw new Error(`컴파일된 모듈 누락: ${match[1]}`);
}
for (const file of required) {
  const branchFile = join(resolve('.'), file);
  if (!existsSync(branchFile)) throw new Error(`브랜치 직접 배포용 파일 누락: ${file}`);
  const artifact = readFileSync(join(dist, file));
  const branch = readFileSync(branchFile);
  if (!artifact.equals(branch)) throw new Error(`브랜치 직접 배포용 파일이 최신 빌드와 다름: ${file}`);
}
console.log('GitHub Pages 배포 산출물 검사 통과');
