import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const localTsc = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const tsc = existsSync(localTsc) ? localTsc : 'tsc';

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
execFileSync(tsc, ['--project', join(root, 'tsconfig.json')], { stdio: 'inherit' });
cpSync(join(root, 'index.html'), join(dist, 'index.html'));
cpSync(join(root, 'public'), dist, { recursive: true });

// GitHub Pages가 "Deploy from a branch / /(root)"로 설정된 저장소도 바로
// 실행되도록 컴파일된 정적 파일을 저장소 루트에 동기화한다.
cpSync(join(dist, 'app.js'), join(root, 'app.js'));
cpSync(join(dist, 'types.js'), join(root, 'types.js'));
cpSync(join(dist, 'lib'), join(root, 'lib'), { recursive: true });
cpSync(join(dist, 'styles.css'), join(root, 'styles.css'));
cpSync(join(dist, 'fonts'), join(root, 'fonts'), { recursive: true });
cpSync(join(root, '.nojekyll'), join(dist, '.nojekyll'));
execFileSync(process.execPath, [join(root, 'scripts', 'check-deploy.mjs')], { stdio: 'inherit', cwd: root });
