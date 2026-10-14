"use client";

import { useEffect } from "react";

/**
 * Registers the portal's own service worker once, silently — the
 * NotificationsCard asks for permission on an explicit tap, never here.
 * Mirrors the registration line in field/outbox-provider.tsx, minus the
 * outbox: the portal has no offline-work queue, so there is nothing else
 * for this worker to do but hold a push subscription.
 */
export function PushRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/portal-sw.js", { scope: "/portal", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
