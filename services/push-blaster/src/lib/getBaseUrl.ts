// Utility to get the correct base URL for server-side fetches
// Works on both local dev and Railway production

export function getBaseUrl(): string {
  // Check for explicit app URL (highest priority)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Check for legacy env var
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  // Railway provides RAILWAY_PUBLIC_DOMAIN automatically
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }

  // Check if we're in a browser (client-side) - use relative URLs
  if (typeof window !== 'undefined') {
    return '';
  }

  // Fallback for local development
  return 'http://localhost:3001';
}
