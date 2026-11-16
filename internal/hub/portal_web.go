package hub

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// handleServeCaptureSDK serves the standalone Shared Capture SDK (`/sdk/dooz-capture.js`).
func (s *Server) handleServeCaptureSDK(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")

	if raw, err := os.ReadFile("public/sdk/dooz-capture.js"); err == nil && len(raw) > 0 {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(raw)
		return
	}

	// Fallback embedded SDK script if run from another working directory
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`window.DoozCaptureSDK = window.DoozCaptureSDK || { version: "1.0.0" };`))
}

// handlePortalWebPage serves the Passwordless Member Portal ("Data Saya") HTML page at `/data-saya`
// with strict `Referrer-Policy: no-referrer` so one-time magic link tokens never leak via Referer headers.
func (s *Server) handlePortalWebPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(portalStandaloneHTML))
}

// handlePortalDemoMagicLink seeds a verified demo member (with frame size, try-on history, outlet visit, and active voucher)
// and issues a one-time MagicLink token so interactive testers can exercise `POST /api/auth/magic-exchange` and recycled-number confirmation.
func (s *Server) handlePortalDemoMagicLink(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		RecycledPassive bool   `json:"recycled_passive"`
		Phone           string `json:"phone"`
		FullName        string `json:"full_name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	phone := strings.TrimSpace(req.Phone)
	if phone == "" {
		if req.RecycledPassive {
			phone = "081299887766"
		} else {
			phone = "081234567890"
		}
	}
	fullName := strings.TrimSpace(req.FullName)
	if fullName == "" {
		fullName = "Rina Kartika"
	}

	now := s.cfg.Clock()
	leadRes, err := s.cfg.Store.UpsertLeadPending(IdentifyLeadInput{
		FullName:          fullName,
		PhoneRaw:          phone,
		CityRegency:       "Kota Surakarta (Solo)",
		EventType:         EventFrameMeasured,
		Payload:           EventPayload{FrameWidthMM: 138, BridgeMM: 18, TempleMM: 142, SizeCategory: "M", FrameSKU: "DOOZ-CLS-001", FrameName: "Classic Black"},
		Source:            "live_tiktok",
		HostCode:          "rina",
		SessionCode:       "20261116",
		GrantCRMWAConsent: true,
		Now:               now,
	}, s.cfg.OfficialWANumber)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	contact, ml, _, err := s.cfg.Store.VerifyByWebhookDZCode(leadRes.VerificationCode, phone, now)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Record sample try-on, store visit, and active voucher if not already present
	existingView, _ := s.cfg.Store.GetContactByID(contact.ID)
	if existingView != nil {
		_, _ = s.cfg.Store.RecordEvent(contact.ID, EventFrameTried, EventPayload{
			FrameSKU:     "DOOZ-CLS-001",
			FrameName:    "Classic Black",
			FrameWidthMM: 138,
			SizeCategory: "M",
		}, "live_tiktok", "rina", "20261116", now)
		_, _ = s.cfg.Store.RecordEvent(contact.ID, EventStoreVisit, EventPayload{
			OutletID: "DOOZ Optik Gading Solo",
			Notes:    "Konsultasi frame & ukur wajah digital",
		}, "outlet_qr_kasir", "", "", now)
		_, _ = s.cfg.Store.RecordEvent(contact.ID, EventVoucherClaimed, EventPayload{
			VoucherCode: "LIVE-DOOZ50K",
			AmountIDR:   50000,
			Notes:       "Potongan Rp 50.000 Frame + Lensa Anti Radiasi",
		}, "live_tiktok", "rina", "20261116", now)
	}

	if req.RecycledPassive {
		s.cfg.Store.mu.Lock()
		if c, ok := s.cfg.Store.data.Contacts[contact.ID]; ok {
			c.LastActiveAt = now.Add(-200 * 24 * time.Hour)
		}
		if storedML, ok := s.cfg.Store.data.MagicLinks[ml.Token]; ok {
			storedML.RequiresNameConfirm = true
			ml.RequiresNameConfirm = true
		}
		_ = s.cfg.Store.persistLocked()
		s.cfg.Store.mu.Unlock()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                    true,
		"magic_token":           ml.Token,
		"member_code":           contact.MemberCode,
		"requires_name_confirm": ml.RequiresNameConfirm,
		"portal_url":            fmt.Sprintf("/data-saya?token=%s", ml.Token),
	})
}

const portalStandaloneHTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="referrer" content="no-referrer" />
  <title>Portal Member ("Data Saya") — Kacamata DOOZ</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 24px; }
    .card { max-width: 680px; margin: 0 auto 18px; background: #14151f; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 22px; }
    .btn { background: #6366f1; color: #fff; border: none; border-radius: 10px; padding: 12px 18px; font-weight: 600; cursor: pointer; }
    .btn-danger { background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.4); }
    code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Portal Member ("Data Saya") — DOOZ Optik</h1>
    <p>Akses tanpa password menggunakan Magic Link sekali pakai (POST exchange) &amp; Kartu Member QR Dinamis (<code>DQR1...</code>).</p>
    <div id="portal-app">Memuat Portal Data Saya...</div>
  </div>
  <script src="/sdk/dooz-capture.js"></script>
</body>
</html>`
