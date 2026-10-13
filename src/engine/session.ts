import { Engine, TICK, type Checkpoint, type Command, type EngineOptions } from './engine'

/** A checkpoint every this many ticks (60 sim-minutes) bounds replay cost. */
const CHECKPOINT_EVERY = 6000
/** Never run more than this many steps for one frame, so a stalled tab cannot spiral. */
const MAX_STEPS_PER_FRAME = 400

export type JournalEntry = { tick: number; cmd: Command }

/**
 * A live run: the engine, plus a journal of every command and periodic
 * checkpoints. Because the engine is deterministic, the journal is a complete
 * recording: a ReplayCursor rebuilds the yard exactly as it was and can play
 * on from there.
 *
 * Convention shared by live and replay: a command issued at tick k is applied
 * after step k and before step k+1.
 */
export class Session {
  engine: Engine
  journal: JournalEntry[] = []
  private checkpoints: { tick: number; cp: Checkpoint }[] = []
  private acc = 0
  readonly base: EngineOptions

  constructor(opts: EngineOptions) {
    this.base = opts
    this.engine = new Engine(opts)
  }

  get tick(): number {
    return this.engine.s.tick
  }

  /** Sim-minutes accumulated towards the next step, for smooth rendering between steps. */
  get leftover(): number {
    return this.acc
  }

  command(cmd: Command): void {
    this.journal.push({ tick: this.engine.s.tick, cmd })
    this.engine.exec(cmd)
  }

  /** Advance by a span of sim-minutes. Returns the number of fixed steps taken. */
  advance(simMinutes: number): number {
    this.acc += simMinutes
    const steps = Math.min(Math.floor(this.acc / TICK + 1e-9), MAX_STEPS_PER_FRAME)
    this.acc = steps === MAX_STEPS_PER_FRAME ? 0 : this.acc - steps * TICK
    for (let i = 0; i < steps; i++) {
      this.engine.step()
      if (this.engine.s.tick % CHECKPOINT_EVERY === 0) {
        this.checkpoints.push({ tick: this.engine.s.tick, cp: this.engine.checkpoint() })
      }
    }
    return steps
  }

  /** A second engine, rebuilt to exactly how the yard stood at `tick`. */
  replayTo(tick: number): ReplayCursor {
    const target = Math.max(0, Math.min(tick, this.engine.s.tick))
    const cp = [...this.checkpoints].reverse().find((c) => c.tick <= target)
    const e = cp ? Engine.restore(cp.cp) : new Engine(this.base)
    const cursor = new ReplayCursor(this, e)
    cursor.seek(target)
    return cursor
  }
}

export class ReplayCursor {
  private j = 0
  private acc = 0
  private readonly session: Session
  readonly engine: Engine

  constructor(session: Session, engine: Engine) {
    this.session = session
    this.engine = engine
    this.j = session.journal.findIndex((x) => x.tick >= engine.s.tick)
    if (this.j < 0) this.j = session.journal.length
    this.applyDue()
  }

  private applyDue(): void {
    const log = this.session.journal
    while (this.j < log.length && log[this.j].tick === this.engine.s.tick) this.engine.exec(log[this.j++].cmd)
  }

  get tick(): number {
    return this.engine.s.tick
  }

  /** True once the replay has caught up with the live run. */
  get atLive(): boolean {
    return this.engine.s.tick >= this.session.tick
  }

  /** Step forward to `tick` (never backwards: rebuild with replayTo for that). */
  seek(tick: number): void {
    while (this.engine.s.tick < tick) {
      this.engine.step()
      this.applyDue()
    }
  }

  advance(simMinutes: number): void {
    this.acc += simMinutes
    const steps = Math.min(Math.floor(this.acc / TICK + 1e-9), MAX_STEPS_PER_FRAME)
    this.acc = steps === MAX_STEPS_PER_FRAME ? 0 : this.acc - steps * TICK
    this.seek(Math.min(this.engine.s.tick + steps, this.session.tick))
  }
}
