// Debug Python Runner - Comprehensive capture for troubleshooting
// Based on debug-python-from-next.md checklist

console.log('[DEBUG_RUNNER] Module loaded at:', new Date().toISOString());

import { spawn } from 'node:child_process';
import fs from 'fs';
import path from 'path';

export interface PythonRunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  executionTime: number;
}

export async function runPython({
  pythonPath,
  scriptPath,
  args = [],
  env = {},
  cwd,
  executionId,
  timeoutMs = 300000 // 5 minute timeout for script execution (scripts run complex DB queries)
}: {
  pythonPath: string;
  scriptPath: string;
  args?: string[];
  env?: Record<string, string | undefined>;
  cwd: string;
  executionId: string;
  timeoutMs?: number;
}): Promise<PythonRunResult> {
  console.log('[DEBUG_RUNNER] runPython called with executionId:', executionId, 'timeout:', timeoutMs);
  const startTime = Date.now();
  
  return await new Promise<PythonRunResult>((resolve, reject) => {
    const child = spawn(pythonPath, [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        // Python debugging flags for more verbose output
        PYTHONUNBUFFERED: '1',
        PYTHONFAULTHANDLER: '1',
        PYTHONTRACEBACK: '1', 
        PYTHONWARNINGS: 'default',
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';
    let isResolved = false;

    // Set up timeout to prevent infinite hangs
    const timeout = setTimeout(() => {
      if (!isResolved) {
        console.log(`[DEBUG_RUNNER] Process timeout after ${timeoutMs}ms, killing process`);
        clearInterval(heartbeatInterval);
        child.kill('SIGKILL');
        isResolved = true;
        resolve({
          code: null,
          signal: 'SIGKILL',
          stdout,
          stderr: stderr + '\n[TIMEOUT] Process killed after timeout',
          executionTime: Date.now() - startTime
        });
      }
    }, timeoutMs);

    // Add heartbeat logging every 10 seconds to track hanging
    const heartbeatInterval = setInterval(() => {
      if (!isResolved) {
        const elapsed = Date.now() - startTime;
        console.log(`[DEBUG_RUNNER] Heartbeat: Process still running after ${elapsed}ms`);
        console.log(`[DEBUG_RUNNER] Stdout so far: ${stdout.length} chars, Stderr so far: ${stderr.length} chars`);
      }
    }, 10000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (d) => {
      stdout += d;
      console.log(`[STDOUT] ${d}`);
    });
    
    child.stderr.on('data', (d) => {
      stderr += d;
      console.log(`[STDERR] ${d}`);
    });
    
    child.on('error', (error) => {
      console.log(`[PROCESS ERROR] ${error.message}`);
      if (!isResolved) {
        clearTimeout(timeout);
        clearInterval(heartbeatInterval);
        isResolved = true;
        reject(error);
      }
    });
    
    child.on('close', async (code, signal) => {
      if (isResolved) return; // Already handled by timeout or error
      
      clearTimeout(timeout);
      clearInterval(heartbeatInterval);
      isResolved = true;
      
      const executionTime = Date.now() - startTime;
      
      console.log(`[PROCESS CLOSE] Code: ${code}, Signal: ${signal}, Time: ${executionTime}ms`);
      
      // Write debug outputs to files
      const tmpDir = path.join(process.cwd(), 'tmp');
      try {
        await fs.promises.writeFile(
          path.join(tmpDir, `py_stdout_${executionId}.log`),
          stdout,
          'utf8'
        );
        await fs.promises.writeFile(
          path.join(tmpDir, `py_stderr_${executionId}.log`), 
          stderr,
          'utf8'
        );
        // Write environment diff for Next.js context
        const keys = ["PATH","PYTHONPATH","VIRTUAL_ENV","ENV","NODE_ENV","DATABASE_URL","USER","HOME","PWD","SHELL"];
        const envNext = Object.fromEntries(keys.map(k => [k, process.env[k]]));
        await fs.promises.writeFile(
          path.join(tmpDir, "env_next.json"),
          JSON.stringify(envNext, null, 2),
          'utf8'
        );
        
        await fs.promises.writeFile(
          path.join(tmpDir, `py_result_${executionId}.json`),
          JSON.stringify({
            code,
            signal,
            executionTime,
            command: `${pythonPath} ${scriptPath} ${args.join(' ')}`,
            cwd,
            env: Object.keys(env)
          }, null, 2),
          'utf8'
        );
      } catch (writeError) {
        console.error('[DEBUG FILE WRITE ERROR]', writeError);
      }
      
      resolve({
        code,
        signal,
        stdout,
        stderr,
        executionTime
      });
    });
  });
}