---
tags: [angular, RxJS, архитектура]
related: ["[[Управление состоянием сервиса через BehaviorSubject.md]]", "[[Совместное использование потоков (shareReplay).md]]"]
status: "completed"
---

# Преобразования RxJS потоков (switchMap, concatMap)

## БЫСТРЫЙ СТАРТ

*   **Операторы преобразования высшего порядка (Flattening Operators)** — специализированные инструменты RxJS, предназначенные для трансформации внешнего потока событий во внутренний асинхронный поток (например, преобразование клика по кнопке в сетевой HTTP-запрос) с последующим слиянием результатов в один плоский поток. Они полностью искореняют антипаттерн вложенных подписок (вложенных вызовов `.subscribe()`).
*   **Четыре фундаментальные стратегии:**
    *   `switchMap` (Отмена): При получении нового внешнего события моментально отменяет (вызывает `.unsubscribe()`) предыдущий активный внутренний запрос. Свежее событие всегда вытесняет старое.
    *   `concatMap` (Очередь): Буферизует все входящие внешние события и выполняет внутренние потоки строго последовательно — один за другим, дожидаясь завершения (`complete`) каждого предыдущего. Сохраняет строгий порядок.
    *   `mergeMap` (Parallel): Запускает внутренние потоки параллельно, по мере их поступления, без отмены и ожидания. Результаты сливаются в хаотичном порядке по мере готовности сетевых ответов.
    *   `exhaustMap` (Игнорирование): Полностью игнорирует любые новые внешние события до тех пор, пока текущий внутренний поток не завершит свою работу.
*   **Правила использования:**
    *   **Используйте `switchMap`:** Для любых операций чтения (Read) — живой поиск, переключение вкладок, применение фильтров таблицы.
    *   **Используйте `concatMap`:** Для последовательных операций записи (Write) — сохранение элементов списка по очереди, выстраивание строгой последовательности команд СУБД.
    *   **Используйте `exhaustMap`:** Для предотвращения двойных кликов (Double-click Protection) на кнопках отправки форм, авторизации или оплаты.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Живой поиск с автоматической отменой запросов (switchMap)
*   **Назначение:** Реализация строки ввода, которая отправляет поисковые запросы на сервер с автоматической отменой предыдущих зависших сетевых запросов при быстром наборе текста.

#### 1. Файл логики: `user-search.ts`
```typescript
import { Component, inject, signal, OnInit, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subject, Observable, of } from 'rxjs';
import { switchMap, debounceTime, distinctUntilChanged, catchError, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-user-search',
  // standalone: true опускается по умолчанию начиная с v19
  imports: [], 
  templateUrl: './user-search.html',
  styleUrl: './user-search.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserSearch implements OnInit { // Имя класса очищено от суффикса Component
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  // Горячий поток событий ввода символов пользователем
  private readonly searchTerms$ = new Subject<string>();

  public readonly searchResults = signal<string[]>([]);
  public readonly isLoading = signal<boolean>(false);

  public ngOnInit(): void {
    this.searchTerms$.pipe(
      debounceTime(300),          // Ждем 300мс затишья перед отправкой запроса
      distinctUntilChanged(),     // Пропускаем дальше только если строка ввода изменилась
      tap(() => this.isLoading.set(true)), // Переключаем UI в состояние загрузки
      
      // Используем switchMap для переключения на сетевой запрос.
      // Если во время выполнения запроса придет новый поисковый термин,
      // switchMap мгновенно отменит старый HTTP-запрос на уровне браузера!
      switchMap((term: string): Observable<string[]> => {
        if (!term.trim()) {
          return of([]); // Если строка пуста, возвращаем пустой массив без запроса
        }
        
        const params = new HttpParams().set('name', term);
        const api = 'https://api.enterprise-service.com/v1/users';

        return this.http.get<string[]>(api, { params }).pipe(
          // Важно: перехватываем ошибку ВНУТРИ цепочки switchMap.
          // Если поймать её снаружи, поток searchTerms$ умрет навсегда!
          catchError((err: Error) => {
            console.error('Ошибка сетевого запроса:', err);
            return of([]); // Возвращаем резервный пустой массив в случае сбоя
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef) // Предотвращаем утечку памяти
    ).subscribe({
      next: (users) => {
        this.searchResults.set(users);
        this.isLoading.set(false); // Сбрасываем статус загрузки
      }
    });
  }

  public onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerms$.next(input.value);
  }
}
```

#### 2. Файл разметки: `user-search.html`
```html
<div class="search-box">
  <input type="text" (input)="onSearchInput($event)" placeholder="Введите имя..." class="theme-input" />
  
  @if (isLoading()) {
    <p class="loading-indicator">Поиск на сервере...</p>
  }

  <ul class="results-list">
    @for (user of searchResults(); track user) {
      <li>{{ user }}</li>
    }
  </ul>
</div>
```

#### 3. Файл стилей: `user-search.css`
```css
.search-box {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.loading-indicator {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.results-list {
  margin-top: 12px;
  padding-left: 20px;
}
```

---

### Шаблон 2: Последовательное сохранение очереди задач (concatMap)
*   **Назначение:** Выстраивание строгой асинхронной очереди выполнения запросов записи (например, последовательное сохранение изменений в базе данных), где критически важен порядок завершения транзакций.

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, Observable, of } from 'rxjs';
import { concatMap, catchError } from 'rxjs/operators';

export interface TaskSavePayload {
  taskId: string;
  payload: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class TaskQueueService {
  private readonly http = inject(HttpClient);
  private readonly api = 'https://api.enterprise-service.com/v1/tasks';

  // Поток поступающих задач на сохранение
  private readonly saveQueue$ = new Subject<TaskSavePayload>();

  constructor() {
    this.saveQueue$.pipe(
      // Использование concatMap гарантирует, что запросы будут выполняться по одному.
      // Если придет 5 задач подряд, они выстроятся во внутренний буфер.
      // Запрос №2 начнется строго после того, как запрос №1 вернет ответ.
      concatMap((task: TaskSavePayload): Observable<unknown> => {
        const url = `${this.api}/${task.taskId}/save`;
        
        return this.http.post(url, task.payload).pipe(
          // Обязательно гасим ошибку внутри, чтобы не сломать конвейер очереди
          catchError((err: Error) => {
            console.error(`[Queue] Ошибка сохранения задачи ${task.taskId}:`, err);
            // Возвращаем пустой успешный элемент, чтобы concatMap продолжил выполнять следующие задачи в очереди
            return of(null); 
          })
        );
      })
    ).subscribe({
      next: () => console.log('[Queue] Очередная задача успешно сохранена.')
    });
  }

  /**
   * Добавляет задачу в очередь на последовательное сохранение
   */
  public pushToSaveQueue(taskId: string, payload: unknown): void {
    this.saveQueue$.next({ taskId, payload });
  }
}
```

---

### Шаблон 3: Блокировка кнопки отправки формы от двойного клика (exhaustMap)
*   **Назначение:** Игнорирование повторных кликов пользователя по кнопке «Оплатить» или «Отправить» до тех пор, пока сервер не вернет финальный ответ на первый запрос.

#### 1. Файл логики: `payment-button.ts`
```typescript
import { Component, inject, DestroyRef, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, Observable, of } from 'rxjs';
import { exhaustMap, catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-payment-button',
  imports: [],
  templateUrl: './payment-button.html',
  styleUrl: './payment-button.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentButton implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  // Поток кликов по кнопке оплаты
  private readonly paymentClicks$ = new Subject<void>();

  public ngOnInit(): void {
    this.paymentClicks$.pipe(
      // Использование exhaustMap полностью игнорирует любые входящие события кликов,
      // пока выполняется внутренний сетевой запрос. Спам по кнопке заблокирован в рантайме!
      exhaustMap((): Observable<unknown> => {
        console.warn('[Payment] Запуск транзакции. Все последующие клики временно игнорируются...');
        const api = 'https://api.enterprise-service.com/v1/pay';
        
        return this.http.post(api, { amount: 100 }).pipe(
          catchError((err: Error) => {
            console.error('[Payment] Ошибка транзакции:', err);
            return of(null);
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => console.log('[Payment] Транзакция успешно завершена. Кнопка снова активна.')
    });
  }

  public triggerPayment(): void {
    this.paymentClicks$.next();
  }
}
```

#### 2. Файл разметки: `payment-button.html`
```html
<div class="payment-box">
  <button class="action-btn" (click)="triggerPayment()">
    Инициировать транзакцию
  </button>
</div>
```

#### 3. Файл стилей: `payment-button.css`
```css
.payment-box {
  padding: 12px;
}
.action-btn {
  padding: 10px 20px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурный крах вложенных подписок (Callback Hell в RxJS)
Начинающие разработчики часто совершают грубую архитектурную ошибку — вкладывают один вызов `.subscribe()` внутрь другого:

```typescript
// КРИТИЧЕСКИЙ АНТИПАТТЕРН (NESTED SUBSCRIPTIONS)
this.term$.subscribe(term => {
  this.http.get(`/search?q=${term}`).subscribe(res => {
    this.results = res;
  });
});
```

Почему эта схема деструктивна?
1.  **Утечки памяти (Memory Leaks):** Каждый раз, когда внешний поток `term$` испускает новое значение, создается **новая независимая подписка** на внутренний HTTP-запрос. Эти подписки не связаны между собой. При уничтожении компонента вы не сможете отписаться от них одной командой, и они останутся висеть в памяти в фоновом режиме.
2.  **Невозможность отмены:** При быстром вводе текста браузер запустит 10 параллельных сетевых запросов. Вы не сможете отменить старые запросы, что приведет к перегрузке сетевого канала и состоянию гонки (Race Conditions).
3.  **Крах обработки ошибок:** Если внутренний запрос упадет с ошибкой, он не сможет пробросить её наружу, ломая предсказуемость конвейера обработки ошибок.

Использование операторов преобразования решает эту проблему, связывая жизненные циклы внешнего и внутреннего потоков на декларативном уровне.

### 2. Жизненный цикл внутренних подписок (Inner Subscription Lifecycle)
Разберем детально, что физически происходит внутри каждого оператора при поступлении нового события:

*   **`switchMap`:** При получении нового внешнего значения оператор проверяет наличие активной внутренней подписки. Если она есть, он вызывает на ней метод `.unsubscribe()`. Браузер мгновенно прерывает текущее TCP-соединение (состояние запроса в DevTools переходит в `Canceled`). После этого создается новая подписка.
*   **`concatMap`:** При получении события оператор проверяет, активен ли текущий внутренний поток. Если активен — событие упаковывается во внутренний массив-буфер. Как только текущий поток вызывает `complete`, `concatMap` извлекает следующее событие из буфера и запускает новый поток.
*   **`mergeMap`:** Оператор не содержит логики отмены или буферизации. На каждое входящее событие он просто создает новую подписку. Если придет 100 событий, он одновременно запустит 100 параллельных асинхронных процессов.
*   **`exhaustMap`:** Оператор содержит булев флаг активности. Если флаг равен `true` (поток выполняется), любое новое входящее событие просто отбрасывается (discarded) и уничтожается в памяти.

### 3. Пошаговый разбор очереди транзакций в concatMap
Проследим выполнение очереди в `TaskQueueService` (Шаблон 2) при быстром добавлении трех задач `A`, `B` и `C`:

1.  **Событие A:** В поток поступает задача `A`. Буфер пуст. `concatMap` подписывается на `http.post('/tasks/A/save')`. Запрос уходит в сеть.
2.  **События B и C:** Через 50мс (пока запрос `A` еще выполняется) поступают задачи `B` и `C`. `concatMap` видит активную подписку `A` и складывает задачи `B` и `C` во внутреннюю очередь ожидания: `[B, C]`.
3.  **Завершение A:** Через 200мс сервер возвращает ответ `200 OK` для задачи `A`. Внутренний поток завершается (`complete`).
4.  **Срабатывание очереди:** `concatMap` видит завершение, извлекает первый элемент из буфера — задачу `B` — и запускает `http.post('/tasks/B/save')`. Очередь принимает вид: `[C]`.
5.  **Завершение B:** После ответа `B` запускается задача `C`. Очередь пустеет.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Использование switchMap для неидемпотентных запросов сохранения (Lost Writes)**
    *   *Симптомы:* Пользователь быстро заменяет данные в форме и нажимает «Сохранить», но некоторые изменения хаотично теряются или не доходят до базы данных.
    *   *Физика процесса:* Разработчик повесил сохранение на `switchMap`. Пользователь быстро кликнул по кнопкам сохранения разных полей. Второй клик принудительно отменил незавершенный сетевой запрос первого клика. Хотя первый запрос мог уже частично выполниться базой данных на бэкенде, клиентское приложение считает его отмененным, нарушая целостность данных в UI.
    *   *Решение:* Для любых операций записи, сохранения или изменения данных строго используйте `concatMap` (последовательно) или `mergeMap` (параллельно), но никогда не используйте `switchMap`.

```typescript
// ОШИБКА: Быстрые повторные клики отменят предыдущие запросы сохранения в БД!
// return clicks$.pipe(switchMap(data => this.http.post(saveUrl, data)));

// ИСПРАВЛЕНИЕ: Использование очереди гарантирует выполнение каждого сохранения
return clicks$.pipe(concatMap(data => this.http.post(saveUrl, data)));
```

*   **Ошибка 2: Зависание очереди concatMap из-за бесконечных внутренних потоков**
    *   *Симптомы:* Очередь задач в `concatMap` выполняет первый запрос, после чего намертво зависает. Все последующие задачи накапливаются в буфере и никогда не отправляются на сервер.
    *   *Физика процесса:* `concatMap` ожидает вызова сигнала `complete` от внутреннего потока. Если внутренний поток является бесконечным (например, возвращает `Subject` или `watchQuery` без завершения), сигнал `complete` никогда не будет сгенерирован. Очередь заблокируется навсегда.
    *   *Решение:* Убедитесь, что внутренний поток гарантированно завершается (вызывает `complete`). Для сырых субъектов используйте оператор ограничения `take(1)`.

```typescript
// ОШИБКА: Subject не завершается самостоятельно, очередь concatMap заблокируется после первой задачи
// return queue$.pipe(concatMap(() => this.mySubject$));

// ИСПРАВЛЕНИЕ: Оператор take(1) принудительно завершит поток после первой эмиссии
return queue$.pipe(concatMap(() => this.mySubject$.pipe(take(1))));
```

*   **Ошибка 3: Смерть внешнего потока из-за некорректного перехвата ошибок**
    *   *Симптомы:* Сетевой запрос поиска завершился с ошибкой `500`, после чего поисковая строка полностью перестает реагировать на ввод любых символов пользователем.
    *   *Физика процесса:* Разработчик повесил оператор `catchError` на внешний поток. При возникновении сетевой ошибки оператор перехватил её, завершил внешний поток `searchTerms$` сигналом ошибки, уничтожив подписку. Поток ввода умер.
    *   *Решение:* Всегда размещайте `catchError` **внутри** цепочки трансформации внутреннего потока (внутри `switchMap/concatMap`), как показано в Шаблоне 1. Тогда упадет только конкретный сетевой запрос, а внешний поток ввода продолжит функционировать в штатном режиме.

```typescript
// ОШИБКА: Сетевая ошибка убьет поток term$ навсегда
// return term$.pipe(
//   switchMap(t => this.http.get(url)),
//   catchError(err => of([])) 
// );

// ИСПРАВЛЕНИЕ: Ошибка изолирована внутри switchMap, поток term$ останется жить
return term$.pipe(
  switchMap(t => this.http.get(url).pipe(
    catchError(err => of([]))
  ))
);
```