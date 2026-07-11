---
tags: [angular, сетевое-взаимодействие, graphql, apollo]
related: ["[[Работа с API и HttpClient в Angular]]", "[[Постоянные соединения (WebSockets & SSE)]]"]
status: "completed"
---

# Интеграция с GraphQL

## БЫСТРЫЙ СТАРТ

*   **GraphQL** — декларативный строго типизированный язык запросов для API и рантайм для их выполнения, предоставляющий альтернативу традиционной REST-архитектуре.
*   **Единая точка входа (Single Endpoint)** — в отличие от REST с множеством эндпоинтов, все запросы в GraphQL отправляются на один URL (обычно методом `POST`), а структура ответа полностью определяется телом запроса клиента.
*   **Используйте для:** точечной выборки сложных графов связанных данных без избыточной (Over-fetching) или недостаточной (Under-fetching) загрузки, а также для создания гибких, расширяемых фронтенд-клиентов без необходимости версионирования API.
*   **Не используйте для:** простых тривиальных приложений с плоской структурой данных, а также для передачи тяжелых бинарных файлов (в этих сценариях классический REST / HTTP Multipart Form Data эффективнее).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Чтение связанных данных через GraphQL Query
*   **Назначение:** Реализация безопасного и строго типизированного запроса к GraphQL-серверу с использованием Apollo Client, передачей динамических переменных и выводом данных в шаблоне с OnPush.

#### 1. Файл логики: `category-list.ts`
```typescript
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common'; // Импортируем CommonModule ради AsyncPipe
import { Apollo, gql } from 'apollo-angular';
import { Observable, catchError, map, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// Описываем строгие интерфейсы моделей согласно схеме GraphQL бэкенда
export interface Category {
  id: string;
  name: string;
}

export interface CategoriesQueryResponse {
  categories: Category[];
}

export interface CategoriesQueryVariables {
  parentId: string;
}

// Хорошо: Декларативное объявление запроса с использованием тега gql для AST-парсинга
const GET_CATEGORIES = gql`
  query GetCategories($parentId: ID!) {
    categories(parentId: $parentId) {
      id
      name
    }
  }
`;

@Component({
  selector: 'app-category-list',
  // standalone: true опущен по умолчанию согласно стандартам Angular 19+
  imports: [CommonModule], // Декларативно подключаем только AsyncPipe
  templateUrl: './category-list.html',
  styleUrl: './category-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush для исключения лишних циклов CD
})
export class CategoryList {
  // Внедряем Apollo Client через функциональный inject()
  private readonly apollo = inject(Apollo);

  // Реактивный сигнал для вывода сетевых и синтаксических ошибок в UI
  readonly queryError = signal<string | null>(null);

  // Декларативный поток данных на базе watchQuery для авто-обновления при изменении кэша
  readonly categories$: Observable<Category[]> = this.apollo
    .watchQuery<CategoriesQueryResponse, CategoriesQueryVariables>({
      query: GET_CATEGORIES,
      variables: {
        parentId: 'root_category_node_id' // Передаем строго типизированную переменную
      }
    })
    .valueChanges.pipe(
      takeUntilDestroyed(), // Безопасное завершение подписки при уничтожении инстанса компонента
      map(result => result.data.categories), // Извлекаем чистый массив данных из структуры ответа
      catchError(err => {
        this.queryError.set('Ошибка загрузки графа данных: ' + err.message);
        return of([]); // Предотвращаем падение внешнего потока
      })
    );
}
```

#### 2. Файл разметки: `category-list.html`
```html
<div class="graphql-container">
  <header class="graphql-header">
    <h3 class="graphql-title">Каталог разделов (GraphQL Query)</h3>
  </header>

  @if (queryError(); as error) {
    <div class="error-box" role="alert">
      <p>{{ error }}</p>
    </div>
  }

  <!-- Подписываемся на реактивный поток данных через AsyncPipe -->
  @if (categories$ | async; as list) {
    <ul class="category-grid">
      @for (cat of list; track cat.id) {
        <li class="category-card">
          <p class="card-id">ID: {{ cat.id }}</p>
          <h4 class="card-name">{{ cat.name }}</h4>
        </li>
      } @empty {
        <p class="empty-msg">Разделы не обнаружены.</p>
      }
    </ul>
  }
</div>
```

#### 3. Файл стилей: `category-list.css`
```css
.graphql-container {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.graphql-title {
  color: var(--text-normal);
  margin-bottom: 16px;
}

.error-box {
  background-color: var(--error-bg);
  border: 1px solid var(--border);
  color: var(--error-text);
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.category-grid {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.category-card {
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  padding: 16px;
  border-radius: 6px;
}

.card-id {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.card-name {
  color: var(--text-normal);
  margin-top: 4px;
}

.empty-msg {
  color: var(--text-muted);
  font-style: italic;
}
```

---

### Шаблон 2: Модификация данных через GraphQL Mutation
*   **Назначение:** Описание и выполнение мутации для создания новой сущности на сервере с автоматическим обновлением локального кэша Apollo.

#### 1. Файл логики: `user-creator.ts`
```typescript
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface User {
  id: string;
  name: string;
}

export interface CreateUserResponse {
  createUser: User;
}

export interface CreateUserVariables {
  name: string;
}

// Объявляем мутацию. Сервер вернет id и name созданного пользователя
const CREATE_USER = gql`
  mutation CreateUser($name: String!) {
    createUser(name: $name) {
      id
      name
    }
  }
`;

@Component({
  selector: 'app-user-creator',
  templateUrl: './user-creator.html',
  styleUrl: './user-creator.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserCreator {
  private readonly apollo = inject(Apollo);

  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  executeMutation(userName: string): void {
    if (!userName.trim()) return;

    // Вызываем метод mutate для отправки мутации на сервер
    this.apollo.mutate<CreateUserResponse, CreateUserVariables>({
      mutation: CREATE_USER,
      variables: {
        name: userName
      },
      // Настраиваем поведение обновления локального кэша Apollo после успеха
      refetchQueries: ['GetCategories'] // Автоматически перезапросит нужные Query-запросы
    })
    .pipe(takeUntilDestroyed()) // Безопасное отслеживание жизненного цикла
    .subscribe({
      next: (result) => {
        if (result.data?.createUser) {
          this.successMessage.set(`Пользователь ${result.data.createUser.name} успешно создан.`);
          this.errorMessage.set(null);
        }
      },
      error: (err) => {
        this.errorMessage.set('Ошибка выполнения мутации: ' + err.message);
        this.successMessage.set(null);
      }
    });
  }
}
```

#### 2. Файл разметки: `user-creator.html`
```html
<div class="creator-container">
  @if (successMessage(); as success) {
    <div class="success-banner">{{ success }}</div>
  }
  @if (errorMessage(); as error) {
    <div class="error-banner">{{ error }}</div>
  }

  <div class="input-group">
    <input #nameInput type="text" class="text-input" placeholder="Введите имя..." />
    <button class="submit-btn" (click)="executeMutation(nameInput.value); nameInput.value = ''">
      Создать (Mutation)
    </button>
  </div>
</div>
```

#### 3. Файл стилей: `user-creator.css`
```css
.creator-container {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 400px;
}

.success-banner {
  background-color: var(--success-bg);
  color: var(--success-text);
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 12px;
}

.error-banner {
  background-color: var(--error-bg);
  color: var(--error-text);
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 12px;
}

.input-group {
  display: flex;
  gap: 12px;
}

.text-input {
  flex: 1;
  padding: 8px 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  outline: none;
}

.text-input:focus {
  border-color: var(--accent);
}

.submit-btn {
  background-color: var(--accent);
  color: #ffffff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Как Apollo Client решает проблемы Over-fetching и Under-fetching
Главное преимущество GraphQL над REST заключается в переходе от жестких эндпоинтов к **графовой модели**.

```text
1. REST-подход (Under-fetching: требуется 2 каскадных запроса)
   Клиент                                                 Сервер REST
     │                                                         │
     ├─────── [Запрос 1]: GET /api/users/1 ───────────────────►│ (Чтение из БД)
     │◄────── [Ответ 1]: { id: "1", name: "Иван" } ────────────┤
     │                                                         │
     ├─────── [Запрос 2]: GET /api/users/1/posts ─────────────►│ (Чтение связанных постов)
     │◄────── [Ответ 2]: [ { id: "101", title: "GraphQL" } ] ──┤

2. GraphQL-подход (Точечный сбор за 1 запрос)
   Клиент                                                 Сервер GraphQL
     │                                                         │
     ├─────── [Запрос]: POST /graphql ────────────────────────►│ (Инициализация резолверов)
     │        query { user(id: 1) { name posts { title } } }   │  - Вызов Resolver: User
     │                                                         │  - Вызов Resolver: Posts
     │◄────── [Ответ]: {                                       │
     │          "data": {                                      │
     │            "user": {                                    │
     │              "name": "Иван",                            │
     │              "posts": [ { "title": "GraphQL" } ]        │
     │            }                                            │
     │          }                                              │
     │        } ───────────────────────────────────────────────┤
```

*   **Over-fetching (Избыточность)**: В REST-запросе к `/api/users/1` сервер возвращает зафиксированный на бэкенде JSON, содержащий все поля профиля, адреса, историю заказов и метаданные. Браузер парсит мегабайты лишних данных. В GraphQL клиент явно запрашивает только нужные поля: `{ user(id: 1) { name } }`. Сервер собирает и возвращает строго запрошенные ключи.
*   **Under-fetching (Недостаточность)**: Для отрисовки страницы в REST приходится слать каскад запросов (получить пользователя, затем по его ID получить его посты, затем по ID каждого поста получить комментарии). В GraphQL это решается одним запросом с глубокой вложенностью полей в схеме.

---

### 2. Физика нормализации кэша в `InMemoryCache`
Apollo Client содержит интеллектуальный слой кэширования `InMemoryCache`. Он функционирует следующим образом:

1.  **Деструктуризация ответа**: Получив ответ от GraphQL-сервера, кэш сканирует возвращенную структуру.
2.  **Идентификация объектов**: Для каждого объекта в JSON кэш пытается вычислить уникальный идентификатор. По умолчанию для этого используется комбинация специального скрытого системного поля `__typename` (имя типа в схеме GraphQL) и его уникального ключа `id` или `_id`. Например, категория с `id: "cat_1"` преобразуется в ключ кэша `Category:cat_1`.
3.  **Нормализация**: Объекты извлекаются из иерархического дерева ответа и сохраняются в плоском (flat) словаре ключ-значение.
4.  **Связывание и реактивность**: Если несколько независимых компонентов подписываются на разные Query-запросы, содержащие объект `Category:cat_1`, они получат ссылку на один и тот же нормализованный объект в оперативной памяти. Изменение этого объекта (например, мутацией или другим запросом) мгновенно обновит отображение во всех подписанных компонентах без повторных сетевых вызовов.

---

### 3. Детальный пошаговый разбор выполнения шаблона 1
1.  **Компиляция AST**: Тег `gql` парсит строковый литерал запроса `GET_CATEGORIES` на этапе инициализации файла в абстрактное синтаксическое дерево (AST). Это исключает накладные расходы на парсинг строки рантайме.
2.  **watchQuery подписка**: Метод `watchQuery` регистрирует активного слушателя в ядре Apollo Client.
3.  **Проверка кэша**: Apollo проверяет плоский словарь `InMemoryCache` на наличие данных по данному запросу. Если данных нет, инициируется сетевой запрос.
4.  **Сетевой HTTP POST**: Формируется POST-запрос на системный GraphQL-эндпоинт `/graphql`. В теле запроса передается сериализованное AST-дерево и переменные `{ "parentId": "root_category_node_id" }`.
5.  **Получение и нормализация**: Бэкенд возвращает JSON. `InMemoryCache` нормализует полученные категории по ключам `Category:id` и сохраняет их.
6.  **Эмиссия данных**: Поток `valueChanges` испускает событие. С помощью оператора `map` из структуры извлекается чистый массив категорий и через `AsyncPipe` рендерится в DOM.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Фрагментация и инвалидация кэша из-за отсутствия системных полей в Query**
    *   *Симптомы:* После успешного выполнения мутации данные в списке на экране не обновляются, хотя сервер вернул успешный ответ. Приходится перезагружать страницу.
    *   *Физика процесса:* В Query-запросе списка разработчик забыл запросить уникальное поле `id` (или настроенный альтернативный идентификатор) и системное поле `__typename`. Из-за этого `InMemoryCache` не смог сопоставить пришедшие объекты с существующими записями в плоском словаре кэша и создал новые изолированные сущности, нарушив реактивную связь.
    *   *Решение:* Всегда явно запрашивайте поле `id` (или ключ, используемый для `dataIdFromObject`) во всех GraphQL-операциях (Query, Mutation, Subscription).

```typescript
// ПЛОХО (Кэш не сможет сопоставить объекты без уникального ID, авто-обновление UI сломается)
const GET_BAD_USERS = gql`
  query GetUsers {
    users {
      name # ❌ ID отсутствует
    }
  }
`;

// ХОРОШО (Наличие ID и авто-добавление __typename гарантируют корректную нормализацию кэша)
const GET_GOOD_USERS = gql`
  query GetUsers {
    users {
      id   # ✅ Кэш свяжет объекты по ключу User:id
      name
    }
  }
`;
```

*   **Ошибка 2: Использование строковой интерполяции при формировании GraphQL-запросов**
    *   *Симптомы:* Ошибки парсинга GraphQL-сервера, уязвимость к инъекциям вредоносного кода (GraphQL Injection), невозможность статического кэширования структуры запроса.
    *   *Физика процесса:* Конструирование запроса путем подстановки переменных через строковую интерполяцию `${variable}`. Это заставляет компилятор парсить AST заново при каждом изменении переменной, тратя процессорное время.
    *   *Решение:* Всегда объявляйте переменные в сигнатуре операции (например, `$parentId: ID!`) и передавайте их значения через объект `variables` в настройках запроса Apollo.

```typescript
// ПЛОХО (Уязвимо к инъекциям, ломает кэширование AST на клиенте и сервере)
const getBadQuery = (id: string) => gql`
  query {
    category(id: "${id}") { name } # ❌ Строковая интерполяция
  }
`;

// ХОРОШО (Шаблон стабилен, переменные передаются изолированно в рантайме)
const GET_GOOD_QUERY = gql`
  query GetCategory($id: ID!) {
    category(id: $id) { name }    # ✅ Переменная объявлена строго в AST
  }
`;
```

*   **Ошибка 3: Утечка памяти при незавершенных подписках на `watchQuery`**
    *   *Симптомы:* Постепенный рост потребления оперативной памяти вкладкой браузера (Memory Leak) при частой навигации по страницам приложения.
    *   *Физика процесса:* Метод `watchQuery().valueChanges` возвращает бесконечный RxJS-поток, который продолжает слушать изменения кэша Apollo вечно. Если не отписаться от него при уничтожении компонента, ссылка на компонент останется в ядре Apollo, что заблокирует работу сборщика мусора.
    *   *Решение:* Всегда завершайте подписку с помощью оператора `takeUntilDestroyed()` или используйте `AsyncPipe` в шаблоне, который выполняет отписку автоматически.

```typescript
// ПЛОХО (Подписка останется активной в памяти после уничтожения компонента)
export class BadUserList implements OnInit {
  private apollo = inject(Apollo);

  ngOnInit() {
    this.apollo.watchQuery({ query: GET_USERS }).valueChanges.subscribe(); // ❌ Утечка памяти
  }
}

// ХОРОШО ( takeUntilDestroyed автоматически вызовет unsubscribe() при уничтожении контекста DI)
export class GoodUserList {
  private apollo = inject(Apollo);

  readonly users$ = this.apollo.watchQuery({ query: GET_USERS }).valueChanges.pipe(
    takeUntilDestroyed() // ✅ Безопасный жизненный цикл
  );
}
```
