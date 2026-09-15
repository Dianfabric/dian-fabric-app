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

  export class AutoModel {
    static from_pretrained(model: string, options?: any): Promise<any>;
  }

  export class RawImage {
    constructor(data: Uint8ClampedArray | Uint8Array, width: number, height: number, channels: number);
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
