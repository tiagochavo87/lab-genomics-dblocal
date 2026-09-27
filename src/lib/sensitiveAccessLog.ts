import { api } from "@/integrations/api/client";
import { logActivity } from "./activityLog";

/**
 * Logs access to sensitive/genetic data for LGPD compliance.
 */
export async function logSensitiveAccess(
  action: "view" | "export" | "download",
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  await logActivity(`sensitive_data_${action}`, entityType, entityId, {
    ...details,
    timestamp: new Date().toISOString(),
    lgpd_relevant: true,
  });
}
