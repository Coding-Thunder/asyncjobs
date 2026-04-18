#!/usr/bin/env node
// AsyncOps MCP server.
//
// Exposes three tools that AI agents can call:
//   - create_job       → POST /jobs
//   - get_job_status   → GET  /jobs/:id
//   - retry_job        → POST /jobs/:id/retry
//
// All execution still happens inside AsyncOps. The MCP server is just a thin
// JSON-RPC shim over the existing REST API — the AI is another client.
//
// Env vars:
//   ASYNCOPS_URL        default http://localhost:4000
//   ASYNCOPS_API_KEY    required (ak_live_...)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = (process.env.ASYNCOPS_URL || 'http://localhost:4000').replace(/\/$/, '');
const API_KEY = process.env.ASYNCOPS_API_KEY;

if (!API_KEY) {
  console.error('ASYNCOPS_API_KEY is required (create one in the AsyncOps dashboard)');
  process.exit(1);
}

async function apiRequest(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as text
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data?.error ? data.error : `HTTP ${res.status}`;
    throw new Error(`AsyncOps ${method} ${path} failed: ${msg}`);
  }
  return data;
}

const server = new McpServer({
  name: 'asyncops',
  version: '0.1.0',
});

server.registerTool(
  'create_job',
  {
    title: 'Create an AsyncOps job',
    description:
      'Create a job of a given type with arbitrary data. The job is queued for execution by a worker in the user\'s account that has a handler registered for that type. Returns the new job id and initial status.',
    inputSchema: {
      type: z
        .string()
        .describe('The job type. Must match a handler registered on one of the account\'s running workers (e.g. "send-email", "generate-report").'),
      data: z
        .any()
        .optional()
        .describe('Optional input data passed to the worker\'s handler as job.data. Any JSON-serializable value.'),
      idempotencyKey: z
        .string()
        .optional()
        .describe('Optional key to deduplicate job creation — the second call with the same key returns the original job.'),
    },
  },
  async ({ type, data, idempotencyKey }) => {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined;
    const result = await apiRequest('/jobs', {
      method: 'POST',
      headers,
      body: { type, data: data === undefined ? null : data },
    });
    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

server.registerTool(
  'get_job_status',
  {
    title: 'Get job status',
    description:
      'Fetch a job by id. Returns status, type, input data, result, error, attempts, and log lines emitted by the worker.',
    inputSchema: {
      jobId: z.string().describe('The job id returned by create_job.'),
    },
  },
  async ({ jobId }) => {
    const result = await apiRequest(`/jobs/${encodeURIComponent(jobId)}`);
    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

server.registerTool(
  'retry_job',
  {
    title: 'Retry a job',
    description:
      'Re-queue a terminal job (status "failed" or "completed") for execution. ' +
      'Clears the previous result, error, and attempt counter but keeps the ' +
      'original type and data. ' +
      'Do NOT call retry_job on jobs in status "pending" or "processing" \u2014 ' +
      'the server will respond 409 job_not_retriable. Retries count against ' +
      'the monthly plan quota, same as create_job.',
    inputSchema: {
      jobId: z.string().describe('The job id to retry.'),
    },
  },
  async ({ jobId }) => {
    const result = await apiRequest(`/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
    });
    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[asyncops-mcp] ready on stdio');
