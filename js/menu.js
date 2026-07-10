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

	categories.forEach((category, catIdx) => {
		const catNumber = catIdx + 1 // Рассчитываем номер раздела (1, 2...)
		const catLi = document.createElement('li')
		catLi.className = 'category-group'
		catLi.dataset.category = category

		const catBtn = document.createElement('button')
		catBtn.className = 'category-title'
		catBtn.innerHTML = `<span>${catNumber}. ${formatName(category)}</span><span class="arrow">▶</span>`

		const subfoldersUl = document.createElement('ul')
		subfoldersUl.className = 'subcategory-list'

		const subfolders = Object.keys(articles[category] || {})
		subfolders.forEach((sub, subIdx) => {
			const subNumber = `${catNumber}.${subIdx + 1}` // Рассчитываем номер подраздела (1.1, 1.2...)
			const subLi = document.createElement('li')
			subLi.className = 'subcategory-group'
			subLi.dataset.subcategory = sub

			const subBtn = document.createElement('button')
			subBtn.className = 'subcategory-title'
			subBtn.innerHTML = `<span>${subNumber}. ${sub}</span><span class="arrow-sub">▶</span>`

			const articlesUl = document.createElement('ul')
			articlesUl.className = 'category-articles'

			const fileNames = articles[category][sub] || []
			fileNames.forEach((fileName, artIdx) => {
				const artNumber = `${subNumber}.${artIdx + 1}` // Рассчитываем номер статьи (1.1.1, 1.1.2...)
				const fileLi = document.createElement('li')
				const a = document.createElement('a')

				a.href = `#${category}/${encodeURIComponent(sub)}/${encodeURIComponent(fileName)}` // Формируем хэш-ссылку
				a.textContent = `${artNumber}. ${fileName}`
				a.dataset.category = category
				a.dataset.subcategory = sub
				a.dataset.name = fileName

				fileLi.appendChild(a)
				articlesUl.appendChild(fileLi)
			})

			subBtn.addEventListener('click', e => {
				e.stopPropagation()
				subLi.classList.toggle('open')
			})

			subLi.appendChild(subBtn)
			subLi.appendChild(articlesUl)
			subfoldersUl.appendChild(subLi)
		})

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
