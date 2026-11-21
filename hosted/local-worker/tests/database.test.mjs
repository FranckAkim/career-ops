import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {observeDatabaseErrors} from '../database.mjs';
test('checked-out client disconnects do not terminate the worker or log raw connection errors',()=>{
 const pool=new EventEmitter(),client=new EventEmitter(),reports=[];
 observeDatabaseErrors(pool,code=>reports.push(code));pool.emit('connect',client);
 assert.doesNotThrow(()=>client.emit('error',new Error('private database connection details')));
 assert.doesNotThrow(()=>pool.emit('error',new Error('private idle connection details')));
 assert.deepEqual(reports,['database_connection_interrupted','database_connection_interrupted']);
});
