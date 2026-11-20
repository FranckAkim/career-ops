import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedImageFile } from '../image-context.mjs';
test('image source excludes nested tools, credentials, candidate files and generated output',()=>{
  for(const file of ['hosted/web/.env.local','hosted/web/src/app/page.tsx','hosted/web/node_modules/a.mjs','hosted/control-plane/schema.sql','hosted/sandbox-worker/runner.mjs','hosted/web/.vercel/project.json','config/profile.yml','cv.md','modes/_profile.md','templates/cv-person.html','lib/.env','lib/../cv.md']) assert.equal(allowedImageFile(file),false,file);
  for(const file of ['hosted/Dockerfile','hosted/worker.mjs','hosted/transfer-worker.mjs','hosted/package.json','lib/is-main-module.mjs','fonts/OFL.txt','modes/evaluate.md','templates/cv-template.html','config/profile.example.yml']) assert.equal(allowedImageFile(file),true,file);
});
