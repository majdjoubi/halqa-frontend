import { spawn } from 'node:child_process';
import path from 'node:path';

const PROJECT_PATH = path.resolve(process.argv[2] ?? process.cwd());
const PROJECT_NAME = path.basename(PROJECT_PATH);
const TARGET_URL = process.argv[3] ?? 'https://www.halqa.online/join-us';

function createJsonRpcClient(proc) {
  let buffer = '';
  let nextId = 1;
  const pending = new Map();

  function send(msg) {
    proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  function request(method, params) {
    const id = nextId++;
    send({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      // Basic timeout to avoid hanging forever
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method}`));
        }
      }, 10 * 60 * 1000);
    });
  }

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx < 0) break;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id != null) {
        const p = pending.get(msg.id);
        if (!p) continue;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    }
  });

  return { send, request };
}

async function main() {
  if (!process.env.TESTSPRITE_API_KEY && !process.env.API_KEY) {
    console.error('Missing TESTSPRITE_API_KEY (or API_KEY) env var. Set it before running.');
    process.exit(2);
  }

  const isWindows = process.platform === 'win32';
  const npxCommand = isWindows ? 'npx.cmd' : 'npx';

  const proc = spawn(
    npxCommand,
    ['@testsprite/testsprite-mcp@latest'],
    {
      cwd: PROJECT_PATH,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...process.env,
        // Some clients pass API_KEY; keep both for compatibility
        API_KEY: process.env.API_KEY ?? process.env.TESTSPRITE_API_KEY,
      },
      windowsHide: true,
      // Using npx.cmd on Windows avoids needing a shell.
      shell: false,
    }
  );

  const client = createJsonRpcClient(proc);

  const init = await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'halqa-testsprite-cli', version: '0.1.0' },
  });

  client.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const tools = await client.request('tools/list', {});
  const toolNames = (tools?.tools ?? []).map((t) => t.name);

  const preferred = [
    'testsprite_generate_code_and_execute',
    'testsprite_generate_frontend_test_plan',
    'testsprite_generate_backend_test_plan',
  ];

  const toolToCall = preferred.find((n) => toolNames.includes(n));
  if (!toolToCall) {
    console.error('Could not find a runnable TestSprite tool. Available tools:', toolNames);
    process.exit(3);
  }

  const additionalInstruction = [
    `Test the production URL: ${TARGET_URL}`,
    'Focus on the Join Us page UI/UX and form validation.',
    'Check that the page loads without console errors, required fields validate, and submission flow behaves correctly.',
  ].join('\n');

  const result = await client.request('tools/call', {
    name: toolToCall,
    arguments: {
      projectName: PROJECT_NAME,
      projectPath: PROJECT_PATH,
      testIds: [],
      additionalInstruction,
    },
  });

  // The MCP server typically returns { content: [{type:"text", text:"..."}] }
  const text = (result?.content ?? [])
    .map((c) => (typeof c?.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n');

  console.log(text || JSON.stringify(result, null, 2));

  // Give the server a moment to flush any output
  setTimeout(() => {
    proc.kill();
  }, 2000);
}

main().catch((err) => {
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
