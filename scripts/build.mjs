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
execFileSync(process.execPath, [join(root, 'scripts', 'check-deploy.mjs')], { stdio: 'inherit', cwd: root });
