import { automationStorage } from '@/lib/automationStorage';
import { automationLogger } from '@/lib/automationLogger';
import { ExecutionDrilldown } from '@/app/components/detail/ExecutionDrilldown';
import { notFound } from 'next/navigation';

export default async function ExecutionDrilldownPage({
  params
}: {
  params: Promise<{ id: string; execId: string }>;
}) {
  const { id, execId } = await params;

  // Parallel fetch
  const [automation, executionHistory] = await Promise.all([
    automationStorage.loadAutomation(id),
    automationLogger.loadExecutionHistory(id, 100),
  ]);

  if (!automation) {
    notFound();
  }

  const execution = executionHistory.find(e => e.executionId === execId);
  if (!execution) {
    notFound();
  }

  return (
    <ExecutionDrilldown
      execution={execution}
      automation={automation}
    />
  );
}
