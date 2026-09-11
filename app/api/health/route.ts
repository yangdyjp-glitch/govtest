import { database } from "@/lib/database";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try {
    await database().prepare("SELECT 1 AS healthy").first();
    return Response.json(
      {
        status: "ok",
        runtime: "node",
        storage: process.env.DATABASE_URL
          ? "postgresql"
          : process.env.RAILWAY_VOLUME_MOUNT_PATH
            ? "persistent-volume"
            : "local-file",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
