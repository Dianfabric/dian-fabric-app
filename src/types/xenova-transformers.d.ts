/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "@huggingface/transformers" {
  export class AutoProcessor {
    static from_pretrained(model: string, options?: any): Promise<any>;
  }

  export class CLIPVisionModelWithProjection {
    static from_pretrained(model: string, options?: any): Promise<any>;
  }

  export class AutoTokenizer {
    static from_pretrained(model: string, options?: any): Promise<any>;
  }

  export class CLIPTextModelWithProjection {
    static from_pretrained(model: string, options?: any): Promise<any>;
  }

  export class RawImage {
    static fromBlob(blob: Blob): Promise<RawImage>;
    static read(url: string): Promise<RawImage>;
    width: number;
    height: number;
  }

  export const env: {
    allowLocalModels: boolean;
    cacheDir?: string;
    backends?: any;
  };
}
