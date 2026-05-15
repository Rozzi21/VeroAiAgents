package events

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type Event struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	CreatedAt time.Time   `json:"created_at"`
}

type Bus struct {
	mu      sync.RWMutex
	clients map[chan Event]struct{}
}

func NewBus() *Bus {
	return &Bus{clients: make(map[chan Event]struct{})}
}

func (b *Bus) Subscribe() chan Event {
	ch := make(chan Event, 32)
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *Bus) Unsubscribe(ch chan Event) {
	b.mu.Lock()
	delete(b.clients, ch)
	close(ch)
	b.mu.Unlock()
}

func (b *Bus) Publish(eventType string, payload interface{}) {
	event := Event{
		ID:        uuid.NewString(),
		Type:      eventType,
		Payload:   payload,
		CreatedAt: time.Now(),
	}

	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- event:
		default:
		}
	}
}
