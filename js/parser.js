import { slugify, buildArticleIndex } from './slug.js'

export function parseMarkdown(markdown, articles, articleNumber) {
	let cleanMarkdown = markdown.replace(/^---[\s\S]*?---/, '')

	const articleIndex = buildArticleIndex(articles)

	cleanMarkdown = cleanMarkdown.replace(/\[\[(.*?)\]\]/g, (match, content) => {
		const parts = content.split('|')
		const targetArticle = parts[0].trim()
		const displayText = parts[1] ? parts[1].trim() : targetArticle

		const location = articleIndex.get(targetArticle)

		if (!location) {
			return `<span class="broken-link" title="Статья не найдена: ${targetArticle}">${displayText}</span>`
		}

		const href = `#${slugify(location.category)}/${slugify(location.subcategory)}/${slugify(targetArticle)}`
		return `<a href="${href}">${displayText}</a>`
	})

	if (articleNumber) {
		cleanMarkdown = cleanMarkdown.replace(/^# (.+)$/m, `# ${articleNumber}. $1`)
	}

	return marked.parse(cleanMarkdown)
}
