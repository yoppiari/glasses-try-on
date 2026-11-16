#!/usr/bin/env python3
"""E2E Try-On <-> DOOZ CRM preview (setara curl, tanpa browser).
Membuat member uji (nomor fiktif) lewat jalur App Ukur, masuk ke Try-On dengan token serah-terima, mencatat frame
dicoba seperti Try-On, cek Riwayat, cek link lama Try-On, lalu MENGHAPUS data uji (UU PDP).
Secret webhook dibaca dari $CRM_ENV_FILE (default ~/secrets/dooz-crm.env, di luar repo) dan tidak pernah dicetak.
Pakai: python3 scripts/e2e-tryon-crm.py   (opsional CRM=… TRYON=… CRM_ENV_FILE=…)"""
import json, os, random, re, sys, time, urllib.request, urllib.error

CRM = os.environ.get("CRM", "https://dooz-crm-pocco.fural.space")
TRYON = os.environ.get("TRYON", "https://glasses-try-on-pocco.fural.space")
UKUR = "https://ukur-frame-dooz-pocco.fural.space"
env = dict(l.strip().split("=", 1) for l in open(os.path.expanduser(os.environ.get("CRM_ENV_FILE", "~/secrets/dooz-crm.env"))) if "=" in l and not l.startswith("#"))
SECRET, DEVICE = env["FONNTE_WEBHOOK_SECRET"].strip("'\""), env["FONNTE_DEVICE_ID"].strip("'\"")
ok_count = 0

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)

def call(method, path, body=None, token=None, origin=TRYON, extra=None, base=CRM):
    h = {"Content-Type": "application/json"} if body is not None else {}
    h["User-Agent"] = "curl/8.5.0"
    if origin: h["Origin"] = origin
    if token: h["Authorization"] = "Bearer " + token
    h.update(extra or {})
    req = urllib.request.Request(base + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    try:
        with opener.open(req, timeout=20) as r:
            raw, code, hdr = r.read(), r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        raw, code, hdr = e.read(), e.code, dict(e.headers)
    try: data = json.loads(raw or b"{}")
    except Exception: data = {"_raw": raw[:200].decode(errors="replace")}
    return code, data, {k.lower(): v for k, v in hdr.items()}

def check(cond, label, detail=""):
    global ok_count
    if not cond:
        print(f"❌ {label} {detail}"); sys.exit(1)
    ok_count += 1; print(f"✅ {label}")

def webhook(sender, message):
    c, d, _ = call("POST", "/api/webhooks/fonnte/" + SECRET, {"device": DEVICE, "sender": sender, "message": message}, origin=None)
    check(c == 200 and "masuk=" not in json.dumps(d), "webhook WA diterima (respons tanpa magic link)", c)

# --- Try-On: hanya Try-On, link lama dialihkan ---
c, d, h = call("GET", "/", origin=None, base=TRYON)
check(c == 200 and "text/html" in h.get("content-type", ""), "Try-On / → aplikasi Coba Kacamata")
c, d, _ = call("GET", "/healthz", origin=None, base=TRYON)
check(c == 200 and d.get("app") == "tryon", "Try-On server statis (tanpa Customer Hub)")
for path, want in [("/staf/kasir", CRM + "/staf/kasir"), ("/staf/katalog", CRM + "/staf/katalog"), ("/staf", CRM + "/staf/kasir"),
                   ("/?view=kasir", CRM + "/staf/kasir"), ("/kartu-member", UKUR + "/?layar=kartu-member"),
                   ("/kartu-member?token=abc", "/?masuk=abc")]:
    c, _, h = call("GET", path, origin=None, base=TRYON)
    loc = h.get("location", "")
    check(c == 302 and (loc == want or loc.endswith(want)), f"link lama {path} → {want}", f"{c} {loc}")
c, _, h = call("POST", "/api/kasir/lookup-phone", {}, origin=None, base=TRYON)
check(c == 308 and h.get("location", "").startswith(CRM + "/api/kasir/"), "API staf lama di Try-On → 308 ke CRM")

# --- CRM: app tryon terdaftar, magic link → /?masuk= ---
c, d, _ = call("GET", "/api/health", origin=None)
check(c == 200 and any(a["name"] == "tryon" and a["magic_path"] == "/?masuk={token}" for a in d["member_apps"]), "CRM: magic link Try-On → /?masuk={token}")
for path, meth in [("/api/catalog/frames", "GET"), ("/api/portal/me", "GET"), ("/api/capture/events", "POST"), ("/api/auth/whatsapp-login", "POST"), ("/api/auth/handoff/exchange", "POST")]:
    c, _, h = call("OPTIONS", path, extra={"Access-Control-Request-Method": meth, "Access-Control-Request-Headers": "authorization,content-type"})
    check(c in (200, 204) and h.get("access-control-allow-origin") == TRYON, f"CORS {meth} {path} dari Try-On")

# --- Katalog dari CRM ---
c, d, h = call("GET", "/api/catalog/frames")
frames = d.get("frames") or []
check(c == 200 and len(frames) > 0 and h.get("access-control-allow-origin") == TRYON, f"Katalog CRM: {len(frames)} frame aktif untuk Try-On")
sku = frames[-1]["sku"]
c, d, _ = call("GET", "/api/catalog/size-chart")
check(c == 200 and len(d.get("size_chart", [])) == 5, "Katalog CRM: size chart XS–XL")

# --- Member uji (daftar di App Ukur) ---
phone = "08129%07d" % random.randint(0, 9999999)
c, d, _ = call("POST", "/api/capture/identify", {"full_name": "Uji TryOn", "phone": phone, "city_regency": "Kota Surakarta", "consent_crm_wa": True,
    "event_type": "frame_measured", "payload": {"frame_width_mm": 138, "size_category": "M"}, "honeypot": "", "app": "ukur",
    "measurement": {"name": "Utama", "note": "e2e try-on", "frame_width_mm": 138, "source": "self_measure"}}, origin=UKUR)
check(c == 200 and re.match(r"DZ-", d.get("verification_code", "")), "member uji daftar lewat App Ukur", c)
code, poll = d["verification_code"], d["poll_token"]
webhook("62" + phone[1:], "Halo DOOZ, verifikasi hasil ukur saya kode: " + code)
c, d, _ = call("POST", "/api/capture/verification-status", {"verification_code": code, "poll_token": poll}, origin=UKUR)
check(c == 200 and d.get("status") == "verified" and d.get("session_token"), "verifikasi WA → sesi App Ukur")
ukur_tok = d["session_token"]

try:
    # --- Masuk lewat WhatsApp dari Try-On (app=tryon) ---
    c, d, _ = call("POST", "/api/auth/whatsapp-login", {"app": "tryon"})
    check(c == 200 and d.get("login_code") and "wa.me" in d.get("wa_me_url", ""), "Try-On: Masuk lewat WhatsApp → kode masuk")
    webhook("62" + phone[1:], "Halo DOOZ, saya mau masuk Member. Kode: " + d["login_code"])
    c, d2, _ = call("POST", "/api/capture/verification-status", {"verification_code": d["login_code"], "poll_token": d["poll_token"]})
    check(c == 200 and d2.get("status") == "link_sent" and not d2.get("session_token"), "Try-On: link masuk dikirim lewat WA (sesi hanya lewat magic link)")

    # --- Pindah App Ukur → Try-On (login ikut terbawa) ---
    c, d, _ = call("POST", "/api/auth/handoff", {"target_app": "tryon"}, token=ukur_tok, origin=UKUR)
    check(c == 200 and d["url"].startswith(TRYON + "/?handoff="), "App Ukur → Try-On: url tryon/?handoff=")
    c, d, _ = call("POST", "/api/auth/handoff/exchange", {"handoff_token": d["handoff_token"]})
    check(c == 200 and d.get("session_token") and d.get("access_scope") == "full", "Try-On menukar token serah-terima → sesi member")
    tok = d["session_token"]

    c, me, _ = call("GET", "/api/portal/me", token=tok)
    check(c == 200 and me["primary_measurement"]["size_category"] == "M" and me.get("qr_token"), "Try-On: Kartu Member + ukuran utama M (filter Pas untuk kamu)")

    # --- Frame dicoba → Riwayat (sama dengan memberClient.trackEvent di Try-On) ---
    c, d, _ = call("POST", "/api/capture/events", {"event_type": "frame_tried", "payload": {"frame_sku": sku}, "src": "glasses_try_on"}, token=tok)
    check(c in (200, 201), f"Try-On: catat frame dicoba {sku}", c)
    c, d, _ = call("GET", "/api/portal/frames-tried?limit=5", token=tok)
    tried = d.get("tried_frames") or []
    check(c == 200 and tried and tried[0]["payload"]["frame_sku"] == sku and tried[0]["payload"].get("frame_name") and tried[0].get("src") == "glasses_try_on",
          "Riwayat: frame dicoba tercatat (nama frame dilengkapi dari Katalog)")
    c, d, _ = call("GET", "/api/portal/frames-tried?limit=5", token=ukur_tok, origin=UKUR)
    check(c == 200 and any(t["payload"]["frame_sku"] == sku for t in d.get("tried_frames", [])), "Riwayat yang sama terlihat dari App Ukur")
    c, _, _ = call("POST", "/api/capture/events", {"event_type": "frame_tried", "payload": {"frame_sku": sku}}, origin=TRYON)
    check(c in (400, 401, 403), "tanpa sesi member: frame dicoba tidak tercatat", c)

    # --- Try-On → App Ukur ("Ukur lagi" / Aplikasi DOOZ lain) ---
    c, d, _ = call("POST", "/api/auth/handoff", {"target_app": "ukur"}, token=tok)
    check(c == 200 and d["url"].startswith(UKUR + "/?handoff="), "Try-On → App Ukur: url ukur/?handoff=")
finally:
    c, d, _ = call("POST", "/api/portal/privacy/delete", {"immediate": True}, token=ukur_tok, origin=UKUR)
    check(c == 200, "Hapus semua data uji (UU PDP) → 200")
c, _, _ = call("GET", "/api/portal/me", token=tok)
check(c == 401, "setelah hapus data: sesi Try-On 401")
print(f"\nE2E Try-On ↔ DOOZ CRM: {ok_count} cek lulus ({time.strftime('%Y-%m-%d %H:%M:%S')}), data uji sudah dihapus.")
