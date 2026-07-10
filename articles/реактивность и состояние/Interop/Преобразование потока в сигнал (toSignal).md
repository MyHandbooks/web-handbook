---
tags: [angular, сигналы, RxJS, interop]
related: ["[[Преобразование сигнала в поток (toObservable).md]]", "[[Автоматическая отписка в RxJS через takeUntilDestroyed и DestroyRef.md]]"]
status: "completed"
---

# Преобразование потока в сигнал (toSignal)

## БЫСТРЫЙ СТАРТ

*   **Функция `toSignal()`** — утилита из официального пакета `@angular/core/rxjs-interop`, которая преобразует асинхронный поток RxJS `Observable` в реактивный сигнал `Signal` только для чтения. Она выступает в роли моста между RxJS-сервисами и шаблонами компонентов на Сигналах.
*   **Автоматическое управление жизненным циклом:** Вызов `toSignal()` немедленно инициирует внутреннюю подписку на переданный поток `Observable`. При уничтожении содержащего его контекста (компонент, директива или служба) утилита автоматически выполняет отписку от сетевого источника, полностью предотвращая утечки памяти.
*   **Специфика начального значения:** Сигнал обязан всегда иметь синхронное значение. Так как потоки асинхронны, `toSignal` предоставляет три стратегии инициализации:
    1.  Возврат `undefined` по умолчанию, пока поток не испустит первое реальное значение.
    2.  Явное указание начального состояния: `toSignal(stream$, { initialValue: default })`.
    3.  Режим `requireSync: true` — жесткое требование к потоку выдать значение немедленно и синхронно при подписке (идеально для `BehaviorSubject` или потоков на базе `of()`).
*   **Правила использования:**
    *   **Используйте:** Для вывода асинхронных сетевых данных, параметров роутинга или состояния асинхронных RxJS-сервисов в современные HTML-шаблоны без использования громоздкого `AsyncPipe` и ручных подписок.
    *   **Не используйте:** Внутри непостоянных циклов, асинхронных функций или обычных методов класса. Метод `toSignal` должен объявляться в контексте создания класса (Injection Context).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Преобразование HTTP-запроса с начальным значением
*   **Назначение:** Преобразование асинхронного Observable сетевого запроса в сигнал для вывода списка записей в шаблоне с защитой от `undefined` на этапе инициализации.

#### 1. Файл логики: `catalog-view.ts`
```typescript
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CatalogItem {
  id: string;
  title: string;
}

@Component({
  selector: 'app-catalog-view',
  imports: [], // standalone: true опускается по умолчанию начиная с v19
  templateUrl: './catalog-view.html',
  styleUrl: './catalog-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogView { // Имя класса очищено от суффикса Component
  private readonly http = inject(HttpClient);
  private readonly api = 'https://api.enterprise-service.com/v1/items';

  // 1. Описываем классический холодный RxJS-поток сетевого запроса
  private readonly items$: Observable<CatalogItem[]> = this.http.get<CatalogItem[]>(this.api);

  // 2. Преобразуем поток в строго типизированный сигнал только для чтения (Signal<CatalogItem[]>).
  // Функция toSignal() вызывается строго на этапе объявления свойств класса (Injection Context).
  public readonly items = toSignal<CatalogItem[], CatalogItem[]>(this.items$, {
    // Задаем синхронный пустой массив в качестве начального значения до прихода ответа сервера
    initialValue: []
  });
}
```

#### 2. Файл разметки: `catalog-view.html`
```html
<div class="catalog-card">
  <h3>Каталог товаров</h3>
  
  <ul>
    <!-- Считываем сигнал items(). Благодаря initialValue, нам не нужна проверка на null/undefined -->
    @for (item of items(); track item.id) {
      <li>{{ item.title }}</li>
    } @empty {
      <li>Загрузка товаров или каталог пуст...</li>
    }
  </ul>
</div>
```

#### 3. Файл стилей: `catalog-view.css`
```css
.catalog-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background-color: var(--bg-secondary);
}
```

---

### Шаблон 2: Синхронное преобразование BehaviorSubject (requireSync)
*   **Назначение:** Преобразование потока горячего состояния сервиса в сигнал без необходимости дублировать начальное значение.

#### 1. Файл логики: `cart-status.ts`
```typescript
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UserCartStateService } from './user-cart-state.service';

@Component({
  selector: 'app-cart-status',
  imports: [],
  templateUrl: './cart-status.html',
  styleUrl: './cart-status.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartStatus {
  private readonly cartService = inject(UserCartStateService);

  // Преобразуем поток cartCount$ (который под капотом возвращает BehaviorSubject) в Сигнал.
  // Так как поток испускает первое значение мгновенно при подписке,
  // мы можем безопасно активировать флаг requireSync: true.
  // Это гарантирует возврат Signal<number> вместо Signal<number | undefined> без передачи initialValue.
  public readonly totalCount = toSignal(this.cartService.cartCount$, {
    requireSync: true
  });
}
```

#### 2. Файл разметки: `cart-status.html`
```html
<div class="status-badge">
  <!-- Нам гарантировано наличие числа, так как поток BehaviorSubject имеет начальное значение -->
  <p>Товаров в корзине: {{ totalCount() }}</p>
</div>
```

#### 3. Файл стилей: `cart-status.css`
```css
.status-badge {
  padding: 12px;
  border-left: 4px solid var(--accent);
  background-color: var(--bg-secondary);
}
```

---

### Шаблон 3: Безопасный перехват сетевых ошибок внутри конвейера toSignal
*   **Назначение:** Реализация надежной схемы, предотвращающей крах шаблона рендеринга при возникновении ошибок на сетевом уровне во время асинхронного преобразования.

#### 1. Файл логики: `safe-config.ts`
```typescript
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-safe-config',
  imports: [],
  templateUrl: './safe-config.html',
  styleUrl: './safe-config.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SafeConfig {
  private readonly http = inject(HttpClient);
  private readonly api = 'https://api.enterprise-service.com/v1/config';

  private readonly config$ = this.http.get<{ apiVersion: string }>(this.api).pipe(
    // Критически важно: гасим ошибку внутри потока ДО передачи его в toSignal.
    // Если этого не сделать, ошибка в сети полностью заблокирует чтение сигнала в HTML!
    catchError((err: Error) => {
      console.error('[Config] Сбой сети. Откатываемся на резервные настройки:', err);
      // Возвращаем резервный безопасный объект в поток
      return of({ apiVersion: '1.0.0-fallback' });
    })
  );

  // Преобразуем стабилизированный поток в сигнал
  public readonly appConfig = toSignal(this.config$, {
    initialValue: { apiVersion: 'Загрузка...' }
  });
}
```

#### 2. Файл разметки: `safe-config.html`
```html
<div class="config-box">
  <!-- Сигнал всегда вернет валдиный объект благодаря catchError внутри трубы -->
  <p>Версия системы: {{ appConfig().apiVersion }}</p>
</div>
```

#### 3. Файл стилей: `safe-config.css`
```css
.config-box {
  padding: 16px;
  border: 1px solid var(--border);
  background-color: var(--bg-secondary);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика моста toSignal и авто-отписка
Под капотом `toSignal` разворачивается полноценный реактивный мост между асинхронной моделью проталкивания (Push) RxJS и синхронной моделью стягивания (Pull) Сигналов.

Разберем низкоуровневые шаги, которые делает Angular при инициализации:
1.  **Создание WritableSignal:** Внутри `toSignal` создается скрытый изменяемый сигнал `stateSignal = signal(initialValue)`.
2.  **Запуск подписки:** Angular немедленно синхронно подписывается на переданный `Observable`:
    ```typescript
    const subscription = source$.subscribe({
      next: (value) => stateSignal.set(value), // При каждом событии обновляем внутренний сигнал
      error: (err) => stateSignal.error(err)   // Если поток упал, переносим ошибку в сигнал
    });
    ```
3.  **Автоматическая утилизация:** Функция `toSignal` запрашивает ссылку на текущий `DestroyRef` из Injection Context. С его помощью регистрируется хук деструктора:
    ```typescript
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      subscription.unsubscribe(); // Гарантированная отписка при уничтожении контекста
    });
    ```

Таким образом, `toSignal` полностью освобождает разработчика от необходимости использовать `AsyncPipe` в шаблоне или писать ручной бойлерплейт для отписок в коде компонента.

### 2. Принцип работы requireSync: Строгость времени компиляции и рантайма
Параметр `requireSync: true` сообщает компилятору Angular: *«Этот поток гарантированно испустит значение немедленно. Тебе не нужно подмешивать тип undefined к возвращаемой сигнатуре сигнала»*.

Давайте детально разберем, как ведет себя система:
*   **На этапе компиляции:** Тип возвращаемого сигнала будет чистым `Signal<T>` вместо `Signal<T | undefined>`. Это избавляет вас от необходимости писать проверки `*ngIf` или безопасную навигацию `?.` в шаблонах.
*   **В рантайме (Runtime):** Как только Angular запускает `toSignal(stream$, { requireSync: true })`, он выполняет синхронную подписку. Если поток асинхронный (например, холодный HTTP GET запрос) и не возвращает значение моментально в момент вызова `.subscribe()`, Angular мгновенно выбросит жесткое системное исключение:
    `NG01201: toSignal() requires a value but the Observable did not emit synchronously.`

Используйте `requireSync: true` только тогда, когда источником потока выступает `BehaviorSubject`, `ReplaySubject(1)` или синхронный генератор значений `of(value)`.

### 3. Пошаговый разбор преобразования HTTP-запроса
Рассмотрим движение данных в `CatalogView` (Шаблон 1) по шагам:

1.  **Компиляция класса:** Angular вызывает `toSignal` для свойства `items`. Срабатывает немедленная подписка на `this.items$`.
2.  **Первичный рендеринг:** Шаблон считывает сигнал `items()`. Так как ответ от сервера еще не пришел, сигнал мгновенно возвращает переданный `initialValue: []`. HTML выводит пустой список товаров.
3.  **Приход ответа:** Спустя 250мс сервер присылает JSON-массив из 5 товаров.
4.  **Мутация сигнала:** Внутренняя подписка `toSignal` ловит событие `next` и вызывает `.set(newItems)` на внутреннем сигнале.
5.  **Перерисовка:** Сигнал помечает шаблон компонента как dirty. Angular запускает цикл Change Detection, считывает новое состояние сигнала `items()` и рендерит 5 товаров на экране.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Вызов toSignal() вне Injection Context (Методы, хуки)**
    *   *Симптомы:* Ошибка рантайма `NG0203: toSignal() can only be used within an active injection context`.
    *   *Физика процесса:* Разработчик пытается вызвать преобразование динамически внутри метода или жизненного цикла: `ngOnInit() { this.items = toSignal(this.items$); }`. Поскольку `toSignal` под капотом обязан вызвать `inject(DestroyRef)` для настройки авто-отписки, он может выполняться строго там, где доступен механизм внедрения зависимостей — в конструкторе или при объявлении полей класса.
    *   *Решение:* Перенесите вызов `toSignal` на этап объявления свойств класса. Если динамический вызов неизбежен, передайте в него `Injector` вручную.

```typescript
// ОШИБКА: toSignal() внутри ngOnInit() упадет в рантайме
// ngOnInit() { this.items = toSignal(this.items$); }

// ИСПРАВЛЕНИЕ А (Лучшее): Объявление в контексте инициализации класса
@Component({
  selector: 'app-good',
  templateUrl: './good.html',
  styleUrl: './good.css'
})
export class Good {
  private readonly items$ = inject(HttpClient).get<CatalogItem[]>('/api/items');
  public readonly items = toSignal(this.items$, { initialValue: [] });
}

// ИСПРАВЛЕНИЕ Б: Передача инжектора вручную при динамическом вызове
@Component({
  selector: 'app-dynamic-good',
  templateUrl: './dynamic-good.html',
  styleUrl: './dynamic-good.css'
})
export class DynamicGood {
  private readonly injector = inject(Injector);
  private readonly items$ = inject(HttpClient).get<CatalogItem[]>('/api/items');

  public loadData(): void {
    const signalData = toSignal(this.items$, { injector: this.injector, initialValue: [] });
  }
}
```

*   **Ошибка 2: Падение шаблона при необработанной ошибке потока (Uncaught Error Crash)**
    *   *Симптомы:* Сетевой запрос завершился ошибкой `500`, после чего все приложение полностью «падает» (белый экран), а в консоли появляется необработанное исключение при чтении данных.
    *   *Физика процесса:* Если поток `Observable` завершается сигналом `error`, подписка внутри `toSignal` перехватывает его и записывает состояние ошибки внутрь сигнала. При попытке прочитать этот сигнал в шаблоне (`items()`), сигнал принудительно выбрасывает эту ошибку наружу в рантайм. Это мгновенно прерывает цикл Change Detection Angular и ломает рендеринг всего приложения.
    *   *Решение:* Всегда гасите и обрабатывайте сетевые ошибки с помощью `catchError` внутри трубы `Observable` **до** того, как поток будет передан в `toSignal`, как продемонстрировано в Шаблоне 3.

```typescript
// ОШИБКА: Ошибка сети убьет рендеринг шаблона Angular при чтении сигнала
// items = toSignal(this.http.get(url));

// ИСПРАВЛЕНИЕ: Ошибка перехвачена и заменена безопасным значением в трубе
@Component({
  selector: 'app-error-handled',
  templateUrl: './error-handled.html',
  styleUrl: './error-handled.css'
})
export class ErrorHandled {
  private readonly http = inject(HttpClient);
  
  public readonly items = toSignal(
    this.http.get<CatalogItem[]>('/api/items').pipe(
      catchError((err) => {
        console.error(err);
        return of([]); // Безопасный пустой массив в случае сбоя
      })
    ), 
    { initialValue: [] }
  );
}
```

*   **Ошибка 3: Попытка ручной перезаписи полученного сигнала**
    *   *Симптомы:* Ошибка компиляции `Property 'set' does not exist on type 'Signal<T>'`.
    *   *Физика процесса:* Разработчик относится к результату `toSignal` как к обычному сигналу и пытается изменить его значение в ответ на действия пользователя: `this.items.set(newItems)`. Утилита `toSignal` возвращает базовый тип `Signal<T>` (только для чтения), а не `WritableSignal<T>`. Направление данных в мосту строго однонаправленное: от `Observable` к `Signal`.
    *   *Решение:* Если вам нужно локально изменять состояние, делайте это на уровне исходного потока RxJS (например, прокидывая новые значения в BehaviorSubject), либо объявите независимый `linkedSignal`.

```typescript
// ОШИБКА: Нельзя записать данные в сигнал, созданный через toSignal
// mySignal = toSignal(this.myStream$);
// update() { this.mySignal.set(newValue); }

// ИСПРАВЛЕНИЕ: Данные изменяются на уровне исходного потока-источника
@Component({
  selector: 'app-editable-bridge',
  templateUrl: './editable-bridge.html',
  styleUrl: './editable-bridge.css'
})
export class EditableBridge {
  private readonly source$ = new BehaviorSubject<string>('default');
  public readonly mySignal = toSignal(this.source$, { requireSync: true });

  public update(newValue: string): void {
    this.source$.next(newValue); // Сигнал обновится автоматически по цепочке
  }
}
```