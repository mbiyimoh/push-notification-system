'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface HeaderNavProps {
  breadcrumbs: BreadcrumbItem[];
  showCreateButton?: boolean;
}

export function HeaderNav({ breadcrumbs, showCreateButton = true }: HeaderNavProps) {
  const router = useRouter();

  // Check if there are any navigable breadcrumbs (with href)
  const hasNavigableBreadcrumbs = breadcrumbs.some((item) => item.href !== undefined);

  const handleBack = () => {
    // Find the last breadcrumb with an href
    const navigableBreadcrumbs = breadcrumbs.filter((item) => item.href !== undefined);
    if (navigableBreadcrumbs.length > 0) {
      const lastNavigable = navigableBreadcrumbs[navigableBreadcrumbs.length - 1];
      if (lastNavigable.href) {
        router.push(lastNavigable.href);
      }
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side: Back arrow and breadcrumbs */}
          <div className="flex items-center space-x-3">
            {hasNavigableBreadcrumbs && (
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Go back"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}

            {/* Breadcrumbs */}
            <nav className="flex items-center space-x-2" aria-label="Breadcrumb">
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const hasHref = item.href !== undefined;

                return (
                  <div key={index} className="flex items-center space-x-2">
                    {index > 0 && (
                      <span className="text-gray-400 select-none">/</span>
                    )}
                    {hasHref && !isLast ? (
                      <Link
                        href={item.href!}
                        className="text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span
                        className={isLast ? 'font-bold text-gray-900' : 'text-gray-600'}
                      >
                        {item.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Right side: New Automation button */}
          {showCreateButton && (
            <Link
              href="/create-automation"
              className="inline-flex items-center space-x-2 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
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
              <span>New Automation</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
