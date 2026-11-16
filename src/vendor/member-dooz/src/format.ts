/** Utilitas tampilan Member DOOZ (tanpa React, tanpa jaringan). */
import type { Comfort, MeasurementSource } from './types.ts'

/**
 * Parse angka gagang kacamata `52□18-140` (lebar lensa □ bridge – gagang).
 * Format yang diterima sama dengan server: `52□18-140`, `52-18-140`, `52 18 140`, `52x18-140`, `52[]18-140`.
 */
export function parseTempleLabel(raw: string): { lens: number; bridge: number; temple: number } | null {
  const nums = String(raw || '').match(/\d+(?:[.,]\d+)?/g)
  if (!nums || nums.length !== 3) return null
  const [lens, bridge, temple] = nums.map((n) => Number(n.replace(',', '.')))
  if (lens < 30 || lens > 75 || bridge < 10 || bridge > 30 || temple < 100 || temple > 170) return null
  return { lens, bridge, temple }
}

/** Perkiraan lebar frame dari angka gagang, sama dengan server: 2 × lensa + bridge + 10. */
export function estimateFrameWidthFromTemple(lens: number, bridge: number): number {
  return Math.round(2 * lens + bridge + 10)
}

/** Size-chart bawaan Katalog DOOZ (server tetap sumber kebenaran; ini hanya untuk perkiraan di layar). */
export const DEFAULT_SIZE_CHART: { category: string; max_mm: number }[] = [
  { category: 'XS', max_mm: 127 },
  { category: 'S', max_mm: 133 },
  { category: 'M', max_mm: 139 },
  { category: 'L', max_mm: 145 },
  { category: 'XL', max_mm: Infinity },
]

export function sizeCategoryFor(widthMm: number, chart = DEFAULT_SIZE_CHART): string {
  const w = Math.round(widthMm)
  return (chart.find((c) => w <= c.max_mm) ?? chart[chart.length - 1]).category
}

/** 136 → "136", 136.5 → "136,5" */
export function formatMm(mm: number): string {
  return Number.isInteger(mm) ? String(mm) : String(Math.round(mm * 10) / 10).replace('.', ',')
}

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
export function formatDate(iso: string): string {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? dateFmt.format(new Date(t)) : ''
}

export const COMFORT_OPTIONS: { value: Comfort; emoji: string; label: string }[] = [
  { value: 'pas_nyaman', emoji: '😊', label: 'Pas & nyaman' },
  { value: 'kurang_nyaman', emoji: '😐', label: 'Kurang nyaman' },
  { value: 'tidak_pas', emoji: '❌', label: 'Tidak pas' },
]

export const SOURCE_LABEL: Record<MeasurementSource, string> = {
  self_measure: 'Ukur sendiri',
  outlet: 'Diukur di outlet',
  temple_label: 'Dari gagang kacamata',
}

/** Chip cepat nama ukuran. */
export const SIZE_NAME_CHIPS = ['Kerja', 'Baca', 'Sunglasses', 'Harian'] as const
