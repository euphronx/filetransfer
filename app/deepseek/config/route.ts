import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ fcEndpoint: process.env.FC_ENDPOINT ?? "" });
}
