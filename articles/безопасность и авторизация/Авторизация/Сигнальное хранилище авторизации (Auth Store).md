---
tags: [angular, сигналы, авторизация, безопасность]
related: ["[[Автоматическое обновление токенов (Refresh Token).md]]", "[[Функциональный гард доступа (CanActivate).md]]"]
status: "completed"
---

# Сигнальное хранилище авторизации (Auth Store)

## БЫСТРЫЙ СТАРТ

*   **Сигнальное хранилище авторизации (Auth Store)** — это реактивный сервис совместного использования данных, который централизованно управляет состоянием сессии пользователя (профилем, токенами доступа, ролевой моделью и статусом авторизации) во всем приложении с помощью Сигналов (`signal` и `computed`).
*   **Единый источник правды:** Использование Сигналов вместо классического RxJS `BehaviorSubject` избавляет от необходимости писать ручные отписки в компонентах, гарантирует синхронное и glitch-free (без мерцания) обновление зависимых вычислений по всему реактивному графу Angular.
*   **Используйте для:** декларативного хранения сессии пользователя в оперативной памяти, автоматической синхронизации данных профиля с локальным хранилищем браузера, проверки прав доступа «на лету» и реактивного скрытия/отображения элементов разметки.
*   **Не используйте для:** хранения секретных JWT-токенов доступа в открытом виде внутри долгосрочного локального хранилища `LocalStorage` в промышленных проектах (это создает уязвимость перед XSS-атаками). Секретные токены должны храниться в оперативной памяти `AuthStore`, а долгоживущий `refreshToken` — в куках с флагом `HttpOnly`.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Сигнальная служба хранения сессии с авто-сохранением
*   **Назначение:** Глобальный сервис хранит состояние авторизации, предоставляет вычисляемые свойства (computed-сигналы) для UI-компонентов, инкапсулирует методы входа/выхода и автоматически синхронизирует профиль с `LocalStorage` через реактивный `effect()`.

#### 1. Файл интерфейсов: `auth-types.ts`
```typescript
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}
```

#### 2. Код сервиса хранилища: `auth-store.ts`
```typescript
import { Injectable, signal, computed, effect, WritableSignal } from '@angular/core';
import { AuthSession, UserProfile } from './auth-types';

@Injectable({
  providedIn: 'root' // Регистрируем сервис в глобальном инжекторе как синглтон с поддержкой Tree-Shaking
})
export class AuthStore {
  // Ключ для хранения нечувствительных метаданных профиля в LocalStorage
  private readonly STORAGE_KEY = 'app_user_session_meta';

  // 1. Приватное изменяемое сигнальное состояние сессии.
  // Инициализируем его данными из LocalStorage, если они там присутствуют после прошлой сессии.
  private readonly session: WritableSignal<AuthSession | null>;

  // 2. Экспортируем сигналы чтения (ReadOnly) во внешний мир ради соблюдения инкапсуляции
  public readonly currentSession;

  // 3. Вычисляемый сигнал статуса авторизации (автоматически обновляется при изменении session)
  public readonly isAuthenticated;

  // 4. Вычисляемый сигнал получения данных профиля
  public readonly userProfile;

  // 5. Вычисляемый сигнал токена доступа для авто-подстановки в интерцепторы
  public readonly token;

  constructor() {
    // Пытаемся извлечь сохраненную сессию при старте приложения
    const savedData = localStorage.getItem(this.STORAGE_KEY);
    const initialSession = savedData ? (JSON.parse(savedData) as AuthSession) : null;
    
    // Инициализируем сигнал
    this.session = signal<AuthSession | null>(initialSession);

    // Настраиваем публичные сигналы чтения
    this.currentSession = this.session.asReadonly();
    this.isAuthenticated = computed<boolean>(() => this.session() !== null);
    
    this.userProfile = computed<UserProfile | null>(() => {
      const active = this.session();
      return active ? active.user : null;
    });

    this.token = computed<string | null>(() => {
      const active = this.session();
      return active ? active.accessToken : null;
    });

    // 6. Создаем реактивный эффект для автоматического сохранения состояния в LocalStorage.
    // Эффект сработает при первой инициализации и при каждой последующей мутации сигнала session!
    effect(() => {
      const activeSession = this.session();
      if (activeSession) {
        // Сериализуем и сохраняем нечувствительные данные профиля на диск клиента
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(activeSession));
      } else {
        // При логауте полностью вычищаем ключи
        localStorage.removeItem(this.STORAGE_KEY);
      }
    });
  }

  // Метод успешного входа
  public login(newSession: AuthSession): void {
    this.session.set(newSession);
  }

  // Метод выхода из системы
  public logout(): void {
    this.session.set(null);
  }

  // Метод точечного обновления профиля пользователя
  public updateProfile(updatedUser: Partial<UserProfile>): void {
    this.session.update(current => {
      if (!current) return null;
      return {
        ...current,
        user: { ...current.user, ...updatedUser }
      };
    });
  }
}
```

---

### Шаблон 2: Легковесный функциональный гард авторизации (`CanActivateFn`)
*   **Назначение:** Защитник маршрутов считывает реактивный сигнал состояния из `AuthStore` и перенаправляет гостя на страницу авторизации.

#### 1. Код гарда: `auth.guard.ts`
```typescript
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthStore } from './auth-store';

export const authGuard: CanActivateFn = (route, state) => {
  // Внедряем зависимости через функциональный инжектор inject()
  const authStore = inject(AuthStore);
  const router = inject(Router);

  // Считываем значение вычисляемого сигнала статуса авторизации.
  // Это синхронная и безопасная операция.
  if (authStore.isAuthenticated()) {
    return true; // Разрешаем переход на защищенный роут
  }

  // Если пользователь не авторизован, декларативно перенаправляем его на страницу входа
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url } // Сохраняем исходный путь для редиректа после входа
  });
};
```

---

### Шаблон 3: Компонент формы авторизации (LoginForm)
*   **Назначение:** Компонент собирает данные учетной записи через `NonNullableFormBuilder`, имитирует отправку запроса и записывает полученную сессию в `AuthStore`.

#### 1. Файл логики: `login-form.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { AuthSession } from './auth-types';

@Component({
  selector: 'app-login-form',
  // standalone: true опущен по умолчанию в Angular 19+
  imports: [ReactiveFormsModule], // Подключаем модуль форм для связи с шаблоном
  templateUrl: './login-form.html',
  styleUrl: './login-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush гарантирует стабильную производительность
})
export class LoginForm { // Класс переименован по стандартам без суффикса Component
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  // Реактивный сигнал для управления лоадером в кнопке
  public readonly isLoading = signal<boolean>(false);

  // Инициализируем форму
  public readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  public onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    
    // Эмулируем сетевой POST-запрос к API авторизации
    setTimeout(() => {
      const mockSession: AuthSession = {
        accessToken: 'mock-jwt-access-token-value',
        refreshToken: 'mock-jwt-refresh-token-value',
        user: {
          id: 'usr-441',
          name: 'Алексей',
          email: this.loginForm.controls.email.value,
          role: 'user'
        }
      };

      // Сохраняем сессию в глобальный AuthStore.
      // Это действие автоматически вызовет побочный эффект effect() записи в LocalStorage.
      this.authStore.login(mockSession);
      this.isLoading.set(false);

      // Перенаправляем пользователя в личный кабинет
      this.router.navigate(['/dashboard']);
    }, 1500);
  }
}
```

#### 2. Файл разметки: `login-form.html`
```html
<div class="login-container">
  <h3>Вход в панель управления</h3>
  
  <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="login-form">
    <label for="email">Электронная почта:</label>
    <input id="email" type="email" formControlName="email" class="form-input" />

    <label for="password">Пароль:</label>
    <input id="password" type="password" formControlName="password" class="form-input" />

    <!-- Блокируем кнопку на время загрузки или при невалидности полей -->
    <button type="submit" [disabled]="loginForm.invalid || isLoading()" class="btn-submit">
      {{ isLoading() ? 'Авторизация...' : 'Войти в систему' }}
    </button>
  </form>
</div>
```

#### 3. Файл стилей: `login-form.css`
```css
.login-container {
  padding: 24px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 400px;
  margin: 40px auto;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.form-input {
  padding: 8px 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  outline: none;
}

.form-input:focus {
  border-color: var(--accent);
}

.btn-submit {
  padding: 10px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  width: 100%;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Сравнение архитектурных подходов: Signals vs RxJS BehaviorSubject
До появления Сигналов стандартным решением для создания хранилищ состояния (State Stores) в Angular являлся паттерн на базе RxJS `BehaviorSubject`.

```typescript
// Классический RxJS Store
private session$ = new BehaviorSubject<AuthSession | null>(null);
public isAuthenticated$ = this.session$.pipe(map(s => !!s));
```

#### Почему Сигналы намного лучше подходят для управления состоянием авторизации?
1.  **Отсутствие утечек памяти из-за ручных подписок:**
    Потоки RxJS требуют обязательной подписки (через метод `.subscribe()` или пайп `| async` в шаблоне) и последующей отписки. Забытая отписка от глобального сервиса в компоненте приводит к утечкам памяти. Сигналы не требуют отписок — фреймворк Angular самостоятельно выстраивает и уничтожает зависимости в реактивном графе.
2.  **Синхронность и гарантированное отсутствие глитчей (Glitch-Free):**
    В RxJS сложные комбинации операторов (`combineLatest`, `withLatestFrom`) при быстром обновлении данных могут приводить к кратковременным логическим несогласованностям данных (глитчам). Сигналы вычисляются синхронно по направленному ациклическому графу реактивности, исключая возникновение глитчей.
3.  **Легкое декларативное прототипирование:**
    Вместо сложного синтаксиса операторов RxJS:
    `isAdmin$ = user$.pipe(map(u => u?.role === 'admin'))`
    Вы пишите простую декларативную функцию на Сигналах:
    `isAdmin = computed(() => this.userProfile()?.role === 'admin')`

---

### 2. Физика работы `effect()` и планировщик микрозадач
В Шаблоне 1 используется реактивный эффект `effect()` для автоматического сохранения состояния сессии в `LocalStorage`:

```typescript
effect(() => {
  const activeSession = this.session();
  localStorage.setItem(this.STORAGE_KEY, JSON.stringify(activeSession));
});
```

*   **Как это работает:**
    При первом запуске Angular регистрирует зависимость эффекта от сигнала `session()`. Каждый раз, когда вы вызываете метод `session.set()`, сигнал отправляет dirty-уведомление эффекту.
*   **Почему это происходит асинхронно:**
    Эффект не запускается мгновенно в момент вызова `.set()`. Он упаковывается во внутреннюю микрозадачу (Microtask) и регистрируется в очереди событий браузера (Event Loop) через `Promise.resolve().then()`. Как только текущий синхронный стек вызовов JavaScript полностью очищается (происходит сборка всех изменений состояния), планировщик Angular запускает выполнение эффекта ровно один раз с итоговым стабильным состоянием данных. Это предотвращает многократную паразитную перезапись данных на диск при частых последовательных обновлениях полей профиля.

---

### 3. Детальный пошаговый разбор фазы выполнения входа и работы гарда
Проследим шаги работы системы при отправке формы авторизации:

1.  **Вызов `.login()`:** Компонент `LoginForm` вызывает метод `authStore.login(mockSession)`. Сигнал `session` обновляется новым объектом.
2.  **Инвалидация графа:** Сигнал `session` рассылает dirty-уведомления наверх по графу. Вычисляемые сигналы `isAuthenticated`, `userProfile` и `token` помечаются как требующие пересчета.
3.  **Запуск эффекта:** Планировщик асинхронно запускает `effect()`. Считывается текущее значение `session()`, объект сериализуется в JSON и записывается на диск в `LocalStorage`.
4.  **Проверка перехода:** Пользователь перенаправляется на закрытый маршрут `/dashboard`. Срабатывает функциональный защитник `authGuard`.
5.  **Разрешение доступа:** Гард вызывает `authStore.isAuthenticated()`. Метод `computed` вычисляется синхронно, возвращая `true`, так как значение сигнала `session` не равно `null`. Навигация успешно завершается, и страница отображается на экране.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Нарушение иммутабельности (прямая мутация объектов) при обновлении профиля**
    *   *Симптомы:* Метод `updateProfile` вызывается, свойства объекта меняются, но computed-сигналы в шаблонах не обновляются, и на экране отображаются старые данные.
    *   *Физика процесса:* Разработчик напрямую мутировал свойство объекта сессии:
        ```typescript
        // ОШИБКА: Изменение свойства объекта напрямую ломает реактивность
        const current = this.session();
        if (current) {
          current.user.name = 'Новое Имя'; // Нарушение иммутабельности!
          this.session.set(current); // Ссылка в памяти не изменилась
        }
        ```
        Сигнал проверяет изменения по ссылочному равенству (`Object.is`). Поскольку ссылка на объект `current` осталась прежней, Angular считает, что значение сигнала не менялось, и полностью блокирует отправку dirty-уведомлений по графу зависимостей.
    *   *Решение:* Всегда обновляйте сигнальное состояние иммутабельно, создавая новый объект через spread-оператор (`...`) для обновления ссылки в памяти (как показано в методе `updateProfile` Шаблона 1).

*   **Ошибка 2: Бесконечный цикл эффектов (Infinite Effect Loop)**
    *   *Симптомы:* Зависание вкладки браузера, переполнение стека вызовов, критическая ошибка рантайма.
    *   *Физика процесса:* Разработчик поместил в тело эффекта чтение сигнала и одновременную запись в этот же самый сигнал, зацикливая его выполнение.
        ```typescript
        // ОШИБКА: Эффект считывает и тут же пишет в один и тот же сигнал, зацикливая себя
        effect(() => {
          const user = this.session();
          this.session.set({ ...user, lastChecked: new Date() }); 
        });
        ```
    *   *Решение:* Если вам нужно прочитать сигнал внутри эффекта без создания реактивной зависимости от него (чтобы изменение этого сигнала не запускало эффект повторно), используйте функцию `untracked()`.

*   **Ошибка 3: Критическая уязвимость XSS при хранении JWT-токенов в LocalStorage**
    *   *Симптомы:* Утечка секретных токенов доступа пользователей, несанкционированные действия злоумышленников от имени клиентов.
    *   *Физика процесса:* Хранение чувствительных JWT-токенов в `LocalStorage` делает их легкодоступными для любого вредоносного JS-скрипта через вызов `window.localStorage` в случае успешной XSS-атаки на ваш сайт (например, через невалидированные формы ввода или уязвимые сторонние библиотеки).
    *   *Решение:* По стандарту безопасности OWASP, наиболее безопасным является хранение короткоживущих `accessToken` исключительно в оперативной памяти (внутри сигнального `AuthStore`), а долгоживущих `refreshToken` — в защищенных куках с флагами `HttpOnly` и `Secure`, недоступных для чтения из JavaScript. В `LocalStorage` допускается сохранять только нечувствительные метаданные (имя, аватар, роль) для первой быстрой отрисовки интерфейса.