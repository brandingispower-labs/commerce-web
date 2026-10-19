import { Carousel } from "components/carousel";
import { ThreeItemGrid } from "components/grid/three-items";
import Footer from "components/layout/footer";

// 홈은 요청 시점에 렌더링한다. 이미지 빌드는 백엔드에 닿지 않으므로(Dockerfile 의 build 단계),
// 정적 셸을 구우면 "상품이 없는 홈" 이 이미지 안에 박힌 채 배포된다.
export const dynamic = "force-dynamic";

export const metadata = {
  description:
    "High-performance ecommerce store built with Next.js, Vercel, and Shopify.",
  openGraph: {
    type: "website",
  },
};

export default function HomePage() {
  return (
    <>
      <ThreeItemGrid />
      <Carousel />
      <Footer />
    </>
  );
}
