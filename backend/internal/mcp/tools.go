package mcp

import "github.com/rozzi/vero-ai-travel-agents/backend/internal/ai"

const (
	ToolSearchDestination = "search_destination"
	ToolSearchHotels      = "search_hotels"
	ToolCalculateBudget   = "calculate_budget"
	ToolGenerateItinerary = "generate_itinerary"
	ToolCreatePayment     = "create_payment"
	ToolSendWhatsApp      = "send_whatsapp"
	ToolUpdateOrderDraft  = "update_order_draft"
	ToolCreateBooking     = "create_booking"
	ToolCreateOrder       = "create_order"
)

// ToolDefinition describes an MCP tool that the AI orchestration layer can call.
// Enabled indicates whether the tool participates in the live chat workflow.
// Tools that are defined but not yet wired into the workflow keep Enabled=false
// so the catalog stays an accurate source of truth.
type ToolDefinition struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Inputs      []string `json:"inputs"`
	Enabled     bool     `json:"enabled"`
}

// Catalog returns every MCP tool known to the platform.
//
// Active workflow (AIService.Chat): search_destination -> search_hotels ->
// calculate_budget -> generate_itinerary.
//
// create_payment is intentionally disabled/unregistered from the active tool
// catalog while PAYMENTS_ENABLED defaults false. The AI must not surface QRIS,
// checkout, DOKU, or any payment instruction. Re-enable only by setting
// PAYMENTS_ENABLED=true, wiring routes, and flipping Enabled=true.
// send_whatsapp is defined for future confirmation automation and is not yet
// part of the live workflow.
func Catalog() []ToolDefinition {
	return []ToolDefinition{
		{Name: ToolSearchDestination, Description: "Find matching destinations for user preferences.", Inputs: []string{"prompt", "budget", "season"}, Enabled: true},
		{Name: ToolSearchHotels, Description: "Search hotel and villa inventory.", Inputs: []string{"destination", "dates", "tier"}, Enabled: true},
		{Name: ToolCalculateBudget, Description: "Estimate total trip cost and confidence.", Inputs: []string{"destination", "duration", "travelers"}, Enabled: true},
		{Name: ToolGenerateItinerary, Description: "Create a day-by-day travel itinerary.", Inputs: []string{"destination", "duration", "interests"}, Enabled: true},
		{Name: ToolUpdateOrderDraft, Description: "Update the UI with the currently collected order details.", Inputs: []string{"trip_id", "adult_pax", "child_pax", "contact_name", "contact_email", "contact_phone", "travel_date"}, Enabled: true},
		{Name: ToolCreateBooking, Description: "Create the final order in the database. Call this only when all required info is complete.", Inputs: []string{"trip_id", "adult_pax", "child_pax", "contact_name", "contact_email", "contact_phone", "travel_date"}, Enabled: true},
		{Name: ToolCreateOrder, Description: "Alias of create_booking. Create the final order in the database. Call this only when all required info is complete.", Inputs: []string{"trip_id", "adult_pax", "child_pax", "contact_name", "contact_email", "contact_phone", "travel_date"}, Enabled: true},
		{Name: ToolCreatePayment, Description: "Create QRIS or Virtual Account payment intent. Disabled while DOKU payment flow is temporarily off; not registered in active AI workflow.", Inputs: []string{"booking_id", "amount", "method"}, Enabled: false},
		{Name: ToolSendWhatsApp, Description: "Trigger WhatsApp confirmation automation. Defined for future use, not yet part of the live workflow.", Inputs: []string{"phone", "message"}, Enabled: false},
	}
}

// ActiveCatalog returns only the tools that are currently part of the live
// AI chat workflow.
func ActiveCatalog() []ToolDefinition {
	all := Catalog()
	active := make([]ToolDefinition, 0, len(all))
	for _, tool := range all {
		if tool.Enabled {
			active = append(active, tool)
		}
	}
	return active
}

// OpenAITools converts the active MCP catalog into OpenAI-compatible tool
// definitions that can be sent in the chat completions request. Required fields
// mirror backend validation: create_booking needs trip_id, pax, and travel_date,
// plus at least one contact method as described in the tool description.
func OpenAITools() []ai.ToolDef {
	active := ActiveCatalog()
	defs := make([]ai.ToolDef, 0, len(active))
	for _, tool := range active {
		props := make(map[string]interface{}, len(tool.Inputs))
		for _, input := range tool.Inputs {
			props[input] = map[string]interface{}{
				"type":        "string",
				"description": input,
			}
		}
		required := requiredInputs(tool)
		defs = append(defs, ai.ToolDef{
			Type: "function",
			Function: ai.FunctionSpec{
				Name:        tool.Name,
				Description: toolDescription(tool),
				Parameters: map[string]interface{}{
					"type":       "object",
					"properties": props,
					"required":   required,
				},
			},
		})
	}
	return defs
}

func requiredInputs(tool ToolDefinition) []string {
	switch tool.Name {
	case ToolCreateBooking, ToolCreateOrder:
		return []string{"trip_id", "adult_pax", "child_pax", "travel_date"}
	case ToolUpdateOrderDraft:
		return []string{}
	default:
		return tool.Inputs
	}
}

func toolDescription(tool ToolDefinition) string {
	if tool.Name == ToolCreateBooking || tool.Name == ToolCreateOrder {
		return tool.Description + " Requires contact_email OR contact_phone before calling. Returns success=true with order_id only after database save succeeds."
	}
	return tool.Description
}
