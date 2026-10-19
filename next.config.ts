export default {
  // .next/standalone 에 실행에 필요한 것만 담는다. APP/03 의 Dockerfile 이 이 출력을 쓴다.
  output: "standalone",
  experimental: {
    ppr: true,
    inlineCss: true,
    useCache: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // commerce-api 의 시드가 넣어 둔 데모 이미지(Medusa 공개 버킷).
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      // 로컬 commerce-api 가 직접 서빙하는 업로드 파일.
      // 클러스터에서는 S3 버킷 도메인이 여기에 더해진다(뒤 BU 문서).
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
    ],
  },
};
