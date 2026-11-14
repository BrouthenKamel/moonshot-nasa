/**
 * Research Lab: mission data becomes publications.
 *
 * Data a mission sends home arrives at the Communications Center and joins
 * the lab's queue. Researchers work through it at a fixed rate. Papers come
 * out at milestones of the ice map, but only once the lab has processed all
 * the data that existed when the milestone was reached.
 */

export const research = {
  /** MB the researchers process per day */
  processingPerDay: 8,
}

export interface PaperSpec {
  id: string
  title: string
  /** What triggers the paper */
  trigger: { kind: 'processed'; mb: number } | { kind: 'coverage'; percent: number }
  money: number // $M
  popularity: number // percentage points
}

/** Lunar Ice Mapper publications */
export const lunarPapers: PaperSpec[] = [
  {
    id: 'first-light',
    title: 'First light: lunar polar data from a 6U CubeSat',
    trigger: { kind: 'processed', mb: 10 },
    money: 0.5,
    popularity: 1,
  },
  {
    id: 'map-25',
    title: 'Ice in the south polar craters: first quarter mapped',
    trigger: { kind: 'coverage', percent: 25 },
    money: 1,
    popularity: 2,
  },
  {
    id: 'map-50',
    title: 'Half the lunar south pole mapped for water ice',
    trigger: { kind: 'coverage', percent: 50 },
    money: 1.5,
    popularity: 2,
  },
  {
    id: 'map-70',
    title: 'Water-ice map of the lunar south pole',
    trigger: { kind: 'coverage', percent: 70 },
    money: 3,
    popularity: 4,
  },
]

export interface Paper {
  id: string
  title: string
  /** Processed MB the lab must reach before it can publish */
  needsProcessed: number
  startedDay: number
  publishedDay: number | null
  money: number
  popularity: number
}

export interface ResearchState {
  received: number // MB that reached the ground
  processed: number // MB the lab has worked through
  papers: Paper[]
}

export const emptyResearch = (): ResearchState => ({ received: 0, processed: 0, papers: [] })

/** New data arrived; start any paper whose milestone is now reached */
export function receiveData(
  state: ResearchState,
  totalReceived: number,
  coveragePercent: number,
  day: number,
  specs: PaperSpec[] = lunarPapers
): ResearchState {
  const received = Math.max(state.received, totalReceived)
  const papers = [...state.papers]
  for (const spec of specs) {
    if (papers.some((p) => p.id === spec.id)) continue
    const reached =
      spec.trigger.kind === 'processed' ? received >= spec.trigger.mb : coveragePercent >= spec.trigger.percent
    if (!reached) continue
    papers.push({
      id: spec.id,
      title: spec.title,
      needsProcessed: spec.trigger.kind === 'processed' ? spec.trigger.mb : received,
      startedDay: day,
      publishedDay: null,
      money: spec.money,
      popularity: spec.popularity,
    })
  }
  return { ...state, received, papers }
}

/** Researchers work for `days`; returns the new state and the papers published */
export function processResearch(
  state: ResearchState,
  days: number,
  day: number
): { state: ResearchState; published: Paper[] } {
  const processed = Math.min(state.received, state.processed + research.processingPerDay * days)
  const published: Paper[] = []
  const papers = state.papers.map((p) => {
    if (p.publishedDay === null && processed >= p.needsProcessed) {
      const done = { ...p, publishedDay: day }
      published.push(done)
      return done
    }
    return p
  })
  return { state: { ...state, processed, papers }, published }
}

/** 0-1 progress of a paper still being written */
export function paperProgress(state: ResearchState, paper: Paper): number {
  if (paper.publishedDay !== null) return 1
  return paper.needsProcessed <= 0 ? 1 : Math.min(1, state.processed / paper.needsProcessed)
}
