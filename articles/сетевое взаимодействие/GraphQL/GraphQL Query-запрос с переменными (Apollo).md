---
tags: [angular, сетевое-взаимодействие, graphql]
related: ["[[Конфигурация подмены провайдеров (app.config).md]]", "[[Универсальные обобщения (Generics).md]]"]
status: "completed"
---

# GraphQL Query-запрос с переменными (Apollo)

## БЫСТРЫЙ СТАРТ

*   **GraphQL Query** — декларативный запрос на чтение строго определенного набора данных. В отличие от классического REST, клиент самостоятельно описывает граф возвращаемых полей, полностью исключая избыточную (over-fetching) или недостаточную (under-fetching) загрузку данных.
*   **Использование переменных (Variables):** Динамические параметры поиска (фильтры, лимиты, ID объектов) передаются отдельно от самой структуры GraphQL-запроса в виде типизированного JSON-словаря. Это предотвращает инъекции, упрощает синтаксический анализ схемы на сервере и позволяет эффективно кэшировать запросы (Edge/CDN Caching).
*   **Правила использования:**
    *   **Используйте:** Для построения сложных интерфейсов со сквозной фильтрацией, пагинацией, запросом связанных данных (например, получить профиль пользователя вместе со списком его последних транзакций и тегов) за один сетевой вызов.
    *   **Не используйте:** Для выполнения операций, изменяющих состояние данных на сервере (создание, обновление, удаление — для этого предназначены GraphQL Mutations). Также избегайте GraphQL для передачи тяжелых бинарных файлов (классический REST POST с `FormData` остается более производительным и стандартным решением).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Глобальная настройка Apollo Client в app.config.ts
*   **Назначение:** Современная конфигурация (начиная с Angular 17+ в эпоху Standalone) для интеграции Apollo Client в DI-контейнер приложения с ленивой инициализацией `HttpLink`.

```typescript
import { ApplicationConfig, provideZoneChangeDetection, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { InMemoryCache } from '@apollo/client/core';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // HttpClient обязателен, так как HttpLink в Apollo Angular использует его под капотом
    provideHttpClient(),
    
    // Регистрируем Apollo Client через современный функциональный провайдер
    provideApollo(() => {
      const httpLink = inject(HttpLink);
      
      return {
        // Настраиваем сетевую связь с GraphQL сервером
        link: httpLink.create({
          uri: 'https://api.enterprise-service.com/graphql',
        }),
        // Инициализируем интеллектуальный кэш в памяти
        cache: new InMemoryCache({
          // Опционально: настраиваем нормализацию кэша (указываем уникальные ключи)
          dataIdFromObject: (object) => object['id'] || null
        })
      };
    })
  ]
};
```

---

### Шаблон 2: Типизированный сервис запросов с переменными
*   **Назначение:** Описание схемы запроса через `gql` тег, объявление строгих типов и создание сервиса для выполнения разовых и «живых» запросов.

```typescript
import { Injectable, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Описываем форму переменных запроса (фильтры)
export interface UserSearchVariables {
  category: string; // Обязательный параметр фильтрации
  limit: number;    // Размер страницы
  offset: number;   // Смещение для пагинации
}

// Описываем интерфейс элемента графа данных
export interface GraphQLUserItem {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

// Описываем структуру ответа сервера на уровне типов TypeScript
export interface GraphQLUserResponse {
  searchUsers: {
    items: GraphQLUserItem[];
    totalCount: number;
  };
}

// Описываем саму GraphQL-схему. Запрос принимает типизированные переменные.
// Имя переменных внутри запроса должно строго соответствовать JSON-ключу.
export const SEARCH_USERS_QUERY = gql`
  query SearchUsers($category: String!, $limit: Int!, $offset: Int!) {
    searchUsers(category: $category, limit: $limit, offset: $offset) {
      items {
        id
        fullName
        email
        role
      }
      totalCount
    }
  }
`;

@Injectable({
  providedIn: 'root'
})
export class UserQueryService {
  // Внедряем сервис Apollo через inject()
  private readonly apollo = inject(Apollo);

  /**
   * Выполняет разовый типизированный сетевой запрос (аналог классического GET-запроса)
   * @param variables Переменные фильтрации и пагинации
   */
  public queryUsers(variables: UserSearchVariables): Observable<GraphQLUserResponse['searchUsers']> {
    return this.apollo.query<GraphQLUserResponse, UserSearchVariables>({
      query: SEARCH_USERS_QUERY,
      variables: variables,
      // Исключаем чтение из локального кэша для получения 100% свежих данных
      fetchPolicy: 'network-only' 
    }).pipe(
      // Извлекаем нужный узел данных из общего графа ответа
      map(result => result.data.searchUsers)
    );
  }

  /**
   * Запускает живое наблюдение за кэшем и сервером. Поток остается открытым.
   * @param variables Переменные фильтрации
   */
  public watchUsers(variables: UserSearchVariables) {
    return this.apollo.watchQuery<GraphQLUserResponse, UserSearchVariables>({
      query: SEARCH_USERS_QUERY,
      variables: variables,
      // Стратегия: вернуть мгновенно данные из кэша, затем сделать сетевой запрос в фоне и обновить поток
      fetchPolicy: 'cache-and-network' 
    });
  }
}
```

---

### Шаблон 3: Подписка на «живые» изменения кэша в UI-компоненте
*   **Назначение:** Компонент, отображающий список данных и автоматически перерисовывающийся при изменении переменных или обновлении кэша.

```typescript
import { Component, signal, inject, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserQueryService, GraphQLUserItem } from './user-query.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  template: `
    <div class="list-wrapper">
      @if (isLoading()) {
        <p>Загрузка данных из графа...</p>
      } @else {
        <ul>
          @for (user of users(); track user.id) {
            <li>{{ user.fullName }} — <span>{{ user.role }}</span></li>
          } @empty {
            <li>Пользователи не найдены</li>
          }
        </ul>
        <p>Всего записей: {{ totalCount() }}</p>
      }
    </div>
  `
})
export class UserListComponent implements OnInit {
  private readonly queryService = inject(UserQueryService);
  private readonly destroyRef = inject(DestroyRef);

  // Локальные сигналы для реактивного связывания с шаблоном
  public readonly users = signal<GraphQLUserItem[]>([]);
  public readonly totalCount = signal<number>(0);
  public readonly isLoading = signal<boolean>(true);

  public ngOnInit(): void {
    const searchConfig = {
      category: 'engineering',
      limit: 10,
      offset: 0
    };

    // Запускаем реактивное слежение за запросом
    this.queryService.watchUsers(searchConfig)
      .valueChanges // Обращаемся к потоку изменений результатов
      .pipe(
        // Автоматически завершаем подписку при уничтожении компонента
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (result) => {
          this.isLoading.set(result.loading);
          // Безопасно считываем данные, если они уже получены из кэша или сети
          if (result.data) {
            this.users.set(result.data.searchUsers.items);
            this.totalCount.set(result.data.searchUsers.totalCount);
          }
        },
        error: (err: Error) => {
          console.error('Ошибка выполнения GraphQL запроса:', err);
          this.isLoading.set(false);
        }
      });
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика watchQuery и нормализация кэша
Один из самых мощных механизмов в Apollo Client — нормализованный кэш `InMemoryCache`. В отличие от REST, где кэширование обычно происходит по URL-адресу, Apollo кэширует данные атомарно. 

Когда результат GraphQL запроса поступает в клиент, `InMemoryCache` парсит полученное дерево объектов. Он ищет в каждом объекте поля `__typename` (системное имя типа схемы) и уникальный идентификатор (по умолчанию поле `id` или `_id`). По этим полям Apollo создает плоский словарь объектов в памяти:
$$\text{CacheKey} = \text{\_\_typename} + \text{":"} + \text{id}$$

Если вы используете метод `watchQuery()`, вы подписываетесь на живые обновления этого кэша. Когда в другой части приложения выполняется GraphQL Mutation (например, изменение роли пользователя), которая возвращает измененный объект с тем же ID и обновленным полем `role`, InMemoryCache автоматически находит этот объект в плоской карте, обновляет его свойства, и все активные потоки `watchQuery()`, которые отображали этого пользователя, мгновенно испускают новые значения в UI-компоненты без повторных сетевых запросов.

### 2. Защита от Query Injection и оптимизация парсинга через переменные (Variables)
Почему передача параметров через интерполяцию строк (шаблонные строки `${value}`) внутри GraphQL-запроса считается критической ошибкой?
```typescript
// КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ И ПРОИЗВОДИТЕЛЬНОСТИ
const query = gql` query { user(name: "${userInput}") { id } } `;
```
*   **Query Injection:** Если злоумышленник введет в поле `userInput` спецсимволы синтаксиса GraphQL, он сможет исказить структуру запроса и прочитать конфиденциальные поля схемы (аналог SQL-инъекции).
*   **Отсутствие кэширования схем:** Сервер GraphQL перед каждым выполнением текстового запроса парсит его и строит абстрактное синтаксическое дерево (AST). Если значения параметров встроены в текст запроса, для сервера это каждый раз уникальный текст, требующий полной перекомпиляции дерева. Передача переменных отдельно гарантирует, что структура запроса остается статической, сервер парсит AST ровно один раз и кэширует план выполнения.

### 3. Пошаговый разбор выполнения GraphQL-запроса с переменными
Рассмотрим логику работы метода `queryUsers` из Шаблона 2:

1.  **Сборка аргументов:** Метод вызывается с параметрами пагинации `{ category: 'QA', limit: 5, offset: 0 }`.
2.  **Формирование JSON-пакета:** Apollo Angular сериализует запрос в единый POST-пакет:
    ```json
    {
      "query": "query SearchUsers($category: String!, $limit: Int!, $offset: Int!) { ... }",
      "variables": {
        "category": "QA",
        "limit": 5,
        "offset": 0
      }
    }
    ```
3.  **Сетевой вызов:** Пакет отправляется методом POST на единую точку входа `/graphql`.
4.  **Слияние с кэшем:** По возвращении успешного ответа `InMemoryCache` сканирует полученный массив `items`, извлекает идентификаторы и обновляет соответствующие записи в оперативной памяти.
5.  **Типизированный вывод:** Оператор `map` вырезает внутренний массив `searchUsers` и возвращает его в поток `Observable`, гарантируя соответствие TypeScript-интерфейсу.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Утечка памяти из-за бесконечной подписки на `watchQuery().valueChanges`**
    *   *Симптомы:* Медленный рост потребления памяти (Memory Leak) и многократное дублирование выполнения кода внутри подписок при переходах пользователя между страницами.
    *   *Физика процесса:* Сетевой метод `HttpClient.get()` делает ровно одну эмиссию и автоматически закрывает поток (вызывает `complete`). Однако поток `watchQuery().valueChanges` **никогда не закрывается самостоятельно**. Он остается активным в фоновом режиме для отслеживания возможных изменений кэша. Если вы уйдете с компонента без ручной отписки, подписка останется в куче памяти навечно.
    *   *Решение:* Обязательно ограничивайте время жизни подписки с помощью оператора `takeUntilDestroyed` (как показано в Шаблоне 3).

```typescript
// ОШИБКА: ПотокwatchQuery никогда не завершится, вызывая утечку памяти после уничтожения компонента
// this.queryService.watchUsers(vars).valueChanges.subscribe(...);

// ИСПРАВЛЕНИЕ: Автоматическая отписка по DestroyRef
this.queryService.watchUsers(vars).valueChanges.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(...);
```

*   **Ошибка 2: Нарушение консистентности кэша при отсутствии поля `id` в графе запроса**
    *   *Симптомы:* Данные в UI-компонентах не обновляются автоматически после успешного выполнения мутаций на сервере.
    *   *Физика процесса:* Разработчик для уменьшения веса сетевого ответа не запросил поле `id` в GraphQL-запросе: `searchUsers { items { fullName role } }`. Так как в возвращенном графе нет идентификатора, Apollo `InMemoryCache` не может сопоставить полученные объекты с плоской картой нормализации и кэширует их как анонимные вложенные сущности. Любые последующие мутации этих объектов по ID не приведут к обновлению UI.
    *   *Решение:* Всегда запрашивайте уникальный идентификатор `id` (или настроенный кастомный ключ) для каждого типа сущностей в любом GraphQL Query.

```typescript
// ОШИБКА: Кэш не сможет нормализовать данные без ID
// items { fullName email }

// ИСПРАВЛЕНИЕ: ID присутствует во всех запросах схемы
items { id fullName email }
```

*   **Ошибка 3: Ошибки рантайма из-за отсутствия типизации переменных**
    *   *Симптомы:* Запрос падает с сетевой ошибкой `GraphQL Validation Error` на этапе парсинга параметров сервером.
    *   *Физика процесса:* Разработчик передал числовой параметр в виде строкового литерала (например, `"5"` вместо `5`), либо пропустил обязательное поле. Так как TypeScript по умолчанию не проверяет соответствие типов аргументов внутри сырой строки `gql`, без явного указания типов дженерика в `apollo.query<T, V>` компилятор пропустит эту ошибку.
    *   *Решение:* Всегда явно передавайте интерфейс переменных в качестве второго параметра дженерика при вызове методов Apollo.

```typescript
// ОШИБКА: Нет проверки типов переменных на этапе компиляции
// this.apollo.query({ query: MY_QUERY, variables: { limit: "10" } });

// ИСПРАВЛЕНИЕ: Строгая типизация запроса и переменных через дженерики
this.apollo.query<MyResponse, MyVariables>({ 
  query: MY_QUERY, 
  variables: { limit: 10 } 
});
```