export function parseMarkdown(markdown, articles) {
	let cleanMarkdown = markdown.replace(/^---[\s\S]*?---/, '')

	cleanMarkdown = cleanMarkdown.replace(/\[\[(.*?)\]\]/g, (match, content) => {
		const parts = content.split('|')
		const targetArticle = parts[0].trim()
		const displayText = parts[1] ? parts[1].trim() : targetArticle

		let category = 'js'
		if (articles) {
			if (articles.js && articles.js.includes(targetArticle)) {
				category = 'js'
			} else if (articles.angular && articles.angular.includes(targetArticle)) {
				category = 'angular'
			}
		}

		return `<a href="#${category}/${encodeURIComponent(targetArticle)}">${displayText}</a>`
	})

	return marked.parse(cleanMarkdown)
}
