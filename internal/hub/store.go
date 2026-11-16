package hub

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type storeSnapshot struct {
	Contacts          map[string]*Contact          `json:"contacts"`
	Events            []ContactEvent               `json:"events"`
	Consents          []Consent                    `json:"consents"`
	VerificationCodes map[string]*VerificationCode `json:"verification_codes"`
	MagicLinks        map[string]*MagicLink        `json:"magic_links"`
	MemberSessions    map[string]*MemberSession    `json:"member_sessions"`
	AttributionLinks  []AttributionLink            `json:"attribution_links"`
	AuditLogs         []AuditLog                   `json:"audit_logs"`
}

type Store struct {
	mu       sync.RWMutex
	filePath string
	signer   *SecuritySigner
	data     storeSnapshot
}

func NewStore(filePath string, signer *SecuritySigner) (*Store, error) {
	if signer == nil {
		signer = NewSecuritySigner("")
	}
	s := &Store{
		filePath: strings.TrimSpace(filePath),
		signer:   signer,
		data: storeSnapshot{
			Contacts:          make(map[string]*Contact),
			Events:            make([]ContactEvent, 0),
			Consents:          make([]Consent, 0),
			VerificationCodes: make(map[string]*VerificationCode),
			MagicLinks:        make(map[string]*MagicLink),
			MemberSessions:    make(map[string]*MemberSession),
			AttributionLinks:  make([]AttributionLink, 0),
			AuditLogs:         make([]AuditLog, 0),
		},
	}
	if s.filePath != "" && s.filePath != ":memory:" {
		if err := s.loadFromDisk(); err != nil && !os.IsNotExist(err) {
			return nil, err
		}
	}
	return s, nil
}

func (s *Store) loadFromDisk() error {
	raw, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}
	if len(raw) == 0 {
		return nil
	}
	var snap storeSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		return err
	}
	if snap.Contacts == nil {
		snap.Contacts = make(map[string]*Contact)
	}
	if snap.VerificationCodes == nil {
		snap.VerificationCodes = make(map[string]*VerificationCode)
	}
	if snap.MagicLinks == nil {
		snap.MagicLinks = make(map[string]*MagicLink)
	}
	if snap.MemberSessions == nil {
		snap.MemberSessions = make(map[string]*MemberSession)
	}
	s.data = snap
	return nil
}

func (s *Store) persistLocked() error {
	if s.filePath == "" || s.filePath == ":memory:" {
		return nil
	}
	dir := filepath.Dir(s.filePath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.filePath)
}

func (s *Store) findContactByPhoneLocked(phoneNormalized string) *Contact {
	for _, c := range s.data.Contacts {
		if c.PhoneNormalized == phoneNormalized {
			return c
		}
	}
	return nil
}

func (s *Store) uniqueMemberCodeLocked() string {
	for {
		code := GenerateMemberCode()
		exists := false
		for _, c := range s.data.Contacts {
			if c.MemberCode == code {
				exists = true
				break
			}
		}
		if !exists {
			return code
		}
	}
}

func (s *Store) uniqueVerificationCodeLocked() string {
	for {
		code := GenerateVerificationCodeStr()
		if _, exists := s.data.VerificationCodes[code]; !exists {
			return code
		}
	}
}

type IdentifyLeadInput struct {
	FullName          string       `json:"full_name"`
	PhoneRaw          string       `json:"phone"`
	CityRegency       string       `json:"city_regency"`
	EventType         string       `json:"event_type"`
	Payload           EventPayload `json:"payload"`
	Source            string       `json:"src"`
	HostCode          string       `json:"host"`
	SessionCode       string       `json:"sesi"`
	Signature         string       `json:"sig"`
	GrantCRMWAConsent bool         `json:"consent_crm_wa"`
	GrantHealth       bool         `json:"consent_health_prescription"`
	Honeypot          string       `json:"honeypot,omitempty"`
	TurnstileToken    string       `json:"turnstile_token,omitempty"`
	IPAddress         string       `json:"-"`
	UserAgent         string       `json:"-"`
	Now               time.Time    `json:"-"`
}

type IdentifyLeadResult struct {
	ContactID        string    `json:"contact_id"`
	VerificationCode string    `json:"verification_code"` // DZ-xxxx
	ExpiresAt        time.Time `json:"expires_at"`
	WAMeURL          string    `json:"wa_me_url"`
	UniformMessage   string    `json:"message"`
}

// UpsertLeadPending saves a pending lead, records optional event & consents, and issues a single-use DZ-xxxx code (TTL 30m).
func (s *Store) UpsertLeadPending(in IdentifyLeadInput, officialWANumber string) (*IdentifyLeadResult, error) {
	normPhone, err := NormalizePhone(in.PhoneRaw)
	if err != nil {
		return nil, err
	}
	now := in.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	contact := s.findContactByPhoneLocked(normPhone)
	if contact == nil {
		contact = &Contact{
			ID:                 GenerateUUID(),
			MemberCode:         s.uniqueMemberCodeLocked(),
			PhoneNormalized:    normPhone,
			PhoneMasked:        MaskPhoneDisplay(normPhone),
			FullName:           strings.TrimSpace(in.FullName),
			CityRegency:        strings.TrimSpace(in.CityRegency),
			VerificationStatus: StatusPending,
			LastActiveAt:       now,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		s.data.Contacts[contact.ID] = contact
	} else {
		if strings.TrimSpace(in.FullName) != "" && contact.VerificationStatus != StatusVerified {
			contact.FullName = strings.TrimSpace(in.FullName)
		}
		if strings.TrimSpace(in.CityRegency) != "" {
			contact.CityRegency = strings.TrimSpace(in.CityRegency)
		}
		contact.UpdatedAt = now
	}

	// Record event if valid
	if IsValidEventType(in.EventType) {
		ev := ContactEvent{
			ID:          GenerateUUID(),
			ContactID:   contact.ID,
			EventType:   in.EventType,
			Payload:     in.Payload,
			Source:      strings.TrimSpace(in.Source),
			HostCode:    strings.TrimSpace(in.HostCode),
			SessionCode: strings.TrimSpace(in.SessionCode),
			CreatedAt:   now,
		}
		s.data.Events = append(s.data.Events, ev)
	}

	if in.GrantCRMWAConsent {
		s.upsertConsentLocked(contact.ID, ConsentCRMWA, true, in.IPAddress, in.UserAgent, now)
	}
	if in.GrantHealth {
		s.upsertConsentLocked(contact.ID, ConsentHealthPrescription, true, in.IPAddress, in.UserAgent, now)
	}

	dzCode := s.uniqueVerificationCodeLocked()
	exp := now.Add(VerificationCodeTTL)
	s.data.VerificationCodes[dzCode] = &VerificationCode{
		Code:       dzCode,
		ContactID:  contact.ID,
		PhoneInput: normPhone,
		ExpiresAt:  exp,
		CreatedAt:  now,
	}

	_ = s.persistLocked()

	waTarget := strings.TrimSpace(officialWANumber)
	if waTarget == "" {
		waTarget = "6281122334455"
	}
	// Privacy minimization: wa.me text contains ONLY the unique DZ-xxxx code (no personal name/city)
	waURL := fmt.Sprintf("https://wa.me/%s?text=Halo%%20DOOZ%%2C%%20verifikasi%%20hasil%%20ukur%%20saya%%20kode%%3A%%20%s", waTarget, dzCode)

	return &IdentifyLeadResult{
		ContactID:        contact.ID,
		VerificationCode: dzCode,
		ExpiresAt:        exp,
		WAMeURL:          waURL,
		UniformMessage:   "Silakan kirim pesan WhatsApp berisi kode verifikasi untuk menerima hasil ukur dan kartu member DOOZ.",
	}, nil
}

func (s *Store) upsertConsentLocked(contactID, scope string, granted bool, ip, ua string, now time.Time) {
	for i := range s.data.Consents {
		if s.data.Consents[i].ContactID == contactID && s.data.Consents[i].Scope == scope {
			s.data.Consents[i].Granted = granted
			s.data.Consents[i].IPAddress = ip
			s.data.Consents[i].UserAgent = ua
			if granted {
				s.data.Consents[i].GrantedAt = now
				s.data.Consents[i].RevokedAt = nil
			} else {
				rev := now
				s.data.Consents[i].RevokedAt = &rev
			}
			return
		}
	}
	var rev *time.Time
	if !granted {
		r := now
		rev = &r
	}
	s.data.Consents = append(s.data.Consents, Consent{
		ID:        GenerateUUID(),
		ContactID: contactID,
		Scope:     scope,
		Granted:   granted,
		IPAddress: ip,
		UserAgent: ua,
		GrantedAt: now,
		RevokedAt: rev,
	})
}

// RecordEvent adds an omnichannel event for an existing contact.
func (s *Store) RecordEvent(contactID, eventType string, payload EventPayload, src, host, sesi string, now time.Time) (*ContactEvent, error) {
	if !IsValidEventType(eventType) {
		return nil, fmt.Errorf("invalid event_type: %s", eventType)
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	c, ok := s.data.Contacts[contactID]
	if !ok {
		return nil, ErrContactNotFound
	}
	c.LastActiveAt = now
	c.UpdatedAt = now

	ev := ContactEvent{
		ID:          GenerateUUID(),
		ContactID:   contactID,
		EventType:   eventType,
		Payload:     payload,
		Source:      strings.TrimSpace(src),
		HostCode:    strings.TrimSpace(host),
		SessionCode: strings.TrimSpace(sesi),
		CreatedAt:   now,
	}
	s.data.Events = append(s.data.Events, ev)
	_ = s.persistLocked()
	return &ev, nil
}

// CreateManualWalkIn creates a contact entered manually by cashier staff with status 'unverified' (no outbound WA ever triggered).
func (s *Store) CreateManualWalkIn(fullName, phoneRaw, cityRegency, outletID, actorUserID, role string, payload EventPayload, now time.Time) (*Contact, error) {
	normPhone, err := NormalizePhone(phoneRaw)
	if err != nil {
		return nil, err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	contact := s.findContactByPhoneLocked(normPhone)
	if contact == nil {
		contact = &Contact{
			ID:                 GenerateUUID(),
			MemberCode:         s.uniqueMemberCodeLocked(),
			PhoneNormalized:    normPhone,
			PhoneMasked:        MaskPhoneDisplay(normPhone),
			FullName:           strings.TrimSpace(fullName),
			CityRegency:        strings.TrimSpace(cityRegency),
			VerificationStatus: StatusUnverified,
			LastActiveAt:       now,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		s.data.Contacts[contact.ID] = contact
	} else {
		if contact.VerificationStatus == StatusPending {
			contact.VerificationStatus = StatusUnverified
		}
		contact.UpdatedAt = now
	}

	if payload.FrameWidthMM > 0 || payload.SizeCategory != "" {
		s.data.Events = append(s.data.Events, ContactEvent{
			ID:        GenerateUUID(),
			ContactID: contact.ID,
			EventType: EventFrameMeasured,
			Payload:   payload,
			Source:    "outlet_walkin_manual",
			CreatedAt: now,
		})
	}
	s.data.Events = append(s.data.Events, ContactEvent{
		ID:        GenerateUUID(),
		ContactID: contact.ID,
		EventType: EventStoreVisit,
		Payload:   EventPayload{OutletID: outletID, Notes: "Manual walk-in input (unverified)"},
		Source:    "outlet_walkin_manual",
		CreatedAt: now,
	})

	s.appendAuditLogLocked(actorUserID, role, outletID, contact.ID, "manual_walkin_unverified", AuditLevel1Lookup, "Created manual unverified walk-in contact (no outbound WA sent)", now)
	_ = s.persistLocked()
	cp := *contact
	return &cp, nil
}

// VerifyByWebhookDZCode consumes a single-use DZ-xxxx code (TTL 30m), binds the contact's verified phone
// to the ACTUAL webhook sender phone (even if the user mistyped 1 digit in the web form), marks status='verified',
// and generates a one-time MagicLink (TTL 15m).
func (s *Store) VerifyByWebhookDZCode(code, actualSenderPhone string, now time.Time) (*Contact, *MagicLink, string, error) {
	senderNorm, err := NormalizePhone(actualSenderPhone)
	if err != nil {
		return nil, nil, "", err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	upperCode := strings.ToUpper(strings.TrimSpace(code))

	s.mu.Lock()
	defer s.mu.Unlock()

	vc, ok := s.data.VerificationCodes[upperCode]
	if !ok || vc.UsedAt != nil || now.After(vc.ExpiresAt) {
		return nil, nil, "", ErrVerificationCodeInvalid
	}

	pendingContact, ok := s.data.Contacts[vc.ContactID]
	if !ok {
		return nil, nil, "", ErrContactNotFound
	}

	// Check if actualSenderPhone belongs to an existing contact different from pendingContact
	existingBySender := s.findContactByPhoneLocked(senderNorm)
	var targetContact *Contact
	if existingBySender != nil && existingBySender.ID != pendingContact.ID {
		// Merge events and consents from pendingContact into existingBySender
		targetContact = existingBySender
		for i := range s.data.Events {
			if s.data.Events[i].ContactID == pendingContact.ID {
				s.data.Events[i].ContactID = targetContact.ID
			}
		}
		for i := range s.data.Consents {
			if s.data.Consents[i].ContactID == pendingContact.ID {
				s.data.Consents[i].ContactID = targetContact.ID
			}
		}
		if targetContact.FullName == "" {
			targetContact.FullName = pendingContact.FullName
		}
		if targetContact.CityRegency == "" {
			targetContact.CityRegency = pendingContact.CityRegency
		}
		delete(s.data.Contacts, pendingContact.ID)
	} else {
		// Rebind pendingContact to the actual sender's phone number from the webhook!
		targetContact = pendingContact
		targetContact.PhoneNormalized = senderNorm
		targetContact.PhoneMasked = MaskPhoneDisplay(senderNorm)
	}

	targetContact.VerificationStatus = StatusVerified
	targetContact.LastActiveAt = now
	targetContact.UpdatedAt = now

	usedTime := now
	vc.UsedAt = &usedTime
	vc.UsedByPhone = senderNorm

	ml := &MagicLink{
		Token:               GenerateSecureToken(24),
		ContactID:           targetContact.ID,
		RequiresNameConfirm: false,
		ExpiresAt:           now.Add(MagicLinkTTL),
		CreatedAt:           now,
	}
	s.data.MagicLinks[ml.Token] = ml

	sizeSummary := s.latestMeasurementSummaryLocked(targetContact.ID)
	_ = s.persistLocked()

	cpContact := *targetContact
	cpML := *ml
	return &cpContact, &cpML, sizeSummary, nil
}

// CreateMagicLinkForInboundCommand creates a magic link when an existing verified user sends MASUK or DATA.
// Enforces >6 months passive recycled-number protection!
func (s *Store) CreateMagicLinkForInboundCommand(actualSenderPhone string, now time.Time) (*Contact, *MagicLink, string, error) {
	senderNorm, err := NormalizePhone(actualSenderPhone)
	if err != nil {
		return nil, nil, "", err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	contact := s.findContactByPhoneLocked(senderNorm)
	if contact == nil {
		return nil, nil, "", ErrContactNotFound
	}

	passiveRecycled := IsRecycledNumberPassive(contact.LastActiveAt, now)
	if !passiveRecycled {
		contact.LastActiveAt = now
		contact.UpdatedAt = now
	}

	ml := &MagicLink{
		Token:               GenerateSecureToken(24),
		ContactID:           contact.ID,
		RequiresNameConfirm: passiveRecycled,
		ExpiresAt:           now.Add(MagicLinkTTL),
		CreatedAt:           now,
	}
	s.data.MagicLinks[ml.Token] = ml

	sizeSummary := s.latestMeasurementSummaryLocked(contact.ID)
	_ = s.persistLocked()

	cpContact := *contact
	cpML := *ml
	return &cpContact, &cpML, sizeSummary, nil
}

func (s *Store) latestMeasurementSummaryLocked(contactID string) string {
	var latest *ContactEvent
	for i := range s.data.Events {
		ev := &s.data.Events[i]
		if ev.ContactID == contactID && ev.EventType == EventFrameMeasured {
			if latest == nil || ev.CreatedAt.After(latest.CreatedAt) {
				latest = ev
			}
		}
	}
	if latest == nil {
		return ""
	}
	if latest.Payload.FrameWidthMM > 0 && latest.Payload.SizeCategory != "" {
		return fmt.Sprintf("%.0f mm · Kategori %s", latest.Payload.FrameWidthMM, latest.Payload.SizeCategory)
	}
	if latest.Payload.SizeCategory != "" {
		return fmt.Sprintf("Kategori %s", latest.Payload.SizeCategory)
	}
	return ""
}

// InspectMagicLink checks a magic link without consuming it (safe for GET confirmation screen / WA link preview).
func (s *Store) InspectMagicLink(token string, now time.Time) (*MagicLink, *Contact, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	ml, ok := s.data.MagicLinks[strings.TrimSpace(token)]
	if !ok || ml.UsedAt != nil || now.After(ml.ExpiresAt) {
		return nil, nil, ErrMagicLinkInvalid
	}
	c, ok := s.data.Contacts[ml.ContactID]
	if !ok {
		return nil, nil, ErrContactNotFound
	}
	cpML := *ml
	cpC := *c
	return &cpML, &cpC, nil
}

// ExchangeMagicLink performs a one-time POST exchange of a magic link token for a 30-day MemberSession.
func (s *Store) ExchangeMagicLink(token, confirmFullName, ipAddress, userAgent string, now time.Time) (*MemberSession, *Contact, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	ml, ok := s.data.MagicLinks[strings.TrimSpace(token)]
	if !ok || ml.UsedAt != nil || now.After(ml.ExpiresAt) {
		return nil, nil, ErrMagicLinkInvalid
	}
	contact, ok := s.data.Contacts[ml.ContactID]
	if !ok {
		return nil, nil, ErrContactNotFound
	}

	scope := AccessScopeFull
	if ml.RequiresNameConfirm {
		if strings.TrimSpace(confirmFullName) == "" {
			// Allow opening basic summary session only until full name is confirmed
			scope = AccessScopeBasicRecycledPending
		} else if NamesMatchForRecycledConfirm(contact.FullName, confirmFullName) {
			scope = AccessScopeFull
			contact.LastActiveAt = now
			contact.UpdatedAt = now
		} else {
			return nil, nil, ErrRecycledConfirmationNeed
		}
	} else {
		contact.LastActiveAt = now
		contact.UpdatedAt = now
	}

	usedAt := now
	ml.UsedAt = &usedAt

	sess := &MemberSession{
		SessionToken: GenerateSecureToken(32),
		ContactID:    contact.ID,
		AccessScope:  scope,
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
		ExpiresAt:    now.Add(MemberSessionTTL),
		CreatedAt:    now,
	}
	s.data.MemberSessions[sess.SessionToken] = sess
	_ = s.persistLocked()

	cpSess := *sess
	cpContact := *contact
	return &cpSess, &cpContact, nil
}

// ConfirmRecycledSession upgrades a basic_recycled_pending session to full access upon verifying the registered full name.
func (s *Store) ConfirmRecycledSession(sessionToken, confirmFullName string, now time.Time) (*MemberSession, *Contact, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.data.MemberSessions[strings.TrimSpace(sessionToken)]
	if !ok || sess.RevokedAt != nil || now.After(sess.ExpiresAt) {
		return nil, nil, ErrSessionInvalid
	}
	contact, ok := s.data.Contacts[sess.ContactID]
	if !ok {
		return nil, nil, ErrContactNotFound
	}
	if !NamesMatchForRecycledConfirm(contact.FullName, confirmFullName) {
		return nil, nil, ErrRecycledConfirmationNeed
	}
	sess.AccessScope = AccessScopeFull
	contact.LastActiveAt = now
	contact.UpdatedAt = now
	_ = s.persistLocked()

	cpSess := *sess
	cpContact := *contact
	return &cpSess, &cpContact, nil
}

// RevokeAllSessionsByPhone revokes all active member sessions and unused magic links for a phone (triggered by WA 'KELUAR').
func (s *Store) RevokeAllSessionsByPhone(actualSenderPhone string, now time.Time) (*Contact, int, error) {
	senderNorm, err := NormalizePhone(actualSenderPhone)
	if err != nil {
		return nil, 0, err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	contact := s.findContactByPhoneLocked(senderNorm)
	if contact == nil {
		return nil, 0, ErrContactNotFound
	}
	revoked := s.revokeContactSessionsLocked(contact.ID, now)
	_ = s.persistLocked()
	cp := *contact
	return &cp, revoked, nil
}

// RevokeAllSessionsByContactID revokes all active sessions for a contact ID ("Keluar dari Semua Perangkat").
func (s *Store) RevokeAllSessionsByContactID(contactID string, now time.Time) (int, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.data.Contacts[contactID]; !ok {
		return 0, ErrContactNotFound
	}
	revoked := s.revokeContactSessionsLocked(contactID, now)
	_ = s.persistLocked()
	return revoked, nil
}

func (s *Store) revokeContactSessionsLocked(contactID string, now time.Time) int {
	count := 0
	for _, sess := range s.data.MemberSessions {
		if sess.ContactID == contactID && sess.RevokedAt == nil {
			rev := now
			sess.RevokedAt = &rev
			count++
		}
	}
	for _, ml := range s.data.MagicLinks {
		if ml.ContactID == contactID && ml.UsedAt == nil {
			used := now
			ml.UsedAt = &used
		}
	}
	return count
}

type MemberPortalView struct {
	AccessScope         string         `json:"access_scope"`
	RequiresNameConfirm bool           `json:"requires_name_confirm"`
	MemberCode          string         `json:"member_code"`
	FirstNameMasked     string         `json:"first_name_masked"`
	FullName            string         `json:"full_name,omitempty"`
	PhoneMasked         string         `json:"phone_masked"`
	CityRegency         string         `json:"city_regency,omitempty"`
	VerificationStatus  string         `json:"verification_status"`
	LatestMeasurement   *EventPayload  `json:"latest_measurement,omitempty"`
	TriedFrames         []ContactEvent `json:"tried_frames,omitempty"`
	StoreVisits         []ContactEvent `json:"store_visits,omitempty"`
	Vouchers            []ContactEvent `json:"vouchers,omitempty"`
	Consents            []Consent      `json:"consents,omitempty"`
	QRToken             string         `json:"qr_token,omitempty"`
	QRTokenExpiresAt    *time.Time     `json:"qr_token_expires_at,omitempty"`
}

// GetPortalViewBySession returns the member portal data for a valid session token.
// If the session is in 'basic_recycled_pending' scope (>6 months passive without name confirmation),
// only the basic summary is returned!
func (s *Store) GetPortalViewBySession(sessionToken string, now time.Time) (*MemberPortalView, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	sess, ok := s.data.MemberSessions[strings.TrimSpace(sessionToken)]
	if !ok || sess.RevokedAt != nil || now.After(sess.ExpiresAt) {
		return nil, ErrSessionInvalid
	}
	contact, ok := s.data.Contacts[sess.ContactID]
	if !ok {
		return nil, ErrContactNotFound
	}

	latestMeas := s.latestMeasurementPayloadLocked(contact.ID)

	view := &MemberPortalView{
		AccessScope:         sess.AccessScope,
		RequiresNameConfirm: sess.AccessScope == AccessScopeBasicRecycledPending,
		MemberCode:          contact.MemberCode,
		FirstNameMasked:     MaskFirstName(contact.FullName),
		PhoneMasked:         MaskPhoneDisplay(contact.PhoneNormalized),
		VerificationStatus:  contact.VerificationStatus,
		LatestMeasurement:   latestMeas,
	}

	if sess.AccessScope == AccessScopeFull {
		view.FullName = contact.FullName
		view.CityRegency = contact.CityRegency
		view.TriedFrames = s.filterEventsLocked(contact.ID, EventFrameTried, 0)
		view.StoreVisits = s.filterEventsLocked(contact.ID, EventStoreVisit, 0)
		view.Vouchers = s.filterEventsLocked(contact.ID, EventVoucherClaimed, 0)
		view.Consents = s.contactConsentsLocked(contact.ID)
		qrTok, qrExp, err := s.signer.GenerateMemberQRToken(contact.ID, contact.MemberCode, now)
		if err == nil {
			view.QRToken = qrTok
			view.QRTokenExpiresAt = &qrExp
		}
	}
	return view, nil
}

func (s *Store) latestMeasurementPayloadLocked(contactID string) *EventPayload {
	var latest *ContactEvent
	for i := range s.data.Events {
		ev := &s.data.Events[i]
		if ev.ContactID == contactID && ev.EventType == EventFrameMeasured {
			if latest == nil || ev.CreatedAt.After(latest.CreatedAt) {
				latest = ev
			}
		}
	}
	if latest == nil {
		return nil
	}
	cp := latest.Payload
	return &cp
}

func (s *Store) filterEventsLocked(contactID, eventType string, limit int) []ContactEvent {
	var list []ContactEvent
	for _, ev := range s.data.Events {
		if ev.ContactID == contactID && (eventType == "" || ev.EventType == eventType) {
			list = append(list, ev)
		}
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.After(list[j].CreatedAt)
	})
	if limit > 0 && len(list) > limit {
		list = list[:limit]
	}
	return list
}

func (s *Store) contactConsentsLocked(contactID string) []Consent {
	var list []Consent
	for _, c := range s.data.Consents {
		if c.ContactID == contactID {
			list = append(list, c)
		}
	}
	return list
}

type KasirLevel1Response struct {
	AccessLevel       string         `json:"access_level"` // level_1_lookup
	ContactID         string         `json:"contact_id"`
	MemberCode        string         `json:"member_code"`
	FirstNameInitial  string         `json:"first_name_initial"`
	PhoneMasked       string         `json:"phone_masked"` // 0812****4567
	LatestMeasurement *EventPayload  `json:"latest_measurement,omitempty"`
	RecentTriedFrames []ContactEvent `json:"recent_tried_frames"` // max 3
}

// LookupContactLevel1 performs Cashier Level 1 lookup by FULL WhatsApp number.
// Returns masked data only and writes an audit_log entry.
func (s *Store) LookupContactLevel1(fullPhoneRaw, actorUserID, role, outletID string, now time.Time) (*KasirLevel1Response, error) {
	if role != RoleKasir && role != RoleAdmin && role != RoleOwner {
		return nil, ErrUnauthorizedRole
	}
	normPhone, err := NormalizePhone(fullPhoneRaw)
	if err != nil {
		return nil, err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	contact := s.findContactByPhoneLocked(normPhone)
	targetID := ""
	if contact != nil {
		targetID = contact.ID
	}
	s.appendAuditLogLocked(actorUserID, role, outletID, targetID, "kasir_lookup_phone", AuditLevel1Lookup, "Lookup by full phone (masked: "+MaskPhoneDisplay(normPhone)+")", now)
	_ = s.persistLocked()

	if contact == nil {
		return nil, ErrContactNotFound
	}

	return &KasirLevel1Response{
		AccessLevel:       AuditLevel1Lookup,
		ContactID:         contact.ID,
		MemberCode:        contact.MemberCode,
		FirstNameInitial:  MaskFirstName(contact.FullName),
		PhoneMasked:       MaskPhoneDisplay(contact.PhoneNormalized),
		LatestMeasurement: s.latestMeasurementPayloadLocked(contact.ID),
		RecentTriedFrames: s.filterEventsLocked(contact.ID, EventFrameTried, 3),
	}, nil
}

type KasirLevel2Response struct {
	AccessLevel       string         `json:"access_level"` // level_2_qr
	Contact           Contact        `json:"contact"`
	LatestMeasurement *EventPayload  `json:"latest_measurement,omitempty"`
	TriedFrames       []ContactEvent `json:"tried_frames"`
	StoreVisits       []ContactEvent `json:"store_visits"`
	Vouchers          []ContactEvent `json:"vouchers"`
	Purchases         []ContactEvent `json:"purchases"`
	Consents          []Consent      `json:"consents"`
}

// LookupContactLevel2ByQR verifies the customer's rotating signed QR token, unlocks full profile access,
// clears any >6m recycled-number lock (since verified at outlet), and writes an audit_log entry.
func (s *Store) LookupContactLevel2ByQR(qrToken, actorUserID, role, outletID string, now time.Time) (*KasirLevel2Response, error) {
	if role != RoleKasir && role != RoleAdmin && role != RoleOwner {
		return nil, ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	claims, err := s.signer.VerifyMemberQRToken(qrToken, now)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	contact, ok := s.data.Contacts[claims.ContactID]
	if !ok {
		return nil, ErrContactNotFound
	}

	// Outlet QR verification refreshes activity and upgrades any pending recycled session
	contact.LastActiveAt = now
	contact.UpdatedAt = now
	for _, sess := range s.data.MemberSessions {
		if sess.ContactID == contact.ID && sess.RevokedAt == nil {
			sess.AccessScope = AccessScopeFull
		}
	}

	s.appendAuditLogLocked(actorUserID, role, outletID, contact.ID, "kasir_scan_qr_level2", AuditLevel2QR, "Unlocked full profile via rotating signed QR token ("+contact.MemberCode+")", now)
	_ = s.persistLocked()

	cpContact := *contact
	cpContact.PhoneMasked = MaskPhoneDisplay(cpContact.PhoneNormalized)
	// Keep raw phone hidden from UI display even in Level 2 JSON by masking PhoneNormalized if needed, or keeping PhoneMasked prominent
	return &KasirLevel2Response{
		AccessLevel:       AuditLevel2QR,
		Contact:           cpContact,
		LatestMeasurement: s.latestMeasurementPayloadLocked(contact.ID),
		TriedFrames:       s.filterEventsLocked(contact.ID, EventFrameTried, 0),
		StoreVisits:       s.filterEventsLocked(contact.ID, EventStoreVisit, 0),
		Vouchers:          s.filterEventsLocked(contact.ID, EventVoucherClaimed, 0),
		Purchases:         s.filterEventsLocked(contact.ID, EventPurchase, 0),
		Consents:          s.contactConsentsLocked(contact.ID),
	}, nil
}

// UpdateConsentBySession allows a logged-in member in Portal Data Saya to opt-out/opt-in of consents (UU PDP).
func (s *Store) UpdateConsentBySession(sessionToken, scope string, granted bool, ip, ua string, now time.Time) error {
	if scope != ConsentCRMWA && scope != ConsentHealthPrescription {
		return fmt.Errorf("invalid consent scope: %s", scope)
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.data.MemberSessions[strings.TrimSpace(sessionToken)]
	if !ok || sess.RevokedAt != nil || now.After(sess.ExpiresAt) {
		return ErrSessionInvalid
	}
	s.upsertConsentLocked(sess.ContactID, scope, granted, ip, ua, now)
	_ = s.persistLocked()
	return nil
}

// RequestDataDeletionBySession handles UU PDP right-to-erasure requests from Portal Data Saya.
func (s *Store) RequestDataDeletionBySession(sessionToken string, immediateDelete bool, now time.Time) error {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.data.MemberSessions[strings.TrimSpace(sessionToken)]
	if !ok || sess.RevokedAt != nil || now.After(sess.ExpiresAt) {
		return ErrSessionInvalid
	}
	contact, ok := s.data.Contacts[sess.ContactID]
	if !ok {
		return ErrContactNotFound
	}
	reqTime := now
	contact.DeletionRequestedAt = &reqTime
	s.revokeContactSessionsLocked(contact.ID, now)
	if immediateDelete {
		s.deleteContactCascadeLocked(contact.ID)
	}
	_ = s.persistLocked()
	return nil
}

// PurgeInactiveRetention deletes leads that have been inactive > 24 months (730 days) with no purchase events (UU PDP).
func (s *Store) PurgeInactiveRetention(actorUserID string, now time.Time) (int, []string, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if actorUserID == "" {
		actorUserID = "system-retention-cron"
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	hasPurchase := make(map[string]bool)
	for _, ev := range s.data.Events {
		if ev.EventType == EventPurchase {
			hasPurchase[ev.ContactID] = true
		}
	}

	var purgedIDs []string
	for id, c := range s.data.Contacts {
		if now.Sub(c.LastActiveAt) > RetentionPurgePeriod && !hasPurchase[id] {
			purgedIDs = append(purgedIDs, id)
		}
	}
	for _, id := range purgedIDs {
		s.deleteContactCascadeLocked(id)
	}

	s.appendAuditLogLocked(actorUserID, RoleAdmin, "", "", "uupdp_retention_purge", AuditSystemRetention, fmt.Sprintf("Purged %d inactive contacts (>24m passive without purchase)", len(purgedIDs)), now)
	_ = s.persistLocked()
	return len(purgedIDs), purgedIDs, nil
}

func (s *Store) deleteContactCascadeLocked(contactID string) {
	delete(s.data.Contacts, contactID)

	filteredEvents := s.data.Events[:0]
	for _, ev := range s.data.Events {
		if ev.ContactID != contactID {
			filteredEvents = append(filteredEvents, ev)
		}
	}
	s.data.Events = filteredEvents

	filteredConsents := s.data.Consents[:0]
	for _, c := range s.data.Consents {
		if c.ContactID != contactID {
			filteredConsents = append(filteredConsents, c)
		}
	}
	s.data.Consents = filteredConsents

	for code, vc := range s.data.VerificationCodes {
		if vc.ContactID == contactID {
			delete(s.data.VerificationCodes, code)
		}
	}
	for tok, ml := range s.data.MagicLinks {
		if ml.ContactID == contactID {
			delete(s.data.MagicLinks, tok)
		}
	}
	for tok, sess := range s.data.MemberSessions {
		if sess.ContactID == contactID {
			delete(s.data.MemberSessions, tok)
		}
	}
}

// ExportContactsCSV exports contacts CSV strictly for Owner/Admin roles and records an admin_export audit log.
func (s *Store) ExportContactsCSV(actorUserID, role, outletID string, now time.Time) (string, error) {
	if role != RoleOwner && role != RoleAdmin {
		return "", ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.appendAuditLogLocked(actorUserID, role, outletID, "*", "export_contacts_csv", AuditAdminExport, fmt.Sprintf("Exported %d contacts to CSV", len(s.data.Contacts)), now)
	_ = s.persistLocked()

	var sb strings.Builder
	w := csv.NewWriter(&sb)
	_ = w.Write([]string{"id", "member_code", "phone_masked", "full_name", "city_regency", "verification_status", "last_active_at"})

	var list []*Contact
	for _, c := range s.data.Contacts {
		list = append(list, c)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.Before(list[j].CreatedAt)
	})
	for _, c := range list {
		_ = w.Write([]string{
			c.ID,
			c.MemberCode,
			MaskPhoneDisplay(c.PhoneNormalized),
			c.FullName,
			c.CityRegency,
			c.VerificationStatus,
			c.LastActiveAt.Format(time.RFC3339),
		})
	}
	w.Flush()
	return sb.String(), nil
}

// SaveAttributionLink creates and persists a signed attribution link.
func (s *Store) SaveAttributionLink(baseURL, src, host, sesi, outlet, createdBy, role string, now time.Time) (*AttributionLink, error) {
	if role != RoleOwner && role != RoleAdmin {
		return nil, ErrUnauthorizedRole
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	signedURL, sig, err := s.signer.BuildSignedAttributionURL(baseURL, src, host, sesi, outlet)
	if err != nil {
		return nil, err
	}
	link := AttributionLink{
		ID:          GenerateUUID(),
		Source:      strings.TrimSpace(src),
		HostCode:    strings.TrimSpace(host),
		SessionCode: strings.TrimSpace(sesi),
		OutletID:    strings.TrimSpace(outlet),
		BaseURL:     strings.TrimSpace(baseURL),
		Signature:   sig,
		SignedURL:   signedURL,
		CreatedBy:   createdBy,
		CreatedAt:   now,
	}
	s.mu.Lock()
	s.data.AttributionLinks = append(s.data.AttributionLinks, link)
	_ = s.persistLocked()
	s.mu.Unlock()
	return &link, nil
}

func (s *Store) ListAuditLogs(role string) ([]AuditLog, error) {
	if role != RoleOwner && role != RoleAdmin {
		return nil, ErrUnauthorizedRole
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AuditLog, len(s.data.AuditLogs))
	copy(out, s.data.AuditLogs)
	sort.Slice(out, func(i, j int) bool {
		return out[i].Timestamp.After(out[j].Timestamp)
	})
	return out, nil
}

func (s *Store) appendAuditLogLocked(actorUserID, role, outletID, targetContactID, action, accessLevel, details string, now time.Time) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	s.data.AuditLogs = append(s.data.AuditLogs, AuditLog{
		ID:              GenerateUUID(),
		ActorUserID:     actorUserID,
		Role:            role,
		OutletID:        outletID,
		TargetContactID: targetContactID,
		Action:          action,
		AccessLevel:     accessLevel,
		Details:         details,
		Timestamp:       now,
	})
}

// GetContactByID returns a copy of a contact by ID.
func (s *Store) GetContactByID(id string) (*Contact, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.data.Contacts[id]
	if !ok {
		return nil, ErrContactNotFound
	}
	cp := *c
	return &cp, nil
}
