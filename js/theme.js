export function initTheme() {
	const toggleBtn = document.getElementById('theme-toggle')
	const savedTheme = localStorage.getItem('theme') || 'dark-theme'

	document.body.className = savedTheme

	toggleBtn.addEventListener('click', () => {
		const currentTheme = document.body.className
		const newTheme =
			currentTheme === 'dark-theme' ? 'light-theme' : 'dark-theme'

		document.body.className = newTheme
		localStorage.setItem('theme', newTheme)
	})
}
