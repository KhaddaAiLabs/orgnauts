/**
 * uihosts.ts — D-109: the preprod browser window for the qa_uat stage.
 *
 * Agents never hold a preprod login. When the toolkit has verified the human's preprod deploy (uat_verify → parity OK),
 * it resolves the preprod org's hosts with the ENGINE keychain and writes `.orgnauts/ui-allow-hosts.json`. The UI MCP
 * server reads that file and, only while the named ticket is at stage qa_uat and running, adds those hosts to its
 * allowlist and signs the browser in through the engine keychain's frontdoor. The file is removed when the ticket
 * leaves qa_uat (deploy_prod marked, done, hold). `safety.ui.uat_test_user_only` reminds the human that the engine's
 * preprod login should be a least-privilege TEST user, because that is the identity the browser will carry.
 */
import fs from "node:fs";
import path from "node:path";
import type { ProjectPaths } from "../core/paths.js";
import { exists, nowIso, readJsonOr, writeJsonAtomic } from "../core/util.js";
import { relatedHosts } from "../mcp/ui-fence.js";

export interface UiAllowHosts { ticket: string; stage: "qa_uat"; org: string; hosts: string[]; at: string }

export function uiAllowHostsFile(p: ProjectPaths): string { return path.join(p.state, "ui-allow-hosts.json"); }

export function writeUiAllowHosts(p: ProjectPaths, ticket: string, org: string, instanceUrl: string | undefined): UiAllowHosts | undefined {
  let host: string | undefined;
  try { host = instanceUrl ? new URL(instanceUrl).host.toLowerCase() : undefined; } catch { host = undefined; }
  if (!host) return undefined;
  const rec: UiAllowHosts = { ticket, stage: "qa_uat", org, hosts: relatedHosts(host), at: nowIso() };
  writeJsonAtomic(uiAllowHostsFile(p), rec);
  return rec;
}

export function clearUiAllowHosts(p: ProjectPaths, ticket?: string): boolean {
  const f = uiAllowHostsFile(p);
  if (!exists(f)) return false;
  const cur = readJsonOr<UiAllowHosts | undefined>(f, undefined);
  if (ticket && cur && cur.ticket !== ticket) return false;
  try { fs.unlinkSync(f); } catch { /* ignore */ }
  return true;
}

/** The window is open only while the sidecar says that ticket is at qa_uat and running. */
export function activeUiAllowHosts(p: ProjectPaths): UiAllowHosts | undefined {
  const rec = readJsonOr<UiAllowHosts | undefined>(uiAllowHostsFile(p), undefined);
  if (!rec) return undefined;
  const side = readJsonOr<{ stage?: string; status?: string } | undefined>(path.join(p.work, rec.ticket, ".state.json"), undefined);
  if (!side || side.stage !== "qa_uat" || side.status !== "running") return undefined;
  return rec;
}
