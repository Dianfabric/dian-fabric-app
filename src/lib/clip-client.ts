/**
 * 클라이언트(브라우저)에서 CLIP 이미지 임베딩을 생성하는 유틸리티
 * @huggingface/transformers v3 사용 (브라우저 WASM 네이티브 지원)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelInstance: { processor: any; model: any } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadingPromise: Promise<{ processor: any; model: any }> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let textModelInstance: { tokenizer: any; model: any } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let textLoadingPromise: Promise<{ tokenizer: any; model: any }> | null = null;

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
        console.log("[CLIP] @huggingface/transformers v3 로딩...");

        const {
          AutoProcessor,
          CLIPVisionModelWithProjection,
          env,
        } = await import("@huggingface/transformers");

        // 브라우저에서 로컬 모델 비활성화
        env.allowLocalModels = false;

        onStatus?.({
          status: "loading",
          message: "CLIP 모델 다운로드 중 (최초 1회)...",
        });

        console.log("[CLIP] 모델 다운로드 시작...");
        const [processor, model] = await Promise.all([
          AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32"),
          CLIPVisionModelWithProjection.from_pretrained(
            "Xenova/clip-vit-base-patch32",
            {
              dtype: "q8",
            }
          ),
        ]);
        console.log("[CLIP] 모델 다운로드 완료!");

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
  const { RawImage } = await import("@huggingface/transformers");
  const { processor, model } = await ensureModel(onStatus);

  onStatus?.({ status: "loading", message: "이미지 분석 중..." });

  console.log("[CLIP] 이미지 처리:", imageFile.name, imageFile.size);
  const image = await RawImage.fromBlob(imageFile);
  console.log("[CLIP] RawImage:", image.width, "x", image.height);

  const imageInputs = await processor(image);
  console.log("[CLIP] 프로세서 완료");

  const output = await model(imageInputs);
  console.log("[CLIP] 모델 출력 keys:", Object.keys(output || {}));

  // 임베딩 추출
  let rawData: Float32Array | null = null;

  if (output.image_embeds) {
    rawData = output.image_embeds.data;
    console.log("[CLIP] image_embeds 사용, 차원:", rawData?.length);
  } else if (output.image_embeddings) {
    rawData = output.image_embeddings.data;
    console.log("[CLIP] image_embeddings 사용, 차원:", rawData?.length);
  } else {
    const keys = Object.keys(output || {});
    console.error("[CLIP] 알 수 없는 출력:", keys);
    throw new Error(`CLIP 출력 인식 불가: ${keys.join(", ")}`);
  }

  if (!rawData || rawData.length === 0) {
    throw new Error("CLIP 임베딩이 비어있습니다");
  }

  const vector: number[] = Array.from(rawData);
  console.log("[CLIP] 최종 임베딩 차원:", vector.length);

  // L2 정규화
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    return vector.map((val) => val / norm);
  }
  return vector;
}

async function ensureTextModel(
  onStatus?: (status: ModelLoadingStatus) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ tokenizer: any; model: any }> {
  if (textModelInstance) return textModelInstance;

  if (!textLoadingPromise) {
    textLoadingPromise = (async () => {
      try {
        onStatus?.({ status: "loading", message: "텍스트 AI 모델 준비 중..." });

        const {
          AutoTokenizer,
          CLIPTextModelWithProjection,
          env,
        } = await import("@huggingface/transformers");

        env.allowLocalModels = false;

        onStatus?.({
          status: "loading",
          message: "CLIP 텍스트 모델 다운로드 중...",
        });

        const [tokenizer, model] = await Promise.all([
          AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch32"),
          CLIPTextModelWithProjection.from_pretrained(
            "Xenova/clip-vit-base-patch32",
            { dtype: "q8" }
          ),
        ]);

        textModelInstance = { tokenizer, model };
        onStatus?.({ status: "ready" });
        return textModelInstance;
      } catch (err) {
        textLoadingPromise = null;
        const message =
          err instanceof Error ? err.message : "텍스트 모델 로딩 실패";
        onStatus?.({ status: "error", message });
        throw err;
      }
    })();
  }

  return textLoadingPromise;
}

export async function getClipTextEmbedding(
  text: string,
  onStatus?: (status: ModelLoadingStatus) => void
): Promise<number[]> {
  const { tokenizer, model } = await ensureTextModel(onStatus);

  onStatus?.({ status: "loading", message: "텍스트 분석 중..." });

  const textInputs = tokenizer(text, { padding: true, truncation: true });
  const output = await model(textInputs);

  let rawData: Float32Array | null = null;

  if (output.text_embeds) {
    rawData = output.text_embeds.data;
  } else if (output.text_embeddings) {
    rawData = output.text_embeddings.data;
  } else {
    const keys = Object.keys(output || {});
    throw new Error(`CLIP 텍스트 출력 인식 불가: ${keys.join(", ")}`);
  }

  if (!rawData || rawData.length === 0) {
    throw new Error("CLIP 텍스트 임베딩이 비어있습니다");
  }

  const vector: number[] = Array.from(rawData);

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
