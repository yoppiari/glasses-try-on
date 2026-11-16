import { useState, type FormEvent } from 'react'
import { useMemberDooz } from '../MemberDoozProvider.tsx'
import { MemberCard } from '../MemberCard.tsx'
import { Button, Field, Loading, Notice, Spinner, TextInput, WhatsAppIcon } from '../ui.tsx'

/** Tab Kartu Member: kartu + QR dinamis, konfirmasi nama (nomor lama), dan link ke app DOOZ lain. */
export function KartuTab() {
  const { me, meError, reloadMe, brand, apps, openApp, setView } = useMemberDooz()
  if (meError && !me) return <SessionProblem status={meError.status} message={meError.message} onRetry={() => void reloadMe()} onLogin={() => setView('login')} />
  if (!me) return <Loading />
  if (me.requires_name_confirm || me.access_scope !== 'full') return <ConfirmName />
  return (
    <div className="mdz-stack">
      <MemberCard me={me} brand={brand} />
      <p className="mdz-center mdz-muted mdz-small">QR berganti otomatis tiap beberapa menit. Berlaku di semua outlet DOOZ.</p>
      {apps.length > 0 && (
        <section className="mdz-box">
          <h2 className="mdz-h2">Aplikasi DOOZ lain</h2>
          <p className="mdz-muted mdz-small">Kamu tetap masuk sebagai member.</p>
          <ul className="mdz-list">
            {apps.map((a) => (
              <li key={a.app}>
                <button type="button" className="mdz-option" onClick={() => void openApp(a)}>
                  <span className="mdz-grow">
                    <b>{a.label}</b>
                    {a.hint && <span className="mdz-muted mdz-small mdz-block">{a.hint}</span>}
                  </span>
                  <span aria-hidden className="mdz-accent">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function SessionProblem({ status, message, onRetry, onLogin }: { status: number; message: string; onRetry: () => void; onLogin: () => void }) {
  if (status === 401)
    return (
      <section className="mdz-hero">
        <h1 className="mdz-title mdz-title--light">Sesi member berakhir</h1>
        <p className="mdz-muted-light">Masuk lagi untuk membuka Kartu Member. Tanpa password, cukup lewat WhatsApp.</p>
        <Button variant="orange" size="lg" block onClick={onLogin}>
          <WhatsAppIcon /> Masuk lewat WhatsApp
        </Button>
      </section>
    )
  return (
    <Notice tone="error">
      {message}{' '}
      <button type="button" className="mdz-link" onClick={onRetry}>
        Coba lagi
      </button>
    </Notice>
  )
}

/** Sesi `basic_recycled_pending` (nomor pasif >6 bulan): konfirmasi nama lengkap dulu. */
function ConfirmName() {
  const { client, reloadMe } = useMemberDooz()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Tulis nama lengkap yang terdaftar.')
    setBusy(true)
    setError('')
    try {
      await client.confirmRecycled(name.trim())
      await reloadMe()
    } catch {
      setError('Nama belum cocok dengan data member. Coba lagi atau tanyakan ke kasir DOOZ.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="mdz-stack" onSubmit={submit} noValidate>
      <section className="mdz-box">
        <h2 className="mdz-h2">Konfirmasi nama lengkap</h2>
        <p className="mdz-muted mdz-small">Nomor ini lama tidak aktif. Untuk keamanan, tulis nama lengkap yang terdaftar.</p>
        <Field label="Nama lengkap" htmlFor="mdz-recycled-name">
          <TextInput id="mdz-recycled-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="orange" size="lg" block disabled={busy}>
          {busy ? <Spinner /> : 'Konfirmasi'}
        </Button>
      </section>
    </form>
  )
}
