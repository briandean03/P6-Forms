import { test, expect } from '@playwright/test'
import { dashboardDesignStyle } from '../src/lib/dashboardDesign'

test('applies design typography and print sizes without changing layout geometry', () => {
  const style = dashboardDesignStyle({
    typography: { font_family_primary: { stack: 'Inter, sans-serif' }, kpi_value: { font_size_px: 28, font_weight: 600 } },
    radii: { widget_card: 20, kpi_card: 16 },
    print_specification: { typography: { kpi_value_pt: 18 }, margins_mm: { top: 12 } },
  }, (key, fallback) => key === 'canvas' ? '#F4F3F8' : fallback ?? '') as Record<string, unknown>
  expect(style.fontFamily).toBe('Inter, sans-serif')
  expect(style['--design-canvas']).toBe('#F4F3F8')
  expect(style['--design-widget-radius']).toBe('20px')
  expect(style['--design-kpi-value-size']).toBe('28px')
  expect(style['--design-print-kpi-value']).toBe('18pt')
  expect(style).not.toHaveProperty('padding')
  expect(style).not.toHaveProperty('width')
  expect(style).not.toHaveProperty('height')
})

test('missing or malformed settings retain usable defaults', () => {
  const style = dashboardDesignStyle({ typography: { kpi_value: { font_size_px: -100 } }, radii: null }, (_, fallback) => fallback ?? '') as Record<string, unknown>
  expect(style['--design-kpi-value-size']).toBe('28px')
  expect(style['--design-widget-radius']).toBe('8px')
  expect(style['--design-print-kpi-value']).toBe('18pt')
})
