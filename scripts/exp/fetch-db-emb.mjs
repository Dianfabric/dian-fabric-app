// Pull the embeddings currently stored in Supabase (embedding_dino = Colab fp32 CLS, dino_crop) for the pool ids,
// so eval.mjs can compare "db" as a variant and measure DB-vs-local drift. Read only.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
const S = "scripts/exp/data";
const env = {}; for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1"); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const meta = JSON.parse(fs.readFileSync(S + "/meta.json", "utf8"));
const ids = meta.rows.map((r) => r.id);
const l2 = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return n > 0 ? v.map((x) => x / n) : v; };
const parse = (e) => (e == null ? null : typeof e === "string" ? JSON.parse(e) : e);
const db = {}, dbcrop = {};
for (let i = 0; i < ids.length; i += 50) {
  const { data, error } = await sb.from("fabrics").select("id,embedding_dino,embedding_dino_crop").in("id", ids.slice(i, i + 50));
  if (error) { console.log("err", error.message); continue; }
  for (const r of data) { const a = parse(r.embedding_dino), b = parse(r.embedding_dino_crop); if (a) db[r.id] = { cls: l2(a).map((x) => +x.toFixed(5)) }; if (b) dbcrop[r.id] = { cls: l2(b).map((x) => +x.toFixed(5)) }; }
  if (i % 500 === 0) console.log(i, "/", ids.length);
}
fs.writeFileSync(`${S}/emb-db.json`, JSON.stringify(db)); fs.writeFileSync(`${S}/emb-dbcrop.json`, JSON.stringify(dbcrop));
console.log("db", Object.keys(db).length, "dbcrop", Object.keys(dbcrop).length, "dim", Object.values(db)[0]?.cls.length);
