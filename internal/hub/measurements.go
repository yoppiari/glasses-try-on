package hub

// "Ukuran Saya": multi-ukuran milik member Kacamata DOOZ.
//
// Spesifikasi: Knowledge "Flow App Ukur: Simpan Ukuran & Member Kacamata DOOZ" bagian "Data di CRM".
// Kontrak API: docs/api-ukuran-saya.md.
//
// Invarian utama: setiap member yang punya >=1 ukuran memiliki TEPAT SATU ukuran utama (is_primary).
// Di SQL dijaga partial unique index (maks. satu) + logika store (min. satu: auto-promote saat hapus).

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	MeasurementSourceSelfMeasure = "self_measure"
	MeasurementSourceOutlet      = "outlet"
	MeasurementSourceTempleLabel = "temple_label"

	ComfortPasNyaman    = "pas_nyaman"
	ComfortKurangNyaman = "kurang_nyaman"
	ComfortTidakPas     = "tidak_pas"

	MaxMeasurementsPerMember = 20
	MaxMeasurementNameRunes  = 60
	MaxMeasurementNoteRunes  = 280

	// TempleLabelEndpieceMM adalah perkiraan total lebar dua endpiece (engsel kiri+kanan) yang ditambahkan
	// ke "2 × lebar lensa + bridge" untuk mendapat lebar depan frame dari angka gagang (mis. 52□18-140).
	TempleLabelEndpieceMM = 10.0

	// SessionClaimTTL: berapa lama App Ukur boleh mengambil sesi member lewat polling setelah nomor terverifikasi.
	SessionClaimTTL = 15 * time.Minute
	// WhatsAppLoginTTL: masa berlaku kode "Masuk lewat WhatsApp".
	WhatsAppLoginTTL = 15 * time.Minute

	DefaultFirstMeasurementName = "Ukuran pertama saya"

	AppUkur = "ukur"
)

var (
	ErrMeasurementNotFound    = errors.New("measurement not found")
	ErrInvalidMeasurement     = errors.New("invalid measurement")
	ErrMeasurementLimit       = fmt.Errorf("measurement limit reached (max %d per member)", MaxMeasurementsPerMember)
	ErrSessionScopeRestricted = errors.New("session restricted: confirm registered full name first")
	ErrVerificationNotFound   = errors.New("verification request not found")
)

// Measurement adalah satu ukuran milik member ("Ukuran Saya").
type Measurement struct {
	ID           string    `json:"id"`
	CustomerID   string    `json:"customer_id"`
	Name         string    `json:"name"`
	Note         string    `json:"note"`
	FrameWidthMM float64   `json:"frame_width_mm"`
	SizeCategory string    `json:"size_category"`
	LensMM       *float64  `json:"lens_mm"`
	BridgeMM     *float64  `json:"bridge_mm"`
	TempleMM     *float64  `json:"temple_mm"`
	Comfort      *string   `json:"comfort"`
	IsPrimary    bool      `json:"is_primary"`
	Source       string    `json:"source"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// MeasurementInput adalah data ukuran yang dikirim klien (identify App Ukur atau create dari sesi member).
// size_category dari klien diabaikan: kategori selalu dihitung dari size-chart Katalog Bersama.
type MeasurementInput struct {
	Name         string   `json:"name"`
	Note         string   `json:"note"`
	FrameWidthMM float64  `json:"frame_width_mm"`
	LensMM       *float64 `json:"lens_mm,omitempty"`
	BridgeMM     *float64 `json:"bridge_mm,omitempty"`
	TempleMM     *float64 `json:"temple_mm,omitempty"`
	TempleLabel  string   `json:"temple_label,omitempty"` // mis. "52□18-140"
	Comfort      *string  `json:"comfort,omitempty"`
	Source       string   `json:"source,omitempty"`
	SetPrimary   bool     `json:"set_primary,omitempty"`
}

// KasirMeasurementCategory adalah satu-satunya data ukuran yang boleh dilihat kasir Level 1.
type KasirMeasurementCategory struct {
	SizeCategory string `json:"size_category"`
}

// LoginRequest adalah permintaan "Masuk lewat WhatsApp" dari HP lain (tanpa kontak; kontak diambil dari nomor pengirim WA).
type LoginRequest struct {
	Code              string     `json:"code"` // DZ-xxxx (satu ruang nama dengan verification_codes)
	PollTokenHash     string     `json:"poll_token_hash"`
	App               string     `json:"app,omitempty"`
	ExpiresAt         time.Time  `json:"expires_at"`
	UsedAt            *time.Time `json:"used_at,omitempty"`
	Result            string     `json:"result,omitempty"` // link_sent | not_member
	VerifiedContactID string     `json:"verified_contact_id,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

var templeLabelRegex = regexp.MustCompile(`^\s*(\d{2}(?:[.,]\d)?)\s*(?:□|☐|▢|◻|⬜|\[\]|x|X|×|\*|-|–|/|\s)\s*(\d{1,2}(?:[.,]\d)?)\s*(?:-|–|/|x|X|×|\s)\s*(\d{3}(?:[.,]\d)?)\s*$`)

// ParseTempleLabel mem-parse angka di gagang kacamata, mis. "52□18-140", "52-18-140", "52 18 140".
func ParseTempleLabel(label string) (lens, bridge, temple float64, err error) {
	m := templeLabelRegex.FindStringSubmatch(strings.TrimSpace(label))
	if len(m) != 4 {
		return 0, 0, 0, fmt.Errorf("%w: temple_label must look like 52□18-140", ErrInvalidMeasurement)
	}
	parse := func(s string) float64 {
		v, _ := strconv.ParseFloat(strings.ReplaceAll(s, ",", "."), 64)
		return v
	}
	return parse(m[1]), parse(m[2]), parse(m[3]), nil
}

// FrameWidthFromTempleLabel menghitung perkiraan lebar depan frame dari lebar lensa & bridge.
func FrameWidthFromTempleLabel(lensMM, bridgeMM float64) float64 {
	return roundMM(2*lensMM + bridgeMM + TempleLabelEndpieceMM)
}

func roundMM(v float64) float64 { return math.Round(v*10) / 10 }

func isValidComfort(c string) bool {
	switch c {
	case ComfortPasNyaman, ComfortKurangNyaman, ComfortTidakPas:
		return true
	}
	return false
}

func isValidMeasurementSource(s string) bool {
	switch s {
	case MeasurementSourceSelfMeasure, MeasurementSourceOutlet, MeasurementSourceTempleLabel:
		return true
	}
	return false
}

func truncateRunes(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	return string([]rune(s)[:max])
}

func floatPtr(v float64) *float64 { return &v }

func checkRange(name string, v *float64, lo, hi float64) error {
	if v == nil {
		return nil
	}
	if *v < lo || *v > hi || math.IsNaN(*v) {
		return fmt.Errorf("%w: %s must be between %.0f and %.0f mm", ErrInvalidMeasurement, name, lo, hi)
	}
	return nil
}

// normalizeMeasurementInput memvalidasi input dan mengisi nilai turunan (lebar dari gagang, nama default).
// Tidak menghitung kategori (butuh lock store) — lihat buildMeasurementLocked.
func normalizeMeasurementInput(in MeasurementInput, allowOutlet bool) (MeasurementInput, error) {
	in.Source = strings.ToLower(strings.TrimSpace(in.Source))
	if strings.TrimSpace(in.TempleLabel) != "" {
		lens, bridge, temple, err := ParseTempleLabel(in.TempleLabel)
		if err != nil {
			return in, err
		}
		in.LensMM, in.BridgeMM, in.TempleMM = floatPtr(lens), floatPtr(bridge), floatPtr(temple)
		if in.Source == "" {
			in.Source = MeasurementSourceTempleLabel
		}
	}
	if in.Source == "" {
		in.Source = MeasurementSourceSelfMeasure
	}
	if !isValidMeasurementSource(in.Source) {
		return in, fmt.Errorf("%w: source must be self_measure, outlet, or temple_label", ErrInvalidMeasurement)
	}
	if in.Source == MeasurementSourceOutlet && !allowOutlet {
		return in, fmt.Errorf("%w: source outlet can only be recorded by outlet staff", ErrInvalidMeasurement)
	}
	if err := checkRange("lens_mm", in.LensMM, 30, 75); err != nil {
		return in, err
	}
	if err := checkRange("bridge_mm", in.BridgeMM, 10, 30); err != nil {
		return in, err
	}
	if err := checkRange("temple_mm", in.TempleMM, 100, 170); err != nil {
		return in, err
	}
	if in.Source == MeasurementSourceTempleLabel && in.FrameWidthMM <= 0 {
		if in.LensMM == nil || in.BridgeMM == nil {
			return in, fmt.Errorf("%w: temple_label source needs lens_mm and bridge_mm (or temple_label)", ErrInvalidMeasurement)
		}
		in.FrameWidthMM = FrameWidthFromTempleLabel(*in.LensMM, *in.BridgeMM)
	}
	if in.FrameWidthMM < 90 || in.FrameWidthMM > 200 || math.IsNaN(in.FrameWidthMM) {
		return in, fmt.Errorf("%w: frame_width_mm must be between 90 and 200", ErrInvalidMeasurement)
	}
	in.FrameWidthMM = roundMM(in.FrameWidthMM)
	if in.Comfort != nil {
		c := strings.ToLower(strings.TrimSpace(*in.Comfort))
		if c == "" {
			in.Comfort = nil
		} else if !isValidComfort(c) {
			return in, fmt.Errorf("%w: comfort must be pas_nyaman, kurang_nyaman, tidak_pas, or null", ErrInvalidMeasurement)
		} else {
			in.Comfort = &c
		}
	}
	in.Name = truncateRunes(in.Name, MaxMeasurementNameRunes)
	in.Note = truncateRunes(in.Note, MaxMeasurementNoteRunes)
	return in, nil
}

func defaultMeasurementName(source string, existingCount int) string {
	switch {
	case existingCount == 0:
		return DefaultFirstMeasurementName
	case source == MeasurementSourceOutlet:
		return "Diukur di outlet"
	case source == MeasurementSourceTempleLabel:
		return "Dari gagang kacamata"
	default:
		return fmt.Sprintf("Ukuran %d", existingCount+1)
	}
}

func cloneMeasurement(m *Measurement) Measurement {
	cp := *m
	if m.LensMM != nil {
		cp.LensMM = floatPtr(*m.LensMM)
	}
	if m.BridgeMM != nil {
		cp.BridgeMM = floatPtr(*m.BridgeMM)
	}
	if m.TempleMM != nil {
		cp.TempleMM = floatPtr(*m.TempleMM)
	}
	if m.Comfort != nil {
		c := *m.Comfort
		cp.Comfort = &c
	}
	return cp
}

func (s *Store) contactMeasurementsLocked(contactID string) []*Measurement {
	var list []*Measurement
	for _, m := range s.data.Measurements {
		if m.CustomerID == contactID {
			list = append(list, m)
		}
	}
	// Ukuran utama di atas, lalu terbaru dulu.
	sort.Slice(list, func(i, j int) bool {
		if list[i].IsPrimary != list[j].IsPrimary {
			return list[i].IsPrimary
		}
		if !list[i].CreatedAt.Equal(list[j].CreatedAt) {
			return list[i].CreatedAt.After(list[j].CreatedAt)
		}
		return list[i].ID < list[j].ID
	})
	return list
}

func (s *Store) listMeasurementsLocked(contactID string) []Measurement {
	ptrs := s.contactMeasurementsLocked(contactID)
	out := make([]Measurement, 0, len(ptrs))
	for _, m := range ptrs {
		out = append(out, cloneMeasurement(m))
	}
	return out
}

func (s *Store) primaryMeasurementLocked(contactID string) *Measurement {
	for _, m := range s.data.Measurements {
		if m.CustomerID == contactID && m.IsPrimary {
			cp := cloneMeasurement(m)
			return &cp
		}
	}
	return nil
}

// ensureSinglePrimaryLocked menjaga invarian "tepat satu ukuran utama" untuk satu member.
// keepID (opsional) diprioritaskan sebagai utama bila ada lebih dari satu kandidat.
func (s *Store) ensureSinglePrimaryLocked(contactID, keepID string) {
	list := s.contactMeasurementsLocked(contactID)
	if len(list) == 0 {
		return
	}
	var chosen *Measurement
	for _, m := range list {
		if m.IsPrimary && (chosen == nil || m.ID == keepID) {
			chosen = m
		}
	}
	if chosen == nil {
		// Tidak ada utama: promosikan ukuran terbaru.
		newest := list[0]
		for _, m := range list {
			if m.CreatedAt.After(newest.CreatedAt) {
				newest = m
			}
		}
		chosen = newest
	}
	for _, m := range list {
		m.IsPrimary = m.ID == chosen.ID
	}
}

func (s *Store) ensureAllMeasurementInvariantsLocked() {
	if s.data.Measurements == nil {
		s.data.Measurements = make(map[string]*Measurement)
	}
	seen := make(map[string]bool)
	for _, m := range s.data.Measurements {
		if !seen[m.CustomerID] {
			seen[m.CustomerID] = true
			s.ensureSinglePrimaryLocked(m.CustomerID, "")
		}
	}
}

// addMeasurementLocked menyimpan ukuran baru untuk member. Ukuran pertama selalu menjadi ukuran utama;
// setPrimary memindahkan tanda utama ke ukuran baru.
func (s *Store) addMeasurementLocked(contactID string, in MeasurementInput, allowOutlet bool, now time.Time) (*Measurement, error) {
	if _, ok := s.data.Contacts[contactID]; !ok {
		return nil, ErrContactNotFound
	}
	norm, err := normalizeMeasurementInput(in, allowOutlet)
	if err != nil {
		return nil, err
	}
	existing := s.contactMeasurementsLocked(contactID)
	if len(existing) >= MaxMeasurementsPerMember {
		return nil, ErrMeasurementLimit
	}
	name := norm.Name
	if name == "" {
		name = defaultMeasurementName(norm.Source, len(existing))
	}
	m := &Measurement{
		ID:           GenerateUUID(),
		CustomerID:   contactID,
		Name:         name,
		Note:         norm.Note,
		FrameWidthMM: norm.FrameWidthMM,
		SizeCategory: s.MatchSizeCategoryLocked(norm.FrameWidthMM).Category,
		LensMM:       norm.LensMM,
		BridgeMM:     norm.BridgeMM,
		TempleMM:     norm.TempleMM,
		Comfort:      norm.Comfort,
		IsPrimary:    len(existing) == 0 || norm.SetPrimary,
		Source:       norm.Source,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if m.IsPrimary {
		for _, e := range existing {
			if e.IsPrimary {
				e.IsPrimary = false
				e.UpdatedAt = now
			}
		}
	}
	s.data.Measurements[m.ID] = m
	s.ensureSinglePrimaryLocked(contactID, m.ID)
	cp := cloneMeasurement(m)
	return &cp, nil
}

func (s *Store) recalculateMeasurementCategoriesLocked(now time.Time) {
	for _, m := range s.data.Measurements {
		if cat := s.MatchSizeCategoryLocked(m.FrameWidthMM).Category; cat != m.SizeCategory {
			m.SizeCategory = cat
			m.UpdatedAt = now
		}
	}
}

func (s *Store) deleteContactMeasurementsLocked(contactID string) {
	for id, m := range s.data.Measurements {
		if m.CustomerID == contactID {
			delete(s.data.Measurements, id)
		}
	}
	for code, lr := range s.data.LoginRequests {
		if lr.VerifiedContactID == contactID {
			delete(s.data.LoginRequests, code)
		}
	}
}

// moveMeasurementsLocked memindahkan ukuran saat kontak pending digabung ke kontak pengirim WA.
// Ukuran utama milik kontak tujuan tetap dipertahankan.
func (s *Store) moveMeasurementsLocked(fromID, toID string, now time.Time) {
	targetPrimary := s.primaryMeasurementLocked(toID)
	for _, m := range s.data.Measurements {
		if m.CustomerID == fromID {
			m.CustomerID = toID
			m.UpdatedAt = now
			if targetPrimary != nil {
				m.IsPrimary = false
			}
		}
	}
	keep := ""
	if targetPrimary != nil {
		keep = targetPrimary.ID
	}
	s.ensureSinglePrimaryLocked(toID, keep)
}

func measurementSummary(m *Measurement) string {
	if m == nil {
		return ""
	}
	return fmt.Sprintf("%s · %s mm (%s)", m.SizeCategory, formatMM(m.FrameWidthMM), m.Name)
}

func formatMM(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

// ---------------------------------------------------------------------------
// Sesi member (magic link / portal / sesi hasil polling)
// ---------------------------------------------------------------------------

// fullSessionContactLocked mengembalikan contact ID untuk sesi aktif dengan scope penuh.
func (s *Store) fullSessionContactLocked(sessionToken string, now time.Time) (string, error) {
	sess, ok := s.data.MemberSessions[strings.TrimSpace(sessionToken)]
	if !ok || sess == nil || sess.RevokedAt != nil || now.After(sess.ExpiresAt) {
		return "", ErrSessionInvalid
	}
	if _, ok := s.data.Contacts[sess.ContactID]; !ok {
		return "", ErrSessionInvalid
	}
	if sess.AccessScope != AccessScopeFull {
		return "", ErrSessionScopeRestricted
	}
	return sess.ContactID, nil
}

func (s *Store) issueMemberSessionLocked(contactID, scope, ip, ua string, now time.Time) *MemberSession {
	sess := &MemberSession{
		SessionToken: GenerateSecureToken(32),
		ContactID:    contactID,
		AccessScope:  scope,
		IPAddress:    ip,
		UserAgent:    ua,
		ExpiresAt:    now.Add(MemberSessionTTL),
		CreatedAt:    now,
	}
	s.data.MemberSessions[sess.SessionToken] = sess
	return sess
}

func nowOr(now time.Time) time.Time {
	if now.IsZero() {
		return time.Now().UTC()
	}
	return now
}

// ListMeasurementsBySession mengembalikan semua ukuran member (utama di atas).
func (s *Store) ListMeasurementsBySession(sessionToken string, now time.Time) ([]Measurement, error) {
	now = nowOr(now)
	s.mu.RLock()
	defer s.mu.RUnlock()
	cid, err := s.fullSessionContactLocked(sessionToken, now)
	if err != nil {
		return nil, err
	}
	return s.listMeasurementsLocked(cid), nil
}

// CreateMeasurementBySession menambah ukuran ("Ukur lagi" atau "Isi dari kacamata yang kamu punya").
func (s *Store) CreateMeasurementBySession(sessionToken string, in MeasurementInput, now time.Time) (*Measurement, error) {
	now = nowOr(now)
	s.mu.Lock()
	defer s.mu.Unlock()
	cid, err := s.fullSessionContactLocked(sessionToken, now)
	if err != nil {
		return nil, err
	}
	m, err := s.addMeasurementLocked(cid, in, false, now)
	if err != nil {
		return nil, err
	}
	s.touchContactLocked(cid, now)
	_ = s.persistLocked()
	return m, nil
}

// MeasurementPatch: field nil = tidak diubah. Comfort memakai ClearComfort untuk mengosongkan (JSON null).
type MeasurementPatch struct {
	Name         *string
	Note         *string
	Comfort      *string
	ClearComfort bool
}

// UpdateMeasurementBySession mengubah nama / catatan / tanda kenyamanan.
func (s *Store) UpdateMeasurementBySession(sessionToken, measurementID string, patch MeasurementPatch, now time.Time) (*Measurement, error) {
	now = nowOr(now)
	s.mu.Lock()
	defer s.mu.Unlock()
	cid, err := s.fullSessionContactLocked(sessionToken, now)
	if err != nil {
		return nil, err
	}
	m, ok := s.data.Measurements[strings.TrimSpace(measurementID)]
	if !ok || m.CustomerID != cid {
		return nil, ErrMeasurementNotFound
	}
	if patch.Name != nil {
		name := truncateRunes(*patch.Name, MaxMeasurementNameRunes)
		if name == "" {
			return nil, fmt.Errorf("%w: name must not be empty", ErrInvalidMeasurement)
		}
		m.Name = name
	}
	if patch.Note != nil {
		m.Note = truncateRunes(*patch.Note, MaxMeasurementNoteRunes)
	}
	if patch.ClearComfort {
		m.Comfort = nil
	} else if patch.Comfort != nil {
		c := strings.ToLower(strings.TrimSpace(*patch.Comfort))
		if c == "" {
			m.Comfort = nil
		} else if !isValidComfort(c) {
			return nil, fmt.Errorf("%w: comfort must be pas_nyaman, kurang_nyaman, tidak_pas, or null", ErrInvalidMeasurement)
		} else {
			m.Comfort = &c
		}
	}
	m.UpdatedAt = now
	_ = s.persistLocked()
	cp := cloneMeasurement(m)
	return &cp, nil
}

// DeleteMeasurementBySession menghapus satu ukuran. Jika yang dihapus ukuran utama, ukuran terbaru
// yang tersisa otomatis menjadi utama. Mengembalikan ukuran utama yang baru (bisa nil bila daftar kosong).
func (s *Store) DeleteMeasurementBySession(sessionToken, measurementID string, now time.Time) (*Measurement, error) {
	now = nowOr(now)
	s.mu.Lock()
	defer s.mu.Unlock()
	cid, err := s.fullSessionContactLocked(sessionToken, now)
	if err != nil {
		return nil, err
	}
	m, ok := s.data.Measurements[strings.TrimSpace(measurementID)]
	if !ok || m.CustomerID != cid {
		return nil, ErrMeasurementNotFound
	}
	wasPrimary := m.IsPrimary
	delete(s.data.Measurements, m.ID)
	s.ensureSinglePrimaryLocked(cid, "")
	if wasPrimary {
		if p := s.data.Measurements[s.primaryIDLocked(cid)]; p != nil {
			p.UpdatedAt = now
		}
	}
	_ = s.persistLocked()
	return s.primaryMeasurementLocked(cid), nil
}

func (s *Store) primaryIDLocked(contactID string) string {
	for id, m := range s.data.Measurements {
		if m.CustomerID == contactID && m.IsPrimary {
			return id
		}
	}
	return ""
}

// SetPrimaryMeasurementBySession menjadikan satu ukuran sebagai ukuran utama (yang lain otomatis bukan utama).
func (s *Store) SetPrimaryMeasurementBySession(sessionToken, measurementID string, now time.Time) (*Measurement, error) {
	now = nowOr(now)
	s.mu.Lock()
	defer s.mu.Unlock()
	cid, err := s.fullSessionContactLocked(sessionToken, now)
	if err != nil {
		return nil, err
	}
	m, ok := s.data.Measurements[strings.TrimSpace(measurementID)]
	if !ok || m.CustomerID != cid {
		return nil, ErrMeasurementNotFound
	}
	for _, other := range s.contactMeasurementsLocked(cid) {
		if other.IsPrimary && other.ID != m.ID {
			other.IsPrimary = false
			other.UpdatedAt = now
		}
	}
	if !m.IsPrimary {
		m.IsPrimary = true
		m.UpdatedAt = now
	}
	s.ensureSinglePrimaryLocked(cid, m.ID)
	_ = s.persistLocked()
	cp := cloneMeasurement(m)
	return &cp, nil
}

func (s *Store) touchContactLocked(contactID string, now time.Time) {
	if c, ok := s.data.Contacts[contactID]; ok {
		c.LastActiveAt = now
		c.UpdatedAt = now
	}
}

// ---------------------------------------------------------------------------
// Polling status verifikasi (App Ukur Layar 5) & "Masuk lewat WhatsApp"
// ---------------------------------------------------------------------------

func hashPollToken(tok string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(tok)))
	return hex.EncodeToString(sum[:])
}

func pollTokenMatches(storedHash, provided string) bool {
	if storedHash == "" || strings.TrimSpace(provided) == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(storedHash), []byte(hashPollToken(provided))) == 1
}

// VerificationStatusResult adalah respons polling status verifikasi.
type VerificationStatusResult struct {
	Kind               string       `json:"kind"`   // register | login
	Status             string       `json:"status"` // pending | verified | expired | link_sent | not_member
	ExpiresAt          *time.Time   `json:"expires_at,omitempty"`
	MemberCode         string       `json:"member_code,omitempty"`
	FirstNameMasked    string       `json:"first_name_masked,omitempty"`
	ExistingMember     bool         `json:"existing_member,omitempty"`
	LoginRequired      bool         `json:"login_required,omitempty"`
	SessionClaimed     bool         `json:"session_claimed,omitempty"`
	SessionToken       string       `json:"session_token,omitempty"`
	AccessScope        string       `json:"access_scope,omitempty"`
	SessionExpiresAt   *time.Time   `json:"session_expires_at,omitempty"`
	PrimaryMeasurement *Measurement `json:"primary_measurement,omitempty"`
	Message            string       `json:"message,omitempty"`
}

// GetVerificationStatus dipanggil berulang oleh App Ukur. Setelah nomor terverifikasi lewat WA, panggilan
// PERTAMA (dalam SessionClaimTTL) menerima sesi member baru — sekali pakai. Untuk nomor yang sudah lebih
// dulu menjadi member (akun lama), sesi TIDAK dikembalikan: member masuk lewat magic link di WhatsApp.
func (s *Store) GetVerificationStatus(code, pollToken, ip, ua string, now time.Time) (*VerificationStatusResult, error) {
	now = nowOr(now)
	upper := strings.ToUpper(strings.TrimSpace(code))
	s.mu.Lock()
	defer s.mu.Unlock()

	if vc, ok := s.data.VerificationCodes[upper]; ok && pollTokenMatches(vc.PollTokenHash, pollToken) {
		res := &VerificationStatusResult{Kind: "register"}
		if vc.UsedAt == nil {
			if now.After(vc.ExpiresAt) {
				res.Status = "expired"
				res.Message = "Kode verifikasi sudah kedaluwarsa. Kirim ulang formulir untuk mendapat kode baru."
				return res, nil
			}
			exp := vc.ExpiresAt
			res.Status = "pending"
			res.ExpiresAt = &exp
			return res, nil
		}
		res.Status = "verified"
		contact, ok := s.data.Contacts[vc.VerifiedContactID]
		if !ok {
			return nil, ErrVerificationNotFound
		}
		res.MemberCode = contact.MemberCode
		res.FirstNameMasked = MaskFirstName(contact.FullName)
		if !vc.NewMember {
			res.ExistingMember = true
			res.LoginRequired = true
			res.Message = "Nomor ini sudah terdaftar sebagai Member DOOZ. Ukuranmu sudah disimpan. Buka link masuk yang dikirim ke WhatsApp kamu."
			return res, nil
		}
		res.PrimaryMeasurement = s.primaryMeasurementLocked(contact.ID)
		if vc.SessionClaimedAt != nil || vc.VerifiedAt == nil || now.After(vc.VerifiedAt.Add(SessionClaimTTL)) {
			res.SessionClaimed = vc.SessionClaimedAt != nil
			res.LoginRequired = true
			res.Message = "Sesi sudah diambil atau kedaluwarsa. Buka Kartu Member lewat link di WhatsApp kamu."
			return res, nil
		}
		claimed := now
		vc.SessionClaimedAt = &claimed
		scope := AccessScopeFull
		if vc.RecycledPending {
			scope = AccessScopeBasicRecycledPending
		}
		sess := s.issueMemberSessionLocked(contact.ID, scope, ip, ua, now)
		_ = s.persistLocked()
		sessExp := sess.ExpiresAt
		res.SessionToken = sess.SessionToken
		res.AccessScope = sess.AccessScope
		res.SessionExpiresAt = &sessExp
		return res, nil
	}

	if lr, ok := s.data.LoginRequests[upper]; ok && pollTokenMatches(lr.PollTokenHash, pollToken) {
		res := &VerificationStatusResult{Kind: "login"}
		switch {
		case lr.UsedAt != nil && lr.Result == "not_member":
			res.Status = "not_member"
			res.Message = "Nomor WhatsApp ini belum terdaftar sebagai Member DOOZ."
		case lr.UsedAt != nil:
			res.Status = "link_sent"
			res.Message = "Link masuk sudah dikirim ke WhatsApp kamu. Ketuk link tersebut untuk masuk."
		case now.After(lr.ExpiresAt):
			res.Status = "expired"
			res.Message = "Permintaan masuk sudah kedaluwarsa. Coba lagi."
		default:
			exp := lr.ExpiresAt
			res.Status = "pending"
			res.ExpiresAt = &exp
		}
		return res, nil
	}
	return nil, ErrVerificationNotFound
}

// WhatsAppLoginResult adalah respons "Masuk lewat WhatsApp".
type WhatsAppLoginResult struct {
	LoginCode string    `json:"login_code"`
	PollToken string    `json:"poll_token"`
	WAMeURL   string    `json:"wa_me_url"`
	ExpiresAt time.Time `json:"expires_at"`
	Message   string    `json:"message"`
}

func buildWAMeURL(officialWA, text string) string {
	target := strings.TrimSpace(officialWA)
	if target == "" {
		target = "6281122334455"
	}
	return fmt.Sprintf("https://wa.me/%s?text=%s", target, strings.ReplaceAll(url.QueryEscape(text), "+", "%20"))
}

// CreateWhatsAppLoginRequest membuat kode DZ-xxxx untuk member di HP lain. Customer mengirim kode lewat
// WhatsApp; bot membalas magic link sekali pakai (konfirmasi POST /api/auth/magic-exchange).
func (s *Store) CreateWhatsAppLoginRequest(app, officialWA string, now time.Time) (*WhatsAppLoginResult, error) {
	now = nowOr(now)
	s.mu.Lock()
	defer s.mu.Unlock()
	code := s.uniqueVerificationCodeLocked()
	pollTok := GenerateSecureToken(24)
	app = normalizeAppName(app)
	lr := &LoginRequest{
		Code:          code,
		PollTokenHash: hashPollToken(pollTok),
		App:           app,
		ExpiresAt:     now.Add(WhatsAppLoginTTL),
		CreatedAt:     now,
	}
	s.data.LoginRequests[code] = lr
	s.pruneExpiredLoginRequestsLocked(now)
	_ = s.persistLocked()
	return &WhatsAppLoginResult{
		LoginCode: code,
		PollToken: pollTok,
		WAMeURL:   buildWAMeURL(officialWA, "Halo DOOZ, saya mau masuk Member. Kode: "+code),
		ExpiresAt: lr.ExpiresAt,
		Message:   "Kirim pesan WhatsApp ini dari nomor member kamu. Link masuk sekali pakai akan dibalas lewat WhatsApp.",
	}, nil
}

func (s *Store) pruneExpiredLoginRequestsLocked(now time.Time) {
	for code, lr := range s.data.LoginRequests {
		if now.Sub(lr.ExpiresAt) > 24*time.Hour {
			delete(s.data.LoginRequests, code)
		}
	}
}

func normalizeAppName(app string) string {
	if strings.EqualFold(strings.TrimSpace(app), AppUkur) {
		return AppUkur
	}
	return ""
}

// InboundDZResult adalah hasil memproses kode DZ-xxxx yang masuk lewat webhook WhatsApp.
type InboundDZResult struct {
	Kind        string // register | login
	Contact     *Contact
	MagicLink   *MagicLink
	SizeSummary string
	App         string
	NewMember   bool
	NotMember   bool // login: nomor pengirim belum terdaftar
}

// ProcessInboundDZCode memproses DZ-xxxx: kode pendaftaran (identify) atau kode "Masuk lewat WhatsApp".
func (s *Store) ProcessInboundDZCode(code, actualSenderPhone string, now time.Time) (*InboundDZResult, error) {
	senderNorm, err := NormalizePhone(actualSenderPhone)
	if err != nil {
		return nil, err
	}
	now = nowOr(now)
	upper := strings.ToUpper(strings.TrimSpace(code))

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.data.VerificationCodes[upper]; ok {
		return s.verifyRegistrationCodeLocked(upper, senderNorm, now)
	}
	lr, ok := s.data.LoginRequests[upper]
	if !ok || lr.UsedAt != nil || now.After(lr.ExpiresAt) {
		return nil, ErrVerificationCodeInvalid
	}
	used := now
	lr.UsedAt = &used
	res := &InboundDZResult{Kind: "login", App: lr.App}
	contact := s.findContactByPhoneLocked(senderNorm)
	if contact == nil {
		lr.Result = "not_member"
		res.NotMember = true
		_ = s.persistLocked()
		return res, nil
	}
	ml := s.issueMagicLinkForContactLocked(contact, now)
	lr.Result = "link_sent"
	lr.VerifiedContactID = contact.ID
	_ = s.persistLocked()
	cp := *contact
	cpML := *ml
	res.Contact = &cp
	res.MagicLink = &cpML
	res.SizeSummary = s.sizeSummaryLocked(contact.ID)
	return res, nil
}

// issueMagicLinkForContactLocked: sama seperti perintah MASUK (termasuk proteksi nomor daur ulang >6 bulan).
func (s *Store) issueMagicLinkForContactLocked(contact *Contact, now time.Time) *MagicLink {
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
	return ml
}

// sizeSummaryLocked: ringkasan ukuran untuk balasan WhatsApp (ukuran utama, fallback hasil ukur terakhir).
func (s *Store) sizeSummaryLocked(contactID string) string {
	if p := s.primaryMeasurementLocked(contactID); p != nil {
		return measurementSummary(p)
	}
	return s.latestMeasurementSummaryLocked(contactID)
}

// ---------------------------------------------------------------------------
// Outlet: ukuran yang diukur kasir (Level 2) masuk ke "Ukuran Saya" dengan source=outlet
// ---------------------------------------------------------------------------

func (s *Store) addOutletMeasurementLocked(contactID string, p EventPayload, now time.Time) {
	if p.FrameWidthMM <= 0 {
		return
	}
	in := MeasurementInput{
		Note:         strings.TrimSpace(p.Notes),
		FrameWidthMM: p.FrameWidthMM,
		Source:       MeasurementSourceOutlet,
	}
	if in.Note == "" && p.OutletID != "" {
		in.Note = "Diukur di " + p.OutletID
	}
	if p.BridgeMM > 0 {
		in.BridgeMM = floatPtr(p.BridgeMM)
	}
	if p.TempleMM > 0 {
		in.TempleMM = floatPtr(p.TempleMM)
	}
	_, _ = s.addMeasurementLocked(contactID, in, true, now)
}
