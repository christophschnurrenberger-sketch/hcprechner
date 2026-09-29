import { NextResponse, type NextRequest } from "next/server";
import { getCourse } from "@/server/courseRepository";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const course = await getCourse(id);
    if (!course) return NextResponse.json({ error: "Anlage nicht gefunden" }, { status: 404 });
    return NextResponse.json(course);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Golfplatzdatenbank nicht erreichbar" }, { status: 503 });
  }
}
