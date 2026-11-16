package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/yoppiari/glasses-try-on/internal/hub"
)

func main() {
	port := envOrDefault("PORT", "8089")
	dbPath := envOrDefault("HUB_DB_PATH", "./data/customer_hub.json")
	hmacSecret := envOrDefault("HUB_HMAC_SECRET", "dooz-hmac-secret-2026")
	webhookSecret := envOrDefault("FONNTE_WEBHOOK_SECRET", "dooz-fonnte-secret-2026")
	deviceID := envOrDefault("FONNTE_DEVICE_ID", "DOOZ-WA-DEVICE-01")
	fonnteToken := envOrDefault("FONNTE_API_TOKEN", "mock-fonnte-token")
	officialWA := envOrDefault("DOOZ_OFFICIAL_WA", "6281122334455")
	portalURL := envOrDefault("DOOZ_PORTAL_URL", "https://crm.dooz.id")

	flag.StringVar(&port, "port", port, "HTTP listen port")
	flag.StringVar(&dbPath, "db", dbPath, "Path to persistent JSON/SQLite-compatible store")
	flag.Parse()

	signer := hub.NewSecuritySigner(hmacSecret)
	store, err := hub.NewStore(dbPath, signer)
	if err != nil {
		log.Fatalf("failed to initialize customer hub store: %v", err)
	}

	waProvider := hub.NewFonnteAdapter(fonnteToken, deviceID)
	replyQueue := hub.NewReplyQueue(waProvider, 500*time.Millisecond, 1500*time.Millisecond)
	defer replyQueue.Close()

	srv := hub.NewServer(hub.ServerConfig{
		Store:            store,
		Signer:           signer,
		WAProvider:       waProvider,
		ReplyQueue:       replyQueue,
		WebhookSecret:    webhookSecret,
		FonnteDeviceID:   deviceID,
		OfficialWANumber: officialWA,
		PortalBaseURL:    portalURL,
		WebhookRateLimit: 30,
		RateLimitWindow:  time.Minute,
	})

	addr := fmt.Sprintf("0.0.0.0:%s", port)
	log.Printf("[DOOZ Customer Hub] listening on %s (db=%s, device=%s)", addr, dbPath, deviceID)
	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		log.Fatalf("server exited: %v", err)
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
