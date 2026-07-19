package structs

type UpdatePreferencesRequest struct {
	ColorScheme   *map[string]interface{} `json:"color_scheme"`
	CookieConsent *string                 `json:"cookie_consent"`
}
