---
tags: [web-protocols, http, rest, api, сетевое-взаимодействие]
related: ["[[Работа с API и HttpClient в Angular]]", "[[Интеграция с GraphQL]]"]
status: "completed"
---

# Сетевые протоколы и основы взаимодействия (HTTP & REST)

## БЫСТРЫЙ СТАРТ

*   **Протокол HTTP (HyperText Transfer Protocol)** — сетевой протокол прикладного уровня, функционирующий по бездокументной модели транзакций «запрос-ответ» (Stateless), где каждый запрос обрабатывается сервером изолированно.
*   **Архитектурный стиль REST (Representational State Transfer)** — свод ограничений для проектирования распределенных систем, где данные представляются в виде уникальных ресурсов (Resources), адресуемых по URL, а манипуляции над ними выполняются с помощью стандартизированных методов HTTP.
*   **Безопасные методы (Safe)** — методы (`GET`, `HEAD`), которые концептуально не изменяют состояние данных на сервере.
*   **Идемпотентные методы (Idempotent)** — методы (`GET`, `PUT`, `DELETE`), повторный запуск которых с идентичными параметрами гарантирует один и тот же результат на сервере без генерации дополнительных побочных эффектов.
*   **Используйте для:** построения масштабируемых, прозрачных, стандартизированных и легко кэшируемых интеграций между клиентской частью приложения и серверным API.
*   **Не используйте для:** обмена данными в реальном времени с высокой частотой обновлений (для этого больше подходят протоколы типа WebSockets или SSE).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: REST-клиент для управления сущностью пользователя согласно спецификации семантики методов
*   **Назначение:** Компонент Angular 19+ для работы со списками и профилями пользователей, демонстрирующий правильное сопоставление действий интерфейса с HTTP-методами (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) и безопасную передачу идентификаторов ресурсов в URL.

#### 1. Файл логики: `user-profile.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// Описываем строгий интерфейс модели данных пользователя
export interface UserProfileData {
  id: string;
  username: string;
  email: string;
}

@Component({
  selector: 'app-user-profile',
  // standalone: true опущен по умолчанию для стандартов Angular 19+
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush исключает лишние проверки рендеринга
})
export class UserProfile {
  // Внедряем HttpClient через функциональный inject()
  private readonly http = inject(HttpClient);
  
  // Базовый путь к ресурсу во множественном числе согласно стандартам REST API
  private readonly apiUrl = '/api/users';

  // Локальные реактивные сигналы для управления состоянием UI
  readonly users = signal<UserProfileData[]>([]);
  readonly activeUser = signal<UserProfileData | null>(null);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    // Автоматически загружаем первичный список при создании компонента
    this.fetchUsers();
  }

  // 1. GET-запрос: безопасный и идемпотентный метод получения списка ресурсов
  fetchUsers(): void {
    this.http.get<UserProfileData[]>(this.apiUrl)
      .pipe(takeUntilDestroyed()) // Безопасная отписка при уничтожении инстанса компонента
      .subscribe({
        next: (data) => this.users.set(data),
        error: (err) => this.errorMessage.set('Ошибка при чтении списка ресурсов: ' + err.message)
      });
  }

  // 2. GET-запрос по ID: чтение конкретного ресурса через встраивание ID в путь (Path Parameter)
  selectUser(id: string): void {
    this.http.get<UserProfileData>(`${this.apiUrl}/${id}`)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (user) => {
          this.activeUser.set(user);
          this.errorMessage.set(null);
        },
        error: (err) => this.errorMessage.set('Не удалось получить ресурс: ' + err.message)
      });
  }

  // 3. POST-запрос: небезопасный и неидемпотентный метод для создания НОВОГО ресурса
  createUser(newUserData: Omit<UserProfileData, 'id'>): void {
    this.http.post<UserProfileData>(this.apiUrl, newUserData)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (createdUser) => {
          this.users.update(list => [...list, createdUser]); // Добавляем созданный элемент в реактивный список
          this.errorMessage.set(null);
        },
        error: (err) => this.errorMessage.set('Ошибка создания ресурса: ' + err.message)
      });
  }

  // 4. PUT-запрос: небезопасный, но идемпотентный метод ПОЛНОЙ замены/перезаписи ресурса
  replaceUser(id: string, updatedUser: UserProfileData): void {
    this.http.put<UserProfileData>(`${`${this.apiUrl}/${id}`}`, updatedUser)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (replaced) => {
          this.users.update(list => list.map(u => u.id === id ? replaced : u));
          this.errorMessage.set(null);
        },
        error: (err) => this.errorMessage.set('Не удалось полностью перезаписать ресурс: ' + err.message)
      });
  }

  // 5. PATCH-запрос: небезопасный метод ЧАСТИЧНОГО обновления полей существующего ресурса
  updateUserEmail(id: string, newEmail: string): void {
    this.http.patch<UserProfileData>(`${this.apiUrl}/${id}`, { email: newEmail })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (patched) => {
          this.users.update(list => list.map(u => u.id === id ? patched : u));
          if (this.activeUser()?.id === id) {
            this.activeUser.set(patched);
          }
          this.errorMessage.set(null);
        },
        error: (err) => this.errorMessage.set('Ошибка частичного обновления ресурса: ' + err.message)
      });
  }

  // 6. DELETE-запрос: небезопасный, но идемпотентный метод удаления указанного ресурса
  deleteUser(id: string): void {
    this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          this.users.update(list => list.filter(u => u.id !== id)); // Удаляем элемент из списка в UI
          if (this.activeUser()?.id === id) {
            this.activeUser.set(null);
          }
          this.errorMessage.set(null);
        },
        error: (err) => this.errorMessage.set('Ошибка при удалении ресурса: ' + err.message)
      });
  }
}
```

#### 2. Файл разметки: `user-profile.html`
```html
<section class="user-panel">
  @if (errorMessage(); as error) {
    <div class="error-banner">
      <p>{{ error }}</p>
    </div>
  }

  <div class="panel-layout">
    <div class="list-section">
      <h3>Список пользователей (REST: GET /api/users)</h3>
      <ul class="user-list">
        @for (user of users(); track user.id) {
          <li class="user-item">
            <button class="user-btn" (click)="selectUser(user.id)">
              {{ user.username }}
            </button>
            <button class="delete-btn" (click)="deleteUser(user.id)">Удалить</button>
          </li>
        } @empty {
          <p>Список пуст</p>
        }
      </ul>
      <button class="create-btn" (click)="createUser({ username: 'NewUser', email: 'new@eltex.co' })">
        Создать нового (POST)
      </button>
    </div>

    @if (activeUser(); as user) {
      <div class="details-section">
        <h3>Детали (GET /api/users/{{ user.id }})</h3>
        <p><strong>ID:</strong> {{ user.id }}</p>
        <p><strong>Имя:</strong> {{ user.username }}</p>
        <p><strong>Почта:</strong> {{ user.email }}</p>

        <div class="actions">
          <button class="action-btn" (click)="updateUserEmail(user.id, 'patched@eltex.co')">
            Обновить почту (PATCH)
          </button>
          <button class="action-btn" (click)="replaceUser(user.id, { id: user.id, username: 'ReplacedName', email: 'replaced@eltex.co' })">
            Перезаписать полностью (PUT)
          </button>
        </div>
      </div>
    }
  </div>
</section>
```

#### 3. Файл стилей: `user-profile.css`
```css
.user-panel {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.error-banner {
  background-color: var(--error-bg);
  color: var(--error-text);
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 20px;
}

.panel-layout {
  display: flex;
  gap: 40px;
}

.user-list {
  list-style: none;
  padding: 0;
  margin: 16px 0;
}

.user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.user-btn {
  background: none;
  border: none;
  color: var(--text-normal);
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.95rem;
}

.delete-btn {
  background-color: var(--error-bg);
  color: var(--error-text);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.create-btn, .action-btn {
  background-color: var(--accent);
  color: #ffffff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 10px;
}

.create-btn:hover, .action-btn:hover {
  background-color: var(--accent-hover);
}

.details-section {
  flex: 1;
  background-color: var(--bg-primary);
  padding: 20px;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика протокола HTTPS (Криптография под капотом)
Безопасность передачи данных по протоколу HTTPS базируется на надстройке шифрования поверх TCP-соединения с использованием протокола **SSL/TLS**. 

```text
 Клиент (Браузер)                                          Сервер (Бэкенд)
        │                                                         │
        ├─────────────── 1. TCP Handshake (Syn/Ack) ─────────────►│
        │                                                         │
        ├─────────────── 2. Client Hello ────────────────────────►│ (Шифрование)
        │    - Список поддерживаемых шифров                       │
        │                                                         │
        │◄────────────── 3. Server Hello + Сертификат ────────────┤
        │    - Публичный асимметричный ключ сервера               │
        │                                                         │
        ├─────────────── 4. Проверка сертификата ────────────────►│ (Встроенная цепочка доверия)
        │    - Генерация Pre-Master Secret                        │
        │    - Шифрование Pre-Master публичным ключом сервера    │
        │                                                         │
        │◄────────────── 5. Обмен симметричным ключом ────────────┤ (Создание сессионного ключа)
        │                                                         │
        ├─────────────── 6. Запуск зашифрованного канала ────────►│ (Симметричное AES-шифрование)
        │    GET /api/users/42 (Тело и заголовки скрыты)          │
```

**Этапы установления безопасного соединения (Handshake):**
1.  **Client Hello**: Клиент посылает серверу запрос на установку защищенной сессии, передавая версию TLS и список поддерживаемых алгоритмов шифрования.
2.  **Server Hello**: Сервер выбирает оптимальный алгоритм шифрования, передает свой цифровой сертификат и публичный асимметричный ключ.
3.  **Верификация**: Браузер проверяет валидность сертификата сервера по встроенной в ОС/браузер цепочке доверия через доверенные корневые центры сертификации (CA).
4.  **Генерация сессионного ключа (асимметричный этап)**: Клиент генерирует случайный сессионный ключ (Pre-Master Secret), шифрует его публичным ключом сервера и отправляет серверу. Декодировать этот пакет может только сервер с помощью своего приватного ключа.
5.  **Запуск симметричного шифрования (симметричный этап)**: Обе стороны получают общий сессионный ключ. Все дальнейшие HTTP-сообщения (включая заголовки, параметры путей, куки и тела запросов) шифруются симметричным методом (например, AES), обеспечивая защиту от перехвата и модификации трафика посередине (атак Man-in-the-Middle).

---

### 2. Спецификация REST-архитектуры и ограничения
REST не является протоколом или стандартом — это архитектурный стиль, накладывающий 6 фундаментальных ограничений (Constraints) на архитектуру системы:

1.  **Клиент-Сервер (Client-Server)**: Четкое разделение ответственности. Клиентская часть (UI) не должна зависеть от внутренней структуры баз данных, а серверная — от деталей интерфейса. Это гарантирует независимую разработку компонентов.
2.  **Отсутствие состояния (Stateless)**: Сервер не хранит контекст сессии клиента между транзакциями. Каждый HTTP-запрос от клиента должен содержать абсолютно все необходимые метаданные и авторизационные данные для его обработки сервером (например, JWT-токен в заголовке `Authorization`).
3.  **Кэширование (Cacheable)**: Каждый ответ сервера должен содержать явные указания, можно ли кэшировать данные на клиенте (с помощью HTTP-заголовков `Cache-Control`, `ETag`, `Last-Modified`), что минимизирует сетевую нагрузку.
4.  **Единообразие интерфейса (Uniform Interface)**: Ресурсы адресуются по логическим URL-путям (существительные во множественном числе, например, `/api/users`), а манипуляции осуществляются стандартными HTTP-методами.
5.  **Слоистая система (Layered System)**: Клиент не знает, общается ли он напрямую с сервером приложений или с промежуточным прокси/балансировщиком нагрузки (Nginx, CDN, API Gateway). Это упрощает масштабирование.
6.  **Код по запросу (Code on Demand — опционально)**: Возможность сервера динамически расширять функциональность клиента, передавая исполняемый код (например, JS-скрипты).

---

### 3. Детальный пошаговый разбор выполнения метода `createUser`
1.  **Активация метода**: Пользователь кликает кнопку «Создать нового (POST)». Запускается метод `createUser(...)` компонента `UserProfile`.
2.  **Формирование пакета**: `HttpClient` Angular формирует структуру HTTP-запроса POST по адресу `/api/users`. В качестве тела (Request Body) передается JSON-строка `{ "username": "NewUser", "email": "new@eltex.co" }`.
3.  **Установка заголовков**: По умолчанию Angular автоматически устанавливает заголовок `Content-Type: application/json; charset=utf-8` для информирования сервера о формате тела запроса.
4.  **Отправка в сеть**: Запрос передается на транспортный уровень браузера, шифруется симметричным сессионным ключом TLS и посылается по сети в виде TCP-пакетов.
5.  **Обработка сервером**: REST-сервер расшифровывает запрос, валидирует данные, вносит запись в базу данных, генерирует новый уникальный `id` для пользователя.
6.  **Ответ сервера**: Сервер возвращает ответ со статус-кодом `201 Created` и телом, содержащим созданный объект: `{ "id": "102", "username": "NewUser", "email": "new@eltex.co" }`.
7.  **Реактивное обновление UI**: Внутри `.subscribe()` колбэк `next` получает десериализованный объект. Сигнал `users` обновляется с помощью метода `update()`, добавляя созданного пользователя в список, что мгновенно запускает точечную перерисовку соответствующего блока `@for` в шаблоне благодаря стратегии `OnPush`.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Race Condition при каскадных HTTP-запросах (Состояние гонки)**
    *   *Проблема:* Пользователь быстро кликает на разные элементы списка. Из-за разной задержки ответа сети медленный ответ на первый клик приходит в браузер позже, чем быстрый ответ на второй клик. В результате на детальной панели отображаются неактуальные данные.
    *   *Причина:* Использование неконтролируемой подписки внутри метода `.subscribe()` на каждый клик без автоматической отмены предыдущих незавершенных асинхронных потоков.
    *   *Решение:* Перейдите на использование декларативных потоков RxJS с оператором `switchMap`, который автоматически отменяет предыдущую внутреннюю HTTP-подписку при поступлении нового триггера.

```typescript
// ПЛОХО (Потенциальный race condition — данные могут перетереть друг друга при быстром клике)
selectUserUnsafe(id: string): void {
  this.http.get<UserProfileData>(`${this.apiUrl}/${id}`).subscribe(user => {
    this.activeUser.set(user);
  });
}

// ХОРОШО (switchMap автоматически отменит предыдущий незавершенный запрос при смене ID)
import { Subject, switchMap } from 'rxjs';

export class UserProfile {
  private readonly http = inject(HttpClient);
  private readonly userIdSubject = new Subject<string>();

  readonly activeUser$ = this.userIdSubject.pipe(
    switchMap(id => this.http.get<UserProfileData>(`/api/users/${id}`))
  );

  selectUser(id: string): void {
    this.userIdSubject.next(id); // Проталкиваем новое значение в поток
  }
}
```

*   **Ошибка 2: Нарушение идемпотентности и утечка сайд-эффектов при повторных запросах**
    *   *Проблема:* Клиент отправляет запрос на изменение/перезапись данных методом `POST` вместо `PUT` при повторном сохранении формы. На сервере плодятся дубликаты записей.
    *   *Причина:* Использование неидемпотентного метода `POST` для операций, которые семантически требуют полной перезаписи существующего ресурса (что является зоной ответственности `PUT`).
    *   *Решение:* Четко разделяйте операции создания нового ресурса без заданного ID на клиенте (используйте `POST` по пути `/api/users`) и операции изменения/перезаписи уже созданного ресурса с известным ID (используйте `PUT` или `PATCH` по пути `/api/users/id`).

```typescript
// ПЛОХО (Каждый повторный клик на кнопку "Сохранить профиль" создаст дубликат на сервере)
saveProfileUnsafe(profile: UserProfileData): void {
  this.http.post('/api/users/update', profile).subscribe(); 
}

// ХОРОШО (Использование PUT гарантирует, что многократный вызов перезапишет одну и ту же запись)
saveProfileSafe(profile: UserProfileData): void {
  this.http.put(`/api/users/${profile.id}`, profile).subscribe(); 
}
```

*   **Ошибка 3: Передача сложных структурных параметров через конкатенацию в URL-строке**
    *   *Проблема:* При передаче параметров поиска (например, `GET /api/users?search=Иван&Иванов`) запрос падает с синтаксическими ошибками или возвращает некорректные результаты.
    *   *Причина:* Пробелы и спецсимволы в URL-параметрах ломают структуру строки запроса из-за отсутствия кодирования (URL-encoding).
    *   *Решение:* Для формирования параметров запроса (Query Parameters) всегда используйте встроенный иммутабельный класс `HttpParams` вместо ручной склейки строк.

```typescript
// ПЛОХО (Спецсимволы нарушат структуру URL-адреса)
searchUsersUnsafe(query: string): void {
  this.http.get(`/api/users?search=${query}`).subscribe();
}

// ХОРОШО (HttpParams автоматически экранирует и закодирует все спецсимволы)
import { HttpParams } from '@angular/common/http';

searchUsersSafe(query: string): void {
  const params = new HttpParams().set('search', query);
  this.http.get('/api/users', { params }).subscribe();
}
```
