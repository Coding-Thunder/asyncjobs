'use client';

import DocsContent from '../../../components/docs/DocsContent';

// Thin wrapper around the shared DocsContent component. Same content as the
// public /docs route — only difference is we point the "get an api key"
// quickstart step at the in-dashboard key manager. We do NOT pre-fill the
// env sample with the dashboard JWT: it's not an ak_live_… API key and it
// expires, so pasting it into a worker would silently mislead the user.
export default function DashboardDocsPage() {
  return <DocsContent keysHref="/dashboard/keys" />;
}
