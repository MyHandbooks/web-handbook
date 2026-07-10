---
path: "articles/сетевое взаимодействие/GraphQL/GraphQL Mutation-запрос (Apollo).md"
tags: [angular, сетевое-взаимодействие, graphql]
related: ["[[GraphQL Query-запрос с переменными (Apollo).md]]", "[[Универсальные обобщения (Generics).md]]"]
status: "completed"
---

# GraphQL Mutation-запрос (Apollo)

## БЫСТРЫЙ СТАРТ

*   **GraphQL Mutation** — специализированный тип запроса в GraphQL, предназначенный для модификации данных на сервере (создание, обновление, удаление сущностей или выполнение бизнес-действий). По своей физике является аналогом неидемпотентных REST-методов (POST, PUT, PATCH, DELETE).
*   **Синхронизация кэша после изменений:** При успешном выполнении мутация должна возвращать измененные поля объекта. Если возвращаемые поля содержат уникальный `id` и системный тип `__typename`, Apollo Client автоматически обновит соответствующие нормализованные записи в локальном кэше (`InMemoryCache`), мгновенно перерисовывая связанные UI-компоненты.
*   **Правила использования:**
    *   **Используйте:** Для отправки форм, изменения настроек, удаления сущностей, изменения статусов заказов или выполнения любых транзакционных операций на сервере.
    *   **Не используйте:** Для безопасного чтения данных без побочных эффектов (для этого всегда используйте GraphQL Queries).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Типизированный сервис мутации с автоматическим обновлением кэша
*   **Назначение:** Описание мутации изменения данных пользователя, объявление интерфейсов типов и реализация метода отправки мутации на базе `Apollo Angular`.

```typescript
import { Injectable, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Описываем структуру входного DTO для мутации
export interface UpdateUserInput {
  id: string;         // Уникальный идентификатор изменяемого пользователя
  fullName: string;   // Новое имя пользователя
  role: string;       // Новая роль
}

// Описываем форму ответа сервера на уровне TypeScript
export interface GraphQLUpdateUserResponse {
  updateUser: {
    id: string;       // Обязательно возвращаем id для автоматического слияния кэша
    __typename: string; // Системный тип для InMemoryCache (обычно подставляется автоматически)
    fullName: string; // Новое значение для обновления UI
    role: string;     // Новое значение для обновления UI
  };
}

// Описываем GraphQL схему мутации.
// Схема принимает переменную $input строгого серверного типа UpdateUserInput!
export const UPDATE_USER_MUTATION = gql`
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id
      fullName
      role
    }
  }
`;

@Injectable({
  providedIn: 'root'
})
export class UserMutationService {
  // Внедряем сервис Apollo через inject()
  private readonly apollo = inject(Apollo);

  /**
   * Выполняет мутацию обновления профиля пользователя
   * @param input Данные для обновления
   */
  public updateUserProfile(input: UpdateUserInput): Observable<GraphQLUpdateUserResponse['updateUser']> {
    return this.apollo.mutate<GraphQLUpdateUserResponse, { input: UpdateUserInput }>({
      mutation: UPDATE_USER_MUTATION,
      variables: {
        input: input
      }
    }).pipe(
      // Извлекаем чистый объект ответа мутации
      map(result => {
        if (!result.data) {
          throw new Error('Сервер вернул пустой ответ на мутацию');
        }
        return result.data.updateUser;
      })
    );
  }
}
```

---

### Шаблон 2: Мутация создания сущности с ручным обновлением кэша списка (update callback)
*   **Назначение:** Добавление новой сущности на сервер и её ручное локальное встраивание в существующий кэш списка (например, добавление нового пользователя в начало таблицы без повторного сетевого запроса пагинации).

```typescript
import { Injectable, inject } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SEARCH_USERS_QUERY, GraphQLUserResponse, UserSearchVariables } from './user-query.service';

export interface CreateUserInput {
  fullName: string;
  email: string;
  role: string;
}

export interface GraphQLCreateUserResponse {
  createUser: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
}

export const CREATE_USER_MUTATION = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      fullName
      email
      role
    }
  }
`;

@Injectable({
  providedIn: 'root'
})
export class UserCreateService {
  private readonly apollo = inject(Apollo);

  /**
   * Создает пользователя на сервере и вручную обновляет кэш локального списка
   * @param input Параметры нового пользователя
   * @param currentListVariables Текущие переменные активного фильтра списка для точечного обновления кэша
   */
  public createUserAndRefreshCache(
    input: CreateUserInput, 
    currentListVariables: UserSearchVariables
  ): Observable<GraphQLCreateUserResponse['createUser']> {
    return this.apollo.mutate<GraphQLCreateUserResponse, { input: CreateUserInput }>({
      mutation: CREATE_USER_MUTATION,
      variables: {
        input: input
      },
      // Используем функцию update для прямого доступа к InMemoryCache
      update: (cache, { data }) => {
        // Проверяем, вернул ли сервер созданные данные
        if (!data || !data.createUser) {
          return;
        }

        // Читаем из локального кэша состояние существующего списка пользователей
        const cachedData = cache.readQuery<GraphQLUserResponse, UserSearchVariables>({
          query: SEARCH_USERS_QUERY,
          variables: currentListVariables
        });

        if (cachedData) {
          // Записываем обновленные данные обратно в InMemoryCache
          cache.writeQuery({
            query: SEARCH_USERS_QUERY,
            variables: currentListVariables,
            data: {
              searchUsers: {
                ...cachedData.searchUsers,
                // Встраиваем нового созданного пользователя в начало массива кэша
                items: [data.createUser, ...cachedData.searchUsers.items],
                totalCount: cachedData.searchUsers.totalCount + 1
              }
            }
          });
        }
      }
    }).pipe(
      map(result => result.data!.createUser)
    );
  }
}
```

---

### Шаблон 3: Обработка состояний мутации в UI-компоненте с использованием Сигналов
*   **Назначение:** Компонент формы изменения данных, отображающий спиннер загрузки, выводящий ошибки валидации сервера и блокирующий кнопку отправки на время мутации.

#### 1. Файл логики: `user-edit-form.ts`
```typescript
import { Component, signal, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserMutationService, UpdateUserInput } from './user-mutation.service';

@Component({
  selector: 'app-user-edit-form',
  // standalone: true опускается по умолчанию начиная с v19
  imports: [],
  templateUrl: './user-edit-form.html',
  styleUrl: './user-edit-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserEditForm { // Имя класса очищено от суффикса Component
  private readonly mutationService = inject(UserMutationService);
  private readonly destroyRef = inject(DestroyRef);

  // Описываем изолированные сигналы состояния транзакции
  public readonly isPending = signal<boolean>(false);
  public readonly isSuccess = signal<boolean>(false);
  public readonly errorMessage = signal<string | null>(null);

  /**
   * Отправляет изменения на сервер
   */
  public saveChanges(newName: string): void {
    // Переключаем UI в состояние отправки данных
    this.isPending.set(true);
    this.isSuccess.set(false);
    this.errorMessage.set(null);

    const updatePayload: UpdateUserInput = {
      id: 'usr-102-arch',
      fullName: newName.trim(),
      role: 'lead-engineer'
    };

    this.mutationService.updateUserProfile(updatePayload)
      .pipe(
        // Предотвращаем утечки памяти при закрытии модального окна во время отправки
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (updatedUser) => {
          this.isPending.set(false);
          this.isSuccess.set(true);
          console.log('[System Output] Данные в кэше обновлены:', updatedUser);
        },
        error: (err: Error) => {
          this.isPending.set(false);
          this.errorMessage.set(err.message || 'Не удалось обновить профиль');
        }
      });
  }
}
```

#### 2. Файл разметки: `user-edit-form.html`
```html
<div class="form-card">
  <h3>Редактирование профиля</h3>
  
  <label for="fullName">Полное имя:</label>
  <input type="text" id="fullName" #nameInput value="Архитектор Фронтенда" class="theme-input" />

  <!-- Кнопка отправки формы -->
  <button 
    class="action-btn" 
    [disabled]="isPending()" 
    (click)="saveChanges(nameInput.value)"
  >
    @if (isPending()) {
      Сохранение в облаке...
    } @else {
      Применить изменения
    }
  </button>

  <!-- Отображение ошибок или успеха -->
  @if (errorMessage()) {
    <p class="error-msg">Ошибка: {{ errorMessage() }}</p>
  }
  @if (isSuccess()) {
    <p class="success-msg">Изменения успешно применены!</p>
  }
</div>
```

#### 3. Файл стилей: `user-edit-form.css`
```css
.form-card {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 400px;
}
.theme-input {
  width: 100%;
  padding: 8px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  margin: 8px 0 16px;
}
.action-btn {
  width: 100%;
  padding: 10px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.error-msg {
  color: var(--error-text);
  margin-top: 10px;
}
.success-msg {
  color: var(--success-text);
  margin-top: 10px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Механизмы автоматического и ручного обновления InMemoryCache
После выполнения мутации Apollo Client должен синхронизировать свое внутреннее состояние с реальной СУБД. Существует два основных механизма:

#### Автоматическое слияние (Auto-merging):
Работает по умолчанию. Когда вы выполняете мутацию изменения сущности (например, редактирование имени пользователя), сервер возвращает обновленный объект:
`{ "id": "usr-12", "fullName": "Новое Имя", "__typename": "User" }`

Apollo `InMemoryCache` перехватывает этот ответ, вычисляет уникальный хэш-ключ нормализованного объекта (`User:usr-12`) и мгновенно перезаписывает измененные свойства `fullName` во всех структурах кэша. Все активные GraphQL Queries, которые отображали этого пользователя, автоматически генерируют новые значения для подписчиков.

#### Ручное обновление кэша (Manual cache update):
Автоматическое слияние не работает, если мутация создает новый объект или удаляет существующий. В этом случае Apollo не знает, в какие именно локальные списки (Queries) нужно встроить или откуда удалить этот объект. 

Для этого используется коллбэк `update(cache, mutationResult)`. С помощью методов `cache.readQuery` мы извлекаем текущее замороженное состояние нужного списка из кэша по точным переменным фильтрации, создаем копию массива, добавляем/удаляем элемент и записываем обновленный массив обратно через `cache.writeQuery`. Это избавляет приложение от необходимости делать повторный тяжелый сетевой запрос за списком данных (Refetch).

### 2. Принцип работы Optimistic UI (Оптимистичный интерфейс)
Для создания мгновенной отзывчивости интерфейса enterprise-приложений применяется паттерн `optimisticResponse`. 

Когда пользователь нажимает кнопку сохранения, до того, как запрос физически уйдет в сеть, Apollo Client принимает фиктивный объект «ожидаемого успеха» (`optimisticResponse`), который полностью имитирует ответ сервера. Кэш мгновенно обновляется этим фиктивным объектом, и UI-компонент перерисовывается (например, имя пользователя меняется за 0мс). 

Когда реальный ответ сервера возвращается из сети через 800мс:
*   Если запрос завершился **успешно**: фиктивный оптимистичный объект плавно заменяется реальным ответом сервера в кэше.
*   Если произошел **сетевой сбой**: транзакция откатывается назад (Rollback), кэш возвращается в исходное состояние до старта мутации, и пользователь получает сообщение об ошибке.

### 3. Пошаговый разбор ручного обновления кэша списка
Рассмотрим пошагово выполнение метода `createUserAndRefreshCache` из Шаблона 2:

1.  **Вызов мутации:** Сетевой поток отправляет POST-пакет с телом нового пользователя.
2.  **Запуск `update`:** После завершения запроса, но до того как поток вернет значение в `.subscribe()`, вызывается коллбэк `update`.
3.  **Чтение кэша:** Apollo извлекает из хэш-таблицы кэша структуру данных для списка пользователей, отфильтрованного именно по `currentListVariables`.
4.  **Создание иммутабельной копии:** Если данные в кэше существуют, формируется обновленный объект. Мы используем деструктуризацию (spread operator) `items: [data.createUser, ...cachedData.searchUsers.items]` для иммутабельного добавления нового пользователя в начало массива. Прямая мутация массива `cachedData.searchUsers.items.push()` строго запрещена и вызовет сбой работы кэша.
5.  **Запись в кэш:** Обновленный массив записывается обратно в `InMemoryCache`. Все активные компоненты, наблюдающие за списком через `watchQuery()`, немедленно отрисовывают нового пользователя на экране.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Отсутствие поля `id` в возвращаемом графе мутации (Missing Cache Update ID)**
    *   *Симптомы:* Сервер успешно обрабатывает изменения на бэкенде, но данные на экране пользователя не меняются до полной ручной перезагрузки страницы.
    *   *Физика процесса:* Разработчик описал мутацию возврата данных без поля `id` (например, `updateUser(input: $input) { fullName role }`). Без идентификатора `id` Apollo `InMemoryCache` не может сопоставить пришедший ответ с конкретной нормализованной записью и просто игнорирует слияние.
    *   *Решение:* Всегда возвращайте уникальный идентификатор `id` для каждого изменяемого объекта в схеме мутации.

```typescript
// ОШИБКА: Изменения на сервере не обновят локальный кэш автоматически
mutation { updateUser(input: $input) { fullName role } }

// ИСПРАВЛЕНИЕ: ID присутствует в возвращаемом объекте
mutation { updateUser(input: $input) { id fullName role } }
```

*   **Ошибка 2: Падение кэша при чтении несуществующего запроса в update (ReadQuery Mismatch)**
    *   *Симптомы:* При попытке ручного обновления кэша в консоли браузера появляется ошибка: *"Can't find query inside cache"* или возвращается `null`, ломая последующий код.
    *   *Физика процесса:* Разработчик вызывает `cache.readQuery` для списка, который пользователь еще никогда не открывал (соответственно, запроса с такими переменными еще нет в оперативной памяти). `readQuery` возвращает `null`, и последующая деструктуризация `[...cachedData.items]` завершает работу приложения аварийно.
    *   *Решение:* Всегда делайте проверку на существование кэша перед попыткой его перезаписи.

```typescript
// ОШИБКА: Возможен сбой приложения, если cachedData равен null
const cachedData = cache.readQuery(...);
cache.writeQuery({ ..., data: { items: [..., ...cachedData.items] } });

// ИСПРАВЛЕНИЕ: Безопасное ветвление логики обновления
const cachedData = cache.readQuery(...);
if (cachedData) {
  cache.writeQuery({ ... });
}
```

*   **Ошибка 3: Ошибки рантайма из-за отсутствия обработки серверных GraphQL-ошибок валидации**
    *   *Симптомы:* При отправке невалидных данных (например, неверный формат email) кнопка отправки навсегда остается в заблокированном состоянии загрузки (спиннер крутится бесконечно).
    *   *Физика процесса:* Ошибки валидации GraphQL возвращаются не в классическом HTTP-статусе `400/500`, а в успешном HTTP-ответе `200 OK` внутри массива `errors` в теле ответа. Если в методе подписки не обрабатывается сценарий возникновения ошибок графа, код переключения флага `isPending` в `false` никогда не выполнится.
    *   *Решение:* Настраивайте обработку ошибок в коллбэке `error` метода `.subscribe()` или используйте RxJS-оператор `catchError`.

```typescript
// ОШИБКА: Блокировка UI при возникновении сетевого или валидационного сбоя
this.mutationService.updateUserProfile(payload).subscribe(res => { this.isPending.set(false); });

// ИСПРАВЛЕНИЕ: Сброс флагов загрузки в любом исходе транзакции
this.mutationService.updateUserProfile(payload).subscribe({
  next: () => { this.isPending.set(false); },
  error: (err) => { 
    this.isPending.set(false);
    this.errorMessage.set(err.message);
  }
});
```