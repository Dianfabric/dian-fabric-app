import { redirect } from "next/navigation";

// 홈 첫 화면을 원단 목록으로 노출 (기존 소개 페이지는 /intro 에 보존)
export default function Home() {
  redirect("/fabrics");
}
