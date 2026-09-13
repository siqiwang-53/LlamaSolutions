import { probeLmStudio } from "@/lib/ai/lmstudio";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await probeLmStudio();

  return Response.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
