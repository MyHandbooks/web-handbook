---
tags: [js, основы-javascript, async, promises]
related: ["[[Асинхронность async-await и обработка try-catch]]", "[[Параллельное выполнение через Promise.allSettled]]", "[[Очередность выполнения задач (Event Loop)]]"]
status: "completed"
---

# Промисы и методы Promise

## БЫСТРЫЙ СТАРТ

*   **Объект `Promise` (Обещание)** — это специальный встроенный объект JavaScript, представляющий собой контейнер для значения (или ошибки) асинхронной операции, которое станет доступным в будущем.
*   **Исполнитель (Executor)** — функция, передаваемая в конструктор `new Promise((resolve, reject) => { ... })`. Выполняется синхронно и немедленно в момент создания промиса.
*   **Инкапсулированное состояние** — промис всегда находится в одном из трех взаимоисключающих состояний: `pending` (ожидание), `fulfilled` (выполнено успешно) или `rejected` (выполнено со сбоем). Состояние меняется ровно один раз.
*   **Используйте для:**
    *   Обертывания (промисификации) старых низкоуровневых асинхронных API, основанных на колбэках (например, файловых операций, таймеров, старых библиотек).
    *   Параллельного или конкурентного оркестрирования множества независимых асинхронных процессов.
*   **Не используйте для:**
    *   Сценариев с бесконечными периодическими потоками событий, например кликами мыши или входящими веб-сокетами (для этого лучше применять события DOM или RxJS `Observable`).
    *   Синхронных вычислений, не требующих отложенного выполнения.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Обертывание callback-функции в Promise (Промисификация)
*   **Назначение:** Преобразование устаревшего асинхронного API с колбэками в чистый современный Promise-интерфейс.

```typescript
export interface GeolocationCoords {
  latitude: number;
  longitude: number;
}

// Обертываем стандартное браузерное API геолокации в Promise
export function getCurrentCoordinates(): Promise<GeolocationCoords> {
  return new Promise((resolve, reject) => {
    // Проверяем доступность API в браузере
    if (!navigator.geolocation) {
      reject(new Error("Геолокация не поддерживается данным браузером."));
      return;
    }

    // Вызываем асинхронный метод с передачей успешного и ошибочного колбэков
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Успешный колбэк: переводим промис в состояние fulfilled
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        // Коллбэк ошибки: переводим промис в состояние rejected с объектом Error
        reject(new Error(`Ошибка геолокации: ${error.message}`));
      }
    );
  });
}
```

---

### Шаблон 2: Оркестрирование параллельных вызовов через Promise.all
*   **Назначение:** Одновременный запуск нескольких независимых запросов с получением агрегированного результата в виде единого массива.

```typescript
export interface ServiceStatus {
  serviceName: string;
  online: boolean;
}

function checkDatabaseStatus(): Promise<ServiceStatus> {
  return Promise.resolve({ serviceName: "Database", online: true });
}

function checkCacheStatus(): Promise<ServiceStatus> {
  return Promise.resolve({ serviceName: "RedisCache", online: true });
}

export function checkSystemHealth(): Promise<ServiceStatus[]> {
  // Запускаем оба процесса параллельно в фоновом режиме
  const dbPromise = checkDatabaseStatus();
  const cachePromise = checkCacheStatus();

  // Promise.all ждет выполнения всех промисов. 
  // Если хотя бы один упадет, весь метод немедленно прервется со сбоем (fail-fast)
  return Promise.all([dbPromise, cachePromise])
    .then((results: ServiceStatus[]) => {
      console.log("Все системы успешно проверены.");
      return results;
    })
    .catch((error: unknown) => {
      console.error("Ошибка при проверке компонентов системы:", error);
      throw error;
    });
}
```

---

### Шаблон 3: Реализация таймаута для асинхронной операции
*   **Назначение:** Принудительное прерывание слишком долгого сетевого запроса с генерацией ошибки по истечении лимита времени.

```typescript
export function fetchWithTimeout<T>(requestPromise: Promise<T>, timeoutMs: number): Promise<T> {
  // Создаем промис-таймаут, который гарантированно отклонится через N миллисекунд
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timerId = window.setTimeout(() => {
      window.clearTimeout(timerId);
      reject(new Error(`[ТАЙМАУТ] Превышено время ожидания операции (${timeoutMs} мс)`));
    }, timeoutMs);
  });

  // Promise.race возвращает результат самого быстрого из переданных промисов.
  // Если запрос выполнится быстрее таймаута — вернется результат, иначе сработает ошибка.
  return Promise.race([requestPromise, timeoutPromise]);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Анатомия объекта Promise во внутренностях движка
На уровне спецификации ECMAScript и движка V8 объект `Promise` не является простой оберткой. Он содержит строго регламентированные скрытые системные слоты (Internal Slots):

*   `[ [PromiseState] ]` — текущее состояние промиса (`"pending"`, `"fulfilled"`, `"rejected"`).
*   `[ [PromiseResult] ]` — результат работы промиса. Изначально равен `undefined`, затем изменяется на переданный `value` или `error`.
*   `[ [PromiseFulfillReactions] ]` — внутренний массив реакций (коллбэков из `.then()`), которые должны быть запущены при успешном переходе промиса в состояние `fulfilled`.
*   `[ [PromiseRejectReactions] ]` — внутренний массив реакций (коллбэков из `.catch()`), запускаемых при переходе в состояние `rejected`.

**Физика однократности изменения состояния:**
Когда вы вызываете `resolve(value)` или `reject(error)`, движок проверяет слот `[ [PromiseState] ]`. Если он равен `"pending"`, движок записывает результат в `[ [PromiseResult] ]`, меняет `[ [PromiseState] ]` на новое состояние и переносит все накопленные коллбэки из соответствующего массива реакций в Очередь микрозадач. Если состояние уже не `"pending"`, вызовы `resolve`/`reject` мгновенно и безмолвно игнорируются.

### 2. Спецификация выполнения: Promise и микрозадачи (Microtask Queue)
Методы `.then()`, `.catch()` и `.finally()` не выполняются синхронно, даже если промис уже успешно разрешен в памяти. Их обработчики всегда упаковываются во внутренние системные сущности и отправляются в **Очередь микрозадач (Microtask Queue / PromiseJobs)**.

Приоритет выполнения микрозадач:
1.  Сначала выполняется весь текущий синхронный код в Call Stack.
2.  Когда Call Stack пустеет, Event Loop переключается на Очередь микрозадач.
3.  Очередь микрозадач вычищается **полностью до последнего элемента** перед тем, как браузер сможет выполнить очередную макрозадачу (например, `setTimeout` или событие клика) или перейти к фазе рендеринга страницы (отрисовке интерфейса).

### 3. Детальный пошаговый разбор выполнения шаблона 1
1.  **Создание и запуск Executor:** Вызывается функция `getCurrentCoordinates()`. Внутри создается `new Promise`. Переданная функция-исполнитель `(resolve, reject) => { ... }` выполняется **синхронно**. Слот `[ [PromiseState] ]` устанавливается в `"pending"`.
2.  **Запуск фоновой операции:** Движок регистрирует асинхронный запрос геолокации в Web APIs и выходит из функции `getCurrentCoordinates`. Call Stack пуст.
3.  **Получение координат (Web APIs):** Спустя время датчик устройства возвращает координаты. Браузер выталкивает колбэк успеха `(position) => { ... }` в очередь макрозадач.
4.  **Смена состояния:** Event Loop перемещает колбэк в Call Stack. Выполняется инструкция `resolve({ latitude, longitude })`.
    *   Движок меняет `[ [PromiseState] ]` промиса на `"fulfilled"`.
    *   Записывает полученный объект координат в `[ [PromiseResult] ]`.
5.  **Планирование микрозадачи:** Все колбэки из внутреннего слота `[ [PromiseFulfillReactions] ]` (которые были зарегистрированы при вызове метода `.then()`) упаковываются в микрозадачи и отправляются в Microtask Queue.
6.  **Выполнение реакции:** Event Loop вычищает Microtask Queue, перемещая колбэк `.then()` в Call Stack, где данные выводятся на экран или передаются дальше по приложению.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Необработанное отклонение промиса (Unhandled Promise Rejection)**
    *   *Проблема:* Промис завершается ошибкой (reject), но на нем не был вызван метод `.catch()`. В консоли появляется критическая системная ошибка `Uncaught (in promise)`. В Node.js это может привести к аварийному завершению процесса.
    *   *Причина:* Отсутствие зарегистрированного обработчика в скрытом слоте `[ [PromiseRejectReactions] ]`.
    *   *Решение:* Всегда завершайте цепочки промисов вызовом метода `.catch()` или перехватывайте ошибки внешними блоками `try/catch` при использовании `async/await`.

```typescript
// ПЛОХО (Ошибка reject останется не пойманной в системе)
export function loadDataUnsafe() {
  const request = Promise.reject(new Error("Сбой авторизации"));
  request.then(data => console.log(data)); // ! Критическая ошибка Unhandled Rejection
}

// ХОРОШО (Надежный перехват ошибок на конце цепочки)
export function loadDataSafe() {
  const request = Promise.reject(new Error("Сбой авторизации"));
  request
    .then(data => console.log(data))
    .catch(error => {
      console.error(`Ошибка успешно перехвачена: ${error.message}`);
    });
}
```

*   **Ошибка 2: Ловушка бесконечного ожидания (Infinite Pending Promise)**
    *   *Проблема:* Промис создается, но его цепочка `.then()` никогда не выполняется, а приложение зависает в состоянии загрузки.
    *   *Причина:* Разработчик описал сложную логику ветвления внутри исполнителя (executor), но забыл вызвать `resolve` или `reject` в одной из логических веток (например, при ошибках или исключениях). Промис навсегда «застревает» в состоянии `pending`.
    *   *Решение:* Гарантируйте, что при любом исходе выполнения исполнителя (включая прохождение всех блоков `if/else` и перехват ошибок) в коде будет вызван либо `resolve`, либо `reject`.

```typescript
// ПЛОХО (Если произойдет сбой в legacyApi, промис навсегда зависнет в pending)
export function fetchDataUnsafe(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // @ts-ignore
      legacyApi.fetch((err, res) => {
        if (!err) resolve(res);
        // Забыли прописать ветку else с вызовом reject(err)
      });
    } catch (e) {
      // Исключение не перехватывается и не вызывает reject
    }
  });
}

// ХОРОШО (Любая ветка гарантированно завершает жизненный цикл промиса)
export function fetchDataSafe(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // @ts-ignore
      legacyApi.fetch((err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Неизвестный сбой"));
    }
  });
}
```

*   **Ошибка 3: Создание лишней обертки над уже существующими промисами (Promise Nesting)**
    *   *Проблема:* Разработчик оборачивает вызов функции, которая *уже* возвращает промис, в еще один ручной `new Promise`, создавая избыточную вложенность (бойлерплейт).
    *   *Причина:* Непонимание того, что методы `.then()` и `.catch()` автоматически возвращают новые промисы.
    *   *Решение:* Возвращайте существующий промис напрямую, без конструирования лишних оберток.

```typescript
// ПЛОХО (Избыточное конструирование обертки, усложняющее код)
export function getUserDetailsUnsafe(id: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // Метод fetch() уже возвращает Promise! Обертка не нужна
    fetch(`/api/users/${id}`)
      .then(res => res.json())
      .then(data => resolve(data))
      .catch(err => reject(err));
  });
}

// ХОРОШО (Чистая плоская передача существующего промиса по цепочке)
export function getUserDetailsSafe(id: string): Promise<any> {
  return fetch(`/api/users/${id}`)
    .then(res => res.json()); // Автоматически возвращает новый промис с результатом json
}
```