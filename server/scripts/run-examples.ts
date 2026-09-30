/**
 * Runs real topics through the live API end-to-end and saves each full job to /examples/<slug>.json.
 * Usage: (server running) npm run examples -w server -- "topic one" "topic two"
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../examples');
const topics = process.argv.slice(2);
if (!topics.length) topics.push('Monsoon street food in Mumbai', 'How UPI changed small shops');

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function follow(jobId: string) {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/events`);
  const decoder = new TextDecoder();
  let buf = '';
  let last = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (event === 'job' && data) {
        const j = JSON.parse(data);
        const line = `  ${j.status} · stage=${j.currentStage} · attempts=${j.attempts.length}`;
        if (line !== last) console.log(line);
        last = line;
      }
    }
  }
}

await mkdir(OUT, { recursive: true });
for (const topic of topics) {
  console.log(`\n▶ ${topic}`);
  const res = await fetch(`${BASE}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`POST failed: ${JSON.stringify(body)}`);
  await follow(body.jobId);
  const job = await (await fetch(`${BASE}/api/jobs/${body.jobId}`)).json();
  const file = path.join(OUT, `${slug(topic)}.json`);
  await writeFile(file, JSON.stringify(job, null, 2) + '\n');
  console.log(`  → ${job.status}${job.error ? ` (${job.error.code})` : ''} · saved ${path.relative(process.cwd(), file)}`);
}
