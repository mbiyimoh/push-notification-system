'use client';

import React, { useState } from 'react';
import { PhaseLog } from '@/lib/automationLogger';

interface PhaseBreakdownProps {
  phases: PhaseLog[];
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const phaseLabels: Record<string, string> = {
  audience_generation: 'Audience Generation',
  audience_filtering: 'Cadence Filtering',
  cadence_filtering: 'Cadence Filtering',
  test_sending: 'Test Sending',
  live_execution: 'Live Execution',
  push_sending: 'Push Sending',
  cancellation_window: 'Cancellation Window',
  tracking: 'Notification Tracking',
};

export function PhaseBreakdown({ phases }: PhaseBreakdownProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  if (phases.length === 0) {
    return <p className="text-gray-500">No phase data available</p>;
  }

  return (
    <div className="space-y-2">
      {phases.map((phase, index) => {
        const isExpanded = expandedPhases.has(phase.phase);
        const statusIcon = phase.status === 'completed' ? '✓' :
                          phase.status === 'failed' ? '✗' :
                          phase.status === 'skipped' ? '○' : '●';
        const statusColor = phase.status === 'completed' ? 'text-green-600' :
                           phase.status === 'failed' ? 'text-red-600' :
                           phase.status === 'skipped' ? 'text-gray-400' : 'text-yellow-600';

        const hasDetails = phase.data && Object.keys(phase.data).length > 0;

        return (
          <div key={`${phase.phase}-${index}`} className="border border-gray-200 rounded-lg">
            <button
              onClick={() => hasDetails && togglePhase(phase.phase)}
              className={`w-full flex items-center justify-between p-4 ${hasDetails ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
              disabled={!hasDetails}
            >
              <div className="flex items-center gap-3">
                {hasDetails ? (
                  <span className="text-gray-400">{isExpanded ? '▼' : '►'}</span>
                ) : (
                  <span className="text-gray-300 w-3">•</span>
                )}
                <span className="font-medium">
                  Phase {index + 1}: {phaseLabels[phase.phase] || phase.phase}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className={statusColor}>{statusIcon}</span>
                <span className="text-gray-600">{formatDuration(phase.duration)}</span>
              </div>
            </button>

            {isExpanded && phase.data && (
              <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                <div className="pl-8 space-y-1 text-sm text-gray-600">
                  {Object.entries(phase.data).map(([key, value]) => (
                    <div key={key}>
                      └─ {key}: {typeof value === 'number' ? value.toLocaleString() : String(value)}
                    </div>
                  ))}
                  {phase.error && (
                    <div className="text-red-600">
                      └─ error: {phase.error}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
