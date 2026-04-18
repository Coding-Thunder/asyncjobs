// Scenario handlers — each one simulates a real async job. Returned values
// are surfaced by AsyncOps as the job's final result; `ctx.log()` lines show
// up in the live stream.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Attempt counter keyed by job id. Lets the retry-success scenario fail the
// first attempt and succeed on retry without mutating job.data.
const attemptCounts = new Map();

async function retrySuccess(job, ctx) {
  const attempt = (attemptCounts.get(job.id) || 0) + 1;
  attemptCounts.set(job.id, attempt);

  await ctx.log(`attempt ${attempt}: charging ${job.data?.amount ?? '?'} ${job.data?.currency ?? ''}`);
  await sleep(1500);

  if (attempt === 1) {
    await ctx.log('payments-api returned 503 (transient) — throwing to fail the job');
    throw new Error('Payments API temporarily unavailable (503)');
  }

  await ctx.log('payments-api returned 200 — charge confirmed');
  await sleep(500);
  attemptCounts.delete(job.id);
  return { charged: true, attempts: attempt, amount: job.data?.amount ?? 0 };
}

async function stuckThenRecover(job, ctx) {
  const totalSteps = 6;
  for (let i = 1; i <= totalSteps; i++) {
    await ctx.log(`heartbeat ${i}/${totalSteps} — still processing ${job.data?.reason || 'long task'}`);
    await sleep(2000);
  }
  await ctx.log('long task drained cleanly');
  return { recovered: true, heartbeats: totalSteps };
}

async function pipelineLogs(job, ctx) {
  const steps = [
    'validating payload schema',
    'querying primary database',
    'transforming 12,481 rows',
    'publishing to downstream kafka topic',
    'writing checkpoint to s3',
  ];
  for (const step of steps) {
    await ctx.log(`[${job.data?.pipeline || 'pipeline'}] ${step}`);
    await sleep(700 + Math.floor(Math.random() * 700));
  }
  return { pipeline: job.data?.pipeline || 'pipeline', steps: steps.length };
}

async function longAiTask(job, ctx) {
  const prompt = job.data?.prompt || 'summarize last quarter metrics';
  await ctx.log(`model=gpt-4o-mini  prompt="${prompt}"`);
  await sleep(600);
  await ctx.log('streaming response...');
  let tokens = 0;
  for (let i = 0; i < 8; i++) {
    await sleep(1100);
    tokens += 30 + Math.floor(Math.random() * 40);
    await ctx.log(`tokens generated: ${tokens}`);
  }
  await ctx.log('response complete');
  return { prompt, tokens };
}

module.exports = {
  handlers: {
    'retry-success': retrySuccess,
    'stuck-then-recover': stuckThenRecover,
    'pipeline-logs': pipelineLogs,
    'long-ai-task': longAiTask,
  },
};
