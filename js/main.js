import './icons.js'
import { initTheme } from './theme.js'
import { initMobileMenu, renderMenu } from './menu.js'
import { initRouter } from './router.js'
import { checkApiKeyStatus } from './exam-controller.js'

async function init() {
	initTheme()
	initMobileMenu()
	checkApiKeyStatus()

	// Инициализация логики переключения вкладок
	const tabButtons = document.querySelectorAll('.tab-btn')
	const tabContents = document.querySelectorAll('.tab-content')

	tabButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			tabButtons.forEach(b => b.classList.remove('active'))
			tabContents.forEach(c => c.classList.add('hidden'))

			btn.classList.add('active')
			const targetTab = btn.getAttribute('data-tab')
			if (targetTab === 'article') {
				document.getElementById('article-content').classList.remove('hidden')
			} else if (targetTab === 'exam') {
				document.getElementById('exam-content').classList.remove('hidden')
			}
		})
	})

	try {
		const response = await fetch('./articles.json')
		if (!response.ok) {
			throw new Error('Не удалось загрузить список статей')
		}
		const articles = await response.json()

		renderMenu(articles)
		initRouter(articles)
	} catch (error) {
		console.error(error)
		const fallbackError = '<li>Ошибка загрузки меню</li>'
		const menuJs = document.getElementById('menu-js')
		const menuAngular = document.getElementById('menu-angular')
		if (menuJs) menuJs.innerHTML = fallbackError
		if (menuAngular) menuAngular.innerHTML = fallbackError
	}
}

document.addEventListener('DOMContentLoaded', init)
