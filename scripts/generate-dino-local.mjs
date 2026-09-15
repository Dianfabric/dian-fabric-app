/**
 * ⚠️ 구 버전 폐기 (2026-09-15)
 *
 * 이 스크립트는 예전에 Xenova/dinov2-base **q8** 로 embedding_dino 를 생성했다.
 * q8 ONNX 벡터는 fp32 벡터와 코사인 0.36 밖에 안 되어 (Node·브라우저 모두), 이 스크립트로 만든
 * 1,521행이 검색에서 사실상 보이지 않는 원인이 됐다. scripts/exp/results-golden.md 참고.
 *
 * 신규 원단 임베딩은 v4 파이프라인(서버와 동일 코드)으로 생성한다:
 *
 *   DINO_DTYPE=fp32 DINO_CACHE_DIR=scripts/exp/hf-cache \
 *   node --experimental-strip-types scripts/regen-embeddings-v4.ts --only-missing
 *
 * (fp32 = fp16 과 벡터가 동일하고 CPU에서 더 빠르다. emb_v4, emb_v4_crop, color_sig, emb_v4_meta 를 채운다.)
 * 이 파일을 직접 실행하면 위 명령을 대신 실행한다.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (!args.includes("--only-missing") && !args.includes("--all")) args.push("--only-missing");
const finalArgs = args.filter((a) => a !== "--all");
console.log("→ v4 파이프라인으로 위임: node --experimental-strip-types scripts/regen-embeddings-v4.ts", finalArgs.join(" "));
const r = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/regen-embeddings-v4.ts", ...finalArgs], {
  stdio: "inherit",
  env: { DINO_DTYPE: "fp32", DINO_CACHE_DIR: "scripts/exp/hf-cache", ...process.env },
});
process.exit(r.status ?? 1);
