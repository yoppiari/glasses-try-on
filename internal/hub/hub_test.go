package hub

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestPhoneNormalizationAndMasking(t *testing.T) {
	cases := []struct {
		raw      string
		wantNorm string
		wantMask string
	}{
		{"0812-3456-4567", "6281234564567", "0812****4567"},
		{"+62 812 3456 4567", "6281234564567", "0812****4567"},
		{"6281234564567", "6281234564567", "0812****4567"},
		{"81234564567", "6281234564567", "0812****4567"},
	}
	for _, tc := range cases {
		got, err := NormalizePhone(tc.raw)
		if err != nil {
			t.Fatalf("NormalizePhone(%q) unexpected error: %v", tc.raw, err)
		}
		if got != tc.wantNorm {
			t.Fatalf("NormalizePhone(%q) = %q, want %q", tc.raw, got, tc.wantNorm)
		}
		masked := MaskPhoneDisplay(got)
		if masked != tc.wantMask {
			t.Fatalf("MaskPhoneDisplay(%q) = %q, want %q", got, masked, tc.wantMask)
		}
	}

	if _, err := NormalizePhone("12345"); err == nil {
		t.Fatalf("expected error for invalid short phone number")
	}
	if got := MaskLiveToastName("Rina Kartika"); got != "R***" {
		t.Fatalf("MaskLiveToastName = %q, want R***", got)
	}
}

func TestEndToEndCustomerHubFlow(t *testing.T) {
	now := time.Date(2026, 11, 16, 15, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }

	signer := NewSecuritySigner("test-hmac-secret-dooz")
	store, err := NewStore(t.TempDir()+"/hub_test.json", signer)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}
	fonnte := NewFonnteAdapter("mock-token", "DOOZ-DEV-01")
	queue := NewReplyQueue(fonnte, 5*time.Millisecond, 10*time.Millisecond)
	defer queue.Close()

	srv := NewServer(ServerConfig{
		Store:            store,
		Signer:           signer,
		WAProvider:       fonnte,
		ReplyQueue:       queue,
		WebhookSecret:    "sec-fonnte-999",
		FonnteDeviceID:   "DOOZ-DEV-01",
		OfficialWANumber: "6281122334455",
		PortalBaseURL:    "https://crm.dooz.id",
		WebhookRateLimit: 5,
		RateLimitWindow:  time.Minute,
		Clock:            clock,
	})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// 1. Generate & verify signed attribution link (Admin)
	signReq := map[string]any{
		"base_url": "https://ukur.dooz.id",
		"src":      "live_tiktok",
		"host":     "rina",
		"sesi":     "20261116-sore",
		"outlet":   "gading",
	}
	resp, body := doJSONRequest(t, ts.URL+"/api/attribution/sign", http.MethodPost, signReq, map[string]string{
		"X-Staff-User-ID": "admin-1",
		"X-Staff-Role":    RoleAdmin,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("attribution sign status = %d, body = %s", resp.StatusCode, body)
	}
	var attrLink AttributionLink
	_ = json.Unmarshal([]byte(body), &attrLink)
	if attrLink.Signature == "" || !strings.Contains(attrLink.SignedURL, "sig=") {
		t.Fatalf("expected valid signed URL, got %+v", attrLink)
	}

	// 2. Capture pending lead (Customer mistypes last digit as 081234567899 in web form!)
	captureReq := map[string]any{
		"full_name":      "Budi Santoso",
		"phone":          "0812-3456-7899", // mistyped 1 digit!
		"city_regency":   "Kota Surakarta",
		"event_type":     EventFrameMeasured,
		"payload":        map[string]any{"frame_width_mm": 138, "size_category": "M"},
		"src":            attrLink.Source,
		"host":           attrLink.HostCode,
		"sesi":           attrLink.SessionCode,
		"sig":            attrLink.Signature,
		"consent_crm_wa": true,
	}
	resp, body = doJSONRequest(t, ts.URL+"/api/capture/identify", http.MethodPost, captureReq, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("capture identify status = %d, body = %s", resp.StatusCode, body)
	}
	var capRes IdentifyLeadResult
	_ = json.Unmarshal([]byte(body), &capRes)
	if !strings.HasPrefix(capRes.VerificationCode, "DZ-") {
		t.Fatalf("expected DZ-xxxx code, got %q", capRes.VerificationCode)
	}
	if strings.Contains(capRes.WAMeURL, "Budi") || strings.Contains(capRes.WAMeURL, "Surakarta") {
		t.Fatalf("privacy violation: wa.me URL must not contain personal name or city: %s", capRes.WAMeURL)
	}

	// Record 4 frame_tried events so we can verify Level 1 returns at most 3
	for _, sku := range []string{"DOOZ-A1", "DOOZ-B2", "DOOZ-C3", "DOOZ-D4"} {
		now = now.Add(time.Second)
		_, _ = doJSONRequest(t, ts.URL+"/api/capture/events", http.MethodPost, map[string]any{
			"contact_id": capRes.ContactID,
			"event_type": EventFrameTried,
			"payload":    map[string]any{"frame_sku": sku, "frame_name": "Frame " + sku, "size_category": "M"},
			"src":        "web_tryon",
		}, nil)
	}

	// 3. Test Webhook Security: wrong secret -> 401, wrong device -> 403
	resp, _ = doJSONRequest(t, ts.URL+"/api/webhooks/fonnte/wrong-secret", http.MethodPost, map[string]any{
		"device":  "DOOZ-DEV-01",
		"sender":  "081234567890",
		"message": capRes.VerificationCode,
	}, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong webhook secret, got %d", resp.StatusCode)
	}

	resp, _ = doJSONRequest(t, ts.URL+"/api/webhooks/fonnte/sec-fonnte-999", http.MethodPost, map[string]any{
		"device":  "WRONG-DEVICE",
		"sender":  "081234567890",
		"message": capRes.VerificationCode,
	}, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for wrong device ID, got %d", resp.StatusCode)
	}

	// 4. Valid Fonnte Webhook from customer's REAL number (081234567890 != mistyped 081234567899)
	resp, body = doJSONRequest(t, ts.URL+"/api/webhooks/fonnte/sec-fonnte-999", http.MethodPost, map[string]any{
		"device":  "DOOZ-DEV-01",
		"sender":  "081234567890",
		"message": "Halo DOOZ, verifikasi hasil ukur saya kode: " + capRes.VerificationCode,
	}, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("webhook verify status = %d, body = %s", resp.StatusCode, body)
	}
	if strings.Contains(body, "token=") || strings.Contains(body, "data-saya") {
		t.Fatalf("security violation: webhook HTTP response must NEVER contain magic link: %s", body)
	}

	// Wait for rate-limited reply queue to dispatch
	if !queue.Flush(2 * time.Second) {
		t.Fatalf("reply queue timed out")
	}
	sent := fonnte.SentMessages()
	if len(sent) != 1 {
		t.Fatalf("expected 1 queued WA reply, got %d", len(sent))
	}
	if sent[0].ToPhone != "6281234567890" {
		t.Fatalf("expected reply to actual webhook sender 6281234567890, got %s", sent[0].ToPhone)
	}

	// Extract magic token from the WhatsApp message sent to the customer
	tokenRe := regexp.MustCompile(`token=([a-f0-9]+)`)
	m := tokenRe.FindStringSubmatch(sent[0].Message)
	if len(m) < 2 {
		t.Fatalf("expected magic link token in WA message, got: %s", sent[0].Message)
	}
	magicToken := m[1]

	// Replay of the same DZ-xxxx code must be ignored and NOT trigger a second reply
	resp, body = doJSONRequest(t, ts.URL+"/api/webhooks/fonnte/sec-fonnte-999", http.MethodPost, map[string]any{
		"device":  "DOOZ-DEV-01",
		"sender":  "081234567890",
		"message": capRes.VerificationCode,
	}, nil)
	queue.Flush(time.Second)
	if len(fonnte.SentMessages()) != 1 {
		t.Fatalf("expected single-use DZ-xxxx code to not send duplicate WA reply")
	}

	// 5. Magic Link Verify (GET does not consume token) & One-Time POST Exchange
	resp, body = doJSONRequest(t, ts.URL+"/api/auth/magic-verify?token="+magicToken, http.MethodGet, nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("magic-verify GET failed: %d %s", resp.StatusCode, body)
	}
	if resp.Header.Get("Referrer-Policy") != "no-referrer" {
		t.Fatalf("expected Referrer-Policy: no-referrer on magic-verify")
	}

	resp, body = doJSONRequest(t, ts.URL+"/api/auth/magic-exchange", http.MethodPost, map[string]any{
		"token": magicToken,
	}, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("magic-exchange POST failed: %d %s", resp.StatusCode, body)
	}
	if resp.Header.Get("Referrer-Policy") != "no-referrer" {
		t.Fatalf("expected Referrer-Policy: no-referrer on magic-exchange")
	}
	var exchRes struct {
		SessionToken string `json:"session_token"`
		AccessScope  string `json:"access_scope"`
		MemberCode   string `json:"member_code"`
	}
	_ = json.Unmarshal([]byte(body), &exchRes)
	if exchRes.SessionToken == "" || exchRes.AccessScope != AccessScopeFull {
		t.Fatalf("unexpected exchange result: %+v", exchRes)
	}

	// Second POST exchange with the same magic link token must fail (one-time use)
	resp, _ = doJSONRequest(t, ts.URL+"/api/auth/magic-exchange", http.MethodPost, map[string]any{
		"token": magicToken,
	}, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 when reusing one-time magic link, got %d", resp.StatusCode)
	}

	// 6. Member Portal ("Data Saya") with session token
	resp, body = doJSONRequest(t, ts.URL+"/api/portal/me", http.MethodGet, nil, map[string]string{
		"Authorization": "Bearer " + exchRes.SessionToken,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("portal/me status = %d, body = %s", resp.StatusCode, body)
	}
	var portalView MemberPortalView
	_ = json.Unmarshal([]byte(body), &portalView)
	if portalView.VerificationStatus != StatusVerified || portalView.PhoneMasked != "0812****7890" {
		t.Fatalf("expected verified contact bound to actual sender 0812****7890, got %+v", portalView)
	}
	if !strings.HasPrefix(portalView.QRToken, "DQR1.") {
		t.Fatalf("expected signed rotating QR token DQR1..., got %q", portalView.QRToken)
	}

	// 7. Cashier Level 1 Lookup (Full phone -> masked response + max 3 tried frames + audit log)
	resp, body = doJSONRequest(t, ts.URL+"/api/kasir/lookup-phone", http.MethodPost, map[string]any{
		"phone": "081234567890",
	}, map[string]string{
		"X-Staff-User-ID":   "kasir-ani",
		"X-Staff-Role":      RoleKasir,
		"X-Staff-Outlet-ID": "outlet-solo",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("kasir level 1 lookup failed: %d %s", resp.StatusCode, body)
	}
	var lvl1 KasirLevel1Response
	_ = json.Unmarshal([]byte(body), &lvl1)
	if lvl1.PhoneMasked != "0812****7890" || lvl1.FirstNameInitial != "Budi S." || len(lvl1.RecentTriedFrames) != 3 {
		t.Fatalf("unexpected level 1 response: %+v", lvl1)
	}
	if strings.Contains(body, "Kota Surakarta") {
		t.Fatalf("level 1 lookup must not expose full city/address: %s", body)
	}

	// 8. Cashier Level 2 Scan QR: plain DOOZ-xxxxx must be rejected; signed rotating QR token unlocks full profile
	resp, _ = doJSONRequest(t, ts.URL+"/api/kasir/scan-qr", http.MethodPost, map[string]any{
		"qr_token": portalView.MemberCode, // plain DOOZ-xxxxx
	}, map[string]string{
		"X-Staff-User-ID":   "kasir-ani",
		"X-Staff-Role":      RoleKasir,
		"X-Staff-Outlet-ID": "outlet-solo",
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected plain DOOZ-xxxxx to be rejected as QR token, got %d", resp.StatusCode)
	}

	resp, body = doJSONRequest(t, ts.URL+"/api/kasir/scan-qr", http.MethodPost, map[string]any{
		"qr_token": portalView.QRToken,
	}, map[string]string{
		"X-Staff-User-ID":   "kasir-ani",
		"X-Staff-Role":      RoleKasir,
		"X-Staff-Outlet-ID": "outlet-solo",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("kasir level 2 scan-qr failed: %d %s", resp.StatusCode, body)
	}
	var lvl2 KasirLevel2Response
	_ = json.Unmarshal([]byte(body), &lvl2)
	if lvl2.Contact.FullName != "Budi Santoso" || lvl2.Contact.CityRegency != "Kota Surakarta" || len(lvl2.TriedFrames) != 4 {
		t.Fatalf("expected full profile in level 2 response, got %+v", lvl2)
	}

	// 9. Cashier Manual Walk-in -> status 'unverified' and NO outbound WA sent
	beforeSentCount := len(fonnte.SentMessages())
	resp, body = doJSONRequest(t, ts.URL+"/api/kasir/walkin", http.MethodPost, map[string]any{
		"mode":         "manual",
		"full_name":    "Siti Walkin",
		"phone":        "081399998888",
		"city_regency": "Sukoharjo",
		"payload":      map[string]any{"frame_width_mm": 132, "size_category": "S"},
	}, map[string]string{
		"X-Staff-User-ID":   "kasir-ani",
		"X-Staff-Role":      RoleKasir,
		"X-Staff-Outlet-ID": "outlet-solo",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("manual walkin failed: %d %s", resp.StatusCode, body)
	}
	queue.Flush(time.Second)
	if len(fonnte.SentMessages()) != beforeSentCount {
		t.Fatalf("manual walk-in must NEVER send outbound WA")
	}
	if _, err := queue.EnqueueReply("6281399998888", "MANUAL", "test"); err == nil {
		t.Fatalf("expected ReplyQueue to block outbound message to number without inbound webhook trigger")
	}

	// 10. RBAC: Kasir & Host cannot export CSV or view Audit Logs; Admin/Owner can
	resp, _ = doJSONRequest(t, ts.URL+"/api/admin/contacts/export.csv", http.MethodGet, nil, map[string]string{
		"X-Staff-User-ID": "kasir-ani",
		"X-Staff-Role":    RoleKasir,
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for kasir CSV export, got %d", resp.StatusCode)
	}

	resp, csvBody := doJSONRequest(t, ts.URL+"/api/admin/contacts/export.csv", http.MethodGet, nil, map[string]string{
		"X-Staff-User-ID": "owner-yoppi",
		"X-Staff-Role":    RoleOwner,
	})
	if resp.StatusCode != http.StatusOK || !strings.Contains(csvBody, "0812****7890") {
		t.Fatalf("owner CSV export failed: %d %s", resp.StatusCode, csvBody)
	}

	resp, auditBody := doJSONRequest(t, ts.URL+"/api/admin/audit-logs", http.MethodGet, nil, map[string]string{
		"X-Staff-User-ID": "owner-yoppi",
		"X-Staff-Role":    RoleOwner,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("owner audit logs failed: %d %s", resp.StatusCode, auditBody)
	}
	for _, expectedLevel := range []string{AuditLevel1Lookup, AuditLevel2QR, AuditAdminExport} {
		if !strings.Contains(auditBody, expectedLevel) {
			t.Fatalf("expected audit logs to contain %q, got %s", expectedLevel, auditBody)
		}
	}

	// 11. Recycled Number Protection (>6 months inactive)
	now = now.Add(200 * 24 * time.Hour) // Advance 200 days (> 6 months)
	resp, body = doJSONRequest(t, ts.URL+"/api/webhooks/fonnte/sec-fonnte-999", http.MethodPost, map[string]any{
		"device":  "DOOZ-DEV-01",
		"sender":  "081234567890",
		"message": "MASUK",
	}, nil)
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, `"requires_name_confirm":true`) {
		t.Fatalf("expected MASUK after >6 months to require name confirm, got %d %s", resp.StatusCode, body)
	}
	queue.Flush(time.Second)
	msgs := fonnte.SentMessages()
	recycledMsg := msgs[len(msgs)-1].Message
	m2 := tokenRe.FindStringSubmatch(recycledMsg)
	recycledToken := m2[1]

	// Exchange without confirming name -> gets basic_recycled_pending scope (no full profile / no QR token)
	resp, body = doJSONRequest(t, ts.URL+"/api/auth/magic-exchange", http.MethodPost, map[string]any{
		"token": recycledToken,
	}, nil)
	var recExch struct {
		SessionToken string `json:"session_token"`
		AccessScope  string `json:"access_scope"`
	}
	_ = json.Unmarshal([]byte(body), &recExch)
	if recExch.AccessScope != AccessScopeBasicRecycledPending {
		t.Fatalf("expected basic_recycled_pending scope, got %s", recExch.AccessScope)
	}

	resp, body = doJSONRequest(t, ts.URL+"/api/portal/me", http.MethodGet, nil, map[string]string{
		"Authorization": "Bearer " + recExch.SessionToken,
	})
	var restrictedView MemberPortalView
	_ = json.Unmarshal([]byte(body), &restrictedView)
	if restrictedView.FullName != "" || restrictedView.CityRegency != "" || restrictedView.QRToken != "" {
		t.Fatalf("recycled pending session must hide full profile and QR token until confirmed: %+v", restrictedView)
	}

	// Confirm with wrong name -> 403
	resp, _ = doJSONRequest(t, ts.URL+"/api/portal/confirm-recycled", http.MethodPost, map[string]any{
		"full_name": "Orang Baru",
	}, map[string]string{
		"Authorization": "Bearer " + recExch.SessionToken,
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for wrong name confirmation on recycled number, got %d", resp.StatusCode)
	}

	// Confirm with registered full name -> unlocks full profile
	resp, _ = doJSONRequest(t, ts.URL+"/api/portal/confirm-recycled", http.MethodPost, map[string]any{
		"full_name": "budi santoso",
	}, map[string]string{
		"Authorization": "Bearer " + recExch.SessionToken,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for matching full name confirmation, got %d", resp.StatusCode)
	}

	// 12. Emergency KELUAR via WhatsApp revokes all active sessions
	resp, _ = doJSONRequest(t, ts.URL+"/api/webhooks/fonnte/sec-fonnte-999", http.MethodPost, map[string]any{
		"device":  "DOOZ-DEV-01",
		"sender":  "081234567890",
		"message": "KELUAR",
	}, nil)
	queue.Flush(time.Second)

	resp, _ = doJSONRequest(t, ts.URL+"/api/portal/me", http.MethodGet, nil, map[string]string{
		"Authorization": "Bearer " + recExch.SessionToken,
	})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected session to be revoked after KELUAR command, got %d", resp.StatusCode)
	}

	// 13. UU PDP Automatic Retention Purge (>24 months passive without purchase)
	now = now.Add(750 * 24 * time.Hour) // Advance > 24 months
	resp, body = doJSONRequest(t, ts.URL+"/api/admin/retention/purge", http.MethodPost, nil, map[string]string{
		"X-Staff-User-ID": "owner-yoppi",
		"X-Staff-Role":    RoleOwner,
	})
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, `"purged_count":2`) {
		t.Fatalf("expected retention purge to remove 2 contacts (>24m passive), got %d %s", resp.StatusCode, body)
	}
}

func doJSONRequest(t *testing.T, url, method string, payload any, headers map[string]string) (*http.Response, string) {
	t.Helper()
	var bodyReader *bytes.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("json.Marshal failed: %v", err)
		}
		bodyReader = bytes.NewReader(b)
	} else {
		bodyReader = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		t.Fatalf("NewRequest failed: %v", err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Do(%s %s) failed: %v", method, url, err)
	}
	defer resp.Body.Close()
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resp.Body)
	return resp, buf.String()
}


func TestCaptureSDKAndPortalWebEndpoints(t *testing.T) {
	srv := NewServer(ServerConfig{})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// 1. Standalone Capture SDK endpoint (/sdk/dooz-capture.js)
	resp, body := doJSONRequest(t, ts.URL+"/sdk/dooz-capture.js", http.MethodGet, nil, nil)
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, "DoozCaptureSDK") {
		t.Fatalf("expected /sdk/dooz-capture.js to serve DoozCaptureSDK, got %d", resp.StatusCode)
	}

	// 2. Portal Web Page (/data-saya) with strict Referrer-Policy: no-referrer
	resp, body = doJSONRequest(t, ts.URL+"/data-saya", http.MethodGet, nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on /data-saya, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Referrer-Policy"); got != "no-referrer" {
		t.Fatalf("expected Referrer-Policy: no-referrer on /data-saya, got %q", got)
	}
	if !strings.Contains(body, `name="referrer" content="no-referrer"`) {
		t.Fatalf("expected meta referrer no-referrer in /data-saya HTML")
	}

	// 3. Anti-spam Honeypot returns uniform 200 OK response without saving contact to store
	resp, body = doJSONRequest(t, ts.URL+"/api/capture/identify", http.MethodPost, map[string]any{
		"full_name":    "Spam Bot",
		"phone":        "081200001111",
		"city_regency": "Jakarta",
		"honeypot":     "http://spam-site.example",
	}, nil)
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, "DZ-") {
		t.Fatalf("expected uniform 200 response for honeypot spam, got %d %s", resp.StatusCode, body)
	}
	if len(srv.cfg.Store.data.Contacts) != 0 {
		t.Fatalf("expected honeypot submission NOT to persist contact in store, got %d contacts", len(srv.cfg.Store.data.Contacts))
	}

	// 4. Demo magic link endpoint + full Portal Member lifecycle (revoke-all, consents opt-out, privacy delete)
	resp, body = doJSONRequest(t, ts.URL+"/api/portal/demo-magic-link", http.MethodPost, map[string]any{
		"recycled_passive": false,
	}, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on /api/portal/demo-magic-link, got %d %s", resp.StatusCode, body)
	}
	var demoRes struct {
		MagicToken string `json:"magic_token"`
	}
	_ = json.Unmarshal([]byte(body), &demoRes)

	resp, body = doJSONRequest(t, ts.URL+"/api/auth/magic-exchange", http.MethodPost, map[string]any{
		"token": demoRes.MagicToken,
	}, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on magic-exchange, got %d %s", resp.StatusCode, body)
	}
	var exch struct {
		SessionToken string `json:"session_token"`
	}
	_ = json.Unmarshal([]byte(body), &exch)

	// Opt-out consent
	resp, body = doJSONRequest(t, ts.URL+"/api/portal/consents", http.MethodPost, map[string]any{
		"scope":   ConsentCRMWA,
		"granted": false,
	}, map[string]string{"Authorization": "Bearer " + exch.SessionToken})
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, `"granted":false`) {
		t.Fatalf("expected opt-out consent update to succeed, got %d %s", resp.StatusCode, body)
	}

	// UU PDP Data deletion
	resp, body = doJSONRequest(t, ts.URL+"/api/portal/privacy/delete", http.MethodPost, map[string]any{
		"immediate": true,
	}, map[string]string{"Authorization": "Bearer " + exch.SessionToken})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected privacy delete to succeed, got %d %s", resp.StatusCode, body)
	}
}

func TestSharedCatalogAndAdminCRUD(t *testing.T) {
	storePath := t.TempDir() + "/catalog_store.json"
	signer := NewSecuritySigner("catalog-hmac-test")
	store, err := NewStore(storePath, signer)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}
	srv := NewServer(ServerConfig{
		Store:  store,
		Signer: signer,
	})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// 1. GET /api/catalog/size-chart (with Cache-Control, ETag, and 304 Not Modified)
	resp, body := doJSONRequest(t, ts.URL+"/api/catalog/size-chart?width_mm=138", http.MethodGet, nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/catalog/size-chart failed: %d %s", resp.StatusCode, body)
	}
	etag := resp.Header.Get("ETag")
	if etag == "" || !strings.Contains(resp.Header.Get("Cache-Control"), "max-age=") {
		t.Fatalf("expected ETag and Cache-Control headers on size-chart, got ETag=%q CC=%q", etag, resp.Header.Get("Cache-Control"))
	}
	var scResp struct {
		OK              bool             `json:"ok"`
		SizeChart       []SizeChartEntry `json:"size_chart"`
		MatchedCategory SizeChartEntry   `json:"matched_category"`
	}
	if err := json.Unmarshal([]byte(body), &scResp); err != nil {
		t.Fatalf("unmarshal size-chart response failed: %v", err)
	}
	if len(scResp.SizeChart) != 5 || scResp.MatchedCategory.Category != "M" {
		t.Fatalf("expected 5 size categories and width_mm=138 -> M, got %+v", scResp)
	}

	// Conditional GET with If-None-Match -> 304 Not Modified
	resp304, _ := doJSONRequest(t, ts.URL+"/api/catalog/size-chart?width_mm=138", http.MethodGet, nil, map[string]string{
		"If-None-Match": etag,
	})
	if resp304.StatusCode != http.StatusNotModified {
		t.Fatalf("expected 304 Not Modified for matching ETag, got %d", resp304.StatusCode)
	}

	// 2. GET /api/catalog/frames & query filters (?size=, ?face_shape=, ?stock=, ?q=)
	resp, body = doJSONRequest(t, ts.URL+"/api/catalog/frames", http.MethodGet, nil, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/catalog/frames failed: %d %s", resp.StatusCode, body)
	}
	framesETag := resp.Header.Get("ETag")
	var frResp struct {
		OK     bool           `json:"ok"`
		Total  int            `json:"total"`
		Frames []CatalogFrame `json:"frames"`
	}
	_ = json.Unmarshal([]byte(body), &frResp)
	if frResp.Total < 5 {
		t.Fatalf("expected at least 5 seeded DOOZ frames, got %d", frResp.Total)
	}

	// Conditional GET on frames -> 304
	respFrames304, _ := doJSONRequest(t, ts.URL+"/api/catalog/frames", http.MethodGet, nil, map[string]string{
		"If-None-Match": framesETag,
	})
	if respFrames304.StatusCode != http.StatusNotModified {
		t.Fatalf("expected 304 Not Modified on /api/catalog/frames, got %d", respFrames304.StatusCode)
	}

	// Filter by ?size=M
	resp, body = doJSONRequest(t, ts.URL+"/api/catalog/frames?size=M", http.MethodGet, nil, nil)
	_ = json.Unmarshal([]byte(body), &frResp)
	if frResp.Total != 1 || frResp.Frames[0].SKU != "DOOZ-CLS-001" {
		t.Fatalf("expected ?size=M to return DOOZ-CLS-001, got %+v", frResp.Frames)
	}

	// Filter by ?face_shape=heart&stock=in_stock&q=Aviator
	resp, body = doJSONRequest(t, ts.URL+"/api/catalog/frames?face_shape=heart&stock=in_stock&q=Aviator", http.MethodGet, nil, nil)
	_ = json.Unmarshal([]byte(body), &frResp)
	if frResp.Total != 1 || frResp.Frames[0].SKU != "DOOZ-AVI-002" {
		t.Fatalf("expected filter ?face_shape=heart&stock=in_stock&q=Aviator to return DOOZ-AVI-002, got %+v", frResp.Frames)
	}

	// Single SKU lookup: GET /api/catalog/frames/DOOZ-RND-003
	resp, body = doJSONRequest(t, ts.URL+"/api/catalog/frames/DOOZ-RND-003", http.MethodGet, nil, nil)
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, `"Retro Round"`) {
		t.Fatalf("GET /api/catalog/frames/DOOZ-RND-003 failed: %d %s", resp.StatusCode, body)
	}

	// 3. RBAC enforcement on Admin Catalog endpoints (Kasir must be rejected with 403)
	kasirHeaders := map[string]string{
		"X-Staff-User-ID": "kasir-1",
		"X-Staff-Role":    RoleKasir,
	}
	resp, _ = doJSONRequest(t, ts.URL+"/api/admin/catalog/frames", http.MethodPost, map[string]any{
		"sku":            "DOOZ-HACK-999",
		"name":           "Unauthorized Frame",
		"frame_width_mm": 135,
	}, kasirHeaders)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 when kasir creates catalog frame, got %d", resp.StatusCode)
	}

	// 4. Admin CRUD: Create, Update, Update Size Chart, Bulk Import, Delete
	adminHeaders := map[string]string{
		"X-Staff-User-ID":   "admin-dooz",
		"X-Staff-Role":      RoleAdmin,
		"X-Staff-Outlet-ID": "hq-solo",
	}

	// Create new frame SKU (auto-derives size_category from frame_width_mm=131 -> S)
	resp, body = doJSONRequest(t, ts.URL+"/api/admin/catalog/frames", http.MethodPost, map[string]any{
		"sku":             "DOOZ-CAT-006",
		"name":            "Cat-Eye Rose Gold",
		"frame_width_mm":  131,
		"bridge_mm":       17,
		"temple_mm":       140,
		"frame_style":     "cat-eye",
		"face_shapes":     []string{"oval", "heart"},
		"color":           "Rose Gold",
		"material":        "Titanium",
		"price_idr":       429000,
		"thumbnail_url":   "/images/2.png",
		"tryon_asset_url": "/images/2.png",
		"stock_status":    StockInStock,
	}, adminHeaders)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/admin/catalog/frames expected 201, got %d %s", resp.StatusCode, body)
	}
	if !strings.Contains(body, `"size_category":"S"`) {
		t.Fatalf("expected auto-derived size_category S for 131mm, got %s", body)
	}

	// Update frame via PUT /api/admin/catalog/frames/DOOZ-CAT-006
	resp, body = doJSONRequest(t, ts.URL+"/api/admin/catalog/frames/DOOZ-CAT-006", http.MethodPut, map[string]any{
		"name":           "Cat-Eye Rose Gold Limited",
		"frame_width_mm": 136,
		"stock_status":   StockLowStock,
	}, adminHeaders)
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, `"size_category":"M"`) || !strings.Contains(body, `"low_stock"`) {
		t.Fatalf("PUT /api/admin/catalog/frames/DOOZ-CAT-006 failed: %d %s", resp.StatusCode, body)
	}

	// Update Size Chart via PUT /api/admin/catalog/size-chart
	customChart := DefaultSizeChart(time.Now().UTC())
	customChart[0].MaxMM = 126 // XS: 115-126
	customChart[1].MinMM = 127 // S: 127-133
	resp, body = doJSONRequest(t, ts.URL+"/api/admin/catalog/size-chart", http.MethodPut, map[string]any{
		"size_chart":         customChart,
		"recalculate_frames": true,
	}, adminHeaders)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT /api/admin/catalog/size-chart failed: %d %s", resp.StatusCode, body)
	}

	// Reject invalid overlapping size chart
	badChart := DefaultSizeChart(time.Now().UTC())
	badChart[1].MinMM = 120 // overlaps with XS (115-127)
	resp, _ = doJSONRequest(t, ts.URL+"/api/admin/catalog/size-chart", http.MethodPut, badChart, adminHeaders)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for overlapping size chart, got %d", resp.StatusCode)
	}

	// Bulk Import via POST /api/admin/catalog/import
	resp, body = doJSONRequest(t, ts.URL+"/api/admin/catalog/import", http.MethodPost, map[string]any{
		"frames": []map[string]any{
			{
				"sku":            "DOOZ-GEO-007",
				"name":           "Geometric Hex",
				"frame_width_mm": 141,
				"stock_status":   StockInStock,
			},
		},
	}, adminHeaders)
	if resp.StatusCode != http.StatusOK || !strings.Contains(body, `"imported_frames":1`) {
		t.Fatalf("POST /api/admin/catalog/import failed: %d %s", resp.StatusCode, body)
	}

	// Delete frame via DELETE /api/admin/catalog/frames/DOOZ-CAT-006
	resp, body = doJSONRequest(t, ts.URL+"/api/admin/catalog/frames/DOOZ-CAT-006", http.MethodDelete, nil, adminHeaders)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("DELETE /api/admin/catalog/frames/DOOZ-CAT-006 failed: %d %s", resp.StatusCode, body)
	}

	// Verify persistence by reloading Store from disk
	reloadedStore, err := NewStore(storePath, signer)
	if err != nil {
		t.Fatalf("reload store failed: %v", err)
	}
	if _, err := reloadedStore.GetCatalogFrameBySKU("DOOZ-GEO-007"); err != nil {
		t.Fatalf("expected DOOZ-GEO-007 to persist on disk, got err: %v", err)
	}
	if _, err := reloadedStore.GetCatalogFrameBySKU("DOOZ-CAT-006"); err == nil {
		t.Fatalf("expected deleted DOOZ-CAT-006 not to exist after reload")
	}

	// Verify Audit Logs recorded admin_catalog actions
	resp, auditBody := doJSONRequest(t, ts.URL+"/api/admin/audit-logs", http.MethodGet, nil, adminHeaders)
	if resp.StatusCode != http.StatusOK || !strings.Contains(auditBody, AuditAdminCatalog) {
		t.Fatalf("expected audit logs to include %q, got %d %s", AuditAdminCatalog, resp.StatusCode, auditBody)
	}
}

func TestGlassesTryOnSharedCatalogAndFrameTriedSync(t *testing.T) {
	now := time.Date(2026, 11, 16, 16, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }

	signer := NewSecuritySigner("test-hmac-secret-dooz")
	store, err := NewStore(t.TempDir()+"/hub_tryon.json", signer)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}
	fonnte := NewFonnteAdapter("mock-token", "DOOZ-WA-DEVICE-01")
	queue := NewReplyQueue(fonnte, 5*time.Millisecond, 10*time.Millisecond)
	defer queue.Close()

	srv := NewServer(ServerConfig{
		Store:            store,
		Signer:           signer,
		WAProvider:       fonnte,
		ReplyQueue:       queue,
		WebhookSecret:    "test-webhook-secret",
		FonnteDeviceID:   "DOOZ-WA-DEVICE-01",
		OfficialWANumber: "6281122334455",
		PortalBaseURL:    "https://crm.dooz.id",
		WebhookRateLimit: 20,
		RateLimitWindow:  time.Minute,
		Clock:            clock,
	})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// 1. Customer tries frames in `glasses-try-on` and submits LeadCaptureModal with `sku_list`
	resp, body := doJSONRequest(t, ts.URL+"/api/capture/identify", http.MethodPost, map[string]any{
		"full_name":      "Budi Santoso",
		"phone":          "081355667788",
		"city_regency":   "Kota Surakarta (Solo)",
		"event_type":     EventFrameMeasured,
		"consent_crm_wa": true,
		"src":            "live_tiktok",
		"host":           "rina",
		"sesi":           "20261116",
		"payload": map[string]any{
			"frame_width_mm": 138,
			"size_category":  "M",
			"frame_sku":      "DOOZ-CLS-001",
			"frame_name":     "Classic Black",
			"sku_list":       []string{"DOOZ-CLS-001", "DOOZ-RND-003"},
		},
	}, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("identify failed: %d %s", resp.StatusCode, body)
	}
	var idRes IdentifyLeadResult
	_ = json.Unmarshal([]byte(body), &idRes)

	// 2. Verify via Fonnte inbound webhook so customer gets Magic Link
	resp, body = doJSONRequest(t, ts.URL+"/api/webhooks/fonnte", http.MethodPost, map[string]any{
		"device":  "DOOZ-WA-DEVICE-01",
		"sender":  "6281355667788",
		"message": "Halo DOOZ, verifikasi hasil ukur saya kode: " + idRes.VerificationCode,
	}, map[string]string{
		"X-Fonnte-Secret": "test-webhook-secret",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("webhook verify failed: %d %s", resp.StatusCode, body)
	}

	if !queue.Flush(2 * time.Second) {
		t.Fatalf("reply queue timed out")
	}
	sentMsgs := fonnte.SentMessages()
	if len(sentMsgs) == 0 {
		t.Fatalf("expected outbound magic link message after inbound verification")
	}
	tokenRe := regexp.MustCompile(`token=([a-f0-9]+)`)
	m := tokenRe.FindStringSubmatch(sentMsgs[len(sentMsgs)-1].Message)
	if len(m) < 2 {
		t.Fatalf("expected magic link token in WA reply: %s", sentMsgs[len(sentMsgs)-1].Message)
	}
	magicToken := m[1]

	// 3. Exchange Magic Link via POST /api/auth/magic-exchange
	resp, body = doJSONRequest(t, ts.URL+"/api/auth/magic-exchange", http.MethodPost, map[string]any{
		"token": magicToken,
	}, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("magic-exchange failed: %d %s", resp.StatusCode, body)
	}
	var sessData struct {
		SessionToken string `json:"session_token"`
		ContactID    string `json:"contact_id"`
	}
	_ = json.Unmarshal([]byte(body), &sessData)
	if sessData.SessionToken == "" || sessData.ContactID == "" {
		t.Fatalf("expected session_token and contact_id in magic-exchange response: %s", body)
	}

	// 4. Customer tries another frame (`DOOZ-AVI-002`) in `glasses-try-on` using only Bearer session_token
	resp, body = doJSONRequest(t, ts.URL+"/api/capture/events", http.MethodPost, map[string]any{
		"event_type": EventFrameTried,
		"src":        "glasses_try_on",
		"payload": map[string]any{
			"frame_sku": "DOOZ-AVI-002",
		},
	}, map[string]string{
		"Authorization": "Bearer " + sessData.SessionToken,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/capture/events with Bearer session failed: %d %s", resp.StatusCode, body)
	}
	// Verify automatic catalog enrichment (Modern Aviator, 142mm, Size L)
	if !strings.Contains(body, `"frame_name":"Modern Aviator"`) || !strings.Contains(body, `"size_category":"L"`) {
		t.Fatalf("expected automatic catalog enrichment for DOOZ-AVI-002, got: %s", body)
	}

	// 5. Verify Portal "Data Saya" (`GET /api/portal/me`) shows all 3 tried frames and customer size M (138mm)
	resp, body = doJSONRequest(t, ts.URL+"/api/portal/me", http.MethodGet, nil, map[string]string{
		"Authorization": "Bearer " + sessData.SessionToken,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/portal/me failed: %d %s", resp.StatusCode, body)
	}
	var portalView MemberPortalView
	_ = json.Unmarshal([]byte(body), &portalView)
	if portalView.LatestMeasurement == nil || portalView.LatestMeasurement.SizeCategory != "M" {
		t.Fatalf("expected latest_measurement size_category=M in Portal Data Saya, got: %+v", portalView.LatestMeasurement)
	}
	if len(portalView.TriedFrames) < 3 {
		t.Fatalf("expected at least 3 tried_frames in Portal Data Saya, got %d: %s", len(portalView.TriedFrames), body)
	}

	// 6. Verify Cashier Outlet Level 1 lookup sees the 3 tried frames and customer size M
	resp, body = doJSONRequest(t, ts.URL+"/api/kasir/lookup-phone", http.MethodPost, map[string]any{
		"phone": "081355667788",
	}, map[string]string{
		"X-Staff-User-ID":   "kasir-gading-1",
		"X-Staff-Role":      RoleKasir,
		"X-Staff-Outlet-ID": "outlet-solo-gading",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/kasir/lookup-phone failed: %d %s", resp.StatusCode, body)
	}
	if !strings.Contains(body, `"DOOZ-AVI-002"`) || !strings.Contains(body, `"DOOZ-CLS-001"`) || !strings.Contains(body, `"DOOZ-RND-003"`) {
		t.Fatalf("expected Cashier Level 1 lookup to show tried frames (DOOZ-AVI-002, DOOZ-CLS-001, DOOZ-RND-003), got: %s", body)
	}
}
