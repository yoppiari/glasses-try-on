package hub

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
)

type SecuritySigner struct {
	secret []byte
}

func NewSecuritySigner(secret string) *SecuritySigner {
	if strings.TrimSpace(secret) == "" {
		secret = "dooz-default-hmac-secret-2026"
	}
	return &SecuritySigner{secret: []byte(secret)}
}

// SignAttribution generates an HMAC-SHA256 signature for (src, host, sesi, outlet).
func (s *SecuritySigner) SignAttribution(src, host, sesi, outlet string) string {
	canonical := fmt.Sprintf("src=%s&host=%s&sesi=%s&outlet=%s",
		strings.TrimSpace(src),
		strings.TrimSpace(host),
		strings.TrimSpace(sesi),
		strings.TrimSpace(outlet),
	)
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyAttribution checks whether a signature matches (src, host, sesi, outlet).
func (s *SecuritySigner) VerifyAttribution(src, host, sesi, outlet, sig string) bool {
	if strings.TrimSpace(sig) == "" {
		return false
	}
	expected := s.SignAttribution(src, host, sesi, outlet)
	return hmac.Equal([]byte(strings.ToLower(strings.TrimSpace(sig))), []byte(expected))
}

// BuildSignedAttributionURL constructs a signed attribution URL.
func (s *SecuritySigner) BuildSignedAttributionURL(baseURL, src, host, sesi, outlet string) (signedURL, sig string, err error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || u.Scheme == "" || u.Host == "" {
		u, _ = url.Parse("https://dooz.id")
	}
	sig = s.SignAttribution(src, host, sesi, outlet)
	q := u.Query()
	q.Set("src", src)
	q.Set("host", host)
	q.Set("sesi", sesi)
	if outlet != "" {
		q.Set("outlet", outlet)
	}
	q.Set("sig", sig)
	u.RawQuery = q.Encode()
	return u.String(), sig, nil
}

type MemberQRClaims struct {
	ContactID  string `json:"cid"`
	MemberCode string `json:"mc"`
	IssuedAt   int64  `json:"iat"`
	ExpiresAt  int64  `json:"exp"`
}

// GenerateMemberQRToken creates a signed rotating token for a Member QR Card.
// Note: Plain DOOZ-xxxxx is never accepted as a QR token.
func (s *SecuritySigner) GenerateMemberQRToken(contactID, memberCode string, now time.Time) (string, time.Time, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	exp := now.Add(QRTokenWindow)
	claims := MemberQRClaims{
		ContactID:  contactID,
		MemberCode: memberCode,
		IssuedAt:   now.Unix(),
		ExpiresAt:  exp.Unix(),
	}
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", time.Time{}, err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte("QR:" + encodedPayload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return "DQR1." + encodedPayload + "." + sig, exp, nil
}

// VerifyMemberQRToken verifies the HMAC signature and expiration of a rotating Member QR token.
func (s *SecuritySigner) VerifyMemberQRToken(token string, now time.Time) (*MemberQRClaims, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	trimmed := strings.TrimSpace(token)
	if strings.HasPrefix(strings.ToUpper(trimmed), "DOOZ-") {
		return nil, fmt.Errorf("%w: plain member_code DOOZ-xxxxx is display-only and cannot be used as QR token", ErrInvalidSignature)
	}
	parts := strings.Split(trimmed, ".")
	if len(parts) != 3 || parts[0] != "DQR1" {
		return nil, ErrInvalidSignature
	}
	encodedPayload := parts[1]
	providedSig := parts[2]

	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte("QR:" + encodedPayload))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(providedSig), []byte(expectedSig)) {
		return nil, ErrInvalidSignature
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return nil, ErrInvalidSignature
	}
	var claims MemberQRClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, ErrInvalidSignature
	}
	if now.Unix() > claims.ExpiresAt {
		return nil, ErrQRTokenExpired
	}
	return &claims, nil
}

// IsRecycledNumberPassive checks if the contact has been passive for > 6 months.
func IsRecycledNumberPassive(lastActiveAt, now time.Time) bool {
	if lastActiveAt.IsZero() {
		return false
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	return now.Sub(lastActiveAt) > RecycledThreshold
}

// NamesMatchForRecycledConfirm checks if the user-provided full name matches the registered name.
func NamesMatchForRecycledConfirm(registeredName, providedName string) bool {
	reg := strings.ToLower(strings.Join(strings.Fields(registeredName), " "))
	prov := strings.ToLower(strings.Join(strings.Fields(providedName), " "))
	return reg != "" && reg == prov
}
