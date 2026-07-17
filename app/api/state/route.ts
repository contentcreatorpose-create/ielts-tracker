import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";

const KEY = "ielts-state-v1";

function pinOk(req: NextRequest) {
  const pin = req.headers.get("x-app-pin") || "";
  const expected = process.env.APP_PIN || "";
  return expected.length > 0 && pin === expected;
}

async function getClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return client;
}

export async function GET(req: NextRequest) {
  if (!pinOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const client = await getClient();
  try {
    const raw = await client.get(KEY);
    return NextResponse.json({ data: raw ? JSON.parse(raw) : null });
  } finally {
    await client.quit();
  }
}

export async function POST(req: NextRequest) {
  if (!pinOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const client = await getClient();
  try {
    await client.set(KEY, JSON.stringify(body));
    return NextResponse.json({ ok: true });
  } finally {
    await client.quit();
  }
}
