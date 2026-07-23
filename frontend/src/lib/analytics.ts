/**
 * CargoNode Frontend Analytics & Telemetry
 */

export interface AnalyticsEvent {
  event: string;
  category?: string;
  label?: string;
  value?: number;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export function trackEvent(name: string, props: Record<string, any> = {}) {
  const payload: AnalyticsEvent = {
    event: name,
    metadata: props,
    timestamp: new Date().toISOString(),
  };

  // Log in non-production or for debugging
  if (process.env.NODE_ENV !== "production") {
    console.log("[Analytics Event]", payload);
  }

  // Store events in local storage window log for audit / verification
  try {
    const logs = JSON.parse(localStorage.getItem("cargonode_analytics_logs") || "[]");
    logs.push(payload);
    // Keep max 200 recent events
    if (logs.length > 200) logs.shift();
    localStorage.setItem("cargonode_analytics_logs", JSON.stringify(logs));
  } catch (e) {
    // Ignore storage quota errors
  }

  // Plausible / custom endpoint push if available
  if (typeof window !== "undefined" && (window as any).plausible) {
    (window as any).plausible(name, { props });
  }
}
