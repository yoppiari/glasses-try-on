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
