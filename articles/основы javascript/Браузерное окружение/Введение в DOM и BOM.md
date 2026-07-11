---
tags: [js, основы-javascript, браузерное-окружение]
related: ["[[События и их обработка в DOM]]", "[[Работа с формами и валидация]]", "[[Хранение данных в браузере]]"]
status: "completed"
---

# Введение в DOM и BOM

## БЫСТРЫЙ СТАРТ

*   **DOM (Document Object Model)** — это объектное представление HTML-документа в виде древовидной структуры, позволяющее JavaScript динамически изменять любые элементы, их атрибуты и стили.
*   **BOM (Browser Object Model)** — это объектная модель браузера, предоставляющая программный интерфейс для взаимодействия с вкладкой, историей навигации, экраном пользователя и операционной системой через объект `window`.
*   **Глобальный объект `window`** — центральный объект в браузере, выступающий одновременно точкой входа в BOM, контейнером для DOM (`window.document`) и глобальным контекстом исполнения JavaScript.
*   **Правило использования:** Применяйте DOM для точечного изменения интерфейса и обеспечения интерактивности страницы; применяйте BOM для анализа окружения (сеть, геопозиция) и управления навигацией (изменение URL, история переходов).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Безопасный поиск и групповое изменение DOM-элементов
*   **Назначение:** Нахождение группы элементов по CSS-селектору, безопасное обновление их текстового содержимого и переключение стилей классов без риска XSS-атак.

```typescript
export interface StyleConfig {
  activeClass: string;
  disabledClass: string;
}

export function updateContainerElements(selector: string, config: StyleConfig): void {
  // Находим все элементы, соответствующие селектору. Возвращается статическая коллекция NodeList.
  const elements: NodeListOf<HTMLElement> = document.querySelectorAll(selector);

  if (elements.length === 0) {
    console.warn(`[DOM WARNING] Элементы по селектору "${selector}" не найдены.`);
    return;
  }

  // NodeList поддерживает нативный метод forEach для безопасного перебора
  elements.forEach((element: HTMLElement): void => {
    // Безопасно изменяем текст. Любые HTML-теги внутри строки будут выведены буквально (защита от XSS)
    element.textContent = "Контент успешно обновлен.";

    // Используем classList для безопасного управления классами элемента
    if (element.classList.contains(config.disabledClass)) {
      element.classList.remove(config.disabledClass);
    }
    
    element.classList.add(config.activeClass);
  });
}
```

---

### Шаблон 2: Безопасная навигация и парсинг параметров URL через BOM
*   **Назначение:** Чтение параметров запроса (Query Params) из текущего адреса и выполнение перехода на новую страницу с сохранением истории переходов.

```typescript
export interface NavigationPayload {
  targetRoute: string;
  sourceAnchor: string;
}

export function parseAndNavigate(payload: NavigationPayload): void {
  // 1. Используем location для чтения текущего URL-адреса
  const currentSearch: string = window.location.search;

  // Безопасно парсим query-параметры с помощью встроенного API URLSearchParams
  const queryParams = new URLSearchParams(currentSearch);
  const userToken: string | null = queryParams.get("token");

  if (!userToken) {
    console.error("[BOM ERROR] Авторизационный токен в URL отсутствует.");
    return;
  }

  // Формируем новый адрес, объединяя параметры
  const finalUrl = `${payload.targetRoute}?ref=${payload.sourceAnchor}&token=${userToken}`;

  // 2. Выполняем переход с сохранением записи в истории браузера (history)
  // Пользователь сможет вернуться на предыдущую страницу по кнопке "Назад"
  window.location.assign(finalUrl);
}
```

---

### Шаблон 3: Мониторинг состояния сети и системных возможностей через `navigator`
*   **Назначение:** Отслеживание статуса подключения к интернету и копирование текстовых данных в системный буфер обмена.

```typescript
export interface SystemStatusOutput {
  isOnline: boolean;
  languageCode: string;
}

export function checkSystemStatus(): SystemStatusOutput {
  // Получаем данные о состоянии сети и локали из объекта navigator
  return {
    isOnline: window.navigator.onLine,
    languageCode: window.navigator.language
  };
}

export async function copyToClipboard(textToCopy: string): Promise<boolean> {
  // Проверяем доступность Clipboard API в текущем браузере
  if (!window.navigator.clipboard) {
    console.error("[BOM ERROR] Clipboard API не поддерживается данным браузером.");
    return false;
  }

  try {
    // Асинхронно записываем данные в буфер обмена операционной системы
    await window.navigator.clipboard.writeText(textToCopy);
    return true;
  } catch (error) {
    console.error("[BOM ERROR] Не удалось скопировать текст: ", error);
    return false;
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Глобальный контекст `window` и его жизненный цикл в V8
В браузерной среде глобальный объект `window` выступает контейнером верхнего уровня (Global Object). Любая переменная или функция, объявленная на верхнем уровне видимости (без использования `let`/`const` или модульной структуры ES6), автоматически записывается в свойства `window`.

Когда движок V8 компилирует контекст выполнения:
1.  Создается объект `window`. Внутренний слот `[ [Prototype] ]` объекта `window` указывает на `Window.prototype`, который, в свою очередь, наследует от `EventTarget`. Это означает, что само окно браузера может слушать и генерировать события (например, изменение размера `resize` или прокрутку `scroll`).
2.  Объект `window` содержит циклическую ссылку на самого себя через свойство `window.window`. Это сделано для удобства обращения к глобальным свойствам из любого вложенного контекста.
3.  При очистке памяти сборщик мусора V8 никогда не удаляет объект `window` до тех пор, пока активна текущая вкладка. Однако все динамические свойства, записанные на него в процессе работы, могут удерживать тяжелые объекты в куче, если они не были вовремя обнулены, что приводит к утечкам памяти.

### 2. Архитектура DOM-дерева: Наследование классов DOM-узлов
Каждый элемент в DOM-дереве — это не просто абстрактный HTML-тег, а экземпляр сложной цепочки прототипного наследования. Ниже представлена иерархия классов, которую проходит стандартный элемент, например, кнопка `<button>`:

```text
         [ EventTarget ] (Базовый класс, позволяющий вешать события через addEventListener)
                ▲
                │
            [ Node ]     (Определяет свойства древовидной структуры: parentNode, childNodes)
                ▲
                │
           [ Element ]   (Добавляет работу с атрибутами, классами и querySelector)
                ▲
                │
         [ HTMLElement ] (Добавляет инлайн-стили style, свойства textContent и innerHTML)
                ▲
                │
    [ HTMLButtonElement ] (Реализует специфичное API кнопки: свойства disabled, type, form)
```

Благодаря этой иерархии любой HTML-элемент автоматически наследует методы работы с событиями от `EventTarget` и методы навигации по дереву от `Node`.

### 3. Схема взаимосвязи моделей в браузерном окружении

```text
                             Глобальный объект window (BOM)
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
   Объект document (DOM)            Объекты окружения (BOM)         Методы JS (Core ES)
         │                                 │                                 │
 [ HTML-документ ]                 - navigator                       - setTimeout()
 ├── <head>                        - location                        - Promise
 └── <body>                        - history                         - Object, Array
      ├── <header>                 - screen                          - Symbol
      └── <main>
```

### 4. Детальный пошаговый разбор выполнения шаблона 1
Разберем выполнение вызова `updateContainerElements(".card", config)`:
1.  **Поиск элементов:** Вызывается `document.querySelectorAll(".card")`. Движок браузера сканирует DOM-дерево сверху вниз, находит все элементы с соответствующим классом и упаковывает ссылки на них в статический список `NodeList`. Если элементы не найдены, возвращается пустой `NodeList` длиной `0`.
2.  **Запуск цикла:** Начинается выполнение метода `elements.forEach(...)`.
3.  **Безопасная запись текста:** Для первого найденного элемента выполняется инструкция `element.textContent = "Контент успешно обновлен"`. Движок JS удаляет все вложенные дочерние узлы элемента и создает один текстовый узел. Символы `<`, `>` экранируются автоматически на уровне движка, превращаясь в безопасные HTML-сущности (`&lt;`, `&gt;`).
4.  **Изменение классов:** Вызывается `element.classList.add(config.activeClass)`. Браузер точечно обновляет строку атрибута `class` у DOM-элемента и планирует задачу перерисовки интерфейса (Repaint) в Render Queue.

### 5. Типичные ошибки и их решение

*   **Ошибка 1: Обращение к DOM-элементам до завершения парсинга HTML**
    *   *Проблема:* Скрипт, подключенный в начале документа (внутри `<head>`), падает с ошибкой `TypeError: Cannot read properties of null (reading 'addEventListener')`.
    *   *Причина:* Когда браузер доходит до выполнения скрипта, HTML-код под ним (внутри `<body>`) еще не распарсен и физически не существует в DOM-дереве. Метод `document.querySelector` возвращает `null`.
    *   *Решение:* Используйте атрибут `defer` при подключении внешних скриптов (это заставит браузер выполнить их строго после сборки DOM), либо оборачивайте инициализирующий код в событие `DOMContentLoaded`.

```typescript
// ПЛОХО (код в head упадет, так как кнопка еще не создана)
const btn = document.querySelector("#submit");
btn.addEventListener("click", () => {});

// ХОРОШО (ожидание готовности DOM-дерева)
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#submit");
  if (btn) btn.addEventListener("click", () => {});
});
```

*   **Ошибка 2: Использование `innerHTML` для вставки динамических данных пользователя**
    *   *Проблема:* Уязвимость к XSS-атакам (Cross-Site Scripting). Злоумышленник может передать вредоносный скрипт в качестве имени пользователя, и он выполнится в браузере других клиентов.
    *   *Причина:* Свойство `innerHTML` парсит переданную строку как полноценный HTML-код. Если в строке содержится тег `<script>` или атрибуты событий (например, `<img src="x" onerror="alert(1)">`), браузер выполнит этот код.
    *   *Решение:* При вставке сырого пользовательского текста всегда используйте исключительно свойство `textContent`. Оно автоматически экранирует любые спецсимволы и выведет их как безопасную строку.

```typescript
const userInput = "<img src='x' onerror='alert(\"взлом!\")'>";

// ПЛОХО (выполнит XSS-скрипт)
container.innerHTML = userInput; 

// ХОРОШО (безопасный вывод строки на экран)
container.textContent = userInput;
```

*   **Ошибка 3: Модификация DOM внутри циклов по "живым" (Live) коллекциям**
    *   *Проблема:* Бесконечные циклы, зависание вкладки браузера или пропуск элементов при обходе.
    *   *Причина:* Старые методы поиска (такие как `getElementsByClassName` или `getElementsByTagName`) возвращают "живые" коллекции `HTMLCollection`. Если вы в цикле добавляете или удаляете элементы с этим классом, коллекция моментально изменяет свой размер и индексы прямо во время итерации.
    *   *Решение:* Используйте современный `querySelectorAll`, который возвращает статическую (не изменяемую автоматически) коллекцию `NodeList`, либо принудительно преобразуйте "живую" коллекцию в классический массив перед циклом через `Array.from()`.

```typescript
// ПЛОХО (живая коллекция будет бесконечно расти, вешая браузер)
const items = document.getElementsByClassName("item");
for (let i = 0; i < items.length; i++) {
  const newEl = document.createElement("div");
  newEl.classList.add("item");
  document.body.appendChild(newEl); // items.length увеличивается!
}

// ХОРОШО (статический снимок данных не реагирует на добавление новых элементов)
const staticItems = document.querySelectorAll(".item");
staticItems.forEach((item) => {
  const newEl = document.createElement("div");
  newEl.classList.add("item");
  document.body.appendChild(newEl);
});
```