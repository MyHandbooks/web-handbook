---
tags: [angular, сетевое-взаимодействие, безопасность]
related: ["[[Сигнальное хранилище авторизации (Auth Store).md]]", "[[Функциональный гард доступа (CanActivate).md]]"]
status: "completed"
---

# Автоматическое обновление токенов (Refresh Token)

## БЫСТРЫЙ СТАРТ

*   **Автоматическое обновление токенов (Silent Refresh)** — это бесшовная механика ротации JWT-сессии. Она перехватывает сетевые ошибки `401 Unauthorized` (свидетельствующие об истечении срока действия короткоживущего `accessToken`) и выполняет скрытый запрос на получение новой пары токенов с помощью долгоживущего `refreshToken`.
*   **Функциональный перехватчик `HttpInterceptorFn`** используется для автоматического внедрения токена в исходящие запросы и обработки ошибок.
*   **Предотвращение дублирующих запросов:** Главная сложность паттерна — блокировка параллельных запросов к API. Если 5 сетевых запросов одновременно завершатся ошибкой 401, интерцептор должен выполнить ровно один запрос на обновление токена, а остальные 4 запроса приостановить в реактивном буфере-очереди и запустить заново только после успешного получения новой сессии.
*   **Используйте:** Во всех корпоративных веб-приложениях с авторизацией по протоколу OAuth2/JWT для непрерывного продления сессии пользователя без принудительного разлогинивания во время работы.
*   **Не используйте:** Если приложение использует классическую сессионную авторизацию на основе защищенных кук (`Cookie` с флагами `HttpOnly` и `Secure`), где продлением времени жизни сессии полностью управляет сервер.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Функциональный перехватчик с очередью ожидания токена
*   **Назначение:** Перехватчик автоматически подставляет JWT-токен во все запросы из `AuthStore`, отлавливает ошибки `401` и выстраивает очередь из параллельных запросов на время выполнения ротации токенов.

#### 1. Файл перехватчика: `auth-refresh.interceptor.ts`
```typescript
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { AuthStore } from './auth-store';
import { AuthService } from './auth.service';

export const authRefreshInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> => {
  // Внедряем сигнальное хранилище авторизации
  const authStore = inject(AuthStore);
  // Внедряем сервис выполнения HTTP-запросов авторизации
  const authService = inject(AuthService);

  // Считываем токен из вычисляемого сигнала только для чтения
  const token = authStore.token();
  let authReq = req;

  // 1. Если токен есть в памяти, внедряем его в заголовки запроса
  if (token) {
    authReq = addTokenHeader(req, token);
  }

  // 2. Выполняем запрос и перехватываем возможные ошибки
  return next(authReq).pipe(
    catchError((error: unknown) => {
      // Проверяем, что ошибка является HttpErrorResponse, имеет статус 401
      // И что падающий запрос не является самим запросом на обновление токенов (во избежание бесконечного цикла)
      if (
        error instanceof HttpErrorResponse && 
        error.status === 401 && 
        !req.url.includes('/auth/refresh')
      ) {
        return handle401Error(authReq, next, authService, authStore);
      }
      // Пробрасываем остальные ошибки без изменений
      return throwError(() => error);
    })
  );
};

// Вспомогательная функция для безопасного клонирования запроса и внедрения заголовка Authorization
function addTokenHeader(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    headers: req.headers.set('Authorization', `Bearer ${token}`)
  });
}

// Логика разрешения сетевого сбоя 401 и координации параллельных запросов
function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  authStore: AuthStore
): Observable<HttpEvent<unknown>> {
  // Проверяем, не запущено ли обновление токена параллельным потоком в данный момент
  if (!authService.isRefreshing) {
    // Входим в критическую секцию: блокируем отправку других запросов на обновление
    authService.isRefreshing = true;
    // Очищаем буфер очереди ожидания нового токена
    authService.refreshTokenSubject.next(null);

    // Запускаем асинхронную процедуру обновления токена по сети
    return authService.refreshToken().pipe(
      switchMap((newSession) => {
        // Снимаем блокировку критической секции
        authService.isRefreshing = false;
        // Разблокируем очередь, передавая свежий токен всем ожидающим запросам
        authService.refreshTokenSubject.next(newSession.accessToken);

        // Повторяем исходный упавший запрос со свежим токеном
        return next(addTokenHeader(req, newSession.accessToken));
      }),
      catchError((refreshError) => {
        // В случае критической ошибки обновления сбрасываем блокировку и пробрасываем ошибку
        authService.isRefreshing = false;
        return throwError(() => refreshError);
      })
    );
  } else {
    // Если обновление уже запущено параллельным запросом, текущий запрос встает в очередь
    return authService.refreshTokenSubject.pipe(
      // Пропускаем пустые (null) значения, пока токен не обновится на сервере
      filter(token => token !== null),
      // Берем только первое валидное значение и завершаем подписку (take(1) предотвращает утечки)
      take(1),
      // Повторяем исходный запрос со свежим токеном, полученным из очереди
      switchMap(newToken => next(addTokenHeader(req, newToken as string)))
    );
  }
}
```

---

### Шаблон 2: Сервис авторизации с методом обновления сессии
*   **Назначение:** Сервис координирует отправку POST-запроса на обновление токенов, управляет состоянием блокировки `isRefreshing` и ведет реактивный поток-очередь `refreshTokenSubject`.

#### 1. Код сервиса: `auth.service.ts`
```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthStore } from './auth-store';
import { AuthSession } from './auth-types';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authStore = inject(AuthStore);

  // Флаг критической секции для предотвращения повторных запросов на обновление
  public isRefreshing = false;
  
  // Реактивный буфер-очередь для трансляции нового токена зависшим запросам
  public readonly refreshTokenSubject = new BehaviorSubject<string | null>(null);

  private readonly apiEndpoint = 'https://api.enterprise-service.com/v1/auth/refresh';

  public refreshToken(): Observable<AuthSession> {
    const currentSession = this.authStore.currentSession();
    if (!currentSession) {
      return throwError(() => new Error('Сессия отсутствует в локальном хранилище'));
    }

    // Выполняем POST-запрос на ротацию токенов
    return this.http.post<AuthSession>(this.apiEndpoint, {
      refreshToken: currentSession.refreshToken
    }).pipe(
      tap((newSession) => {
        // Обновляем глобальное реактивное хранилище сессии новыми токенами
        this.authStore.login(newSession);
      }),
      catchError((error) => {
        // Если рефреш упал по любой причине (токен истек или отозван на сервере), делаем логаут
        console.warn('[AuthService] Токен обновления недействителен. Сброс сессии.');
        this.authStore.logout();
        return throwError(() => error);
      })
    );
  }
}
```

---

### Шаблон 3: Подключение перехватчика в конфигурации приложения
*   **Назначение:** Регистрация функционального перехватчика в глобальном HTTP-клиенте на этапе конфигурации DI-контейнера приложения.

#### 1. Код файла конфигурации: `app.config.ts`
```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authRefreshInterceptor } from './auth-refresh.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Регистрируем HttpClient и подключаем наш функциональный интерцептор в массив
    provideHttpClient(
      withInterceptors([authRefreshInterceptor])
    )
  ]
};
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика и ротация JWT-токенов
Безопасность авторизации по стандарту JWT держится на разделении обязанностей двух типов токенов:

1.  **Access Token (Токен доступа):**
    Имеет короткое время жизни (обычно от 5 до 15 минут). Он передается в каждом заголовке `Authorization` и проверяется сервером без обращения к базе данных (через валидацию криптографической подписи). Короткий срок жизни гарантирует, что даже в случае перехвата токена злоумышленником, он быстро станет недействительным.
2.  **Refresh Token (Токен обновления):**
    Имеет длительный срок жизни (от нескольких дней до месяцев). Он используется исключительно для получения новой пары токенов. Сервер хранит идентификаторы выданных `refreshToken` в БД, что позволяет при необходимости принудительно отозвать сессию пользователя (например, при клике на кнопку «Выйти на всех устройствах»).

Silent Refresh позволяет сохранять баланс между жесткой безопасностью (коротким временем жизни `accessToken`) и удобством пользователя (который не должен вводить пароль каждые 15 минут).

---

### 2. Разбор работы RxJS-операторов для предотвращения Race Conditions
В Шаблоне 1 используется связка операторов, которая реализует классический паттерн Semaphore (светофор) для координации потоков:

*   **`BehaviorSubject`** выступает в роли реактивной ячейки памяти. Когда начинается процесс обновления, в него записывается `null` (красный свет). Все параллельные запросы, попадающие в ветку `else`, зависают на фильтрации `filter(token => token !== null)`. Как только рефреш завершается, в `BehaviorSubject` записывается новый строковый токен (зеленый свет).
*   **`take(1)`** — критически важный оператор. Он заставляет подписку на `BehaviorSubject` автоматически закрыться (вызвать `complete`) сразу после того, как в нее придет первое предикатное значение (новый токен). Без `take(1)` зависшие запросы останутся подписанными на `BehaviorSubject` навсегда, создавая тяжелую утечку памяти.
*   **`switchMap`** отменяет текущее ожидание и переключает поток на выполнение повторного HTTP-запроса с внедренным свежим токеном.

---

### 3. Пошаговый разбор параллельного прохождения 401 ошибок
Представим, что браузер одновременно отправляет три запроса: `GET /users`, `GET /reports` и `GET /settings`. Токен доступа истек.

1.  **Падение запросов:** Все три запроса уходят на сервер и возвращаются с ошибкой `401 Unauthorized`.
2.  **Перехват первого запроса (`/users`):**
    Интерцептор ловит 401. Флаг `authService.isRefreshing` равен `false`. Запрос заходит в ветку `if`. Флаг `isRefreshing` переключается в `true`. Очередь блокируется (`refreshTokenSubject.next(null)`). Стартует HTTP-запрос `POST /auth/refresh`.
3.  **Перехват второго и третьего запросов (`/reports`, `/settings`):**
    Они также ловят 401, но флаг `isRefreshing` уже равен `true`. Они перенаправляются в ветку `else`. Там они подписываются на `refreshTokenSubject` и зависают, отфильтровывая дефолтный `null`.
4.  **Успешный рефреш:**
    Запрос `POST /auth/refresh` успешно завершается. Новые токены записываются в `AuthStore`.
5.  **Разблокировка очереди:**
    Флаг `isRefreshing` сбрасывается в `false`. Вызывается `refreshTokenSubject.next(newAccessToken)`.
6.  **Повторная отправка:**
    *   Запрос `/users` повторяется с новым токеном через `next(addTokenHeader(req, newAccessToken))` в цепочке `switchMap` ветки `if`.
    *   Запросы `/reports` и `/settings` получают новый токен из `refreshTokenSubject`, отписываются благодаря `take(1)` и повторно отправляются на сервер в цепочке `switchMap` ветки `else`.
7.  **Результат:** Все три операции завершились успешно. Пользователь не заметил сбоя. Было выполнено ровно одно обновление токенов на сервере.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Бесконечный цикл рекурсивных рефреш-запросов (Infinite 401 Loop)**
    *   *Симптомы:* Вкладка браузера зависает, вкладка Network забивается сотнями запросов `POST /auth/refresh` в секунду, падающими по 401 ошибке.
    *   *Физика процесса:* Если сам запрос на обновление токена `POST /auth/refresh` падает с ошибкой 401 (например, из-за того, что рефреш-токен на сервере был отозван или заблокирован), интерцептор перехватывает эту ошибку, видит статус 401 и пытается разрешить ее, снова запуская метод `refreshToken()`. Это порождает бесконечную рекурсию.
    *   *Решение:* Исключайте URL-адрес эндпоинта обновления токенов из обработки 401 ошибок внутри интерцептора (как показано в проверке `!req.url.includes('/auth/refresh')` в Шаблоне 1).

*   **Ошибка 2: Нарушение паттерна Single-Use Refresh Tokens на сервере**
    *   *Симптомы:* Случайные выходы из системы во время активной работы. Сервер возвращает ошибку недействительного рефреш-токена.
    *   *Физика процесса:* Современные стандарты безопасности требуют использования одноразовых рефреш-токенов (каждый рефреш возвращает новый `refreshToken`, а старый деактивируется). Если интерцептор спроектирован некачественно и допускает параллельную отправку двух запросов `POST /auth/refresh`, второй запрос придет со старым деактивированным токеном. Сервер воспримет это как попытку кражи сессии и заблокирует всю сессию.
    *   *Решение:* Тщательно проверяйте блокировку критической секции через флаг `isRefreshing` (как показано в Шаблоне 1), полностью исключая возможность отправки второго рефреш-запроса, пока первый находится в статусе `pending`.

*   **Ошибка 3: Потеря тела запроса (HTTP Body) или заголовков при повторной отправке**
    *   *Симптомы:* Повторные POST/PUT-запросы падают на сервере с ошибками валидации данных (например, пустой Payload или отсутствие необходимых специфических заголовков).
    *   *Физика процесса:* Разработчик некорректно клонировал оригинальный `HttpRequest` при добавлении токена, что привело к потере ссылок на метаданные запроса или бинарные данные FormData.
    *   *Решение:* Для модификации запросов всегда используйте только встроенный метод `req.clone()`, передавая изменения в объекте конфигурации (как показано во вспомогательной функции `addTokenHeader` Шаблона 1). Метод `clone()` гарантирует глубокое и безопасное копирование структуры оригинального объекта `HttpRequest` фреймворка.