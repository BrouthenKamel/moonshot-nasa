/**
 * Background news for the notification list: small agency life between the real
 * events. Mocked and flavour only: none of it changes money or popularity.
 * Deterministic, so the same day always shows the same news.
 */
import type { FeedItem } from './world'

const STORIES: Omit<FeedItem, 'id' | 'day'>[] = [
  { title: 'School visit', detail: '40 students toured the Factory', tone: 'good' },
  { title: 'Ground station serviced', detail: 'The big dish is back on the air', tone: 'info' },
  { title: 'Solar storm warning', detail: 'Space weather calm again by evening', tone: 'warning' },
  { title: 'New engineers joined', detail: 'Two interns start at the Research Lab', tone: 'good' },
  { title: 'Local news feature', detail: '"A space agency in our town"', tone: 'good' },
  { title: 'Clean room inspection', detail: 'Passed with no remarks', tone: 'info' },
  { title: 'Supplier delay', detail: 'Solar cells arrive a week late', tone: 'warning' },
  { title: 'Open day at the base', detail: 'Families watched a rocket engine test', tone: 'good' },
  { title: 'Night sky event', detail: 'The Moon talk filled the hall', tone: 'info' },
  { title: 'Network outage', detail: 'Mission control back online after 2 hours', tone: 'bad' },
]

/** One story every few days */
const EVERY = 9

export function backgroundNews(fromDay: number, toDay: number): FeedItem[] {
  const items: FeedItem[] = []
  const first = Math.ceil(fromDay / EVERY) * EVERY
  for (let day = first; day <= toDay; day += EVERY) {
    const story = STORIES[(day / EVERY) % STORIES.length]
    items.push({ ...story, id: `news-${day}`, day })
  }
  return items
}
