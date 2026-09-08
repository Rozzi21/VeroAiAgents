export function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function makeJWT(exp?: number): string {
  const payload: Record<string, unknown> = { sub: "user-1", aud: "access" };
  if (exp !== undefined) {
    payload.exp = exp;
  }
  return `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(payload)}.c2lnYXR1cmU`;
}

export function futureToken(): string {
  return makeJWT(Math.floor(Date.now() / 1000) + 900);
}

export function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}