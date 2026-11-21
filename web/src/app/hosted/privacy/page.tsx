import {notFound} from 'next/navigation';
import {hostedMode} from '@/lib/hosted-mode.mjs';
import {executionPolicy} from '@/lib/hosted-policy.mjs';
import styles from '../screen.module.css';

export const metadata={title:'Privacy and processing · Career Workspace'};
export const dynamic='force-dynamic';
export default function PrivacyPage(){
  if(!hostedMode())notFound();
  const {mode}=executionPolicy();
  return <main className={styles.page}>
    <a href="/hosted">Back to Career Workspace</a>
    <h1>Privacy and processing</h1>
    <p>Career Workspace is an early preview. Add only career information you choose to share with this service. Review generated reports and CVs before using them.</p>
    <h2>Where your information goes</h2>
    <p>Your account, confirmed profile, job descriptions and job history are stored in the hosted service on Vercel and Neon. Workspace files and generated documents use private Vercel Blob storage. Access to results requires your signed-in account.</p>
    <p>{mode==='local' ? 'AI inference runs with Ollama on the service operator’s computer. That computer downloads the workspace needed for a job. The inference containers have no external network access, and local mode has no automatic cloud AI fallback. The computer must be running for jobs to finish.' : 'Local AI processing is not selected for this deployment. Do not submit personal information until the operator has confirmed a suitable processing configuration.'}</p>
    <h2>Sign-in and control</h2>
    <p>Google sign-in provides your account identity, name and email. It does not grant access to Gmail or Google Drive. Career Workspace never submits applications automatically.</p>
    <h2>Storage and deletion</h2>
    <p>Profiles, drafts, history and documents remain stored for the preview. Automatic retention limits and self-service account deletion are not available yet. Temporary job workspaces are removed after processing; this does not delete stored snapshots or results. Avoid adding information you need removed automatically.</p>
  </main>;
}
