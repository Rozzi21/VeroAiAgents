package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/rozzi/vero-ai-travel-agents/backend/internal/telemetry"
)

// maxAIResponseBytes caps the AI provider response body we will decode.
const maxAIResponseBytes = 1 << 20 // 1 MiB

// MaxToolCallRounds limits how many tool-call round-trips we allow before
// forcing a final text response. This prevents infinite loops if the LLM keeps
// requesting tool calls.
const MaxToolCallRounds = 5

type Client struct {
	APIKey      string
	BaseURL     string
	Model       string
	Temperature float64
	HTTPClient  *http.Client
}

type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// ToolCall represents an OpenAI-compatible function call from the LLM.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall holds the function name and JSON-encoded arguments.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// ToolDef is the OpenAI-compatible tool definition sent in the request.
type ToolDef struct {
	Type     string       `json:"type"`
	Function FunctionSpec `json:"function"`
}

// FunctionSpec describes a function available to the LLM.
type FunctionSpec struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

// ResponseFormat optionally requests structured output (OpenAI-compatible
// `response_format`). Callers pass a provider-specific schema object; it is
// emitted verbatim in the JSON body. Nil means default free-form text.
type ResponseFormat struct {
	Type       string                 `json:"type"`
	JsonSchema map[string]interface{} `json:"json_schema,omitempty"`
}

type CompletionRequest struct {
	Messages []Message `json:"messages"`
	Tools    []ToolDef `json:"tools,omitempty"`

	// ResponseFormat requests structured output (e.g. JSON schema) on the final
	// assistant message instead of free-form text. Used by SEC-29 for the
	// order-claim check so we do not parse natural language.
	ResponseFormat *ResponseFormat `json:"response_format,omitempty"`
}

type CompletionResponse struct {
	Text      string                 `json:"text"`
	ToolCalls []ToolCall             `json:"tool_calls,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	RawStatus int                    `json:"raw_status"`
	Usage     Usage                  `json:"-"`
	TTFB      *time.Duration         `json:"-"`
}

type StreamEventType string

const (
	StreamEventTextDelta StreamEventType = "text_delta"
	StreamEventToolCall  StreamEventType = "tool_call"
)

// StreamEvent exposes provider stream classification to orchestration without
// exposing partial tool arguments outside package ai. Text contains only
// provider-generated assistant content; tool-call events are signals only.
type StreamEvent struct {
	Type StreamEventType
	Text string
	// ProviderGenerated is false for intentional local fallback output. This
	// keeps first_delta telemetry tied to real provider text.
	ProviderGenerated bool
}

// Usage contains provider-reported values only. Nil means unavailable; no
// tokenizer estimate is substituted.
type Usage struct {
	InputTokens       *int64
	OutputTokens      *int64
	CachedInputTokens *int64
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
	finishTelemetry := telemetry.StartLLM(ctx)
	status := "failure"
	var result CompletionResponse
	defer func() {
		finishTelemetry(status, result.TTFB, result.Usage.InputTokens, result.Usage.OutputTokens, result.Usage.CachedInputTokens)
	}()
	if c.APIKey == "" {
		result = CompletionResponse{
			Text: "AI API key is empty; using local travel assistant fallback response.",
			Metadata: map[string]interface{}{
				"mode":  "local_fallback",
				"model": c.Model,
			},
			RawStatus: http.StatusOK,
		}
		status = "success"
		return result, nil
	}

	payload := map[string]interface{}{
		"model":       c.Model,
		"messages":    req.Messages,
		"temperature": c.Temperature,
	}
	if len(req.Tools) > 0 {
		payload["tools"] = req.Tools
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return CompletionResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return CompletionResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	requestStarted := time.Now()
	res, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return CompletionResponse{}, err
	}
	defer res.Body.Close()
	ttfb := time.Since(requestStarted)

	// SEC-9: cap how much of the provider response we will read/decode so a
	// runaway or malicious response cannot exhaust memory.
	limited := io.LimitReader(res.Body, maxAIResponseBytes)
	var raw map[string]interface{}
	if err := json.NewDecoder(limited).Decode(&raw); err != nil {
		return CompletionResponse{}, err
	}

	out := CompletionResponse{
		Text:      extractText(raw),
		ToolCalls: extractToolCalls(raw),
		Metadata:  raw,
		RawStatus: res.StatusCode,
		Usage:     extractUsage(raw),
		TTFB:      &ttfb,
	}
	result = out
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return out, fmt.Errorf("ai provider returned status %d", res.StatusCode)
	}
	if len(out.ToolCalls) == 0 && out.Text == "" {
		out.Text = "AI provider returned an empty text response."
	}
	status = "success"
	return out, nil
}

func extractUsage(raw map[string]interface{}) Usage {
	usageMap, _ := raw["usage"].(map[string]interface{})
	if usageMap == nil {
		return Usage{}
	}
	usage := Usage{
		InputTokens:  integerPointer(usageMap["prompt_tokens"]),
		OutputTokens: integerPointer(usageMap["completion_tokens"]),
	}
	if usage.InputTokens == nil {
		usage.InputTokens = integerPointer(usageMap["input_tokens"])
	}
	if usage.OutputTokens == nil {
		usage.OutputTokens = integerPointer(usageMap["output_tokens"])
	}
	if details, ok := usageMap["prompt_tokens_details"].(map[string]interface{}); ok {
		usage.CachedInputTokens = integerPointer(details["cached_tokens"])
	}
	if usage.CachedInputTokens == nil {
		usage.CachedInputTokens = integerPointer(usageMap["cached_tokens"])
	}
	return usage
}

func integerPointer(value interface{}) *int64 {
	switch number := value.(type) {
	case float64:
		result := int64(number)
		return &result
	case json.Number:
		if result, err := number.Int64(); err == nil {
			return &result
		}
	}
	return nil
}

// extractToolCalls parses tool_calls from an OpenAI-compatible response.
func extractToolCalls(raw map[string]interface{}) []ToolCall {
	choices, ok := raw["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		return nil
	}
	choice, ok := choices[0].(map[string]interface{})
	if !ok {
		return nil
	}
	message, ok := choice["message"].(map[string]interface{})
	if !ok {
		return nil
	}
	toolCallsRaw, ok := message["tool_calls"].([]interface{})
	if !ok || len(toolCallsRaw) == 0 {
		return nil
	}

	var calls []ToolCall
	for _, tcRaw := range toolCallsRaw {
		tcMap, ok := tcRaw.(map[string]interface{})
		if !ok {
			continue
		}
		tc := ToolCall{
			ID:   getStr(tcMap, "id"),
			Type: getStr(tcMap, "type"),
		}
		if fnMap, ok := tcMap["function"].(map[string]interface{}); ok {
			tc.Function = FunctionCall{
				Name:      getStr(fnMap, "name"),
				Arguments: getStr(fnMap, "arguments"),
			}
		}
		if tc.Function.Name != "" {
			calls = append(calls, tc)
			log.Printf("[ai] tool_call: id=%s function=%s", tc.ID, tc.Function.Name)
		}
	}
	return calls
}

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// extractText extracts the final assistant text from an OpenAI-compatible
// response payload. It prefers the standard content field, then falls back to
// reasoning fields used by models such as Qwen or DeepSeek, then scans for any
// non-empty string field. This keeps the client provider-agnostic.
func extractText(raw map[string]interface{}) string {
	if choices, ok := raw["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if message, ok := choice["message"].(map[string]interface{}); ok {
				if text, field := extractString(message, "content"); text != "" {
					log.Printf("[ai] extracted text from choices[0].message.%s", field)
					return text
				}
				for _, key := range []string{"reasoning_content", "reasoning", "thinking"} {
					if text, field := extractString(message, key); text != "" {
						log.Printf("[ai] extracted text from choices[0].message.%s (content empty)", field)
						return text
					}
				}
				log.Printf("[ai] choices[0].message has no usable text field")
				return ""
			}
			if text, field := extractString(choice, "text"); text != "" {
				log.Printf("[ai] extracted text from choices[0].%s", field)
				return text
			}
		}
	}

	for _, key := range []string{"text", "output", "content", "message"} {
		if value, ok := raw[key].(string); ok && value != "" {
			log.Printf("[ai] extracted text from top-level %s", key)
			return value
		}
	}

	log.Printf("[ai] no usable text field found in response")
	return ""
}

// extractString returns a non-empty trimmed string from m[key] and the key
// name that matched. It returns ("", "") if the value is missing, not a
// string, or empty after trimming.
func extractString(m map[string]interface{}, key string) (string, string) {
	if v, ok := m[key].(string); ok {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v), key
		}
	}
	return "", ""
}

func (c *Client) GenerateStream(ctx context.Context, req CompletionRequest, onDelta func(text string)) (CompletionResponse, error) {
	return c.GenerateStreamEvents(ctx, req, func(event StreamEvent) {
		if event.Type == StreamEventTextDelta && onDelta != nil {
			onDelta(event.Text)
		}
	})
}

// GenerateStreamEvents consumes OpenAI-compatible SSE events inline. It emits
// each real text delta before reading the next provider event and emits only a
// classification signal for tool-call fragments; incomplete tool arguments
// never leave package ai.
func (c *Client) GenerateStreamEvents(ctx context.Context, req CompletionRequest, onEvent func(StreamEvent)) (CompletionResponse, error) {
	finishTelemetry := telemetry.StartLLM(ctx)
	status := "failure"
	var result CompletionResponse
	defer func() {
		finishTelemetry(status, result.TTFB, result.Usage.InputTokens, result.Usage.OutputTokens, result.Usage.CachedInputTokens)
	}()
	if c.APIKey == "" {
		fallback := "AI API key is empty; using local travel assistant fallback response."
		if onEvent != nil {
			onEvent(StreamEvent{Type: StreamEventTextDelta, Text: fallback})
		}
		result = CompletionResponse{
			Text: fallback,
			Metadata: map[string]interface{}{
				"mode":  "local_fallback",
				"model": c.Model,
			},
			RawStatus: http.StatusOK,
		}
		status = "success"
		return result, nil
	}

	payload := map[string]interface{}{
		"model":       c.Model,
		"messages":    req.Messages,
		"temperature": c.Temperature,
		"stream":      true,
	}
	if len(req.Tools) > 0 {
		payload["tools"] = req.Tools
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return CompletionResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return CompletionResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")

	requestStarted := time.Now()
	res, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return CompletionResponse{}, err
	}
	defer res.Body.Close()
	var ttfb *time.Duration

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		// Non-2xx stream responses usually carry a JSON error body, not SSE.
		limited := io.LimitReader(res.Body, maxAIResponseBytes)
		var raw map[string]interface{}
		_ = json.NewDecoder(limited).Decode(&raw)
		return CompletionResponse{Metadata: raw, RawStatus: res.StatusCode}, fmt.Errorf("ai provider returned status %d", res.StatusCode)
	}

	var (
		fullText      strings.Builder
		reasoningText strings.Builder       // reasoning_content, NOT streamed to user
		toolCalls     = map[int]*ToolCall{} // accumulate deltas keyed by tool index
		metadata      = map[string]interface{}{}
		usage         Usage
		finish        string
		providerDone  bool
	)

	// Use a bufio.Reader instead of bufio.Scanner for byte-level streaming.
	// bufio.Scanner waits for a newline and may batch multiple SSE lines if
	// the provider flushes them in the same TCP packet. A Reader lets us
	// parse events as soon as a blank line delimiter is available, without
	// waiting for line boundaries that may arrive together.
	reader := bufio.NewReaderSize(res.Body, 64*1024)
	for {
		if ctx.Err() != nil {
			return CompletionResponse{}, ctx.Err()
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			// A context-cancelled read returns a wrapped error; surface it
			// only if it is not the expected cancellation path.
			if ctx.Err() != nil {
				return CompletionResponse{}, ctx.Err()
			}
			return CompletionResponse{}, err
		}

		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			// End of one SSE event. Continue to read the next event.
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			providerDone = true
			break
		}

		var chunk map[string]interface{}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// Skip malformed chunks rather than aborting the whole stream.
			log.Printf("[ai] stream: skipping unparseable chunk: %v", err)
			continue
		}
		if ttfb == nil {
			value := time.Since(requestStarted)
			ttfb = &value
		}
		if rawError, exists := chunk["error"]; exists {
			return CompletionResponse{
				Text: fullText.String(), Metadata: map[string]interface{}{"error": rawError},
				RawStatus: res.StatusCode, Usage: usage, TTFB: ttfb,
			}, errors.New("ai provider stream returned an error event")
		}
		if chunkUsage := extractUsage(chunk); chunkUsage.InputTokens != nil || chunkUsage.OutputTokens != nil || chunkUsage.CachedInputTokens != nil {
			usage = chunkUsage
		}

		choices, ok := chunk["choices"].([]interface{})
		if !ok || len(choices) == 0 {
			continue
		}
		choice, ok := choices[0].(map[string]interface{})
		if !ok {
			continue
		}

		if delta, ok := choice["delta"].(map[string]interface{}); ok {
			// Classify tool-call chunks before content. Providers may include a
			// prose preamble and tool_calls in the same delta; orchestration must
			// see tool classification first so that preamble is not user text.
			if tcsRaw, ok := delta["tool_calls"].([]interface{}); ok {
				if len(tcsRaw) > 0 && onEvent != nil {
					onEvent(StreamEvent{Type: StreamEventToolCall, ProviderGenerated: true})
				}
				accumulateToolCallDeltas(toolCalls, tcsRaw)
			}
			if content, _ := delta["content"].(string); content != "" {
				fullText.WriteString(content)
				if onEvent != nil {
					onEvent(StreamEvent{Type: StreamEventTextDelta, Text: content, ProviderGenerated: true})
				}
			}
			if rc, _ := delta["reasoning_content"].(string); rc != "" {
				reasoningText.WriteString(rc)
			}
		}

		if fr, _ := choice["finish_reason"].(string); fr != "" {
			finish = fr
			providerDone = true
		}

		// Keep the last chunk's id/model for metadata parity with Generate.
		if id, _ := chunk["id"].(string); id != "" {
			metadata["id"] = id
		}
		if m, _ := chunk["model"].(string); m != "" {
			metadata["model"] = m
		}
	}
	if !providerDone {
		return CompletionResponse{
			Text: fullText.String(), ToolCalls: finalizeToolCalls(toolCalls), Metadata: metadata,
			RawStatus: res.StatusCode, Usage: usage, TTFB: ttfb,
		}, io.ErrUnexpectedEOF
	}
	metadata["finish_reason"] = finish
	metadata["mode"] = "stream"

	out := CompletionResponse{
		Text:      fullText.String(),
		ToolCalls: finalizeToolCalls(toolCalls),
		Metadata:  metadata,
		RawStatus: res.StatusCode,
		Usage:     usage,
		TTFB:      ttfb,
	}
	result = out
	if len(out.ToolCalls) == 0 && out.Text == "" {

		if reasoningText.Len() > 0 {
			out.Text = reasoningText.String()
		} else {
			out.Text = "AI provider returned an empty text response."
		}
	}
	status = "success"
	return out, nil
}
func accumulateToolCallDeltas(toolCalls map[int]*ToolCall, deltas []interface{}) {
	for _, d := range deltas {
		dMap, ok := d.(map[string]interface{})
		if !ok {
			continue
		}
		idxF, _ := dMap["index"].(float64)
		idx := int(idxF)

		tc, ok := toolCalls[idx]
		if !ok {
			tc = &ToolCall{Type: "function"}
			toolCalls[idx] = tc
		}
		if id, _ := dMap["id"].(string); id != "" {
			tc.ID = id
		}
		if t, _ := dMap["type"].(string); t != "" {
			tc.Type = t
		}
		if fnMap, ok := dMap["function"].(map[string]interface{}); ok {
			if name, _ := fnMap["name"].(string); name != "" {
				tc.Function.Name = name
			}
			if args, _ := fnMap["arguments"].(string); args != "" {
				tc.Function.Arguments += args
			}
		}
	}
}

// finalizeToolCalls returns the accumulated tool calls ordered by their stream
// index so callers see them in the order the model emitted them.
func finalizeToolCalls(toolCalls map[int]*ToolCall) []ToolCall {
	if len(toolCalls) == 0 {
		return nil
	}
	indices := make([]int, 0, len(toolCalls))
	for i := range toolCalls {
		indices = append(indices, i)
	}
	sort.Ints(indices)
	out := make([]ToolCall, 0, len(indices))
	for _, i := range indices {
		tc := toolCalls[i]
		if tc.Function.Name != "" {
			out = append(out, *tc)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
