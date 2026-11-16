package hub

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

type ukuranEnv struct {
	t      *testing.T
	now    *time.Time
	store  *Store
	fonnte *FonnteAdapter
	queue  *ReplyQueue
	ts     *httptest.Server
	path   string
}

const ukuranWebhookSecret = "sec-ukuran"
const ukuranDevice = "DOOZ-DEV-UKUR"

func newUkuranEnv(t *testing.T) *ukuranEnv {
	t.Helper()
	now := time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)
	env := &ukuranEnv{t: t, now: &now}
	signer := NewSecuritySigner("test-ukuran-secret")
	env.path = t.TempDir() + "/hub.json"
	store, err := NewStore(env.path, signer)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	env.store = store
	env.fonnte = NewFonnteAdapter("mock", ukuranDevice)
	env.queue = NewReplyQueue(env.fonnte, time.Millisecond, 2*time.Millisecond)
	t.Cleanup(env.queue.Close)
	srv := NewServer(ServerConfig{
		Store:            store,
		Signer:           signer,
		WAProvider:       env.fonnte,
		ReplyQueue:       env.queue,
		WebhookSecret:    ukuranWebhookSecret,
		FonnteDeviceID:   ukuranDevice,
		OfficialWANumber: "6281122334455",
		PortalBaseURL:    "https://glasses-try-on-pocco.fural.space",
		UkurAppURL:       "https://ukur-frame-dooz-pocco.fural.space",
		WebhookRateLimit: 50,
		RateLimitWindow:  time.Minute,
		Clock:            func() time.Time { return *env.now },
	})
	env.ts = httptest.NewServer(srv.Handler())
	t.Cleanup(env.ts.Close)
	return env
}

func (e *ukuranEnv) do(method, path string, payload any, token string) (int, string) {
	e.t.Helper()
	headers := map[string]string{}
	if token != "" {
		headers["Authorization"] = "Bearer " + token
	}
	resp, body := doJSONRequest(e.t, e.ts.URL+path, method, payload, headers)
	return resp.StatusCode, body
}

func (e *ukuranEnv) staff(method, path string, payload any, role string) (int, string) {
	e.t.Helper()
	resp, body := doJSONRequest(e.t, e.ts.URL+path, method, payload, map[string]string{
		"X-Staff-User-ID":   "staff-" + role,
		"X-Staff-Role":      role,
		"X-Staff-Outlet-ID": "outlet-solo",
	})
	return resp.StatusCode, body
}

func (e *ukuranEnv) webhook(sender, message string) string {
	e.t.Helper()
	code, body := e.do(http.MethodPost, "/api/webhooks/fonnte/"+ukuranWebhookSecret, map[string]any{
		"device": ukuranDevice, "sender": sender, "message": message,
	}, "")
	if code != http.StatusOK {
		e.t.Fatalf("webhook status %d: %s", code, body)
	}
	if strings.Contains(body, "token=") || strings.Contains(body, "masuk=") {
		e.t.Fatalf("webhook HTTP response must never contain a magic link: %s", body)
	}
	return body
}

func (e *ukuranEnv) lastWA() string {
	e.t.Helper()
	if !e.queue.Flush(2 * time.Second) {
		e.t.Fatalf("reply queue flush timeout")
	}
	sent := e.fonnte.SentMessages()
	if len(sent) == 0 {
		e.t.Fatalf("expected a WhatsApp reply")
	}
	return sent[len(sent)-1].Message
}

type identifyRes struct {
	ContactID        string              `json:"contact_id"`
	VerificationCode string              `json:"verification_code"`
	PollToken        string              `json:"poll_token"`
	Measurement      *MeasurementPreview `json:"measurement"`
}

func (e *ukuranEnv) identify(name, phone string, measurement map[string]any) identifyRes {
	e.t.Helper()
	req := map[string]any{
		"full_name":      name,
		"phone":          phone,
		"city_regency":   "Kota Surakarta",
		"event_type":     EventFrameMeasured,
		"payload":        map[string]any{"frame_width_mm": measurement["frame_width_mm"]},
		"consent_crm_wa": true,
		"app":            "ukur",
	}
	if measurement != nil {
		req["measurement"] = measurement
	}
	code, body := e.do(http.MethodPost, "/api/capture/identify", req, "")
	if code != http.StatusOK {
		e.t.Fatalf("identify status %d: %s", code, body)
	}
	var res identifyRes
	_ = json.Unmarshal([]byte(body), &res)
	if res.PollToken == "" || !strings.HasPrefix(res.VerificationCode, "DZ-") {
		e.t.Fatalf("identify must return DZ code + poll_token: %s", body)
	}
	return res
}

func (e *ukuranEnv) poll(code, pollToken string) (int, VerificationStatusResult) {
	e.t.Helper()
	status, body := e.do(http.MethodPost, "/api/capture/verification-status", map[string]any{
		"verification_code": code, "poll_token": pollToken,
	}, "")
	var res VerificationStatusResult
	_ = json.Unmarshal([]byte(body), &res)
	return status, res
}

// registerMember menjalankan alur App Ukur lengkap: identify -> WA DZ-xxxx -> polling -> sesi.
func (e *ukuranEnv) registerMember(name, phone string, widthMM float64) (string, VerificationStatusResult) {
	e.t.Helper()
	idRes := e.identify(name, phone, map[string]any{"name": "Kerja", "note": "nyaman seharian", "frame_width_mm": widthMM})
	e.webhook(phone, "Halo DOOZ, verifikasi hasil ukur saya kode: "+idRes.VerificationCode)
	status, res := e.poll(idRes.VerificationCode, idRes.PollToken)
	if status != http.StatusOK || res.Status != "verified" || res.SessionToken == "" {
		e.t.Fatalf("expected verified poll with session, got %d %+v", status, res)
	}
	return res.SessionToken, res
}

func (e *ukuranEnv) list(token string) []Measurement {
	e.t.Helper()
	code, body := e.do(http.MethodGet, "/api/portal/measurements", nil, token)
	if code != http.StatusOK {
		e.t.Fatalf("list status %d: %s", code, body)
	}
	var res struct {
		Measurements []Measurement `json:"measurements"`
	}
	_ = json.Unmarshal([]byte(body), &res)
	return res.Measurements
}

func countPrimary(list []Measurement) (int, string) {
	n, id := 0, ""
	for _, m := range list {
		if m.IsPrimary {
			n++
			id = m.ID
		}
	}
	return n, id
}

func (e *ukuranEnv) assertSinglePrimary(token, wantID string) {
	e.t.Helper()
	list := e.list(token)
	n, id := countPrimary(list)
	if n != 1 {
		e.t.Fatalf("expected exactly one primary measurement, got %d: %+v", n, list)
	}
	if wantID != "" && id != wantID {
		e.t.Fatalf("expected primary %s, got %s", wantID, id)
	}
	if !list[0].IsPrimary {
		e.t.Fatalf("primary measurement must be listed first: %+v", list)
	}
}

func TestParseTempleLabel(t *testing.T) {
	for _, label := range []string{"52□18-140", "52-18-140", "52 18 140", "52x18-140", "52[]18-140", " 52 □ 18 - 140 "} {
		lens, bridge, temple, err := ParseTempleLabel(label)
		if err != nil || lens != 52 || bridge != 18 || temple != 140 {
			t.Fatalf("ParseTempleLabel(%q) = %v %v %v %v", label, lens, bridge, temple, err)
		}
	}
	for _, bad := range []string{"", "abc", "52", "52□18"} {
		if _, _, _, err := ParseTempleLabel(bad); err == nil {
			t.Fatalf("expected error for %q", bad)
		}
	}
	if got := FrameWidthFromTempleLabel(52, 18); got != 132 {
		t.Fatalf("FrameWidthFromTempleLabel(52,18) = %v, want 132", got)
	}
}

func TestUkuranSayaRegistrationPollingAndCRUD(t *testing.T) {
	env := newUkuranEnv(t)

	// CORS preflight dari App Ukur.
	req, _ := http.NewRequest(http.MethodOptions, env.ts.URL+"/api/portal/measurements/abc", nil)
	req.Header.Set("Origin", "https://ukur-frame-dooz-pocco.fural.space")
	req.Header.Set("Access-Control-Request-Method", "PATCH")
	req.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("preflight: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent || resp.Header.Get("Access-Control-Allow-Origin") == "" ||
		!strings.Contains(resp.Header.Get("Access-Control-Allow-Methods"), "PATCH") ||
		!strings.Contains(resp.Header.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("CORS preflight from App Ukur not allowed: %d %v", resp.StatusCode, resp.Header)
	}

	// Identify membawa ukuran; kategori dihitung server (klien kirim kategori salah "XL").
	idRes := env.identify("Rina Kartika", "081234500001", map[string]any{
		"name": "Kerja", "note": "nyaman seharian", "frame_width_mm": 136, "size_category": "XL",
	})
	if idRes.Measurement == nil || idRes.Measurement.SizeCategory != "M" || idRes.Measurement.Name != "Kerja" {
		t.Fatalf("expected measurement preview M from SSOT size chart, got %+v", idRes.Measurement)
	}

	// Identify dengan ukuran tidak valid ditolak.
	if code, body := env.do(http.MethodPost, "/api/capture/identify", map[string]any{
		"full_name": "X", "phone": "081234500009", "city_regency": "Solo",
		"measurement": map[string]any{"frame_width_mm": 20},
	}, ""); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid measurement, got %d %s", code, body)
	}

	// Polling: poll_token salah -> 404 seragam; benar -> pending.
	if code, res := env.poll(idRes.VerificationCode, "wrong-token"); code != http.StatusNotFound || res.SessionToken != "" {
		t.Fatalf("expected 404 for wrong poll token, got %d %+v", code, res)
	}
	if code, res := env.poll(idRes.VerificationCode, idRes.PollToken); code != http.StatusOK || res.Status != "pending" || res.ExpiresAt == nil {
		t.Fatalf("expected pending, got %d %+v", code, res)
	}
	// Ukuran belum tersimpan sebelum verifikasi WA.
	env.store.mu.RLock()
	if n := len(env.store.data.Measurements); n != 0 {
		env.store.mu.RUnlock()
		t.Fatalf("measurement must not be saved before WA verification, got %d", n)
	}
	env.store.mu.RUnlock()

	// Verifikasi WA -> polling pertama mendapat sesi + ukuran utama.
	env.webhook("081234500001", "Halo DOOZ, verifikasi hasil ukur saya kode: "+idRes.VerificationCode)
	reply := env.lastWA()
	if !strings.Contains(reply, "https://glasses-try-on-pocco.fural.space/kartu-member?token=") || !strings.Contains(reply, "M · 136 mm (Kerja)") {
		t.Fatalf("new member WA reply must link Kartu Member + primary size: %s", reply)
	}
	code, verified := env.poll(idRes.VerificationCode, idRes.PollToken)
	if code != http.StatusOK || verified.Status != "verified" || verified.SessionToken == "" || verified.AccessScope != AccessScopeFull {
		t.Fatalf("expected verified + session, got %d %+v", code, verified)
	}
	pm := verified.PrimaryMeasurement
	if pm == nil || !pm.IsPrimary || pm.Name != "Kerja" || pm.Note != "nyaman seharian" || pm.SizeCategory != "M" ||
		pm.FrameWidthMM != 136 || pm.Source != MeasurementSourceSelfMeasure || pm.Comfort != nil {
		t.Fatalf("unexpected primary measurement: %+v", pm)
	}
	// Sesi dari polling hanya diberikan sekali.
	if _, again := env.poll(idRes.VerificationCode, idRes.PollToken); again.SessionToken != "" || !again.SessionClaimed {
		t.Fatalf("poll session must be single-use, got %+v", again)
	}
	tok := verified.SessionToken

	// Tanpa sesi -> 401.
	if code, _ := env.do(http.MethodGet, "/api/portal/measurements", nil, ""); code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without session, got %d", code)
	}

	// CREATE: input angka gagang 52□18-140 -> 132 mm -> S, bukan utama.
	*env.now = env.now.Add(time.Minute)
	code, body := env.do(http.MethodPost, "/api/portal/measurements", map[string]any{
		"name": "Baca", "temple_label": "52□18-140", "comfort": "kurang_nyaman",
	}, tok)
	if code != http.StatusCreated {
		t.Fatalf("create temple_label status %d: %s", code, body)
	}
	var created struct {
		Measurement Measurement `json:"measurement"`
	}
	_ = json.Unmarshal([]byte(body), &created)
	baca := created.Measurement
	if baca.Source != MeasurementSourceTempleLabel || baca.FrameWidthMM != 132 || baca.SizeCategory != "S" ||
		baca.LensMM == nil || *baca.LensMM != 52 || baca.BridgeMM == nil || *baca.BridgeMM != 18 ||
		baca.TempleMM == nil || *baca.TempleMM != 140 || baca.IsPrimary || baca.Comfort == nil || *baca.Comfort != ComfortKurangNyaman {
		t.Fatalf("unexpected temple_label measurement: %+v", baca)
	}

	// CREATE: ukur lagi (self_measure) dengan set_primary -> jadi utama, utama lama dilepas.
	*env.now = env.now.Add(time.Minute)
	code, body = env.do(http.MethodPost, "/api/portal/measurements", map[string]any{
		"name": "Sunglasses", "frame_width_mm": 142.36, "set_primary": true,
	}, tok)
	if code != http.StatusCreated {
		t.Fatalf("create self_measure status %d: %s", code, body)
	}
	_ = json.Unmarshal([]byte(body), &created)
	sun := created.Measurement
	if !sun.IsPrimary || sun.SizeCategory != "L" || sun.FrameWidthMM != 142.4 {
		t.Fatalf("unexpected self_measure measurement: %+v", sun)
	}
	env.assertSinglePrimary(tok, sun.ID)
	if len(env.list(tok)) != 3 {
		t.Fatalf("expected 3 measurements")
	}

	// CREATE tidak valid.
	for _, bad := range []map[string]any{
		{"frame_width_mm": 136, "source": "outlet"},      // member tidak boleh klaim diukur di outlet
		{"frame_width_mm": 300},                          // di luar rentang
		{"temple_label": "abc"},                          // format gagang salah
		{"frame_width_mm": 136, "comfort": "luar_biasa"}, // comfort tidak dikenal
		{"source": "temple_label", "lens_mm": 52},        // butuh bridge_mm
	} {
		if code, body := env.do(http.MethodPost, "/api/portal/measurements", bad, tok); code != http.StatusBadRequest {
			t.Fatalf("expected 400 for %v, got %d %s", bad, code, body)
		}
	}

	// SET PRIMARY -> tepat satu utama.
	if code, body := env.do(http.MethodPost, "/api/portal/measurements/"+baca.ID+"/primary", nil, tok); code != http.StatusOK {
		t.Fatalf("set primary status %d: %s", code, body)
	}
	env.assertSinglePrimary(tok, baca.ID)
	// Set primary dua kali tetap satu utama.
	env.do(http.MethodPost, "/api/portal/measurements/"+baca.ID+"/primary", nil, tok)
	env.assertSinglePrimary(tok, baca.ID)

	// UPDATE nama / catatan / comfort.
	code, body = env.do(http.MethodPatch, "/api/portal/measurements/"+baca.ID, map[string]any{
		"name": "Kacamata baca", "note": "untuk malam", "comfort": "pas_nyaman",
	}, tok)
	if code != http.StatusOK {
		t.Fatalf("patch status %d: %s", code, body)
	}
	_ = json.Unmarshal([]byte(body), &created)
	if created.Measurement.Name != "Kacamata baca" || created.Measurement.Note != "untuk malam" ||
		created.Measurement.Comfort == nil || *created.Measurement.Comfort != ComfortPasNyaman || created.Measurement.FrameWidthMM != 132 {
		t.Fatalf("unexpected patched measurement: %+v", created.Measurement)
	}
	// comfort null -> kosong.
	code, body = env.do(http.MethodPatch, "/api/portal/measurements/"+baca.ID, map[string]any{"comfort": nil}, tok)
	_ = json.Unmarshal([]byte(body), &created)
	if code != http.StatusOK || created.Measurement.Comfort != nil || !strings.Contains(body, `"comfort":null`) {
		t.Fatalf("expected comfort cleared, got %d %s", code, body)
	}
	for _, bad := range []map[string]any{{"comfort": "wow"}, {"name": ""}, {"frame_width_mm": 150}, {"is_primary": true}} {
		if code, body := env.do(http.MethodPatch, "/api/portal/measurements/"+baca.ID, bad, tok); code != http.StatusBadRequest {
			t.Fatalf("expected 400 for patch %v, got %d %s", bad, code, body)
		}
	}

	// Member lain tidak bisa melihat / mengubah / menghapus ukuran milik Rina.
	otherTok, _ := env.registerMember("Budi Santoso", "081234500002", 130)
	if code, _ := env.do(http.MethodPatch, "/api/portal/measurements/"+baca.ID, map[string]any{"name": "hack"}, otherTok); code != http.StatusNotFound {
		t.Fatalf("expected 404 when patching another member's measurement, got %d", code)
	}
	if code, _ := env.do(http.MethodDelete, "/api/portal/measurements/"+baca.ID, nil, otherTok); code != http.StatusNotFound {
		t.Fatalf("expected 404 when deleting another member's measurement, got %d", code)
	}
	if code, _ := env.do(http.MethodPost, "/api/portal/measurements/"+baca.ID+"/primary", nil, otherTok); code != http.StatusNotFound {
		t.Fatalf("expected 404 when setting primary on another member's measurement, got %d", code)
	}
	if len(env.list(otherTok)) != 1 {
		t.Fatalf("other member must only see their own measurement")
	}

	// DELETE ukuran utama -> ukuran terbaru yang tersisa (Sunglasses) otomatis jadi utama.
	code, body = env.do(http.MethodDelete, "/api/portal/measurements/"+baca.ID, nil, tok)
	if code != http.StatusOK || !strings.Contains(body, sun.ID) {
		t.Fatalf("delete primary status %d: %s", code, body)
	}
	env.assertSinglePrimary(tok, sun.ID)
	if code, _ := env.do(http.MethodDelete, "/api/portal/measurements/"+baca.ID, nil, tok); code != http.StatusNotFound {
		t.Fatalf("expected 404 deleting already-deleted measurement, got %d", code)
	}

	// Kartu Member (portal/me) menampilkan ukuran utama + daftar.
	code, body = env.do(http.MethodGet, "/api/portal/me", nil, tok)
	var view MemberPortalView
	_ = json.Unmarshal([]byte(body), &view)
	if code != http.StatusOK || view.PrimaryMeasurement == nil || view.PrimaryMeasurement.ID != sun.ID ||
		view.PrimarySizeCategory != "L" || len(view.Measurements) != 2 {
		t.Fatalf("portal/me must show primary measurement & list, got %d %+v", code, view)
	}

	// Hapus semua -> daftar kosong, tidak ada utama.
	for _, m := range env.list(tok) {
		env.do(http.MethodDelete, "/api/portal/measurements/"+m.ID, nil, tok)
	}
	if n, _ := countPrimary(env.list(tok)); n != 0 || len(env.list(tok)) != 0 {
		t.Fatalf("expected empty list after deleting all")
	}
}

func TestUkuranSayaLimitAndRestrictedScope(t *testing.T) {
	env := newUkuranEnv(t)
	tok, _ := env.registerMember("Sari Dewi", "081234500003", 128)
	for i := 1; i < MaxMeasurementsPerMember; i++ {
		if code, body := env.do(http.MethodPost, "/api/portal/measurements", map[string]any{"frame_width_mm": 130 + i%10}, tok); code != http.StatusCreated {
			t.Fatalf("create #%d status %d: %s", i, code, body)
		}
	}
	if code, _ := env.do(http.MethodPost, "/api/portal/measurements", map[string]any{"frame_width_mm": 135}, tok); code != http.StatusConflict {
		t.Fatalf("expected 409 when exceeding measurement limit, got %d", code)
	}
	env.assertSinglePrimary(tok, "")

	// Sesi basic_recycled_pending (nomor >6 bulan pasif, nama belum dikonfirmasi) tidak boleh akses Ukuran Saya.
	*env.now = env.now.Add(200 * 24 * time.Hour)
	env.webhook("081234500003", "MASUK")
	m := regexp.MustCompile(`token=([a-f0-9]+)`).FindStringSubmatch(env.lastWA())
	code, body := env.do(http.MethodPost, "/api/auth/magic-exchange", map[string]any{"token": m[1]}, "")
	var exch struct {
		SessionToken string `json:"session_token"`
		AccessScope  string `json:"access_scope"`
	}
	_ = json.Unmarshal([]byte(body), &exch)
	if code != http.StatusOK || exch.AccessScope != AccessScopeBasicRecycledPending {
		t.Fatalf("expected restricted session, got %d %s", code, body)
	}
	if code, _ := env.do(http.MethodGet, "/api/portal/measurements", nil, exch.SessionToken); code != http.StatusForbidden {
		t.Fatalf("expected 403 for restricted session, got %d", code)
	}
	code, body = env.do(http.MethodGet, "/api/portal/me", nil, exch.SessionToken)
	if code != http.StatusOK || strings.Contains(body, `"measurements"`) || strings.Contains(body, `"primary_measurement"`) {
		t.Fatalf("restricted portal view must hide measurement list: %s", body)
	}
}

func TestKasirLevel1Level2MeasurementAccess(t *testing.T) {
	env := newUkuranEnv(t)
	tok, _ := env.registerMember("Dewi Lestari", "081234500004", 136)
	env.do(http.MethodPost, "/api/portal/measurements", map[string]any{"name": "Rahasia baca", "note": "catatan pribadi", "temple_label": "50□17-135"}, tok)

	// Level 1 (nomor lengkap): hanya kategori ukuran utama.
	code, body := env.staff(http.MethodPost, "/api/kasir/lookup-phone", map[string]any{"phone": "081234500004"}, RoleKasir)
	if code != http.StatusOK {
		t.Fatalf("level 1 status %d: %s", code, body)
	}
	var lvl1 map[string]any
	_ = json.Unmarshal([]byte(body), &lvl1)
	pm, _ := lvl1["primary_measurement"].(map[string]any)
	if pm == nil || pm["size_category"] != "M" || len(pm) != 1 {
		t.Fatalf("level 1 must expose only primary size category, got %s", body)
	}
	for _, forbidden := range []string{"frame_width_mm", "136", "Kerja", "Rahasia baca", "catatan pribadi", "nyaman seharian", `"measurements"`, "lens_mm", "Kota Surakarta"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("level 1 response leaks %q: %s", forbidden, body)
		}
	}

	// Role tanpa hak (host) ditolak di Level 1 & Level 2.
	if code, _ := env.staff(http.MethodPost, "/api/kasir/lookup-phone", map[string]any{"phone": "081234500004"}, RoleHost); code != http.StatusForbidden {
		t.Fatalf("expected 403 for host role level 1, got %d", code)
	}

	// Level 2 (scan QR dinamis): ukuran utama + daftar ukuran.
	code, body = env.do(http.MethodGet, "/api/portal/me", nil, tok)
	var view MemberPortalView
	_ = json.Unmarshal([]byte(body), &view)
	if view.QRToken == "" {
		t.Fatalf("expected QR token in portal view: %s", body)
	}
	if code, _ := env.staff(http.MethodPost, "/api/kasir/scan-qr", map[string]any{"qr_token": view.QRToken}, RoleHost); code != http.StatusForbidden {
		t.Fatalf("expected 403 for host role level 2, got %d", code)
	}
	code, body = env.staff(http.MethodPost, "/api/kasir/scan-qr", map[string]any{"qr_token": view.QRToken}, RoleKasir)
	if code != http.StatusOK {
		t.Fatalf("level 2 status %d: %s", code, body)
	}
	var lvl2 KasirLevel2Response
	_ = json.Unmarshal([]byte(body), &lvl2)
	if lvl2.PrimaryMeasurement == nil || lvl2.PrimaryMeasurement.Name != "Kerja" || lvl2.PrimaryMeasurement.FrameWidthMM != 136 || len(lvl2.Measurements) != 2 {
		t.Fatalf("level 2 must show primary measurement + full list, got %s", body)
	}

	// Level 2 action frame_measured -> masuk "Ukuran Saya" dengan source=outlet (bukan utama).
	code, body = env.staff(http.MethodPost, "/api/kasir/level2-action", map[string]any{
		"qr_token": view.QRToken, "event_type": EventFrameMeasured,
		"payload": map[string]any{"frame_width_mm": 141, "bridge_mm": 19},
	}, RoleKasir)
	if code != http.StatusOK {
		t.Fatalf("level2 action status %d: %s", code, body)
	}
	list := env.list(tok)
	var outlet *Measurement
	for i := range list {
		if list[i].Source == MeasurementSourceOutlet {
			outlet = &list[i]
		}
	}
	if len(list) != 3 || outlet == nil || outlet.IsPrimary || outlet.SizeCategory != "L" || outlet.Name != "Diukur di outlet" {
		t.Fatalf("expected outlet measurement added (non-primary), got %+v", list)
	}
	env.assertSinglePrimary(tok, lvl2.PrimaryMeasurement.ID)

	// Audit log tetap mencatat akses Level 1 & Level 2.
	_, audit := env.staff(http.MethodGet, "/api/admin/audit-logs", nil, RoleOwner)
	for _, want := range []string{"kasir_lookup_phone", AuditLevel1Lookup, "kasir_scan_qr_level2", AuditLevel2QR, "kasir_level2_frame_measured"} {
		if !strings.Contains(audit, want) {
			t.Fatalf("audit log missing %q: %s", want, audit)
		}
	}
}

func TestDeleteDataCascadesAllMeasurements(t *testing.T) {
	env := newUkuranEnv(t)
	tok, verified := env.registerMember("Hapus Saya", "081234500005", 134)
	env.do(http.MethodPost, "/api/portal/measurements", map[string]any{"frame_width_mm": 140}, tok)
	keepTok, _ := env.registerMember("Tetap Ada", "081234500006", 129)

	// Kode login WA yang sudah dipakai juga ikut terhapus.
	_, body := env.do(http.MethodPost, "/api/auth/whatsapp-login", map[string]any{"app": "ukur"}, "")
	var login WhatsAppLoginResult
	_ = json.Unmarshal([]byte(body), &login)
	env.webhook("081234500005", "Halo DOOZ, saya mau masuk Member. Kode: "+login.LoginCode)

	contact, _ := env.store.GetContactByID(verified.PrimaryMeasurement.CustomerID)
	if contact == nil {
		t.Fatalf("contact missing")
	}
	if code, body := env.do(http.MethodPost, "/api/portal/privacy/delete", map[string]any{"immediate": true}, tok); code != http.StatusOK {
		t.Fatalf("delete data status %d: %s", code, body)
	}

	env.store.mu.RLock()
	for _, m := range env.store.data.Measurements {
		if m.CustomerID == contact.ID {
			env.store.mu.RUnlock()
			t.Fatalf("measurement %s survived UU PDP deletion", m.ID)
		}
	}
	for _, lr := range env.store.data.LoginRequests {
		if lr.VerifiedContactID == contact.ID {
			env.store.mu.RUnlock()
			t.Fatalf("login request survived UU PDP deletion")
		}
	}
	for _, vc := range env.store.data.VerificationCodes {
		if vc.ContactID == contact.ID || vc.VerifiedContactID == contact.ID {
			env.store.mu.RUnlock()
			t.Fatalf("verification code survived UU PDP deletion")
		}
	}
	env.store.mu.RUnlock()

	// Tersimpan ke disk: muat ulang store dan pastikan ukuran tidak kembali.
	raw, _ := os.ReadFile(env.path)
	if strings.Contains(string(raw), contact.ID) {
		t.Fatalf("persisted store still references deleted contact")
	}
	if code, _ := env.do(http.MethodGet, "/api/portal/measurements", nil, tok); code != http.StatusUnauthorized {
		t.Fatalf("deleted member session must be invalid, got %d", code)
	}
	if len(env.list(keepTok)) != 1 {
		t.Fatalf("other member's measurements must be untouched")
	}

	// Retensi otomatis (>24 bulan pasif) juga menghapus ukuran.
	*env.now = env.now.Add(800 * 24 * time.Hour)
	if code, body := env.staff(http.MethodPost, "/api/admin/retention/purge", nil, RoleOwner); code != http.StatusOK {
		t.Fatalf("purge status %d: %s", code, body)
	}
	env.store.mu.RLock()
	defer env.store.mu.RUnlock()
	if n := len(env.store.data.Measurements); n != 0 {
		t.Fatalf("retention purge must delete measurements, %d left", n)
	}
}

func TestWhatsAppLoginFromOtherPhone(t *testing.T) {
	env := newUkuranEnv(t)
	env.registerMember("Andi Wijaya", "081234500007", 137)

	code, body := env.do(http.MethodPost, "/api/auth/whatsapp-login", map[string]any{"app": "ukur"}, "")
	var login WhatsAppLoginResult
	_ = json.Unmarshal([]byte(body), &login)
	if code != http.StatusOK || !strings.HasPrefix(login.LoginCode, "DZ-") || login.PollToken == "" ||
		!strings.Contains(login.WAMeURL, "wa.me/6281122334455?text=") || !strings.Contains(login.WAMeURL, login.LoginCode) {
		t.Fatalf("unexpected whatsapp-login response %d: %s", code, body)
	}
	if _, st := env.poll(login.LoginCode, login.PollToken); st.Kind != "login" || st.Status != "pending" {
		t.Fatalf("expected pending login, got %+v", st)
	}

	env.webhook("081234500007", "Halo DOOZ, saya mau masuk Member. Kode: "+login.LoginCode)
	reply := env.lastWA()
	m := regexp.MustCompile(`https://ukur-frame-dooz-pocco\.fural\.space/\?masuk=([a-f0-9]+)`).FindStringSubmatch(reply)
	if len(m) != 2 || !strings.Contains(reply, "M · 137 mm") {
		t.Fatalf("login reply must contain App Ukur magic link + primary size: %s", reply)
	}
	code, st := env.poll(login.LoginCode, login.PollToken)
	if code != http.StatusOK || st.Status != "link_sent" || st.SessionToken != "" {
		t.Fatalf("login poll must report link_sent without session, got %d %+v", code, st)
	}

	// Magic link yang sudah ada: GET tidak memakai token, POST menukar sekali.
	if code, _ := env.do(http.MethodGet, "/api/auth/magic-verify?token="+m[1], nil, ""); code != http.StatusOK {
		t.Fatalf("magic-verify failed %d", code)
	}
	code, body = env.do(http.MethodPost, "/api/auth/magic-exchange", map[string]any{"token": m[1]}, "")
	var exch struct {
		SessionToken string `json:"session_token"`
	}
	_ = json.Unmarshal([]byte(body), &exch)
	if code != http.StatusOK || exch.SessionToken == "" {
		t.Fatalf("magic exchange failed %d %s", code, body)
	}
	if list := env.list(exch.SessionToken); len(list) != 1 || list[0].FrameWidthMM != 137 {
		t.Fatalf("logged-in member must see their measurements: %+v", list)
	}
	if code, _ := env.do(http.MethodPost, "/api/auth/magic-exchange", map[string]any{"token": m[1]}, ""); code != http.StatusUnauthorized {
		t.Fatalf("magic link must stay single-use, got %d", code)
	}
	// Kode login sekali pakai: kirim ulang tidak membalas lagi.
	before := len(env.fonnte.SentMessages())
	env.webhook("081234500007", login.LoginCode)
	env.queue.Flush(time.Second)
	if len(env.fonnte.SentMessages()) != before {
		t.Fatalf("login code must be single-use")
	}

	// Nomor yang belum member -> balasan "belum terdaftar", status not_member.
	_, body = env.do(http.MethodPost, "/api/auth/whatsapp-login", map[string]any{}, "")
	_ = json.Unmarshal([]byte(body), &login)
	env.webhook("081299990000", login.LoginCode)
	if reply := env.lastWA(); !strings.Contains(reply, "belum terdaftar") || strings.Contains(reply, "token=") || strings.Contains(reply, "masuk=") {
		t.Fatalf("unexpected not-member reply: %s", reply)
	}
	if _, st := env.poll(login.LoginCode, login.PollToken); st.Status != "not_member" {
		t.Fatalf("expected not_member, got %+v", st)
	}

	// Kode login kedaluwarsa.
	_, body = env.do(http.MethodPost, "/api/auth/whatsapp-login", map[string]any{"app": "ukur"}, "")
	_ = json.Unmarshal([]byte(body), &login)
	*env.now = env.now.Add(WhatsAppLoginTTL + time.Minute)
	if _, st := env.poll(login.LoginCode, login.PollToken); st.Status != "expired" {
		t.Fatalf("expected expired login, got %+v", st)
	}
}

func TestExistingMemberReRegisterAddsMeasurementWithoutPollSession(t *testing.T) {
	env := newUkuranEnv(t)
	tok, first := env.registerMember("Lina Marlina", "081234500008", 133)

	// Member lama mengisi formulir lagi dari HP baru (App Ukur) dengan ukuran baru.
	idRes := env.identify("Lina Marlina", "081234500008", map[string]any{"name": "Harian", "frame_width_mm": 139})
	env.webhook("081234500008", idRes.VerificationCode)
	reply := env.lastWA()
	if !strings.Contains(reply, "https://ukur-frame-dooz-pocco.fural.space/?masuk=") {
		t.Fatalf("existing member re-register from App Ukur must get App Ukur magic link: %s", reply)
	}
	code, st := env.poll(idRes.VerificationCode, idRes.PollToken)
	if code != http.StatusOK || st.Status != "verified" || !st.ExistingMember || !st.LoginRequired || st.SessionToken != "" {
		t.Fatalf("existing member poll must not hand out a session, got %d %+v", code, st)
	}
	list := env.list(tok)
	if len(list) != 2 {
		t.Fatalf("expected new measurement added to existing member, got %+v", list)
	}
	env.assertSinglePrimary(tok, first.PrimaryMeasurement.ID)
}

func TestVerifiedAccountNotHijackedByTypedNumber(t *testing.T) {
	env := newUkuranEnv(t)
	victimTok, victim := env.registerMember("Korban Asli", "081234511111", 135)

	// Penyerang mengetik nomor korban di formulir, lalu mengirim DZ-xxxx dari nomornya sendiri.
	idRes := env.identify("Penyerang", "081234511111", map[string]any{"name": "Punya penyerang", "frame_width_mm": 150})
	env.webhook("081234522222", idRes.VerificationCode)
	reply := env.lastWA()
	code, st := env.poll(idRes.VerificationCode, idRes.PollToken)
	if code != http.StatusOK || st.SessionToken == "" {
		t.Fatalf("attacker should get a session for THEIR OWN new account, got %d %+v", code, st)
	}
	if st.MemberCode == victim.MemberCode || strings.Contains(reply, victim.MemberCode) {
		t.Fatalf("attacker must not receive the victim's member account")
	}
	victimContact, err := env.store.GetContactByID(victim.PrimaryMeasurement.CustomerID)
	if err != nil || victimContact.PhoneNormalized != "6281234511111" {
		t.Fatalf("victim account must keep its phone number, got %+v %v", victimContact, err)
	}
	if list := env.list(victimTok); len(list) != 1 || list[0].Name != "Kerja" {
		t.Fatalf("victim measurements must be untouched: %+v", list)
	}
	if list := env.list(st.SessionToken); len(list) != 1 || list[0].Name != "Punya penyerang" || list[0].SizeCategory != "XL" {
		t.Fatalf("attacker's measurement must go to their own account: %+v", list)
	}
}

func TestStoreRepairsPrimaryInvariantOnLoad(t *testing.T) {
	path := t.TempDir() + "/hub.json"
	store, _ := NewStore(path, nil)
	now := time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)
	store.mu.Lock()
	store.data.Contacts["c1"] = &Contact{ID: "c1", MemberCode: "DOOZ-00001", PhoneNormalized: "6281200000001", VerificationStatus: StatusVerified, LastActiveAt: now}
	store.data.Contacts["c2"] = &Contact{ID: "c2", MemberCode: "DOOZ-00002", PhoneNormalized: "6281200000002", VerificationStatus: StatusVerified, LastActiveAt: now}
	store.data.Measurements["a"] = &Measurement{ID: "a", CustomerID: "c1", FrameWidthMM: 130, SizeCategory: "S", IsPrimary: true, CreatedAt: now}
	store.data.Measurements["b"] = &Measurement{ID: "b", CustomerID: "c1", FrameWidthMM: 140, SizeCategory: "L", IsPrimary: true, CreatedAt: now.Add(time.Minute)}
	store.data.Measurements["c"] = &Measurement{ID: "c", CustomerID: "c2", FrameWidthMM: 136, SizeCategory: "M", CreatedAt: now}
	_ = store.persistLocked()
	store.mu.Unlock()

	reloaded, err := NewStore(path, nil)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	for _, cid := range []string{"c1", "c2"} {
		n, _ := countPrimary(reloaded.listMeasurementsLocked(cid))
		if n != 1 {
			t.Fatalf("contact %s must have exactly one primary after load, got %d", cid, n)
		}
	}
}
