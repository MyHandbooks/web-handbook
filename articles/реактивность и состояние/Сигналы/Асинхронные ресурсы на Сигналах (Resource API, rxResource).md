---
tags: [angular, сигналы, архитектура]
related: ["[[Изменяемое реактивное состояние (signal).md]]", "[[Преобразование потока в сигнал (toSignal).md]]"]
status: "completed"
---

# Асинхронные ресурсы на Сигналах (Resource API, rxResource)

## БЫСТРЫЙ СТАРТ

*   **Проблема синхронности:** Базовые сигналы Angular (`signal`, `computed`) являются строго синхронными примитивами. Для встраивания асинхронных операций (сетевых запросов) в реактивный граф без ручных подписок и хуков в Angular 19+ представлены нативные **Ресурсы (Resource API)**.
*   **Три основных примитива:**
    *   `resource()` — базовая функция, работающая на промисах (идеально для нативного `fetch`).
    *   `rxResource()` — реактивная обертка из пакета `@angular/core/rxjs-interop`, работающая с `Observable` (идеально для интеграции с RxJS-сервисами).
    *   `httpResource()` (стандарт Angular 19.2+) — специализированный высокопроизводительный хелпер, интегрированный напрямую с `HttpClient` для максимального сокращения бойлерплейта.
*   **Используйте для:** декларативного сетевого запроса данных на основе реактивных параметров (`params`), автоматического отслеживания статусов загрузки (`isLoading`, `error`) в виде сигналов и нативной отмены зависших запросов.
*   **Не используйте для:** простых синхронных трансформаций данных (для этого предназначен `computed`) или чистых побочных эффектов без возврата данных (используйте `effect`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Декларативный запрос на промисах через `resource()`
*   **Назначение:** Автоматический сетевой зарос карточки товара через нативный `fetch` каждый раз, когда меняется входной сигнал идентификатора товара, с автоматическим прерыванием старого запроса.

#### 1. Файл логики: `product-card.ts`
```typescript
import { Component, signal, resource, ChangeDetectionStrategy } from '@angular/core';

export interface ProductDetails {
  id: string;
  title: string;
  price: number;
}

@Component({
  selector: 'app-product-card',
  // standalone: true опускается по умолчанию начиная с v19
  imports: [],
  templateUrl: './product-card.html',
  styleUrl: './product-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCard { // Имя класса очищено от суффикса Component
  // Управляющий реактивный сигнал
  public readonly productId = signal<string>('prod-102');

  // Описываем асинхронный ресурс на промисах
  public readonly productResource = resource<ProductDetails, string>({
    // Свойство params определяет реактивную зависимость.
    // Каждый раз, когда меняется productId(), params пересчитывается и запускает loader
    params: () => this.productId(),
    
    // Функция loader выполняет асинхронный запрос.
    // Параметр abortSignal автоматически прервет предыдущий запрос в браузере при смене ID
    loader: ({ params: id, abortSignal }) => {
      const url = `https://api.enterprise-service.com/v1/products/${id}`;
      return fetch(url, { signal: abortSignal }).then((res) => {
        if (!res.ok) throw new Error('Не удалось получить детали товара');
        return res.json() as Promise<ProductDetails>;
      });
    }
  });

  public switchProduct(id: string): void {
    this.productId.set(id);
  }
}
```

#### 2. Файл разметки: `product-card.html`
```html
<div class="card">
  <div class="actions">
    <button (click)="switchProduct('prod-102')">Загрузить товар 102</button>
    <button (click)="switchProduct('prod-504')">Загрузить товар 504</button>
  </div>

  <!-- Отслеживаем состояние загрузки напрямую через сигнал isLoading -->
  @if (productResource.isLoading()) {
    <p>Загрузка деталей товара с сервера...</p>
  } @else if (productResource.error()) {
    <!-- Ловим ошибки сети как сигналы -->
    <p class="error">Ошибка: {{ productResource.error() }}</p>
  } @else {
    <!-- Считываем значение сигнала value() -->
    <div class="details">
      <h4>{{ productResource.value()?.title }}</h4>
      <p>Цена: {{ productResource.value()?.price }} $</p>
    </div>
  }
</div>
```

#### 3. Файл стилей: `product-card.css`
```css
.card {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.error {
  color: var(--error-text);
}
```

---

### Шаблон 2: Интеграция с RxJS сервисами через `rxResource()`
*   **Назначение:** Использование преимуществ Сигналов в UI-шаблоне при получении данных из существующего RxJS-сервиса на базе `HttpClient`.

#### 1. Файл логики: `user-profile.ts`
```typescript
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';

export interface UserAccount {
  id: string;
  email: string;
}

@Component({
  selector: 'app-user-profile',
  imports: [],
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserProfile {
  private readonly http = inject(HttpClient);
  
  public readonly activeUserId = signal<string>('usr-10');

  // Преобразуем RxJS-поток в сигнальный ресурс.
  // Лоадер rxResource обязан возвращать RxJS Observable вместо Promise
  public readonly userResource = rxResource<UserAccount, string>({
    params: () => this.activeUserId(),
    loader: ({ params: id }) => {
      const url = `https://api.enterprise-service.com/v1/users/${id}`;
      return this.http.get<UserAccount>(url); // Возвращаем Observable
    }
  });
}
```

#### 2. Файл разметки: `user-profile.html`
```html
<div class="profile">
  @if (userResource.isLoading()) {
    <p>Подключение к потоку данных пользователя...</p>
  } @else {
    <p>Email: {{ userResource.value()?.email }}</p>
  }
</div>
```

#### 3. Файл стилей: `user-profile.css`
```css
.profile {
  padding: 12px;
  background-color: var(--bg-secondary);
  border-radius: 6px;
}
```

---

### Шаблон 3: Оптимизированный HTTP-запрос через `httpResource()`
*   **Назначение:** Использование специализированного API (Angular 19.2+) для максимального сокращения бойлерплейта при интеграции с `HttpClient`.

#### 1. Файл логики: `weather-widget.ts`
```typescript
import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { httpResource } from '@angular/common/http';

export interface WeatherData {
  temp: number;
  city: string;
}

@Component({
  selector: 'app-weather-widget',
  imports: [],
  templateUrl: './weather-widget.html',
  styleUrl: './weather-widget.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeatherWidget {
  public readonly activeCity = signal<string>('Moscow');

  // httpResource автоматически берет на себя вызов HttpClient,
  // обработку отмены (abort) и формирование лоадера под капотом.
  // Первым аргументом передается реактивная функция вычисления URL/параметров
  public readonly weather = httpResource<WeatherData>(() => {
    return `https://api.weather-service.com/v1/forecast?city=${this.activeCity()}`;
  });
}
```

#### 2. Файл разметки: `weather-widget.html`
```html
<div class="widget">
  @if (weather.isLoading()) {
    <p>Запрос погоды...</p>
  } @else {
    <p>Температура в {{ weather.value()?.city }}: {{ weather.value()?.temp }}°C</p>
  }
</div>
```

#### 3. Файл стилей: `weather-widget.css`
```css
.widget {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Декларативная архитектура и каскадный запуск Loader
В отличие от императивных подходов, где разработчик вручную подписывается на события ввода и вызывает сетевой метод (`this.load()`), Resource API работает строго декларативно на базе реактивного графа.

Каждый ресурс состоит из двух ключевых секций:
1.  **Секция `params` (Издатель):** Это реактивное замыкание, которое считывает любые внешние сигналы (например, номер страницы, поисковый запрос, флаги фильтров). Поведение секции идентично `computed()`: при изменении любого считанного внутри сигнала вычисляется новое значение параметров, и ресурс помечается как dirty.
2.  **Секция `loader` (Потребитель):** Это асинхронный исполнитель. Как только секция `params` генерирует новое стабильное значение, Angular автоматически запускает `loader`, передавая вычисленные параметры в аргументы функции.

### 2. Нативная отмена запросов (AbortSignal) и предотвращение Race Conditions
В классических веб-приложениях существует острая проблема состояния гонки (Race Conditions). Если пользователь быстро переключает страницы (с 1 на 2, затем на 3), в сеть уходят три параллельных запроса. Из-за разного времени прохождения пакетов ответ от страницы 1 может вернуться позже, чем ответ от страницы 3, перезаписав актуальные данные на экране.

Resource API решает эту проблему на нативном аппаратном уровне браузера:
*   Функция `loader` принимает объект параметров, содержащий нативный экземпляр **`abortSignal`** (класса `AbortSignal`).
*   Если пользователь меняет параметры (вызывает повторный запуск `loader`) до того, как предыдущий сетевой запрос успел завершиться, Angular автоматически генерирует событие отмены на предыдущем `abortSignal`.
*   Если этот сигнал был передан в нативный `fetch(url, { signal: abortSignal })` или HttpClient, браузер мгновенно обрывает текущее TCP-соединение на уровне операционной системы, предотвращая утечку трафика и гарантируя, что на экране всегда отобразятся только самые свежие и актуальные данные.

### 3. Сигнальный граф состояний ресурса
Экземпляр созданного ресурса не является простым хранилищем значения. Это сложный объект, экспортирующий набор связанных сигналов только для чтения:
*   `value` — сигнал, хранящий текущие успешно полученные данные (`Signal<T | undefined>`).
*   `status` — сигнал текущего состояния жизненного цикла ресурса. Принимает строго фиксированные значения: `'idle'` (ожидание), `'loading'` (выполняется запрос), `'resolved'` (успешно завершен), `'errored'` (завершился сбоем).
*   `error` — сигнал, хранящий перехваченную ошибку (`Signal<unknown>`).
*   `isLoading` — удобный вспомогательный булев сигнал, вычисляемый как `status === 'loading'`.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Чтение `resource.value()` в шаблоне при возникновении серверной ошибки (Error Throw Crash)**
    *   *Симптомы:* Сетевой запрос завершился ошибкой `500`, после чего все приложение падает с белым экраном, а в консоли появляется необработанное исключение при чтении данных.
    *   *Физика процесса:* По спецификации Resource API, если статус ресурса переходит в `'errored'`, любая попытка прочитать значение сигнала `value()` принудительно выбрасывает зафиксированную ошибку наружу в рантайм. Это сделано для предотвращения отображения неактуальных "загрязненных" данных, но ломает рендеринг Angular, если ошибка не была перехвачена.
    *   *Решение:* Перед чтением `value()` в шаблоне или computed-сигналах всегда проверяйте статус загрузки через сигналы `error()` или `status()`, либо используйте вспомогательный метод `hasValue()`.

```html
<!-- ПЛОХО (Если произойдет ошибка, чтение value() обрушит приложение) -->
<h4>{{ productResource.value().title }}</h4>

<!-- ХОРОШО (Безопасная проверка наличия значения с помощью Control Flow) -->
@if (productResource.error()) {
  <p>Ошибка: {{ productResource.error() }}</p>
} @else if (productResource.value(); as data) {
  <h4>{{ data.title }}</h4>
}
```

*   **Ошибка 2: Нарушение реактивности из-за чтения сигналов внутри `loader` в обход `params`**
    *   *Симптомы:* Сигнал-параметр изменился во внешнем коде, но ресурс упорно не запускает повторную отправку сетевого запроса.
    *   *Физика процесса:* Разработчик прочитал управляющий сигнал напрямую внутри тела функции `loader`, пропустив его объявление в секции `params`. Сама функция `loader` выполняется вне реактивного контекста отслеживания зависимостей, поэтому изменения сигналов внутри неё игнорируются.
    *   *Решение:* Всегда выносите любые динамические сигналы-зависимости в секцию `params` (как показано в Шаблонах).

```typescript
ОШИБКА: loader запускается один раз, так как params пуст и не создает связь в графе
product = resource({
  loader: () => fetch(`/api/${this.productId()}`) // ! productId прочитан мимо params
});

// ИСПРАВЛЕНИЕ: Параметр productId объявлен в params
@Component({
  selector: 'app-fixed-resource',
  templateUrl: './fixed-resource.html',
  styleUrl: './fixed-resource.css'
})
export class FixedResource {
  readonly productId = signal('123');
  readonly product = resource({
    params: () => this.productId(),
    loader: ({ params: id }) => fetch(`/api/${id}`).then(res => res.json())
  });
}
```

*   **Ошибка 3: Ложное зависание ресурсов при использовании httpResource без provideHttpClient**
    *   *Симптомы:* Ошибка компиляции или рантайм-сбой при вызове `httpResource()`.
    *   *Физика процесса:* `httpResource()` под капотом обращается к системному `HttpClient`. Если вы забыли зарегистрировать провайдер HttpClient в глобальном конфигурационном файле `app.config.ts` вашего Standalone-приложения, ресурс не сможет инициализироваться.
    *   *Решение:* Убедитесь, что в списке провайдеров `appConfig` присутствует вызов `provideHttpClient()`.