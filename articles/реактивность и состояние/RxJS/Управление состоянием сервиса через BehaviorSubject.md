---
tags: [angular, RxJS, архитектура]
related: ["[[Изменяемое реактивное состояние (signal).md]]", "[[Преобразования RxJS потоков (switchMap, concatMap).md]]", "[[Совместное использование потоков (shareReplay).md]]"]
status: "completed"
---

# Управление состоянием сервиса через BehaviorSubject

## БЫСТРЫЙ СТАРТ

*   **Класс `BehaviorSubject<T>`** — специализированный тип данных в RxJS (разновидность `Subject`), который выступает в роли реактивной ячейки памяти. Он хранит «текущее» значение состояния и принудительно отправляет его любому новому подписчику в момент вызова `.subscribe()`.
*   **Два ключевых отличия от обычного Subject:**
    *   Требует обязательное начальное значение при инициализации в конструкторе.
    *   Предоставляет синхронный доступ к текущему состоянию через метод `.getValue()`.
*   **Правила использования:**
    *   **Используйте:** Для организации разделяемого асинхронного состояния в сервисах (данные корзины, кэш профиля, состояние фильтрации), объединения нескольких асинхронных стримов с помощью оператора `combineLatest`, или реактивного представления потоковых данных (WebSockets, SSE).
    *   **Не используйте:** Для управления локальным синхронным состоянием элементов интерфейса (для этого намного производительнее использовать сигналы `signal()`, которые не требуют ручной отписки и работают быстрее вне зоны Change Detection).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Реактивный сервис состояния (Service-Store Pattern)
*   **Назначение:** Организация безопасного однонаправленного потока данных (Unidirectional Data Flow) внутри глобальной службы, где состояние защищено от прямой модификации извне.

```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Описываем иммутабельную структуру состояния сервиса
export interface UserCartState {
  items: Array<{ id: string; name: string; price: number }>;
  discountCode: string | null;
}

const initialCartState: UserCartState = {
  items: [],
  discountCode: null
};

@Injectable({
  providedIn: 'root'
})
export class UserCartStateService {
  // 1. Объявляем приватный BehaviorSubject, хранящий текущее состояние.
  // Закрываем его модификатором private, чтобы внешние компоненты не могли вызвать метод .next() напрямую.
  private readonly state$ = new BehaviorSubject<UserCartState>(initialCartState);

  // 2. Экспортируем состояние наружу в виде холодного Observable с помощью .asObservable().
  // Это гарантирует соблюдение инкапсуляции: компоненты могут только читать состояние.
  public readonly cartState$: Observable<UserCartState> = this.state$.asObservable();

  // 3. Создаем специализированные реактивные селекторы для вычисления производных данных
  public readonly cartCount$: Observable<number> = this.cartState$.pipe(
    map((state) => state.items.length)
  );

  public readonly totalPrice$: Observable<number> = this.cartState$.pipe(
    map((state) => {
      const sum = state.items.reduce((acc, item) => acc + item.price, 0);
      return state.discountCode ? sum * 0.9 : sum; // Скидка 10% при наличии промокода
    })
  );

  /**
   * Возвращает мгновенный синхронный снимок текущего состояния (только для чтения)
   */
  public getSnapshot(): UserCartState {
    return this.state$.getValue();
  }

  /**
   * Добавляет элемент в корзину (Иммутабельно)
   */
  public addItem(item: { id: string; name: string; price: number }): void {
    const currentState = this.getSnapshot();
    
    // Рассылаем по потоку новое состояние. Ссылку на объект обязательно обновляем!
    this.state$.next({
      ...currentState,
      items: [...currentState.items, item]
    });
  }

  /**
   * Очищает состояние корзины
   */
  public clearCart(): void {
    this.state$.next(initialCartState);
  }
}
```

---

### Шаблон 2: Объединение потоков фильтрации через combineLatest
*   **Назначение:** Организация автоматического перезапуска асинхронного поиска при изменении любого из параметров фильтрации (поисковой строки, категории или пагинации).

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface SearchFilters {
  query: string;
  category: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductSearchService {
  private readonly http = inject(HttpClient);
  private readonly api = 'https://api.enterprise-service.com/v1/products';

  // Создаем независимые источники событий для каждого фильтра
  public readonly searchQuery$ = new BehaviorSubject<string>('');
  public readonly selectedCategory$ = new BehaviorSubject<string>('all');

  // Декларативно объединяем потоки. 
  // При изменении любого из них combineLatest испустит массив с их актуальными значениями.
  public readonly searchResults$: Observable<unknown> = combineLatest([
    this.searchQuery$.pipe(
      debounceTime(300),          // Задержка 300мс для защиты от спама запросами при вводе
      distinctUntilChanged()      // Пропускаем дальше только если текст реально изменился
    ),
    this.selectedCategory$
  ]).pipe(
    // Преобразуем массив параметров в сетевой HTTP-запрос
    switchMap(([query, category]) => {
      let params = new HttpParams();
      if (query) params = params.set('search', query);
      if (category !== 'all') params = params.set('category', category);

      return this.http.get<unknown>(this.api, { params });
    })
  );
}
```

---

### Шаблон 3: Декларативный рендеринг состояния в компоненте через AsyncPipe
*   **Назначение:** Чтение реактивного потока сервиса в UI-компоненте с автоматическим управлением подписками на уровне шаблона.

```typescript
import { Component, inject } from '@angular/core';
import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { UserCartStateService } from './user-cart-state.service';

@Component({
  selector: 'app-cart-preview',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe],
  template: `
    <div class="cart-box">
      <!-- Подписываемся на реактивные потоки через AsyncPipe -->
      <p>Количество товаров: <b>{{ cartCount$ | async }}</b></p>
      <p>Сумма к оплате: <b>{{ totalPrice$ | async | currency }}</b></p>

      <button (click)="addProduct()">Добавить демо-товар</button>
      <button (click)="clear()">Очистить корзину</button>
    </div>
  `
})
export class CartPreviewComponent {
  private readonly cartService = inject(UserCartStateService);

  // Передаем ссылки на холодные потоки напрямую в шаблон
  public readonly cartCount$ = this.cartService.cartCount$;
  public readonly totalPrice$ = this.cartService.totalPrice$;

  public addProduct(): void {
    this.cartService.addItem({
      id: crypto.randomUUID(),
      name: 'Книга по архитектуре Angular',
      price: 49.99
    });
  }

  public clear(): void {
    this.cartService.clearCart();
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Физика мультикастинга и сохранение состояния в BehaviorSubject
Базовые стримы `Observable` в RxJS по умолчанию являются «холодными» (Cold). Это означает, что они не хранят данные в памяти: код внутри создания потока запускается заново для каждого нового подписчика, и если в потоке никто не слушает события, испускаемые значения беспрепятственно уничтожаются в куче (Heap).

`BehaviorSubject` устроен как «горячий» (Hot) многовещательный поток (Multicast Observable). Он решает три важные задачи:
1.  **Наличие кэша (State Cache):** Внутри класса `BehaviorSubject` объявлено приватное свойство `_value`. При каждом вызове `.next(val)` новое значение синхронно перезаписывает это свойство.
2.  **Эмиссия при подписке (Late Subscription Replay):** Когда новый клиент вызывает метод `.subscribe(handler)`, BehaviorSubject сразу считывает текущее значение из `_value` и синхронно отправляет его этому клиенту. Клиенту не нужно ждать, пока произойдет следующее событие изменения состояния.
3.  **Многоадресная рассылка (Multicasting):** При вызове `.next()` одно и то же значение рассылается абсолютно всем активным подписчикам из внутреннего массива реестра слушателей.

### 2. Зачем нужен вызов .asObservable()
Почему прямое предоставление доступа к `BehaviorSubject` внешним компонентам считается нарушением архитектуры?

```typescript
// КРИТИЧЕСКОЕ НАРУШЕНИЕ ИНКАПСУЛЯЦИИ
public readonly state$ = new BehaviorSubject<MyState>(initial);
```

Если компонент получает прямую ссылку на `Subject`, любой разработчик в команде сможет написать внутри кода компонента:
```typescript
this.myService.state$.next(corruptedState);
```
Это полностью разрушает предсказуемость приложения. Состояние изменяется в обход методов сервиса, отследить точку мутации становится невозможно, нарушается принцип однонаправленного потока данных (Unidirectional Data Flow).

Вызов `state$.asObservable()` возвращает чистый экземпляр класса `Observable`, у которого полностью отсутствуют методы `.next()`, `.complete()` или `.error()`. Это возводит жесткую архитектурную границу: изменять данные имеет право строго сам сервис через свои публичные методы, а компоненты могут только пассивно наблюдать за изменениями.

### 3. Пошаговый разбор слияния потоков в combineLatest
Давайте разберем, как работает конвейер `combineLatest` в Шаблоне 2 при вводе текста:

1.  **Инициализация:** При старте оба BehaviorSubject испускают стартовые значения: `combineLatest` получает `['', 'all']`. Сетевой запрос уходит на сервер за полным списком товаров.
2.  **Действие пользователя:** Пользователь начинает вводить текст: `a`, `n`, `g`.
3.  **Прохождение конвейера:**
    *   Оператор `debounceTime(300)` придерживает каждое событие ввода на 300мс, отсекая промежуточные буквы и защищая бэкенд от лишней нагрузки.
    *   После паузы ввод стабилизируется на слове `ang`.
    *   Оператор `distinctUntilChanged()` проверяет, отличается ли текущий ввод от предыдущего. Да, отличается.
4.  **Слияние:** Измененный поток `searchQuery$` испускает значение `ang`. Поток `selectedCategory$` не менялся и по-прежнему хранит `'all'`.
5.  **Срабатывание combineLatest:** Оператор мгновенно объединяет данные в кортеж: `['ang', 'all']` и передает его дальше по цепочке.
6.  **Сброс старого запроса:** Оператор `switchMap` перехватывает новые параметры, автоматически отменяет предыдущий (еще выполняющийся на медленном интернете) GET-запрос и инициирует новый запрос `?search=ang`.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Прямая мутация состояния внутри BehaviorSubject (Mutability Leak)**
    *   *Симптомы:* Новые данные записываются в сервис, но некоторые компоненты, подписанные на поток, не перерисовываются, либо данные хаотично меняются в разных частях экрана.
    *   *Физика процесса:* Разработчик изменяет свойство объекта состояния напрямую, нарушая иммутабельность, и пропихивает ту же самую ссылку в поток:
        ```typescript
        const state = this.state$.getValue();
        state.items.push(newItem); // Мутация! Ссылка на объект осталась прежней
        this.state$.next(state);
        ```
        Поскольку ссылка на объект `state` не изменилась, операторы сравнения (например, `distinctUntilChanged` в нижележащих потоках) посчитают, что в потоке ничего не произошло, и полностью заблокируют прохождение событий.
    *   *Решение:* Всегда обновляйте состояние иммутабельно, создавая новый объект через spread-оператор.

```typescript
// ОШИБКА: Мутация объекта по старой ссылке сломает реактивность
// const state = this.state$.getValue();
// state.discountCode = 'NEW_VAL';
// this.state$.next(state);

// ИСПРАВЛЕНИЕ: Создание нового объекта на новой ссылке в памяти
const state = this.state$.getValue();
this.state$.next({
  ...state,
  discountCode: 'NEW_VAL'
});
```

*   **Ошибка 2: Утечка памяти при ручной подписке внутри компонентов**
    *   *Симптомы:* Медленный рост потребления оперативной памяти вкладкой браузера при переходах по страницам. Поведение приложения дублируется или ломается после длительной работы.
    *   *Физика процесса:* Разработчик вызывает `.subscribe()` внутри компонента и забывает сохранить подписку для её последующего уничтожения. Поскольку BehaviorSubject в синглтон-сервисе живет вечно, он продолжает удерживать ссылки на коллбэки подписок уничтоженных компонентов в куче памяти (Heap), блокируя работу сборщика мусора.
    *   *Решение:* По возможности используйте `AsyncPipe` в шаблоне (как в Шаблоне 3) — он управляет жизненным циклом подписки автоматически. Если ручная подписка в классе неизбежна, обязательно завершайте её через `takeUntilDestroyed()`.

```typescript
// ОШИБКА: Поток останется активным после уничтожения компонента
// this.cartService.cartCount$.subscribe(count => { ... });

// ИСПРАВЛЕНИЕ: Автоматическая отписка по DestroyRef
this.cartService.cartCount$.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(count => { ... });
```

*   **Ошибка 3: Избыточное и нереактивное использование .getValue() для бизнес-логики**
    *   *Симптомы:* Код выглядит как спагетти из императивных проверок, теряется реактивность приложения, данные на UI отображаются с задержками или требуют ручной перезагрузки.
    *   *Физика процесса:* Разработчик злоупотребляет методом `.getValue()`, используя его вместо композиции реактивных операторов. Он синхронно считывает данные из разных сервисов в момент клика и строит на них логику, полностью ломая реактивный граф зависимостей.
    *   *Решение:* Используйте метод `.getValue()` только для быстрого иммутабельного чтения («снимка») состояния при записи новых данных в методах-экшенах сервиса. Всю логику чтения и комбинирования данных стройте на декларативных RxJS-операторах (`map`, `switchMap`, `withLatestFrom`).