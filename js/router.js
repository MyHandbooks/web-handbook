import { parseMarkdown } from './parser.js'
import { updateActiveMenuItem } from './menu.js'
import { resetExamUI, checkApiKeyStatus } from './exam-controller.js'

const ARTICLES_DIR = './articles'

async function loadArticle(category, subcategory, name, articles) {
	const contentEl = document.getElementById('article-content')
	contentEl.innerHTML = '<div class="loader">Загрузка статьи...</div>'

	try {
		// Формируем точный физический путь к файлу на диске
		const response = await fetch(
			`${ARTICLES_DIR}/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}/${encodeURIComponent(name)}.md`,
		)
		if (!response.ok) {
			throw new Error('Файл статьи не найден')
		}

		const markdown = await response.text()
		contentEl.innerHTML = parseMarkdown(markdown, articles)

		Prism.highlightAllUnder(contentEl)
	} catch (error) {
		contentEl.innerHTML = `<p class="error-msg">Не удалось загрузить статью "${name}".</p>`
	}
}

export function initRouter(articles) {
	const handleRoute = () => {
		const hash = decodeURIComponent(window.location.hash.slice(1))

		// Маршрут по умолчанию (если зашли на пустой хэш, редиректим на первую статью)
		if (!hash) {
			const firstCategory = Object.keys(articles)[0]
			const firstSubcategory = Object.keys(articles[firstCategory] || {})[0]
			const firstArticle = (articles[firstCategory]?.[firstSubcategory] ||
				[])[0]

			if (firstArticle) {
				window.location.hash = `${firstCategory}/${encodeURIComponent(firstSubcategory)}/${encodeURIComponent(firstArticle)}`
			}
			return
		}

		// Разбираем хэш по слэшам
		const parts = hash.split('/')
		if (parts.length < 3) return

		const category = parts[0]
		const subcategory = parts[1]
		const articleName = parts[2]

		const categoryData = articles[category]
		const subcategoryData = categoryData ? categoryData[subcategory] : null

		if (subcategoryData && subcategoryData.includes(articleName)) {
			loadArticle(category, subcategory, articleName, articles)
			updateActiveMenuItem(category, subcategory, articleName)
			resetExamUI()
			checkApiKeyStatus()
		}
	}

	window.addEventListener('hashchange', handleRoute)
	handleRoute()
}
