package telemetry

import (
	"context"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

type contextKey string

const (
	requestIDKey contextKey = "chat_telemetry_request_id"
	traceKey     contextKey = "chat_telemetry_trace"
	llmCallKey   contextKey = "chat_telemetry_llm_call"
)

type Event struct {
	Name              string
	RequestID         string
	Status            string
	Duration          time.Duration
	SinceRequest      time.Duration
	Round             int
	Mode              string
	ToolName          string
	TTFB              *time.Duration
	InputTokens       *int64
	OutputTokens      *int64
	CachedInputTokens *int64
}

type Sink interface {
	Record(context.Context, Event)
}

type sinkFunc func(context.Context, Event)

func (f sinkFunc) Record(ctx context.Context, event Event) { f(ctx, event) }

var (
	chatRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "chat_requests_total", Help: "Completed chat requests by outcome",
	}, []string{"status"})
	chatRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "chat_request_duration_seconds", Help: "End-to-end chat request duration", Buckets: prometheus.DefBuckets,
	}, []string{"status"})
	chatStageDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "chat_stage_duration_seconds", Help: "Chat pipeline stage duration", Buckets: prometheus.DefBuckets,
	}, []string{"stage", "status"})
	chatLLMRoundDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "chat_llm_round_duration_seconds", Help: "LLM provider call duration per round", Buckets: prometheus.DefBuckets,
	}, []string{"round", "mode", "status"})
	chatLLMTTFB = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "chat_llm_ttfb_seconds", Help: "LLM time to first provider byte/event when available", Buckets: prometheus.DefBuckets,
	}, []string{"round", "mode"})
	chatLLMTokens = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "chat_llm_tokens", Help: "Provider-reported token usage per LLM call", Buckets: []float64{32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768},
	}, []string{"type"})
	chatToolDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "chat_tool_duration_seconds", Help: "Tool execution duration", Buckets: prometheus.DefBuckets,
	}, []string{"tool", "status"})
	chatMilestone = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name: "chat_milestone_seconds", Help: "Elapsed time from request start to chat transport milestone", Buckets: prometheus.DefBuckets,
	}, []string{"milestone"})
	defaultSink Sink = sinkFunc(recordDefault)
)

func init() {
	prometheus.MustRegister(chatRequestsTotal, chatRequestDuration, chatStageDuration, chatLLMRoundDuration, chatLLMTTFB, chatLLMTokens, chatToolDuration, chatMilestone)
}

func recordDefault(ctx context.Context, event Event) {
	switch event.Name {
	case "request_total":
		chatRequestsTotal.WithLabelValues(event.Status).Inc()
		chatRequestDuration.WithLabelValues(event.Status).Observe(event.Duration.Seconds())
	case "llm_round":
		round := strconv.Itoa(event.Round)
		chatLLMRoundDuration.WithLabelValues(round, event.Mode, event.Status).Observe(event.Duration.Seconds())
		if event.TTFB != nil {
			chatLLMTTFB.WithLabelValues(round, event.Mode).Observe(event.TTFB.Seconds())
		}
		observeTokens("input", event.InputTokens)
		observeTokens("output", event.OutputTokens)
		observeTokens("cached_input", event.CachedInputTokens)
	case "tool":
		chatToolDuration.WithLabelValues(event.ToolName, event.Status).Observe(event.Duration.Seconds())
	case "first_sse_write", "first_delta", "done":
		chatMilestone.WithLabelValues(event.Name).Observe(event.SinceRequest.Seconds())
	default:
		chatStageDuration.WithLabelValues(event.Name, event.Status).Observe(event.Duration.Seconds())
	}

	slog.InfoContext(ctx, "chat_telemetry",
		"event", event.Name,
		"request_id", event.RequestID,
		"status", event.Status,
		"duration_ms", milliseconds(event.Duration),
		"since_request_ms", milliseconds(event.SinceRequest),
		"round", nullableRound(event.Round),
		"mode", nullableString(event.Mode),
		"tool", nullableString(event.ToolName),
		"ttfb_ms", nullableDuration(event.TTFB),
		"input_tokens", nullableInt64(event.InputTokens),
		"output_tokens", nullableInt64(event.OutputTokens),
		"cached_input_tokens", nullableInt64(event.CachedInputTokens),
	)
}

func observeTokens(kind string, value *int64) {
	if value != nil {
		chatLLMTokens.WithLabelValues(kind).Observe(float64(*value))
	}
}

func milliseconds(value time.Duration) float64 { return float64(value.Microseconds()) / 1000 }
func nullableDuration(value *time.Duration) any {
	if value == nil {
		return nil
	}
	return milliseconds(*value)
}
func nullableRound(round int) any {
	if round == 0 {
		return nil
	}
	return round
}
func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func nullableInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, requestIDKey, requestID)
}

func RequestID(ctx context.Context) string {
	requestID, _ := ctx.Value(requestIDKey).(string)
	if requestID == "" {
		requestID, _ = ctx.Value("request_id").(string) // compatibility with existing middleware context
	}
	return requestID
}

// Detach preserves only bounded chat telemetry state needed by post-response
// work. It deliberately does not retain request cancellation, deadlines, auth,
// session, prompt, or other request-scoped values.
func Detach(ctx context.Context) context.Context {
	detached := WithRequestID(context.Background(), RequestID(ctx))
	if trace := FromContext(ctx); trace != nil {
		detached = context.WithValue(detached, traceKey, trace)
	}
	return detached
}

// AttachTrace gives bounded worker context correlation for one coalesced job
// without reintroducing request cancellation or arbitrary request values.
func AttachTrace(ctx context.Context, trace *Trace, requestID string) context.Context {
	ctx = WithRequestID(ctx, requestID)
	if trace != nil {
		ctx = context.WithValue(ctx, traceKey, trace)
	}
	return ctx
}

type Trace struct {
	ctx        context.Context
	start      time.Time
	sink       Sink
	mu         sync.Mutex
	milestones map[string]struct{}
	success    bool
}

func StartChat(ctx context.Context) (context.Context, *Trace) {
	return NewTrace(ctx, defaultSink)
}

// NewTrace accepts an explicit sink for tests and alternate exporters.
func NewTrace(ctx context.Context, sink Sink) (context.Context, *Trace) {
	telemetryCtx := WithRequestID(context.Background(), RequestID(ctx))
	trace := &Trace{ctx: telemetryCtx, start: time.Now(), sink: sink, milestones: make(map[string]struct{})}
	ctx = context.WithValue(ctx, traceKey, trace)
	return ctx, trace
}

func FromContext(ctx context.Context) *Trace {
	trace, _ := ctx.Value(traceKey).(*Trace)
	return trace
}

func (t *Trace) emit(event Event) {
	if t == nil || t.sink == nil {
		return
	}
	event.RequestID = RequestID(t.ctx)
	defer func() { _ = recover() }() // instrumentation must never alter chat behavior
	t.sink.Record(t.ctx, event)
}

func StartStage(ctx context.Context, name string) func(string) {
	trace := FromContext(ctx)
	started := time.Now()
	var once sync.Once
	return func(status string) {
		once.Do(func() {
			if trace != nil {
				trace.emit(Event{Name: name, Status: status, Duration: time.Since(started), SinceRequest: time.Since(trace.start)})
			}
		})
	}
}

func RecordStageSinceRequest(ctx context.Context, name, status string) {
	if trace := FromContext(ctx); trace != nil {
		trace.emit(Event{Name: name, Status: status, Duration: time.Since(trace.start), SinceRequest: time.Since(trace.start)})
	}
}

func RecordDuration(ctx context.Context, name, status string, duration time.Duration) {
	if trace := FromContext(ctx); trace != nil {
		trace.emit(Event{Name: name, Status: status, Duration: duration, SinceRequest: time.Since(trace.start)})
	}
}

func (t *Trace) Milestone(name string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	if _, exists := t.milestones[name]; exists {
		t.mu.Unlock()
		return
	}
	t.milestones[name] = struct{}{}
	if name == "done" {
		t.success = true
	}
	t.mu.Unlock()
	t.emit(Event{Name: name, Status: "success", SinceRequest: time.Since(t.start)})
}

func Milestone(ctx context.Context, name string) {
	if trace := FromContext(ctx); trace != nil {
		trace.Milestone(name)
	}
}

func (t *Trace) Complete(success bool) {
	if t == nil {
		return
	}
	t.mu.Lock()
	if success {
		t.success = true
	}
	t.mu.Unlock()
}

func (t *Trace) EndRequest() {
	if t == nil {
		return
	}
	t.mu.Lock()
	status := "failure"
	if t.success {
		status = "success"
	}
	t.mu.Unlock()
	t.emit(Event{Name: "request_total", Status: status, Duration: time.Since(t.start), SinceRequest: time.Since(t.start)})
}

type llmCall struct {
	round int
	mode  string
}

func WithLLMCall(ctx context.Context, round int, mode string) context.Context {
	return context.WithValue(ctx, llmCallKey, llmCall{round: round, mode: mode})
}

func StartLLM(ctx context.Context) func(string, *time.Duration, *int64, *int64, *int64) {
	trace := FromContext(ctx)
	call, _ := ctx.Value(llmCallKey).(llmCall)
	started := time.Now()
	return func(status string, ttfb *time.Duration, input, output, cached *int64) {
		if trace != nil {
			trace.emit(Event{Name: "llm_round", Status: status, Duration: time.Since(started), SinceRequest: time.Since(trace.start), Round: call.round, Mode: call.mode, TTFB: ttfb, InputTokens: input, OutputTokens: output, CachedInputTokens: cached})
		}
	}
}

func RecordTool(ctx context.Context, name, status string, duration time.Duration) {
	if trace := FromContext(ctx); trace != nil {
		trace.emit(Event{Name: "tool", ToolName: name, Status: status, Duration: duration, SinceRequest: time.Since(trace.start)})
	}
}
