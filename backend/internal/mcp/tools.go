package mcp

const (
	ToolSearchDestination = "search_destination"
	ToolSearchHotels      = "search_hotels"
	ToolCalculateBudget   = "calculate_budget"
	ToolGenerateItinerary = "generate_itinerary"
	ToolCreatePayment     = "create_payment"
	ToolSendWhatsApp      = "send_whatsapp"
)

type ToolDefinition struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Inputs      []string `json:"inputs"`
}

func Catalog() []ToolDefinition {
	return []ToolDefinition{
		{Name: ToolSearchDestination, Description: "Find matching destinations for user preferences.", Inputs: []string{"prompt", "budget", "season"}},
		{Name: ToolSearchHotels, Description: "Search hotel and villa inventory.", Inputs: []string{"destination", "dates", "tier"}},
		{Name: ToolCalculateBudget, Description: "Estimate total trip cost and confidence.", Inputs: []string{"destination", "duration", "travelers"}},
		{Name: ToolGenerateItinerary, Description: "Create a day-by-day travel itinerary.", Inputs: []string{"destination", "duration", "interests"}},
		{Name: ToolCreatePayment, Description: "Create QRIS or Virtual Account payment intent.", Inputs: []string{"booking_id", "amount", "method"}},
		{Name: ToolSendWhatsApp, Description: "Trigger WhatsApp confirmation automation.", Inputs: []string{"phone", "message"}},
	}
}
