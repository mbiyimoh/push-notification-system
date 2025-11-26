'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HeaderNav } from '@/app/components/nav/HeaderNav';
import AutomationCard from '@/app/components/automations/AutomationCard';
import { UniversalAutomation, AutomationStatus, ScheduleFrequency } from '@/types/automation';
import { toast } from 'sonner';

export default function AutomationsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [automations, setAutomations] = useState<UniversalAutomation[]>([]);
  const [filteredAutomations, setFilteredAutomations] = useState<UniversalAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('all');

  // Breadcrumbs
  const breadcrumbs = [
    { label: 'Dashboard', href: '/' },
    { label: 'Automations' }
  ];

  // Fetch automations on mount
  useEffect(() => {
    fetchAutomations();
  }, []);

  // Apply filters when automations or filters change
  useEffect(() => {
    applyFilters();
  }, [automations, statusFilter, frequencyFilter, searchQuery]);

  // Read filters from URL on mount
  useEffect(() => {
    const status = searchParams.get('status');
    const frequency = searchParams.get('frequency');

    if (status && status !== 'all') {
      setStatusFilter(status);
    }
    if (frequency && frequency !== 'all') {
      setFrequencyFilter(frequency);
    }
  }, [searchParams]);

  const fetchAutomations = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/automation/recipes');

      if (!response.ok) {
        throw new Error(`Failed to fetch automations: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setAutomations(Array.isArray(data.data) ? data.data : []);
      } else {
        throw new Error(data.message || 'Failed to load automations');
      }
    } catch (err) {
      console.error('Error fetching automations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load automations');
      setAutomations([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...automations];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((auto) => auto.status === statusFilter);
    }

    // Frequency filter
    if (frequencyFilter !== 'all') {
      filtered = filtered.filter((auto) => auto.schedule.frequency === frequencyFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((auto) =>
        auto.name.toLowerCase().includes(query) ||
        auto.description.toLowerCase().includes(query)
      );
    }

    setFilteredAutomations(filtered);
  };

  const handlePause = async (id: string) => {
    try {
      const response = await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', automationId: id }),
      });

      if (!response.ok) {
        throw new Error('Failed to pause automation');
      }

      const data = await response.json();

      if (data.success) {
        // Update local state
        setAutomations((prev) =>
          prev.map((auto) =>
            auto.id === id ? { ...auto, status: 'paused' as AutomationStatus, isActive: false } : auto
          )
        );
        toast.success('Automation paused');
      } else {
        throw new Error(data.message || 'Failed to pause automation');
      }
    } catch (err) {
      console.error('Error pausing automation:', err);
      toast.error('Failed to pause automation', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleResume = async (id: string) => {
    try {
      const response = await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume', automationId: id }),
      });

      if (!response.ok) {
        throw new Error('Failed to resume automation');
      }

      const data = await response.json();

      if (data.success) {
        // Update local state
        setAutomations((prev) =>
          prev.map((auto) =>
            auto.id === id ? { ...auto, status: 'active' as AutomationStatus, isActive: true } : auto
          )
        );
        toast.success('Automation resumed');
      } else {
        throw new Error(data.message || 'Failed to resume automation');
      }
    } catch (err) {
      console.error('Error resuming automation:', err);
      toast.error('Failed to resume automation', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/automation/recipes/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete automation');
      }

      const data = await response.json();

      if (data.success) {
        // Remove from local state
        setAutomations((prev) => prev.filter((auto) => auto.id !== id));
        toast.success('Automation deleted');
      } else {
        throw new Error(data.message || 'Failed to delete automation');
      }
    } catch (err) {
      console.error('Error deleting automation:', err);
      toast.error('Failed to delete automation', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setFrequencyFilter('all');
    setSearchQuery('');
    router.push('/automations');
  };

  const hasActiveFilters = statusFilter !== 'all' || frequencyFilter !== 'all' || searchQuery.trim() !== '';

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav breadcrumbs={breadcrumbs} showCreateButton={true} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Status Filter */}
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="status-filter" className="block text-xs font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="running">Running (Live)</option>
                <option value="active">Active (Scheduled)</option>
                <option value="paused">Paused</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* Frequency Filter */}
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="frequency-filter" className="block text-xs font-medium text-gray-700 mb-1">
                Frequency
              </label>
              <select
                id="frequency-filter"
                value={frequencyFilter}
                onChange={(e) => setFrequencyFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Frequencies</option>
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[250px]">
              <label htmlFor="search" className="block text-xs font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                id="search"
                type="text"
                placeholder="Search by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="flex-shrink-0 pt-6">
                <button
                  onClick={handleClearFilters}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Results Count */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              Showing {filteredAutomations.length} of {automations.length} automations
            </p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg
                  className="h-5 w-5 text-red-600 mr-3"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3 className="text-sm font-medium text-red-800">Failed to load automations</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={fetchAutomations}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm animate-pulse"
              >
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-6" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-4 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State - No automations exist */}
        {!loading && !error && automations.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No automations yet</h3>
            <p className="text-gray-600 mb-6">Get started by creating your first automation</p>
            <button
              onClick={() => router.push('/create-automation')}
              className="inline-flex items-center space-x-2 bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Create Your First Automation</span>
            </button>
          </div>
        )}

        {/* Empty State - No results after filtering */}
        {!loading && !error && automations.length > 0 && filteredAutomations.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No automations match your filters</h3>
            <p className="text-gray-600 mb-6">Try adjusting your search or filter criteria</p>
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center space-x-2 bg-gray-100 text-gray-700 font-semibold py-2 px-6 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <span>Clear All Filters</span>
            </button>
          </div>
        )}

        {/* Automations List */}
        {!loading && !error && filteredAutomations.length > 0 && (
          <div className="space-y-4">
            {filteredAutomations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onPause={handlePause}
                onResume={handleResume}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
