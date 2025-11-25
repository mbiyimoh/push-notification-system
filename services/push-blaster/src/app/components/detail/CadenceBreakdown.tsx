'use client';

import React from 'react';

export interface ExclusionBreakdown {
  l3Cooldown: number;
  l2l3WeeklyLimit: number;
  l5Cooldown: number;
  invalidUuid: number;
}

interface CadenceBreakdownProps {
  breakdown: ExclusionBreakdown;
  totalExcluded: number;
}

export function CadenceBreakdown({ breakdown, totalExcluded }: CadenceBreakdownProps) {
  if (totalExcluded === 0) {
    return (
      <p className="text-gray-500 text-sm">No users were excluded by cadence rules</p>
    );
  }

  const reasons = [
    { label: 'L3 72-hour Cooldown', count: breakdown.l3Cooldown, color: 'bg-blue-500' },
    { label: 'L2/L3 Weekly Limit (3/week)', count: breakdown.l2l3WeeklyLimit, color: 'bg-purple-500' },
    { label: 'L5 96-hour Cooldown', count: breakdown.l5Cooldown, color: 'bg-orange-500' },
    { label: 'Invalid UUID', count: breakdown.invalidUuid, color: 'bg-gray-500' },
  ].filter(r => r.count > 0);

  // Calculate "other" as difference
  const accounted = reasons.reduce((sum, r) => sum + r.count, 0);
  const other = totalExcluded - accounted;
  if (other > 0) {
    reasons.push({ label: 'Other', count: other, color: 'bg-gray-400' });
  }

  if (reasons.length === 0) {
    return (
      <p className="text-gray-500 text-sm">Exclusion breakdown not available</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600 mb-2">
        {totalExcluded.toLocaleString()} users excluded
      </div>
      {reasons.map(reason => {
        const percentage = (reason.count / totalExcluded) * 100;
        return (
          <div key={reason.label} className="flex items-center gap-3">
            <div className="w-44 text-sm text-gray-600 truncate" title={reason.label}>
              {reason.label}
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full ${reason.color} transition-all duration-300`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="w-28 text-sm text-gray-900 text-right">
              {reason.count.toLocaleString()} ({percentage.toFixed(1)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}
