---
tags: [angular, сетевое-взаимодействие, httpclient, interceptors]
related: ["[[Сетевые протоколы и основы взаимодействия (HTTP & REST)]]", "[[Интеграция с GraphQL]]"]
status: "completed"
---

# Работа с API и HttpClient в Angular

## БЫСТРЫЙ СТАРТ

*   **Сервис `HttpClient`** — это встроенный реактивный сервис Angular, предоставляющий типизированное API для взаимодействия с удаленными веб-серверами поверх протокола HTTP/HTTPS.
*   **Функциональные перехватчики (Functional Interceptors)** — легковесные middleware-функции, перехватывающие и модифицирующие исходящие запросы (`HttpRequest`) и входящие ответы (`HttpResponse`).
*   **Используйте для:** выполнения сетевых AJAX-запросов, автоматической авторизации (прикрепления JWT-токенов), централизованного логирования, глобальной обработки ошибок и автоматических повторных попыток отправки (Retry).
*   **Не используйте для:** обхода ограничений CORS на этапе локальной разработки (для этого предназначен конфигуратор проксирования `proxy.conf.json`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Функциональный перехватчик JWT-авторизации и конфигурация приложения
*   **Назначение:** Описание легковесного функционального интерцептора, автоматически прикрепляющего Bearer-токен к исходящим запросам, и его глобальная регистрация в `app.config.ts`.

#### 1. Файл интерцептора: `jwt.interceptor.ts`
```typescript
import { HttpInterceptorFn } from '@angular/common/http';

// Описываем функциональный перехватчик как чистую функцию типа HttpInterceptorFn
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  // Извлекаем токен из локального хранилища браузера
  const activeToken = localStorage.getItem('auth_token');

  // Запросы в Angular иммутабельны. Для изменения заголовков мы клонируем запрос.
  if (activeToken) {
    const modifiedRequest = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${activeToken}`)
    });
    // Передаем клонированный запрос следующему обработчику в цепочке
    return next(modifiedRequest);
  }

  // Если токена нет, передаем оригинальный запрос дальше без изменений
  return next(req);
};
```

#### 2. Файл глобальной конфигурации: `app.config.ts`
```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { jwtInterceptor } from './jwt.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // Настраиваем Zone.js с коалесценцией событий для оптимизации Change Detection
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Регистрируем HttpClient с массивом функциональных интерцепторов
    provideHttpClient(
      withInterceptors([jwtInterceptor])
    )
  ]
};
```

---

### Шаблон 2: Типизированный API-сервис с повтором запросов при сбое и компонент отображения
*   **Назначение:** Реализация безопасного API-сервиса с использованием `HttpParams`, `retry`-политики, чтения URL из среды `environment` и OnPush-компонента для отображения списка пользователей.

#### 1. Файл логики сервиса: `user-api.service.ts`
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, retry, catchError, throwError } from 'rxjs';

// Описываем строгий интерфейс сущности пользователя
export interface NetworkUser {
  id: number;
  name: string;
  email: string;
}

@Injectable({
  providedIn: 'root' // Регистрируем сервис в глобальном инжекторе (синглтон)
})
export class UserApiService {
  // Внедряем HttpClient через функциональный inject()
  private readonly http = inject(HttpClient);
  
  // Читаем базовый путь API из глобального конфигурационного файла среды
  private readonly gatewayUrl = 'https://api.enterprise-app.com/v1';

  getUsersByPage(searchQuery: string, pageNumber: number): Observable<NetworkUser[]> {
    // HttpParams иммутабелен. Каждая операция .set() возвращает новую копию объекта.
    // Это гарантирует безопасное кодирование (URL-encoding) спецсимволов.
    const queryParams = new HttpParams()
      .set('search', searchQuery)
      .set('page', pageNumber.toString());

    // Передаем строго типизированный ответ в generic-аргументе метода get()
    return this.http.get<NetworkUser[]>(`${this.gatewayUrl}/users`, { params: queryParams }).pipe(
      // Автоматически перезапускаем запрос при временных сбоях (2 попытки с паузой в 1с)
      retry({ count: 2, delay: 1000 }),
      // Перехватываем критические ошибки на уровне потока
      catchError((error) => {
        console.error('Сетевой сбой в UserApiService:', error);
        return throwError(() => new Error('Не удалось загрузить данные. Попробуйте позже.'));
      })
    );
  }
}
```

#### 2. Файл логики компонента: `user-list.ts`
```typescript
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common'; // Импортируем CommonModule ради AsyncPipe
import { Observable, catchError, of } from 'rxjs';
import { UserApiService, NetworkUser } from './user-api.service';

@Component({
  selector: 'app-user-list',
  // standalone: true опущен согласно стандартам Angular 19+
  imports: [CommonModule], // Декларативно импортируем только нужные модули (AsyncPipe)
  templateUrl: './user-list.html',
  styleUrl: './user-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush для исключения избыточных рендеров
})
export class UserList {
  // Внедряем кастомный API-сервис
  private readonly apiService = inject(UserApiService);

  // Реактивный сигнал для вывода локальной ошибки в UI
  readonly localError = signal<string | null>(null);

  // Декларативный поток данных, биндится напрямую в HTML через AsyncPipe
  readonly users$: Observable<NetworkUser[]> = this.apiService.getUsersByPage('', 1).pipe(
    catchError((err: Error) => {
      // Записываем ошибку в сигнал для отображения пользователю
      this.localError.set(err.message);
      // Возвращаем пустой массив во внешний поток, чтобы предотвратить падение AsyncPipe
      return of([]);
    })
  );
}
```

#### 3. Файл разметки: `user-list.html`
```html
<section class="users-container">
  <header class="users-header">
    <h2 class="users-title">Список сотрудников предприятия</h2>
  </header>

  @if (localError(); as error) {
    <div class="error-notification" role="alert">
      <p>{{ error }}</p>
    </div>
  }

  <!-- Декларативно подписываемся на поток с помощью AsyncPipe -->
  <!-- Новый Control Flow Angular 19+ компилируется в производительные JS-инструкции -->
  @if (users$ | async; as users) {
    <ul class="users-grid">
      @for (user of users; track user.id) {
        <li class="user-card">
          <h4 class="card-name">{{ user.name }}</h4>
          <p class="card-email">{{ user.email }}</p>
        </li>
      } @empty {
        <p class="empty-state">Нет данных для отображения.</p>
      }
    </ul>
  }
</section>
```

#### 4. Файл стилей: `user-list.css`
```css
.users-container {
  padding: 24px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.users-title {
  font-size: 1.25rem;
  color: var(--text-normal);
  margin-bottom: 20px;
}

.error-notification {
  background-color: var(--error-bg);
  border: 1px solid var(--border);
  color: var(--error-text);
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 20px;
}

.users-grid {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.user-card {
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  padding: 16px;
  border-radius: 8px;
}

.card-name {
  color: var(--text-normal);
  margin-bottom: 4px;
}

.card-email {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.empty-state {
  color: var(--text-muted);
  font-style: italic;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Жизненный цикл HTTP-запроса через цепочку перехватчиков (Middleware Chain)
Каждый запрос, инициируемый через `HttpClient`, проходит через динамически выстраиваемую цепочку обработчиков. В основе этой архитектуры лежит паттерн «Цепочка обязанностей» (Chain of Responsibility).

```text
 [ Вызов HttpClient.get() ] 
             │
             ▼
 [ HttpInterceptorFn 1 (Auth) ] ──► Клонирует HttpRequest, добавляет Header
             │
             ▼
 [ HttpInterceptorFn 2 (Logger) ] ──► Засекает время старта запроса
             │
             ▼
 [ HttpBackend (HttpXhrBackend) ] ──► Преобразует HttpRequest в нативный XMLHttpHandler/Fetch
             │
             ├──────────────────────► Сетевой запрос на бэкенд (через прокси/DNS)
             │◄────────────────────── Сетевой ответ от бэкенда (200 OK / JSON)
             ▼
 [ HttpInterceptorFn 2 (Logger) ] ──► Вычисляет и логирует время выполнения
             │
             ▼
 [ HttpInterceptorFn 1 (Auth) ] ──► Пропускает ответ дальше
             │
             ▼
 [ Обратный колбэк в .subscribe() ] ──► Получение десериализованного JSON
```

Когда регистрируются функциональные интерцепторы через `withInterceptors([...])`, Angular оборачивает каждую функцию-перехватчик в логическую цепочку вызовов. 
*   Каждый интерцептор принимает аргумент `req` (текущий иммутабельный запрос) и `next` (ссылка на следующую функцию в цепочке).
*   Вызов `next(req)` возвращает RxJS-поток `Observable<HttpEvent<any>>`. Это позволяет интерцепторам не только перехватывать исходящий трафик, но и обрабатывать входящие ответы сервера с помощью операторов RxJS (таких как `tap`, `catchError`, `map`) на обратном пути потока.
*   Конечным звеном цепочки является класс `HttpBackend`, который транслирует абстрактное событие Angular в реальный сетевой запрос браузера.

---

### 2. Физика проксирования на этапе разработки (`proxy.conf.json`)
Браузерная политика Same-Origin Policy блокирует прямые AJAX-запросы с фронтенда (`localhost:4200`) на бэкенд (`localhost:3000`), если у них различаются порты или домены. 

Для беспрепятственной разработки в Angular CLI интегрирован реверс-прокси на базе dev-сервера (Webpack/Vite):
*   Когда Angular-приложение делает запрос на `/api/users`, браузер отправляет его на тот же хост, с которого загружена страница: `http://localhost:4200/api/users`. С точки зрения браузера, ограничение Same-Origin не нарушено.
*   Dev-сервер Angular CLI перехватывает этот запрос согласно правилу из `proxy.conf.json`, стирает оригинальный заголовок `Host`, подменяет его на `localhost:3000` (благодаря параметру `"changeOrigin": true`), переписывает путь (если настроен `"pathRewrite"`) и перенаправляет запрос на реальный бэкенд по протоколу TCP.
*   Ответ сервера возвращается обратно в браузер через этот же прокси-канал. В production-окружении прокси отключается, так как статические файлы фронтенда раздаются веб-сервером (Nginx) с того же порта и домена, на котором запущен API.

---

### 3. Детальный пошаговый разбор выполнения шаблона 2
1.  **Инъекция сервиса**: При создании `UserList` Angular разрешает зависимость `UserApiService` и записывает её в приватное свойство `apiService`.
2.  **Инициализация потока**: Свойство `users$` инициализируется потоком. `UserApiService` вызывает `http.get()`. В этот момент реального запроса в сеть не происходит — поток ленивый (cold).
3.  **Конструирование параметров**: Внутри `getUsersByPage` создается экземпляр `HttpParams`. Вызов `.set('search', '')` и `.set('page', '1')` генерирует иммутабельные параметры кодирования строки запроса.
4.  **Связывание с шаблоном**: HTML-парсер видит пайп `users$ | async` в шаблоне. `AsyncPipe` автоматически вызывает метод `.subscribe()` на этом потоке.
5.  **Выполнение сетевого запроса**: Подписка активирует выполнение цепочки интерцепторов. Запрос проходит через `jwtInterceptor`, получает заголовок авторизации и отправляется в сеть.
6.  **Обработка ошибки или успеха**: Если сеть падает, оператор `retry` приостанавливает поток ошибки, выжидает 1 секунду и отправляет запрос заново. Если все попытки провалились, срабатывает `catchError` внутри сервиса, выбрасывающий кастомную ошибку, которая затем перехватывается в `catchError` внутри компонента. Там ошибка записывается в сигнал `localError`, а в HTML возвращается пустой массив `[]` для предотвращения разрушения шаблона.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Прямая мутация HttpRequest в интерцепторе**
    *   *Симптомы:* Ошибка компиляции или рантайм-ошибка: `TypeError: Cannot assign to read only property '...' of object`.
    *   *Физика процесса:* Объекты `HttpRequest` спроектированы иммутабельными ради безопасности и предсказуемости. Прямое изменение свойств запроса (например, `req.url = '/new-url'`) заблокировано рантаймом.
    *   *Решение:* Для модификации любого параметра запроса (URL, заголовки, параметры путей) необходимо использовать метод `.clone()`, передавая туда объект с новыми значениями свойств.

```typescript
// ПЛОХО (Прямая мутация приведет к TypeError в рантайме)
export const badInterceptor: HttpInterceptorFn = (req, next) => {
  req.headers.set('X-Custom-Header', 'Value'); // ❌ Прямая мутация не сработает
  return next(req);
};

// ХОРОШО (Использование метода clone для иммутабельной модификации)
export const goodInterceptor: HttpInterceptorFn = (req, next) => {
  const secureReq = req.clone({
    headers: req.headers.set('X-Custom-Header', 'Value') // ✅ Безопасный клон запроса
  });
  return next(secureReq);
};
```

*   **Ошибка 2: Бесконечный цикл рекурсивных запросов при обновлении токена (Refresh Token Loop)**
    *   *Симптомы:* Зависание браузера, переполнение стека вызовов, сотни каскадных запросов на эндпоинт `/refresh` в секунду.
    *   *Физика процесса:* Интерцептор ловит ошибку `401 Unauthorized` и отправляет запрос на обновление токена. Но сам запрос на обновление токена `/refresh` также проходит через этот же интерцептор, возвращает `401` (например, если сессия истекла окончательно) и снова инициирует вызов самого себя, уходя в бесконечную рекурсию.
    *   *Решение:* Добавьте проверку URL-адреса запроса внутри интерцептора. Если запрос идет на эндпоинт авторизации или обновления токена, пропускайте его дальше без повторной обработки ошибок `401`.

```typescript
// ПЛОХО (Вызовет бесконечный цикл, если запрос /auth/refresh вернет 401)
export const badAuthInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401) {
        return refreshAccessToken().pipe( // ❌ Рекурсивный вызов без проверки URL
          switchMap(() => next(req))
        );
      }
      return throwError(() => error);
    })
  );
};

// ХОРОШО (Защита от бесконечного цикла за счет проверки URL)
export const goodAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error) => {
      // Предотвращаем рекурсию: если запрос уже шел на обновление, пробрасываем ошибку дальше
      if (error.status === 401 && !req.url.includes('/auth/refresh')) {
        return authService.refreshSession().pipe(
          switchMap(() => {
            const newRequest = req.clone({
              headers: req.headers.set('Authorization', `Bearer ${authService.getToken()}`)
            });
            return next(newRequest);
          }),
          catchError((refreshErr) => {
            authService.logout(); // Принудительный логаут при сбое рефреша
            return throwError(() => refreshErr);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
```

*   **Ошибка 3: Утечка потока ошибок при обработке на уровне внешнего Observable (Stream Termination)**
    *   *Проблема:* После первой сетевой ошибки компонент перестает реагировать на любые действия пользователя (например, повторный ввод в строку поиска больше не отправляет сетевые запросы).
    *   *Причина:* Разработчик разместил оператор `catchError` на уровне внешнего Observable-потока. По спецификации Reactive Streams, когда поток переходит в состояние ошибки (`error`), он необратимо завершает свою работу. Последующие события от источника (например, ввод в Input) игнорируются.
    *   *Решение:* Размещайте оператор `catchError` внутри `pipe` вложенного Observable (внутри операторов `switchMap` / `concatMap`), чтобы изолировать ошибку и возвращать резервное значение без прерывания внешнего потока.

```typescript
// ПЛОХО (При первой ошибке сети внешний поток search$ умрет навсегда)
readonly search$ = this.searchControl.valueChanges.pipe(
  switchMap(query => this.apiService.getUsersByPage(query, 1)),
  catchError(() => of([])) // ❌ Внешний catchError убивает стрим при первой ошибке
);

// ХОРОШО (Локализация ошибки внутри switchMap сохраняет жизнеспособность внешнего потока)
readonly searchSafe$ = this.searchControl.valueChanges.pipe(
  switchMap(query => this.apiService.getUsersByPage(query, 1).pipe(
    catchError(() => of([])) // ✅ Внутренний catchError изолирует ошибку, стрим продолжает жить
  ))
);
```
