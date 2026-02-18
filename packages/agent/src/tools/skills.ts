import { tool } from 'ai';
import { z } from 'zod';
import { join } from 'node:path';
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, chmodSync, statSync } from 'node:fs';
import { homedir } from 'node:os';

const SKILLS_DIR = join(homedir(), '.amightyclaw', 'skills');

function ensureSkillsDir() {
  if (!existsSync(SKILLS_DIR)) {
    mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

export function createSkillTools() {
  ensureSkillsDir();

  const writeSkill = tool({
    description: 'Write a reusable script/skill to disk. The skill persists across conversations and can be executed later. Use this to create shell scripts, Python scripts, Node.js scripts, etc.',
    parameters: z.object({
      name: z.string().describe('Filename with extension, e.g. "summarize.py", "backup.sh", "analyze.js"'),
      content: z.string().describe('Full script content including shebang line if applicable'),
      description: z.string().optional().describe('Brief description of what the skill does'),
    }),
    execute: async ({ name, content, description }) => {
      // Validate: no path traversal
      if (name.includes('/') || name.includes('\\') || name.includes('..')) {
        throw new Error('Invalid skill name: must not contain path separators');
      }
      const filePath = join(SKILLS_DIR, name);
      writeFileSync(filePath, content, 'utf-8');
      chmodSync(filePath, 0o755);
      const msg = `Skill "${name}" written to ${filePath}`;
      return description ? `${msg}\nDescription: ${description}` : msg;
    },
  });

  const readSkill = tool({
    description: 'Read the content of an existing skill/script.',
    parameters: z.object({
      name: z.string().describe('The skill filename to read'),
    }),
    execute: async ({ name }) => {
      if (name.includes('/') || name.includes('\\') || name.includes('..')) {
        throw new Error('Invalid skill name');
      }
      const filePath = join(SKILLS_DIR, name);
      if (!existsSync(filePath)) return `Skill "${name}" not found.`;
      return readFileSync(filePath, 'utf-8');
    },
  });

  const listSkills = tool({
    description: 'List all saved skills/scripts with their sizes.',
    parameters: z.object({}),
    execute: async () => {
      ensureSkillsDir();
      const files = readdirSync(SKILLS_DIR);
      if (files.length === 0) return 'No skills saved yet.';
      return files
        .map((f) => {
          const st = statSync(join(SKILLS_DIR, f));
          return `- ${f} (${st.size} bytes, modified ${st.mtime.toISOString().slice(0, 10)})`;
        })
        .join('\n');
    },
  });

  return { writeSkill, readSkill, listSkills };
}
