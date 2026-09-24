package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/events"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/utils"
)

// sseMaxLifetime adalah umur maksimal satu koneksi SSE. Koneksi setengah-putus
// (client hilang tanpa FIN — NAT timeout, laptop sleep) tidak cepat memicu
// Context.Done dan write ke buffer TCP masih "berhasil", sehingga goroutine SSE
// bisa hidup lama. Setelah umur ini tercapai, handler menutup koneksi; client
// EventSource akan reconnect otomatis. 30 menit cukup untuk sesi monitoring
// backoffice tanpa menumpuk zombie.
const sseMaxLifetime = 30 * time.Minute

// sseHeartbeatInterval adalah interval heartbeat SSE.
const sseHeartbeatInterval = 25 * time.Second

func (h *Handler) EventStream(c *gin.Context) {
	// Tolak koneksi baru bila bus sudah penuh (cap subscriber): tanpa ini,
	// koneksi zombie menumpuk tak terbatas di map clients.
	client, ok := h.Services.Events.Subscribe()
	if !ok {
		utils.Error(c, http.StatusServiceUnavailable, "Too many SSE connections", gin.H{})
		return
	}
	defer h.Services.Events.Unsubscribe(client)

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	// Write-error detection. Pada koneksi setengah-putus, write ke buffer TCP
	// bisa tetap "berhasil" untuk sementara, tetapi setelah buffer penuh / RST
	// diterima, Flush/error akan terlihat. SetWriteDeadline memberi deadline
	// per-tulis; Write/Flush melewati deadline → error terdeteksi → return false
	// → goroutine keluar, subscriber dilepas. Ini menutup celah goroutine zombie
	// yang hidup berjam-jam menunggu RST OS.
	rc := http.NewResponseController(c.Writer)

	// Disable the global write timeout on this long-lived SSE connection by
	// setting the write deadline to zero initially.
	_ = rc.SetWriteDeadline(time.Time{})

	heartbeat := time.NewTicker(sseHeartbeatInterval)
	defer heartbeat.Stop()
	deadline := time.NewTimer(sseMaxLifetime)
	defer deadline.Stop()

	send := func(typ string, event events.Event) bool {
		// Deadline per-write; write yang menggantung (client zombie) diputus.
		_ = rc.SetWriteDeadline(time.Now().Add(10 * time.Second))
		c.SSEvent(typ, event)
		// Flush mendorong bytes ke socket; error di sini = koneksi mati.
		if err := rc.Flush(); err != nil {
			return false
		}
		return true
	}

	for {
		select {
		case event := <-client:
			if !send(event.Type, event) {
				return
			}
		case <-heartbeat.C:
			if !send("heartbeat", events.Event{ID: uuid.NewString(), Type: "heartbeat", CreatedAt: time.Now()}) {
				return
			}
		case <-c.Request.Context().Done():
			return
		case <-deadline.C:
			// Umur maksimal tercapai. Kirim event close lalu tutup; client
			// EventSource reconnect otomatis.
			_ = send("reconnect", events.Event{ID: uuid.NewString(), Type: "reconnect", CreatedAt: time.Now()})
			return
		}
	}
}
