export interface CorsPolicyInput {
  configuredOrigins: string;
  isProd: boolean;
  allowVercelPreview: boolean;
  vercelProject?: string;
}

const DEV_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

function parseOrigins(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function hostnameFromOrigin(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedVercelPreview(origin: string, project?: string): boolean {
  const hostname = hostnameFromOrigin(origin);
  if (!hostname?.endsWith('.vercel.app')) return false;

  const normalizedProject = project?.trim().toLowerCase();
  if (!normalizedProject) return false;

  return hostname === `${normalizedProject}.vercel.app`
    || hostname.startsWith(`${normalizedProject}-`);
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  policy: CorsPolicyInput,
): boolean {
  if (!origin) return true; // apps mobile / cURL / backend-to-backend

  const allow = parseOrigins(policy.configuredOrigins);
  if (allow.includes(origin)) return true;

  if (allow.includes('*') && !policy.isProd) return true;

  if (policy.allowVercelPreview && isAllowedVercelPreview(origin, policy.vercelProject)) {
    return true;
  }

  if (!policy.isProd && DEV_ORIGIN_RE.test(origin)) {
    return true;
  }

  return false;
}
