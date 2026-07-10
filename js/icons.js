const iconCache = new Map()

class AppIcon extends HTMLElement {
	static get observedAttributes() {
		return ['name']
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (name === 'name' && oldValue !== newValue) {
			this.render()
		}
	}

	connectedCallback() {
		this.render()
	}

	async render() {
		const name = this.getAttribute('name')
		if (!name) return

		if (iconCache.has(name)) {
			this.innerHTML = iconCache.get(name)
			return
		}

		try {
			const response = await fetch(`./icons/${name}.svg`)
			if (!response.ok) {
				throw new Error(`Icon "${name}" not found`)
			}
			const svgText = await response.text()
			iconCache.set(name, svgText)
			this.innerHTML = svgText
		} catch (error) {
			console.error(error)
			this.innerHTML = ''
		}
	}
}

customElements.define('app-icon', AppIcon)
