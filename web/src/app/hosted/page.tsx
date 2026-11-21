import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { hostedMode } from '@/lib/hosted-mode.mjs';
import { hostedSession } from '@/lib/hosted-server.mjs';
import { OnboardingScreen } from './screen';
import {executionPolicy} from '@/lib/hosted-policy.mjs';

export const metadata = { title: 'Career Workspace', description: 'Review your career profile and prepare your next move.' };
export const dynamic = 'force-dynamic';
export default async function HostedPage() {
  if (!hostedMode()) notFound();
  const session = await hostedSession(await headers());
  return <OnboardingScreen user={session.user} unavailable={session.unavailable} executionMode={executionPolicy().mode} applicationsEnabled={process.env.VERCEL!=='1'||process.env.HOSTED_APPLICATIONS_ENABLED==='1'} />;
}
