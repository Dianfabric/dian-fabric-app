/**
 * 클라이언트(브라우저)에서 CLIP 이미지 임베딩을 생성하는 유틸리티
 *
 * Vercel 서버리스 환경에서 onnxruntime-node가 작동하지 않는 문제를 해결하기 위해
 * 브라우저의 WebAssembly(onnxruntime-web)를 사용하여 CLIP 모델을 실행합니다.
 *
 * 모델: Xenova/clip-vit-base-patch32 (512차원, DB 임베딩과 동일)
 * 최초 로딩 시 ~87MB 다운로드 (이후 브라우저 캐시)
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

/**
 * CLIP 모델 로딩 (싱글톤 - 한 번만 로드)
 */
async function ensureModel(
  onStatus?: (status: ModelLoadingStatus) => void
): Promise<{ processor: any; model: any }> {
  if (modelInstance) return modelInstance;

  if (!loadingPromise) {
    loadingPromise = (async () => {
      try {
        onStatus?.({ status: "loading", message: "AI 모델 준비 중..." });

        const { AutoProcessor, CLIPVisionModelWithProjection, env } =
          await import("@xenova/transformers");

        env.allowLocalModels = false;

        onStatus?.({
          status: "loading",
          message: "CLIP 모델 다운로드 중 (최초 1회)...",
        });

        const [processor, model] = await Promise.all([
          AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32"),
          CLIPVisionModelWithProjection.from_pretrained(
            "Xenova/clip-vit-base-patch32",
            { quantized: true }
          ),
        ]);

        modelInstance = { processor, model };
        onStatus?.({ status: "ready" });
        return modelInstance;
      } catch (err) {
        loadingPromise = null;
        const message =
          err instanceof Error ? err.message : "모델 로딩 실패";
        onStatus?.({ status: "error", message });
        throw err;
      }
    })();
  }

  return loadingPromise;
}

/**
 * 이미지 파일에서 CLIP 임베딩 생성 (512차원, L2 정규화)
 */
export async function getClipEmbedding(
  imageFile: File,
  onStatus?: (status: ModelLoadingStatus) => void
): Promise<number[]> {
  const { RawImage } = await import("@xenova/transformers");
  const { processor, model } = await ensureModel(onStatus);

  onStatus?.({ status: "loading", message: "이미지 분석 중..." });

  // File → RawImage
  const image = await RawImage.fromBlob(imageFile);

  // CLIP 프로세서: 리사이즈, 정규화
  const imageInputs = await processor(image);

  // CLIP 비전 모델: 512차원 임베딩 생성
  const output = await model(imageInputs);
  const vector: number[] = Array.from(
    output.image_embeds.data as Float32Array
  );

  // L2 정규화 (DB 임베딩과 동일한 방식)
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    return vector.map((val) => val / norm);
  }

  return vector;
}

/**
 * 모델이 이미 로드되었는지 확인
 */
export function isModelLoaded(): boolean {
  return modelInstance !== null;
}
