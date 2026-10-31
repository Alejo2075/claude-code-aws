// Checks DECODED claims (a JSON object) against what an API expects. It never accepts or prints a
// token: a string that looks like a JWT is refused, because a pasted token is a credential.
const JWT_SHAPE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/;
export const looksLikeToken = (text: string): boolean => JWT_SHAPE.test(text);

export interface Expectation {
  issuer: string;
  audience?: string;
  use?: "access" | "id";
  scope?: string;
  group?: string;
  now: Date;
  /** Seconds of clock skew to allow. */
  skew?: number;
}

export interface ClaimResult {
  ok: boolean;
  problems: string[];
  notes: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function checkClaims(claims: unknown, e: Expectation): ClaimResult {
  const problems: string[] = [];
  const notes: string[] = [];
  if (!isObj(claims)) return { ok: false, problems: ["The claims must be a JSON object."], notes };
  const now = Math.floor(e.now.getTime() / 1000);
  const skew = e.skew ?? 60;
  if (claims["iss"] !== e.issuer)
    problems.push(
      `iss is ${JSON.stringify(claims["iss"])}; expected exactly ${JSON.stringify(e.issuer)}. Reject tokens from any other issuer.`,
    );
  if (typeof claims["exp"] !== "number") problems.push("exp is missing: the token never expires.");
  else if (claims["exp"] + skew < now)
    problems.push(`The token expired ${now - claims["exp"]} seconds ago.`);
  if (typeof claims["nbf"] === "number" && claims["nbf"] - skew > now)
    problems.push("nbf is in the future: the token is not valid yet.");
  if (typeof claims["iat"] === "number" && claims["iat"] - skew > now)
    problems.push("iat is in the future: check the clocks.");
  const use = e.use;
  if (use !== undefined && claims["token_use"] !== use)
    problems.push(
      `token_use is ${JSON.stringify(claims["token_use"])}; this API expects an ${use} token. Do not accept an id token where an access token is required.`,
    );
  if (e.audience !== undefined) {
    // Cognito id tokens carry aud; access tokens carry client_id.
    const actual = use === "access" ? claims["client_id"] : (claims["aud"] ?? claims["client_id"]);
    const values = Array.isArray(actual) ? actual : [actual];
    if (!values.includes(e.audience))
      problems.push(
        `${use === "access" ? "client_id" : "aud"} is ${JSON.stringify(actual)}; expected ${JSON.stringify(e.audience)}.`,
      );
  } else
    notes.push(
      "No audience was given, so the token's intended recipient was not checked. A token issued for another app client would pass.",
    );
  if (e.scope !== undefined) {
    const scopes = typeof claims["scope"] === "string" ? claims["scope"].split(" ") : [];
    if (!scopes.includes(e.scope))
      problems.push(
        `The scope ${JSON.stringify(e.scope)} is missing (token scopes: ${scopes.join(" ") || "none"}).`,
      );
  }
  if (e.group !== undefined) {
    const groups = Array.isArray(claims["cognito:groups"]) ? claims["cognito:groups"] : [];
    if (!groups.includes(e.group))
      problems.push(
        `The user is not in group ${JSON.stringify(e.group)} (groups: ${groups.join(", ") || "none"}).`,
      );
  }
  notes.push(
    "This checks claims only. The signature must be verified against the issuer's JWKS before any claim is trusted.",
  );
  return { ok: problems.length === 0, problems, notes };
}

export const FLOWS: Record<string, { title: string; flow: string[]; avoid: string[] }> = {
  spa: {
    title: "Single-page application (browser)",
    flow: [
      "Authorization code grant with PKCE through the hosted sign-in, as a public client (no client secret).",
      "Keep tokens in memory; if they must persist, understand the XSS trade-off of web storage.",
      "Register exact HTTPS callback and sign-out URLs.",
    ],
    avoid: [
      "The implicit grant.",
      "A client secret in the bundle.",
      "USER_PASSWORD_AUTH from the browser.",
    ],
  },
  mobile: {
    title: "Mobile or desktop application",
    flow: [
      "Authorization code grant with PKCE in the system browser, as a public client.",
      "Store the refresh token in the platform's secure storage (Keychain, Keystore).",
      "Use a custom scheme or an app link with an exact callback URL.",
    ],
    avoid: ["An embedded web view for sign-in.", "A client secret in the app package."],
  },
  "server-web": {
    title: "Server-rendered web application",
    flow: [
      "Authorization code grant with a confidential client: the secret lives on the server only.",
      "Add PKCE as well; keep the session in an HttpOnly, Secure cookie.",
      "Exchange the code on the server and never send tokens to the browser unless needed.",
    ],
    avoid: ["Putting the client secret in environment variables of a function that logs them."],
  },
  machine: {
    title: "Machine to machine",
    flow: [
      "Client credentials grant with a confidential client and a resource server that defines custom scopes.",
      "One app client per calling service, each with only the scopes it needs.",
      "Cache the access token until near expiry instead of requesting one per call.",
    ],
    avoid: ["Using a user's credentials for a service.", "One shared client for every service."],
  },
  cli: {
    title: "Command-line tool",
    flow: [
      "Authorization code with PKCE using a loopback redirect (http://localhost is allowed), or the device-style flow your tooling offers.",
      "Store the refresh token in the OS credential store, not a plain file.",
    ],
    avoid: [
      "Asking the user to paste a password into the terminal when hosted sign-in is possible.",
    ],
  },
};

export const VERIFY_CHECKLIST = [
  "Fetch the issuer's JWKS from {issuer}/.well-known/jwks.json and cache it; refetch when an unknown kid appears.",
  "Verify the signature with the key whose kid matches the token header, and accept only the expected algorithm (RS256 for Cognito).",
  "Check iss exactly, exp (with a small clock skew), and token_use.",
  "Check aud (id tokens) or client_id (access tokens) against your app client id.",
  "Check scope or cognito:groups for authorization; authentication proves who the caller is, not what they may do.",
  "Check the caller may access the specific record they asked for (tenant or owner), not only that they are signed in.",
  "Never log a token. Log the sub and the token id (jti) instead.",
];
