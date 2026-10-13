/**
 * Minimal grouped bar chart with error bars, as a standalone SVG. Figures for
 * the report are generated rather than screenshotted, so they are exact,
 * re-creatable and print sharply at poster size. Light background, black text,
 * so they drop straight into a Word template.
 */
export type BarSeries = { name: string; colour: string; values: number[]; errors?: number[] }

export function barChart(o: { title: string; yLabel: string; categories: string[]; series: BarSeries[] }): string {
  const W = 640
  const H = 360
  const m = { l: 56, r: 16, t: 40, b: 64 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const top = Math.max(1, ...o.series.flatMap((s) => s.values.map((v, i) => v + (s.errors?.[i] ?? 0)))) * 1.1
  const step = niceStep(top)
  const max = Math.ceil(top / step) * step
  const y = (v: number) => m.t + ih - (v / max) * ih
  const group = iw / o.categories.length
  const bw = Math.min(46, (group * 0.72) / o.series.length)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

  const grid: string[] = []
  for (let v = 0; v <= max + 1e-9; v += step) {
    grid.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#d8dde2" stroke-width="1"/><text x="${m.l - 8}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="#333">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`)
  }

  const bars = o.categories.flatMap((cat, ci) => {
    const gx = m.l + ci * group + group / 2 - (bw * o.series.length) / 2
    const label = `<text x="${m.l + ci * group + group / 2}" y="${H - m.b + 16}" text-anchor="middle" font-size="10" fill="#222">${esc(cat)}</text>`
    const rects = o.series.map((s, si) => {
      const v = s.values[ci]
      const e = s.errors?.[ci] ?? 0
      const x = gx + si * bw
      const cx = x + bw / 2
      return `<rect x="${x}" y="${y(v)}" width="${bw - 3}" height="${m.t + ih - y(v)}" fill="${s.colour}"/>` +
        (e > 0 ? `<path d="M${cx - 1.5} ${y(v + e)}V${y(Math.max(0, v - e))}M${cx - 5} ${y(v + e)}h7M${cx - 5} ${y(Math.max(0, v - e))}h7" stroke="#111" stroke-width="1" fill="none"/>` : '') +
        `<text x="${cx - 1.5}" y="${y(v + e) - 4}" text-anchor="middle" font-size="9" fill="#111">${v >= 100 ? v.toFixed(0) : v.toFixed(1)}</text>`
    })
    return [label, ...rects]
  })

  const legend = o.series
    .map((s, i) => `<rect x="${m.l + i * 130}" y="${H - 22}" width="10" height="10" fill="${s.colour}"/><text x="${m.l + i * 130 + 15}" y="${H - 13}" font-size="10" fill="#222">${esc(s.name)}</text>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Times New Roman, serif">
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${W / 2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#111">${esc(o.title)}</text>
${grid.join('\n')}
<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + ih}" stroke="#333"/>
<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="#333"/>
<text transform="translate(14 ${m.t + ih / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#222">${esc(o.yLabel)}</text>
${bars.join('\n')}
${legend}
</svg>
`
}

function niceStep(top: number): number {
  const raw = top / 5
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow
}
