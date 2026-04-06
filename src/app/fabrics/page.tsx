"use client";
import { useState, useEffect } from "react";
import FabricCard from "@/components/FabricCard";
import type { Fabric } from "@/lib/types";

const FABRIC_TYPES = ["전체", "무지", "벨벳", "패턴", "스웨이드", "인조가죽"];
const USAGE_TYPES = ["전체", "소파", "쿠션", "커튼", "침대헤드", "스툴", "벽패널"];

export default function FabricsPage() {
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedType, setSelectedType] = useState("전체");
  const [selectedUsage, setSelectedUsage] = useState("전체");

  useEffect(() => {
    fetchFabrics();
  }, [page, selectedType, selectedUsage]);

  const fetchFabrics = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });
    if (selectedType !== "전체") params.set("type", selectedType);
    if (selectedUsage !== "전체") params.set("usage", selectedUsage);

    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setFabrics(data.fabrics || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight mb-3">
            원단 <span className="text-gradient">컬렉션</span>
          </h1>
          <p className="text-gray-400 text-[15px]">
            {total}개의 프리미엄 원단을 둘러보세요
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 mb-8 shadow-sm border border-gray-100">
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-500 mb-2">원단 종류</p>
            <div className="flex gap-2 flex-wrap">
              {FABRIC_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setSelectedType(t); setPage(1); }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    selectedType === t
                      ? "bg-gradient-gold text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">사용처</p>
            <div className="flex gap-2 flex-wrap">
              {USAGE_TYPES.map((u) => (
                <button
                  key={u}
                  onClick={() => { setSelectedUsage(u); setPage(1); }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    selectedUsage === u
                      ? "bg-gradient-gold text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                <div className="aspect-square bg-gray-100 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : fabrics.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {fabrics.map((fabric) => (
              <FabricCard key={fabric.id} fabric={fabric} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            해당 조건의 원단이 없습니다
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-10">
            {page > 1 && (
              <button
                onClick={() => setPage(page - 1)}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold hover:bg-gray-50"
              >
                ← 이전
              </button>
            )}
            <span className="px-4 py-2 text-sm text-gray-500">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <button
                onClick={() => setPage(page + 1)}
                className="px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold hover:bg-gray-50"
              >
                다음 →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
