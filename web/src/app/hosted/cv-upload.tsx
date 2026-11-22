'use client';
import {useEffect,useRef,useState} from 'react';
import {CV_FILE_ACCEPT,readCvFile} from '@/lib/hosted-cv-import.mjs';
import s from './cv-upload.module.css';
export function CvUpload({value,onChange,disabled,onBusyChange}:{value:string;onChange:(text:string)=>void;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
 const [reading,setReading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[fileName,setFileName]=useState('');const current=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;current.current++;};},[]);
 async function choose(event:React.ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';if(!file)return;const run=++current.current;setReading(true);onBusyChange(true);setError('');setNotice('');
  try{const text=await readCvFile(file);if(mounted.current&&run===current.current){onChange(text);setFileName(file.name);setNotice('CV imported. Review the extracted text below before confirming your profile.');}}
  catch(e){if(mounted.current&&run===current.current)setError(e instanceof Error?e.message:'This CV could not be read. Choose another file.');}
  finally{if(mounted.current&&run===current.current){setReading(false);onBusyChange(false);}}
 }
 return <section className={s.upload} aria-label="Import your CV"><label className={s.label}>Upload your CV<input type="file" accept={CV_FILE_ACCEPT} disabled={disabled||reading} onChange={choose} aria-describedby="cv-upload-help"/></label><p id="cv-upload-help">PDF, Word (.docx), Markdown or text · up to 5 MB. Your file is read in your browser. Extracted text is saved through the profile review below.</p>{value&&<p>Choosing another file replaces the text below. Your saved profile changes only after you review and confirm.</p>}{reading&&<p role="status">Reading your CV…</p>}{notice&&<p role="status">{fileName}: {notice}</p>}{error&&<p role="alert" className={s.error}>{error}</p>}</section>;
}
