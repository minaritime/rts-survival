/**
 * Blender 를 화면 없이 돌려 스크립트를 실행한다.
 *   node art/tools/run-blender.mjs <스크립트.py> [스크립트에 넘길 인자...]
 * Blender 위치: 환경 변수 BLENDER, 없으면 winget 기본 설치 위치.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DEFAULT = 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
const blender = process.env.BLENDER ?? DEFAULT;
if (!existsSync(blender)) {
  process.stderr.write(`Blender 를 찾을 수 없음: ${blender}\n환경 변수 BLENDER 에 blender.exe 위치를 넣어 주십시오.\n`);
  process.exit(1);
}

const [script, ...args] = process.argv.slice(2);
if (!script) {
  process.stderr.write('사용법: node art/tools/run-blender.mjs <스크립트.py> [인자...]\n');
  process.exit(1);
}

const result = spawnSync(blender, ['-b', '-P', script, '--', ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
