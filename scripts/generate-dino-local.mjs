/**
 * DINOv2 global 임베딩 로컬 생성 (Colab 대체)
 * Xenova/dinov2-base (q8) + CLS 토큰 + L2 정규화 → dino-client.ts(브라우저)와 동일 방식
 * embedding_dino IS NULL 인 행만 처리
 *
 * 실행: node scripts/generate-dino-local.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";
import { readFileSync } from "fs";

const env = {};
readFileSync(".env.local", "utf-8").split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const CONC = 4; // 이미지 다운로드 동시성

function l2(vec) { const n = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)); return n > 0 ? vec.map((v) => v / n) : vec; }

async function main() {
  console.log("=== DINOv2 global 임베딩 (로컬) ===");
  console.log("[1/3] 모델 로딩 (Xenova/dinov2-base q8)...");
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained("Xenova/dinov2-base"),
    AutoModel.from_pretrained("Xenova/dinov2-base", { dtype: "q8" }),
  ]);
  console.log("  ✓ 모델 로드 완료\n");

  console.log("[2/3] 대상 조회 (embedding_dino IS NULL)...");
  let all = [], from = 0;
  while (true) {
    const { data, error } = await sb.from("fabrics").select("id, image_url").is("embedding_dino", "null").not("image_url", "is", "null").range(from, from + 999);
    if (error) { console.error(error.message); break; }
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < 1000) break; from += 1000;
  }
  console.log(`  ✓ ${all.length}개 대상\n`);
  if (!all.length) { console.log("처리할 행이 없습니다."); return; }

  console.log("[3/3] 임베딩 생성...");
  let ok = 0, fail = 0;
  const start = Date.now();

  async function one(f) {
    try {
      const image = await RawImage.fromURL(f.image_url);
      const inputs = await processor(image);
      const output = await model(inputs);
      const dims = output.last_hidden_state.dims;
      const hidden = dims[dims.length - 1];
      const cls = l2(Array.from(output.last_hidden_state.data.slice(0, hidden)));
      const { error } = await sb.from("fabrics").update({ embedding_dino: `[${cls.join(",")}]` }).eq("id", f.id);
      if (error) throw new Error(error.message);
      ok++;
    } catch (e) { fail++; if (fail <= 10) console.log(`  ✗ ${f.id}: ${e.message}`); }
  }

  for (let i = 0; i < all.length; i += CONC) {
    await Promise.all(all.slice(i, i + CONC).map(one));
    const done = ok + fail;
    if (done % 40 < CONC) {
      const el = (Date.now() - start) / 1000;
      const eta = Math.ceil((el / done) * (all.length - done) / 60);
      process.stdout.write(`\r  [${done}/${all.length}] ✓${ok} ✗${fail} | ETA ~${eta}분   `);
    }
  }
  console.log(`\n\n=== 완료: ✓${ok} ✗${fail} (${((Date.now() - start) / 60000).toFixed(1)}분) ===`);
}
main().catch((e) => { console.error(e); process.exit(1); });
