/**
 * 클라이언트(브라우저)에서 CLIP 이미지 임베딩을 생성하는 유틸리티
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelInstance: { processor: any; model: any } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadingPromise: Promise<{ processor: any; model: any }> | null = null;

export type ModelLoadingStatus =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "ready" }
  | { status: "error"; message: string };

async function ensureModel(
  onStatus?: (status: ModelLoadingStatus) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ processor: any; model: any }> {
  if (modelInstance) return modelInstance;

  if (!loadingPromise) {
    loadingPromise = (async () => {
      try {
        onStatus?.({ status: "loading", message: "AI 모델 준비 중..." });

        console.log("[CLIP] Transformers.js 로딩 시작...");
        const transformers = await import("@xenova/transformers");
        console.log("[CLIP] Transformers.js 로딩 완료");

        transformers.env.allowLocalModels = false;

        onStatus?.({
          status: "loading",
          message: "CLIP 모델 다운로드 중 (최초 1회)...",
        });

        console.log("[CLIP] 모델 다운로드 시작...");
        const [processor, model] = await Promise.all([
          transformers.AutoProcessor.from_pretrained(
            "Xenova/clip-vit-base-patch32"
          ),
          transformers.CLIPVisionModelWithProjection.from_pretrained(
            "Xenova/clip-vit-base-patch32",
            { quantized: true }
          ),
        ]);
        console.log("[CLIP] 모델 다운로드 완료");

        modelInstance = { processor, model };
        onStatus?.({ status: "ready" });
        return modelInstance;
      } catch (err) {
        loadingPromise = null;
        const message =
          err instanceof Error ? err.message : "모델 로딩 실패";
        console.error("[CLIP] 모델 로딩 에러:", err);
        onStatus?.({ status: "error", message });
        throw err;
      }
    })();
  }

  return loadingPromise;
}

export async function getClipEmbedding(
  imageFile: File,
  onStatus?: (status: ModelLoadingStatus) => void
): Promise<number[]> {
  const transformers = await import("@xenova/transformers");
  const { processor, model } = await ensureModel(onStatus);

  onStatus?.({ status: "loading", message: "이미지 분석 중..." });

  // File → RawImage
  console.log("[CLIP] 이미지 변환 시작...", imageFile.name, imageFile.size);
  const image = await transformers.RawImage.fromBlob(imageFile);
  console.log("[CLIP] RawImage 생성 완료:", image.width, "x", image.height);

  // CLIP 프로세서: 리사이즈, 정규화
  const imageInputs = await processor(image);
  console.log("[CLIP] 프로세서 완료, keys:", Object.keys(imageInputs || {}));

  // CLIP 비전 모델: 임베딩 생성
  const output = await model(imageInputs);
  console.log("[CLIP] 모델 출력 keys:", Object.keys(output || {}));

  // 임베딩 추출 — 여러 가능한 출력 형태 처리
  let rawEmbedding: Float32Array | number[] | null = null;

  if (output.image_embeds) {
    // CLIPVisionModelWithProjection 표준 출력 (512차원)
    console.log("[CLIP] image_embeds 사용");
    rawEmbedding = output.image_embeds.data;
  } else if (output.image_embeddings) {
    console.log("[CLIP] image_embeddings 사용");
    rawEmbedding = output.image_embeddings.data;
  } else if (output.last_hidden_state) {
    // CLS 토큰 (첫 번째 토큰) 사용
    console.log("[CLIP] last_hidden_state CLS 토큰 사용");
    const hiddenState = output.last_hidden_state;
    const dims = hiddenState.dims;
    console.log("[CLIP] hidden_state dims:", dims);
    // [batch, seq_len, hidden_dim] → CLS: [hidden_dim]
    const hiddenDim = dims[dims.length - 1];
    rawEmbedding = Array.from(
      (hiddenState.data as Float32Array).slice(0, hiddenDim)
    );
  } else {
    // 알 수 없는 출력 형태 — 모든 키 로깅
    const keys = Object.keys(output);
    console.error("[CLIP] 알 수 없는 출력 형태:", keys);
    for (const key of keys) {
      const val = output[key];
      if (val && val.data) {
        console.log(`[CLIP] ${key}: dims=${val.dims}, size=${val.data.length}`);
      } else {
        console.log(`[CLIP] ${key}:`, typeof val);
      }
    }
    throw new Error(
      `CLIP 모델 출력 형태를 인식할 수 없습니다. keys: ${keys.join(", ")}`
    );
  }

  if (!rawEmbedding) {
    throw new Error("CLIP 임베딩 생성 실패: 출력값이 비어있습니다");
  }

  const vector: number[] = Array.from(rawEmbedding);
  console.log("[CLIP] 임베딩 차원:", vector.length);

  // L2 정규화
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    return vector.map((val) => val / norm);
  }

  return vector;
}

export function isModelLoaded(): boolean {
  return modelInstance !== null;
}
