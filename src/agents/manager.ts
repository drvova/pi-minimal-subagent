import * as fs from "node:fs";
import * as path from "node:path";

export interface AgentInput {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  extensions?: string[];
  skills?: string[];
  thinking?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

function err(field: string, message: string): ValidationError {
  return { field, message };
}

function projectAgentsDir(cwd: string): string {
  const dir = path.join(cwd, ".pi", "agents");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function createAgent(cwd: string, input: AgentInput): { filePath: string; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!input.name?.trim()) errors.push(err("name", "Name is required"));
  if (!input.description?.trim()) errors.push(err("description", "Description is required"));
  if (!input.systemPrompt?.trim()) errors.push(err("systemPrompt", "System prompt is required"));

  const filePath = path.join(projectAgentsDir(cwd), `${input.name.trim()}.md`);
  if (errors.length === 0 && fs.existsSync(filePath)) {
    errors.push(err("name", `Agent "${input.name}" already exists`));
  }
  if (errors.length > 0) return { filePath, errors };

  let fm = `name: ${input.name}\ndescription: ${input.description}`;
  if (input.model) fm += `\nmodel: ${input.model}`;
  if (input.extensions?.length) fm += `\nextensions: ${input.extensions.join(", ")}`;
  if (input.skills?.length) fm += `\nskills: ${input.skills.join(", ")}`;
  if (input.thinking) fm += `\nthinking: ${input.thinking}`;

  fs.writeFileSync(filePath, `---\n${fm}\n---\n${input.systemPrompt.trim()}\n`, "utf-8");
  return { filePath, errors: [] };
}

export function updateAgent(cwd: string, name: string, input: Partial<AgentInput>): { filePath: string; errors: ValidationError[] } {
  const filePath = path.join(projectAgentsDir(cwd), `${name}.md`);
  if (!fs.existsSync(filePath)) return { filePath, errors: [err("name", `Agent "${name}" not found`)] };

  const existing = fs.readFileSync(filePath, "utf-8");
  const fmMatch = existing.match(/^---\n([\s\S]*?)\n---/);
  const body = existing.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();

  const fields = new Map<string, string>();
  if (fmMatch) {
    for (const line of fmMatch[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
    }
  }

  if (input.name?.trim()) fields.set("name", input.name.trim());
  if (input.description?.trim()) fields.set("description", input.description.trim());
  if (input.model !== undefined) input.model ? fields.set("model", input.model) : fields.delete("model");
  if (input.extensions !== undefined) input.extensions.length ? fields.set("extensions", input.extensions.join(", ")) : fields.delete("extensions");
  if (input.skills !== undefined) input.skills.length ? fields.set("skills", input.skills.join(", ")) : fields.delete("skills");
  if (input.thinking !== undefined) input.thinking ? fields.set("thinking", input.thinking) : fields.delete("thinking");

  const newBody = input.systemPrompt?.trim() ?? body;
  let fm = "";
  for (const [k, v] of fields) fm += `${k}: ${v}\n`;

  fs.writeFileSync(filePath, `---\n${fm}---\n${newBody}\n`, "utf-8");
  return { filePath, errors: [] };
}

export function removeAgent(cwd: string, name: string): { deleted: boolean; error?: string } {
  const filePath = path.join(cwd, ".pi", "agents", `${name}.md`);
  if (!fs.existsSync(filePath)) return { deleted: false, error: `Agent "${name}" not found` };
  fs.unlinkSync(filePath);
  return { deleted: true };
}
