export function makeAvatarAwareCaptionConfig({ captions, avatarBox, slideHeight = 7.5, footerHeight = 0.62, gap = 0.12 } = {}) {
	const cfg = captions && typeof captions === 'object' ? { ...captions } : captions
	if (!cfg || typeof cfg !== 'object' || cfg.enabled === false) return cfg
	const captionX = Number(cfg.x ?? 0.9)
	const avatarX = Number(avatarBox?.x)
	const captionH = Math.max(0.2, Number(cfg.h ?? 0.45) || 0.45)
	const footerTop = Number(slideHeight) - Math.max(0, Number(footerHeight) || 0)
	const safeBottom = footerTop - captionH
	const requestedY = Number(cfg.y ?? 6.25)
	if (Number.isFinite(requestedY) && Number.isFinite(safeBottom)) {
		cfg.y = Math.max(0.1, Math.min(requestedY, safeBottom))
	}
	if (Number.isFinite(captionX) && Number.isFinite(avatarX) && avatarX > captionX) {
		const maxW = Math.max(1, avatarX - captionX - 0.25)
		cfg.x = captionX
		cfg.w = Math.min(Number(cfg.w ?? 11.5) || 11.5, maxW)
	}
	const finalX = Number(cfg.x ?? captionX)
	const finalW = Number(cfg.w ?? 11.5) || 11.5
	const finalY = Number(cfg.y ?? 6.25)
	const avatarY = Number(avatarBox?.y)
	const avatarW = Number(avatarBox?.w)
	const avatarH = Number(avatarBox?.h)
	const horizontalOverlap = Number.isFinite(finalX) && Number.isFinite(finalW) && Number.isFinite(avatarX) && Number.isFinite(avatarW)
		&& finalX < avatarX + avatarW && finalX + finalW > avatarX
	const verticalOverlap = Number.isFinite(finalY) && Number.isFinite(avatarY) && Number.isFinite(avatarH)
		&& finalY < avatarY + avatarH && finalY + captionH > avatarY
	if (horizontalOverlap && verticalOverlap && Number.isFinite(avatarY)) {
		const aboveAvatar = avatarY - captionH - gap
		if (aboveAvatar >= 0.1) cfg.y = aboveAvatar
		else if (Number.isFinite(avatarX) && avatarX > captionX) cfg.w = Math.max(1, avatarX - captionX - 0.25)
	}
	return cfg
}
