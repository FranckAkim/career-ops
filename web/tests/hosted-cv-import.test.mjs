import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateCvFile,checkedCvText,decodeCvText} from '../src/lib/hosted-cv-import.mjs';
test('CV imports accept bounded known formats and preserve reviewed Unicode text',()=>{
 for(const name of ['cv.pdf','cv.DOCX','cv.txt','cv.md'])assert.doesNotThrow(()=>validateCvFile({name,size:123}));
 for(const file of [{name:'cv.doc',size:3},{name:'cv.exe',size:3},{name:'cv.pdf',size:0},{name:'cv.pdf',size:5*1024*1024+1}])assert.throws(()=>validateCvFile(file));
 const text='Élodie — Synthetic Engineer\r\nPython reporting experience';assert.equal(checkedCvText(text),'Élodie — Synthetic Engineer\nPython reporting experience');assert.equal(decodeCvText(new TextEncoder().encode(text)),text);
 assert.equal(decodeCvText(Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')])),text);
 assert.throws(()=>checkedCvText('\\'.repeat(150000)),/too much text/);
 assert.throws(()=>decodeCvText(Uint8Array.from([255,255,255])),/could not be read/);assert.throws(()=>checkedCvText('x'.repeat(200001)),/too much text/);assert.throws(()=>checkedCvText(''),/No readable/);assert.throws(()=>checkedCvText('Synthetic binary file\0 data'),/readable text/);
});
