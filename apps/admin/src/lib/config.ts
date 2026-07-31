export type AdminPublicConfig = {
  supabase: {
    url: string;
    anonKey: string;
  };
};

export type AdminServerConfig = AdminPublicConfig & {
  resend: {
    apiKey: string;
    webhookSecret: string;
  };
  invitations: {
    fromEmail: string;
    baseUrl: string;
  };
  redirects: {
    tenantAdminBaseUrl: string;
    driverAppUrl: string;
    riderAppUrl: string;
  };
};

type AdminConfigSource = Partial<Record<AdminConfigKey, string | undefined>> | NodeJS.ProcessEnv;

type AdminConfigKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "RESEND_API_KEY"
  | "RESEND_WEBHOOK_SECRET"
  | "INVITATION_FROM_EMAIL"
  | "INVITATION_BASE_URL"
  | "TENANT_ADMIN_BASE_URL"
  | "NEXT_PUBLIC_DRIVER_APP_URL"
  | "NEXT_PUBLIC_RIDER_APP_URL";

let cachedServerConfig: AdminServerConfig | null = null;

export const adminPublicConfig = readAdminPublicConfig({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export function getAdminServerConfig(source: AdminConfigSource = process.env): AdminServerConfig {
  if (cachedServerConfig && source === process.env) {
    return cachedServerConfig;
  }

  const config = readAdminServerConfig(source);

  if (source === process.env) {
    cachedServerConfig = config;
  }

  return config;
}

export function getAdminSupabaseEnv(config: AdminPublicConfig = adminPublicConfig) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: config.supabase.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.supabase.anonKey,
  } as unknown as NodeJS.ProcessEnv;
}

function readAdminPublicConfig(source: AdminConfigSource): AdminPublicConfig {
  const errors: string[] = [];
  const supabaseUrl = requiredUrl(source, "NEXT_PUBLIC_SUPABASE_URL", errors);
  const supabaseAnonKey = requiredString(source, "NEXT_PUBLIC_SUPABASE_ANON_KEY", errors);

  assertNoConfigErrors(errors);

  return {
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    },
  };
}

function readAdminServerConfig(source: AdminConfigSource): AdminServerConfig {
  const errors: string[] = [];
  const supabaseUrl = requiredUrl(source, "NEXT_PUBLIC_SUPABASE_URL", errors);
  const supabaseAnonKey = requiredString(source, "NEXT_PUBLIC_SUPABASE_ANON_KEY", errors);
  const resendApiKey = requiredString(source, "RESEND_API_KEY", errors);
  const resendWebhookSecret = requiredString(source, "RESEND_WEBHOOK_SECRET", errors);
  const invitationFromEmail = requiredString(source, "INVITATION_FROM_EMAIL", errors);
  const invitationBaseUrl = requiredUrl(source, "INVITATION_BASE_URL", errors);
  const tenantAdminBaseUrl = requiredUrl(source, "TENANT_ADMIN_BASE_URL", errors);
  const driverAppUrl = optionalUrl(
    source,
    "NEXT_PUBLIC_DRIVER_APP_URL",
    "https://driver.eshapp.com",
    errors,
  );
  const riderAppUrl = optionalUrl(
    source,
    "NEXT_PUBLIC_RIDER_APP_URL",
    "https://rider.eshapp.com",
    errors,
  );

  assertNoConfigErrors(errors);

  return {
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    },
    resend: {
      apiKey: resendApiKey,
      webhookSecret: resendWebhookSecret,
    },
    invitations: {
      fromEmail: invitationFromEmail,
      baseUrl: invitationBaseUrl,
    },
    redirects: {
      tenantAdminBaseUrl,
      driverAppUrl,
      riderAppUrl,
    },
  };
}

function optionalUrl(
  source: AdminConfigSource,
  key: AdminConfigKey,
  fallback: string,
  errors: string[],
) {
  const value = source[key]?.trim() || fallback;
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    errors.push(`${key} must be a valid URL`);
    return "";
  }
}

function requiredString(source: AdminConfigSource, key: AdminConfigKey, errors: string[]) {
  const value = source[key]?.trim();

  if (!value) {
    errors.push(`${key} is required`);
    return "";
  }

  return value;
}

function requiredUrl(source: AdminConfigSource, key: AdminConfigKey, errors: string[]) {
  const value = requiredString(source, key, errors);

  if (!value) {
    return "";
  }

  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    errors.push(`${key} must be a valid URL`);
    return "";
  }
}

function assertNoConfigErrors(errors: string[]) {
  if (errors.length === 0) {
    return;
  }

  throw new Error(
    [
      "Admin application configuration is invalid.",
      ...errors.map((error) => `- ${error}`),
      "Add missing values to apps/admin/.env.local for local development or to the production runtime environment.",
    ].join("\n"),
  );
}
