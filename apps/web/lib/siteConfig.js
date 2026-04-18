export const siteConfig = {
  brand: {
    name: 'AsyncOps',
    logoMark: '⚡',
    version: 'v1.0 · now in public beta',
  },

  nav: {
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Docs', href: '/docs' },
      { label: 'Pricing', href: '/pricing' },
    ],
    signInHref: '/login',
    ctaLabel: 'Try Demo',
    ctaHref: '/dashboard',
  },

  hero: {
    headline: ['Stop guessing where your', 'async workflows fail.'],
    tagline: 'AsyncOps — orchestrate, trace, and retry your async workflows.',
    subtext: 'You run the worker. AsyncOps orchestrates and tracks execution — durable state, retries, live logs, and a dashboard for every job.',
    primaryCta: { label: 'Try Demo', href: '/dashboard' },
    secondaryCta: { label: 'View docs', href: '/docs' },
    languageNote: 'Currently supports Node.js (JavaScript). More languages coming soon.',
  },

  dashboardPreview: {
    url: 'app.asyncops.com/dashboard/jobs',
    sidebar: [
      { label: 'jobs', active: true },
      { label: 'api-keys' },
      { label: 'docs' },
    ],
    stats: [
      { label: '847', sub: 'completed', color: 'emerald' },
      { label: '12', sub: 'failed', color: 'rose' },
      { label: '3', sub: 'processing', color: 'sky' },
    ],
    jobs: [
      { id: '65f8a42c', type: 'generate-article', status: 'completed',  time: '2.4s' },
      { id: '65f8a41b', type: 'send-email',       status: 'processing', time: '0.8s' },
      { id: '65f8a3fe', type: 'resize-image',     status: 'completed',  time: '1.1s' },
      { id: '65f8a3c7', type: 'generate-report',  status: 'failed',     time: '0.3s' },
      { id: '65f8a3a2', type: 'sync-contacts',    status: 'pending',    time: '—'    },
      { id: '65f8a38f', type: 'generate-article', status: 'completed',  time: '3.2s' },
    ],
  },

  systemActivity: {
    label: 'Live system',
    title: 'This is your backend at 2am.',
    subtitle:
      'Dropped connections, stalled workers, silent failures. AsyncOps traces every execution so you can pinpoint what broke — and why.',
  },

  terminal: {
    label: 'Install',
    title: 'One SDK. Two pieces: a worker, and a job.',
    subtitle: 'Your worker executes handlers in your environment. AsyncOps coordinates state, retries, and logs.',
    languageNote: 'SDK is Node.js only. Your worker must run in a Node.js process. More language SDKs coming soon — in the meantime, any language can create and inspect jobs via the REST API.',
    path: '~/your-app',
    installCommand: 'npm install asyncops-sdk',
    installOutput: [
      { text: '+ asyncops-sdk@1.0.0', tone: 'success' },
      { text: 'added 1 package in 2s',  tone: 'muted' },
    ],
    caption: 'AsyncOps never executes your code. Your Node.js worker does.',
    jobType: 'generate-article',
    dataKey: 'topic',
    dataValue: 'AI',
    workerFile: 'worker.js',
    appFile: 'app.js',
    resultBadge: { status: 'pending', jobId: '65f8a42c', createdAt: '0.2s ago' },
  },

  problem: {
    label: 'The problem',
    title: 'Your async jobs are a black box.',
    painPoints: [
      'An email failed silently — and nobody noticed for 3 hours.',
      'A job is stuck in processing — is it stalled, or just slow?',
      'A chain of jobs broke — but which step actually failed?',
    ],
    solutionJob: {
      id: '65f8a3c7',
      status: 'failed',
      logs: [
        { time: '00:00.00', msg: 'Job created',                 tone: 'default' },
        { time: '00:00.42', msg: 'Worker picked up job',        tone: 'sky' },
        { time: '00:01.18', msg: 'Fetching payload',            tone: 'default' },
        { time: '00:30.00', msg: 'Error: timeout after 30s',    tone: 'rose' },
        { time: '00:30.01', msg: 'Job failed: timeout after 30s', tone: 'rose' },
      ],
      stack: [
        'at generateReport (worker.js:42)',
        'at runHandler (asyncops-sdk/index.js:214)',
      ],
    },
  },

  features: {
    label: 'Features',
    title: 'Debug async systems like you debug frontend code.',
    jobTracking: {
      title: 'Live Job Timeline',
      subtitle: 'Every job across your workers, streamed in real time.',
      jobs: [
        { id: '65f8a42c', label: 'generate-article', status: 'completed',  color: 'emerald' },
        { id: '65f8a41b', label: 'send-email',       status: 'processing', color: 'sky' },
        { id: '65f8a3a2', label: 'resize-image',     status: 'pending',    color: 'amber' },
      ],
    },
    logsTimeline: {
      title: 'Per-Job Logs',
      subtitle: 'Every ctx.log line, timestamped. See exactly where things went wrong.',
      events: [
        { t: '00:00.00', msg: 'Job created',         color: 'zinc' },
        { t: '00:00.42', msg: 'Worker picked up job', color: 'sky' },
        { t: '00:01.18', msg: 'Fetching payload',    color: 'zinc' },
        { t: '00:02.40', msg: 'Job completed',       color: 'emerald' },
      ],
    },
    retry: {
      title: 'Re-run from Failure',
      subtitle: 'Inspect the failure, fix the cause, and replay safely.',
      failedJob: {
        id: '65f8a3c7',
        type: 'generate-report',
        error: 'Error: timeout after 30s',
      },
    },
  },

  ctaSection: {
    title: 'See what your async systems are actually doing.',
    subtitle: 'Two files: a worker, and a createJob call. AsyncOps handles the rest.',
    button: { label: 'Open Dashboard', href: '/dashboard' },
  },

  footer: {
    copyright: 'AsyncOps · © 2026',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'GitHub', href: '#' },
      { label: 'Status', href: '#' },
    ],
  },
};

export default siteConfig;
