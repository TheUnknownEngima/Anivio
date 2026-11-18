import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../website/package.json',import.meta.url));
const { parse } = require('yaml');
for (const file of ['.github/workflows/build-apk.yml','.github/workflows/web-and-release-checks.yml']) {
  const workflow=parse(readFileSync(file,'utf8'));
  if(!workflow.on||!workflow.jobs) throw new Error(`Invalid workflow: ${file}`);
  for(const job of Object.values(workflow.jobs)) for(const step of job.steps||[]) {
    if(!step.run)continue;
    const run=step.run;
    if(run.includes("python - <<'PY'")) {
      const code=run.split("python - <<'PY'\n")[1].split('\nPY')[0];
      const result=spawnSync('python',['-c',"import sys;compile(sys.stdin.read(),'workflow','exec')"],{input:code,encoding:'utf8'});
      if(result.status!==0)throw new Error(result.stderr);
    }
    const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
    const result=spawnSync(bash,['-n'],{input:run.replace(/\$\{\{.*?\}\}/g,'placeholder'),encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr);
  }
  console.log(`${file}: YAML and embedded script syntax passed`);
}
