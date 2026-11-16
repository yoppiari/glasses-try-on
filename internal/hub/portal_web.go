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
		"portal_url":            fmt.Sprintf("%s?token=%s", RouteKartuMember, ml.Token),
	})
}
