---
tags: [angular, сетевое-взаимодействие, HttpClient]
related: ["[[Конфигурация подмены провайдеров (app.config).md]]", "[[Обработка сетевых ошибок и авто-повтор (Retry).md]]", "[[Универсальные обобщения (Generics).md]]"]
status: "completed"
---

# Безопасный GET-запрос со сложными параметрами (HttpParams)

## БЫСТРЫЙ СТАРТ

*   **Класс `HttpParams`** — специализированный иммутабельный (неизменяемый) класс Angular, предназначенный для сериализации, подготовки и экранирования параметров строки запроса (Query Parameters).
*   **Иммутабельность как стандарт:** Любые операции модификации параметров (вызовы `.set()`, `.append()`, `.delete()`) не изменяют исходный объект, а возвращают новую копию `HttpParams` с примененными изменениями.
*   **Правила использования:**
    *   **Используйте:** Для передачи фильтров, параметров пагинации (номер страницы, лимит), сортировки, диапазонов дат и поисковых строк в GET-запросах.
    *   **Не используйте:** Для передачи тяжелых бинарных данных, файлов или сложных иерархических структур (для этого предназначены POST/PUT-запросы с телом в формате JSON или `FormData`). Не хардкодьте параметры вручную через интерполяцию строк вида `?param=${value}` — это приводит к уязвимостям сетевого уровня и ошибкам экранирования спецсимволов.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Типизированный GET-запрос с пагинацией, поиском и сортировкой
*   **Назначение:** Реализация надежной службы для получения данных с сервера, использующей строго типизированный интерфейс запроса параметров и иммутабельное построение `HttpParams`.

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// Строго описываем структуру входящих параметров фильтрации
export interface PaginationFilter {
  pageIndex: number; // Текущий индекс страницы (начиная с 0 или 1)
  pageSize: number;  // Количество записей на одну страницу
  sortBy: string;    // Имя поля для сортировки данных
  sortOrder: 'asc' | 'desc'; // Направление сортировки
  searchQuery?: string; // Необязательное поле для полнотекстового поиска
}

// Описываем тип элемента данных, возвращаемого сервером
export interface TargetItemDto {
  id: string;
  itemName: string;
  itemCategory: string;
  createdAt: string;
}

// Описываем обертку ответа сервера с метаданными пагинации
export interface PagedResponseOutput<T> {
  items: T[];         // Список элементов текущей страницы
  totalCount: number; // Общее количество элементов в БД для этого фильтра
}

@Injectable({
  providedIn: 'root'
})
export class DataQueryService {
  // Внедряем HttpClient через современный метод inject()
  private readonly http = inject(HttpClient);
  
  // Определяем базовый URL-адрес ресурса
  private readonly apiEndpoint = 'https://api.enterprise-service.com/v1/items';

  /**
   * Запрашивает страницу данных с сервера на основе переданного фильтра
   * @param filter Настройки пагинации и сортировки
   */
  public getPagedItems(filter: PaginationFilter): Observable<PagedResponseOutput<TargetItemDto>> {
    // Инициализируем HttpParams. Так как класс иммутабельный, мы собираем цепочку вызовов.
    // Каждый метод .set() возвращает новый экземпляр HttpParams.
    let queryParams = new HttpParams()
      .set('page', filter.pageIndex.toString()) // Переводим числа в строки, так как HttpParams принимает только string
      .set('limit', filter.pageSize.toString())
      .set('sort', filter.sortBy)
      .set('order', filter.sortOrder);

    // Безопасно проверяем наличие необязательного параметра поиска
    if (filter.searchQuery && filter.searchQuery.trim() !== '') {
      // Переприсваиваем ссылку, так как исходный объект queryParams не мутирует
      queryParams = queryParams.set('search', filter.searchQuery.trim());
    }

    // Выполняем GET-запрос, явно типизируя ожидаемый ответ и передавая сформированные HttpParams
    return this.http.get<PagedResponseOutput<TargetItemDto>>(this.apiEndpoint, {
      params: queryParams // Angular автоматически сериализует этот объект в строку вида: ?page=0&limit=10...
    });
  }
}
```

---

### Шаблон 2: Универсальный сериализатор сложных объектов фильтрации в HttpParams
*   **Назначение:** Автоматическое и безопасное преобразование плоских или многомерных объектов форм (включая массивы) в валидный объект `HttpParams` с фильтрацией пустых значений (`null`, `undefined`, `""`).

```typescript
import { HttpParams } from '@angular/common/http';

export class HttpParamsSerializer {
  /**
   * Преобразует произвольный объект фильтрации в экземпляр HttpParams.
   * Исключает null, undefined и пустые строки из финального запроса.
   * @param source Ссылка на объект с параметрами фильтрации
   */
  public static serialize<T extends Record<string, unknown>>(source: T): HttpParams {
    let params = new HttpParams();

    // Проходим по всем ключам переданного объекта
    Object.keys(source).forEach((key) => {
      const rawValue = source[key];

      // Проверяем значение на валидность для исключения лишнего мусора из строки запроса
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        return; // Пропускаем итерацию
      }

      // Если значение является массивом (например, выбранные категории: ['js', 'ts'])
      if (Array.isArray(rawValue)) {
        rawValue.forEach((arrayValue) => {
          if (arrayValue !== null && arrayValue !== undefined && arrayValue !== '') {
            // Для массивов используем метод .append(), чтобы сформировать дублирующиеся ключи: ?category=js&category=ts
            params = params.append(key, String(arrayValue));
          }
        });
      } else if (rawValue instanceof Date) {
        // Безопасно форматируем даты в формат ISO-8601 для стандартизации на бэкенде
        params = params.set(key, rawValue.toISOString());
      } else {
        // Во всех остальных случаях приводим значение к строковому типу
        params = params.set(key, String(rawValue));
      }
    });

    return params;
  }
}
```

---

### Шаблон 3: Реактивный поток данных на основе Сигналов и HttpClient
*   **Назначение:** Построение современного реактивного UI-компонента, автоматически запрашивающего данные при изменении сигнала фильтрации с предотвращением гонок запросов (Race Conditions).

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { DataQueryService, PaginationFilter } from './data-query.service';

@Component({
  selector: 'app-data-grid',
  standalone: true,
  template: `
    <!-- Декларативно выводим состояние загрузки и данные -->
    @if (dataState(); as state) {
      @if (state.isLoading) {
        <p>Загрузка свежих данных...</p>
      } @else if (state.error) {
        <p class="error-msg">Ошибка: {{ state.error }}</p>
      } @else {
        <ul>
          @for (item of state.data?.items; track item.id) {
            <li>{{ item.itemName }} ({{ item.itemCategory }})</li>
          } @empty {
            <li>Нет подходящих записей</li>
          }
        </ul>
      }
    }
  `
})
export class DataGridComponent {
  private readonly dataService = inject(DataQueryService);

  // Реактивный сигнал, хранящий текущие настройки фильтрации
  public readonly activeFilter = signal<PaginationFilter>({
    pageIndex: 1,
    pageSize: 10,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    searchQuery: ''
  });

  // Преобразуем изменения сигнала activeFilter в Observable поток
  private readonly filterStream$ = toObservable(this.activeFilter);

  // Реализуем реактивную загрузку с автоматической отменой предыдущих запросов через switchMap
  private readonly dataLoader$ = this.filterStream$.pipe(
    switchMap((filter) => {
      // Перед отправкой запроса переключаем UI в состояние загрузки
      return this.dataService.getPagedItems(filter).pipe(
        switchMap((response) => of({ data: response, isLoading: false, error: null })),
        // Локально перехватываем ошибки конкретного запроса, чтобы не сломать глобальный поток
        catchError((err: Error) => of({ data: null, isLoading: false, error: err.message }))
      );
    })
  );

  // Преобразуем итоговый поток обратно в удобный для чтения в шаблоне сигнал
  public readonly dataState = toSignal(this.dataLoader$, {
    initialValue: { data: null, isLoading: true, error: null }
  });
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Низкоуровневая физика класса HttpParams: Иммутабельность и кодирование спецсимволов
Под капотом `HttpParams` устроен как неизменяемая структура данных. Каждое изменение не модифицирует внутреннюю карту ключей и значений, а порождает вызов приватного конструктора, который клонирует предыдущее состояние и добавляет новую запись. Такая архитектура спроектирована для обеспечения безопасности сетевого слоя: запросы не должны подвергаться побочным эффектам (Side Effects) при передаче объекта `HttpParams` через цепочки HTTP-перехватчиков (Interceptors) или при параллельном выполнении нескольких асинхронных операций.

Второй важный аспект — сериализация спецсимволов. Стандартный веб-браузер парсит query-параметры на основе жестких спецификаций URL. Символы, такие как `?`, `&`, `=`, `+`, `/`, пробелы и национальные алфавиты (кириллица), должны быть приведены к безопасному виду (Percent-encoding). `HttpParams` берет на себя эту работу автоматически, вызывая встроенный системный кодировщик `HttpParameterCodec`. 

> **Важно:** По умолчанию стандартный `HttpUrlEncodingCodec` в Angular кодирует пробелы как `+`, но оставляет без кодирования некоторые спецсимволы, такие как `@`, `:`, `$`, `,`, `;`, `+`, `?`, `/`, так как они считаются валидными внутри сегментов URL. Если ваш бэкенд требует строгого соответствия стандарту RFC 3986 (где кодируются абсолютно все нерезервированные символы), вам потребуется передать кастомный экземпляр кодера через опцию конфигурации `HttpParams({ encoder: new CustomQueryEncoder() })`.

### 2. Строгая типизация сетевых ответов и отсутствие рантайм-валидации
Когда вы вызываете метод `http.get<TargetType>(url)`, вы сообщаете компилятору TypeScript: *«Я ожидаю, что структура данных, пришедшая от сервера в формате JSON, будет соответствовать типу TargetType»*. 

Критически важно понимать физику этого процесса: **Angular никак не проверяет пришедшие данные в рантайме**. Это чистое приведение типов (Type Assertion) на этапе компиляции. Если сервер вернет объект совершенно другой структуры, приложение не упадет на этапе получения ответа, но упадет позже в коде при попытке прочитать несуществующее свойство (например, `Cannot read properties of undefined`).

Если на вашем проекте бэкенд часто меняет схемы ответов без уведомления фронтенд-команды, лучшей практикой является внедрение промежуточного слоя валидации (например, с использованием библиотек `zod` или пользовательских защитников типов `Type Guards`) внутри RxJS-оператора `map` перед передачей данных в UI-компоненты.

### 3. Детальный пошаговый разбор динамической сериализации параметров
Давайте пошагово проследим, как работает метод `HttpParamsSerializer.serialize(source)` из Шаблона 2 при разборе следующего объекта:
```typescript
const filter = { category: ['it', 'science'], search: 'angular', ref: null };
```

1.  **Создание пустого экземпляра:** Инициализируется пустая карта параметров: `params = new HttpParams()`.
2.  **Шаг 1 (Ключ `category`):**
    *   Метод определяет, что значение `['it', 'science']` является массивом (`Array.isArray(rawValue) === true`).
    *   Запускается вложенный цикл перебора элементов массива.
    *   Для первого элемента `it` вызывается `params = params.append('category', 'it')`. Объект пересоздается в памяти с URL-картой `?category=it`.
    *   Для второго элемента `science` вызывается `params = params.append('category', 'science')`. Объект пересоздается, теперь карта имеет вид `?category=it&category=science`.
3.  **Шаг 2 (Ключ `search`):**
    *   Значение `'angular'` — простая валидная строка.
    *   Вызывается `params = params.set('search', 'angular')`. Объект пересоздается, аккумулируя параметры: `?category=it&category=science&search=angular`.
4.  **Шаг 3 (Ключ `ref`):**
    *   Значение `null` попадает под условие фильтрации `rawValue === null`.
    *   Происходит досрочный `return`, параметр полностью игнорируется и не засоряет финальный сетевой запрос.
5.  **Результат:** Сериализатор возвращает чистый иммутабельный объект `HttpParams`, готовый к передаче в `HttpClient`.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Потеря возвращаемого значения при сборке HttpParams (The "No-Op" Mutation Bug)**
    *   *Симптомы:* Параметры запроса отправляются на сервер пустыми, хотя код наполнения параметров написан и выполняется без ошибок в консоли.
    *   *Физика процесса:* Разработчик относится к `HttpParams` как к обычному мутабельному объекту и вызывает методы модификации без сохранения ссылки. Метод `.set()` создает новую копию, которая сразу же уничтожается сборщиком мусора, а исходная переменная остается пустой.
    *   *Решение:* Всегда переприсваивайте ссылку на переменную или стройте цепочку вызовов (Fluent API).

```typescript
// ОШИБКА: Изменения утеряны, params остался пустым
// let params = new HttpParams();
// params.set('id', '123'); 

// ИСПРАВЛЕНИЕ: Переприсваивание ссылки
let params = new HttpParams();
params = params.set('id', '123');

// ИСПРАВЛЕНИЕ (Альтернативное): Сборка через цепочку вызовов
const paramsChain = new HttpParams()
  .set('id', '123')
  .set('theme', 'dark');
```

*   **Ошибка 2: Неверный формат сериализации массивов (Специфика требований бэкенда)**
    *   *Симптомы:* Сервер возвращает ошибку `400 Bad Request` или полностью игнорирует переданный массив фильтров.
    *   *Физика процесса:* Различные серверные фреймворки ожидают разные форматы сериализации списков в GET-запросах. По умолчанию метод `.append('categories', 'it')` в Angular сериализует массив как дублирование ключей: `?categories=it&categories=science`. Однако бэкенд на PHP/Laravel часто ожидает квадратные скобки: `?categories[]=it&categories[]=science`, а бэкенд на Python/NodeJS может требовать перечисление через запятую в одном ключе: `?categories=it,science`.
    *   *Решение:* Модифицируйте логику сборщика параметров под спецификацию вашего API.

```typescript
// Вариант А: Если бэкенд требует явный синтаксис массивов с квадратными скобками []
params = params.append(`${key}[]`, String(arrayValue)); // Выдаст: ?categories[]=it&categories[]=science

// Вариант Б: Если бэкенд требует склеивание значений через запятую
const joinedString = rawValue.join(',');
params = params.set(key, joinedString); // Выдаст: ?categories=it,science
```

*   **Ошибка 3: Состояние гонки (Race Conditions) при быстрой фильтрации данных**
    *   *Симптомы:* Пользователь быстро кликает по кнопкам категорий фильтра. В таблице отображаются некорректные данные, не соответствующие последнему выбранному фильтру (отображается результат предпоследнего клика).
    *   *Физика процесса:* Сетевые запросы асинхронны и имеют разное время прохождения до сервера и обратно. Запрос №1 (медленный) может завершиться позже, чем запрос №2 (быстрый). В результате медленный ответ №1 затрет актуальные данные ответа №2 в памяти приложения.
    *   *Решение:* Исключите ручные вызовы `.subscribe()` на каждый клик. Используйте RxJS-оператор `switchMap` (как показано в Шаблоне 3). Он гарантирует, что при отправке нового HTTP-запроса предыдущий неоконченный запрос будет моментально отменен на сетевом уровне браузера.