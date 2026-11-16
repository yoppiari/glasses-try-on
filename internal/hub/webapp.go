package hub

import (
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

// Rute aplikasi web (SPA) yang dilayani Customer Hub:
//
//	/                 Aplikasi customer: Coba Kacamata (Try-On)
//	/kartu-member     Aplikasi customer: Kartu Member Saya (dibuka lewat link WhatsApp)
//	/staf/kasir       Aplikasi staf: Kasir
//	/staf/laporan     Aplikasi staf: Laporan (berisi link overlay OBS Live)
//	/staf/katalog     Aplikasi staf: Katalog
//	/staf/live        Overlay OBS Live (tanpa menu, latar transparan)
const (
	RouteTryOn       = "/"
	RouteKartuMember = "/kartu-member"
	RouteStafKasir   = "/staf/kasir"
	RouteStafLaporan = "/staf/laporan"
	RouteStafKatalog = "/staf/katalog"
	RouteStafLive    = "/staf/live"
)

// legacyPathRedirects memetakan path lama ke rute baru agar link lama tidak rusak.
var legacyPathRedirects = map[string]string{
	"/kasir":         RouteStafKasir,
	"/admin/crm":     RouteStafLaporan,
	"/admin/catalog": RouteStafKatalog,
	"/live-counter":  RouteStafLive,
	"/data-saya":     RouteKartuMember,
	"/staf":          RouteStafKasir,
}

// legacyViewRedirects memetakan query lama `/?view=...` ke rute baru.
var legacyViewRedirects = map[string]string{
	"kasir":         RouteStafKasir,
	"crm-admin":     RouteStafLaporan,
	"catalog-admin": RouteStafKatalog,
	"live-counter":  RouteStafLive,
	"portal":        RouteKartuMember,
}

// knownSPARoutes adalah rute yang dirender oleh aplikasi web (index.html).
var knownSPARoutes = map[string]bool{
	RouteTryOn:       true,
	RouteKartuMember: true,
	RouteStafKasir:   true,
	RouteStafLaporan: true,
	RouteStafKatalog: true,
	RouteStafLive:    true,
}

// LegacyRedirectTarget mengembalikan URL tujuan untuk link lama (path lama atau `?view=`),
// dengan tetap membawa query lain (mis. `token`, `sesi`, `host`) kecuali `view`.
func LegacyRedirectTarget(u *url.URL) (string, bool) {
	if u == nil {
		return "", false
	}
	p := normalizeWebPath(u.Path)
	q := u.Query()

	target, ok := legacyPathRedirects[p]
	if !ok && p == RouteTryOn {
		if v := strings.TrimSpace(q.Get("view")); v != "" {
			target, ok = legacyViewRedirects[v]
		}
		if !ok && strings.TrimSpace(q.Get("token")) != "" {
			// Magic link lama yang menunjuk ke root (`/?token=...`) → Kartu Member Saya
			target, ok = RouteKartuMember, true
		}
	}
	if !ok {
		return "", false
	}
	q.Del("view")
	if enc := q.Encode(); enc != "" {
		return target + "?" + enc, true
	}
	return target, true
}

// normalizeWebPath membuang prefix GitHub Pages lama (`/try-on`) dan garis miring di akhir.
func normalizeWebPath(p string) string {
	if p == "/try-on" || strings.HasPrefix(p, "/try-on/") {
		p = strings.TrimPrefix(p, "/try-on")
	}
	if p == "" {
		return "/"
	}
	if len(p) > 1 {
		p = strings.TrimRight(p, "/")
		if p == "" {
			p = "/"
		}
	}
	return p
}

// handleWebApp melayani aplikasi web (SPA) dari StaticDir dengan fallback ke index.html,
// serta mengalihkan link lama ke rute baru.
func (s *Server) handleWebApp(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, http.StatusNotFound, "endpoint tidak ditemukan")
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if target, ok := LegacyRedirectTarget(r.URL); ok {
		// Jangan bocorkan token magic link lewat Referer saat pengalihan.
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		http.Redirect(w, r, target, http.StatusFound)
		return
	}

	webPath := normalizeWebPath(r.URL.Path)
	staticDir := strings.TrimSpace(s.cfg.StaticDir)

	if staticDir != "" {
		rawPath := r.URL.Path
		if strings.HasPrefix(rawPath, "/try-on/") {
			rawPath = strings.TrimPrefix(rawPath, "/try-on")
		}
		clean := path.Clean("/" + rawPath)
		if clean != "/" {
			full := filepath.Join(staticDir, filepath.FromSlash(clean))
			if st, err := os.Stat(full); err == nil && !st.IsDir() {
				s.serveStaticFile(w, r, full, st.ModTime(), clean)
				return
			}
			if path.Ext(clean) != "" {
				http.NotFound(w, r)
				return
			}
		}
		indexPath := filepath.Join(staticDir, "index.html")
		if st, err := os.Stat(indexPath); err == nil && !st.IsDir() {
			setHTMLSecurityHeaders(w)
			s.serveStaticFile(w, r, indexPath, st.ModTime(), "/index.html")
			return
		}
	}

	// Tanpa hasil build web: sajikan halaman pengganti untuk rute yang dikenal.
	if webPath == RouteStafLive {
		s.handleLiveCounterWebPage(w, r)
		return
	}
	if knownSPARoutes[webPath] {
		setHTMLSecurityHeaders(w)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(webAppFallbackHTML))
		return
	}
	http.NotFound(w, r)
}

func setHTMLSecurityHeaders(w http.ResponseWriter) {
	// Kartu Member dibuka lewat magic link (?token=...): token tidak boleh bocor lewat Referer.
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}

func (s *Server) serveStaticFile(w http.ResponseWriter, r *http.Request, full string, modTime time.Time, urlPath string) {
	f, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	switch {
	case strings.HasSuffix(urlPath, ".html"):
		w.Header().Set("Cache-Control", "no-cache")
	case strings.HasPrefix(urlPath, "/assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	default:
		w.Header().Set("Cache-Control", "public, max-age=3600")
	}
	http.ServeContent(w, r, filepath.Base(full), modTime, f)
}

const webAppFallbackHTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="referrer" content="no-referrer" />
  <meta name="theme-color" content="#252A2D" />
  <title>Kacamata DOOZ</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, -apple-system, sans-serif; background: #FFF8F0; color: #252A2D; }
    header { background: #252A2D; color: #fff; padding: 14px 20px; font-weight: 700; letter-spacing: 0.3em; font-size: 12px; }
    header b { display: block; color: #EC6702; letter-spacing: 0.25em; font-size: 20px; }
    main { max-width: 520px; margin: 32px auto; padding: 0 16px; }
    .card { background: #F1E9E0; border: 1px solid #C9D4D3; border-radius: 16px; padding: 20px; }
  </style>
</head>
<body>
  <header>KACAMATA<b>DOOZ</b></header>
  <main>
    <div class="card">
      <p>Aplikasi sedang disiapkan. Silakan coba beberapa saat lagi.</p>
    </div>
  </main>
</body>
</html>`
