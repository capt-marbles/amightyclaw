import inquirer from 'inquirer';
import { join } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  ensureDataDir,
  saveConfig,
  configExists,
  encrypt,
  generateSecret,
  getDataDir,
} from '@amightyclaw/core';
import { hashSync } from 'bcrypt';

export async function setupCommand(): Promise<void> {
  console.log('\n🐾 AMightyClaw Setup Wizard\n');

  if (configExists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Config already exists. Overwrite?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log('Setup cancelled.');
      return;
    }
  }

  const { port } = await inquirer.prompt([
    {
      type: 'number',
      name: 'port',
      message: 'Server port:',
      default: 3333,
    },
  ]);

  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Set your login password:',
      mask: '*',
      validate: (v: string) => v.length >= 8 || 'Password must be at least 8 characters',
    },
  ]);

  await inquirer.prompt([
    {
      type: 'password',
      name: 'passwordConfirm',
      message: 'Confirm password:',
      mask: '*',
      validate: (v: string) =>
        v === password || 'Passwords do not match',
    },
  ]);

  const answers = { port, password };

  const profiles: Record<string, unknown> = {};
  const encryptionKey = generateSecret(32);
  const jwtSecret = generateSecret(48);

  const { addProfile } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addProfile',
      message: 'Add an AI provider profile now?',
      default: true,
    },
  ]);

  if (addProfile) {
    let adding = true;
    while (adding) {
      const profile = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Profile name (e.g., free, regular, premium):',
          validate: (v: string) => v.length > 0 || 'Name required',
        },
        {
          type: 'list',
          name: 'provider',
          message: 'Provider:',
          choices: ['openai', 'anthropic', 'google', 'mistral', 'ollama'],
        },
        {
          type: 'input',
          name: 'model',
          message: 'Model name:',
          default: 'gpt-4o-mini',
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API key:',
          mask: '*',
          validate: (v: string) => v.length > 0 || 'API key required',
        },
        {
          type: 'number',
          name: 'maxTokensPerMessage',
          message: 'Max tokens per message:',
          default: 4096,
        },
        {
          type: 'number',
          name: 'maxTokensPerDay',
          message: 'Max tokens per day:',
          default: 100000,
        },
      ]);

      profiles[profile.name] = {
        provider: profile.provider,
        model: profile.model,
        apiKey: encrypt(profile.apiKey, encryptionKey),
        maxTokensPerMessage: profile.maxTokensPerMessage,
        maxTokensPerDay: profile.maxTokensPerDay,
      };

      const { more } = await inquirer.prompt([
        { type: 'confirm', name: 'more', message: 'Add another profile?', default: false },
      ]);
      adding = more;
    }
  }

  if (Object.keys(profiles).length === 0) {
    profiles.free = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: encrypt('sk-placeholder', encryptionKey),
      maxTokensPerMessage: 4096,
      maxTokensPerDay: 100000,
    };
    console.log('\nCreated placeholder "free" profile. Edit ~/.amightyclaw/config.json to add your API key.');
  }

  const hashedPassword = hashSync(answers.password, 12);

  const config = {
    port: answers.port,
    host: '127.0.0.1',
    password: hashedPassword,
    jwtSecret,
    encryptionKey,
    profiles,
    dataDir: '',
    logLevel: 'info',
  };

  const dataDir = ensureDataDir();
  saveConfig(config);

  // Copy default SOUL.md if not present
  const soulDest = join(dataDir, 'SOUL.md');
  if (!existsSync(soulDest)) {
    // Walk up from dist to find templates
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const templatePaths = [
      join(__dirname, '..', '..', 'templates', 'SOUL.md'),
      join(__dirname, '..', 'templates', 'SOUL.md'),
      join(__dirname, '..', '..', '..', 'templates', 'SOUL.md'),
      join(__dirname, '..', '..', '..', '..', 'templates', 'SOUL.md'),
    ];
    const templateSrc = templatePaths.find((p) => existsSync(p));
    if (templateSrc) {
      copyFileSync(templateSrc, soulDest);
    } else {
      // Write a default inline
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        soulDest,
        '# Soul\n\nYou are AMightyClaw, a helpful AI assistant.\n\n## Personality\n\n- Be warm, direct, and concise\n- Use humor when appropriate\n- Admit uncertainty\n',
        'utf-8'
      );
    }
  }

  console.log(`\n✅ Setup complete!`);
  console.log(`   Config: ${join(dataDir, 'config.json')}`);
  console.log(`   Soul:   ${soulDest}`);
  console.log(`   Data:   ${join(dataDir, 'data')}`);
  console.log(`\n   Run "amightyclaw start" to launch.\n`);
}
