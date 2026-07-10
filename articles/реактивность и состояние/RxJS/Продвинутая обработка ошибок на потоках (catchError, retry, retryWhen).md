---
tags: [angular, RxJS, архитектура]
related: ["[[POST-запрос с отправкой файлов (FormData).md]]", "[[Преобразования RxJS потоков (switchMap, concatMap).md]]"]
status: "completed"
---

# Продвинутая обработка ошибок на потоках (catchError, retry, retryWhen)

## БЫСТРЫЙ СТАРТ

*   **Терминальная природа ошибок:** По спецификации RxJS, сигнал ошибки (`error`) является финальным событием потока [1.1.7]. Как только поток сгенерировал ошибку, он **навсегда умирает** — подписка аннулируется, и поток больше не может испустить ни одного значения [1.1.7].
*   **Два ключевых оператора:**
    *   `catchError(callback)` — перехватывает сигнал ошибки и позволяет "погасить" её, вернув новый резервный поток (например, `of(fallbackValue)`), либо пробросить отформатированную ошибку дальше через `throwError` [1.1.7].
    *   `retry({ count, delay })` — при возникновении сбоя автоматически отписывается от упавшего источника и осуществляет повторную подписку (*re-subscribe*), заставляя запустить асинхронную операцию заново [1.1.7].
*   **Важная деградация (Deprecation):** Классический оператор `retryWhen` официально признан **устаревшим** в RxJS 7/8 [1.1.7]. Вместо него настоятельно рекомендуется использовать унифицированную конфигурацию оператора `retry({ delay: (error, count) => Observable })` [1.1.7].
*   **Используйте для:** изоляции ошибок внутри вложенных сетевых потоков (чтобы сбой одного запроса не ломал главную поисковую строку) и построения умных стратегий повторов (Exponential Backoff) [1.1.7].
*   **Не используйте:** для простых синхронных проверок валидации (для этого достаточно стандартного `filter` или JS-инструкции `throw` внутри `map`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Изоляция сетевой ошибки во вложенном потоке (Inner Stream Recovery)
*   **Назначение:** Реализация поисковой строки, которая продолжает стабильно функционировать и принимать ввод пользователя, даже если один из сетевых запросов завершился ошибкой `500` [1.1.7].

#### 1. Файл логики: `safe-search.ts`
```typescript
import { Component, inject, OnInit, signal, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap } from 'rxjs/operators';

export interface SearchResult {
  readonly id: string;
  readonly name: string;
}

@Component({
  selector: 'app-safe-search',
  imports: [
    ReactiveFormsModule // Импортируем только точечный модуль для работы с Reactive Forms
  ],
  templateUrl: './safe-search.html',
  styleUrl: './safe-search.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SafeSearch implements OnInit { // Класс очищен от суффикса Component
  private readonly http = inject(HttpClient); // Внедряем HttpClient через inject()
  private readonly destroyRef = inject(DestroyRef); // Извлекаем ссылку на контекст уничтожения

  // Декларативно объявляем контрол формы
  public readonly searchControl = new FormControl<string>('', { nonNullable: true });
  // Реактивный сигнал для рендеринга списка
  public readonly results = signal<SearchResult[]>([]);
  // Сигнал состояния загрузки
  public readonly isSearching = signal<boolean>(false);

  public ngOnInit(): void {
    // Слушаем поток изменений ввода пользователя
    this.searchControl.valueChanges.pipe(
      debounceTime(300), // Подавляем дребезг ввода (задержка 300мс)
      distinctUntilChanged(), // Игнорируем дублирующие значения
      tap(() => this.isSearching.set(true)), // Включаем спиннер перед началом запроса
      switchMap((term: string): Observable<SearchResult[]> => {
        const url = `https://api.enterprise-service.com/v1/search?q=${term}`;
        
        // Возвращаем внутренний поток сетевого запроса
        return this.http.get<SearchResult[]>(url).pipe(
          // КРИТИЧЕСКИ ВАЖНО: catchError размещается строго ВНУТРИ switchMap.
          // Если сетевой запрос упадет, catchError погасит ошибку, вернет пустой массив [].
          // Внутренний поток успешно завершится, но ВНЕШНИЙ поток valueChanges останется жив!
          catchError((err: Error) => {
            console.error('[Search] Сбой сетевого запроса, гасим ошибку:', err.message);
            return of([]); // Возвращаем безопасный пустой массив
          })
        );
      }),
      tap(() => this.isSearching.set(false)), // Выключаем спиннер по завершении
      takeUntilDestroyed(this.destroyRef) // Декларативно отписываемся при уничтожении компонента
    ).subscribe({
      next: (data) => this.results.set(data), // Записываем результаты в сигнал
      error: (err) => console.error('[UI] Критическая смерть главного потока ввода!', err)
    });
  }
}
```

#### 2. Файл разметки: `safe-search.html`
```html
<div class="search-card">
  <div class="input-wrapper">
    <input type="text" [formControl]="searchControl" placeholder="Поиск ресурсов..." class="theme-input" />
    @if (isSearching()) {
      <span class="loader">⌛</span>
    }
  </div>

  <ul class="results">
    @for (item of results(); track item.id) {
      <li>{{ item.name }}</li>
    } @empty {
      @if (searchControl.value && !isSearching()) {
        <li>Ничего не найдено</li>
      }
    }
  </ul>
</div>
```

#### 3. Файл стилей: `safe-search.css`
```css
.search-card {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}
.results {
  margin-top: 12px;
  padding-left: 20px;
}
```

---

### Шаблон 2: Экспоненциальный повтор запросов на современном `retry()` (RxJS 7+)
*   **Назначение:** Описание умного повтора сетевых запросов при временной потере связи с прогрессирующим интервалом ожидания и блокировкой повторов для заведомо ложных статусов (401, 404) [1.1.7].

#### 1. Файл службы: `resilient-data.service.ts`
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, timer, throwError } from 'rxjs';
import { retry, catchError } from 'rxjs/operators';

export interface TargetDataPayload {
  readonly id: string;
  readonly payloadContent: string;
}

@Injectable({
  providedIn: 'root'
})
export class ResilientDataService {
  private readonly http = inject(HttpClient); // Внедряем HttpClient через inject()
  private readonly endpoint = 'https://api.unstable-cloud-service.com/v1/data';

  public fetchResilientData(): Observable<TargetDataPayload> {
    return this.http.get<TargetDataPayload>(this.endpoint).pipe(
      // Используем современную сигнатуру retry с объектом параметров (RxJS v7.4+)
      retry({
        count: 3, // Максимум 3 попытки перезапуска
        delay: (error: HttpErrorResponse, retryCount: number): Observable<number> => {
          // Если ошибка на стороне клиента (401, 403, 404) — 
          // повторные запросы бессмысленны. Сразу пробрасываем ошибку дальше, прерывая retry.
          if (error.status === 400 || error.status === 401 || error.status === 404) {
            throw error; // Возбуждаем ошибку внутри коллбэка delay
          }

          // Вычисляем экспоненциальную задержку: 1-я попытка — 1с, 2-я — 2с, 3-я — 4с
          const backoffDelay = Math.pow(2, retryCount - 1) * 1000;
          
          // Добавляем небольшой случайный фактор (Jitter) для распределения нагрузки от клиентов
          const jitter = Math.random() * 200;
          const finalDelay = backoffDelay + jitter;

          console.warn(`[Retry] Сбой. Попытка №${retryCount}. Перезапуск через ${Math.round(finalDelay)}мс.`);
          
          // Возвращаем таймер. Когда он сработает, retry выполнит повторную подписку
          return timer(finalDelay);
        }
      }),
      // Локально перехватываем ошибку, если все попытки авто-повтора были исчерпаны
      catchError((error: HttpErrorResponse): Observable<never> => {
        console.error('[Error] Все попытки повтора запроса исчерпаны. Ошибка:', error.message);
        
        // Передаем типизированную ошибку дальше в нижестоящие подписки
        return throwError(() => new Error('Не удалось получить данные с сервера после нескольких попыток.'));
      })
    );
  }
}
```

#### 2. Файл логики компонента-потребителя: `resilient-consumer.ts`
```typescript
import { Component, inject, OnInit, signal, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ResilientDataService, TargetDataPayload } from './resilient-data.service';

@Component({
  selector: 'app-resilient-consumer',
  imports: [],
  templateUrl: './resilient-consumer.html',
  styleUrl: './resilient-consumer.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResilientConsumer implements OnInit {
  private readonly dataService = inject(ResilientDataService); // Внедряем нашу службу
  private readonly destroyRef = inject(DestroyRef); // Ссылка для безопасной отписки

  public readonly payload = signal<TargetDataPayload | null>(null);
  public readonly errorMessage = signal<string | null>(null);

  public ngOnInit(): void {
    this.dataService.fetchResilientData().pipe(
      takeUntilDestroyed(this.destroyRef) // Предотвращаем утечку памяти
    ).subscribe({
      next: (data) => this.payload.set(data), // Обновляем сигнал в случае успеха
      error: (err: Error) => this.errorMessage.set(err.message) // Выводим ошибку в UI
    });
  }
}
```

#### 3. Файл разметки компонента-потребителя: `resilient-consumer.html`
```html
<div class="consumer-box">
  @if (errorMessage(); as msg) {
    <p class="error">Ошибка: {{ msg }}</p>
  } @else if (payload(); as data) {
    <p>Данные успешно загружены: {{ data.payloadContent }}</p>
  } @else {
    <p>Выполняется стабильная загрузка с авто-повторами при сбоях...</p>
  }
</div>
```

#### 4. Файл стилей компонента-потребителя: `resilient-consumer.css`
```css
.consumer-box {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.error {
  color: var(--error-text);
  font-weight: bold;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Физика терминальной ошибки и защита Главной Шины (Event Bus)
Когда в потоке возникает ошибка, RxJS-источник вызывает внутренний метод `observer.error(err)` [1.1.7]. Согласно спецификации:
1.  Уведомление об ошибке передается вниз по цепочке операторов [1.1.7].
2.  Выполняется экстренная отписка (*unsubscribe*) текущего клиента [1.1.7].
3.  Поток переходит в статус закрытого [1.1.7]. Физический канал связи уничтожается [1.1.7].

Если вы подписали форму ввода на события клавиатуры, и сетевой запрос внутри цепочки упал, необработанная ошибка поднимется до самого верха и уничтожит подписку на инпут [1.1.7]. Форма перестанет реагировать на ввод букв навсегда [1.1.7].

Чтобы этого не произошло, применяется паттерн **Изоляции ошибок во вложенном потоке (Inner Stream Recovery)** [1.1.7]. Мы переносим обработку сетевого запроса внутрь операторов высшего порядка (`switchMap`, `mergeMap`, `concatMap`) и вешаем `catchError` **строго на внутренний сетевой поток** [1.1.7] (Шаблон 1). Сетевая ошибка гасится внутри, возвращая успешное значение (например, `of([])`) [1.1.7]. Внешний поток-инициатор видит лишь успешный приход пустого массива и продолжает стабильно функционировать [1.1.7].

### 2. Почему RxJS 7 депрецировал `retryWhen`
В старых версиях RxJS для реализации сложной логики повторов с задержками использовался оператор `retryWhen` [1.1.7]:
```typescript
// УСТАРЕВШИЙ И СЛОЖНЫЙ ПОДХОД (RxJS v6)
source$.pipe(
  retryWhen(errors$ => errors$.pipe(delay(1000)))
);
```
Этот подход имел две серьезные архитектурные проблемы:
1.  **Сложность понимания контекста:** `retryWhen` принимал поток ошибок `errors$`. Разработчикам приходилось городить сложные конструкции с замыканиями, индексами попыток (`scan`) и объединением данных, чтобы понять, какая именно ошибка произошла на текущем шаге [1.1.7].
2.  **Утечки памяти и проблемы с замыканиями:** Поток `errors$` жил своей жизнью, что часто приводило к утечкам подписок при некорректном связывании [1.1.7].

В современных стандартах RxJS 7/8 оператор `retry` был полностью переработан [1.1.7]. Теперь он принимает объект параметров, где свойство `delay` может быть как простым числом, так и функцией-фабрикой `(error, retryCount) => Observable` [1.1.7]. Это полностью искоренило необходимость в использовании `retryWhen`, объединив всю логику повторов в один понятный и безопасный контракт [1.1.7].

### 3. Детальный пошаговый разбор выполнения шаблона
Проследим шаги прохождения ошибки при вводе текста в `SafeSearch`:
1.  **Действие:** Пользователь вводит текст. Поток `valueChanges` испускает строку.
2.  **Запуск лоадера:** Оператор `switchMap` перехватывает строку и подписывается на внутренний поток `http.get('/search')`.
3.  **Сбой сервера:** Сервер возвращает ошибку `500 Internal Server Error`.
4.  **Перехват в `catchError`:** Локальный оператор `catchError`, висящий прямо на `http.get()`, перехватывает `HttpErrorResponse` [1.1.7].
5.  **Гашение ошибки:** Коллбэк внутри `catchError` возвращает `of([])`. Поток `http.get()` успешно гасит ошибку и завершается с единственным значением `[]` [1.1.7].
6.  **Результат во внешнем потоке:** Оператор `switchMap` получает на вход чистый массив `[]`, не видя никакой ошибки [1.1.7]. Массив передается в `.subscribe({ next })` [1.1.7]. Главный поток ввода продолжает активно слушать изменения клавиатуры [1.1.7].

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Размещение `catchError` на внешнем потоке вместо внутреннего**
    *   *Симптомы:* Поисковая строка полностью ломается и перестает реагировать на ввод пользователя после первой же ошибки сервера.
    *   *Физика процесса:* Разработчик повесил `catchError` на внешний поток, идущий после `switchMap`. Ошибка из `switchMap` поднимается наверх, перехватывается глобальным `catchError`, гасится, но исходная подписка на `valueChanges` при этом уничтожается [1.1.7].
    *   *Решение:* Всегда переносите `catchError` внутрь трубы (`pipe()`) самого сетевого запроса внутри `switchMap` (как показано в Шаблоне 1) [1.1.7].

```typescript
// ОШИБКА: Сетевая ошибка убьет поток valueChanges навсегда!
this.control.valueChanges.pipe(
  switchMap(t => this.http.get(url)),
  catchError(err => of([])) // ! Поток valueChanges уничтожен!
).subscribe();

// ИСПРАВЛЕНИЕ: Ошибка изолирована внутри switchMap, поток valueChanges останется жить
this.control.valueChanges.pipe(
  switchMap(t => this.http.get(url).pipe(
    catchError(err => of([])) // Поток-источник защищен
  ))
).subscribe();
```

*   **Ошибка 2: Бесконечные повторы запросов авторизации или отсутствующих страниц**
    *   *Симптомы:* Сетевой шлюз перегружается бесконечными цикличными запросами к API при падении сервера.
    *   *Причина:* Использование оператора `retry` без фильтрации статус-кодов ошибок [1.1.7]. Например, если запрос падает со статусом `404 Not Found` или `401 Unauthorized`, повторный автоматический перезапрос гарантированно завершится тем же сбоем, бессмысленно забивая трафик клиента и нагружая процессор [1.1.7].
    *   *Решение:* Внутри фабрики `delay` оператора `retry` всегда делайте жесткую проверку статус-кодов [1.1.7]. Если статус указывает на клиентскую ошибку (400, 401, 403, 404), прерывайте цепочку повторов путем мгновенного выброса ошибки через `throw error` (как показано в Шаблоне 2) [1.1.7].

*   **Ошибка 3: Возврат не-Observable значения из `catchError`**
    *   *Симптомы:* Ошибка компиляции TypeScript вида `Type 'null' is not assignable to type 'ObservableInput<any>'` или падение рантайма.
    *   *Физика процесса:* Разработчик пытается вернуть из `catchError` сырой объект или `null` напрямую [1.1.7]. По спецификации `catchError` обязан возвращать только валидный реактивный источник данных (**`ObservableInput`**), например, созданный через `of(null)` или `EMPTY` [1.1.7].
    *   *Решение:* Оборачивайте любые дефолтные возвращаемые объекты в вызов оператора `of()` или возвращайте пустой поток `EMPTY` [1.1.7].

```typescript
// ОШИБКА: Возврат сырого значения приведет к краху компиляции
// catchError(err => ({ data: [] })) 

// ИСПРАВЛЕНИЕ: Обертывание в реактивный источник of()
catchError(err => of({ data: [] }))
```