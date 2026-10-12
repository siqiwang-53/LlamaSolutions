import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function readBearer(header: string | null) {
  if (!header) {
    return "";
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? "";
}

export function isModerationAuthorized(input: {
  authorizationHeader: string | null;
  configuredKey: string | undefined;
  hasSession: boolean;
  moderationKeyHeader: string | null;
}) {
  const configured = input.configuredKey?.trim() ?? "";
  if (configured) {
    const bearer = readBearer(input.authorizationHeader);
    if (bearer && safeEqual(bearer, configured)) {
      return true;
    }
    const headerKey = input.moderationKeyHeader?.trim() ?? "";
    if (headerKey && safeEqual(headerKey, configured)) {
      return true;
    }
  }
  return input.hasSession;
}
