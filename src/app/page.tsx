import Link from "next/link";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center text-center px-10 pt-20 pb-20 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-48 -right-48 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(196,154,108,0.12)_0%,transparent_70%)]" />
        <div className="absolute -bottom-48 -left-48 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(139,105,20,0.08)_0%,transparent_70%)]" />

        <div className="relative z-10">
          <div className="flex gap-2 justify-center mb-7">
            <span className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-[linear-gradient(135deg,rgba(139,105,20,0.1),rgba(196,154,108,0.1))] text-[#8B6914]">
              AI-Powered
            </span>
            <span className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-gray-100 text-gray-500">
              393+ Fabrics
            </span>
          </div>

          <h1 className="text-[58px] font-extrabold leading-[1.15] tracking-tight mb-5">
            원단 검색의
            <br />
            <span className="text-gradient">새로운 기준</span>
          </h1>

          <p className="text-[17px] text-gray-400 leading-relaxed max-w-[500px] mx-auto mb-10">
            사진 한 장이면 충분합니다. AI가 색상, 패턴, 질감을 분석하여
            최적의 프리미엄 원단을 찾아드립니다.
          </p>

          <div className="flex gap-3 justify-center">
            <Link
              href="/search"
              className="bg-gradient-gold text-white px-9 py-4 rounded-[14px] text-[15px] font-bold hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(139,105,20,0.3)] transition-all flex items-center gap-2"
            >
              원단 찾기 시작 →
            </Link>
            <Link
              href="/fabrics"
              className="bg-white text-gray-900 border border-gray-200 px-9 py-4 rounded-[14px] text-[15px] font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              둘러보기
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <div className="max-w-[800px] mx-auto -mt-10 relative z-20 bg-white rounded-[20px] px-12 py-8 grid grid-cols-3 gap-8 shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        {[
          { num: "393+", label: "프리미엄 원단" },
          { num: "97.2%", label: "최고 매칭 정확도" },
          { num: "0.8s", label: "평균 검색 시간" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-3xl font-extrabold text-gradient">{stat.num}</div>
            <div className="text-[13px] text-gray-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Upload Section */}
      <section className="max-w-[720px] mx-auto mt-20 mb-8 px-10">
        <Link href="/search">
          <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-gray-200 upload-hover cursor-pointer">
            <div className="w-20 h-20 bg-[linear-gradient(135deg,rgba(139,105,20,0.1),rgba(196,154,108,0.15))] rounded-[20px] flex items-center justify-center mx-auto mb-5">
              <svg
                className="w-8 h-8 text-[#8B6914]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">이미지를 드래그하거나 클릭</h3>
            <p className="text-sm text-gray-400">
              레퍼런스 이미지, 인테리어 사진, 핀터레스트 이미지 모두 OK
            </p>
            <div className="flex gap-2 justify-center mt-5">
              {["JPG", "PNG", "WEBP", "Max 10MB"].map((f) => (
                <span
                  key={f}
                  className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-lg"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </Link>
      </section>

      {/* How it works */}
      <section className="max-w-[1100px] mx-auto px-10 py-20">
        <p className="text-[13px] font-bold text-gradient text-center mb-2">
          HOW IT WORKS
        </p>
        <h2 className="text-[32px] font-extrabold text-center mb-14 tracking-tight">
          3단계로 완벽한 원단 찾기
        </h2>
        <div className="grid grid-cols-3 gap-5">
          {[
            {
              num: "1",
              icon: "\uD83D\uDCF8",
              title: "이미지 업로드",
              desc: "원하는 느낌의 이미지를 업로드하세요. 인테리어 사진, 원단 샘플 모두 가능해요.",
            },
            {
              num: "2",
              icon: "\uD83E\uDDE0",
              title: "CLIP AI 분석",
              desc: "AI가 512차원 벡터로 색상, 텍스처, 패턴을 정밀 분석하여 유사 원단을 매칭합니다.",
            },
            {
              num: "3",
              icon: "\u2728",
              title: "결과 확인 & 신청",
              desc: "유사 원단 Top-10을 확인하고 가격 비교 후 바로 샘플을 신청하세요.",
            },
          ].map((step) => (
            <div
              key={step.num}
              className="bg-white rounded-[20px] p-9 text-center border border-gray-100 card-hover"
            >
              <div className="w-10 h-10 bg-gradient-gold rounded-xl text-white text-base font-extrabold flex items-center justify-center mx-auto mb-5">
                {step.num}
              </div>
              <div className="text-4xl mb-4">{step.icon}</div>
              <h4 className="text-[17px] font-bold mb-2">{step.title}</h4>
              <p className="text-[13px] text-gray-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center px-10 py-24">
        <div className="max-w-[640px] mx-auto bg-[linear-gradient(135deg,#1a1a1a,#2D2520)] rounded-3xl px-12 py-16">
          <h2 className="text-[32px] font-extrabold text-white mb-3">
            지금 바로 시작하세요
          </h2>
          <p className="text-[15px] text-gray-500 mb-8">
            393개 프리미엄 원단에서 당신만의 원단을 찾아보세요
          </p>
          <Link
            href="/search"
            className="inline-block bg-gradient-gold text-white px-10 py-4 rounded-[14px] text-[15px] font-bold hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(139,105,20,0.3)] transition-all"
          >
            원단 찾기 시작 →
          </Link>
        </div>
      </section>
    </>
  );
}
