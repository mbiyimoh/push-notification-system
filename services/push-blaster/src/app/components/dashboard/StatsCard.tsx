'use client';

import Link from 'next/link';

interface StatsCardProps {
  label: string;
  count: number;
  status: 'live' | 'scheduled' | 'paused';
  subtitle?: string;
}

const statusStyles = {
  live: {
    borderColor: 'border-green-500',
    bgColor: 'bg-green-50',
    dotColor: 'bg-green-500',
    textColor: 'text-green-700',
    // "live" UI status maps to "running" automation status
    filterStatus: 'running',
  },
  scheduled: {
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-50',
    dotColor: 'bg-blue-500',
    textColor: 'text-blue-700',
    // "scheduled" UI status maps to "active" automation status
    filterStatus: 'active',
  },
  paused: {
    borderColor: 'border-yellow-500',
    bgColor: 'bg-yellow-50',
    dotColor: 'bg-yellow-500',
    textColor: 'text-yellow-700',
    filterStatus: 'paused',
  },
};

export function StatsCard({ label, count, status, subtitle }: StatsCardProps) {
  const styles = statusStyles[status];

  return (
    <Link
      href={`/automations?status=${styles.filterStatus}`}
      className={`block rounded-lg border-2 ${styles.borderColor} ${styles.bgColor} p-6 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-block h-3 w-3 rounded-full ${styles.dotColor}`}
              aria-label={`${status} status indicator`}
            />
            <h3 className="text-sm font-medium text-gray-600">{label}</h3>
          </div>

          <p className={`text-4xl font-bold ${styles.textColor} mb-1`}>
            {count.toLocaleString()}
          </p>

          {subtitle && (
            <p className="text-sm text-gray-500 mt-2">{subtitle}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
