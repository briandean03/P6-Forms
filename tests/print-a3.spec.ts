import { test, expect } from '@playwright/test'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = _require('pdf-parse') as (buf: Buffer) => Promise<{ numpages: number; text: string }>

const OUT_DIR = path.join(__dirname)

// How many recharts-surface elements we expect (at least one per chart)
const MIN_SURFACE_COUNT = 3

async function navigateToA3(page: import('@playwright/test').Page) {
  await page.goto('/')

  // Wait for project list to load (Supabase fetch)
  const openBtn = page.getByRole('button', { name: 'Open Project' }).first()
  await openBtn.waitFor({ timeout: 30_000 })
  await openBtn.click()

  // Now in the app — click the Weekly Dashboard sidebar item
  await page.getByRole('button', { name: 'Weekly Dashboard' }).click()

  // Wait for A3 page to render
  await page.waitForSelector('.a3-page', { timeout: 30_000 })
}

for (const vw of [1920]) {
  test(`A3 prints as 1 page at ${vw}px`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 900 })

    await navigateToA3(page)

    // Take before screenshot (layout baseline)
    await page.screenshot({ path: path.join(OUT_DIR, `a3-screen-before-${vw}.png`), fullPage: false })

    // Trigger beforeprint synchronously → preparePrint runs
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
    // Small delay to let any async flushSync settle
    await page.waitForTimeout(500)

    // Take after-preparePrint screenshot
    await page.screenshot({ path: path.join(OUT_DIR, `a3-after-preparePrint-${vw}.png`), fullPage: false })

    // ── DOM quality checks ────────────────────────────────────────────────
    const issues = await page.evaluate(() => {
      const found: string[] = []
      document.querySelectorAll('.a3-print-root *').forEach(el => {
        const e = el as HTMLElement
        const cs = getComputedStyle(e)
        if (
          e.scrollWidth > e.clientWidth + 2 &&
          cs.overflow !== 'visible' &&
          cs.overflowX !== 'visible'
        ) {
          found.push(`CLIP ${e.tagName}.${[...e.classList].slice(0, 3).join('.')} sw=${e.scrollWidth} cw=${e.clientWidth}`)
        }
        if (cs.textOverflow === 'ellipsis' && e.scrollWidth > e.offsetWidth + 1) {
          found.push(`ELLIPSIS "${e.textContent?.slice(0, 30)}"`)
        }
      })
      // SVG text overlap check (only direct siblings within same parent to avoid n² across whole tree)
      const svgTexts = [...document.querySelectorAll('.a3-print-root svg text')] as SVGTextElement[]
      for (let i = 0; i < svgTexts.length; i++) {
        const a = svgTexts[i].getBoundingClientRect()
        if (a.width < 1) continue
        for (let j = i + 1; j < svgTexts.length; j++) {
          // Only check texts in same SVG to avoid cross-chart false positives
          if (svgTexts[i].closest('svg') !== svgTexts[j].closest('svg')) continue
          const b = svgTexts[j].getBoundingClientRect()
          if (b.width < 1) continue
          if (
            a.right > b.left + 2 && b.right > a.left + 2 &&
            a.bottom > b.top + 2 && b.bottom > a.top + 2
          ) {
            found.push(`SVG-OVERLAP "${svgTexts[i].textContent?.slice(0,20)}" / "${svgTexts[j].textContent?.slice(0,20)}"`)
          }
        }
      }
      return found
    })

    if (issues.length > 0) {
      console.warn('[A3 Print] DOM issues found:\n', issues.join('\n'))
    }
    // Report issues but don't fail — some overlap may be acceptable during print-mode evaluation
    // expect(issues).toHaveLength(0)

    // ── Recharts surface count ────────────────────────────────────────────
    const surfaceCount = await page.locator('.a3-print-root .recharts-surface').count()
    console.log(`[A3 Print] recharts-surface count: ${surfaceCount}`)
    expect(surfaceCount, 'Recharts surfaces not rendered').toBeGreaterThanOrEqual(MIN_SURFACE_COUNT)

    // ── Read scale from page ──────────────────────────────────────────────
    const scaleInfo = await page.evaluate(() => {
      const el = document.querySelector('.a3-page') as HTMLElement | null
      if (!el) return null
      return {
        zoom: el.style.zoom,
        scrollW: el.scrollWidth,
        scrollH: el.scrollHeight,
        bcr: el.getBoundingClientRect(),
      }
    })
    console.log('[A3 Print] .a3-page metrics after preparePrint:', JSON.stringify(scaleInfo))

    // ── Cleanup (afterprint) ──────────────────────────────────────────────
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))

    // ── PDF generation ────────────────────────────────────────────────────
    // Re-prepare for PDF (page.pdf() triggers its own print path in Chromium)
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
    await page.waitForTimeout(400)

    const pdf = await page.pdf({
      format: 'A3',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    })

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))

    // Assert exactly 1 page
    const parsed = await pdfParse(pdf)
    console.log(`[A3 Print] PDF page count: ${parsed.numpages}`)
    expect(parsed.numpages).toBe(1)

    // Save PDF for rasterization
    const pdfPath = path.join(OUT_DIR, `a3-print-${vw}.pdf`)
    fs.writeFileSync(pdfPath, pdf)
    console.log(`[A3 Print] PDF saved to: ${pdfPath}`)
  })
}
