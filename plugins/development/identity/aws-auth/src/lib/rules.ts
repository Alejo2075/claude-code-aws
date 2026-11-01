import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-auth";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const p of resourcesOfType(t, "AWS::Cognito::UserPool"))
    rows.push({
      kind: "user-pool",
      id: `${stack}/${p.logicalId}`,
      detail: `MFA ${typeof p.properties["MfaConfiguration"] === "string" ? p.properties["MfaConfiguration"] : "OFF"}`,
    });
  for (const c of resourcesOfType(t, "AWS::Cognito::UserPoolClient"))
    rows.push({
      kind: "app-client",
      id: `${stack}/${c.logicalId}`,
      detail: `${c.properties["GenerateSecret"] === true ? "confidential" : "public"} client, flows [${list(c.properties["AllowedOAuthFlows"]).join(", ")}]`,
    });
  for (const d of resourcesOfType(t, "AWS::Cognito::UserPoolDomain"))
    rows.push({ kind: "domain", id: `${stack}/${d.logicalId}`, detail: "hosted sign-in domain" });
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const p of resourcesOfType(t, "AWS::Cognito::UserPool")) {
    const mfa = p.properties["MfaConfiguration"];
    if (mfa === undefined || mfa === "OFF")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-NO-MFA",
          severity: "medium",
          title: "Multi-factor authentication is off",
          explanation: "A stolen or guessed password is enough to sign in.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
          recommendation: "Set MfaConfiguration to ON or OPTIONAL, or use passkeys.",
        }),
      );
    const policy =
      isRecord(p.properties["Policies"]) && isRecord(p.properties["Policies"]["PasswordPolicy"])
        ? p.properties["Policies"]["PasswordPolicy"]
        : null;
    const min =
      policy !== null && typeof policy["MinimumLength"] === "number" ? policy["MinimumLength"] : 8;
    if (min < 8)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-WEAK-PASSWORD",
          severity: "high",
          title: `Minimum password length is ${min}`,
          explanation: "Short passwords are guessed quickly.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
          recommendation:
            "Require at least 8 characters, and prefer 12 or more or passwordless sign-in.",
        }),
      );
    else if (min < 12)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-SHORT-PASSWORD",
          severity: "low",
          title: `Minimum password length is ${min}`,
          explanation: "Longer passwords resist guessing better than composition rules.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
        }),
      );
    if (p.properties["DeletionProtection"] !== "ACTIVE")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-NO-DELETION-PROTECTION",
          severity: "low",
          title: "User pool has no deletion protection",
          explanation: "Deleting or replacing the pool deletes every user in it.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
          recommendation: "Set DeletionProtection to ACTIVE and a Retain policy.",
        }),
      );
    const admin = p.properties["AdminCreateUserConfig"];
    if (!(isRecord(admin) && admin["AllowAdminCreateUserOnly"] === true))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-SELF-SIGNUP",
          severity: "info",
          title: "Anyone can sign up",
          explanation:
            "Self sign-up is open. That is right for a consumer app and wrong for an internal one.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
        }),
      );
  }
  for (const c of resourcesOfType(t, "AWS::Cognito::UserPoolClient")) {
    const id = at(c.logicalId);
    const flows = list(c.properties["AllowedOAuthFlows"]);
    const callbacks = list(c.properties["CallbackURLs"]);
    if (flows.includes("implicit"))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-IMPLICIT-GRANT",
          severity: "high",
          title: "The implicit grant is enabled",
          explanation:
            "The implicit grant returns tokens in the URL fragment, where browser history, extensions, and referrers can leak them. Use the authorization code grant with PKCE.",
          subject: id,
          resources: [id],
        }),
      );
    for (const url of callbacks) {
      if (url.includes("*"))
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "AUTH-WILDCARD-CALLBACK",
            severity: "high",
            title: `Callback URL ${url} contains a wildcard`,
            explanation:
              "Cognito requires exact callback URLs; a wildcard here would let an attacker receive the authorization code.",
            subject: `${id}:${url}`,
            resources: [id],
          }),
        );
      else if (/^http:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url))
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "AUTH-HTTP-CALLBACK",
            severity: "high",
            title: `Callback URL ${url} is not HTTPS`,
            explanation:
              "Codes and tokens would cross the network unencrypted. Only localhost may use http.",
            subject: `${id}:${url}`,
            resources: [id],
          }),
        );
    }
    if (callbacks.some((u) => /localhost|127\.0\.0\.1/.test(u)))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-LOCALHOST-CALLBACK",
          severity: "low",
          title: "A localhost callback URL is registered",
          explanation: "Fine for development; remove it from production clients.",
          subject: id,
          resources: [id],
        }),
      );
    if (list(c.properties["ExplicitAuthFlows"]).includes("ALLOW_USER_PASSWORD_AUTH"))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-USER-PASSWORD-FLOW",
          severity: "medium",
          title: "USER_PASSWORD_AUTH sends the password to your backend",
          explanation:
            "The application handles raw passwords. Prefer the hosted sign-in or SRP (ALLOW_USER_SRP_AUTH).",
          subject: id,
          resources: [id],
        }),
      );
    if (c.properties["PreventUserExistenceErrors"] !== "ENABLED")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-USER-ENUMERATION",
          severity: "low",
          title: "Sign-in errors can reveal whether a user exists",
          explanation:
            "Different errors for unknown users and wrong passwords let an attacker list valid accounts.",
          subject: id,
          resources: [id],
          recommendation: "Set PreventUserExistenceErrors to ENABLED.",
        }),
      );
    if (list(c.properties["AllowedOAuthScopes"]).includes("aws.cognito.signin.user.admin"))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-BROAD-SCOPE",
          severity: "medium",
          title: "The client may request aws.cognito.signin.user.admin",
          explanation:
            "That scope lets the token modify the user's own attributes through the Cognito API. Grant it only to clients that need it.",
          subject: id,
          resources: [id],
        }),
      );
    if (
      c.properties["GenerateSecret"] === true &&
      flows.includes("code") &&
      callbacks.some((u) => /^https?:\/\//.test(u)) &&
      c.properties["AllowedOAuthFlowsUserPoolClient"] === true
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-SECRET-CHECK",
          severity: "info",
          status: "hypothesis",
          title: "Client has a secret",
          explanation:
            "A client secret is safe only in a server-side application. If this client serves a browser or mobile app, the secret is public: use a public client with PKCE.",
          subject: id,
          resources: [id],
        }),
      );
    if (!isRecord(c.properties["RefreshTokenRotation"]))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "AUTH-NO-REFRESH-ROTATION",
          severity: "info",
          title: "Refresh token rotation is not configured",
          explanation:
            "With rotation, each use of a refresh token issues a new one and invalidates the old, which limits the value of a stolen token (see the RefreshTokenRotation property of the app client).",
          subject: id,
          resources: [id],
        }),
      );
  }
  return out;
}
