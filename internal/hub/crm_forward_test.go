package hub

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCRMForwardRedirectsStaffAndProxiesMemberAPI(t *testing.T) {
	var gotHost, gotPath, gotOrigin, gotAuth string
	crm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHost, gotPath, gotOrigin, gotAuth = r.Host, r.URL.RequestURI(), r.Header.Get("Origin"), r.Header.Get("Authorization")
		w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true,"from":"crm"}`)
	}))
	defer crm.Close()

	srv := NewServer(ServerConfig{CRMURL: crm.URL})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	noFollow := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

	// Halaman staf lama → 302 ke CRM (query dibawa).
	pages := map[string]string{
		"/staf/kasir":                 "/staf/kasir",
		"/staf/laporan":               "/staf/laporan",
		"/staf/katalog":               "/staf/katalog",
		"/staf/live?sesi=1":           "/staf/live?sesi=1",
		"/staf":                       "/staf/kasir",
		"/kasir":                      "/staf/kasir",
		"/admin/crm":                  "/staf/laporan",
		"/admin/catalog":              "/staf/katalog",
		"/live-counter?host=rina":     "/staf/live?host=rina",
		"/?view=kasir":                "/staf/kasir",
		"/try-on/?view=catalog-admin": "/staf/katalog",
		"/staf/sesuatu-baru?x=1":      "/staf/sesuatu-baru?x=1",
	}
	for from, to := range pages {
		resp, err := noFollow.Get(ts.URL + from)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusFound || resp.Header.Get("Location") != crm.URL+to {
			t.Fatalf("GET %s: expected 302 → %s, got %d %q", from, crm.URL+to, resp.StatusCode, resp.Header.Get("Location"))
		}
	}

	// API staf → 308 ke CRM (metode & body dipertahankan oleh klien; CRM wajib login).
	for _, p := range []string{"/api/kasir/lookup-phone", "/api/admin/dashboard?x=1", "/api/attribution/sign", "/api/live/counter", "/api/staff/login"} {
		req, _ := http.NewRequest(http.MethodPost, ts.URL+p, strings.NewReader(`{}`))
		resp, err := noFollow.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusPermanentRedirect || resp.Header.Get("Location") != crm.URL+p {
			t.Fatalf("POST %s: expected 308 → CRM, got %d %q", p, resp.StatusCode, resp.Header.Get("Location"))
		}
	}

	// API member & webhook → proxy ke CRM; CORS dari CRM (bukan wildcard lokal).
	crmHost := strings.TrimPrefix(crm.URL, "http://")
	for _, p := range []string{"/api/capture/identify", "/api/capture/verification-status", "/api/auth/whatsapp-login", "/api/portal/measurements/abc/primary", "/api/catalog/frames?size=M", "/api/webhooks/fonnte/secret-lama"} {
		req, _ := http.NewRequest(http.MethodPost, ts.URL+p, strings.NewReader(`{}`))
		req.Header.Set("Origin", "https://ukur-frame-dooz-pocco.fural.space")
		req.Header.Set("Authorization", "Bearer member-tok")
		resp, err := noFollow.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), `"from":"crm"`) {
			t.Fatalf("POST %s: expected proxied CRM response, got %d %s", p, resp.StatusCode, body)
		}
		if gotPath != p || gotHost != crmHost || gotOrigin != "https://ukur-frame-dooz-pocco.fural.space" || gotAuth != "Bearer member-tok" {
			t.Fatalf("proxy must forward path/host/origin/auth, got path=%q host=%q origin=%q auth=%q", gotPath, gotHost, gotOrigin, gotAuth)
		}
		if acao := resp.Header.Values("Access-Control-Allow-Origin"); len(acao) != 1 || acao[0] != "https://ukur-frame-dooz-pocco.fural.space" {
			t.Fatalf("proxied response must carry only CRM CORS header, got %v", acao)
		}
	}

	// Aplikasi customer Try-On tetap dilayani lokal.
	resp, err := noFollow.Get(ts.URL + "/?size=M")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Try-On root must stay local, got %d", resp.StatusCode)
	}
}

func TestCRMForwardDisabledWithoutURL(t *testing.T) {
	srv := NewServer(ServerConfig{})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()
	noFollow := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := noFollow.Get(ts.URL + "/staf/kasir")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("without CRM_URL /staf/kasir stays local (legacy), got %d", resp.StatusCode)
	}
}
