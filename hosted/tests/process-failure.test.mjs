import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runProcess} from '../process.mjs';

test('model subprocess failures retain categories while discarding private error text', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hc-failure-'));
  try {
    const script=path.join(root,'openai-tailor.mjs');
    for(const [message,code] of [
      ['API error: HTTP 429\nprivate response','model_rate_limited'],
      ['The reply stopped at the 8192-token output cap, so the tailored CV is cut short.','model_response_truncated'],
      ['private provider credential and model text','engine_failed'],
    ]) {
      await fs.writeFile(script,`console.error(${JSON.stringify(message)});process.exitCode=1;`);
      await assert.rejects(runProcess({script,cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows'}}), e=>e.code===code&&e.message===code);
    }
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
