import { authRequest } from '@/lib/hosted-server.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const GET = authRequest;
export const POST = authRequest;
