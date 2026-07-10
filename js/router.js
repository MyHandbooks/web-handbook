import { parseMarkdown } from './parser.js'
import { updateActiveMenuItem } from './menu.js'
import { resetExamUI, checkApiKeyStatus } from './exam-controller.js'

const ARTICLES_DIR = './articles'

/**
 * Вычисляет динамический префикс номера статьи (например, "2.1.2") на основе структуры JSON
 */
function calculateArticleNumber(category, subcategory, name, articles) {
	const categories = Object.keys(articles)
	const catIdx = categories.indexOf(category)
	if (catIdx === -1) return ''

	const subcategories = Object.keys(articles[category] || {})
	const subIdx = subcategories.indexOf(subcategory)
	if (subIdx === -1) return `${catIdx + 1}`

	const fileNames = articles[category][subcategory] || []
	const artIdx = fileNames.indexOf(name)
	if (artIdx === -1) return `${catIdx + 1}.${subIdx + 1}`

	return `${catIdx + 1}.${subIdx + 1}.${artIdx + 1}`
}

async function loadArticle(category, subcategory, name, articles) {
	const contentEl = document.getElementById('article-content')
	contentEl.innerHTML = '<div class="loader">Загрузка статьи...</div>'

	try {
		// Формируем путь к файлу на диске без номеров в названиях папок
		const response = await fetch(
			`${ARTICLES_DIR}/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}/${encodeURIComponent(name)}.md`,
		)
		if (!response.ok) {
			throw new Error('Файл статьи не найден')
		}

		const markdown = await response.text()

		// Рассчитываем номер статьи на лету
		const computedNumber = calculateArticleNumber(
			category,
			subcategory,
			name,
			articles,
		)

		// Передаем рассчитанный номер в парсер для вставки в заголовок H1
		contentEl.innerHTML = parseMarkdown(markdown, articles, computedNumber)

		Prism.highlightAllUnder(contentEl)
	} catch (error) {
		contentEl.innerHTML = `<p class="error-msg">Не удалось загрузить статью "${name}".</p>`
	}
}

export function initRouter(articles) {
	const handleRoute = () => {
		const hash = decodeURIComponent(window.location.hash.slice(1))

		// Если хэш пустой, автоматически перенаправляем на самую первую статью
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
