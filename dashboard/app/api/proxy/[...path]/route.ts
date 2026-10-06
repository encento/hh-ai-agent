import { NextRequest, NextResponse } from "next/server";

async function proxy(request: NextRequest, params: { path: string[] }) {
  const base = process.env.AGENT_API_URL?.replace(/\/$/, "");
  const token = process.env.AGENT_API_KEY;
  if (!base || !token) {
    return NextResponse.json({ detail: "dashboard_backend_not_configured" }, { status: 503 });
  }

  const incoming = new URL(request.url);
  const target = new URL(base + "/api/" + params.path.join("/"));
  target.search = incoming.search;

  const headers = new Headers();
  headers.set("X-Agent-Key", token);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store"
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.text();
  }

  try {
    const response = await fetch(target, init);
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" }
    });
  } catch {
    return NextResponse.json({ detail: "local_agent_unreachable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(request, params);
}
export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(request, params);
}
export async function PATCH(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(request, params);
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(request, params);
}
