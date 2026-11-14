import { describe, expect, it } from 'vitest'
import { gradeFor } from './grade'

describe('gradeFor', () => {
  it('maps the score bands', () => {
    expect(gradeFor(1000)).toBe('A+')
    expect(gradeFor(900)).toBe('A+')
    expect(gradeFor(899)).toBe('A')
    expect(gradeFor(700)).toBe('B')
    expect(gradeFor(400)).toBe('D')
    expect(gradeFor(399)).toBe('F')
    expect(gradeFor(0)).toBe('F')
  })
})
