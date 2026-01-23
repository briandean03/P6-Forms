import { useMemo } from 'react'

interface DateColumnFilterProps<T> {
  data: T[]
  field: keyof T
  value: string
  onChange: (value: string) => void
  label: string
}

export function DateColumnFilter<T>({
  data,
  field,
  value,
  onChange,
  label: _label,
}: DateColumnFilterProps<T>) {
  const { monthYearOptions, hasBlanks } = useMemo(() => {
    const monthYearSet = new Set<string>()
    let blanksCount = 0

    data.forEach((item) => {
      const val = item[field]
      if (val === null || val === undefined || val === '') {
        blanksCount++
      } else {
        const date = new Date(String(val))
        if (!isNaN(date.getTime())) {
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          monthYearSet.add(monthYear)
        }
      }
    })

    // Sort by date descending (newest first)
    const sorted = Array.from(monthYearSet).sort((a, b) => b.localeCompare(a))

    return {
      monthYearOptions: sorted,
      hasBlanks: blanksCount > 0,
    }
  }, [data, field])

  const formatMonthYear = (monthYear: string) => {
    const [year, month] = monthYear.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  if (monthYearOptions.length === 0 && !hasBlanks) {
    return null
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 text-xs font-normal text-gray-700 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer appearance-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
        backgroundPosition: 'right 4px center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '16px',
        paddingRight: '24px',
      }}
    >
      <option value="">All</option>
      {hasBlanks && <option value="BLANK">(Blanks)</option>}
      {monthYearOptions.map((option) => (
        <option key={option} value={option}>
          {formatMonthYear(option)}
        </option>
      ))}
    </select>
  )
}
