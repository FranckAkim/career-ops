// This separate deployment entry has no local-dashboard mode. Shared UI/API
// modules depend on this boundary, while the original app keeps its local guard.
export function hostedMode() { return true; }
