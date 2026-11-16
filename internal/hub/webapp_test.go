package hub

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLegacyRedirectTarget(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"/?view=kasir", "/staf/kasir", true},
		{"/?view=crm-admin", "/staf/laporan", true},
		{"/?view=catalog-admin", "/staf/katalog", true},
		{"/?view=live-counter&sesi=20261116&host=rina", "/staf/live?host=rina&sesi=20261116", true},
		{"/?view=portal", "/kartu-member", true},
		{"/?token=abc123", "/kartu-member?token=abc123", true},
		{"/data-saya", "/kartu-member", true},
		{"/data-saya/?token=abc123", "/kartu-member?token=abc123", true},
		{"/kasir", "/staf/kasir", true},
		{"/admin/crm/", "/staf/laporan", true},
		{"/admin/catalog", "/staf/katalog", true},
		{"/live-counter", "/staf/live", true},
		{"/staf", "/staf/kasir", true},
		{"/try-on/?view=kasir", "/staf/kasir", true},
		{"/try-on/data-saya?token=t1", "/kartu-member?token=t1", true},
		// Rute baru & URL try-on dari Ukur Frame tidak dialihkan
		{"/", "", false},
		{"/?size=M&width_mm=138", "", false},
		{"/kartu-member?token=abc", "", false},
		{"/staf/kasir", "", false},
		{"/staf/laporan", "", false},
		{"/?view=unknown", "", false},
	}
	for _, tc := range cases {
		u, err := url.Parse(tc.in)
		if err != nil {
			t.Fatalf("parse %q: %v", tc.in, err)
		}
		got, ok := LegacyRedirectTarget(u)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("LegacyRedirectTarget(%q) = (%q, %v), want (%q, %v)", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}

func TestWebAppServesSPAAndRedirects(t *testing.T) {
	dir := t.TempDir()
	indexHTML := `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body><div id="root"></div>DOOZ-SPA</body></html>`
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte(indexHTML), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("console.log('dooz')"), 0o644); err != nil {
		t.Fatal(err)
	}

	srv := NewServer(ServerConfig{StaticDir: dir})
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	noFollow := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

	// SPA routes serve index.html with Referrer-Policy: no-referrer
	for _, p := range []string{"/", "/?size=M&width_mm=138", "/kartu-member", "/kartu-member?token=abc", "/staf/kasir", "/staf/laporan", "/staf/katalog", "/staf/live"} {
		resp, err := noFollow.Get(ts.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		buf := new(strings.Builder)
		_, _ = ioCopy(buf, resp)
		if resp.StatusCode != http.StatusOK || !strings.Contains(buf.String(), "DOOZ-SPA") {
			t.Fatalf("GET %s: expected SPA index 200, got %d", p, resp.StatusCode)
		}
		if got := resp.Header.Get("Referrer-Policy"); got != "no-referrer" {
			t.Fatalf("GET %s: expected Referrer-Policy no-referrer, got %q", p, got)
		}
	}

	// Legacy links redirect (302) to new routes
	redirects := map[string]string{
		"/?view=kasir":          "/staf/kasir",
		"/?view=crm-admin":      "/staf/laporan",
		"/?view=catalog-admin":  "/staf/katalog",
		"/?view=live-counter":   "/staf/live",
		"/data-saya?token=abc1": "/kartu-member?token=abc1",
		"/staf":                 "/staf/kasir",
	}
	for from, to := range redirects {
		resp, err := noFollow.Get(ts.URL + from)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusFound || resp.Header.Get("Location") != to {
			t.Fatalf("GET %s: expected 302 → %s, got %d → %q", from, to, resp.StatusCode, resp.Header.Get("Location"))
		}
		if resp.Header.Get("Referrer-Policy") != "no-referrer" {
			t.Fatalf("GET %s: redirect must set Referrer-Policy no-referrer", from)
		}
	}

	// Static assets are served, missing assets are 404 (not index.html)
	resp, err := noFollow.Get(ts.URL + "/assets/app.js")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || !strings.Contains(resp.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("expected /assets/app.js 200 immutable, got %d %q", resp.StatusCode, resp.Header.Get("Cache-Control"))
	}
	resp, err = noFollow.Get(ts.URL + "/assets/missing.js")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for missing asset, got %d", resp.StatusCode)
	}

	// Path traversal stays inside StaticDir
	resp, err = noFollow.Get(ts.URL + "/../../etc/passwd")
	if err != nil {
		t.Fatal(err)
	}
	buf := new(strings.Builder)
	_, _ = ioCopy(buf, resp)
	if strings.Contains(buf.String(), "root:") {
		t.Fatalf("path traversal must not escape static dir")
	}

	// Unknown API endpoints stay JSON 404 instead of falling back to the SPA
	resp, err = noFollow.Get(ts.URL + "/api/tidak-ada")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown /api path, got %d", resp.StatusCode)
	}

	// API routes still work alongside the SPA
	resp, err = noFollow.Get(ts.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /api/health 200, got %d", resp.StatusCode)
	}
}

func ioCopy(dst *strings.Builder, resp *http.Response) (int64, error) {
	defer resp.Body.Close()
	buf := make([]byte, 32*1024)
	var total int64
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			dst.Write(buf[:n])
			total += int64(n)
		}
		if err != nil {
			return total, nil
		}
	}
}
