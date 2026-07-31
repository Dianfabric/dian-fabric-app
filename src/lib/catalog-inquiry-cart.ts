"use client";

export type CatalogInquiryItemType = "fabric_yard" | "swatch";

export type CatalogInquiryItem = {
  id: string;
  fabricId: string;
  itemType: CatalogInquiryItemType;
  fabricName: string;
  colorCode: string;
  imageUrl?: string | null;
  quantity: number;
  unitPriceKrw: number;
  detailUrl: string;
};

const CART_KEY = "dian-catalog-inquiry-cart";

export function makeInquiryItemId(item: Pick<CatalogInquiryItem, "fabricId" | "itemType" | "colorCode">) {
  return `${item.fabricId}:${item.itemType}:${item.colorCode}`;
}

export function readInquiryCart(): CatalogInquiryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CatalogInquiryItem[]) : [];
  } catch {
    return [];
  }
}

export function writeInquiryCart(items: CatalogInquiryItem[]) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("dian-catalog-inquiry-cart-updated"));
}

export function addInquiryCartItem(item: Omit<CatalogInquiryItem, "id">) {
  const id = makeInquiryItemId(item);
  const items = readInquiryCart();
  const existing = items.find((cartItem) => cartItem.id === id);
  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + Number(item.quantity || 1);
    existing.unitPriceKrw = item.unitPriceKrw;
    existing.imageUrl = item.imageUrl;
    existing.detailUrl = item.detailUrl;
    writeInquiryCart([...items]);
    return existing;
  }
  const next = { ...item, id };
  writeInquiryCart([...items, next]);
  return next;
}

export function removeInquiryCartItem(id: string) {
  writeInquiryCart(readInquiryCart().filter((item) => item.id !== id));
}

export function clearInquiryCart() {
  writeInquiryCart([]);
}

export function formatKrw(value: number) {
  return `₩${Math.round(value).toLocaleString("ko-KR")}`;
}

export function lineTotalKrw(item: CatalogInquiryItem) {
  return Math.max(1, Number(item.quantity || 1)) * item.unitPriceKrw;
}
