let articlesData = null

function formatName(text) {
	return text.replace(/-/g, ' ').toUpperCase()
}

export function renderMenu(articles) {
	articlesData = articles
	const selectorEl = document.getElementById('category-selector')
	const menuEl = document.getElementById('menu')

	if (selectorEl) selectorEl.style.display = 'none'
	if (!menuEl) return

	menuEl.innerHTML = ''
	const categories = Object.keys(articles)

	if (categories.length === 0) {
		menuEl.innerHTML = '<li>Нет доступных тем</li>'
		return
	}

	// Уровень 1: Главные разделы (Категории)
	categories.forEach(category => {
		const catLi = document.createElement('li')
		catLi.className = 'category-group'
		catLi.dataset.category = category

		const catBtn = document.createElement('button')
		catBtn.className = 'category-title'
		catBtn.innerHTML = `<span>${formatName(category)}</span><span class="arrow">▶</span>`

		// Контейнер для подразделов (Уровень 2)
		const subfoldersUl = document.createElement('ul')
		subfoldersUl.className = 'subcategory-list'

		const subfolders = Object.keys(articles[category] || {})
		subfolders.forEach(sub => {
			const subLi = document.createElement('li')
			subLi.className = 'subcategory-group'
			subLi.dataset.subcategory = sub

			const subBtn = document.createElement('button')
			subBtn.className = 'subcategory-title'
			subBtn.innerHTML = `<span>${sub}</span><span class="arrow-sub">▶</span>`

			// Контейнер для статей (Уровень 3)
			const articlesUl = document.createElement('ul')
			articlesUl.className = 'category-articles'

			const fileNames = articles[category][sub] || []
			fileNames.forEach(fileName => {
				const fileLi = document.createElement('li')
				const a = document.createElement('a')

				// Формируем хэш роута: #Раздел/Подраздел/ИмяСтатьи
				a.href = `#${category}/${encodeURIComponent(sub)}/${encodeURIComponent(fileName)}`
				a.textContent = fileName
				a.dataset.category = category
				a.dataset.subcategory = sub
				a.dataset.name = fileName

				fileLi.appendChild(a)
				articlesUl.appendChild(fileLi)
			})

			// Клик по подразделу открывает/закрывает список статей
			subBtn.addEventListener('click', e => {
				e.stopPropagation()
				subLi.classList.toggle('open')
			})

			subLi.appendChild(subBtn)
			subLi.appendChild(articlesUl)
			subfoldersUl.appendChild(subLi)
		})

		// Клик по главному разделу открывает/закрывает список подразделов
		catBtn.addEventListener('click', () => {
			catLi.classList.toggle('open')
		})

		catLi.appendChild(catBtn)
		catLi.appendChild(subfoldersUl)
		menuEl.appendChild(catLi)
	})
}

export function updateActiveMenuItem(
	activeCategory,
	activeSubcategory,
	activeName,
) {
	let activeLink = null

	// Находим и подсвечиваем ссылку
	document.querySelectorAll('.category-articles a').forEach(a => {
		if (
			a.dataset.category === activeCategory &&
			a.dataset.subcategory === activeSubcategory &&
			a.dataset.name === activeName
		) {
			a.classList.add('active')
			activeLink = a
		} else {
			a.classList.remove('active')
		}
	})

	// Разворачиваем всю цепочку папок до этой статьи
	if (activeLink) {
		const subGroup = activeLink.closest('.subcategory-group')
		if (subGroup) subGroup.classList.add('open')

		const catGroup = activeLink.closest('.category-group')
		if (catGroup) catGroup.classList.add('open')
	}
}

export function initMobileMenu() {
	const menuToggle = document.getElementById('menu-toggle')
	const sidebar = document.getElementById('sidebar')

	if (menuToggle && sidebar) {
		menuToggle.addEventListener('click', () => {
			menuToggle.classList.toggle('open')
			sidebar.classList.toggle('open')
		})
	}

	const menuEl = document.getElementById('menu')
	if (menuEl && menuToggle && sidebar) {
		menuEl.addEventListener('click', e => {
			if (e.target.tagName === 'A') {
				menuToggle.classList.remove('open')
				sidebar.classList.remove('open')
			}
		})
	}
}
