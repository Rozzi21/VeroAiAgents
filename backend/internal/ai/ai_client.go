package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// maxAIResponseBytes caps the AI provider response body we will decode (SEC-9).
const maxAIResponseBytes = 1 << 20 // 1 MiB

type Client struct {
	APIKey      string
	BaseURL     string
	Model       string
	Temperature float64
	HTTPClient  *http.Client
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type CompletionRequest struct {
	Messages []Message `json:"messages"`
}

type CompletionResponse struct {
	Text      string                 `json:"text"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	RawStatus int                    `json:"raw_status"`
}

func NewClient(apiKey, baseURL, model string, temperature float64, timeout time.Duration) *Client {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "gpt-4o-mini"
	}
	if timeout <= 0 {
		timeout = 35 * time.Second
	}

	return &Client{
		APIKey:      apiKey,
		BaseURL:     strings.TrimRight(baseURL, "/"),
		Model:       model,
		Temperature: temperature,
		HTTPClient:  &http.Client{Timeout: timeout},
	}
}

func (c *Client) Generate(ctx context.Context, req CompletionRequest) (CompletionResponse, error) {
	if c.APIKey == "" {
		return CompletionResponse{
			Text: "AI API key is empty; using local travel assistant fallback response.",
			Metadata: map[string]interface{}{
				"mode":  "local_fallback",
				"model": c.Model,
			},
			RawStatus: http.StatusOK,
		}, nil
	}

	body, err := json.Marshal(map[string]interface{}{
		"model":       c.Model,
		"messages":    req.Messages,
		"temperature": c.Temperature,
	})
	if err != nil {
		return CompletionResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return CompletionResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	res, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return CompletionResponse{}, err
	}
	defer res.Body.Close()

	// SEC-9: cap how much of the provider response we will read/decode so a
	// runaway or malicious response cannot exhaust memory.
	limited := io.LimitReader(res.Body, maxAIResponseBytes)
	var raw map[string]interface{}
	if err := json.NewDecoder(limited).Decode(&raw); err != nil {
		return CompletionResponse{}, err
	}

	out := CompletionResponse{
		Text:      extractText(raw),
		Metadata:  raw,
		RawStatus: res.StatusCode,
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return out, fmt.Errorf("ai provider returned status %d", res.StatusCode)
	}
	if out.Text == "" {
		out.Text = "AI provider returned an empty text response."
	}
	return out, nil
}

func extractText(raw map[string]interface{}) string {
	if choices, ok := raw["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if message, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := message["content"].(string); ok {
					return content
				}
			}
			if text, ok := choice["text"].(string); ok {
				return text
			}
		}
	}

	for _, key := range []string{"text", "output", "content", "message"} {
		if value, ok := raw[key].(string); ok {
			return value
		}
	}

	return ""
}
