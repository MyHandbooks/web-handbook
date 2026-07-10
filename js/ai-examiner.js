const PROVIDERS = {
	openai: {
		baseUrl: 'https://api.openai.com/v1',
		defaultModel: 'gpt-4o-mini',
	},
	mistral: {
		baseUrl: 'https://api.mistral.ai/v1',
		defaultModel: 'mistral-small-latest',
	},
	gemini: {
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
		defaultModel: 'gemini-1.5-flash',
	},
	openrouter: {
		baseUrl: 'https://openrouter.ai/api/v1',
		defaultModel: 'google/gemini-2.5-flash',
	},
}

let examHistory = []
let activeArticleContent = ''
let mindMapContent = ''
let activeMode = 'consultation' // 'consultation' или 'exam'
let activeQuestionsCount = '3' // '3', '5', '10' или 'auto'

export function getApiKey() {
	return localStorage.getItem('user_api_key') || ''
}

export function saveApiKey(key) {
	localStorage.setItem('user_api_key', key.trim())
}

export function getProvider() {
	return localStorage.getItem('active_provider') || 'openai'
}

export function saveProvider(provider) {
	localStorage.setItem('active_provider', provider)
}

export function getSelectedModel() {
	return localStorage.getItem('selected_model') || ''
}

export function saveSelectedModel(modelId) {
	localStorage.setItem('selected_model', modelId)
}

export function clearExamHistory() {
	examHistory = []
}

export function setExamParams(mode, questionsCount) {
	activeMode = mode
	activeQuestionsCount = questionsCount
}

/**
 * Динамическая загрузка доступных моделей с сервера выбранного провайдера
 */
export async function fetchModels(provider, apiKey) {
	const config = PROVIDERS[provider]
	if (!config) return []

	const headers = {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${apiKey}`,
	}

	const response = await fetch(`${config.baseUrl}/models`, {
		method: 'GET',
		headers: headers,
	})

	if (!response.ok) {
		throw new Error(
			'Не удалось получить список моделей. Проверьте правильность API-ключа.',
		)
	}

	const result = await response.json()
	return result.data || []
}

/**
 * Локальная фильтрация и поиск моделей по ключевым словам и ценовому тарифу
 */
export function filterModelsList(
	models,
	searchTerm = '',
	freeOnly = false,
	provider = '',
) {
	return models.filter(model => {
		const id = model.id || ''
		const name = model.name || id
		const nameMatch =
			name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			id.toLowerCase().includes(searchTerm.toLowerCase())

		if (!nameMatch) return false

		if (freeOnly) {
			if (provider === 'openrouter') {
				const promptPrice = model.pricing ? parseFloat(model.pricing.prompt) : 1
				const completionPrice = model.pricing
					? parseFloat(model.pricing.completion)
					: 1
				return promptPrice === 0 && completionPrice === 0
			}
			return (
				id.toLowerCase().includes('free') || name.toLowerCase().includes('free')
			)
		}

		return true
	})
}

/**
 * Асинхронно скачивает текст смежной статьи на клиенте по вызову ИИ-инструмента
 */
async function loadTargetArticleText(category, articleName) {
	try {
		const response = await fetch(
			`./articles/${category}/${encodeURIComponent(articleName)}.md`,
		)
		if (!response.ok) {
			return `[Ошибка: Статья "${articleName}" в категории "${category}" не найдена в репозитории]`
		}
		return await response.text()
	} catch (error) {
		return `[Ошибка загрузки статьи: ${error.message}]`
	}
}

/**
 * Подготовка материалов перед экзаменом
 */
export async function prepareExam(category, articleName) {
	clearExamHistory()
	try {
		// 1. Загружаем текст текущей статьи
		const response = await fetch(
			`./articles/${category}/${encodeURIComponent(articleName)}.md`,
		)
		if (!response.ok) {
			throw new Error(`Не удалось загрузить материал статьи: ${articleName}`)
		}
		activeArticleContent = await response.text()

		// 2. Загружаем карту смежных знаний (articles_summary.json)
		const mapResponse = await fetch('./articles_summary.json')
		if (mapResponse.ok) {
			const mapJson = await mapResponse.json()
			mindMapContent = JSON.stringify(mapJson, null, 2)
		} else {
			mindMapContent = '{}'
		}

		return true
	} catch (error) {
		console.error(error)
		return false
	}
}

/**
 * Отправка сообщения и обработка Tool Calls (вызовов функций) для RAG на клиенте
 */
export async function sendExamMessage(userMessage = '') {
	const apiKey = getApiKey()
	const provider = getProvider()
	const config = PROVIDERS[provider]

	if (!apiKey || !config) {
		throw new Error('Настройте провайдера и укажите API-ключ в настройках.')
	}

	// Берем выбранную пользователем модель или дефолтную для этого провайдера
	const activeModel = getSelectedModel() || config.defaultModel

	let systemInstruction = ''

	if (activeMode === 'consultation') {
		systemInstruction = `Ты — дружелюбный технический ментор и напарник по веб-разработке. Твоя задача — помочь студенту подробно разобраться в материале статьи, ответить на любые его вопросы, объяснить сложные концепции простыми словами и привести практические примеры кода. Ты не тестируешь его, а обучаешь и разъясняешь тему.

МАТЕРИАЛ ТЕКУЩЕЙ СТАТЬИ ДЛЯ ИЗУЧЕНИЯ:
---
${activeArticleContent}
---

КАРТА СМЕЖНЫХ ЗНАНИЙ (ДРУГИЕ СТАТЬИ УЧЕБНИКА):
Если студент спросит о смежных темах или тебе понадобятся полные подробности по любой смежной теме, ты можешь загрузить текст соответствующей статьи с помощью вызова встроенной функции-инструмента "get_article_content".
Вот краткое содержание всех остальных разделов:
${mindMapContent}

ПРАВИЛА ОБЩЕНИЯ:
1. В самом первом сообщении (когда метод вызывается без реплики пользователя) поприветствуй студента, кратко опиши основную суть текущей статьи и предложи задать любые интересующие его вопросы по ней. Не начинай тест и не задавай экзаменационные вопросы.
2. Отвечай подробно, вежливо, приводи понятные примеры. Ссылайся на материал статьи, когда это уместно.
3. Если студент в процессе общения решит, что хочет проверить свои знания, или если он попросит устроить ему небольшой опрос — проведи краткий тест прямо в чате.`
	} else {
		let questionCountRule = ''
		if (activeQuestionsCount === 'auto') {
			questionCountRule = `Ты самостоятельно подбираешь оптимальное количество вопросов на основе длины и сложности статьи (обычно от 4 до 7 вопросов, не слишком мало и не слишком много). В первом сообщении обязательно сообщи студенту, сколько вопросов ты решил задать для этой темы, и сразу задай только первый вопрос.`
		} else {
			questionCountRule = `Задай ровно ${activeQuestionsCount} открытых вопросов по теме поочередно.`
		}

		systemInstruction = `Ты — профессиональный технический интервьюер и наставник по веб-разработке. Твоя задача — провести интерактивный устный экзамен для студента на основе следующего материала статьи:

---
${activeArticleContent}
---

КАРТА СМЕЖНЫХ ЗНАНИЙ (ДРУГИЕ СТАТЬИ УЧЕБНИКА):
Если в процессе устного экзамена тебе понадобятся полные подробности по любой смежной теме, ты можешь загрузить текст соответствующей статьи с помощью вызова встроенной функции-инструмента "get_article_content".
Вот краткое содержание всех остальных разделов:
${mindMapContent}

ПРАВИЛА И СЦЕНАРИЙ ЭКЗАМЕНА:
1. ${questionCountRule} Вопросы не должны содержать вариантов ответов. Студент должен отвечать своими словами.
2. В самом первом сообщении (когда метод вызывается без реплики пользователя) поприветствуй студента, объяви тему экзамена, укажи общее количество вопросов и задай ТОЛЬКО ПЕРВЫЙ вопрос. Не пиши никакого лишнего текста.
3. Когда студент отвечает на вопрос:
   - Подробно проанализируй его ответ, сопоставив с материалом статьи.
   - Дай честную конструктивную оценку: укажи, что верно, какие важные детали упущены или перепутаны. Исправь его, если допущена ошибка.
   - Сразу после оценки задай следующий вопрос.
4. Если студент в своем ответе ссылается на смежную концепцию и тебе требуется уточнить детали — вызови инструмент "get_article_content". Получив текст смежной статьи, интегрируй его в свой анализ, но удерживай студента на основной теме текущего экзамена.
5. После ответа на последний вопрос: оцени его, сделай краткое резюме по результатам всего экзамена (какие концепции усвоены отлично, а по каким стоит перечитать статью) и тепло заверши сессию.

КРИТИЧЕСКИ ВАЖНОЕ ПРАВИЛО:
Задавай строго ОДИН вопрос за одну реплику. Никогда не пиши два вопроса сразу. Жди ответа пользователя перед переходом к следующему вопросу.`
	}

	const tools = [
		{
			type: 'function',
			function: {
				name: 'get_article_content',
				description:
					'Загрузить полный текст смежной статьи по её категории и названию для уточнения технических деталей.',
				parameters: {
					type: 'object',
					properties: {
						category: {
							type: 'string',
							enum: ['js', 'angular'],
							description: 'Категория запрашиваемой статьи.',
						},
						articleName: {
							type: 'string',
							description:
								"Точное название статьи из карты смежных знаний, например: '10. Внедрение зависимостей и сервисы (DI)'",
						},
					},
					required: ['category', 'articleName'],
				},
			},
		},
	]

	const messages = [{ role: 'system', content: systemInstruction }]

	if (examHistory.length > 0) {
		messages.push(...examHistory)
	}

	if (userMessage) {
		messages.push({ role: 'user', content: userMessage })
	}

	const response = await fetch(`${config.baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: activeModel,
			messages: messages,
			temperature: 0.7,
			tools: tools,
		}),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(
			errorData.error?.message ||
				'Произошла ошибка при отправке запроса к API выбранного ИИ.',
		)
	}

	const responseData = await response.json()
	const choice = responseData.choices[0]
	const responseMessage = choice.message

	if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
		if (userMessage) {
			examHistory.push({ role: 'user', content: userMessage })
		}
		examHistory.push(responseMessage)

		for (const toolCall of responseMessage.tool_calls) {
			const args = JSON.parse(toolCall.function.arguments)
			const articleText = await loadTargetArticleText(
				args.category,
				args.articleName,
			)

			examHistory.push({
				role: 'tool',
				tool_call_id: toolCall.id,
				name: toolCall.function.name,
				content: articleText,
			})
		}

		return await sendExamMessage()
	}

	const reply = responseMessage.content

	if (userMessage) {
		examHistory.push({ role: 'user', content: userMessage })
	}
	examHistory.push({ role: 'assistant', content: reply })

	return reply
}
