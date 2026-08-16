---
tags: [angular, RxJS, состояние, архитектура, реактивность]
related: ["[[Введение в реактивное программирование и RxJS.md]]", "[[Анатомия конвейера pipe и базовые операторы обработки (map, filter, tap).md]]", "[[Управление состоянием сервиса через BehaviorSubject.md]]"]
status: "completed"
---

# Накопление состояния во времени (scan vs reduce)

## БЫСТРЫЙ СТАРТ

*   **Операторы аккумуляции (`scan` и `reduce`)** применяют функцию-накопитель (*reducer*) к входящим элементам потока, накапливая промежуточный результат во внутренней переменной-аккумуляторе.
*   **Фундаментальная разница во времени:**
    *   `scan(accumulatorFn, seed)` — испускает промежуточный накопленный результат **после каждого входящего события**. Идеально подходит для бесконечных потоков (Redux-подобные хранилища, счетчики, история чатов, корзина покупок).
    *   `reduce(accumulatorFn, seed)` — **ждет полного завершения потока (`complete`)** и только в этот момент испускает единственное финальное накопленное значение. В бесконечных потоках `reduce` не испустит ничего и никогда.
*   **Используйте `scan` для:** реактивного управления состоянием в реальном времени, подсчета очков, построения очереди команд и ведения списков событий без сторонних библиотек.
*   **Используйте `reduce` для:** конечных потоков (например, подсчет общего объема данных после завершения серии HTTP-запросов).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Реактивная корзина на паттерне Redux/Scan без сторонних библиотек
*   **Назначение:** Построение предсказуемого сервиса корзины покупок, где входящие действия (Actions) обрабатываются чистой функцией через `scan`.

#### 1. Файл логики сервиса: `reactive-cart.service.ts`
```typescript
import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { scan, shareReplay } from 'rxjs/operators';

export interface CartProduct {
  id: string;
  title: string;
  price: number;
}

// Описываем типы действий (Actions)
export type CartAction =
  | { type: 'ADD_ITEM'; payload: CartProduct }
  | { type: 'REMOVE_ITEM'; payload: { id: string } }
  | { type: 'CLEAR_CART' };

export interface CartState {
  items: CartProduct[];
  totalPrice: number;
}

const initialCartState: CartState = {
  items: [],
  totalPrice: 0
};

@Injectable({
  providedIn: 'root'
})
export class ReactiveCartService {
  // Поток входящих команд-действий
  private readonly actions$ = new Subject<CartAction>();

  // Главный поток состояния. Оператор scan аккумулирует действия в состояние
  public readonly state$: Observable<CartState> = this.actions$.pipe(
    scan((state: CartState, action: CartAction): CartState => {
      switch (action.type) {
        case 'ADD_ITEM': {
          const updatedItems = [...state.items, action.payload];
          return {
            items: updatedItems,
            totalPrice: updatedItems.reduce((sum, item) => sum + item.price, 0)
          };
        }
        case 'REMOVE_ITEM': {
          const updatedItems = state.items.filter(item => item.id !== action.payload.id);
          return {
            items: updatedItems,
            totalPrice: updatedItems.reduce((sum, item) => sum + item.price, 0)
          };
        }
        case 'CLEAR_CART':
          return initialCartState;
        default:
          return state;
      }
    }, initialCartState),
    // Кэшируем последнее состояние для новых подписчиков
    shareReplay({ bufferSize: 1, refCount: true })
  );

  public addItem(product: CartProduct): void {
    this.actions$.next({ type: 'ADD_ITEM', payload: product });
  }

  public removeItem(id: string): void {
    this.actions$.next({ type: 'REMOVE_ITEM', payload: { id } });
  }

  public clear(): void {
    this.actions$.next({ type: 'CLEAR_CART' });
  }
}
```

---

### Шаблон 2: Сравнение работы `scan` и `reduce` на конечном потоке
*   **Назначение:** Наглядная демонстрация разницы в эмиссиях между пошаговым `scan` и завершающим `reduce`.

```typescript
import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { scan, reduce } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ScanVsReduceDemo {
  public runComparison(): void {
    const numbersStream$ = of(10, 20, 30); // Поток из 3 чисел с последующим complete

    console.log('--- 1. Запуск scan() ---');
    // scan выдает промежуточный результат на каждом числе
    numbersStream$.pipe(
      scan((acc, val) => acc + val, 0)
    ).subscribe(val => console.log('[scan]:', val));
    // Выведет: 10, затем 30, затем 60

    console.log('--- 2. Запуск reduce() ---');
    // reduce ждет complete и выдает только итоговую сумму
    numbersStream$.pipe(
      reduce((acc, val) => acc + val, 0)
    ).subscribe(val => console.log('[reduce]:', val));
    // Выведет строго одно значение: 60
  }
}
```

---

### Шаблон 3: Накопление живой истории чата/логов на UI с лимитом размера
*   **Назначение:** Компонент подписывается на входящие сообщения и накапливает их в массив через `scan`, ограничивая длину истории последними 50 записями.

#### 1. Файл логики компонента: `live-feed.ts`
```typescript
import { Component, inject, ChangeDetectionStrategy, signal, OnInit, DestroyRef } from '@angular/core';
import { Subject } from 'rxjs';
import { scan } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface FeedMessage {
  id: string;
  text: string;
  time: string;
}

@Component({
  selector: 'app-live-feed',
  templateUrl: './live-feed.html',
  styleUrl: './live-feed.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LiveFeed implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  // Поток поступления новых единичных сообщений (например, из WebSockets)
  public readonly incomingMessage$ = new Subject<FeedMessage>();

  // Сигнал, хранящий накопленный массив сообщений
  public readonly messages = signal<FeedMessage[]>([]);

  public ngOnInit(): void {
    const maxHistoryLimit = 50;

    this.incomingMessage$.pipe(
      // scan принимает новое сообщение и прикрепляет его к накопленному массиву
      scan((history: FeedMessage[], newMessage: FeedMessage): FeedMessage[] => {
        const nextHistory = [newMessage, ...history];
        // Ограничиваем историю, отбрасывая самые старые сообщения в конце
        return nextHistory.slice(0, maxHistoryLimit);
      }, []),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((updatedList) => {
      this.messages.set(updatedList);
    });
  }

  public simulateIncoming(): void {
    this.incomingMessage$.next({
      id: crypto.randomUUID(),
      text: `Событие #${Math.floor(Math.random() * 1000)}`,
      time: new Date().toLocaleTimeString()
    });
  }
}
```

#### 2. Файл разметки компонента: `live-feed.html`
```html
<div class="feed-container">
  <div class="feed-header">
    <h4>Живая лента сообщений (Всего: {{ messages().length }})</h4>
    <button type="button" class="action-btn" (click)="simulateIncoming()">Добавить событие</button>
  </div>

  <ul class="feed-list">
    @for (msg of messages(); track msg.id) {
      <li class="feed-item">
        <span class="feed-time">{{ msg.time }}</span>
        <span class="feed-text">{{ msg.text }}</span>
      </li>
    } @empty {
      <li class="feed-empty">Событий пока нет</li>
    }
  </ul>
</div>
```

#### 3. Файл стилей компонента: `live-feed.css`
```css
.feed-container {
  max-width: 440px;
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.action-btn {
  padding: 6px 12px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.feed-list {
  list-style: none;
  padding: 0;
  max-height: 250px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feed-item {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.85rem;
}

.feed-time {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.feed-text {
  color: var(--text-normal);
}

.feed-empty {
  text-align: center;
  color: var(--text-muted);
  font-style: italic;
  padding: 12px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика `scan` против `reduce` на временной шкале

```text
Входящий поток:     ---(10)--------(20)--------(30)--------(complete)---->

1. scan((acc, x) => acc + x, 0):
Результат:          ---(10)--------(30)--------(60)--------(complete)---->
                    (Эмиссия происходит СРАЗУ после каждого входящего события)

2. reduce((acc, x) => acc + x, 0):
Результат:          ----------------------------------------(60|complete)->
                    (Молчит весь жизненный цикл, эмиссия строго ПОСЛЕ complete)
```

Если поток является бесконечным (например, `fromEvent(btn, 'click')` или `Subject`), сигнал `complete` не наступит никогда. В этом случае оператор `reduce` будет бесконечно накапливать значения в памяти, никогда не передавая результат подписчикам.

### 2. Паттерн Command/Reducer в RxJS
Оператор `scan` — фундамент реактивных стейт-менеджеров. Он реализует математическую формулу:
$$S_{n} = f(S_{n-1}, A_n)$$
Где $S_{n}$ — новое состояние, $S_{n-1}$ — предыдущее состояние, а $A_n$ — поступившее действие (Action).

Поскольку функция внутри `scan` является чистой (Pure Function), состояние системы становится полностью детерминированным и защищенным от побочных эффектов.

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Использование `reduce` на бесконечных потоках (The Infinite Silence Bug)**
    *   *Симптомы:* Метод `.subscribe()` никогда не вызывается, данные не отображаются, хотя события в поток активно отправляются.
    *   *Причина:* `reduce` ожидает завершения потока (`complete`). На бесконечных `Subject` или `valueChanges` поток не завершается сам по себе.
    *   *Решение:* Замените `reduce` на `scan`.

```typescript
// ПЛОХО: subscribe никогда не выполнится
// clicks$.pipe(reduce((count) => count + 1, 0)).subscribe();

// ХОРОШО: subscribe срабатывает на каждый клик
clicks$.pipe(scan((count) => count + 1, 0)).subscribe();
```

*   **Ошибка 2: Прямая мутация аккумулятора внутри `scan`**
    *   *Симптомы:* Нарушение целостности истории состояния, проблемы при использовании с `distinctUntilChanged` или `shareReplay`.
    *   *Физика процесса:* Разработчик вызывает `acc.push(item)` и возвращает тот же самый массив. Ссылка на состояние в памяти не меняется.
    *   *Решение:* Всегда возвращайте новый объект или массив через spread-оператор: `return [...acc, item]`.

*   **Ошибка 3: Пропуск начального значения (`seed`)**
    *   *Симптомы:* Первое событие передается в аккумулятор без обработки редьюсером.
    *   *Физика процесса:* Если начальное значение (`seed`) не указано, `scan` возьмет первый элемент потока в качестве стартового аккумулятора и начнет выполнять редьюсер только со второго элемента.
    *   *Решение:* Всегда явно передавайте второй аргумент `seed` в оператор `scan(fn, initialSeed)`.
