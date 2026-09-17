import { NextRequest, NextResponse } from "next/server";
import { embedImage, DINO_DTYPE, type DinoVariant } from "@/lib/dino-server";
import { imageSignature } from "@/lib/color-lab";

/**
 * POST /api/embed — server-side query featurisation for the v4 photo search.
 * Replaces the browser-side DINOv2 (q8) model download.
 *
 * Body: multipart/form-data with `image` (File), optional `variants` ("full,gray,crop,tiles")
 *   or JSON { imageBase64, variants? }.
 * Returns: { dtype, full:{cls,mean}, gray?, crop?, tiles?, color:{wb,raw}, ms }
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    let buf: Buffer | null = null;
    let variants: DinoVariant[] = ["full", "crop"]; // v4 representation: full CLS + centre-crop patch mean
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      if (!(file instanceof Blob)) return NextResponse.json({ error: "image 파일이 필요합니다" }, { status: 400 });
      buf = Buffer.from(await file.arrayBuffer());
      const v = form.get("variants");
      if (typeof v === "string" && v) variants = v.split(",").map((s) => s.trim()) as DinoVariant[];
    } else {
      const body = await request.json();
      if (typeof body.imageBase64 !== "string") return NextResponse.json({ error: "imageBase64 가 필요합니다" }, { status: 400 });
      buf = Buffer.from(body.imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      if (Array.isArray(body.variants)) variants = body.variants;
    }
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: "이미지가 너무 큽니다 (12MB 이하)" }, { status: 413 });

    // Optional capture of real query photos (SEARCH_QUERY_CAPTURE=1): stored in the private "search-queries" bucket so
    // misses can be reproduced offline and a real phone-photo test set accumulates. Never blocks the response.
    let captureId: string | null = null;
    if (process.env.SEARCH_QUERY_CAPTURE === "1") {
      const d = new Date(); captureId = `${d.toISOString().slice(0, 10)}/${d.toISOString().slice(11, 19).replace(/:/g, "")}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { createServiceClient } = await import("@/lib/supabase");
      createServiceClient().storage.from("search-queries").upload(captureId, buf, { contentType: "image/jpeg", upsert: false }).then(({ error }) => { if (error) console.warn("query capture failed", error.message); });
    }

    const [features, color] = await Promise.all([embedImage(buf, variants), imageSignature(buf)]);
    return NextResponse.json({ dtype: DINO_DTYPE, ...features, color, captureId, ms: Date.now() - t0 });
  } catch (e) {
    console.error("embed error", e);
    return NextResponse.json({ error: "임베딩 생성 실패: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
