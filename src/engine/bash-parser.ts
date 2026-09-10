/**
 * MiSeGuard Bash & Shell AST / Token Parser
 * Extracts commands, flags, subcommands, arguments, targets, pipelines, and redirects
 * to enable deterministic risk analysis.
 */

export interface ParsedCommand {
  raw: string;
  executable: string;
  subcommand?: string;
  flags: string[];
  namedFlags: Record<string, string | boolean>;
  targets: string[];
  args: string[];
  isPiped: boolean;
  pipeTarget?: string;
  redirects: { type: '>' | '>>' | '<' | '2>' | '&>'; target: string }[];
  hasSubshell: boolean;
  hasEnvAssignment: boolean;
  envVars: Record<string, string>;
  isChained: boolean;
  chainOperator?: '&&' | '||' | ';';
}

export interface ParseResult {
  rawInput: string;
  commands: ParsedCommand[];
  hasSubshell: boolean;
  hasDangerousPipe: boolean;
  hasNetworkActivity: boolean;
}

/**
 * Tokenizes a shell command string while respecting quotes and escapes.
 */
export function tokenizeShell(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escapeNext = true;
      continue;
    }

    if (char === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      // Check for two-character operators
      const twoChar = input.slice(i, i + 2);
      if (twoChar === '&&' || twoChar === '||' || twoChar === '>>' || twoChar === '2>' || twoChar === '&>') {
        if (current.trim().length > 0) {
          tokens.push(current.trim());
          current = '';
        }
        tokens.push(twoChar);
        i++; // skip next char
        continue;
      }

      // Check for single-character operators
      if (char === '|' || char === ';' || char === '>' || char === '<') {
        if (current.trim().length > 0) {
          tokens.push(current.trim());
          current = '';
        }
        tokens.push(char);
        continue;
      }

      if (/\s/.test(char)) {
        if (current.trim().length > 0) {
          tokens.push(current.trim());
          current = '';
        }
        continue;
      }
    }

    current += char;
  }

  if (current.trim().length > 0) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Strips wrapping quotes from a token.
 */
export function cleanToken(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith('\'') && token.endsWith('\''))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

/**
 * Parses individual command token sequences.
 */
function parseSingleCommandTokens(tokens: string[]): ParsedCommand {
  const flags: string[] = [];
  const namedFlags: Record<string, string | boolean> = {};
  const targets: string[] = [];
  const args: string[] = [];
  const envVars: Record<string, string> = {};
  const redirects: { type: '>' | '>>' | '<' | '2>' | '&>'; target: string }[] = [];

  let executable = '';
  let subcommand: string | undefined = undefined;
  let hasEnvAssignment = false;
  let i = 0;

  // 1. Process leading environment variable assignments (e.g., VAR=val cmd)
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.includes('=') && !token.startsWith('-') && !executable) {
      const eqIdx = token.indexOf('=');
      const k = token.slice(0, eqIdx);
      const v = cleanToken(token.slice(eqIdx + 1));
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) {
        envVars[k] = v;
        hasEnvAssignment = true;
        i++;
        continue;
      }
    }
    break;
  }

  // 2. Extract executable
  if (i < tokens.length) {
    const rawExec = tokens[i];
    // Strip sudo / env wrapper if present
    if (rawExec === 'sudo' || rawExec === 'doas') {
      flags.push(rawExec);
      i++;
      if (i < tokens.length) {
        executable = cleanToken(tokens[i]);
        i++;
      }
    } else {
      executable = cleanToken(rawExec);
      i++;
    }
  }

  // 3. Process arguments, flags, redirects, and targets
  let isFirstPositional = true;

  while (i < tokens.length) {
    const token = tokens[i];

    // Handle redirects
    if (['>', '>>', '<', '2>', '&>'].includes(token)) {
      const type = token as '>' | '>>' | '<' | '2>' | '&>';
      const nextToken = tokens[i + 1];
      if (nextToken) {
        redirects.push({ type, target: cleanToken(nextToken) });
        targets.push(cleanToken(nextToken));
        i += 2;
        continue;
      }
    }

    if (token.startsWith('-')) {
      flags.push(token);
      if (token.includes('=')) {
        const [k, v] = token.split('=');
        namedFlags[k] = cleanToken(v);
      } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-') && !['>', '>>', '<', '2>', '&>', '|', ';', '&&', '||'].includes(tokens[i + 1])) {
        // Flag with value (e.g. -f value or --output file)
        namedFlags[token] = cleanToken(tokens[i + 1]);
      } else {
        namedFlags[token] = true;
      }
    } else {
      const cleaned = cleanToken(token);
      args.push(cleaned);

      // Identify subcommand for known multi-command tools (git, docker, npm, kubectl, aws, gcloud, cargo)
      if (
        isFirstPositional &&
        ['git', 'docker', 'npm', 'yarn', 'pnpm', 'kubectl', 'aws', 'gcloud', 'cargo', 'systemctl', 'service'].includes(executable.toLowerCase())
      ) {
        subcommand = cleaned;
        isFirstPositional = false;
      } else {
        targets.push(cleaned);
      }
    }

    i++;
  }

  const raw = tokens.join(' ');
  const hasSubshell = /\$\([^)]+\)|`[^`]+`/.test(raw);

  return {
    raw,
    executable: executable.toLowerCase(),
    subcommand: subcommand ? subcommand.toLowerCase() : undefined,
    flags,
    namedFlags,
    targets,
    args,
    isPiped: false,
    redirects,
    hasSubshell,
    hasEnvAssignment,
    envVars,
    isChained: false,
  };
}

/**
 * Main parser entry point: parses raw bash/shell command string into structured representation.
 */
export function parseBashCommand(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      rawInput: input,
      commands: [],
      hasSubshell: false,
      hasDangerousPipe: false,
      hasNetworkActivity: false,
    };
  }

  const tokens = tokenizeShell(trimmed);
  const commands: ParsedCommand[] = [];

  let currentTokens: string[] = [];
  let isPiped = false;
  let chainOp: '&&' | '||' | ';' | undefined = undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '|' || token === '&&' || token === '||' || token === ';') {
      if (currentTokens.length > 0) {
        const cmd = parseSingleCommandTokens(currentTokens);
        cmd.isPiped = isPiped || token === '|';
        cmd.isChained = token === '&&' || token === '||' || token === ';';
        cmd.chainOperator = chainOp;
        commands.push(cmd);
        currentTokens = [];
      }
      isPiped = token === '|';
      chainOp = token !== '|' ? (token as '&&' | '||' | ';') : undefined;
    } else {
      currentTokens.push(token);
    }
  }

  if (currentTokens.length > 0) {
    const cmd = parseSingleCommandTokens(currentTokens);
    cmd.isPiped = isPiped;
    cmd.chainOperator = chainOp;
    commands.push(cmd);
  }

  // Network tools
  const networkTools = new Set([
    'curl', 'wget', 'nc', 'netcat', 'ncat', 'ssh', 'scp', 'rsync', 'ftp', 'sftp', 'telnet', 'socat'
  ]);

  const hasNetworkActivity = commands.some(c => networkTools.has(c.executable));

  // Check for dangerous pipes (e.g. curl ... | bash, wget ... | sh)
  let hasDangerousPipe = false;
  for (let i = 0; i < commands.length - 1; i++) {
    const current = commands[i];
    const next = commands[i + 1];
    if (
      networkTools.has(current.executable) &&
      next.isPiped &&
      ['bash', 'sh', 'zsh', 'dash', 'python', 'python3', 'node', 'perl', 'ruby', 'powershell', 'pwsh'].includes(next.executable)
    ) {
      hasDangerousPipe = true;
      break;
    }
  }

  const hasSubshell = /\$\([^)]+\)|`[^`]+`/.test(trimmed);

  return {
    rawInput: input,
    commands,
    hasSubshell,
    hasDangerousPipe,
    hasNetworkActivity,
  };
}
