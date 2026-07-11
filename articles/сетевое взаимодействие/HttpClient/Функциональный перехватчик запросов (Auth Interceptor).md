---
tags: [angular, сетевое-взаимодействие, httpclient, архитектура]
related: ["[[Работа с API и HttpClient в Angular.md]]", "[[Автоматическое обновление токенов (Refresh Token).md]]"]
status: "completed"
---

# Функциональный перехватчик запросов (Auth Interceptor)

## БЫСТРЫЙ СТАРТ

*   **Функциональный перехватчик (`HttpInterceptorFn`)** — это современный тип middleware-обработчика в Angular (начиная с версии 15+), заменивший устаревшие и признанные нерекомендуемыми интерцепторы на базе классов (интерфейс `HttpInterceptor` объявлен deprecated).
*   **Принцип цепочки обязанностей:** Перехватчик представляет собой чистую функцию, которая принимает исходящий запрос `HttpRequest` [1.1.25] и ссылку на следующий обработчик в цепочке `HttpHandlerFn` [1.1.25], возвращая асинхронный поток событий `Observable<HttpEvent<unknown>>` [1.1.25].
*   **Иммутабельность сетевого слоя:** Объект `HttpRequest` строго защищен от прямой мутации. Любая модификация запроса (добавление заголовков, изменение URL, прикрепление параметров) должна выполняться исключительно посредством метода `.clone()` [1.1.25].
*   **Используйте для:** автоматической подстановки JWT-токенов авторизации [1.1.25], глобального перехвата и логирования сетевых ошибок [1.1.26], централизованного управления спиннерами загрузки или добавления системных заголовков (например, `X-Request-ID`).
*   **Не используйте для:** обхода ограничений CORS на этапе локальной разработки (для этого предназначен конфигуратор проксирования `proxy.conf.json`) [1.1.25].

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Функциональный интерцептор JWT-авторизации
*   **Назначение:** Перехватчик считывает токен доступа из локального хранилища, безопасно клонирует запрос и прикрепляет заголовок `Authorization: Bearer <token>` [1.1.25] ко всем исходящим запросам к защищенному API.

```typescript
import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Ключ для извлечения JWT-токена из локальной памяти браузера
  const storageKey = 'app_access_token';
  const token = localStorage.getItem(storageKey);

  // Список публичных эндпоинтов, на которые не нужно прикреплять токен авторизации
  const publicEndpoints = ['/auth/login', '/auth/register'];

  // Проверяем, идет ли запрос на публичный эндпоинт, чтобы сэкономить такты процессора
  const isPublic = publicEndpoints.some(endpoint => req.url.includes(endpoint));

  // Если токен найден в памяти и запрос идет на защищенный эндпоинт
  if (token && !isPublic) {
    // Безопасно клонируем иммутабельный запрос, прикрепляя заголовок Authorization.
    // Прямая перезапись req.headers.set() запрещена рантаймом Angular.
    const authenticatedRequest = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });

    // Передаем модифицированный запрос следующему обработчику в цепочке
    return next(authenticatedRequest);
  }

  // Если условий для модификации нет, передаем оригинальный запрос дальше без изменений
  return next(req);
};
```

---

### Шаблон 2: Универсальный перехватчик ошибок и перенаправления
*   **Назначение:** Глобальный обработчик сетевых сбоев перехватывает ошибки `401 Unauthorized` и `403 Forbidden`, перенаправляя пользователя на страницу авторизации, а также логирует системные сбои `5xx` во внешнюю систему мониторинга [1.1.26].

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export const errorRedirectInterceptor: HttpInterceptorFn = (req, next) => {
  // Внедряем роутер Angular через функциональный инжектор inject().
  // Это полностью легально, так как интерцептор выполняется в контексте внедрения.
  const router = inject(Router);

  // Пропускаем запрос дальше и подписываемся на поток входящих событий ответа
  return next(req).pipe(
    // catchError перехватывает ошибки на обратном пути прохождения потока к компоненту
    catchError((error: unknown) => {
      // Убеждаемся, что ошибка является объектом HttpErrorResponse
      if (error instanceof HttpErrorResponse) {
        // Перехватываем критические ошибки авторизации
        if (error.status === 401 || error.status === 403) {
          console.warn('[Security Interceptor] Сессия недействительна. Перенаправление на логин.');
          
          // Очищаем недействительный токен из памяти
          localStorage.removeItem('app_access_token');
          
          // Декларативно уводим пользователя на страницу входа
          router.navigate(['/login'], {
            queryParams: { returnUrl: router.url } // Сохраняем путь для возврата после входа
          });
        }

        // Логируем серверные ошибки 5xx во внешнюю систему мониторинга
        if (error.status >= 500) {
          console.error(`[Server Error 5xx] Критический сбой на эндпоинте: ${req.url}`, error);
        }
      }

      // Обязательно пробрасываем ошибку дальше, чтобы локальные catchError в компонентах могли её обработать
      return throwError(() => error);
    })
  );
};
```

---

### Шаблон 3: Демонстрационный OnPush-компонент просмотра профиля
*   **Назначение:** UI-компонент `ProfileViewer` инициирует безопасный GET-запрос через `HttpClient` с автоматической активацией глобальных интерцепторов и обработкой состояний.

#### 1. Файл логики: `profile-viewer.ts`
```typescript
import { Component, OnInit, inject, signal, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export interface UserProfileDto {
  username: string;
  email: string;
}

@Component({
  selector: 'app-profile-viewer',
  // standalone: true опущен по умолчанию в Angular 19+
  imports: [], // Массив пуст, так как используется только встроенный Control Flow
  templateUrl: './profile-viewer.html',
  styleUrl: './profile-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush гарантирует перерисовку только по сигналам
})
export class ProfileViewer implements OnInit { // Класс очищен от суффикса Component согласно стандартам
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef); // Потребуется для безопасной отписки

  // Объединяем состояние экрана в единый реактивный сигнал
  public readonly profileState = signal({
    data: null as UserProfileDto | null,
    isLoading: true,
    error: null as string | null
  });

  public ngOnInit(): void {
    const api = 'https://api.enterprise-service.com/v1/profile/me';

    // Делаем GET-запрос. Все зарегистрированные интерцепторы применятся автоматически.
    this.http.get<UserProfileDto>(api).pipe(
      catchError((err: Error) => {
        // Локально перехватываем ошибку для вывода в UI
        this.profileState.update(state => ({
          ...state,
          isLoading: false,
          error: err.message || 'Не удалось загрузить профиль'
        }));
        return of(null);
      }),
      // Гарантированно отписываемся при уничтожении компонента
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((profile) => {
      if (profile) {
        this.profileState.set({
          data: profile,
          isLoading: false,
          error: null
        });
      }
    });
  }
}
```

#### 2. Файл разметки: `profile-viewer.html`
```html
<div class="profile-card">
  @if (profileState().isLoading) {
    <p class="loading-status">Авторизация и получение профиля...</p>
  } @else if (profileState().error; as error) {
    <div class="error-banner">
      <p>Сбой загрузки: {{ error }}</p>
    </div>
  } @else if (profileState().data; as user) {
    <div class="profile-details">
      <h4>Добро пожаловать, {{ user.username }}</h4>
      <p class="email-text">Зарегистрированная почта: {{ user.email }}</p>
    </div>
  }
</div>
```

#### 3. Файл стилей: `profile-viewer.css`
```css
.profile-card {
  padding: 24px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 400px;
}

.loading-status {
  color: var(--text-muted);
  font-style: italic;
}

.error-banner {
  background-color: var(--error-bg);
  color: var(--error-text);
  padding: 12px;
  border-radius: 6px;
}

.profile-details h4 {
  color: var(--text-normal);
  font-size: 1.2rem;
  margin-bottom: 8px;
}

.email-text {
  color: var(--text-muted);
  font-size: 0.9rem;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная композиция функциональных интерцепторов (Middleware Chain)
Функциональные интерцепторы используют паттерн проектирования **«Цепочка обязанностей» (Chain of Responsibility)**. При инициализации приложения Angular собирает все зарегистрированные функции в единую цепочку вложенных вызовов.

```text
 [ Вызов HttpClient.get() ] 
             │
             ▼
 [ HttpInterceptorFn 1 (Auth) ] ──► Клонирует HttpRequest, добавляет Header [1.1.25]
             │
             ▼
 [ HttpInterceptorFn 2 (Error) ] ──► Регистрирует catchError в цепочке RxJS
             │
             ▼
 [ HttpBackend (HttpXhrBackend) ] ──► Преобразует HttpRequest в нативный XMLHttpHandler
             │
             ├──────────────────────► Сетевой запрос на бэкенд
             │◄────────────────────── Сетевой ответ от бэкенда (200 OK / JSON)
             ▼
 [ HttpInterceptorFn 2 (Error) ] ──► Проверяет отсутствие ошибок в HttpResponse
             │
             ▼
 [ HttpInterceptorFn 1 (Auth) ] ──► Пропускает ответ дальше без изменений
             │
             ▼
 [ Обратный колбэк в .subscribe() ] ──► Получение десериализованного JSON
```

Когда вы вызываете метод `next(req)` внутри перехватчика, вы не просто передаете запрос дальше по цепочке — вы возвращаете поток `Observable<HttpEvent<unknown>>` [1.1.25]. Это дает интерцепторам уникальную возможность перехватывать и изменять данные ответа сервера на обратном пути движения потока (из сети к компоненту). Для этого используются стандартные RxJS-операторы (`tap`, `map`, `catchError`), висящие в трубе `pipe()` после вызова `next(req)`.

---

### 2. Почему HttpRequest строго иммутабелен на уровне рантайма
Класс `HttpRequest` спроектирован иммутабельным по двум важнейшим причинам:

1.  **Повторные попытки отправки (Retry):**
    Если запрос завершился сетевым сбоем, и вы используете оператор `retry()`, Angular должен иметь возможность отправить исходный запрос заново [1.1.27]. Если бы интерцепторы могли напрямую изменять свойства оригинального объекта запроса во время первого прохода, повторный запрос ушел бы в сеть в непредсказуемом, "загрязненном" состоянии.
2.  **Параллельные запросы (Race Conditions):**
    Приложение может одновременно выполнять несколько независимых сетевых запросов. Прямая мутация общего объекта запроса привела бы к взаимному затиранию заголовков и параметров в куче памяти (Heap).

Метод `req.clone()` создает неглубокую копию (Shallow Copy) объекта запроса на новом адресе в памяти, позволяя безопасно переопределять свойства без побочных эффектов.

---

### 3. Детальный пошаговый разбор выполнения интерцептора авторизации
Разберем шаги работы `authInterceptor` (Шаблон 1) при отправке запроса:

1.  **Инициация:** Компонент делает GET-запрос к защищенному API `/api/profile`.
2.  **Запуск интерцептора:** Запрос перехватывается функцией `authInterceptor`.
3.  **Поиск токена:** Считывается значение `localStorage.getItem('app_access_token')`. Токен найден.
4.  **Проверка URL:** Проверяется, входит ли URL в список публичных эндпоинтов. Условие ложно (`/profile` не входит в список публичных).
5.  **Клонирование запроса:** Вызывается `req.clone()`. Создается копия запроса. Во внутренний словарь заголовков копируется новое свойство `Authorization`.
6.  **Передача по цепочке:** Метод `next(authenticatedRequest)` передает измененный запрос следующему интерцептору или в `HttpBackend` для физической отправки TCP-пакетов по сети.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка ручного указания заголовка Content-Type для FormData**
    *   *Симптомы:* Сервер возвращает ошибку `500 Internal Server Error` с сообщением *"No multipart boundary was found"*.
    *   *Физика процесса:* Разработчик пытается быть аккуратным и пишет в интерцепторе глобальное правило: если запрос отправляется, принудительно задавать заголовок `'Content-Type': 'multipart/form-data'`. Это полностью затирает уникальный строковый разделитель (boundary), который браузер генерирует автоматически для разделения бинарных файлов в теле запроса.
    *   *Решение:* Никогда не задавайте заголовок `Content-Type` для запросов, содержащих `FormData`, вручную. Браузер должен сформировать этот заголовок самостоятельно со всеми необходимыми boundaries.

```typescript
// ПЛОХО (Затрет boundary и сломает загрузку файлов на сервер)
// const modified = req.clone({ headers: req.headers.set('Content-Type', 'multipart/form-data') });

// ХОРОШО (Исключаем автоматическую установку заголовков для FormData)
if (req.body instanceof FormData) {
  return next(req); // Пропускаем запрос как есть, браузер сам выставит нужные заголовки
}
```

*   **Ошибка 2: Бесконечный цикл рекурсивных запросов при обновлении токена (Refresh Token Loop)**
    *   *Симптомы:* Вкладка браузера зависает, вкладка Network забивается сотнями запросов `POST /auth/refresh` в секунду, падающими по 401 ошибке.
    *   *Физика процесса:* Интерцептор ловит ошибку 401 и инициирует асинхронную отправку запроса на обновление токена. Однако сам этот запрос `/auth/refresh` также проходит через данный интерцептор и в случае неудачи (например, если сессия истекла окончательно) снова возвращает 401. Интерцептор ловит её и заново запускает обновление, уходя в бесконечную рекурсию.
    *   *Решение:* Исключайте URL-адрес эндпоинта обновления токенов из обработки 401 ошибок внутри интерцептора (как показано в Шаблоне 1).

*   **Ошибка 3: Отсутствие регистрации перехватчиков в provideHttpClient**
    *   *Симптомы:* Интерцепторы написаны корректно, но они не запускаются при отправке запросов, а заголовки авторизации не подставляются.
    *   *Физика процесса:* Функциональные интерцепторы должны быть явно зарегистрированы в глобальном инжекторе приложения. По умолчанию Angular не ищет их самостоятельно в кодовой базе.
    *   *Решение:* Зарегистрируйте интерцепторы в массиве `withInterceptors` функции `provideHttpClient` в файле конфигурации приложения `app.config.ts` (как показано в Шаблоне 1).