package hub

// Tahap 1 pemisahan DOOZ CRM (repo yoppiari/dooz-crm, https://dooz-crm-pocco.fural.space).
//
// Bila ServerConfig.CRMURL diisi (env CRM_URL), server Try-On ini TIDAK lagi memegang data member:
//   - Aplikasi staf lama (/staf/*, /kasir, /admin/crm, /admin/catalog, /live-counter, /?view=kasir...) → 302 ke CRM.
//   - API staf (/api/kasir/*, /api/admin/*, /api/attribution/sign, /api/live/*, /api/staff/*) → 308 ke CRM
//     (CRM wajib login staf; tidak ada CORS untuk endpoint staf).
//   - API member & webhook Fonnte (/api/capture/*, /api/auth/*, /api/portal/*, /api/catalog/*, /api/webhooks/fonnte*,
//     /api/attribution/verify, /sdk/dooz-capture.js) → di-proxy ke CRM supaya App Ukur & Try-On versi sekarang tidak
//     putus sampai tahap 2 (mini app memanggil CRM langsung).
// Pembersihan kode staf/hub dari repo ini dilakukan di tahap 3.

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

var crmStaffAPIPrefixes = []string{"/api/kasir/", "/api/admin/", "/api/attribution/sign", "/api/live/", "/api/staff/"}

var crmMemberProxyPrefixes = []string{
	"/api/capture/", "/api/auth/", "/api/portal/", "/api/catalog/", "/api/webhooks/fonnte",
	"/api/attribution/verify", "/sdk/dooz-capture.js",
}

// crmStaffPageRedirects: halaman staf lama → rute aplikasi staf CRM.
var crmStaffPageRedirects = map[string]string{
	"/staf":          RouteStafKasir,
	"/staf/kasir":    RouteStafKasir,
	"/staf/laporan":  RouteStafLaporan,
	"/staf/katalog":  RouteStafKatalog,
	"/staf/live":     RouteStafLive,
	"/kasir":         RouteStafKasir,
	"/admin/crm":     RouteStafLaporan,
	"/admin/catalog": RouteStafKatalog,
	"/live-counter":  RouteStafLive,
}

var crmStaffViewRedirects = map[string]string{
	"kasir":         RouteStafKasir,
	"crm-admin":     RouteStafLaporan,
	"catalog-admin": RouteStafKatalog,
	"live-counter":  RouteStafLive,
}

func hasAnyPrefix(p string, prefixes []string) bool {
	for _, pre := range prefixes {
		if p == strings.TrimSuffix(pre, "/") || strings.HasPrefix(p, pre) {
			return true
		}
	}
	return false
}

// CRMStaffRedirectTarget mengembalikan path CRM untuk halaman staf lama (tanpa host), atau "".
func CRMStaffRedirectTarget(u *url.URL) string {
	p := normalizeWebPath(u.Path)
	q := u.Query()
	target, ok := crmStaffPageRedirects[p]
	if !ok && p == RouteTryOn {
		target, ok = crmStaffViewRedirects[strings.TrimSpace(q.Get("view"))]
	}
	if !ok && strings.HasPrefix(p, "/staf/") {
		target, ok = p, true
	}
	if !ok {
		return ""
	}
	q.Del("view")
	if enc := q.Encode(); enc != "" {
		return target + "?" + enc
	}
	return target
}

func newCRMProxy(crm *url.URL) *httputil.ReverseProxy {
	rp := httputil.NewSingleHostReverseProxy(crm)
	baseDirector := rp.Director
	rp.Director = func(r *http.Request) {
		baseDirector(r)
		r.Host = crm.Host // routing Fural berbasis Host
		r.Header.Set("X-Forwarded-Host", crm.Host)
	}
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		writeError(w, http.StatusBadGateway, "DOOZ CRM tidak dapat dihubungi, coba lagi sebentar")
	}
	return rp
}

// crmForward menangani request yang dipindah ke CRM. true = sudah dibalas.
func (s *Server) crmForward(w http.ResponseWriter, r *http.Request) bool {
	if s.crmURL == nil {
		return false
	}
	p := r.URL.Path
	crmBase := strings.TrimRight(s.crmURL.String(), "/")
	switch {
	case hasAnyPrefix(p, crmStaffAPIPrefixes):
		w.Header().Set("Cache-Control", "no-store")
		target := crmBase + p
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		http.Redirect(w, r, target, http.StatusPermanentRedirect)
		return true
	case hasAnyPrefix(p, crmMemberProxyPrefixes):
		s.crmProxy.ServeHTTP(w, r)
		return true
	case r.Method == http.MethodGet || r.Method == http.MethodHead:
		if target := CRMStaffRedirectTarget(r.URL); target != "" {
			w.Header().Set("Referrer-Policy", "no-referrer")
			w.Header().Set("Cache-Control", "no-store")
			http.Redirect(w, r, crmBase+target, http.StatusFound)
			return true
		}
	}
	return false
}
