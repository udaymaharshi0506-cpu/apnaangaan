import { dispatch } from "@/lib/api-handler";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ segments: string[] }> };
export const GET = (request: NextRequest, context: Context) => dispatch(request, "GET", context);
export const POST = (request: NextRequest, context: Context) => dispatch(request, "POST", context);
export const PATCH = (request: NextRequest, context: Context) => dispatch(request, "PATCH", context);
export const DELETE = (request: NextRequest, context: Context) => dispatch(request, "DELETE", context);
