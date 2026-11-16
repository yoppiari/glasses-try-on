package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// Rute "Ukuran Saya", polling verifikasi App Ukur & "Masuk lewat WhatsApp".
// Kontrak lengkap: docs/api-ukuran-saya.md.
func (s *Server) registerMeasurementRoutes() {
	s.mux.HandleFunc("/api/capture/verification-status", s.handleVerificationStatus)
	s.mux.HandleFunc("/api/auth/whatsapp-login", s.handleWhatsAppLogin)
	s.mux.HandleFunc("/api/portal/measurements", s.handlePortalMeasurements)
	s.mux.HandleFunc("/api/portal/measurements/", s.handlePortalMeasurementByID)
}

// PollRateLimit: polling Layar 5 (mis. tiap 2–3 detik) butuh kuota lebih longgar dari webhook.
const PollRateLimit = 120

func (s *Server) handleVerificationStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		VerificationCode string `json:"verification_code"`
		PollToken        string `json:"poll_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	ip := clientIP(r)
	if !s.allowRateN("poll:"+ip, PollRateLimit) {
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}
	res, err := s.cfg.Store.GetVerificationStatus(req.VerificationCode, req.PollToken, ip, r.UserAgent(), s.cfg.Clock())
	if err != nil {
		// Seragam untuk kode tidak dikenal / poll_token salah (anti-enumerasi).
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "status": "not_found", "error": ErrVerificationNotFound.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleWhatsAppLogin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		App      string `json:"app"`
		Honeypot string `json:"honeypot,omitempty"`
	}
	if r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON payload")
			return
		}
	}
	if !s.allowRate("wa-login:" + clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}
	if strings.TrimSpace(req.Honeypot) != "" {
		fake := GenerateVerificationCodeStr()
		writeJSON(w, http.StatusOK, WhatsAppLoginResult{
			LoginCode: fake,
			PollToken: GenerateSecureToken(24),
			WAMeURL:   buildWAMeURL(s.cfg.OfficialWANumber, "Halo DOOZ, saya mau masuk Member. Kode: "+fake),
			ExpiresAt: s.cfg.Clock().Add(WhatsAppLoginTTL),
			Message:   "Kirim pesan WhatsApp ini dari nomor member kamu. Link masuk sekali pakai akan dibalas lewat WhatsApp.",
		})
		return
	}
	res, err := s.cfg.Store.CreateWhatsAppLoginRequest(req.App, s.cfg.OfficialWANumber, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func writeMemberError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrSessionInvalid):
		writeError(w, http.StatusUnauthorized, err.Error())
	case errors.Is(err, ErrSessionScopeRestricted):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, ErrMeasurementNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, ErrMeasurementLimit):
		writeError(w, http.StatusConflict, err.Error())
	default:
		writeError(w, http.StatusBadRequest, err.Error())
	}
}

// GET  /api/portal/measurements  -> daftar "Ukuran Saya"
// POST /api/portal/measurements  -> tambah ukuran (ukur lagi / input angka gagang)
func (s *Server) handlePortalMeasurements(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	tok := extractBearerToken(r)
	now := s.cfg.Clock()
	switch r.Method {
	case http.MethodGet:
		list, err := s.cfg.Store.ListMeasurementsBySession(tok, now)
		if err != nil {
			writeMemberError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, measurementListResponse(list))
	case http.MethodPost:
		var in MeasurementInput
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON payload")
			return
		}
		m, err := s.cfg.Store.CreateMeasurementBySession(tok, in, now)
		if err != nil {
			writeMemberError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "measurement": m})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func measurementListResponse(list []Measurement) map[string]any {
	var primary *Measurement
	for i := range list {
		if list[i].IsPrimary {
			primary = &list[i]
			break
		}
	}
	return map[string]any{
		"measurements":        list,
		"primary_measurement": primary,
		"count":               len(list),
		"max":                 MaxMeasurementsPerMember,
	}
}

// PATCH  /api/portal/measurements/{id}          -> ubah nama / catatan / comfort
// DELETE /api/portal/measurements/{id}          -> hapus
// POST   /api/portal/measurements/{id}/primary  -> jadikan ukuran utama
func (s *Server) handlePortalMeasurementByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/portal/measurements/"), "/")
	parts := strings.Split(rest, "/")
	id, _ := url.PathUnescape(parts[0])
	if id == "" || len(parts) > 2 || (len(parts) == 2 && parts[1] != "primary") {
		writeError(w, http.StatusNotFound, ErrMeasurementNotFound.Error())
		return
	}
	tok := extractBearerToken(r)
	now := s.cfg.Clock()

	if len(parts) == 2 {
		if r.Method != http.MethodPost && r.Method != http.MethodPut {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		m, err := s.cfg.Store.SetPrimaryMeasurementBySession(tok, id, now)
		if err != nil {
			writeMemberError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "measurement": m})
		return
	}

	switch r.Method {
	case http.MethodPatch, http.MethodPut:
		var raw map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON payload")
			return
		}
		patch, err := parseMeasurementPatch(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		m, err := s.cfg.Store.UpdateMeasurementBySession(tok, id, patch, now)
		if err != nil {
			writeMemberError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "measurement": m})
	case http.MethodDelete:
		primary, err := s.cfg.Store.DeleteMeasurementBySession(tok, id, now)
		if err != nil {
			writeMemberError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted_id": id, "primary_measurement": primary})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func parseMeasurementPatch(raw map[string]json.RawMessage) (MeasurementPatch, error) {
	var p MeasurementPatch
	str := func(key string) (*string, bool, error) {
		v, ok := raw[key]
		if !ok {
			return nil, false, nil
		}
		if string(v) == "null" {
			return nil, true, nil
		}
		var out string
		if err := json.Unmarshal(v, &out); err != nil {
			return nil, true, fmt.Errorf("%w: %s must be a string", ErrInvalidMeasurement, key)
		}
		return &out, true, nil
	}
	for key := range raw {
		switch key {
		case "name", "note", "comfort":
		default:
			return p, fmt.Errorf("%w: field %q cannot be updated (allowed: name, note, comfort)", ErrInvalidMeasurement, key)
		}
	}
	var err error
	var present bool
	if p.Name, present, err = str("name"); err != nil {
		return p, err
	} else if present && p.Name == nil {
		return p, fmt.Errorf("%w: name must not be null", ErrInvalidMeasurement)
	}
	if p.Note, present, err = str("note"); err != nil {
		return p, err
	} else if present && p.Note == nil {
		empty := ""
		p.Note = &empty
	}
	if p.Comfort, present, err = str("comfort"); err != nil {
		return p, err
	} else if present && p.Comfort == nil {
		p.ClearComfort = true
	}
	return p, nil
}

// magicLinkURLFor memilih tujuan magic link di balasan WhatsApp:
//   - "Masuk lewat WhatsApp" dari App Ukur, atau member lama yang mendaftar ulang dari App Ukur -> App Ukur (?masuk=TOKEN)
//   - selain itu -> Kartu Member Saya di portal (/kartu-member?token=TOKEN)
func (s *Server) magicLinkURLFor(res *InboundDZResult) string {
	if res.App == AppUkur && (res.Kind == "login" || !res.NewMember) {
		return fmt.Sprintf("%s/?masuk=%s", strings.TrimRight(s.cfg.UkurAppURL, "/"), res.MagicLink.Token)
	}
	return fmt.Sprintf("%s/kartu-member?token=%s", strings.TrimRight(s.cfg.PortalBaseURL, "/"), res.MagicLink.Token)
}

func (s *Server) allowRateN(key string, limit int) bool {
	now := s.cfg.Clock()
	s.rateMu.Lock()
	defer s.rateMu.Unlock()
	b, exists := s.rateCounts[key]
	if !exists || now.After(b.resetAt) {
		s.rateCounts[key] = &rateBucket{count: 1, resetAt: now.Add(s.cfg.RateLimitWindow)}
		return true
	}
	if b.count >= limit {
		return false
	}
	b.count++
	return true
}
