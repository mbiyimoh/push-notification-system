// In-memory manager for tracking running automation test processes
// This is a simple implementation suitable for a single-server dev environment.
// For production, a more robust solution (e.g., Redis, DB) would be needed.

const runningTests = new Map<string, { 
  process?: any;
  startTime: number;
  mode: string;
}>();

export function registerRunningTest(automationId: string, mode: string, process?: any) {
  const testKey = `${automationId}-${mode}`;
  runningTests.set(testKey, {
    process,
    startTime: Date.now(),
    mode
  });
  console.log(`[TestProcessManager] Registered running test: ${testKey}`);
}

export function unregisterRunningTest(automationId: string, mode: string) {
  const testKey = `${automationId}-${mode}`;
  const removed = runningTests.delete(testKey);
  if (removed) {
    console.log(`[TestProcessManager] Unregistered completed test: ${testKey}`);
  }
}

export function getRunningTest(automationId: string, mode: string) {
  const testKey = `${automationId}-${mode}`;
  return runningTests.get(testKey);
}

export function deleteRunningTest(automationId: string, mode: string) {
  const testKey = `${automationId}-${mode}`;
  return runningTests.delete(testKey);
}

export function getAllRunningTests() {
  return Array.from(runningTests.entries()).map(([key, test]) => ({
    key,
    mode: test.mode,
    duration: Date.now() - test.startTime,
    hasProcess: !!test.process
  }));
}
