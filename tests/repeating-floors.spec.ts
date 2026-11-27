import { test, expect } from '@playwright/test'
import { repeatsAcrossFloors } from '../src/boltDashboard/utils/repeatingFloors'

test('retains activities on two floors including zero progress and unresolved conflicts', () => {
  expect(repeatsAcrossFloors({ progress_by_level: { L1: { actual_percent: 0 }, L2: { planned_percent: 0 } } })).toBe(true)
  expect(repeatsAcrossFloors({ progress_by_level: { L1: { data_status: 'conflict', source_activity_ids: ['a', 'b'] }, L2: { data_status: 'partial', actual_percent: null } } })).toBe(true)
})
test('hides single-floor activities even with multiple source activities on that floor', () => {
  expect(repeatsAcrossFloors({ progress_by_level: { L1: { source_activity_ids: ['a', 'b'] } } })).toBe(false)
  expect(repeatsAcrossFloors({ is_single_level_activity: true, level_count: 2 })).toBe(false)
})
test('does not count aggregate buckets or missing placeholder cells as floors', () => {
  expect(repeatsAcrossFloors({ progress_by_level: { All: { actual_percent: 50 }, L1: { actual_percent: 10 }, L2: null, L3: {}, L4: { data_status: 'unavailable' } } })).toBe(false)
})
test('uses level counts for older reports without a floor map', () => {
  expect(repeatsAcrossFloors({ level_count: 2 })).toBe(true)
  expect(repeatsAcrossFloors({ level_count: 1 })).toBe(false)
  expect(repeatsAcrossFloors({})).toBe(false)
})
