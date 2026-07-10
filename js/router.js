import { parseMarkdown } from './parser.js'
import { updateActiveMenuItem } from './menu.js'
import { resetExamUI, checkApiKeyStatus } from './exam-controller.js'
import { slugify, buildRouteMap } from './slug.js'

const ARTICLES_DIR = './articles'
const SITE_TITLE = 'Конспекты по frontend'

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
		const response = await fetch(
			`${ARTICLES_DIR}/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}/${encodeURIComponent(name)}.md`,
		)
		if (!response.ok) {
			throw new Error('Файл статьи не найден')
		}

		const markdown = await response.text()

		const computedNumber = calculateArticleNumber(
			category,
			subcategory,
			name,
			articles,
		)
		contentEl.innerHTML = parseMarkdown(markdown, articles, computedNumber)

		document.title = `${name} — ${SITE_TITLE}`

		Prism.highlightAllUnder(contentEl)
	} catch (error) {
		contentEl.innerHTML = `<p class="error-msg">Не удалось загрузить статью "${name}".</p>`
		document.title = SITE_TITLE
	}
}

export function initRouter(articles) {
	const routeMap = buildRouteMap(articles)

	const handleRoute = () => {
		const hash = decodeURIComponent(window.location.hash.slice(1))

		if (!hash) {
			const firstCategory = Object.keys(articles)[0]
			const firstSubcategory = Object.keys(articles[firstCategory] || {})[0]
			const firstArticle = (articles[firstCategory]?.[firstSubcategory] ||
				[])[0]

			if (firstArticle) {
				window.location.hash = `${slugify(firstCategory)}/${slugify(firstSubcategory)}/${slugify(firstArticle)}`
			}
			return
		}

		const route = routeMap.get(hash)

		if (route) {
			loadArticle(route.category, route.subcategory, route.name, articles)
			updateActiveMenuItem(route.category, route.subcategory, route.name)
			resetExamUI()
			checkApiKeyStatus()
		} else {
			document.getElementById('article-content').innerHTML =
				'<p class="error-msg">Страница не найдена. Проверьте ссылку или выберите статью в меню слева.</p>'
			document.title = SITE_TITLE
		}
	}

	window.addEventListener('hashchange', handleRoute)
	handleRoute()
}
