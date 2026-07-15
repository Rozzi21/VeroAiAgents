package ai

import (
	"encoding/json"
	"testing"
)

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
