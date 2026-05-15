package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

type DOKUClient struct {
	ClientID string
	Secret   string
}

func NewDOKUClient(clientID, secret string) *DOKUClient {
	return &DOKUClient{ClientID: clientID, Secret: secret}
}

func (c *DOKUClient) Sign(message string) string {
	mac := hmac.New(sha256.New, []byte(c.Secret))
	_, _ = mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

func (c *DOKUClient) Verify(message, signature string) bool {
	if c.Secret == "" || signature == "" {
		return false
	}
	expected := c.Sign(message)
	return hmac.Equal([]byte(expected), []byte(signature))
}
