package services

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/rozzi/vero-ai-travel-agents/backend/internal/auth"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/models"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/repositories"
	"github.com/rozzi/vero-ai-travel-agents/backend/internal/telemetry"
)

// AuditWriter is the narrow persistence contract the audit worker pool uses to
// write tool-call + AI-log audit records (PERF-3 #2). *repositories.Repository
// satisfies it implicitly (SEC-27 structural typing).
type AuditWriter interface {
	CreateToolCall(ctx context.Context, call *models.ToolCall) error
	CreateAILog(ctx context.Context, log *models.AILog) error
}

// Compile-time assertion that the concrete repository satisfies AuditWriter.
var _ AuditWriter = (*repositories.Repository)(nil)

// auditJob carries everything needed to persist the audit trail for one MCP
// tool execution. Marshal + DB write happen inside the worker, off the
// synchronous LLM response path.
type auditJob struct {
	sessionID     uuid.UUID
	toolName      string
	status        string
	executionTime int64
	payload       map[string]interface{}
	result        ToolResult
}

type backgroundJob struct {
	ctx context.Context
	run func(context.Context)
}

type memorySummaryState struct {
	dirty     bool
	running   bool
	ctx       context.Context
	refresh   func(context.Context)
	iteration context.CancelFunc
}

const (
	// auditPoolWorkers bounds concurrent DB writers. Low count on purpose: audit
	// is best-effort and must not starve the connection pool used by the main
	// request path (SEC-21 flood note).
	auditPoolWorkers = 2
	// auditPoolBuffer caps in-flight audit jobs. When full, Submit drops (audit
	// never blocks the AI response).
	auditPoolBuffer = 64
	// auditWriteTimeout bounds each DB write so a wedged DB cannot stall a
	// worker forever (SEC-26 detached context).
	auditWriteTimeout = 10 * time.Second
	// auditDrainTimeout bounds graceful shutdown so a wedged DB cannot hang
	// process exit. Leftover jobs are dropped (audit is best-effort).
	auditDrainTimeout = 10 * time.Second
)

// AuditPool is the existing bounded worker pool for best-effort chat background
// jobs: MCP audit persistence plus memory-summary refresh. Bounding worker count
// and channel buffer prevents goroutine/DB-connection floods.
//
// Submit is non-blocking: if the buffer is full the job is dropped and logged,
// so audit pressure never stalls the AI response. Workers use a detached
// context (context.Background + timeout) because audit writes outlive the HTTP
// request that produced them (SEC-26).
type AuditPool struct {
	writer       AuditWriter
	jobs         chan backgroundJob
	wg           sync.WaitGroup
	done         chan struct{}
	startOnce    sync.Once
	stopOnce     sync.Once
	mu           sync.RWMutex
	stopped      bool
	jobTimeout   time.Duration
	drainTimeout time.Duration
	summaryMu    sync.Mutex
	summaries    map[uuid.UUID]*memorySummaryState
}

// NewAuditPool constructs an audit pool. Workers are not started until Start is
// called.
func NewAuditPool(writer AuditWriter) *AuditPool {
	return &AuditPool{
		writer:       writer,
		jobs:         make(chan backgroundJob, auditPoolBuffer),
		done:         make(chan struct{}),
		jobTimeout:   auditWriteTimeout,
		drainTimeout: auditDrainTimeout,
		summaries:    make(map[uuid.UUID]*memorySummaryState),
	}
}

// Start spawns the worker goroutines. Safe to call once.
func (p *AuditPool) Start() {
	p.startOnce.Do(func() {
		for i := 0; i < auditPoolWorkers; i++ {
			p.wg.Add(1)
			go p.worker()
		}
		go func() {
			p.wg.Wait()
			close(p.done)
		}()
	})
}

func (p *AuditPool) worker() {
	defer p.wg.Done()
	for job := range p.jobs {
		baseCtx := job.ctx
		if baseCtx == nil {
			baseCtx = context.Background()
		}
		ctx, cancel := context.WithTimeout(baseCtx, p.jobTimeout)
		job.run(ctx)
		cancel()
	}
}

func (p *AuditPool) persist(ctx context.Context, job auditJob) {
	payloadJSON, _ := json.Marshal(job.payload)
	resultJSON, _ := json.Marshal(job.result)

	toolCall := models.ToolCall{
		SessionID: job.sessionID,
		ToolName:  job.toolName,
		Payload:   string(payloadJSON),
		Result:    string(resultJSON),
		Status:    job.status,
	}
	sessionID := job.sessionID // take address of a local copy, not the loop var
	aiLog := models.AILog{
		SessionID:     &sessionID,
		Workflow:      "mcp_tool_execution",
		ToolName:      job.toolName,
		Status:        job.status,
		ExecutionTime: job.executionTime,
		Response:      string(resultJSON),
	}

	if err := p.writer.CreateToolCall(ctx, &toolCall); err != nil {
		auth.LogSecurity("tool_call_persist_failed", map[string]any{
			"session_id": job.sessionID.String(),
			"tool_name":  job.toolName,
			"error":      err.Error(),
		})
	}
	if err := p.writer.CreateAILog(ctx, &aiLog); err != nil {
		auth.LogSecurity("ai_log_persist_failed", map[string]any{
			"session_id": job.sessionID.String(),
			"workflow":   "mcp_tool_execution",
			"tool_name":  job.toolName,
			"error":      err.Error(),
		})
	}
}

// Submit enqueues an audit job. Non-blocking: returns false (and logs) when the
// buffer is full so the AI response path is never blocked by audit pressure.
func (p *AuditPool) Submit(job auditJob) bool {
	return p.submit(backgroundJob{
		ctx: context.Background(),
		run: func(ctx context.Context) {
			p.persist(ctx, job)
		},
	})
}

func (p *AuditPool) submit(job backgroundJob) bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if p.stopped {
		return false
	}
	select {
	case p.jobs <- job:
		return true
	default:
		log.Printf("[background-pool] buffer full, dropping best-effort job")
		return false
	}
}

// SubmitMemorySummary coalesces refresh requests for one chat session and runs
// them on the existing bounded background workers. At most one refresh for a
// session runs at a time. A submission arriving while that session is queued or
// running marks it dirty, causing one more refresh against the latest message
// tail after the current refresh completes.
func (p *AuditPool) SubmitMemorySummary(ctx context.Context, sessionID uuid.UUID, refresh func(context.Context)) bool {
	p.summaryMu.Lock()
	if state, exists := p.summaries[sessionID]; exists {
		state.dirty = true
		state.ctx = ctx
		state.refresh = refresh
		if state.running && state.iteration != nil {
			state.iteration()
		}
		p.summaryMu.Unlock()
		return true
	}
	state := &memorySummaryState{ctx: ctx, refresh: refresh}
	p.summaries[sessionID] = state

	p.mu.RLock()
	if p.stopped {
		p.mu.RUnlock()
		delete(p.summaries, sessionID)
		p.summaryMu.Unlock()
		return false
	}
	job := backgroundJob{
		ctx: context.Background(),
		run: func(runCtx context.Context) {
			for {
				p.summaryMu.Lock()
				refreshCtx := state.ctx
				refreshFn := state.refresh
				state.running = true
				iterationCtx, cancelIteration := context.WithCancel(runCtx)
				state.iteration = cancelIteration
				p.summaryMu.Unlock()
				iterationCtx = telemetry.AttachTrace(iterationCtx, telemetry.FromContext(refreshCtx), telemetry.RequestID(refreshCtx))
				func() {
					defer func() {
						if recovered := recover(); recovered != nil {
							log.Printf("[background-pool] memory summary job panicked")
						}
					}()
					refreshFn(iterationCtx)
				}()
				cancelIteration()
				p.summaryMu.Lock()
				if state.dirty && runCtx.Err() == nil {
					state.dirty = false
					state.running = false
					state.iteration = nil
					p.summaryMu.Unlock()
					continue
				}
				state.running = false
				state.iteration = nil
				delete(p.summaries, sessionID)
				p.summaryMu.Unlock()
				return
			}
		},
	}
	select {
	case p.jobs <- job:
		p.mu.RUnlock()
		p.summaryMu.Unlock()
		return true
	default:
		p.mu.RUnlock()
		delete(p.summaries, sessionID)
		p.summaryMu.Unlock()
		log.Printf("[background-pool] buffer full, dropping best-effort job")
		return false
	}
}

// Stop drains the pool: closes the jobs channel and waits for in-flight workers
// to finish, bounded by auditDrainTimeout. Safe to call multiple times. Call
// during graceful shutdown so in-flight audit records are persisted before the
// process exits.
func (p *AuditPool) Stop() {
	p.stopOnce.Do(func() {
		p.mu.Lock()
		p.stopped = true
		close(p.jobs)
		p.mu.Unlock()
	})
	timer := time.NewTimer(p.drainTimeout)
	defer timer.Stop()
	select {
	case <-p.done:
	case <-timer.C:
		log.Printf("[background-pool] drain timeout reached, %d job(s) may be unfinished", len(p.jobs))
	}
}
