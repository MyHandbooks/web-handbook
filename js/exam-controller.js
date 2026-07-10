import {
	getApiKey,
	saveApiKey,
	getProvider,
	getSelectedModel,
	saveSelectedModel,
	fetchModels,
	filterModelsList,
	prepareExam,
	sendExamMessage,
	clearExamHistory,
	setAssistantParams,
} from './ai-examiner.js'

const keyWarning = document.getElementById('ai-key-warning')
const examInterface = document.getElementById('exam-interface')
const providerSelect = document.getElementById('provider-select')
const apiKeyInput = document.getElementById('api-key-input')
const saveKeyBtn = document.getElementById('save-key-btn')

const modelSelectorGroup = document.getElementById('model-selector-group')
const apiModelSearch = document.getElementById('api-model-search')
const freeOnlyCheckbox = document.getElementById('free-only-checkbox')
const modelSelect = document.getElementById('model-select')

const startExamBtn = document.getElementById('start-exam-btn')
const interactiveInputs = document.getElementById('interactive-inputs')
const studentAnswerInput = document.getElementById('student-answer-input')
const sendAnswerBtn = document.getElementById('send-answer-btn')
const examChatMessages = document.getElementById('exam-chat-messages')
const examStatus = document.getElementById('exam-status')
const resetExamBtn = document.getElementById('reset-exam-btn')

const assistantStyleSelect = document.getElementById('assistant-style-select')
const examSetupFields = document.getElementById('exam-setup-fields')

let allLoadedModels = []

export function getCurrentRoute() {
	const hash = decodeURIComponent(window.location.hash.slice(1))
	if (!hash) return null
	const parts = hash.split('/')
	if (parts.length < 3) return null

	return {
		category: parts[0],
		subcategory: parts[1],
		articleName: parts[2],
	}
}

export async function checkApiKeyStatus() {
	const key = getApiKey()
	const provider = getProvider()

	providerSelect.value = provider

	if (key) {
		apiKeyInput.value = key
		keyWarning.classList.add('hidden')
		examInterface.classList.remove('hidden')
		modelSelectorGroup.classList.remove('hidden')
		await loadModels(provider, key)
	} else {
		keyWarning.classList.remove('hidden')
		examInterface.classList.add('hidden')
		modelSelectorGroup.classList.add('hidden')
	}
}

async function loadModels(provider, key) {
	modelSelect.innerHTML = '<option value="">Загрузка моделей...</option>'
	try {
		allLoadedModels = await fetchModels(provider, key)
		populateModelDropdown()
	} catch (error) {
		console.error(error)
		modelSelect.innerHTML =
			'<option value="">Ошибка загрузки списка моделей</option>'
	}
}

function populateModelDropdown() {
	const provider = getProvider()
	const searchTerm = apiModelSearch.value
	const freeOnly = freeOnlyCheckbox.checked

	const filtered = filterModelsList(
		allLoadedModels,
		searchTerm,
		freeOnly,
		provider,
	)

	modelSelect.innerHTML = ''

	if (filtered.length === 0) {
		const opt = document.createElement('option')
		opt.value = ''
		opt.textContent = 'Models Not Found'
		return
	}

	const activeSavedModel = getSelectedModel()

	filtered.forEach(model => {
		const opt = document.createElement('option')
		opt.value = model.id

		let label = model.id
		if (model.pricing && provider === 'openrouter') {
			const isFree =
				parseFloat(model.pricing.prompt) === 0 &&
				parseFloat(model.pricing.completion) === 0
			label += isFree ? ' (Бесплатно)' : ' (Платно)'
		}

		opt.textContent = label
		if (model.id === activeSavedModel) {
			opt.selected = true
		}
		modelSelect.appendChild(opt)
	})

	if (!modelSelect.value && filtered.length > 0) {
		saveSelectedModel(filtered[0].id)
	}
}

function updateWelcomeMessage() {
	const style = assistantStyleSelect.value
	if (style === 'summary') {
		startExamBtn.textContent = 'Запустить помощника'
		examChatMessages.innerHTML = `
			<div class="message assistant">
				<p>Привет! Я твой интерактивный библиотекарь по фронтенду. В режиме <b>сжатых саммари</b> я буду присылать лаконичные тезисы, структурированные выжимки лекций и помогать быстро находить нужные фрагменты информации. Нажмите кнопку ниже, чтобы запустить ассистента.</p>
			</div>
		`
		studentAnswerInput.placeholder =
			'Спросите меня о чем угодно из базы знаний... (Ctrl + Enter для отправки)'
		examStatus.textContent = 'Помощник готов к краткой навигации'
	} else {
		startExamBtn.textContent = 'Запустить помощника'
		examChatMessages.innerHTML = `
			<div class="message assistant">
				<p>Привет! Я твой детальный технический наставник и библиотекарь. В режиме <b>подробных разъяснений</b> я буду детально разбирать концепции текущей статьи, приводить подробные примеры кода с комментариями и отвечать на глубокие вопросы. Нажмите кнопку ниже, чтобы запустить ассистента.</p>
			</div>
		`
		studentAnswerInput.placeholder =
			'Введите ваш подробный вопрос по теме... (Ctrl + Enter для отправки)'
		examStatus.textContent = 'Помощник готов к подробному разбору'
	}
}

export function resetExamUI() {
	clearExamHistory()

	if (examSetupFields) {
		examSetupFields.classList.remove('hidden')
	}

	updateWelcomeMessage()

	startExamBtn.classList.remove('hidden')
	startExamBtn.disabled = false
	interactiveInputs.classList.add('hidden')
}

apiModelSearch.addEventListener('input', populateModelDropdown)
freeOnlyCheckbox.addEventListener('change', populateModelDropdown)

modelSelect.addEventListener('change', () => {
	saveSelectedModel(modelSelect.value)
})

assistantStyleSelect.addEventListener('change', updateWelcomeMessage)

saveKeyBtn.addEventListener('click', async () => {
	const key = apiKeyInput.value.trim()
	const provider = providerSelect.value

	if (!key) {
		alert('Пожалуйста, введите ключ.')
		return
	}

	saveApiKey(key)
	saveProvider(provider)

	saveKeyBtn.disabled = true
	saveKeyBtn.textContent = 'Подключение...'

	try {
		await loadModels(provider, key)
		checkApiKeyStatus()
		alert('Ключ и провайдер успешно обновлены, список моделей загружен!')
	} catch (error) {
		alert(
			'Ошибка при подключении к провайдеру. Убедитесь в правильности ключа.',
		)
		localStorage.removeItem('user_api_key')
		checkApiKeyStatus()
	} finally {
		saveKeyBtn.disabled = false
		saveKeyBtn.textContent = 'Сохранить'
	}
})

providerSelect.addEventListener('change', () => {
	apiKeyInput.value = ''
	saveApiKey('')
	saveProvider(providerSelect.value)
	clearExamHistory()
	checkApiKeyStatus()
})

startExamBtn.addEventListener('click', async () => {
	const route = getCurrentRoute()
	if (!route) {
		alert('Выберите статью перед началом.')
		return
	}

	const style = assistantStyleSelect.value
	setAssistantParams(style)

	startExamBtn.disabled = true
	startExamBtn.textContent = 'Анализирую тему...'
	examStatus.textContent = 'Библиотекарь читает статью...'

	const ready = await prepareExam(
		route.category,
		route.subcategory,
		route.articleName,
	)
	if (!ready) {
		alert('Ошибка при подготовке материала.')
		resetExamUI()
		return
	}

	try {
		const firstMessage = await sendExamMessage()
		examChatMessages.innerHTML = ''
		appendMessage('assistant', firstMessage)

		if (examSetupFields) {
			examSetupFields.classList.add('hidden')
		}

		startExamBtn.classList.add('hidden')
		interactiveInputs.classList.remove('hidden')
		examStatus.textContent = 'Помощник активен'
	} catch (error) {
		alert(error.message)
		resetExamUI()
	}
})

async function submitAnswer() {
	const answer = studentAnswerInput.value.trim()
	if (!answer) return

	appendMessage('user', answer)
	studentAnswerInput.value = ''

	studentAnswerInput.disabled = true
	sendAnswerBtn.disabled = true
	examStatus.textContent = 'Библиотекарь анализирует запрос...'

	try {
		const response = await sendExamMessage(answer)
		appendMessage('assistant', response)
		examStatus.textContent = 'Ожидание запроса'
	} catch (error) {
		appendMessage('assistant', `❌ Ошибка: ${error.message}`)
		examStatus.textContent = 'Ошибка сети'
	} finally {
		studentAnswerInput.disabled = false
		sendAnswerBtn.disabled = false
		studentAnswerInput.focus()
	}
}

sendAnswerBtn.addEventListener('click', submitAnswer)

studentAnswerInput.addEventListener('keydown', e => {
	if (e.key === 'Enter' && e.ctrlKey) {
		e.preventDefault()
		submitAnswer()
	}
})

resetExamBtn.addEventListener('click', () => {
	if (
		confirm(
			'Вы уверены, что хотите сбросить историю текущего диалога с ассистентом?',
		)
	) {
		resetExamUI()
	}
})

function appendMessage(sender, text) {
	const messageDiv = document.createElement('div')
	messageDiv.className = `message ${sender}`

	if (sender === 'assistant' && window.marked) {
		messageDiv.innerHTML = marked.parse(text)
	} else {
		const p = document.createElement('p')
		p.textContent = text
		messageDiv.appendChild(p)
	}

	examChatMessages.appendChild(messageDiv)
	examChatMessages.scrollTop = examChatMessages.scrollHeight
}

updateWelcomeMessage()
