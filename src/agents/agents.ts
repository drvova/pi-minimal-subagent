import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";

export type AgentSource = "user" | "project";

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  source: AgentSource;
  filePath: string;
  model?: string;
  extensions?: string[];
  skills?: string[];
  thinking?: string;
}

export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  projectAgentsDir: string | null;
}

function isPackageSource(value: string): boolean {
  return value.startsWith("npm:") || value.startsWith("git:");
}

export function resolveConfiguredPath(value: string, baseDir: string): string {
  if (!value) return value;
  if (isPackageSource(value)) return value;
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  if (path.isAbsolute(value)) return value;
  return path.resolve(baseDir, value);
}

function parseList(value: unknown, baseDir: string, resolvePaths = false): string[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const entries = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolvePaths ? resolveConfiguredPath(entry, baseDir) : entry);

  return entries.length > 0 ? entries : undefined;
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function loadAgentsFromDir(dir: string, source: AgentSource): AgentConfig[] {
  if (!fs.existsSync(dir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents: AgentConfig[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    let parsed: { frontmatter: Record<string, unknown>; body: string };
    try {
      parsed = parseFrontmatter<Record<string, unknown>>(content);
    } catch {
      continue;
    }

    const { frontmatter, body } = parsed;
    const name = firstString(frontmatter.name);
    const description = firstString(frontmatter.description);
    if (!name || !description) continue;

    agents.push({
      name,
      description,
      systemPrompt: body.trim(),
      source,
      filePath,
      model: firstString(frontmatter.model),
      extensions: parseList(frontmatter.extensions, path.dirname(filePath), true),
      skills: parseList(frontmatter.skills, path.dirname(filePath), false),
      thinking: firstString(frontmatter.thinking),
    });
  }

  return agents;
}

function findProjectAgentsDir(cwd: string): string | null {
  let dir = cwd;
  while (true) {
    const candidate = path.join(dir, ".pi", "agents");
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // keep walking upward
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function discoverAgents(cwd: string): AgentDiscoveryResult {
  const userDir = path.join(getAgentDir(), "agents");
  const projectAgentsDir = findProjectAgentsDir(cwd);

  const userAgents = loadAgentsFromDir(userDir, "user");
  const projectAgents = projectAgentsDir ? loadAgentsFromDir(projectAgentsDir, "project") : [];

  const byName = new Map<string, AgentConfig>();
  for (const agent of userAgents) byName.set(agent.name, agent);
  for (const agent of projectAgents) byName.set(agent.name, agent);

  return {
    agents: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)),
    projectAgentsDir,
  };
}
