// 실행 위치의 파일: ~/play-builder/commerce-web/instrumentation.ts
// Next.js 는 서버 런타임이 뜰 때 이 파일의 register() 를 부른다.
import { registerOTel } from "@vercel/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";

export function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const serviceName = process.env.OTEL_SERVICE_NAME || "commerce-web";

  if (!endpoint) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "otel disabled: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is empty",
        service: serviceName,
      }),
    );
    return;
  }

  try {
    registerOTel({
      serviceName,
      // 예: http://collection-gateway.observability.svc.cluster.local:4317
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "error",
        message: "otel register failed",
        service: serviceName,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
