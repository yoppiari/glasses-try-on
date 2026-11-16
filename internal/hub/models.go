package hub

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
	"unicode"
)

const (
	StatusPending    = "pending"
	StatusVerified   = "verified"
	StatusUnverified = "unverified"

	EventFrameMeasured  = "frame_measured"
	EventFrameTried     = "frame_tried"
	EventStoreVisit     = "store_visit"
	EventVoucherClaimed = "voucher_claimed"
	EventPurchase       = "purchase"

	ConsentCRMWA              = "crm_wa"
	ConsentHealthPrescription = "health_prescription"

	AccessScopeFull                 = "full"
	AccessScopeBasicRecycledPending = "basic_recycled_pending"

	RoleOwner = "owner"
	RoleAdmin = "admin"
	RoleKasir = "kasir"
	RoleHost  = "host"

	AuditLevel1Lookup    = "level_1_lookup"
	AuditLevel2QR        = "level_2_qr"
	AuditAdminExport     = "admin_export"
	AuditAdminCatalog    = "admin_catalog"
	AuditSystemRetention = "system_retention"

	VerificationCodeTTL  = 30 * time.Minute
	MagicLinkTTL         = 15 * time.Minute
	MemberSessionTTL     = 30 * 24 * time.Hour
	RecycledThreshold    = 180 * 24 * time.Hour // >6 months passive requires full name confirmation or outlet verification
	RetentionPurgePeriod = 730 * 24 * time.Hour // >24 months passive auto-deletion/anonymization
	QRTokenWindow        = 5 * time.Minute      // Rotating signed QR token window
)

var (
	ErrInvalidPhone             = errors.New("invalid Indonesian WhatsApp phone number")
	ErrContactNotFound          = errors.New("contact not found")
	ErrVerificationCodeInvalid  = errors.New("verification code invalid, expired, or already used")
	ErrMagicLinkInvalid         = errors.New("magic link invalid, expired, or already used")
	ErrSessionInvalid           = errors.New("member session invalid, expired, or revoked")
	ErrRecycledConfirmationNeed = errors.New("account inactive >6 months: full name confirmation or outlet verification required")
	ErrUnauthorizedRole         = errors.New("forbidden: insufficient role permissions")
	ErrInvalidSignature         = errors.New("invalid HMAC signature")
	ErrQRTokenExpired           = errors.New("member QR rotating token expired")
	ErrOutboundNotTriggered     = errors.New("outbound WhatsApp blocked: number has not triggered inbound webhook")
	ErrFrameNotFound            = errors.New("catalog frame SKU not found")
	ErrInvalidSizeChart         = errors.New("invalid size chart: must define valid ordered XS, S, M, L, XL millimeter ranges")
	ErrInvalidCatalogFrame      = errors.New("invalid catalog frame: sku, name, and frame_width_mm (>0) are required")
)

type Contact struct {
	ID                  string     `json:"id"`
	MemberCode          string     `json:"member_code"` // DOOZ-xxxxx (display only)
	PhoneNormalized     string     `json:"phone_normalized"`
	PhoneMasked         string     `json:"phone_masked"`
	FullName            string     `json:"full_name"`
	CityRegency         string     `json:"city_regency"`
	VerificationStatus  string     `json:"verification_status"` // pending|verified|unverified
	DeletionRequestedAt *time.Time `json:"deletion_requested_at,omitempty"`
	LastActiveAt        time.Time  `json:"last_active_at"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type EventPayload struct {
	FrameWidthMM float64  `json:"frame_width_mm,omitempty"`
	BridgeMM     float64  `json:"bridge_mm,omitempty"`
	TempleMM     float64  `json:"temple_mm,omitempty"`
	SizeCategory string   `json:"size_category,omitempty"` // XS, S, M, L, XL
	FrameSKU     string   `json:"frame_sku,omitempty"`
	FrameName    string   `json:"frame_name,omitempty"`
	SKUList      []string `json:"sku_list,omitempty"`
	OutletID     string   `json:"outlet_id,omitempty"`
	VoucherCode  string   `json:"voucher_code,omitempty"`
	AmountIDR    int64    `json:"amount_idr,omitempty"`
	Notes        string   `json:"notes,omitempty"`
}

type ContactEvent struct {
	ID          string       `json:"id"`
	ContactID   string       `json:"contact_id"`
	EventType   string       `json:"event_type"` // frame_measured|frame_tried|store_visit|voucher_claimed|purchase
	Payload     EventPayload `json:"payload"`
	Source      string       `json:"src"`
	HostCode    string       `json:"host_code"`
	SessionCode string       `json:"session_code"`
	CreatedAt   time.Time    `json:"created_at"`
}

type Consent struct {
	ID        string     `json:"id"`
	ContactID string     `json:"contact_id"`
	Scope     string     `json:"scope"` // crm_wa|health_prescription
	Granted   bool       `json:"granted"`
	IPAddress string     `json:"ip_address"`
	UserAgent string     `json:"user_agent"`
	GrantedAt time.Time  `json:"granted_at"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
}

type VerificationCode struct {
	Code        string     `json:"code"` // DZ-xxxx
	ContactID   string     `json:"contact_id"`
	PhoneInput  string     `json:"phone_input"`
	ExpiresAt   time.Time  `json:"expires_at"`
	UsedAt      *time.Time `json:"used_at,omitempty"`
	UsedByPhone string     `json:"used_by_phone,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type MagicLink struct {
	Token               string     `json:"token"`
	ContactID           string     `json:"contact_id"`
	RequiresNameConfirm bool       `json:"requires_name_confirm"`
	ExpiresAt           time.Time  `json:"expires_at"`
	UsedAt              *time.Time `json:"used_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
}

type MemberSession struct {
	SessionToken string     `json:"session_token"`
	ContactID    string     `json:"contact_id"`
	AccessScope  string     `json:"access_scope"` // full|basic_recycled_pending
	IPAddress    string     `json:"ip_address"`
	UserAgent    string     `json:"user_agent"`
	ExpiresAt    time.Time  `json:"expires_at"`
	RevokedAt    *time.Time `json:"revoked_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type AttributionLink struct {
	ID          string    `json:"id"`
	Source      string    `json:"src"`
	HostCode    string    `json:"host"`
	SessionCode string    `json:"sesi"`
	OutletID    string    `json:"outlet_id,omitempty"`
	BaseURL     string    `json:"base_url"`
	Signature   string    `json:"sig"`
	SignedURL   string    `json:"signed_url"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

type AuditLog struct {
	ID              string    `json:"id"`
	ActorUserID     string    `json:"actor_user_id"`
	Role            string    `json:"role"`
	OutletID        string    `json:"outlet_id"`
	TargetContactID string    `json:"target_contact_id"`
	Action          string    `json:"action"`
	AccessLevel     string    `json:"access_level"` // level_1_lookup|level_2_qr|admin_export|system_retention
	Details         string    `json:"details"`
	Timestamp       time.Time `json:"timestamp"`
}

// NormalizePhone normalizes Indonesian phone numbers (0812..., +62812..., 62812..., 812...)
// into canonical 628... format.
func NormalizePhone(raw string) (string, error) {
	var b strings.Builder
	for _, r := range strings.TrimSpace(raw) {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	digits := b.String()
	switch {
	case strings.HasPrefix(digits, "08"):
		digits = "62" + digits[1:]
	case strings.HasPrefix(digits, "8"):
		digits = "62" + digits
	case strings.HasPrefix(digits, "00628"):
		digits = digits[2:]
	}
	if !strings.HasPrefix(digits, "628") || len(digits) < 10 || len(digits) > 15 {
		return "", ErrInvalidPhone
	}
	return digits, nil
}

// MaskPhoneDisplay formats a phone number as 0812****4567 per UU PDP & PRD specification.
func MaskPhoneDisplay(phone string) string {
	norm, err := NormalizePhone(phone)
	local := phone
	if err == nil && strings.HasPrefix(norm, "62") {
		local = "0" + norm[2:]
	}
	if len(local) < 8 {
		return "08******"
	}
	return local[:4] + "****" + local[len(local)-4:]
}

// MaskFirstName returns the first name or masked initial for Level 1 lookup.
func MaskFirstName(fullName string) string {
	parts := strings.Fields(strings.TrimSpace(fullName))
	if len(parts) == 0 {
		return "Member"
	}
	first := parts[0]
	if len(parts) == 1 {
		return first
	}
	lastInitial := string([]rune(parts[len(parts)-1])[0])
	return fmt.Sprintf("%s %s.", first, strings.ToUpper(lastInitial))
}

// MaskLiveToastName masks a name for OBS Live Counter (e.g., "Rina Kartika" -> "R***").
func MaskLiveToastName(fullName string) string {
	trimmed := strings.TrimSpace(fullName)
	if trimmed == "" {
		return "M***"
	}
	runes := []rune(trimmed)
	return strings.ToUpper(string(runes[0])) + "***"
}

func GenerateUUID() string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}

func GenerateMemberCode() string {
	const digits = "0123456789"
	var sb strings.Builder
	sb.WriteString("DOOZ-")
	for i := 0; i < 5; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		sb.WriteByte(digits[n.Int64()])
	}
	return sb.String()
}

func GenerateVerificationCodeStr() string {
	const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	var sb strings.Builder
	sb.WriteString("DZ-")
	for i := 0; i < 4; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		sb.WriteByte(chars[n.Int64()])
	}
	return sb.String()
}

func GenerateSecureToken(byteLen int) string {
	if byteLen <= 0 {
		byteLen = 24
	}
	buf := make([]byte, byteLen)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func IsValidEventType(t string) bool {
	switch t {
	case EventFrameMeasured, EventFrameTried, EventStoreVisit, EventVoucherClaimed, EventPurchase:
		return true
	default:
		return false
	}
}
