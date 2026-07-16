import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const KEY = "ielts-state-v1";

function pinOk(req: NextRequest) {
  const pin = req.headers.get("x-app-pin") || "";
  const expected = process.env.APP_PIN || "";
  return expected.length > 0 && pin === expected;
}

export async function GET(req: NextRequest) {
  if (!pinOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const data = await redis.get(KEY);
  return NextResponse.json({ data: data || null });
}

export async function POST(req: NextRequest) {
  if (!pinOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  await redis.set(KEY, body);
  return NextResponse.json({ ok: true });
}
