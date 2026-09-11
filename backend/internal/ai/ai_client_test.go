package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

func TestGenerateStreamEventsForwardsProviderDeltasBeforeCompletion(t *testing.T) {
	release := make(chan struct{})
	firstWritten := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher := w.(http.Flusher)
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Halo \"}}]}\n\n")
		flusher.Flush()
		close(firstWritten)
		<-release
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"dunia\"},\"finish_reason\":\"stop\"}]}\n\n")
		flusher.Flush()
	}))
	defer server.Close()

	client := NewClient("key", server.URL, "model", 0, time.Second)
	deltas := make(chan string, 2)
	completed := make(chan CompletionResponse, 1)
	go func() {
		response, err := client.GenerateStreamEvents(context.Background(), CompletionRequest{}, func(event StreamEvent) {
			if event.Type == StreamEventTextDelta {
				deltas <- event.Text
			}
		})
		if err != nil {
			t.Errorf("GenerateStreamEvents: %v", err)
		}
		completed <- response
	}()
	<-firstWritten
	select {
	case got := <-deltas:
		if got != "Halo " {
			t.Fatalf("first delta = %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("first provider delta was buffered until completion")
	}
	select {
	case <-completed:
		t.Fatal("provider completed before test released final event")
	default:
	}
	close(release)
	response := <-completed
	second := <-deltas
	if second != "dunia" || response.Text != "Halo dunia" {
		t.Fatalf("second=%q response=%q", second, response.Text)
	}
}

func TestGenerateStreamEventsClassifiesToolBeforeMixedContent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hidden\",\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"function\":{\"name\":\"search_trips\",\"arguments\":\"{}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
	}))
	defer server.Close()
	client := NewClient("key", server.URL, "model", 0, time.Second)
	var types []StreamEventType
	response, err := client.GenerateStreamEvents(context.Background(), CompletionRequest{}, func(event StreamEvent) {
		types = append(types, event.Type)
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(types, []StreamEventType{StreamEventToolCall, StreamEventTextDelta}) || len(response.ToolCalls) != 1 {
		t.Fatalf("types=%v tool calls=%+v", types, response.ToolCalls)
	}
}

func TestGenerateStreamEventsPartialFailureAndCancellation(t *testing.T) {
	t.Run("partial EOF is error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n")
		}))
		defer server.Close()
		client := NewClient("key", server.URL, "model", 0, time.Second)
		var deltas []string
		response, err := client.GenerateStreamEvents(context.Background(), CompletionRequest{}, func(event StreamEvent) {
			if event.Type == StreamEventTextDelta {
				deltas = append(deltas, event.Text)
			}
		})
		if !errors.Is(err, io.ErrUnexpectedEOF) || response.Text != "partial" || !reflect.DeepEqual(deltas, []string{"partial"}) {
			t.Fatalf("response=%+v deltas=%v err=%v", response, deltas, err)
		}
	})

	t.Run("context cancellation stops provider read", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			<-r.Context().Done()
		}))
		defer server.Close()
		client := NewClient("key", server.URL, "model", 0, time.Second)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := client.GenerateStreamEvents(ctx, CompletionRequest{}, nil)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("err=%v", err)
		}
	})
}

func TestExtractUsageProviderValues(t *testing.T) {
	raw := map[string]interface{}{"usage": map[string]interface{}{
		"prompt_tokens": float64(120), "completion_tokens": float64(30),
		"prompt_tokens_details": map[string]interface{}{"cached_tokens": float64(64)},
	}}
	usage := extractUsage(raw)
	if usage.InputTokens == nil || *usage.InputTokens != 120 {
		t.Fatalf("input = %v", usage.InputTokens)
	}
	if usage.OutputTokens == nil || *usage.OutputTokens != 30 {
		t.Fatalf("output = %v", usage.OutputTokens)
	}
	if usage.CachedInputTokens == nil || *usage.CachedInputTokens != 64 {
		t.Fatalf("cached = %v", usage.CachedInputTokens)
	}
}

func TestExtractUsageUnavailableRemainsNil(t *testing.T) {
	usage := extractUsage(map[string]interface{}{})
	if usage.InputTokens != nil || usage.OutputTokens != nil || usage.CachedInputTokens != nil {
		t.Fatalf("usage should be unavailable: %+v", usage)
	}
}

func TestExtractText_NormalContent(t *testing.T) {
	raw := map[string]interface{}{
		"choices": []interface{}{
			map[string]interface{}{
				"message": map[string]interface{}{
					"role":    "assistant",
					"content": "Hello from standard chat model.",
				},
				"finish_reason": "stop",
			},
		},
	}

	got := extractText(raw)
	want := "Hello from standard chat model."
	if got != want {
		t.Errorf("extractText() = %q, want %q", got, want)
	}
}

func TestExtractText_ReasoningContentFallback(t *testing.T) {
	raw := map[string]interface{}{
		"choices": []interface{}{
			map[string]interface{}{
				"message": map[string]interface{}{
					"role":              "assistant",
					"content":           "",
					"reasoning_content": "Hello from reasoning model.",
				},
				"finish_reason": "stop",
			},
		},
	}

	got := extractText(raw)
	want := "Hello from reasoning model."
	if got != want {
		t.Errorf("extractText() = %q, want %q", got, want)
	}
}

func TestExtractText_ReasoningFieldFallback(t *testing.T) {
	raw := map[string]interface{}{
		"choices": []interface{}{
			map[string]interface{}{
				"message": map[string]interface{}{
					"role":      "assistant",
					"content":   "  ",
					"reasoning": "Hello from reasoning field.",
				},
				"finish_reason": "stop",
			},
		},
	}

	got := extractText(raw)
	want := "Hello from reasoning field."
	if got != want {
		t.Errorf("extractText() = %q, want %q", got, want)
	}
}

func TestExtractText_ThinkingFieldFallback(t *testing.T) {
	raw := map[string]interface{}{
		"choices": []interface{}{
			map[string]interface{}{
				"message": map[string]interface{}{
					"role":     "assistant",
					"content":  nil,
					"thinking": "Hello from thinking field.",
				},
				"finish_reason": "stop",
			},
		},
	}

	got := extractText(raw)
	want := "Hello from thinking field."
	if got != want {
		t.Errorf("extractText() = %q, want %q", got, want)
	}
}

func TestExtractText_PrefersContentOverReasoning(t *testing.T) {
	raw := map[string]interface{}{
		"choices": []interface{}{
			map[string]interface{}{
				"message": map[string]interface{}{
					"role":              "assistant",
					"content":           "Final answer.",
					"reasoning_content": "Reasoning chain.",
					"reasoning":         "Other reasoning.",
					"thinking":          "Other thinking.",
				},
				"finish_reason": "stop",
			},
		},
	}

	got := extractText(raw)
	want := "Final answer."
	if got != want {
		t.Errorf("extractText() = %q, want %q", got, want)
	}
}

func TestExtractText_EmptyChoices(t *testing.T) {
	raw := map[string]interface{}{
		"choices": []interface{}{},
	}

	got := extractText(raw)
	if got != "" {
		t.Errorf("extractText() = %q, want empty string", got)
	}
}

func TestExtractText_TopLevelFallback(t *testing.T) {
	raw := map[string]interface{}{
		"text":   "",
		"output": "Top-level output.",
	}

	got := extractText(raw)
	want := "Top-level output."
	if got != want {
		t.Errorf("extractText() = %q, want %q", got, want)
	}
}

func TestExtractText_JSONDecodeRoundTrip(t *testing.T) {
	payload := `{
		"choices": [
			{
				"message": {
					"role": "assistant",
					"content": "",
					"reasoning_content": "Round-tripped reasoning."
				},
				"finish_reason": "stop"
			}
		]
	}`

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(payload), &raw); err != nil {
		t.Fatalf("failed to unmarshal payload: %v", err)
	}

	got := extractText(raw)
	want := "Round-tripped reasoning."
	if got != want {
		t.Errorf("extractText() = %q, want %q", got, want)
	}
}
