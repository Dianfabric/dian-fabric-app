/**
 * Regenerate v4 embeddings + colour signatures for every fabric (server pipeline, same code as /api/embed).
 *
 *   DINO_CACHE_DIR=scripts/exp/hf-cache node --experimental-strip-types scripts/regen-embeddings-v4.ts [--dry] [--limit N] [--only-missing]
 *
 * - Requires SUPABASE_SERVICE_KEY in .env.local (Mac mini). Quoted values are handled.
 * - Requires supabase/v4-search-schema.sql to have been applied (columns emb_v4*, color_sig).
 * - Resumable: with --only-missing it skips rows that already have emb_v4 (default is full rebuild).
 * - --dry computes but does not write (use to time a batch).
 * - Writes go through PostgREST in batches of 20 rows (upsert by id, only the v4 columns).
 *
 * DO NOT run before the experiment report has been reviewed and the DB write has been approved.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { embedImage, DINO_DTYPE, DINO_MODEL, toVectorString } from "../src/lib/dino-server.ts";
import { imageSignature } from "../src/lib/color-lab.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY_MISSING = args.includes("--only-missing");
const LIMIT = +(args[args.indexOf("--limit") + 1] || 0) || Infinity;

const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
}
if (!env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY missing in .env.local (run on the Mac mini)");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

type Row = { id: string; image_url: string; name: string };
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  let q = sb.from("fabrics").select("id,image_url,name").not("image_url", "is", null).order("id").range(from, from + 999);
  if (ONLY_MISSING) q = q.is("emb_v4", null);
  const { data, error } = await q;
  if (error) throw error;
  rows.push(...(data as Row[]));
  if (!data || data.length < 1000) break;
}
const todo = rows.slice(0, LIMIT);
console.log(`rows ${rows.length}, processing ${todo.length}, dtype ${DINO_DTYPE}, dry=${DRY}, onlyMissing=${ONLY_MISSING}`);

const meta = { dtype: DINO_DTYPE, model: DINO_MODEL, at: new Date().toISOString().slice(0, 10), work: 448 };
const failLog = fs.createWriteStream("scripts/regen-v4-failures.log", { flags: "a" });
let done = 0, failed = 0; const t0 = Date.now();

async function processRow(r: Row) {
  const res = await fetch(r.image_url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // chosen representation (2026-09-15 experiments): full-image CLS + centre-crop patch mean + raw LAB colour
  const [f, color] = await Promise.all([embedImage(buf, ["full", "crop"]), imageSignature(buf)]);
  return {
    id: r.id,
    emb_v4: toVectorString(f.full.cls),
    emb_v4_crop: toVectorString(f.crop!.mean),
    color_sig: color,
    emb_v4_meta: meta,
  };
}

const BATCH = 20;
const WRITE_CONCURRENCY = 4;
for (let i = 0; i < todo.length; i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  const results = await Promise.allSettled(slice.map((r) => processRow(r)));
  const ok = [];
  results.forEach((res, j) => {
    if (res.status === "fulfilled") ok.push(res.value);
    else { failed++; failLog.write(`${slice[j].id}\t${slice[j].name}\t${res.reason?.message || res.reason}\n`); }
  });
  if (!DRY && ok.length) {
    // one UPDATE per row keeps other columns untouched. HNSW inserts get slower as the index grows, so
    // writes run with limited concurrency and retry on "statement timeout".
    const queue = ok.slice();
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift()!;
        let lastErr = "";
        for (let attempt = 0; attempt < 4; attempt++) {
          const { error } = await sb.from("fabrics").update({ emb_v4: u.emb_v4, emb_v4_crop: u.emb_v4_crop, color_sig: u.color_sig, emb_v4_meta: u.emb_v4_meta }).eq("id", u.id);
          if (!error) { lastErr = ""; break; }
          lastErr = error.message;
          if (!/timeout/i.test(error.message)) break;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
        if (lastErr) { failed++; failLog.write(`${u.id}\tUPDATE\t${lastErr}\n`); }
      }
    };
    await Promise.all(Array.from({ length: WRITE_CONCURRENCY }, worker));
  }
  done += ok.length;
  if ((i / BATCH) % 10 === 0 || i + BATCH >= todo.length) {
    const el = (Date.now() - t0) / 1000;
    console.log(`${done + failed}/${todo.length} done (${failed} failed) ${(el / Math.max(1, done + failed)).toFixed(2)}s/row eta ${((todo.length - done - failed) * el / Math.max(1, done + failed) / 60).toFixed(0)}min`);
  }
}
failLog.end();
console.log(`finished: ${done} written, ${failed} failed, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
