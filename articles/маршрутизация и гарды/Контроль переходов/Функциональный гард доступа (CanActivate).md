---
tags: [angular, роутинг, гарды, безопасность]
related: ["[[Предотвращение потери данных в формах (CanDeactivate).md]]", "[[Сигнальное хранилище авторизации (Auth Store).md]]"]
status: "completed"
---

# Функциональный гард доступа (CanActivate)

## БЫСТРЫЙ СТАРТ

*   **Функциональный гард `CanActivateFn`** — это чистая функция-защитник маршрута, пришедшая на смену устаревшим и признанным нерекомендуемыми гардам-классам (интерфейс `CanActivate` объявлен deprecated). Он определяет, разрешено ли пользователю перейти на запрашиваемый URL-адрес.
*   **Возвращаемые значения:** Функция может возвращать `boolean` (разрешить/заблокировать переход), нативный объект `UrlTree` (автоматически перенаправить пользователя на другой роут) или реактивные обертки над ними — `Observable<boolean | UrlTree>` / `Promise<boolean | UrlTree>`.
*   **Использование inject():** Поскольку функциональные гарды не являются классами, внедрение зависимостей (сервиса авторизации, роутера) осуществляется внутри тела функции через функциональный метод `inject()`.
*   **Используйте:** Для ограничения доступа к защищенным разделам приложения (профиль пользователя, панель управления, корзина) на основе состояния авторизации, наличия токена сессии или ролевой модели доступа.
*   **Не используйте:** Для предотвращения ухода со страницы с несохраненными изменениями (для этого применяется гард `CanDeactivateFn`) или для предварительной загрузки данных из сети перед рендерингом (для этого используется `ResolveFn`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Простейший функциональный гард авторизации (auth.guard.ts)
*   **Назначение:** Гард проверяет флаг авторизации в реактивном сервисе. Если пользователь не авторизован, он перенаправляется на страницу логина с помощью `UrlTree`.

#### 1. Файл функционального гарда: `auth.guard.ts`
```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthState } from '../../security/auth-state';

export const authGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  // Внедряем зависимости через inject() в контексте выполнения гарда
  const authState = inject(AuthState);
  const router = inject(Router);

  // Считываем реактивное значение сигнала авторизации
  const isAuthenticated = authState.isAuthenticated();

  if (isAuthenticated) {
    // Разрешаем переход на роут
    return true;
  }

  // Перенаправляем пользователя на страницу входа, возвращая UrlTree
  return router.createUrlTree(['/login'], {
    // Сохраняем целевой URL, чтобы вернуть пользователя туда после успешного входа
    queryParams: { returnUrl: state.url }
  });
};
```

#### 2. Файл конфигурации маршрутов: `app.routes.ts`
```typescript
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'profile',
    // Подключаем наш функциональный гард к защищаемому маршруту
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile').then(m => m.Profile)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.Login)
  }
];
```

---

### Шаблон 2: Ролевой гард доступа с чтением метаданных роута (role.guard.ts)
*   **Назначение:** Универсальный гард считывает требуемую роль из свойства `data` конфигурации маршрута и сравнивает её с ролью текущего пользователя.

#### 1. Файл функционального гарда по ролям: `role.guard.ts`
```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthState } from '../../security/auth-state';

export const roleGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  const authState = inject(AuthState);
  const router = inject(Router);

  // Извлекаем необходимую роль из метаданных запрашиваемого маршрута
  const requiredRole = route.data['requiredRole'] as string | undefined;
  const userRole = authState.currentRole();

  // Если для роута не настроена роль, разрешаем доступ по умолчанию
  if (!requiredRole) {
    return true;
  }

  // Сравниваем роль пользователя с требуемой
  if (userRole === requiredRole) {
    return true;
  }

  // При несовпадении ролей перенаправляем на страницу ошибки доступа
  return router.createUrlTree(['/forbidden']);
};
```

#### 2. Файл конфигурации маршрутов с метаданными: `admin.routes.ts`
```typescript
import { Routes } from '@angular/router';
import { roleGuard } from './guards/role.guard';

export const adminRoutes: Routes = [
  {
    path: 'dashboard',
    canActivate: [roleGuard],
    // Передаем требуемую роль через статическое свойство data
    data: { requiredRole: 'admin' },
    loadComponent: () => import('./admin-dashboard').then(m => m.AdminDashboard)
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./forbidden-page').then(m => m.ForbiddenPage)
  }
];
```

---

### Шаблон 3: Асинхронный гард с проверкой сессии на сервере (api-auth.guard.ts)
*   **Назначение:** Гард выполняет асинхронный HTTP-запрос для валидации токена сессии, возвращая `Observable<boolean | UrlTree>`.

#### 1. Файл асинхронного гарда: `api-auth.guard.ts`
```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, Observable, of, take } from 'rxjs';
import { AuthService } from '../../services/auth.service';

export const apiAuthGuard: CanActivateFn = (route, state): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Выполняем асинхронную проверку токена через HTTP-сервис
  return authService.verifySessionOnServer().pipe(
    // Извлекаем только первое значение и завершаем поток (обязательно для гардов!)
    take(1),
    // Преобразуем успешный ответ сервера в boolean или UrlTree
    map((isValid: boolean) => {
      if (isValid) {
        return true;
      }
      return router.createUrlTree(['/login']);
    }),
    // Ловим сетевые сбои и безопасно перенаправляем на логин
    catchError((error) => {
      console.error('[Guard] Ошибка сетевой верификации сессии:', error);
      return of(router.createUrlTree(['/login']));
    })
  );
};
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектура и преимущества функциональных гардов
До перехода на версию Angular 15 все гарды описывались в виде тяжелых классов-сервисов, реализующих интерфейсы маршрутизатора:

```typescript
// УСТАРЕВШИЙ КЛАСС-ГАРД (Deprecated)
@Injectable({ providedIn: 'root' })
export class OldAuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}
  canActivate(): boolean { ... }
}
```

#### Почему Angular полностью отказался от этой модели в пользу `CanActivateFn`?
1.  **Производительность Tree-Shaking:**
    Классы, помеченные декоратором `@Injectable`, генерируют избыточный мета-код для компилятора, увеличивая итоговый бандл приложения. Простые функциональные гарды представляют собой чистые функции JS, которые легко оптимизируются и вырезаются сборщиком, если они не импортированы.
2.  **Лаконичность (Boilerplate Reduction):**
    Вместо создания отдельного файла, объявления класса, конструктора и регистрации его в провайдерах, функциональный гард описывается в одну стрелочную функцию. Вы даже можете объявлять простые инлайновые гарды-заглушки прямо внутри массива `Routes`:
    ```typescript
    {
      path: 'simple-page',
      canActivate: [() => inject(AuthState).isAdmin()], // Инлайновый гард
      loadComponent: ...
    }
    ```

### 2. Как работает inject() во внеклассовом контексте
Метод `inject()` может выполняться строго внутри контекста внедрения (Injection Context). Это системное ограничение Angular:

*   **Где `inject()` работает:** Метод гарантированно работает во время вызова конструктора класса, в инициализаторах полей класса, а также внутри фабричных функций провайдеров.
*   **Как это работает в гардах:** Angular-роутер перед запуском функционального гарда принудительно оборачивает его вызов в контекст `runInInjectionContext()`. Благодаря этому вы можете беспрепятственно использовать `inject()` непосредственно в теле функции гарда.
*   **Где `inject()` сломается:** Метод выбросит критическую runtime-ошибку `NG0203`, если вы попытаетесь вызвать его асинхронно — например, внутри колбэка `.subscribe()`, в методе `setTimeout` или после оператора `await` в асинхронной функции.

### 3. Детальный пошаговый разбор жизненного цикла выполнения переходов
Проследим шаги роутера при переходе пользователя по адресу `/profile` (Шаблон 1):

1.  **Клик по ссылке:** Навигационный триггер инициирует переход. Роутер переходит в фазу сопоставления путей (Route Matching).
2.  **Обнаружение защитников:** Роутер находит целевой маршрут `profile` и считывает массив `canActivate: [authGuard]`.
3.  **Выполнение гардов:** Роутер запускает функцию `authGuard`, передавая в неё два системных аргумента: `ActivatedRouteSnapshot` (данные роута) и `RouterStateSnapshot` (состояние дерева путей).
4.  **Считывание сигнала:** Метод `inject(AuthState)` получает инстанс сервиса. Проверяется значение сигнала `isAuthenticated()`.
5.  **Ветвление и редирект:**
    *   *Сценарий А (Авторизован):* Функция возвращает `true`. Роутер продолжает выполнение навигации.
    *   *Сценарий Б (Гость):* Функция создает и возвращает объект `UrlTree`. Роутер останавливает текущую навигацию на `/profile` и инициирует новый переход на роут, описанный в `UrlTree` (в данном случае — `/login`).

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Бесконечный цикл перенаправлений (Infinite Redirect Loop)**
    *   *Симптомы:* Страница зависает при переходе, консоль браузера переполняется ошибками или падает по превышению глубины стека вызовов (Maximum call stack size exceeded).
    *   *Физика процесса:* Разработчик применил гард `authGuard` глобально ко всей группе роутов (например, через loadChildren), включая маршрут `/login`. Когда неавторизованный пользователь пытается зайти на любую страницу, гард перенаправляет его на `/login`. При попытке открыть `/login` снова срабатывает этот же гард, видит, что пользователь не авторизован, и снова перенаправляет его на `/login`, зацикливая выполнение.
    *   *Решение:* Никогда не вешайте защитные гарды на публичные страницы авторизации и ошибок доступа. Исключайте их из зоны действия гардов, размещая на разных уровнях иерархии маршрутов.

*   **Ошибка 2: Нарушение Injection Context при асинхронных операциях**
    *   *Симптомы:* Приложение падает с ошибкой `NG0203: inject() must be called from an active injection context` при попытке выполнения асинхронного гарда.
    *   *Физика процесса:* Разработчик пытается вызвать `inject()` асинхронно:
        ```typescript
        // ОШИБКА: inject() вызовется после задержки, когда контекст внедрения уже уничтожен
        export const badGuard: CanActivateFn = () => {
          return of(true).pipe(
            delay(100),
            map(() => inject(Router).createUrlTree(['/'])) 
          );
        };
        ```
    *   *Решение:* Всегда вызывайте `inject()` строго синхронно в самом начале тела функции гарда, сохраняя полученные ссылки в локальные переменные.

```typescript
// ИСПРАВЛЕНИЕ: Переменная router создается синхронно и безопасно
export const goodGuard: CanActivateFn = () => {
  const router = inject(Router); // Синхронный вызов в Injection Context
  return of(true).pipe(
    delay(100),
    map(() => router.createUrlTree(['/'])) // Безопасное использование ссылки
  );
};
```

*   **Ошибка 3: Зависание навигации из-за незавершающихся потоков (Observable)**
    *   *Симптомы:* Переход по ссылке не происходит, интерфейс не реагирует на клики, но и ошибок в консоли нет.
    *   *Физика процесса:* Асинхронный гард возвращает поток `Observable`, который выдает значения, но никогда не завершается (не вызывает событие `complete`). Это типично при подписке на бесконечные шины данных или `Subject`/`BehaviorSubject`. Роутер ожидает завершения потока, чтобы зафиксировать окончательное решение, и навигация зависает в режиме ожидания.
    *   *Решение:* Всегда гарантируйте закрытие возвращаемого потока. Добавляйте операторы `take(1)` или `first()` в конец цепочки RxJS-операторов асинхронного гарда (как показано в Шаблоне 3).