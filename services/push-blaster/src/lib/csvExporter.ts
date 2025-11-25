import Papa from 'papaparse';
import { ExecutionLog } from './automationLogger';

// Escape CSV injection characters
function escapeValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Prefix with single quote if starts with formula character
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function exportExecutionToCsv(
  execution: ExecutionLog,
  include: 'summary' | 'phases' | 'pushes' | 'all' = 'all'
): string {
  const sections: string[] = [];

  if (include === 'summary' || include === 'all') {
    const excluded = execution.metrics.totalAudienceSize -
                     execution.metrics.totalSentCount -
                     (execution.metrics.failedPushes || 0);
    sections.push(Papa.unparse([{
      'Execution ID': escapeValue(execution.executionId),
      'Automation': escapeValue(execution.automationName),
      'Date': execution.startTime,
      'Status': execution.status,
      'Duration (s)': Math.round(execution.metrics.totalDuration / 1000),
      'Sent': execution.metrics.totalSentCount,
      'Excluded': Math.max(0, excluded),
      'Failed': execution.metrics.failedPushes || 0,
      'Audience Size': execution.metrics.totalAudienceSize,
    }]));
  }

  if ((include === 'phases' || include === 'all') && execution.phases) {
    const phaseRows = execution.phases.map((phase, index) => ({
      'Phase #': index + 1,
      'Phase': phase.phase,
      'Status': phase.status,
      'Duration (ms)': phase.duration || 0,
      'Start Time': phase.startTime,
    }));
    if (phaseRows.length > 0) {
      if (sections.length > 0) sections.push(''); // Empty line separator
      sections.push('PHASES');
      sections.push(Papa.unparse(phaseRows));
    }
  }

  if ((include === 'pushes' || include === 'all') && execution.pushLogs) {
    const pushRows = execution.pushLogs.map(push => ({
      'Sequence': push.sequenceOrder,
      'Title': escapeValue(push.pushTitle),
      'Layer': push.layerId,
      'Audience': push.audienceSize || 0,
      'Sent': push.sentCount || 0,
      'Failed': push.failureCount || 0,
      'Status': push.status,
    }));
    if (pushRows.length > 0) {
      if (sections.length > 0) sections.push(''); // Empty line separator
      sections.push('PUSH RESULTS');
      sections.push(Papa.unparse(pushRows));
    }
  }

  return sections.join('\n');
}

export function getExportFilename(execution: ExecutionLog): string {
  const date = new Date(execution.startTime).toISOString().split('T')[0];
  const safeName = execution.automationName.replace(/[^a-zA-Z0-9]/g, '_');
  return `${safeName}_${date}_${execution.executionId.slice(0, 8)}.csv`;
}
