export const CV_FILE_ACCEPT='.pdf,.docx,.txt,.md,.markdown';
export const MAX_CV_FILE_BYTES=5*1024*1024;
const maxText=200000,maxXml=2000000;
export function validateCvFile(file){
 if(!file||typeof file.name!=='string'||!Number.isSafeInteger(file.size)||file.size<=0)throw Error('Choose a CV file with text in it.');
 if(!/\.(pdf|docx|txt|md|markdown)$/i.test(file.name))throw Error('Choose a PDF, Word (.docx), Markdown or text file. Older .doc files must be saved as .docx first.');
 if(file.size>MAX_CV_FILE_BYTES)throw Error('Choose a CV smaller than 5 MB.');
}
export function checkedCvText(value){
 const text=value.replace(/\r\n?/g,'\n').replace(/\f/g,'\n').trim();
 if(text.length>maxText||new TextEncoder().encode(JSON.stringify(text)).length>220000)throw Error('This CV has too much text. Choose a shorter document.');
 if(text.includes('\0'))throw Error('This file does not contain readable text. Choose a PDF, Word or UTF-8 text CV.');
 if(text.length<20)throw Error('No readable CV text was found. For a scanned PDF, export a text-based PDF or Word document.');
 return text;
}
export function decodeCvText(data){
 try{const encoding=data[0]===255&&data[1]===254?'utf-16le':data[0]===254&&data[1]===255?'utf-16be':'utf-8';return new TextDecoder(encoding,{fatal:true}).decode(data);}catch{throw Error('This text file could not be read. Save it as UTF-8 text, or choose PDF or Word.');}
}
function wordXmlText(xml){
 if(/<!\s*(DOCTYPE|ENTITY)/i.test(xml))throw Error('This Word document could not be read. Save a new .docx copy and try again.');
 const doc=new DOMParser().parseFromString(xml,'application/xml'),ns=doc.documentElement.namespaceURI;
 if(doc.getElementsByTagName('parsererror').length||!['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'].includes(ns))throw Error('This Word document could not be read. Save a new .docx copy and try again.');
 return [...doc.getElementsByTagNameNS(ns,'p')].map(p=>{
  const walk=doc.createTreeWalker(p,1),parts=[];let node;
  while((node=walk.nextNode())){let parent=node.parentElement;while(parent&&!(parent.localName==='p'&&parent.namespaceURI===ns))parent=parent.parentElement;if(parent!==p||node.namespaceURI!==ns)continue;
   if(node.localName==='t')parts.push(node.textContent||'');else if(node.localName==='tab')parts.push('\t');else if(node.localName==='br')parts.push('\n');
  }return parts.join('');
 }).join('\n');
}
async function docxText(data){
 if(data[0]!==80||data[1]!==75)throw Error('This is not a readable Word (.docx) file. Save a new copy and try again.');
 const {unzipSync}=await import('fflate');let size=0,count=0,entries=0;const names=new Set();
 let files;try{files=unzipSync(data,{filter:f=>{if(++entries>2000)throw Error();if(!/^word\/(document|header[0-9]+|footer[0-9]+)\.xml$/.test(f.name))return false;if(names.has(f.name)||++count>16||!Number.isSafeInteger(f.originalSize)||f.originalSize<0||(size+=f.originalSize)>maxXml)throw Error();names.add(f.name);return true;}});}catch{throw Error('This Word file is damaged or too complex. Save a simpler .docx copy and try again.');}
 if(Object.values(files).reduce((n,b)=>n+b.length,0)>maxXml)throw Error('This Word file is too complex. Save a simpler .docx copy.');
 if(!files['word/document.xml'])throw Error('This Word document has no readable body. Choose another .docx file.');
 return Object.keys(files).sort((a,b)=>{const rank=n=>n.includes('/header')?0:n.includes('/document')?1:2;return rank(a)-rank(b)||a.localeCompare(b);}).map(n=>wordXmlText(decodeCvText(files[n]))).join('\n\n');
}
async function pdfText(data){
 if(new TextDecoder().decode(data.subarray(0,1024)).indexOf('%PDF-')<0)throw Error('This is not a readable PDF. Save a new PDF or choose Word.');
 const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
 let task,timer;const worker=new pdfjs.PDFWorker();
 try{return await Promise.race([(async()=>{
  await worker.promise;if(!(worker.port instanceof Worker))throw Error('The PDF reader could not start. Reload and try again, or choose Word.');
  task=pdfjs.getDocument({data,worker,isEvalSupported:false,useWasm:false,disableFontFace:true,enableXfa:false,stopAtErrors:true,verbosity:0});const pdf=await task.promise;
  if(pdf.numPages>30)throw Error('Choose a PDF with no more than 30 CV pages.');let text='';
  for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent();text+=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('')+'\n\n';page.cleanup();if(text.length>maxText)throw Error('This CV has too much text. Choose a shorter document.');}return text;
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Reading this PDF took too long. Try a simpler PDF or Word document.')),30000);})]);
 }catch(e){if(e?.name==='PasswordException')throw Error('This PDF is password protected. Choose an unlocked copy.');if(e?.name==='InvalidPDFException')throw Error('This PDF could not be read. Save a new copy or choose Word.');if(e instanceof Error&&/^(Choose|This CV|Reading this PDF|The PDF reader)/.test(e.message))throw e;throw Error('This PDF could not be read. Save a new text-based PDF or choose Word.');
 }finally{clearTimeout(timer);await task?.destroy();worker.destroy();}
}
export async function readCvFile(file){
 validateCvFile(file);const data=new Uint8Array(await file.arrayBuffer());if(data.length!==file.size)throw Error('The file changed while reading. Choose it again.');
 const text=/\.pdf$/i.test(file.name)?await pdfText(data):/\.docx$/i.test(file.name)?await docxText(data):decodeCvText(data);
 return checkedCvText(text);
}

// Shared bounded browser document reader; original bytes are never uploaded.
export async function readPostingFile(file){
 try{const text=await readCvFile(file);if(text.length>30000)throw Error('This job posting is too long. Keep the posting text within 30,000 characters.');return text;}
 catch(error){throw Error((error instanceof Error?error.message:'This document could not be read.').replace(/\bCVs?\b/g,'job posting'));}
}
