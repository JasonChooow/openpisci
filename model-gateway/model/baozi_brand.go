package model

const (
	baoziSystemName = "包子"
	baoziLogoPath   = "/baozi-logo.png"
	baoziHeaderNav  = `{"home":true,"console":true,"pricing":{"enabled":true,"requireAuth":false},"rankings":{"enabled":false,"requireAuth":false},"docs":true,"about":false}`
)

// ApplyBaoziBrandPreset initializes the product-facing brand on a fresh
// deployment. Existing operator settings always win and are never overwritten.
func ApplyBaoziBrandPreset() error {
	var count int64
	if err := DB.Model(&Option{}).Where("key = ?", "SystemName").Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	return UpdateOptionsBulk(map[string]string{
		"SystemName":       baoziSystemName,
		"Logo":             baoziLogoPath,
		"HeaderNavModules": baoziHeaderNav,
		"theme.frontend":   "default",
	})
}
