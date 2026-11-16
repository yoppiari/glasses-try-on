import { useEffect, useState, type FormEvent } from 'react'
import { useMemberDooz } from '../MemberDoozProvider.tsx'
import { Button, Field, Loading, Notice, Sheet, Spinner, TextInput } from '../ui.tsx'
import { SessionProblem } from './KartuTab.tsx'

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Terjadi kendala. Coba lagi sebentar.')

/** Tab Profil & Privasi: ubah nama/kota, promo WA, keluar, hapus semua data (UU PDP). */
export function ProfilTab({ onSignedOut }: { onSignedOut?: () => void }) {
  const { client, me, meError, reloadMe, setMe, setView, cities, notify, close } = useMemberDooz()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [consentBusy, setConsentBusy] = useState(false)
  const [sheet, setSheet] = useState<'none' | 'revoke' | 'delete'>('none')

  useEffect(() => {
    if (!me) return
    setName(me.full_name ?? '')
    setCity(me.city_regency ?? '')
  }, [me?.full_name, me?.city_regency]) // eslint-disable-line react-hooks/exhaustive-deps

  if (meError && !me) return <SessionProblem status={meError.status} message={meError.message} onRetry={() => void reloadMe()} onLogin={() => setView('login')} />
  if (!me) return <Loading />

  const dirty = name.trim() !== (me.full_name ?? '') || city.trim() !== (me.city_regency ?? '')
  const promo = me.consents?.find((c) => c.scope === 'crm_wa')?.granted ?? false

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Nama minimal 2 huruf.')
    if (!city.trim()) return setError('Isi Kota/Kabupaten.')
    setSaving(true)
    setError('')
    try {
      const patch: { full_name?: string; city_regency?: string } = {}
      if (name.trim() !== (me.full_name ?? '')) patch.full_name = name.trim()
      if (city.trim() !== (me.city_regency ?? '')) patch.city_regency = city.trim()
      setMe(await client.updateProfile(patch))
      notify('Profil tersimpan')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  const togglePromo = async () => {
    setConsentBusy(true)
    setError('')
    try {
      await client.setConsent('crm_wa', !promo)
      await reloadMe()
      notify(!promo ? 'Info promo WhatsApp aktif' : 'Kamu tidak akan menerima info promo')
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setConsentBusy(false)
    }
  }

  const logoutHere = () => {
    client.logout()
    close()
    notify('Kamu sudah keluar dari HP ini')
    onSignedOut?.()
  }

  return (
    <div className="mdz-stack">
      <div>
        <h1 className="mdz-title">Profil & Privasi</h1>
        <p className="mdz-muted">Data kamu milikmu. Ubah atau hapus kapan saja.</p>
      </div>

      <form className="mdz-box mdz-stack" onSubmit={save} noValidate>
        <Field label="Nama" htmlFor="mdz-p-name">
          <TextInput id="mdz-p-name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Kota/Kabupaten" htmlFor="mdz-p-city">
          <TextInput
            id="mdz-p-city"
            maxLength={80}
            list={cities.length ? 'mdz-cities' : undefined}
            value={city}
            placeholder="mis. Kota Surakarta"
            onChange={(e) => setCity(e.target.value)}
          />
          {cities.length > 0 && (
            <datalist id="mdz-cities">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          )}
        </Field>
        <dl className="mdz-facts">
          <div>
            <dt>WhatsApp</dt>
            <dd>{me.phone_masked}</dd>
          </div>
          <div>
            <dt>Kode member</dt>
            <dd>{me.member_code}</dd>
          </div>
        </dl>
        <p className="mdz-hint">Nomor WhatsApp tidak bisa diubah karena dipakai untuk masuk.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" variant="orange" size="lg" block disabled={!dirty || saving}>
          {saving ? <Spinner /> : 'Simpan perubahan'}
        </Button>
      </form>

      <section className="mdz-box mdz-row">
        <div className="mdz-grow">
          <h2 className="mdz-h2">Info promo lewat WhatsApp</h2>
          <p className="mdz-muted mdz-small">{promo ? 'Aktif. Kamu bisa berhenti kapan saja.' : 'Tidak aktif.'}</p>
        </div>
        <Button variant="outline" size="sm" disabled={consentBusy} onClick={() => void togglePromo()}>
          {consentBusy ? <Spinner /> : promo ? 'Berhenti terima promo' : 'Aktifkan lagi'}
        </Button>
      </section>

      <section className="mdz-box mdz-stack-sm">
        <h2 className="mdz-h2">Keluar</h2>
        <Button variant="outline" block onClick={logoutHere}>
          Keluar dari HP ini
        </Button>
        <Button variant="outline" block onClick={() => setSheet('revoke')}>
          Keluar dari semua perangkat
        </Button>
      </section>

      <section className="mdz-box mdz-box--danger mdz-stack-sm">
        <h2 className="mdz-h2">Hapus data saya</h2>
        <p className="mdz-muted mdz-small">
          Hapus profil, Ukuran Saya, Kartu Member, dan riwayat kamu secara permanen (hak hapus data UU Pelindungan Data Pribadi).
        </p>
        <Button variant="danger" block onClick={() => setSheet('delete')}>
          Hapus semua data saya
        </Button>
      </section>

      {sheet === 'revoke' && <RevokeSheet onClose={() => setSheet('none')} onDone={onSignedOut} />}
      {sheet === 'delete' && <DeleteSheet onClose={() => setSheet('none')} onDone={onSignedOut} />}
    </div>
  )
}

function RevokeSheet({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { client, close, notify } = useMemberDooz()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true)
    setError('')
    try {
      const n = await client.revokeAllSessions()
      close()
      notify(`Kamu sudah keluar dari ${n} perangkat`)
      onDone?.()
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Keluar dari semua perangkat?" subtitle="Kartu Member tertutup di semua HP & aplikasi DOOZ yang pernah membukanya." onClose={onClose}>
      <p className="mdz-muted">Data kamu tidak dihapus. Masuk lagi kapan saja lewat WhatsApp.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="mdz-grid2">
        <Button variant="outline" size="lg" onClick={onClose}>
          Batal
        </Button>
        <Button size="lg" disabled={busy} onClick={() => void go()}>
          {busy ? <Spinner /> : 'Keluar semua'}
        </Button>
      </div>
    </Sheet>
  )
}

const DELETE_WORD = 'HAPUS'

function DeleteSheet({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { client, setView } = useMemberDooz()
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true)
    setError('')
    try {
      await client.deleteAllData()
      setView('deleted')
      onDone?.()
    } catch (err) {
      setError(errMsg(err))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Hapus semua data?" subtitle="Tidak bisa dibatalkan." onClose={onClose}>
      <div className="mdz-stack">
        <p className="mdz-muted">
          Profil, semua ukuran di Ukuran Saya, riwayat frame dicoba, persetujuan, dan semua sesi member akan dihapus permanen dari
          server DOOZ. Ketik <b>{DELETE_WORD}</b> untuk melanjutkan.
        </p>
        <TextInput aria-label={`Ketik ${DELETE_WORD}`} value={word} autoCapitalize="characters" onChange={(e) => setWord(e.target.value)} />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="mdz-grid2">
          <Button variant="outline" size="lg" onClick={onClose}>
            Batal
          </Button>
          <Button variant="danger" size="lg" disabled={busy || word.trim().toUpperCase() !== DELETE_WORD} onClick={() => void go()}>
            {busy ? <Spinner /> : 'Ya, hapus permanen'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
