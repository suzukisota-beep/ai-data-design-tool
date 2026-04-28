import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOWED_IPS = [
  '163.43.142.40',
];

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for');

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return '';
}

export function middleware(req: NextRequest) {
  const ip = getClientIp(req);

  if (!ALLOWED_IPS.includes(ip)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
      Next.js内部ファイルや静的ファイルは除外
    */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};