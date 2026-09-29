import type { Instrumentation } from "next";

/**
 * Report unhandled server errors (Server Components, Route Handlers, Server
 * Actions, Proxy) through the app's redacting logger and error reporters.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { errorInfo, logError } = await import("@/lib/observability/log");
  logError("next", "unhandled request error", {
    // Drop the query string: it can carry auth codes or tokens.
    path: request.path.split("?")[0],
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    ...errorInfo(error),
  });
};
