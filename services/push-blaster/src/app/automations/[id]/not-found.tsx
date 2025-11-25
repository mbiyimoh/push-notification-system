import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">
            Automation Not Found
          </h2>
          <p className="text-gray-600">
            The automation you are looking for does not exist or has been deleted.
          </p>
        </div>
        <Link
          href="/automations"
          className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          Back to Automations
        </Link>
      </div>
    </div>
  );
}
