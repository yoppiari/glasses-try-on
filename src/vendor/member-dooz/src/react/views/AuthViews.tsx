import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useMemberDooz } from '../MemberDoozProvider.tsx'
import type { MagicLinkInfo, WhatsAppLoginRequest } from '../../types.ts'
import { Button, Field, Loading, Notice, Spinner, TextInput, WhatsAppIcon } from '../ui.tsx'

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

/** Belum member (app dengan ajakan simpan): "Jadi Member" → alur simpan ukuran milik app. */
export function JoinView({ onJoin }: { onJoin: () => void }) {
  const { setView } = useMemberDooz()
  return (
    <div className="mdz-stack">
      <section className="mdz-hero">
        <h1 className="mdz-title mdz-title--light">Jadi Member Kacamata DOOZ</h1>
        <p className="mdz-muted-light">Gratis, cukup lewat WhatsApp. Tanpa password.</p>
        <ul className="mdz-benefits">
          <li>Kartu Member dengan QR untuk kasir DOOZ</li>
          <li>Ukuran Saya: simpan banyak ukuran frame, tandai yang paling pas</li>
          <li>Riwayat ukuran & frame yang pernah dicoba</li>
          <li>Satu member untuk semua aplikasi Kacamata DOOZ</li>
        </ul>
        <Button variant="orange" size="lg" block onClick={onJoin}>
          Jadi Member
        </Button>
      </section>
      <p className="mdz-center mdz-muted">
        Sudah member?{' '}
        <button type="button" className="mdz-link" onClick={() => setView('login')}>
          Masuk lewat WhatsApp
        </button>
      </p>
    </div>
  )
}

const POLL_MS = 3000

/**
 * "Masuk lewat WhatsApp" (member di HP/app baru). Kode masuk dibuat, WhatsApp dibuka lewat tautan biasa,
 * lalu bot DOOZ membalas magic link yang membuka app ini (`?masuk=`), bukan CRM.
 */
export function LoginView({ onJoin }: { onJoin?: () => void }) {
  const { client, loginMessage, isMember, open } = useMemberDooz()
  const [req, setReq] = useState<WhatsAppLoginRequest | null>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'link_sent' | 'not_member' | 'expired'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  // Masuk di tab lain (link WA dibuka di tab baru) → sesi tersinkron → langsung ke Kartu Member.
  useEffect(() => {
    if (isMember) open('kartu')
  }, [isMember, open])

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await client.requestWhatsAppLogin()
      setReq(r)
      setStatus('pending')
    } catch (err) {
      setError(errMsg(err, 'Gagal membuat kode masuk. Coba lagi.'))
    } finally {
      setBusy(false)
    }
  }

  const poll = useCallback(async () => {
    if (!req || client.demo || inFlight.current) return
    inFlight.current = true
    try {
      const res = await client.pollVerificationStatus(req.login_code, req.poll_token)
      if (res.status === 'link_sent' || res.status === 'not_member' || res.status === 'expired') setStatus(res.status)
      else if (res.status === 'not_found') setStatus('expired')
    } catch {
      /* jaringan putus sesaat: coba lagi di putaran berikutnya */
    } finally {
      inFlight.current = false
    }
  }, [client, req])

  useEffect(() => {
    if (status !== 'pending') return
    const t = window.setInterval(() => document.visibilityState === 'visible' && void poll(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, poll])

  return (
    <div className="mdz-stack">
      {loginMessage && <Notice>{loginMessage}</Notice>}
      <section className="mdz-hero">
        <h1 className="mdz-title mdz-title--light">Sudah member? Masuk lewat WhatsApp</h1>
        {status === 'idle' && (
          <>
            <p className="mdz-muted-light">
              Tanpa password. Kirim satu pesan WhatsApp dari nomor member kamu, lalu kami balas dengan link masuk sekali pakai
              yang membuka aplikasi ini.
            </p>
            <ul className="mdz-benefits">
              <li>Kartu Member & Ukuran Saya langsung terbuka di HP ini</li>
              <li>Link hanya berlaku 15 menit dan sekali pakai</li>
            </ul>
            <Button variant="orange" size="lg" block disabled={busy} onClick={() => void start()}>
              {busy ? <Spinner /> : (<><WhatsAppIcon /> Lanjut ke WhatsApp</>)}
            </Button>
          </>
        )}
        {status === 'pending' && req && (
          <>
            <p className="mdz-muted-light">
              Kode masuk kamu <b className="mdz-code">{req.login_code}</b>. Tekan <b>Kirim</b> di WhatsApp, lalu ketuk link dari DOOZ.
            </p>
            <a className="mdz-btn mdz-btn--orange mdz-btn--lg mdz-btn--block" href={req.wa_me_url} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon /> Buka WhatsApp
            </a>
            <p className="mdz-muted-light mdz-small">Menunggu pesan WhatsApp kamu…</p>
          </>
        )}
        {status === 'link_sent' && (
          <p className="mdz-muted-light">
            ✅ Link masuk sudah dikirim. <b>Buka WhatsApp</b> dan ketuk link dari DOOZ; aplikasi ini akan terbuka dan kamu langsung
            masuk.
          </p>
        )}
        {status === 'not_member' && (
          <>
            <p className="mdz-muted-light">Nomor ini belum terdaftar sebagai Member DOOZ.</p>
            {onJoin && (
              <Button variant="orange" size="lg" block onClick={onJoin}>
                Jadi Member
              </Button>
            )}
          </>
        )}
        {status === 'expired' && (
          <>
            <p className="mdz-muted-light">Kode masuk sudah kedaluwarsa.</p>
            <Button variant="orange" size="lg" block onClick={() => void start()}>
              Buat kode baru
            </Button>
          </>
        )}
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      {onJoin && status === 'idle' && (
        <p className="mdz-center mdz-muted">
          Belum member?{' '}
          <button type="button" className="mdz-link" onClick={onJoin}>
            Jadi Member
          </button>
        </p>
      )}
    </div>
  )
}

/**
 * App dibuka dari link WhatsApp `?masuk=<token>`: cek dulu tanpa memakai (aman untuk preview link WA),
 * lalu tukar jadi sesi setelah tombol ditekan.
 */
export function MagicView({ token, onSignedIn }: { token: string; onSignedIn?: () => void }) {
  const { client, setView, notify } = useMemberDooz()
  const [info, setInfo] = useState<MagicLinkInfo | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    let active = true
    client
      .inspectMagicLink(token)
      .then((res) => {
        if (!active) return
        if (res.valid === false) setError('Link masuk sudah kedaluwarsa atau sudah dipakai.')
        else setInfo(res)
      })
      .catch(() => active && setError('Link masuk sudah kedaluwarsa atau sudah dipakai.'))
    return () => {
      active = false
    }
  }, [client, token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (info?.requires_name_confirm && fullName.trim().length < 2) return setError('Tulis nama lengkap yang terdaftar.')
    setBusy(true)
    setError('')
    try {
      await client.exchangeMagicLink(token, fullName.trim())
      notify('Kamu masuk sebagai Member DOOZ')
      setView('kartu')
      onSignedIn?.()
    } catch (err) {
      setError(errMsg(err, 'Gagal masuk. Minta link baru lewat WhatsApp.'))
      setBusy(false)
    }
  }

  if (!info && !error) return <Loading />
  return (
    <div className="mdz-stack">
      <section className="mdz-hero">
        {info ? (
          <form onSubmit={submit} noValidate className="mdz-stack">
            <h1 className="mdz-title mdz-title--light">Halo, {info.first_name_masked}!</h1>
            <p className="mdz-muted-light">
              Masuk sebagai Member <b>{info.member_code}</b> di HP ini untuk membuka Kartu Member & Ukuran Saya.
            </p>
            {info.requires_name_confirm && (
              <div className="mdz-panel-light">
                <Field label="Konfirmasi nama lengkap" htmlFor="mdz-magic-name" hint="Untuk keamanan, karena nomor ini lama tidak aktif.">
                  <TextInput id="mdz-magic-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </Field>
              </div>
            )}
            <Button type="submit" variant="orange" size="lg" block disabled={busy}>
              {busy ? <Spinner /> : 'Masuk'}
            </Button>
          </form>
        ) : (
          <>
            <h1 className="mdz-title mdz-title--light">Link tidak berlaku</h1>
            <p className="mdz-muted-light">{error} Minta link baru lewat WhatsApp, ya.</p>
            <Button variant="orange" size="lg" block onClick={() => setView('login')}>
              <WhatsAppIcon /> Masuk lewat WhatsApp
            </Button>
          </>
        )}
      </section>
      {error && info && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

export function DeletedView({ onClose }: { onClose: () => void }) {
  return (
    <div className="mdz-stack">
      <section className="mdz-hero">
        <h1 className="mdz-title mdz-title--light">Data kamu sudah dihapus</h1>
        <p className="mdz-muted-light">
          Profil, Ukuran Saya, riwayat, dan semua sesi Member DOOZ kamu sudah dihapus permanen sesuai UU Pelindungan Data Pribadi.
        </p>
        <Button variant="orange" size="lg" block onClick={onClose}>
          Tutup
        </Button>
      </section>
    </div>
  )
}
