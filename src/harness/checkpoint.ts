import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { within } from '../store.ts';
import type { HarnessRuntime } from './runtime.ts';

interface Checkpoint { id: string; turn: number; files: Map<string, { before: string | null; after?: string }> }
async function targetPath(root: string, path: string): Promise<string> {
  try { return await within(root, path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(await targetPath(root, parent), basename(path));
  }
}
/** Capture directly edited files before the first edit of a turn. Never automatically revert. */
export class Checkpoints {
  private readonly current = new WeakMap<Agent, Checkpoint>();
  constructor(readonly runtime: HarnessRuntime) {}
  get(agent: Agent) {
    let value = this.current.get(agent);
    const turn = this.runtime.state(agent).turn;
    if (!value || value.turn !== turn) { value = { id: randomUUID(), turn, files: new Map() }; this.current.set(agent, value); }
    return value;
  }
  private root(agent: Agent, checkpoint: Checkpoint) { return resolve(this.runtime.options.home, 'checkpoints', createHash('sha256').update(agent.id).digest('hex'), checkpoint.id); }
  private async save(agent: Agent, checkpoint: Checkpoint) {
    const root = this.root(agent, checkpoint); await mkdir(root, { recursive: true });
    await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ id: checkpoint.id, turn: checkpoint.turn, cwd: agent.session.header.cwd,
      coverage: 'Direct file-edit tools only; shell side effects require separate recovery.', files: Object.fromEntries(checkpoint.files) }, null, 2));
  }
  async capture(exec: ToolExecution) {
    if (!exec.agent?.session.header.cwd) return;
    const args = exec.arguments as Record<string, unknown>;
    const path = args?.path ?? args?.file_path ?? args?.filePath;
    if (typeof path !== 'string') return;
    const target = await targetPath(exec.agent.session.header.cwd, path);
    const checkpoint = this.get(exec.agent);
    if (checkpoint.files.has(target)) return;
    let bytes: Buffer | null;
    try { bytes = await readFile(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; bytes = null; }
    // Bounded checkpoint storage; refused snapshots leave the edit to normal host policy.
    if (bytes && bytes.length > 8 * 1024 * 1024) return;
    checkpoint.files.set(target, { before: bytes?.toString('base64') ?? null });
    await this.save(exec.agent, checkpoint);
  }
  async settle(exec: ToolExecution) {
    if (!exec.agent?.session.header.cwd) return;
    const args = exec.arguments as Record<string, unknown>, path = args?.path ?? args?.file_path ?? args?.filePath;
    if (typeof path !== 'string') return;
    const target = await targetPath(exec.agent.session.header.cwd, path), checkpoint = this.get(exec.agent), file = checkpoint.files.get(target);
    if (!file) return;
    try { file.after = createHash('sha256').update(await readFile(target)).digest('hex'); } catch { file.after = 'missing'; }
    await this.save(exec.agent, checkpoint);
  }
  describe(agent: Agent) {
    const checkpoint = this.get(agent);
    return { id: checkpoint.id, manifest: resolve(this.root(agent, checkpoint), 'manifest.json'), files: [...checkpoint.files.keys()],
      coverage: 'Direct file-edit tools only. Shell side effects and files edited outside these tools are not covered. Reversion requires explicit user approval and checking for intervening changes.' };
  }
}
