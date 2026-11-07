// `npm run dev`: starts the backend (port 5000) and the Vite frontend together in one terminal.
// `npm run dev:memory`: same, but the backend uses a throwaway in-memory MongoDB (no MONGO_URI needed).
// Ctrl+C stops both. If one of them crashes, the other is stopped too.
import { spawn } from 'node:child_process';

const useMemoryDb = process.argv.includes('--memory');

const services = [
  { name: 'backend', color: 35, command: `npm --prefix backend run ${useMemoryDb ? 'dev:memory' : 'dev'}` },
  { name: 'frontend', color: 36, command: 'npm run dev:frontend' }
];

const children = [];
let stopping = false;

// Prefix every output line with the service name so the two logs are easy to tell apart
function pipeWithLabel(stream, target, label) {
  let partial = '';
  stream.on('data', chunk => {
    const lines = (partial + chunk).split('\n');
    partial = lines.pop();
    for (const line of lines) target.write(`${label} ${line}\n`);
  });
  stream.on('end', () => {
    if (partial) target.write(`${label} ${partial}\n`);
  });
}

function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = exitCode;
}

for (const { name, color, command } of services) {
  const label = `\x1b[${color}m[${name}]\x1b[0m`;
  const child = spawn(command, { shell: true, stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } });

  pipeWithLabel(child.stdout, process.stdout, label);
  pipeWithLabel(child.stderr, process.stderr, label);

  child.on('exit', code => {
    if (!stopping) {
      console.log(`${label} stopped${code ? ` with exit code ${code}` : ''}. Stopping the other service.`);
      stopAll(code ?? 1);
    }
  });

  children.push(child);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
