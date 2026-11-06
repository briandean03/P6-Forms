import { test, expect } from '@playwright/test'
import { visibleWeeklyColumns, prepareWeeklyTable, prepareWeeklyChart } from '../src/lib/weeklyReportPresentation'
import { weeklySeriesColor } from '../src/lib/weeklyReportDesign'

test('hides metadata by key or label without hiding unrelated floats and data', () => {
  const keys = ['activity_id', 'wbs_code', 'WBS Name', 'is_critical', 'is_longest_path', 'float_path_order', 'float_order', 'status', 'total_float', 'planned_percent']
  expect(visibleWeeklyColumns(keys.map(key => ({ key }))).map(column => column.key)).toEqual(['activity_id', 'total_float', 'planned_percent'])
  expect(visibleWeeklyColumns([{key:'opaque',label:'WBS'}, {key:'other',label:'Critical Path'}])).toEqual([])
})

test('orders and names phase comparison rows without mutating source records', () => {
  const rows = ['GN','CO','AUH','UNASSIGNED','TC','HO','MI','EN'].map(phase => ({ phase, planned: 0, actual: 12 }))
  const result = prepareWeeklyTable([{key:'phase'}, {key:'planned'}, {key:'actual'}], rows, 'Phase Progress Comparison')
  expect(result.rows.map(row => row.phase)).toEqual(['Milestone','Engineering','Construction','Close-Out / Handing Over','Authority Approvals','Final Testing and Commissioning'])
  expect(result.rows[0].planned).toBe(0)
  expect(rows[0].phase).toBe('GN')
})

test('keeps unrelated tables unchanged', () => {
  const rows = [{ phase:'GN', amount:5 }]
  expect(prepareWeeklyTable([{key:'phase'},{key:'amount'}],rows,'Payments').rows).toBe(rows)
})

test('preserves each curve timeline and explicit null gaps', () => {
  const result = prepareWeeklyChart([], [{name:'Planned',data:[{x:'2026-01-04',y:1},{x:'2026-01-11',y:null},{x:'2026-01-18',y:3}]},{name:'Actual',data:[{x:'2026-01-01',y:0},{x:'2026-01-08',y:2}]}])
  expect(result.series[0].points).toEqual([{name:'2026-01-04',Planned:1},{name:'2026-01-11',Planned:null},{name:'2026-01-18',Planned:3}])
  expect(result.chartData[0].name).toBe('2026-01-01')
  expect(result.series[1].points?.[0].Actual).toBe(0)
})

test('token strings never become invalid SVG colours', () => {
  expect(weeklySeriesColor({},'Actual','actual','#123456')).toBe('#123456')
  expect(weeklySeriesColor({colors:{primary:'#112233'}},'Planned','planned','#123456')).toBe('#112233')
})

test('preserves status distribution categories and count metrics', () => {
  expect(visibleWeeklyColumns([{ key: 'status_code', label: 'Status Code' }, { key: 'count', label: 'Count' }])).toHaveLength(2)
  expect(visibleWeeklyColumns([{ key: 'status_count' }, { key: 'status_a_count' }, { key: 'status_b' }, { key: 'status', label: 'Activity Status' }]).map(column => column.key)).toEqual(['status_count', 'status_a_count', 'status_b'])
})
