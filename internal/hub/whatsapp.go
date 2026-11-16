package hub

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

var dzCodeRegex = regexp.MustCompile(`(?i)\b(DZ-[A-Z0-9]{4,8})\b`)

const AntiPhishingFooter = "\n\n🔒 _Keamanan DOOZ: Jangan bagikan tautan ini kepada siapa pun. DOOZ tidak pernah meminta OTP, PIN, atau transfer di luar kanal resmi._"

type OutboundRecord struct {
	ID          string    `json:"id"`
	ToPhone     string    `json:"to_phone"`
	TriggerType string    `json:"trigger_type"` // DZ-xxxx, MASUK, DATA, KELUAR
	Message     string    `json:"message"`
	DelayMS     int64     `json:"delay_ms"`
	EnqueuedAt  time.Time `json:"enqueued_at"`
	SentAt      time.Time `json:"sent_at"`
	Provider    string    `json:"provider"`
	Error       string    `json:"error,omitempty"`
}

// WhatsAppProvider abstracts WhatsApp sending so DOOZ can swap Fonnte for Meta WABA/Qontak/Wati anytime.
type WhatsAppProvider interface {
	ProviderName() string
	SendMessage(ctx context.Context, toPhoneNormalized string, message string) error
}

// FonnteAdapter implements WhatsAppProvider for Fonnte API (with safe dry-run fallback when API token is unset/mock).
type FonnteAdapter struct {
	APIToken   string
	APIURL     string
	DeviceID   string
	HTTPClient *http.Client

	mu       sync.Mutex
	sentLogs []OutboundRecord
}

func NewFonnteAdapter(apiToken, deviceID string) *FonnteAdapter {
	return &FonnteAdapter{
		APIToken:   strings.TrimSpace(apiToken),
		APIURL:     "https://api.fonnte.com/send",
		DeviceID:   strings.TrimSpace(deviceID),
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (f *FonnteAdapter) ProviderName() string {
	return "fonnte"
}

func (f *FonnteAdapter) SendMessage(ctx context.Context, toPhoneNormalized string, message string) error {
	norm, err := NormalizePhone(toPhoneNormalized)
	if err != nil {
		return err
	}
	// If APIToken is configured for live Fonnte endpoint (not mock/test), call Fonnte API
	if f.APIToken != "" && !strings.HasPrefix(f.APIToken, "mock-") && !strings.HasPrefix(f.APIToken, "test-") {
		payload := map[string]string{
			"target":  norm,
			"message": message,
		}
		body, _ := json.Marshal(payload)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.APIURL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", f.APIToken)
		req.Header.Set("Content-Type", "application/json")
		resp, err := f.HTTPClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			return fmt.Errorf("fonnte api status %d", resp.StatusCode)
		}
	}
	f.mu.Lock()
	f.sentLogs = append(f.sentLogs, OutboundRecord{
		ID:       GenerateUUID(),
		ToPhone:  norm,
		Message:  message,
		SentAt:   time.Now().UTC(),
		Provider: f.ProviderName(),
	})
	f.mu.Unlock()
	return nil
}

func (f *FonnteAdapter) SentMessages() []OutboundRecord {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]OutboundRecord, len(f.sentLogs))
	copy(out, f.sentLogs)
	return out
}

// ReplyQueue enforces inbound-triggered-only messaging and processes replies through a rate-limited queue.
type ReplyQueue struct {
	provider WhatsAppProvider
	minDelay time.Duration
	maxDelay time.Duration

	mu             sync.Mutex
	inboundSenders map[string]time.Time // phone_normalized -> last inbound timestamp
	history        []OutboundRecord
	queueCh        chan OutboundRecord
	pendingCount   int
	wg             sync.WaitGroup
	stopOnce       sync.Once
	stopCh         chan struct{}
}

func NewReplyQueue(provider WhatsAppProvider, minDelay, maxDelay time.Duration) *ReplyQueue {
	if minDelay <= 0 {
		minDelay = 15 * time.Millisecond
	}
	if maxDelay < minDelay {
		maxDelay = minDelay + 25*time.Millisecond
	}
	rq := &ReplyQueue{
		provider:       provider,
		minDelay:       minDelay,
		maxDelay:       maxDelay,
		inboundSenders: make(map[string]time.Time),
		queueCh:        make(chan OutboundRecord, 512),
		stopCh:         make(chan struct{}),
	}
	go rq.worker()
	return rq
}

// MarkInboundTriggered records that a normalized phone number sent an inbound WhatsApp message via webhook.
func (rq *ReplyQueue) MarkInboundTriggered(phoneNormalized string, at time.Time) {
	if at.IsZero() {
		at = time.Now().UTC()
	}
	rq.mu.Lock()
	rq.inboundSenders[phoneNormalized] = at
	rq.mu.Unlock()
}

// HasInboundTrigger checks if a phone number is allowed to receive an inbound-triggered reply.
func (rq *ReplyQueue) HasInboundTrigger(phoneNormalized string) bool {
	rq.mu.Lock()
	_, ok := rq.inboundSenders[phoneNormalized]
	rq.mu.Unlock()
	return ok
}

// EnqueueReply schedules an inbound-triggered WhatsApp reply with randomized pacing delay.
// It strictly blocks outbound messages to numbers that have not sent an inbound webhook message first.
func (rq *ReplyQueue) EnqueueReply(toPhoneNormalized, triggerType, message string) (OutboundRecord, error) {
	norm, err := NormalizePhone(toPhoneNormalized)
	if err != nil {
		return OutboundRecord{}, err
	}
	if !rq.HasInboundTrigger(norm) {
		return OutboundRecord{}, ErrOutboundNotTriggered
	}

	delay := rq.computeJitterDelay()
	rec := OutboundRecord{
		ID:          GenerateUUID(),
		ToPhone:     norm,
		TriggerType: triggerType,
		Message:     message,
		DelayMS:     delay.Milliseconds(),
		EnqueuedAt:  time.Now().UTC(),
		Provider:    rq.provider.ProviderName(),
	}

	rq.mu.Lock()
	rq.pendingCount++
	rq.wg.Add(1)
	rq.mu.Unlock()

	rq.queueCh <- rec
	return rec, nil
}

func (rq *ReplyQueue) computeJitterDelay() time.Duration {
	diff := rq.maxDelay - rq.minDelay
	if diff <= 0 {
		return rq.minDelay
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(diff)))
	if err != nil {
		return rq.minDelay
	}
	return rq.minDelay + time.Duration(n.Int64())
}

func (rq *ReplyQueue) worker() {
	for {
		select {
		case <-rq.stopCh:
			return
		case rec := <-rq.queueCh:
			if rec.DelayMS > 0 {
				time.Sleep(time.Duration(rec.DelayMS) * time.Millisecond)
			}
			err := rq.provider.SendMessage(context.Background(), rec.ToPhone, rec.Message)
			rec.SentAt = time.Now().UTC()
			if err != nil {
				rec.Error = err.Error()
			}
			rq.mu.Lock()
			rq.history = append(rq.history, rec)
			rq.pendingCount--
			rq.mu.Unlock()
			rq.wg.Done()
		}
	}
}

// Flush waits until all queued messages have been dispatched by the rate-limited worker.
func (rq *ReplyQueue) Flush(timeout time.Duration) bool {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	done := make(chan struct{})
	go func() {
		rq.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

func (rq *ReplyQueue) History() []OutboundRecord {
	rq.mu.Lock()
	defer rq.mu.Unlock()
	out := make([]OutboundRecord, len(rq.history))
	copy(out, rq.history)
	return out
}

func (rq *ReplyQueue) PendingCount() int {
	rq.mu.Lock()
	defer rq.mu.Unlock()
	return rq.pendingCount
}

func (rq *ReplyQueue) Close() {
	rq.stopOnce.Do(func() {
		close(rq.stopCh)
	})
}

type InboundCommand struct {
	Kind string // "VERIFY_DZ", "MASUK", "DATA", "KELUAR", "UNKNOWN"
	Code string // Uppercase DZ-xxxx if Kind == "VERIFY_DZ"
}

// ParseInboundCommand parses incoming WhatsApp message text for allowed triggers only:
// DZ-xxxx, MASUK, DATA, KELUAR.
func ParseInboundCommand(text string) InboundCommand {
	trimmed := strings.TrimSpace(text)
	if match := dzCodeRegex.FindStringSubmatch(trimmed); len(match) > 1 {
		return InboundCommand{
			Kind: "VERIFY_DZ",
			Code: strings.ToUpper(match[1]),
		}
	}
	upper := strings.ToUpper(trimmed)
	switch upper {
	case "MASUK":
		return InboundCommand{Kind: "MASUK"}
	case "DATA":
		return InboundCommand{Kind: "DATA"}
	case "KELUAR":
		return InboundCommand{Kind: "KELUAR"}
	default:
		return InboundCommand{Kind: "UNKNOWN"}
	}
}

// FormatVerificationReply builds a data-minimized WhatsApp reply for DZ-xxxx or MASUK/DATA.
// Never includes sensitive personal details (like full address or eye prescriptions) in Fonnte chat logs.
func FormatVerificationReply(memberCode, sizeSummary, magicLinkURL string, requiresNameConfirm bool) string {
	var sb strings.Builder
	sb.WriteString("Halo Sobat DOOZ! 👋\n")
	sb.WriteString(fmt.Sprintf("ID Member Anda: *%s*\n", memberCode))
	if sizeSummary != "" {
		sb.WriteString(fmt.Sprintf("Ukuran Frame Dasar: *%s*\n", sizeSummary))
	}
	if requiresNameConfirm {
		sb.WriteString("\n⚠️ _Akun ini tidak aktif lebih dari 6 bulan. Demi keamanan, kamu akan diminta mengetik nama lengkap saat membuka Kartu Member Saya:_\n")
	} else {
		sb.WriteString("\nBuka *Kartu Member Saya* lewat tautan sekali pakai berikut (berlaku 15 menit):\n")
	}
	sb.WriteString(magicLinkURL)
	sb.WriteString(AntiPhishingFooter)
	return sb.String()
}

// FormatNotMemberReply dibalas saat kode "Masuk lewat WhatsApp" dikirim dari nomor yang belum menjadi member.
func FormatNotMemberReply() string {
	return "Halo! Nomor WhatsApp ini belum terdaftar sebagai *Member Kacamata DOOZ*.\n\nUkur frame kamu di App Ukur DOOZ, lalu pilih *Simpan & jadi Member* untuk mendaftar. Gratis, cukup lewat WhatsApp." + AntiPhishingFooter
}

func FormatLogoutReply(memberCode string) string {
	return fmt.Sprintf("✅ Seluruh sesi aktif untuk Member *%s* telah dicabut dari semua perangkat. Ketik *MASUK* kapan saja jika ingin mengakses kembali.%s", memberCode, AntiPhishingFooter)
}
