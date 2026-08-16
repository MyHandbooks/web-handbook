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

	const renderer = new marked.Renderer()

	renderer.code = function ({ text, lang }) {
		const language = lang || 'text'
		const langLabels = {
			typescript: 'TS',
			ts: 'TS',
			javascript: 'JS',
			js: 'JS',
			html: 'HTML',
			css: 'CSS',
			scss: 'SCSS',
			json: 'JSON',
			bash: 'BASH',
			text: 'CODE',
		}
		const badge = langLabels[language.toLowerCase()] || language.toUpperCase()
		const escapedCode = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')

		return `
			<details class="code-details">
				<summary class="code-summary">
					<div class="code-summary-left">
						<span class="code-lang-badge">${badge}</span>
						<span class="code-summary-title">Показать код (${badge})</span>
					</div>
					<div class="code-toggle-wrapper">
						<span class="code-text-collapsed">Развернуть</span>
						<span class="code-text-expanded">Свернуть</span>
						<svg class="code-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="6 9 12 15 18 9"></polyline>
						</svg>
					</div>
				</summary>
				<pre class="language-${language}"><code class="language-${language}">${escapedCode}</code></pre>
			</details>
		`
	}

	return marked.parse(cleanMarkdown, { renderer })
}
