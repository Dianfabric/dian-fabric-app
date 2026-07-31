"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearInquiryCart,
  formatKrw,
  lineTotalKrw,
  readInquiryCart,
  removeInquiryCartItem,
  type CatalogInquiryItem,
} from "@/lib/catalog-inquiry-cart";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

const CHATBOT_URL = "https://dian-exhibition-chatbot.vercel.app/";

type CatalogCustomer = {
  email: string | null;
  kakao_email: string | null;
  name: string | null;
  phone: string | null;
  company_name: string | null;
  position: string | null;
};

function itemLabel(item: CatalogInquiryItem) {
  return item.itemType === "fabric_yard" ? `${item.quantity}Y 원단` : `${item.quantity}개 스와치`;
}

function buildChatbotMessage(items: CatalogInquiryItem[], customer: CatalogCustomer | null) {
  const customerLines = [
    customer?.name ? `성함: ${customer.name}` : null,
    customer?.company_name ? `회사: ${customer.company_name}${customer.position ? ` / ${customer.position}` : ""}` : null,
    customer?.phone ? `전화: ${customer.phone}` : null,
    customer?.email ? `이메일: ${customer.email}` : customer?.kakao_email ? `카카오 이메일: ${customer.kakao_email}` : null,
  ].filter(Boolean);

  const itemLines = items.map((item, index) => [
    `${index + 1}. ${item.fabricName} #${item.colorCode}`,
    item.supplier ? `- 브랜드: ${item.supplier}` : null,
    `- 구분: ${item.itemType === "fabric_yard" ? "원단" : "스와치"}`,
    `- 수량: ${itemLabel(item)}`,
    `- 단가: ${formatKrw(item.unitPriceKrw)}${item.itemType === "fabric_yard" ? "/Y" : "/개"}`,
    `- 상세: ${item.detailUrl}`,
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    "[CATALOG 장바구니]",
    "아래 상품 재고 체크 및 구매 상담 요청드립니다.",
    customerLines.length ? `\n고객 정보\n${customerLines.join("\n")}` : null,
    `\n상품 목록\n${itemLines}`,
    "\nDIAN에서 공급처 재고 확인 후 상담을 이어가 주세요.",
  ].filter(Boolean).join("\n");
}

export default function InquiryCartPage() {
  const router = useRouter();
  const supabase = createCatalogBrowserClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState<CatalogInquiryItem[]>([]);
  const [customer, setCustomer] = useState<CatalogCustomer | null>(null);

  function refresh() {
    setItems(readInquiryCart());
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        router.replace("/login?next=/cart");
        return;
      }
      const res = await fetch("/api/catalog/customers/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      setCustomer(json.customer || null);
      setAuthChecked(true);
      refresh();
    });
    window.addEventListener("dian-catalog-cart-updated", refresh);
    return () => window.removeEventListener("dian-catalog-cart-updated", refresh);
  }, [router, supabase.auth]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + lineTotalKrw(item), 0), [items]);

  function openChatbot() {
    const message = buildChatbotMessage(items, customer);
    const url = new URL(CHATBOT_URL);
    url.searchParams.set("source", "catalog-cart");
    url.searchParams.set("message", message);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  if (!authChecked) {
    return (
      <div className="px-4 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--line)] bg-white p-10 text-center text-[var(--navy2)]">
          로그인 확인 중입니다.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-14">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.22em] text-[var(--muted)]">CATALOG CART</p>
            <h1 className="mt-2 text-3xl font-extrabold text-[var(--navy)]">장바구니</h1>
            <p className="mt-2 text-sm text-[var(--navy2)]">담은 원단을 챗봇으로 보내 재고 체크와 구매 상담을 시작합니다.</p>
          </div>
          {items.length > 0 && (
            <button type="button" onClick={() => { clearInquiryCart(); refresh(); }} className="text-sm font-bold text-[var(--muted)] underline">
              비우기
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-[var(--line)] bg-white p-10 text-center">
            <p className="mb-4 text-[var(--navy2)]">담긴 원단이 없습니다.</p>
            <Link href="/fabrics" className="inline-flex rounded-2xl bg-[var(--navy)] px-5 py-3 text-sm font-extrabold text-white">
              원단 보러가기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 rounded-3xl border border-[var(--line)] bg-white p-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-gray-100">
                    {item.imageUrl && <Image src={item.imageUrl} alt={item.fabricName} fill className="object-cover" sizes="96px" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-extrabold text-[var(--navy)]">{item.fabricName} #{item.colorCode}</h2>
                        <p className="mt-1 text-sm text-[var(--navy2)]">{itemLabel(item)}</p>
                      </div>
                      <button type="button" onClick={() => { removeInquiryCartItem(item.id); refresh(); }} className="shrink-0 text-xs font-bold text-[var(--muted)] underline">
                        삭제
                      </button>
                    </div>
                    <div className="mt-4 flex justify-between text-sm">
                      <span>{formatKrw(item.unitPriceKrw)} / {item.itemType === "fabric_yard" ? "Y" : "개"}</span>
                      <strong>{formatKrw(lineTotalKrw(item))}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <aside className="h-fit rounded-3xl border border-[var(--line)] bg-white p-5 lg:sticky lg:top-24">
              <h3 className="mb-4 font-extrabold text-[var(--navy)]">장바구니 요약</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[var(--navy2)]">상품</span><span>{items.length}건</span></div>
                <div className="flex justify-between"><span className="text-[var(--navy2)]">예상 상품금액</span><strong>{formatKrw(subtotal)}</strong></div>
              </div>
              <button type="button" onClick={openChatbot} className="mt-5 w-full rounded-2xl bg-[var(--navy)] px-5 py-4 text-sm font-extrabold text-white">
                재고 체크 / 구매 문의하기
              </button>
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                챗봇으로 상품 목록을 전달하고, 가능한 브랜드는 즉시 재고 조회 후 Slack 알림을 보냅니다.
              </p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
