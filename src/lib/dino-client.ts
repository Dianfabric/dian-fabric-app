/**
 * 클라이언트(브라우저)에서 DINOv2 이미지 임베딩을 생성하는 유틸리티
 * @huggingface/transformers v3 + Xenova/dinov2-base (768차원)
 *
 * CLS 토큰을 글로벌 이미지 표현으로 사용
 */

import type { ModelLoadingStatus } from "./clip-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelInstance: { processor: any; model: any } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadingPromise: Promise<{ processor: any; model: any }> | null = null;

async function ensureModel(
  onStatus?: (status: ModelLoadingStatus) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ processor: any; model: any }> {
  if (modelInstance) return modelInstance;

  if (!loadingPromise) {
    loadingPromise = (async () => {
      try {
        onStatus?.({ status: "loading", message: "DINOv2 모델 준비 중..." });

        // AutoModel은 .d.ts에 노출 안되지만 런타임은 정상 export됨 → any 캐스팅
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transformers: any = await import("@huggingface/transformers");
        const { AutoProcessor, AutoModel, env } = transformers;

        env.allowLocalModels = false;

        onStatus?.({
          status: "loading",
          message: "DINOv2 모델 다운로드 중 (최초 1회, 약 90MB)...",
        });

        const [processor, model] = await Promise.all([
          AutoProcessor.from_pretrained("Xenova/dinov2-base"),
          AutoModel.from_pretrained("Xenova/dinov2-base", { dtype: "q8" }),
        ]);

        modelInstance = { processor, model };
        onStatus?.({ status: "ready" });
        return modelInstance;
      } catch (err) {
        loadingPromise = null;
        const message = err instanceof Error ? err.message : "DINOv2 모델 로딩 실패";
        console.error("[DINOv2] 모델 로딩 에러:", err);
        onStatus?.({ status: "error", message });
        throw err;
      }
    })();
  }

  return loadingPromise;
}

export async function getDinoEmbedding(
  imageFile: File,
  onStatus?: (status: ModelLoadingStatus) => void
): Promise<number[]> {
  const { RawImage } = await import("@huggingface/transformers");
  const { processor, model } = await ensureModel(onStatus);

  onStatus?.({ status: "loading", message: "DINOv2 이미지 분석 중..." });

  const image = await RawImage.fromBlob(imageFile);
  const inputs = await processor(image);
  const output = await model(inputs);

  const lastHidden = output.last_hidden_state;
  if (!lastHidden) {
    throw new Error(`DINOv2 출력 인식 불가: ${Object.keys(output || {}).join(", ")}`);
  }

  // last_hidden_state: [batch=1, seq, hidden_dim]
  // CLS 토큰은 seq의 첫 번째 위치 (index 0) → 768차원 글로벌 표현
  const dims = lastHidden.dims as number[];
  const hiddenDim = dims[dims.length - 1];
  const cls: number[] = Array.from(lastHidden.data.slice(0, hiddenDim));

  // L2 정규화 (코사인 유사도용)
  const norm = Math.sqrt(cls.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? cls.map((v) => v / norm) : cls;
}

export function isDinoModelLoaded(): boolean {
  return modelInstance !== null;
}
