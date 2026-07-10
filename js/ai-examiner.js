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
let assistantStyle = 'summary' // 'summary' или 'detailed'

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

export function setAssistantParams(style) {
	assistantStyle = style
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
async function loadTargetArticleText(category, subcategory, articleName) {
	try {
		const response = await fetch(
			`./articles/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}/${encodeURIComponent(articleName)}.md`,
		)
		if (!response.ok) {
			return `[Ошибка: Статья "${articleName}" в категории "${category}/${subcategory}" не найдена в репозитории]`
		}
		return await response.text()
	} catch (error) {
		return `[Ошибка загрузки статьи: ${error.message}]`
	}
}

/**
 * Подготовка материалов перед диалогом
 */
export async function prepareExam(category, subcategory, articleName) {
	clearExamHistory()
	try {
		// 1. Загружаем текст текущей статьи
		const response = await fetch(
			`./articles/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}/${encodeURIComponent(articleName)}.md`,
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

	let styleRule = ''
	if (assistantStyle === 'summary') {
		styleRule = `Отвечай максимально емко, кратко и структурировано. Формируй краткие тезисы, используй списки (bullet points), выделяй ключевые концепции жирным шрифтом и избегай длинных рассуждений.`
	} else {
		styleRule = `Отвечай подробно, развернуто и с глубоким погружением в тему. Приводи примеры кода на TypeScript/Angular, подробно комментируй логику каждой строки и описывай потенциальные подводные камни.`
	}

	const systemInstruction = `Ты — умный Фронтенд-Библиотекарь и Навигатор по базе знаний веб-разработчика. Твоя цель — помогать пользователю находить нужную информацию в материалах, объяснять сложные термины, давать структурированные выжимки лекций и направлять по разделам.

МАТЕРИАЛ ТЕКУЩЕЙ ОТКРЫТОЙ СТАТЬИ:
---
${activeArticleContent}
---

КАРТА ВСЕХ ОСТАЛЬНЫХ СТАТЕЙ В БАЗЕ ЗНАНИЙ (С КРАТКИМИ ОПИСАНИЯМИ):
---
${mindMapContent}
---

ПРАВИЛА И СЦЕНАРИЙ РАБОТЫ:
1. Ты НИКОГДА не устраиваешь экзамены, тесты или опросы. Твоя роль — сугубо справочная, поддерживающая и разъясняющая.
2. Стиль твоих ответов: ${styleRule}
3. Если пользователь просит найти информацию по теме, которой нет в текущей статье, обратись к Карте остальных статей. Если ты найдешь нужную статью в карте, ты можешь загрузить её полный текст с помощью функции-инструмента "get_article_content".
4. Если пользователь просит сравнить концепции из разных статей или хочет узнать подробности о другой теме — ОБЯЗАТЕЛЬНО вызови инструмент "get_article_content" для получения полной лекции, и только потом давай развернутый или сжатый ответ на основе её текста. Не придумывай детали от себя, если можешь загрузить точный материал лекции.
5. В самом первом сообщении (когда метод вызывается без реплики пользователя):
   - Поприветствуй пользователя как дружелюбный библиотекарь базы знаний.
   - Сделай очень краткий и структурированный обзор текущей статьи (её суть и ключевые тезисы).
   - Подскажи, по каким ещё смежным темам из Карты ты можешь его сориентировать, и предложи задать любой вопрос.`

	const tools = [
		{
			type: 'function',
			function: {
				name: 'get_article_content',
				description:
					'Загрузить полный текст смежной статьи по её категории, подкатегории и названию для точного ответа.',
				parameters: {
					type: 'object',
					properties: {
						category: {
							type: 'string',
							description:
								'Категория запрашиваемой статьи в нижнем регистре (например: "основы javascript", "типизация typescript", "внедрение зависимостей" и т.д.).',
						},
						subcategory: {
							type: 'string',
							description:
								'Подкатегория запрашиваемой статьи (например: "Память и области видимости", "HttpClient", "Сигналы").',
						},
						articleName: {
							type: 'string',
							description:
								"Точное название статьи из карты смежных знаний, например: 'Инициализация переменных (let, const, TDZ)'",
						},
					},
					required: ['category', 'subcategory', 'articleName'],
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
			temperature: 0.5,
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
				args.subcategory,
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
