package mcp

const (
	ToolSearchDestination = "search_destination"
	ToolSearchHotels      = "search_hotels"
	ToolCalculateBudget   = "calculate_budget"
	ToolGenerateItinerary = "generate_itinerary"
	ToolCreatePayment     = "create_payment"
	ToolSendWhatsApp      = "send_whatsapp"
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
