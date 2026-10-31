/**
 * Settings every AWS client in this repository starts from. Retries are on and adaptive so
 * throttling backs off instead of failing, but bounded so a stuck call cannot hang a hook or a
 * command: callers also pass an `AbortSignal` with their own deadline.
 */
export interface ClientDefaults {
  region: string;
  maxAttempts: number;
  retryMode: "adaptive";
}

export const DEFAULT_MAX_ATTEMPTS = 3;

export function clientDefaults(region: string): ClientDefaults {
  return { region, maxAttempts: DEFAULT_MAX_ATTEMPTS, retryMode: "adaptive" };
}
