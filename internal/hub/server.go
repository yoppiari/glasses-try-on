package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ServerConfig struct {
	Store            *Store
	Signer           *SecuritySigner
	WAProvider       WhatsAppProvider
	ReplyQueue       *ReplyQueue
	WebhookSecret    string
	FonnteDeviceID   string
	OfficialWANumber string
	PortalBaseURL    string
	WebhookRateLimit int // max requests per window per sender/IP
	RateLimitWindow  time.Duration
	Clock            func() time.Time
}

type Server struct {
	cfg        ServerConfig
	mux        *http.ServeMux
	rateMu     sync.Mutex
	rateCounts map[string]*rateBucket
}

type rateBucket struct {
	count   int
	resetAt time.Time
}

func NewServer(cfg ServerConfig) *Server {
	if cfg.Signer == nil {
		cfg.Signer = NewSecuritySigner("")
	}
	if cfg.Store == nil {
		cfg.Store, _ = NewStore(":memory:", cfg.Signer)
	}
	if cfg.WAProvider == nil {
		cfg.WAProvider = NewFonnteAdapter("mock-fonnte-token", cfg.FonnteDeviceID)
	}
	if cfg.ReplyQueue == nil {
		cfg.ReplyQueue = NewReplyQueue(cfg.WAProvider, 10*time.Millisecond, 25*time.Millisecond)
	}
	if strings.TrimSpace(cfg.WebhookSecret) == "" {
		cfg.WebhookSecret = "dooz-fonnte-secret-2026"
	}
	if strings.TrimSpace(cfg.FonnteDeviceID) == "" {
		cfg.FonnteDeviceID = "DOOZ-WA-DEVICE-01"
	}
	if strings.TrimSpace(cfg.OfficialWANumber) == "" {
		cfg.OfficialWANumber = "6281122334455"
	}
	if strings.TrimSpace(cfg.PortalBaseURL) == "" {
		cfg.PortalBaseURL = "https://crm.dooz.id"
	}
	if cfg.WebhookRateLimit <= 0 {
		cfg.WebhookRateLimit = 20
	}
	if cfg.RateLimitWindow <= 0 {
		cfg.RateLimitWindow = time.Minute
	}
	if cfg.Clock == nil {
		cfg.Clock = func() time.Time { return time.Now().UTC() }
	}

	s := &Server{
		cfg:        cfg,
		mux:        http.NewServeMux(),
		rateCounts: make(map[string]*rateBucket),
	}
	s.registerRoutes()
	return s
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, If-None-Match, X-Fonnte-Secret, X-Staff-User-ID, X-Staff-Role, X-Staff-Outlet-ID")
		w.Header().Set("Access-Control-Expose-Headers", "ETag, Cache-Control")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.mux.ServeHTTP(w, r)
	})
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("/api/health", s.handleHealth)
	s.mux.HandleFunc("/api/capture/identify", s.handleCaptureIdentify)
	s.mux.HandleFunc("/api/capture/events", s.handleCaptureEvents)

	// Fonnte Webhook (supports both header/query secret and secret path)
	s.mux.HandleFunc("/api/webhooks/fonnte", s.handleFonnteWebhook)
	s.mux.HandleFunc("/api/webhooks/fonnte/", s.handleFonnteWebhook)

	// Passwordless Magic Link Auth
	s.mux.HandleFunc("/api/auth/magic-verify", s.handleMagicVerify)
	s.mux.HandleFunc("/api/auth/magic-exchange", s.handleMagicExchange)

	// Member Portal ("Data Saya") & Standalone Capture SDK
	s.mux.HandleFunc("/sdk/dooz-capture.js", s.handleServeCaptureSDK)
	s.mux.HandleFunc("/data-saya", s.handlePortalWebPage)
	s.mux.HandleFunc("/data-saya/", s.handlePortalWebPage)
	s.mux.HandleFunc("/api/portal/demo-magic-link", s.handlePortalDemoMagicLink)
	s.mux.HandleFunc("/api/portal/me", s.handlePortalMe)
	s.mux.HandleFunc("/api/portal/confirm-recycled", s.handlePortalConfirmRecycled)
	s.mux.HandleFunc("/api/portal/sessions/revoke-all", s.handlePortalRevokeAllSessions)
	s.mux.HandleFunc("/api/portal/consents", s.handlePortalUpdateConsent)
	s.mux.HandleFunc("/api/portal/privacy/delete", s.handlePortalDeleteData)

	// Cashier Outlet (2-Level Access & Walk-In)
	s.mux.HandleFunc("/api/kasir/lookup-phone", s.handleKasirLookupPhone)
	s.mux.HandleFunc("/api/kasir/scan-qr", s.handleKasirScanQR)
	s.mux.HandleFunc("/api/kasir/walkin", s.handleKasirWalkIn)

	// Attribution Links
	s.mux.HandleFunc("/api/attribution/sign", s.handleAttributionSign)
	s.mux.HandleFunc("/api/attribution/verify", s.handleAttributionVerify)

	// Admin & UU PDP Governance
	s.mux.HandleFunc("/api/admin/audit-logs", s.handleAdminAuditLogs)
	s.mux.HandleFunc("/api/admin/contacts/export.csv", s.handleAdminExportCSV)
	s.mux.HandleFunc("/api/admin/retention/purge", s.handleAdminRetentionPurge)

	// Shared Catalog (Single Source of Truth: XS-XL Size Chart & Active DOOZ Frame SKUs)
	s.mux.HandleFunc("/api/catalog/size-chart", s.handleCatalogSizeChart)
	s.mux.HandleFunc("/api/catalog/frames", s.handleCatalogFrames)
	s.mux.HandleFunc("/api/catalog/frames/", s.handleCatalogFrames)

	// Admin Catalog CRUD & Import
	s.mux.HandleFunc("/api/admin/catalog/size-chart", s.handleAdminCatalogSizeChart)
	s.mux.HandleFunc("/api/admin/catalog/frames", s.handleAdminCatalogFrames)
	s.mux.HandleFunc("/api/admin/catalog/frames/", s.handleAdminCatalogFrameBySKU)
	s.mux.HandleFunc("/api/admin/catalog/import", s.handleAdminCatalogImport)
	s.mux.HandleFunc("/admin/catalog", s.handleAdminCatalogWebPage)
	s.mux.HandleFunc("/admin/catalog/", s.handleAdminCatalogWebPage)
}

func (s *Server) allowRate(key string) bool {
	now := s.cfg.Clock()
	s.rateMu.Lock()
	defer s.rateMu.Unlock()

	b, exists := s.rateCounts[key]
	if !exists || now.After(b.resetAt) {
		s.rateCounts[key] = &rateBucket{
			count:   1,
			resetAt: now.Add(s.cfg.RateLimitWindow),
		}
		return true
	}
	if b.count >= s.cfg.WebhookRateLimit {
		return false
	}
	b.count++
	return true
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"service":  "dooz-customer-hub",
		"provider": s.cfg.WAProvider.ProviderName(),
	})
}

func (s *Server) handleCaptureIdentify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req IdentifyLeadInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	req.IPAddress = clientIP(r)
	req.UserAgent = r.UserAgent()
	req.Now = s.cfg.Clock()

	if !s.allowRate("capture:" + req.IPAddress) {
		writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
		return
	}

	// Anti-spam honeypot: return uniform 200 OK response without polluting database
	if strings.TrimSpace(req.Honeypot) != "" {
		fakeCode := GenerateVerificationCodeStr()
		waURL := fmt.Sprintf("https://wa.me/%s?text=Halo%%20DOOZ%%2C%%20verifikasi%%20hasil%%20ukur%%20saya%%20kode%%3A%%20%s", s.cfg.OfficialWANumber, fakeCode)
		writeJSON(w, http.StatusOK, IdentifyLeadResult{
			ContactID:        GenerateUUID(),
			VerificationCode: fakeCode,
			ExpiresAt:        req.Now.Add(VerificationCodeTTL),
			WAMeURL:          waURL,
			UniformMessage:   "Silakan kirim pesan WhatsApp berisi kode verifikasi untuk menerima hasil ukur dan kartu member DOOZ.",
		})
		return
	}

	// If attribution signature is provided, verify it; if tampered, strip attribution parameters so host incentives cannot be spoofed
	if req.Signature != "" {
		if !s.cfg.Signer.VerifyAttribution(req.Source, req.HostCode, req.SessionCode, req.Payload.OutletID, req.Signature) {
			req.Source = "unverified_unsigned"
			req.HostCode = ""
			req.SessionCode = ""
		}
	}

	res, err := s.cfg.Store.UpsertLeadPending(req, s.cfg.OfficialWANumber)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleCaptureEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var body struct {
		ContactID   string       `json:"contact_id"`
		EventType   string       `json:"event_type"`
		Payload     EventPayload `json:"payload"`
		Source      string       `json:"src"`
		HostCode    string       `json:"host"`
		SessionCode string       `json:"sesi"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	ev, err := s.cfg.Store.RecordEvent(body.ContactID, body.EventType, body.Payload, body.Source, body.HostCode, body.SessionCode, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

func (s *Server) handleFonnteWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// 1. Validate secret path/header/query token
	pathSecret := strings.TrimPrefix(r.URL.Path, "/api/webhooks/fonnte")
	pathSecret = strings.TrimPrefix(pathSecret, "/")
	headerSecret := strings.TrimSpace(r.Header.Get("X-Fonnte-Secret"))
	if headerSecret == "" {
		auth := strings.TrimSpace(r.Header.Get("Authorization"))
		headerSecret = strings.TrimPrefix(auth, "Bearer ")
	}
	querySecret := strings.TrimSpace(r.URL.Query().Get("secret"))

	providedSecret := pathSecret
	if providedSecret == "" {
		providedSecret = headerSecret
	}
	if providedSecret == "" {
		providedSecret = querySecret
	}
	if providedSecret != s.cfg.WebhookSecret {
		writeError(w, http.StatusUnauthorized, "invalid webhook secret token")
		return
	}

	var payload struct {
		Device  string `json:"device"`
		Sender  string `json:"sender"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid webhook payload")
		return
	}

	// 2. Validate Fonnte Device ID
	if strings.TrimSpace(payload.Device) != s.cfg.FonnteDeviceID {
		writeError(w, http.StatusForbidden, "invalid Fonnte device ID")
		return
	}

	senderNorm, err := NormalizePhone(payload.Sender)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid sender phone number")
		return
	}

	// 3. Enforce rate limit per sender
	if !s.allowRate("webhook:" + senderNorm) {
		writeError(w, http.StatusTooManyRequests, "webhook rate limit exceeded")
		return
	}

	now := s.cfg.Clock()
	// Mark this sender as having sent an inbound WhatsApp message (unlocks inbound-triggered reply queue)
	s.cfg.ReplyQueue.MarkInboundTriggered(senderNorm, now)

	cmd := ParseInboundCommand(payload.Message)
	switch cmd.Kind {
	case "VERIFY_DZ":
		contact, ml, sizeSummary, err := s.cfg.Store.VerifyByWebhookDZCode(cmd.Code, senderNorm, now)
		if err != nil {
			// Single-use / expired code: do NOT reply repeatedly (anti-spam: 1 code DZ-xxxx replied only 1 time)
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":      true,
				"status":  "ignored",
				"reason":  "invalid_or_used_code",
				"command": cmd.Kind,
			})
			return
		}
		magicURL := fmt.Sprintf("%s/data-saya?token=%s", strings.TrimRight(s.cfg.PortalBaseURL, "/"), ml.Token)
		replyText := FormatVerificationReply(contact.MemberCode, sizeSummary, magicURL, ml.RequiresNameConfirm)
		_, _ = s.cfg.ReplyQueue.EnqueueReply(senderNorm, cmd.Code, replyText)

		// Security requirement #1: NEVER return magic_link in HTTP response!
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":          true,
			"status":      "queued",
			"command":     "VERIFY_DZ",
			"member_code": contact.MemberCode,
		})

	case "MASUK", "DATA":
		contact, ml, sizeSummary, err := s.cfg.Store.CreateMagicLinkForInboundCommand(senderNorm, now)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":      true,
				"status":  "ignored",
				"reason":  "contact_not_found",
				"command": cmd.Kind,
			})
			return
		}
		magicURL := fmt.Sprintf("%s/data-saya?token=%s", strings.TrimRight(s.cfg.PortalBaseURL, "/"), ml.Token)
		replyText := FormatVerificationReply(contact.MemberCode, sizeSummary, magicURL, ml.RequiresNameConfirm)
		_, _ = s.cfg.ReplyQueue.EnqueueReply(senderNorm, cmd.Kind, replyText)

		// NEVER return magic_link in HTTP response
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":                    true,
			"status":                "queued",
			"command":               cmd.Kind,
			"member_code":           contact.MemberCode,
			"requires_name_confirm": ml.RequiresNameConfirm,
		})

	case "KELUAR":
		contact, revokedCount, err := s.cfg.Store.RevokeAllSessionsByPhone(senderNorm, now)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":     true,
				"status": "ignored",
			})
			return
		}
		replyText := FormatLogoutReply(contact.MemberCode)
		_, _ = s.cfg.ReplyQueue.EnqueueReply(senderNorm, "KELUAR", replyText)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":               true,
			"status":           "queued",
			"command":          "KELUAR",
			"revoked_sessions": revokedCount,
		})

	default:
		// Ignore arbitrary text so bot only replies to allowed inbound triggers
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"status":  "ignored",
			"command": "UNKNOWN",
		})
	}
}

func (s *Server) handleMagicVerify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	ml, contact, err := s.cfg.Store.InspectMagicLink(token, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"valid":                 true,
		"member_code":           contact.MemberCode,
		"first_name_masked":     MaskFirstName(contact.FullName),
		"requires_name_confirm": ml.RequiresNameConfirm,
		"expires_at":            ml.ExpiresAt,
	})
}

func (s *Server) handleMagicExchange(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "magic link must be exchanged via POST confirmation button")
		return
	}
	var req struct {
		Token           string `json:"token"`
		ConfirmFullName string `json:"confirm_full_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	sess, contact, err := s.cfg.Store.ExchangeMagicLink(req.Token, req.ConfirmFullName, clientIP(r), r.UserAgent(), s.cfg.Clock())
	if err != nil {
		status := http.StatusUnauthorized
		if errors.Is(err, ErrRecycledConfirmationNeed) {
			status = http.StatusForbidden
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"session_token":         sess.SessionToken,
		"access_scope":          sess.AccessScope,
		"requires_name_confirm": sess.AccessScope == AccessScopeBasicRecycledPending,
		"expires_at":            sess.ExpiresAt,
		"member_code":           contact.MemberCode,
	})
}

func (s *Server) handlePortalMe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	tok := extractBearerToken(r)
	view, err := s.cfg.Store.GetPortalViewBySession(tok, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handlePortalConfirmRecycled(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	tok := extractBearerToken(r)
	var req struct {
		FullName string `json:"full_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	sess, contact, err := s.cfg.Store.ConfirmRecycledSession(tok, req.FullName, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"access_scope": sess.AccessScope,
		"member_code":  contact.MemberCode,
	})
}

func (s *Server) handlePortalRevokeAllSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	tok := extractBearerToken(r)
	view, err := s.cfg.Store.GetPortalViewBySession(tok, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	// Resolve contact ID from session
	s.cfg.Store.mu.RLock()
	sess := s.cfg.Store.data.MemberSessions[tok]
	contactID := ""
	if sess != nil {
		contactID = sess.ContactID
	}
	s.cfg.Store.mu.RUnlock()

	revoked, err := s.cfg.Store.RevokeAllSessionsByContactID(contactID, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":               true,
		"member_code":      view.MemberCode,
		"revoked_sessions": revoked,
	})
}

func (s *Server) handlePortalUpdateConsent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	tok := extractBearerToken(r)
	var req struct {
		Scope   string `json:"scope"`
		Granted bool   `json:"granted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if err := s.cfg.Store.UpdateConsentBySession(tok, req.Scope, req.Granted, clientIP(r), r.UserAgent(), s.cfg.Clock()); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "scope": req.Scope, "granted": req.Granted})
}

func (s *Server) handlePortalDeleteData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	tok := extractBearerToken(r)
	var req struct {
		Immediate bool `json:"immediate"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if err := s.cfg.Store.RequestDataDeletionBySession(tok, req.Immediate, s.cfg.Clock()); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "deletion_processed"})
}

func (s *Server) handleKasirLookupPhone(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	actorID, role, outletID := extractStaffContext(r)
	var req struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	res, err := s.cfg.Store.LookupContactLevel1(req.Phone, actorID, role, outletID, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleKasirScanQR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	actorID, role, outletID := extractStaffContext(r)
	var req struct {
		QRToken string `json:"qr_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	res, err := s.cfg.Store.LookupContactLevel2ByQR(req.QRToken, actorID, role, outletID, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleKasirWalkIn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	actorID, role, outletID := extractStaffContext(r)
	if role != RoleKasir && role != RoleAdmin && role != RoleOwner {
		writeError(w, http.StatusForbidden, ErrUnauthorizedRole.Error())
		return
	}
	var req struct {
		Mode        string       `json:"mode"` // "qr_wa" (recommended) or "manual" (fallback unverified)
		FullName    string       `json:"full_name"`
		Phone       string       `json:"phone"`
		CityRegency string       `json:"city_regency"`
		Payload     EventPayload `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	if req.Payload.OutletID == "" {
		req.Payload.OutletID = outletID
	}
	if strings.ToLower(req.Mode) == "manual" {
		contact, err := s.cfg.Store.CreateManualWalkIn(req.FullName, req.Phone, req.CityRegency, outletID, actorID, role, req.Payload, s.cfg.Clock())
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"mode":                "manual",
			"verification_status": contact.VerificationStatus, // unverified
			"outbound_wa_sent":    false,
			"contact":             contact,
		})
		return
	}
	// Default: "qr_wa" — generates DZ-xxxx and wa.me link for customer to scan & send from their own WA
	res, err := s.cfg.Store.UpsertLeadPending(IdentifyLeadInput{
		FullName:    req.FullName,
		PhoneRaw:    req.Phone,
		CityRegency: req.CityRegency,
		EventType:   EventFrameMeasured,
		Payload:     req.Payload,
		Source:      "outlet_qr_kasir",
		Now:         s.cfg.Clock(),
	}, s.cfg.OfficialWANumber)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"mode":              "qr_wa",
		"verification_code": res.VerificationCode,
		"wa_me_url":         res.WAMeURL,
		"expires_at":        res.ExpiresAt,
	})
}

func (s *Server) handleAttributionSign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	actorID, role, _ := extractStaffContext(r)
	var req struct {
		BaseURL     string `json:"base_url"`
		Source      string `json:"src"`
		HostCode    string `json:"host"`
		SessionCode string `json:"sesi"`
		OutletID    string `json:"outlet"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	link, err := s.cfg.Store.SaveAttributionLink(req.BaseURL, req.Source, req.HostCode, req.SessionCode, req.OutletID, actorID, role, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, link)
}

func (s *Server) handleAttributionVerify(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	src := q.Get("src")
	host := q.Get("host")
	sesi := q.Get("sesi")
	outlet := q.Get("outlet")
	sig := q.Get("sig")
	valid := s.cfg.Signer.VerifyAttribution(src, host, sesi, outlet, sig)
	writeJSON(w, http.StatusOK, map[string]any{
		"valid":  valid,
		"src":    src,
		"host":   host,
		"sesi":   sesi,
		"outlet": outlet,
	})
}

func (s *Server) handleAdminAuditLogs(w http.ResponseWriter, r *http.Request) {
	_, role, _ := extractStaffContext(r)
	logs, err := s.cfg.Store.ListAuditLogs(role)
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"audit_logs": logs})
}

func (s *Server) handleAdminExportCSV(w http.ResponseWriter, r *http.Request) {
	actorID, role, outletID := extractStaffContext(r)
	csvData, err := s.cfg.Store.ExportContactsCSV(actorID, role, outletID, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"dooz-contacts-masked.csv\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(csvData))
}

func (s *Server) handleAdminRetentionPurge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	actorID, role, _ := extractStaffContext(r)
	if role != RoleOwner && role != RoleAdmin {
		writeError(w, http.StatusForbidden, ErrUnauthorizedRole.Error())
		return
	}
	count, ids, err := s.cfg.Store.PurgeInactiveRetention(actorID, s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"purged_count": count,
		"purged_ids":   ids,
	})
}

func extractBearerToken(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return strings.TrimSpace(r.URL.Query().Get("session_token"))
}

func extractStaffContext(r *http.Request) (actorID, role, outletID string) {
	actorID = strings.TrimSpace(r.Header.Get("X-Staff-User-ID"))
	if actorID == "" {
		actorID = "staff-anonymous"
	}
	role = strings.ToLower(strings.TrimSpace(r.Header.Get("X-Staff-Role")))
	outletID = strings.TrimSpace(r.Header.Get("X-Staff-Outlet-ID"))
	return
}

func clientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		return strings.Split(xff, ",")[0]
	}
	return r.RemoteAddr
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}

func writeStaffError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrUnauthorizedRole):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, ErrContactNotFound), errors.Is(err, ErrFrameNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, ErrInvalidSignature), errors.Is(err, ErrQRTokenExpired), errors.Is(err, ErrInvalidSizeChart), errors.Is(err, ErrInvalidCatalogFrame):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		writeError(w, http.StatusBadRequest, err.Error())
	}
}
