import { useEffect, useEffectEvent } from "react";

export const POLL_INTERVAL_MS = 2_500;

/** Temporary Phase 3 parity transport. Phase 4 can replace this hook with a subscription. */
export function usePolling(enabled: boolean, refresh: () => void) {
  const onPoll = useEffectEvent(refresh);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => onPoll(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
}
