import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useMemberDooz } from '../MemberDoozProvider.tsx'
import { MemberApiError } from '../../client.ts'
import {
  COMFORT_OPTIONS,
  SIZE_NAME_CHIPS,
  SOURCE_LABEL,
  estimateFrameWidthFromTemple,
  formatDate,
  formatMm,
  parseTempleLabel,
  sizeCategoryFor,
} from '../../format.ts'
import type { Comfort, Measurement, MeasurementList } from '../../types.ts'
import { Button, Chip, Field, Loading, Notice, Sheet, Spinner, TextInput, cx } from '../ui.tsx'
import { SessionProblem } from './KartuTab.tsx'

/** Hasil ukur di HP ini yang belum disimpan (App Ukur). */
export interface UnsavedMeasurement {
  frame_width_mm: number
  size_category: string
}

export interface UkuranTabProps {
  /** + Tambah ukuran → "Ukur lagi" (hanya app yang bisa mengukur, mis. App Ukur). */
  onMeasureAgain?: () => void
  unsavedMeasurement?: UnsavedMeasurement | null
  onUnsavedSaved?: (m: Measurement) => void
}

type SheetState =
  | { kind: 'none' }
  | { kind: 'add' }
  | { kind: 'temple' }
  | { kind: 'edit'; m: Measurement }
  | { kind: 'delete'; m: Measurement }
  | { kind: 'save-last' }

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Terjadi kendala. Coba lagi sebentar.')

/** Tab Ukuran Saya: banyak ukuran, nama, catatan, 😊/😐/❌, ⭐ satu ukuran utama. */
export function UkuranTab({ onMeasureAgain, unsavedMeasurement, onUnsavedSaved }: UkuranTabProps) {
  const { client, reloadMe, notify, setView } = useMemberDooz()
  const [data, setData] = useState<MeasurementList | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; status: number } | null>(null)
  const [actionError, setActionError] = useState('')
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' })
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await client.list())
      setLoadError(null)
    } catch (err) {
      setLoadError({ message: errMsg(err), status: err instanceof MemberApiError ? err.status : 0 })
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  const refreshAll = async (message?: string) => {
    await Promise.all([load(), reloadMe()])
    if (message) notify(message)
  }

  const run = async (id: string, fn: () => Promise<unknown>, message: string) => {
    setBusyId(id)
    setActionError('')
    try {
      await fn()
      await refreshAll(message)
    } catch (err) {
      setActionError(errMsg(err))
      if (err instanceof MemberApiError && err.status === 404) void load()
    } finally {
      setBusyId(null)
    }
  }

  const setComfort = (m: Measurement, value: Comfort) => {
    const next = m.comfort === value ? null : value
    setData((d) => d && { ...d, measurements: d.measurements.map((x) => (x.id === m.id ? { ...x, comfort: next } : x)) })
    client.update(m.id, { comfort: next }).catch((err) => {
      setActionError(errMsg(err))
      void load()
    })
  }

  if (loadError && (loadError.status === 401 || loadError.status === 403)) {
    return loadError.status === 403 ? (
      <Notice>Untuk keamanan, konfirmasi dulu nama lengkap kamu di tab Kartu Member.</Notice>
    ) : (
      <SessionProblem status={401} message={loadError.message} onRetry={() => void load()} onLogin={() => setView('login')} />
    )
  }

  const list = data?.measurements ?? []
  const full = !!data && data.count >= data.max
  const showUnsaved = !!unsavedMeasurement && !!data && !full

  return (
    <div className="mdz-stack">
      <div className="mdz-row mdz-row--between mdz-row--end">
        <div>
          <h1 className="mdz-title">Ukuran Saya</h1>
          <p className="mdz-muted">{client.demo ? 'Pratinjau dengan data contoh' : 'Tandai mana yang paling pas & nyaman.'}</p>
        </div>
        {data && (
          <span className="mdz-pill">
            {data.count}/{data.max}
          </span>
        )}
      </div>

      {showUnsaved && unsavedMeasurement && (
        <div className="mdz-callout">
          <div className="mdz-grow">
            Hasil ukur terakhir{' '}
            <b>
              {unsavedMeasurement.size_category} · {formatMm(unsavedMeasurement.frame_width_mm)} mm
            </b>{' '}
            belum disimpan.
          </div>
          <Button variant="orange" size="sm" onClick={() => setSheet({ kind: 'save-last' })}>
            Simpan
          </Button>
        </div>
      )}

      {actionError && <Notice tone="error">{actionError}</Notice>}
      {loadError && (
        <Notice tone="error">
          {loadError.message}{' '}
          <button type="button" className="mdz-link" onClick={() => void load()}>
            Coba lagi
          </button>
        </Notice>
      )}

      {!data && !loadError && <Loading />}
      {data && list.length === 0 && <div className="mdz-empty">Belum ada ukuran tersimpan. Tambahkan ukuran pertamamu.</div>}

      <ul className="mdz-list">
        {list.map((m) => (
          <li key={m.id}>
            <MeasurementCard
              m={m}
              busy={busyId === m.id}
              onComfort={(c) => setComfort(m, c)}
              onEdit={() => setSheet({ kind: 'edit', m })}
              onPrimary={() => void run(m.id, () => client.setPrimary(m.id), `⭐ “${m.name}” jadi ukuran utama`)}
              onDelete={() => setSheet({ kind: 'delete', m })}
            />
          </li>
        ))}
      </ul>

      {data && (
        <Button size="lg" block disabled={full} onClick={() => setSheet(onMeasureAgain ? { kind: 'add' } : { kind: 'temple' })}>
          + Tambah ukuran
        </Button>
      )}
      {full && <p className="mdz-center mdz-muted mdz-small">Maksimal {data?.max} ukuran. Hapus salah satu untuk menambah.</p>}

      {sheet.kind === 'add' && (
        <Sheet title="Tambah ukuran" subtitle="Pilih cara menambah ukuran." onClose={() => setSheet({ kind: 'none' })}>
          <div className="mdz-stack-sm">
            {onMeasureAgain && (
              <OptionButton
                title="Ukur lagi"
                desc="Tempel kacamata di layar seperti tadi. Hasilnya langsung masuk ke daftar, tanpa isi data diri."
                onClick={() => {
                  setSheet({ kind: 'none' })
                  onMeasureAgain()
                }}
              />
            )}
            <OptionButton title="Isi dari kacamata yang kamu punya" desc="Salin angka di gagang kacamata, mis. 52□18-140." onClick={() => setSheet({ kind: 'temple' })} />
          </div>
        </Sheet>
      )}

      {sheet.kind === 'temple' && (
        <TempleSheet
          onClose={() => setSheet({ kind: 'none' })}
          onSaved={(m) => {
            setSheet({ kind: 'none' })
            void refreshAll(`“${m.name}” tersimpan`)
          }}
        />
      )}

      {sheet.kind === 'edit' && (
        <EditSheet
          m={sheet.m}
          onClose={() => setSheet({ kind: 'none' })}
          onSaved={() => {
            setSheet({ kind: 'none' })
            void refreshAll('Perubahan tersimpan')
          }}
        />
      )}

      {sheet.kind === 'delete' && (
        <Sheet title="Hapus ukuran ini?" subtitle={`“${sheet.m.name}” · ${sheet.m.size_category} · ${formatMm(sheet.m.frame_width_mm)} mm`} onClose={() => setSheet({ kind: 'none' })}>
          <p className="mdz-muted">
            {sheet.m.is_primary
              ? 'Ini ukuran utama kamu. Setelah dihapus, ukuran terbaru yang tersisa otomatis jadi utama.'
              : 'Ukuran ini akan dihapus dari daftar dan Kartu Member.'}
          </p>
          <div className="mdz-grid2">
            <Button variant="outline" size="lg" onClick={() => setSheet({ kind: 'none' })}>
              Batal
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                const m = sheet.m
                setSheet({ kind: 'none' })
                void run(m.id, () => client.remove(m.id), `“${m.name}” dihapus`)
              }}
            >
              Hapus
            </Button>
          </div>
        </Sheet>
      )}

      {sheet.kind === 'save-last' && unsavedMeasurement && (
        <SaveLastSheet
          u={unsavedMeasurement}
          onClose={() => setSheet({ kind: 'none' })}
          onSaved={(m) => {
            setSheet({ kind: 'none' })
            onUnsavedSaved?.(m)
            void refreshAll(`“${m.name}” tersimpan`)
          }}
        />
      )}
    </div>
  )
}

function OptionButton({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mdz-option">
      <span className="mdz-grow">
        <b className="mdz-block">{title}</b>
        <span className="mdz-muted mdz-small mdz-block">{desc}</span>
      </span>
      <span className="mdz-accent" aria-hidden>
        ›
      </span>
    </button>
  )
}

function MeasurementCard({
  m,
  busy,
  onComfort,
  onEdit,
  onPrimary,
  onDelete,
}: {
  m: Measurement
  busy: boolean
  onComfort: (c: Comfort) => void
  onEdit: () => void
  onPrimary: () => void
  onDelete: () => void
}) {
  const hasTemple = m.lens_mm != null && m.bridge_mm != null
  return (
    <article className={cx('mdz-measure', m.is_primary && 'mdz-measure--primary', busy && 'mdz-busy')} aria-busy={busy}>
      <div className="mdz-row mdz-row--start">
        <div className="mdz-measure__cat">{m.size_category}</div>
        <div className="mdz-grow mdz-min0">
          {m.is_primary && <span className="mdz-tag">⭐ Ukuran utama</span>}
          <h2 className="mdz-measure__name">{m.name}</h2>
          <div className="mdz-measure__mm">
            {m.size_category} · {formatMm(m.frame_width_mm)} mm
            {hasTemple && (
              <span className="mdz-muted">
                {' '}
                ({m.lens_mm}□{m.bridge_mm}
                {m.temple_mm != null ? `-${m.temple_mm}` : ''})
              </span>
            )}
          </div>
        </div>
      </div>
      {m.note && <p className="mdz-measure__note">“{m.note}”</p>}
      <p className="mdz-muted mdz-small">
        {formatDate(m.created_at)} · {SOURCE_LABEL[m.source] ?? m.source}
      </p>
      <div className="mdz-chips" role="group" aria-label={`Tanda kenyamanan ${m.name}`}>
        {COMFORT_OPTIONS.map((o) => (
          <Chip key={o.value} active={m.comfort === o.value} onClick={() => onComfort(o.value)}>
            <span aria-hidden>{o.emoji}</span> {o.label}
          </Chip>
        ))}
      </div>
      <div className="mdz-measure__actions">
        <Button variant="ghost" size="sm" onClick={onEdit} disabled={busy}>
          Ubah
        </Button>
        {!m.is_primary && (
          <Button variant="ghost" size="sm" onClick={onPrimary} disabled={busy}>
            ☆ Jadikan utama
          </Button>
        )}
        <Button variant="ghost" size="sm" className="mdz-push mdz-danger-text" onClick={onDelete} disabled={busy}>
          Hapus
        </Button>
      </div>
    </article>
  )
}

function NameChips({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  return (
    <div className="mdz-chips">
      {SIZE_NAME_CHIPS.map((c) => (
        <Chip key={c} active={value === c} onClick={() => onPick(c)}>
          {c}
        </Chip>
      ))}
    </div>
  )
}

function EditSheet({ m, onClose, onSaved }: { m: Measurement; onClose: () => void; onSaved: () => void }) {
  const { client } = useMemberDooz()
  const [name, setName] = useState(m.name)
  const [note, setNote] = useState(m.note)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Nama ukuran tidak boleh kosong.')
    setBusy(true)
    setError('')
    try {
      await client.update(m.id, { name: name.trim(), note: note.trim() })
      onSaved()
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Ubah ukuran" subtitle={`${m.size_category} · ${formatMm(m.frame_width_mm)} mm`} onClose={onClose}>
      <form className="mdz-stack" onSubmit={submit} noValidate>
        <Field label="Nama ukuran" htmlFor="mdz-e-name">
          <TextInput id="mdz-e-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <NameChips value={name} onPick={setName} />
        </Field>
        <Field label="Catatan (opsional)" htmlFor="mdz-e-note">
          <textarea id="mdz-e-note" rows={2} maxLength={280} value={note} className="mdz-input mdz-textarea" placeholder="mis. nyaman dipakai seharian" onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="orange" size="lg" block disabled={busy}>
          {busy ? <Spinner /> : 'Simpan perubahan'}
        </Button>
      </form>
    </Sheet>
  )
}

function SaveLastSheet({ u, onClose, onSaved }: { u: UnsavedMeasurement; onClose: () => void; onSaved: (m: Measurement) => void }) {
  const { client } = useMemberDooz()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onSaved(await client.create({ name: name.trim() || undefined, note: note.trim(), frame_width_mm: u.frame_width_mm, source: 'self_measure' }))
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Simpan hasil ukur" subtitle={`${u.size_category} · ${formatMm(u.frame_width_mm)} mm`} onClose={onClose}>
      <form className="mdz-stack" onSubmit={submit} noValidate>
        <Field label="Nama ukuran (opsional)" htmlFor="mdz-s-name">
          <TextInput id="mdz-s-name" value={name} maxLength={60} placeholder="mis. Kerja" onChange={(e) => setName(e.target.value)} />
          <NameChips value={name} onPick={setName} />
        </Field>
        <Field label="Catatan (opsional)" htmlFor="mdz-s-note">
          <TextInput id="mdz-s-note" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="orange" size="lg" block disabled={busy}>
          {busy ? <Spinner /> : 'Simpan ke Ukuran Saya'}
        </Button>
      </form>
    </Sheet>
  )
}

/** "Isi dari kacamata yang kamu punya": angka gagang 52□18-140. */
function TempleSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (m: Measurement) => void }) {
  const { client } = useMemberDooz()
  const [lens, setLens] = useState('')
  const [bridge, setBridge] = useState('')
  const [temple, setTemple] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [comfort, setComfort] = useState<Comfort | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const label = `${lens}□${bridge}-${temple}`
  const parsed = parseTempleLabel(label)
  const estimate = parsed ? estimateFrameWidthFromTemple(parsed.lens, parsed.bridge) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!parsed) return setError('Periksa angkanya: lensa 30–75, bridge 10–30, gagang 100–170 (mis. 52□18-140).')
    setBusy(true)
    setError('')
    try {
      onSaved(await client.create({ name: name.trim() || undefined, note: note.trim(), temple_label: label, source: 'temple_label', comfort }))
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }

  const num = (id: string, value: string, set: (v: string) => void, placeholder: string, aria: string) => (
    <input
      id={id}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      aria-label={aria}
      value={value}
      placeholder={placeholder}
      onChange={(e) => set(e.target.value.replace(/\D+/g, ''))}
      className="mdz-input mdz-input--num"
    />
  )

  return (
    <Sheet title="Isi dari kacamata yang kamu punya" subtitle="Lihat angka kecil di sisi dalam gagang kacamata." onClose={onClose}>
      <form className="mdz-stack" onSubmit={submit} noValidate>
        <div>
          <div className="mdz-temple">
            {num('mdz-t-lens', lens, setLens, '52', 'Lebar lensa (mm)')}
            <span aria-hidden>□</span>
            {num('mdz-t-bridge', bridge, setBridge, '18', 'Lebar bridge (mm)')}
            <span aria-hidden>–</span>
            {num('mdz-t-temple', temple, setTemple, '140', 'Panjang gagang (mm)')}
          </div>
          <div className="mdz-temple mdz-temple--labels">
            <span>Lensa</span>
            <span />
            <span>Bridge</span>
            <span />
            <span>Gagang</span>
          </div>
          <p className="mdz-callout mdz-small">
            {estimate ? (
              <span>
                Perkiraan lebar frame: <b>{estimate} mm · Ukuran {sizeCategoryFor(estimate)}</b>
              </span>
            ) : (
              'Contoh: 52□18-140 = lensa 52, bridge 18, gagang 140.'
            )}
          </p>
        </div>
        <Field label="Nama ukuran (opsional)" htmlFor="mdz-t-name">
          <TextInput id="mdz-t-name" value={name} maxLength={60} placeholder="Dari gagang kacamata" onChange={(e) => setName(e.target.value)} />
          <NameChips value={name} onPick={setName} />
        </Field>
        <Field label="Catatan (opsional)" htmlFor="mdz-t-note">
          <TextInput id="mdz-t-note" value={note} maxLength={280} placeholder="mis. kacamata lama, enak dipakai" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="mdz-field">
          <span className="mdz-label">Rasanya saat dipakai?</span>
          <div className="mdz-chips">
            {COMFORT_OPTIONS.map((o) => (
              <Chip key={o.value} active={comfort === o.value} onClick={() => setComfort(comfort === o.value ? null : o.value)}>
                <span aria-hidden>{o.emoji}</span> {o.label}
              </Chip>
            ))}
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="orange" size="lg" block disabled={busy}>
          {busy ? <Spinner /> : 'Simpan ke Ukuran Saya'}
        </Button>
      </form>
    </Sheet>
  )
}
