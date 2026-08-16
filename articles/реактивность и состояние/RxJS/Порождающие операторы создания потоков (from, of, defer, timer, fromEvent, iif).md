---
tags: [angular, RxJS, создание-потоков, реактивность]
related: ["[[Введение в реактивное программирование и RxJS.md]]", "[[Анатомия конвейера pipe и базовые операторы обработки (map, filter, tap).md]]", "[[Управление временными задержками (debounceTime, throttleTime, auditTime, delay).md]]"]
status: "completed"
---

# Порождающие операторы создания потоков (from, of, defer, timer, fromEvent, iif)

## БЫСТРЫЙ СТАРТ

*   **Порождающие операторы (Creation Operators)** — это самостоятельные фабричные функции RxJS, создающие новые потоки `Observable` из статических значений, массивов, промисов, событий браузера, таймеров или ленивых условий.
*   **Главные операторы создания:**
    *   `of(...values)` — синхронно испускает переданные аргументы по очереди и сразу завершает поток (`complete`).
    *   `from(iterable | Promise)` — преобразует массив, итерируемый объект или `Promise` в поток. Разворачивает массивы поэлементно.
    *   `defer(() => ObservableInput)` — создает ленивый поток: фабрика внутри `defer` выполняется заново для каждого нового подписчика в момент вызова `.subscribe()`.
    *   `timer(dueTime, periodOrScheduler)` — запускает таймер с возможностью периодического повторения (замена `setTimeout` / `setInterval`).
    *   `fromEvent(target, eventName)` — оборачивает нативные события DOM или Node.js EventTarget в реактивный поток.
    *   `iif(() => boolean, trueSource$, falseSource$)` — условный оператор: выбирает один из двух потоков в зависимости от результата проверки в момент подписки.
*   **Используйте для:** инициализации моковых данных в тестах, интеграции сторонних промисов и DOM-событий в RxJS-пайплайны, отложенных ленивых вычислений и таймеров.
*   **Не используйте `of(array)`:** если вы хотите обработать элементы массива по одному (для этого используйте `from(array)`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Разница между `of` и `from` при обработке данных
*   **Назначение:** Наглядная демонстрация того, как `of` передает массив как единый монолитный объект, а `from` расщепляет его на индивидуальные события.

```typescript
import { Injectable } from '@angular/core';
import { of, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StreamCreationDemoService {
  public demonstrateOfAndFrom(): void {
    const techStack = ['Angular', 'RxJS', 'TypeScript'];

    // 1. of() испускает ВЕСЬ массив как ОДИН элемент
    // Тип потока: Observable<string[]>
    of(techStack).subscribe({
      next: (val) => console.log('[of]:', val), // Сработает 1 раз, выведет ['Angular', 'RxJS', 'TypeScript']
      complete: () => console.log('[of] Поток завершен')
    });

    // 2. from() расщепляет массив и испускает КАЖДЫЙ элемент по отдельности
    // Тип потока: Observable<string>
    from(techStack).subscribe({
      next: (val) => console.log('[from]:', val), // Сработает 3 раза: "Angular", затем "RxJS", затем "TypeScript"
      complete: () => console.log('[from] Поток завершен')
    });

    // 3. from() для промиса: преобразует Promise в Observable
    const fetchPromise = Promise.resolve('Сетевые данные из Promise');
    from(fetchPromise).subscribe({
      next: (val) => console.log('[from(Promise)]:', val),
      complete: () => console.log('[from(Promise)] Завершен')
    });
  }
}
```

---

### Шаблон 2: Ленивая генерация актуальных параметров через `defer`
*   **Назначение:** Гарантия вычисления текущей временной метки (Timestamp) или токена в момент подписки, а не в момент объявления переменной.

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { defer, Observable } from 'rxjs';

export interface RequestPayload {
  timestamp: number;
  data: string;
}

@Injectable({
  providedIn: 'root'
})
export class LazyRequestService {
  private readonly http = inject(HttpClient);

  // ПЛОХО: of({ timestamp: Date.now() }) зафиксирует время в момент инициализации класса сервиса!

  // ХОРОШО: defer выполняет функцию фабрики в момент вызова .subscribe()
  // Каждый новый подписчик получит свежий актуальный Date.now()
  public readonly lazyAuditRequest$: Observable<unknown> = defer(() => {
    const currentPayload: RequestPayload = {
      timestamp: Date.now(), // Свежая временная метка
      data: 'user_action_audit'
    };

    return this.http.post('https://api.enterprise-service.com/v1/audit', currentPayload);
  });
}
```

---

### Шаблон 3: Прослушивание нативных событий окна браузера через `fromEvent`
*   **Назначение:** Отслеживание нажатий клавиши `Escape` для закрытия модального окна с автоматической очисткой слушателя.

#### 1. Файл логики компонента: `escape-listener.ts`
```typescript
import { Component, OnInit, inject, DestroyRef, signal, ChangeDetectionStrategy } from '@angular/core';
import { fromEvent } from 'rxjs';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-escape-listener',
  templateUrl: './escape-listener.html',
  styleUrl: './escape-listener.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EscapeListener implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  public readonly isModalOpen = signal<boolean>(true);

  public ngOnInit(): void {
    // fromEvent оборачивает нативный addEventListener на объекте window
    fromEvent<KeyboardEvent>(window, 'keydown').pipe(
      // Фильтруем события, реагируя только на Escape
      filter((event) => event.key === 'Escape'),
      // takeUntilDestroyed снимет слушатель с window при удалении компонента
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      console.log('[Keyboard] Нажат Escape. Закрываем модальное окно.');
      this.isModalOpen.set(false);
    });
  }
}
```

#### 2. Файл разметки компонента: `escape-listener.html`
```html
@if (isModalOpen()) {
  <div class="modal-overlay">
    <div class="modal-card">
      <h4>Активное модальное окно</h4>
      <p>Нажмите клавишу <b>Escape</b> на клавиатуре для закрытия.</p>
    </div>
  </div>
}
```

#### 3. Файл стилей компонента: `escape-listener.css`
```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  padding: 24px;
  border-radius: 8px;
  max-width: 380px;
  color: var(--text-normal);
}
```

---

### Шаблон 4: Условное переключение источников через `iif`
*   **Назначение:** Выбор источника данных в зависимости от того, находится ли приложение в онлайне или офлайне в момент запроса.

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { iif, of, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SmartSyncService {
  private readonly http = inject(HttpClient);

  public loadData(): Observable<string[]> {
    // iif проверяет условие в момент вызова .subscribe()
    return iif(
      () => navigator.onLine,
      // Ветка TRUE: Если сеть есть — делаем реальный сетевой запрос
      this.http.get<string[]>('https://api.enterprise-service.com/v1/items'),
      // Ветка FALSE: Если сети нет — отдаем кэшированные локальные данные
      of(['Локальный кэш 1', 'Локальный кэш 2'])
    );
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Внутреннее устройство `of` против `from`
*   **Оператор `of(...args)`:** При подписке синхронно проходит циклом по переданным в функцию аргументам:
    ```javascript
    for (let i = 0; i < args.length; i++) {
      subscriber.next(args[i]);
    }
    subscriber.complete();
    ```
    Если вы передали массив `of([1, 2, 3])`, аргумент `args[0]` — это сам массив. Он отдается целиком.
*   **Оператор `from(input)`:** Анализирует тип входящего объекта:
    *   Если это **массив** или объект с `[Symbol.iterator]` — он запускает итератор и вызывает `subscriber.next()` для каждого элемента по отдельности.
    *   Если это **Promise** — он вешает `.then(val => subscriber.next(val), err => subscriber.error(err))`.
    *   Если это **Observable-подобный объект** (`[Symbol.observable]`) — он оформляет подписку.

### 2. Почему `defer` критически важен для холодных фабрик
Холодные потоки вычисляют свои замыкания в момент их создания. Если внутри конвейера создания потока используются динамические параметры:
```typescript
// ОШИБКА: queryParam будет зафиксирован ОДИН РАЗ в момент объявления свойства класса!
const request$ = of({ url: `/search?q=${this.currentQuery}` });
```
Если `this.currentQuery` изменится позже, поток `request$` продолжит отправлять старое значение, вычисленное при старте.

Оператор `defer(() => factory())` откладывает выполнение фабрики до момента подписки. Каждый вызов `.subscribe()` запускает фабрику заново, гарантируя получение самых свежих переменных.

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Случайная передача массива в `of` вместо `from` при поточной обработке**
    *   *Симптомы:* Оператор `map` внутри конвейера получает на вход массив целиком вместо отдельных элементов.
    *   *Решение:* Используйте `from(array)` для поэлементного прогона массива через RxJS-пайплайн.

```typescript
// ПЛОХО (map получит весь массив сразу)
of([1, 2, 3]).pipe(map(x => x * 2)); // Вернет NaN (попытка умножить массив на 2)

// ХОРОШО (map выполнится 3 раза для каждого числа)
from([1, 2, 3]).pipe(map(x => x * 2)); // Испустит 2, затем 4, затем 6
```

*   **Ошибка 2: Утечки памяти при использовании `fromEvent` без отписки**
    *   *Симптомы:* Медленный рост потребления памяти вкладкой браузера при переходе между страницами.
    *   *Физика процесса:* `fromEvent(window, ...)` вешает глобальный нативный слушатель на объект `window`. При уничтожении компонента слушатель продолжает висеть в памяти браузера, удерживая ссылку на компонент.
    *   *Решение:* Всегда завершайте поток через `takeUntilDestroyed()` или явный `unsubscribe()`.

*   **Ошибка 3: Статическое вычисление условий перед `iif`**
    *   *Симптомы:* Оператор `iif` всегда выполняет одну и ту же ветку, даже если состояние приложения изменилось.
    *   *Физика процесса:* Разработчик передал в `iif` булево значение вместо стрелочной функции: `iif(this.isOnline, ...)` вместо `iif(() => this.isOnline, ...)`. Условие зафиксировалось один раз в момент создания.
    *   *Решение:* Первым аргументом `iif` всегда передавайте функцию-предикат: `() => boolean`.
