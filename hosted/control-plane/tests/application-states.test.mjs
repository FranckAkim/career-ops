import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadYaml} from '../../../lib/yaml-document.mjs';
import {applicationStates} from '../application-states.mjs';
test('hosted status allowlist exactly matches the canonical engine states',()=>{
 assert.deepEqual(applicationStates,loadYaml(fs.readFileSync(new URL('../../../templates/states.yml',import.meta.url),'utf8')).states.map(state=>state.label));
});
