/** Letter grade for a score out of 1000, shown on the report header */
export function gradeFor(score: number): string {
  if (score >= 900) return 'A+'
  if (score >= 850) return 'A'
  if (score >= 800) return 'A-'
  if (score >= 750) return 'B+'
  if (score >= 700) return 'B'
  if (score >= 650) return 'B-'
  if (score >= 600) return 'C+'
  if (score >= 550) return 'C'
  if (score >= 500) return 'C-'
  if (score >= 400) return 'D'
  return 'F'
}
