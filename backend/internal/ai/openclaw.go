package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type OpenClawClient struct {
	APIKey     string
	BaseURL    string
	HTTPClient *http.Client
}

type CompletionRequest struct {
	Prompt  string                 `json:"prompt"`
	Context map[string]interface{} `json:"context,omitempty"`
}

type CompletionResponse struct {
	Text      string                 `json:"text"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	RawStatus int                    `json:"raw_status"`
}

func NewOpenClawClient(apiKey, baseURL string) *OpenClawClient {
	if baseURL == "" {
		baseURL = "https://api.openclaw.ai/v1/responses"
	}

	return &OpenClawClient{
		APIKey:  apiKey,
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *OpenClawClient) Generate(ctx context.Context, req CompletionRequest) (CompletionResponse, error) {
	if c.APIKey == "" {
		return CompletionResponse{
			Text: "OpenClaw API key is empty; using local autonomous workflow response.",
			Metadata: map[string]interface{}{
				"mode": "local_fallback",
			},
			RawStatus: http.StatusOK,
		}, nil
	}

	body, err := json.Marshal(req)
	if err != nil {
		return CompletionResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL, bytes.NewReader(body))
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

	var raw map[string]interface{}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return CompletionResponse{}, err
	}

	out := CompletionResponse{
		Text:      extractText(raw),
		Metadata:  raw,
		RawStatus: res.StatusCode,
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return out, fmt.Errorf("openclaw returned status %d", res.StatusCode)
	}
	if out.Text == "" {
		out.Text = "OpenClaw returned an empty text response."
	}
	return out, nil
}

func extractText(raw map[string]interface{}) string {
	for _, key := range []string{"text", "output", "content", "message"} {
		if value, ok := raw[key].(string); ok {
			return value
		}
	}

	if choices, ok := raw["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if text, ok := choice["text"].(string); ok {
				return text
			}
			if message, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := message["content"].(string); ok {
					return content
				}
			}
		}
	}

	return ""
}
