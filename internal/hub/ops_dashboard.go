package hub

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"
)

type ConversionBucket struct {
	Key             string  `json:"key"`
	Label           string  `json:"label,omitempty"`
	TotalLeads      int     `json:"total_leads"`
	VerifiedLeads   int     `json:"verified_leads"`
	PendingLeads    int     `json:"pending_leads"`
	UnverifiedLeads int     `json:"unverified_leads"`
	ConversionRate  float64 `json:"conversion_rate_pct"`
	TotalEvents     int     `json:"total_events"`
	FramesMeasured  int     `json:"frames_measured"`
	FramesTried     int     `json:"frames_tried"`
	StoreVisits     int     `json:"store_visits"`
	VouchersClaimed int     `json:"vouchers_claimed"`
}

type AdminDashboardSummary struct {
	TotalContacts       int                `json:"total_contacts"`
	VerifiedContacts    int                `json:"verified_contacts"`
	PendingContacts     int                `json:"pending_contacts"`
	UnverifiedContacts  int                `json:"unverified_contacts"`
	VerificationRatePct float64            `json:"verification_rate_pct"`
	TotalEvents         int                `json:"total_events"`
	TotalFramesMeasured int                `json:"total_frames_measured"`
	TotalFramesTried    int                `json:"total_frames_tried"`
	TotalStoreVisits    int                `json:"total_store_visits"`
	TotalVouchers       int                `json:"total_vouchers_claimed"`
	TotalPurchases      int                `json:"total_purchases"`
	BySource            []ConversionBucket `json:"by_source"`
	ByHost              []ConversionBucket `json:"by_host"`
	BySession           []ConversionBucket `json:"by_session"`
	ByCity              []ConversionBucket `json:"by_city"`
	SizeDistribution    map[string]int     `json:"size_distribution"`
	AttributionLinks    []AttributionLink  `json:"attribution_links"`
	RecentAuditLogs     []AuditLog         `json:"recent_audit_logs"`
	GeneratedAt         time.Time          `json:"generated_at"`
}

type LiveCounterToast struct {
	ID           string    `json:"id"`
	MaskedName   string    `json:"masked_name"` // e.g. "R***"
	CityRegency  string    `json:"city_regency"`
	EventType    string    `json:"event_type"`
	SizeCategory string    `json:"size_category,omitempty"`
	FrameWidthMM float64   `json:"frame_width_mm,omitempty"`
	FrameName    string    `json:"frame_name,omitempty"`
	Source       string    `json:"src,omitempty"`
	HostCode     string    `json:"host,omitempty"`
	SessionCode  string    `json:"sesi,omitempty"`
	Message      string    `json:"message"` // e.g. "R*** · Bandung baru saja ukur frame — Kategori M"
	CreatedAt    time.Time `json:"created_at"`
}

type LiveCounterResponse struct {
	OK            bool               `json:"ok"`
	SessionFilter string             `json:"session_filter,omitempty"`
	HostFilter    string             `json:"host_filter,omitempty"`
	TotalLeads    int                `json:"total_leads"`
	VerifiedLeads int                `json:"verified_leads"`
	TotalEvents   int                `json:"total_events"`
	SizeBreakdown map[string]int     `json:"size_breakdown"`
	RecentToasts  []LiveCounterToast `json:"recent_toasts"`
	UpdatedAt     time.Time          `json:"updated_at"`
}

// GetAdminDashboardStats computes conversion & verification analytics by source, host, session, and city/regency.
// Restricted to Owner and Admin roles.
func (s *Store) GetAdminDashboardStats(role string, now time.Time) (*AdminDashboardSummary, error) {
	if role != RoleOwner && role != RoleAdmin {
		return nil, ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	summary := &AdminDashboardSummary{
		SizeDistribution: map[string]int{
			"XS": 0,
			"S":  0,
			"M":  0,
			"L":  0,
			"XL": 0,
		},
		GeneratedAt: now,
	}

	// Track primary attribution per contact from their earliest event
	type contactAttr struct {
		source  string
		host    string
		session string
	}
	attrByContact := make(map[string]contactAttr)

	// Sort events chronologically to find first touch attribution
	sortedEvents := make([]ContactEvent, len(s.data.Events))
	copy(sortedEvents, s.data.Events)
	sort.Slice(sortedEvents, func(i, j int) bool {
		return sortedEvents[i].CreatedAt.Before(sortedEvents[j].CreatedAt)
	})

	sourceBuckets := make(map[string]*ConversionBucket)
	hostBuckets := make(map[string]*ConversionBucket)
	sessionBuckets := make(map[string]*ConversionBucket)
	cityBuckets := make(map[string]*ConversionBucket)

	getOrInitBucket := func(m map[string]*ConversionBucket, key string) *ConversionBucket {
		k := strings.TrimSpace(key)
		if k == "" {
			k = "direct / organic"
		}
		b, ok := m[k]
		if !ok {
			b = &ConversionBucket{Key: k, Label: k}
			m[k] = b
		}
		return b
	}

	for _, ev := range sortedEvents {
		summary.TotalEvents++
		switch ev.EventType {
		case EventFrameMeasured:
			summary.TotalFramesMeasured++
		case EventFrameTried:
			summary.TotalFramesTried++
		case EventStoreVisit:
			summary.TotalStoreVisits++
		case EventVoucherClaimed:
			summary.TotalVouchers++
		case EventPurchase:
			summary.TotalPurchases++
		}

		cat := normalizeSizeCategoryCode(ev.Payload.SizeCategory)
		if isValidSizeCategoryCode(cat) && (ev.EventType == EventFrameMeasured || ev.EventType == EventFrameTried) {
			summary.SizeDistribution[cat]++
		}

		ca, exists := attrByContact[ev.ContactID]
		if !exists {
			ca = contactAttr{
				source:  strings.TrimSpace(ev.Source),
				host:    strings.TrimSpace(ev.HostCode),
				session: strings.TrimSpace(ev.SessionCode),
			}
			attrByContact[ev.ContactID] = ca
		} else {
			if ca.source == "" && ev.Source != "" {
				ca.source = strings.TrimSpace(ev.Source)
			}
			if ca.host == "" && ev.HostCode != "" {
				ca.host = strings.TrimSpace(ev.HostCode)
			}
			if ca.session == "" && ev.SessionCode != "" {
				ca.session = strings.TrimSpace(ev.SessionCode)
			}
			attrByContact[ev.ContactID] = ca
		}

		sb := getOrInitBucket(sourceBuckets, ev.Source)
		sb.TotalEvents++
		switch ev.EventType {
		case EventFrameMeasured:
			sb.FramesMeasured++
		case EventFrameTried:
			sb.FramesTried++
		case EventStoreVisit:
			sb.StoreVisits++
		case EventVoucherClaimed:
			sb.VouchersClaimed++
		}

		if strings.TrimSpace(ev.HostCode) != "" {
			hb := getOrInitBucket(hostBuckets, ev.HostCode)
			hb.TotalEvents++
			if ev.EventType == EventFrameMeasured {
				hb.FramesMeasured++
			} else if ev.EventType == EventFrameTried {
				hb.FramesTried++
			}
		}
		if strings.TrimSpace(ev.SessionCode) != "" {
			sesB := getOrInitBucket(sessionBuckets, ev.SessionCode)
			sesB.TotalEvents++
			if ev.EventType == EventFrameMeasured {
				sesB.FramesMeasured++
			} else if ev.EventType == EventFrameTried {
				sesB.FramesTried++
			}
		}
	}

	for _, c := range s.data.Contacts {
		summary.TotalContacts++
		switch c.VerificationStatus {
		case StatusVerified:
			summary.VerifiedContacts++
		case StatusPending:
			summary.PendingContacts++
		case StatusUnverified:
			summary.UnverifiedContacts++
		}

		ca := attrByContact[c.ID]
		addContactToBucket := func(b *ConversionBucket) {
			b.TotalLeads++
			switch c.VerificationStatus {
			case StatusVerified:
				b.VerifiedLeads++
			case StatusPending:
				b.PendingLeads++
			case StatusUnverified:
				b.UnverifiedLeads++
			}
		}

		addContactToBucket(getOrInitBucket(sourceBuckets, ca.source))
		if ca.host != "" {
			addContactToBucket(getOrInitBucket(hostBuckets, ca.host))
		}
		if ca.session != "" {
			addContactToBucket(getOrInitBucket(sessionBuckets, ca.session))
		}
		cityKey := strings.TrimSpace(c.CityRegency)
		if cityKey == "" {
			cityKey = "Belum Diisi"
		}
		addContactToBucket(getOrInitBucket(cityBuckets, cityKey))
	}

	if summary.TotalContacts > 0 {
		summary.VerificationRatePct = float64(summary.VerifiedContacts*1000/summary.TotalContacts) / 10.0
	}

	finalizeBuckets := func(m map[string]*ConversionBucket) []ConversionBucket {
		out := make([]ConversionBucket, 0, len(m))
		for _, b := range m {
			if b.TotalLeads > 0 {
				b.ConversionRate = float64(b.VerifiedLeads*1000/b.TotalLeads) / 10.0
			}
			out = append(out, *b)
		}
		sort.Slice(out, func(i, j int) bool {
			if out[i].TotalLeads != out[j].TotalLeads {
				return out[i].TotalLeads > out[j].TotalLeads
			}
			if out[i].TotalEvents != out[j].TotalEvents {
				return out[i].TotalEvents > out[j].TotalEvents
			}
			return out[i].Key < out[j].Key
		})
		return out
	}

	summary.BySource = finalizeBuckets(sourceBuckets)
	summary.ByHost = finalizeBuckets(hostBuckets)
	summary.BySession = finalizeBuckets(sessionBuckets)
	summary.ByCity = finalizeBuckets(cityBuckets)

	links := make([]AttributionLink, len(s.data.AttributionLinks))
	copy(links, s.data.AttributionLinks)
	sort.Slice(links, func(i, j int) bool {
		return links[i].CreatedAt.After(links[j].CreatedAt)
	})
	summary.AttributionLinks = links

	logs := make([]AuditLog, len(s.data.AuditLogs))
	copy(logs, s.data.AuditLogs)
	sort.Slice(logs, func(i, j int) bool {
		return logs[i].Timestamp.After(logs[j].Timestamp)
	})
	if len(logs) > 50 {
		logs = logs[:50]
	}
	summary.RecentAuditLogs = logs

	return summary, nil
}

// GetLiveCounterSnapshot builds the privacy-safe OBS Live Counter payload with masked names (e.g. "R*** · Bandung baru saja ukur frame — Kategori M").
func (s *Store) GetLiveCounterSnapshot(sessionFilter, hostFilter, srcFilter string, limit int, now time.Time) LiveCounterResponse {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if limit <= 0 || limit > 30 {
		limit = 12
	}
	wantSesi := strings.ToLower(strings.TrimSpace(sessionFilter))
	wantHost := strings.ToLower(strings.TrimSpace(hostFilter))
	wantSrc := strings.ToLower(strings.TrimSpace(srcFilter))

	s.mu.RLock()
	defer s.mu.RUnlock()

	sizeBreakdown := map[string]int{
		"XS": 0,
		"S":  0,
		"M":  0,
		"L":  0,
		"XL": 0,
	}

	matchedContacts := make(map[string]*Contact)
	var filteredEvents []ContactEvent

	for _, ev := range s.data.Events {
		if wantSesi != "" && strings.ToLower(strings.TrimSpace(ev.SessionCode)) != wantSesi {
			continue
		}
		if wantHost != "" && strings.ToLower(strings.TrimSpace(ev.HostCode)) != wantHost {
			continue
		}
		if wantSrc != "" && strings.ToLower(strings.TrimSpace(ev.Source)) != wantSrc {
			continue
		}
		filteredEvents = append(filteredEvents, ev)
		if c, ok := s.data.Contacts[ev.ContactID]; ok {
			matchedContacts[c.ID] = c
		}
		cat := normalizeSizeCategoryCode(ev.Payload.SizeCategory)
		if isValidSizeCategoryCode(cat) {
			sizeBreakdown[cat]++
		}
	}

	// If no filter is set, include all contacts in total count
	if wantSesi == "" && wantHost == "" && wantSrc == "" {
		for id, c := range s.data.Contacts {
			matchedContacts[id] = c
		}
	}

	totalLeads := len(matchedContacts)
	verifiedLeads := 0
	for _, c := range matchedContacts {
		if c.VerificationStatus == StatusVerified {
			verifiedLeads++
		}
	}

	sort.Slice(filteredEvents, func(i, j int) bool {
		return filteredEvents[i].CreatedAt.After(filteredEvents[j].CreatedAt)
	})

	toasts := make([]LiveCounterToast, 0, limit)
	for _, ev := range filteredEvents {
		if len(toasts) >= limit {
			break
		}
		c := s.data.Contacts[ev.ContactID]
		maskedName := "M***"
		city := "Indonesia"
		if c != nil {
			maskedName = MaskLiveToastName(c.FullName)
			if strings.TrimSpace(c.CityRegency) != "" {
				city = c.CityRegency
			}
		}

		cat := normalizeSizeCategoryCode(ev.Payload.SizeCategory)
		if cat == "" && ev.Payload.FrameWidthMM > 0 {
			cat = s.MatchSizeCategoryLocked(ev.Payload.FrameWidthMM).Category
		}
		if cat == "" {
			cat = "M"
		}

		var actionText string
		switch ev.EventType {
		case EventFrameMeasured:
			actionText = fmt.Sprintf("baru saja ukur frame — Kategori %s", cat)
		case EventFrameTried:
			frameLabel := strings.TrimSpace(ev.Payload.FrameName)
			if frameLabel == "" {
				frameLabel = strings.TrimSpace(ev.Payload.FrameSKU)
			}
			if frameLabel != "" {
				actionText = fmt.Sprintf("mencoba virtual try-on %s — Kategori %s", frameLabel, cat)
			} else {
				actionText = fmt.Sprintf("mencoba virtual try-on — Kategori %s", cat)
			}
		case EventStoreVisit:
			outlet := strings.TrimSpace(ev.Payload.OutletID)
			if outlet == "" {
				outlet = "Outlet DOOZ"
			}
			actionText = fmt.Sprintf("check-in di %s — Kategori %s", outlet, cat)
		case EventVoucherClaimed:
			actionText = "mengklaim voucher member DOOZ"
		default:
			actionText = fmt.Sprintf("aktivitas member — Kategori %s", cat)
		}

		msg := fmt.Sprintf("%s · %s %s", maskedName, city, actionText)
		toasts = append(toasts, LiveCounterToast{
			ID:           ev.ID,
			MaskedName:   maskedName,
			CityRegency:  city,
			EventType:    ev.EventType,
			SizeCategory: cat,
			FrameWidthMM: ev.Payload.FrameWidthMM,
			FrameName:    ev.Payload.FrameName,
			Source:       ev.Source,
			HostCode:     ev.HostCode,
			SessionCode:  ev.SessionCode,
			Message:      msg,
			CreatedAt:    ev.CreatedAt,
		})
	}

	return LiveCounterResponse{
		OK:            true,
		SessionFilter: sessionFilter,
		HostFilter:    hostFilter,
		TotalLeads:    totalLeads,
		VerifiedLeads: verifiedLeads,
		TotalEvents:   len(filteredEvents),
		SizeBreakdown: sizeBreakdown,
		RecentToasts:  toasts,
		UpdatedAt:     now,
	}
}

// PerformKasirLevel2Action records an outlet action (store_visit, voucher_claimed, frame_tried, purchase)
// after verifying the customer's rotating signed QR token (Level 2).
func (s *Store) PerformKasirLevel2Action(qrToken, eventType string, payload EventPayload, actorUserID, role, outletID string, now time.Time) (*KasirLevel2Response, *ContactEvent, error) {
	if role != RoleKasir && role != RoleAdmin && role != RoleOwner {
		return nil, nil, ErrUnauthorizedRole
	}
	if !IsValidEventType(eventType) {
		return nil, nil, fmt.Errorf("invalid event_type: %s", eventType)
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	claims, err := s.signer.VerifyMemberQRToken(qrToken, now)
	if err != nil {
		return nil, nil, err
	}

	s.mu.Lock()
	contact, ok := s.data.Contacts[claims.ContactID]
	if !ok {
		s.mu.Unlock()
		return nil, nil, ErrContactNotFound
	}

	contact.LastActiveAt = now
	contact.UpdatedAt = now
	if payload.OutletID == "" {
		payload.OutletID = outletID
	}
	payload = s.enrichFramePayloadLocked(payload)

	ev := ContactEvent{
		ID:        GenerateUUID(),
		ContactID: contact.ID,
		EventType: eventType,
		Payload:   payload,
		Source:    "outlet_kasir_level2",
		CreatedAt: now,
	}
	s.data.Events = append(s.data.Events, ev)
	if eventType == EventFrameMeasured {
		// Ukuran yang diukur di outlet masuk ke "Ukuran Saya" member (source=outlet).
		s.addOutletMeasurementLocked(contact.ID, payload, now)
	}

	s.appendAuditLogLocked(
		actorUserID,
		role,
		outletID,
		contact.ID,
		"kasir_level2_"+eventType,
		AuditLevel2QR,
		fmt.Sprintf("Recorded %s at %s via Level 2 QR (%s)", eventType, payload.OutletID, contact.MemberCode),
		now,
	)
	_ = s.persistLocked()
	s.mu.Unlock()

	level2View, err := s.LookupContactLevel2ByQR(qrToken, actorUserID, role, outletID, now)
	if err != nil {
		return nil, nil, err
	}
	return level2View, &ev, nil
}

// EnsureDemoVerifiedMemberForKasir creates or retrieves a demo verified customer and returns their phone & active rotating QR token.
func (s *Store) EnsureDemoVerifiedMemberForKasir(now time.Time) (phone string, qrToken string, memberCode string, err error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	demoPhone := "6281299887766"

	s.mu.Lock()
	contact := s.findContactByPhoneLocked(demoPhone)
	if contact == nil {
		contact = &Contact{
			ID:                 GenerateUUID(),
			MemberCode:         s.uniqueMemberCodeLocked(),
			PhoneNormalized:    demoPhone,
			PhoneMasked:        MaskPhoneDisplay(demoPhone),
			FullName:           "Rina Kartika",
			CityRegency:        "Kota Surakarta (Solo)",
			VerificationStatus: StatusVerified,
			LastActiveAt:       now,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		s.data.Contacts[contact.ID] = contact
		s.data.Events = append(s.data.Events,
			ContactEvent{
				ID:          GenerateUUID(),
				ContactID:   contact.ID,
				EventType:   EventFrameMeasured,
				Payload:     EventPayload{FrameWidthMM: 138, BridgeMM: 18, TempleMM: 142, SizeCategory: "M", FrameSKU: "DOOZ-CLS-001", FrameName: "Classic Black"},
				Source:      "live_tiktok",
				HostCode:    "rina",
				SessionCode: "20261116",
				CreatedAt:   now.Add(-30 * time.Minute),
			},
			ContactEvent{
				ID:          GenerateUUID(),
				ContactID:   contact.ID,
				EventType:   EventFrameTried,
				Payload:     EventPayload{FrameWidthMM: 138, BridgeMM: 18, TempleMM: 142, SizeCategory: "M", FrameSKU: "DOOZ-CLS-001", FrameName: "Classic Black"},
				Source:      "glasses_try_on",
				HostCode:    "rina",
				SessionCode: "20261116",
				CreatedAt:   now.Add(-25 * time.Minute),
			},
			ContactEvent{
				ID:          GenerateUUID(),
				ContactID:   contact.ID,
				EventType:   EventFrameTried,
				Payload:     EventPayload{FrameWidthMM: 132, BridgeMM: 17, TempleMM: 140, SizeCategory: "S", FrameSKU: "DOOZ-RND-003", FrameName: "Retro Round"},
				Source:      "glasses_try_on",
				HostCode:    "rina",
				SessionCode: "20261116",
				CreatedAt:   now.Add(-20 * time.Minute),
			},
			ContactEvent{
				ID:          GenerateUUID(),
				ContactID:   contact.ID,
				EventType:   EventVoucherClaimed,
				Payload:     EventPayload{VoucherCode: "LIVE-DOOZ50K", AmountIDR: 50000, Notes: "Voucher Potongan Rp 50.000 Sesi Live TikTok"},
				Source:      "live_tiktok",
				HostCode:    "rina",
				SessionCode: "20261116",
				CreatedAt:   now.Add(-15 * time.Minute),
			},
		)
		_ = s.persistLocked()
	}
	cid := contact.ID
	mCode := contact.MemberCode
	s.mu.Unlock()

	tok, _, err := s.signer.GenerateMemberQRToken(cid, mCode, now)
	return "081299887766", tok, mCode, err
}

func (s *Server) handleAdminDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	_, role, _ := extractStaffContext(r)
	stats, err := s.cfg.Store.GetAdminDashboardStats(role, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleLiveCounter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	q := r.URL.Query()
	sesi := q.Get("sesi")
	host := q.Get("host")
	src := q.Get("src")
	snap := s.cfg.Store.GetLiveCounterSnapshot(sesi, host, src, 12, s.cfg.Clock())
	writeJSON(w, http.StatusOK, snap)
}

func (s *Server) handleKasirLevel2Action(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	actorID, role, outletID := extractStaffContext(r)
	var req struct {
		QRToken   string       `json:"qr_token"`
		EventType string       `json:"event_type"`
		Payload   EventPayload `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	view, ev, err := s.cfg.Store.PerformKasirLevel2Action(req.QRToken, req.EventType, req.Payload, actorID, role, outletID, s.cfg.Clock())
	if err != nil {
		writeStaffError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"event":   ev,
		"profile": view,
	})
}

func (s *Server) handleKasirDemoMemberQR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	phone, qrTok, memberCode, err := s.cfg.Store.EnsureDemoVerifiedMemberForKasir(s.cfg.Clock())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"phone":       phone,
		"qr_token":    qrTok,
		"member_code": memberCode,
	})
}

func (s *Server) handleLiveCounterWebPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(liveCounterOverlayHTML))
}

// liveCounterOverlayHTML adalah overlay OBS Live tanpa build web (latar transparan, nama tersamar R***).
const liveCounterOverlayHTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>Overlay Live — Kacamata DOOZ</title>
  <style>
    body { margin: 0; padding: 16px; background: transparent; color: #fff; font-family: Inter, system-ui, sans-serif; }
    .widget { max-width: 420px; background: rgba(37,42,45,0.92); border: 2px solid #EC6702; border-radius: 16px; padding: 14px 16px; }
    .badge { font-size: 11px; font-weight: 800; color: #EC6702; text-transform: uppercase; letter-spacing: 0.12em; }
    .counter-row { display: flex; align-items: baseline; gap: 12px; margin: 6px 0 10px; }
    .big-num { font-size: 40px; font-weight: 800; color: #fff; }
    .toast { padding: 8px 10px; border-radius: 10px; background: rgba(255,248,240,0.08); margin-top: 6px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="widget">
    <div class="badge">● LIVE Kacamata DOOZ</div>
    <div class="counter-row">
      <span class="big-num" id="total-leads">0</span>
      <span>penonton sudah ukur &amp; coba frame</span>
    </div>
    <div id="toast-list">Menunggu penonton...</div>
  </div>
  <script>
    async function refresh() {
      try {
        const res = await fetch('/api/live/counter' + window.location.search);
        const data = await res.json();
        document.getElementById('total-leads').textContent = data.total_leads || 0;
        const list = document.getElementById('toast-list');
        list.innerHTML = '';
        const toasts = (data.recent_toasts || []).slice(0, 4);
        if (toasts.length === 0) {
          list.textContent = 'Menunggu penonton...';
        }
        toasts.forEach(function (t) {
          const el = document.createElement('div');
          el.className = 'toast';
          el.textContent = t.message;
          list.appendChild(el);
        });
      } catch (e) {}
    }
    refresh();
    setInterval(refresh, 4000);
  </script>
</body>
</html>`
