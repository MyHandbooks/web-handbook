const STRIP_CHARS = /[«»"'“”(),.:;!?№]/g

export function slugify(text) {
	if (!text) return ''

	let result = text.toLowerCase().trim()

	result = result.replace(STRIP_CHARS, '')
	result = result.replace(/&/g, 'и')
	result = result.replace(/[\s_/\\]+/g, '-')
	result = result.replace(/[^a-zа-яё0-9-]+/gi, '')
	result = result.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')

	return result
}

export function buildRouteMap(articles) {
	const routeMap = new Map()
	if (!articles) return routeMap

	Object.keys(articles).forEach(category => {
		const catSlug = slugify(category)

		Object.keys(articles[category] || {}).forEach(sub => {
			const subSlug = slugify(sub)

			;(articles[category][sub] || []).forEach(name => {
				const key = `${catSlug}/${subSlug}/${slugify(name)}`

				if (routeMap.has(key)) {
					console.warn(
						`[slug.js] Коллизия маршрутов: "${key}" уже занят статьёй "${routeMap.get(key).name}", конфликтует с "${name}". Переименуйте одну из статей.`,
					)
				}

				routeMap.set(key, { category, subcategory: sub, name })
			})
		})
	})

	return routeMap
}

export function buildArticleIndex(articles) {
	const index = new Map()
	if (!articles) return index

	Object.keys(articles).forEach(category => {
		Object.keys(articles[category] || {}).forEach(sub => {
			;(articles[category][sub] || []).forEach(name => {
				index.set(name, { category, subcategory: sub })
			})
		})
	})

	return index
}
