import { hostedRequest } from '@/lib/hosted-server.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const GET = hostedRequest;
export const POST = hostedRequest;
