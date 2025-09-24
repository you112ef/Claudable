import { NextResponse } from 'next/server';

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL;

async function proxy(request: Request, { params }: { params: { path: string[] } }) {
  if (!BACKEND_BASE_URL) {
    return NextResponse.json(
      { error: 'Server misconfiguration: BACKEND_BASE_URL is not set' },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const path = params.path?.join('/') || '';
  const targetUrl = `${BACKEND_BASE_URL}/api/${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual'
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(targetUrl, init as any);
    const resHeaders = new Headers(upstream.headers);
    // Remove hop-by-hop headers
    resHeaders.delete('transfer-encoding');
    resHeaders.delete('content-encoding');
    resHeaders.delete('connection');

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: upstream.status,
      headers: resHeaders
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Proxy request failed', details: String(err) }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as OPTIONS };

