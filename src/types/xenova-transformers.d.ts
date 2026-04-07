/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "@xenova/transformers" {
  export class AutoProcessor {
    static from_pretrained(model: string, options?: any): Promise<any>;
  }

  export class CLIPVisionModelWithProjection {
    static from_pretrained(model: string, options?: any): Promise<any>;
  }

  export class RawImage {
    static fromBlob(blob: Blob): Promise<RawImage>;
    static read(url: string): Promise<RawImage>;
  }

  export const env: {
    allowLocalModels: boolean;
    cacheDir: string;
  };
}
